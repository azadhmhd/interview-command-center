import { Body, Controller, Get, HttpCode, Injectable, Logger, Post, Req, Res, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { hashPassword, newToken, sha256, verifyPassword } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, Public, SESSION_COOKIE, tokenFromRequest, zp } from '../common/http';
import { PrismaService } from '../prisma.service';

const SESSION_DAYS = 30;
const authLimit = { default: { limit: Number(process.env.THROTTLE_AUTH_LIMIT || 20), ttl: 60_000 } };

const registerSchema = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase().trim()),
  name: z.string().min(1).max(120),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});
const loginSchema = z.object({ email: z.string().email().transform((s) => s.toLowerCase().trim()), password: z.string().max(200) });
const forgotSchema = z.object({ email: z.string().email().transform((s) => s.toLowerCase().trim()) });
const resetSchema = z.object({ token: z.string().min(10), password: registerSchema.shape.password });

@Injectable()
export class AuthService {
  private log = new Logger('Auth');
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async register(input: z.infer<typeof registerSchema>) {
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        email: input.email, name: input.name, passwordHash: await hashPassword(input.password),
        memberships: {
          create: {
            role: 'OWNER',
            workspace: { create: { name: `${input.name}'s workspace`, personal: true, profile: { create: { fullName: input.name } } } },
          },
        },
      },
    });
    await this.audit.record({ userId: user.id }, 'user.register');
    return user;
  }

  async createSession(userId: string, req: Request) {
    const token = newToken();
    await this.prisma.session.create({
      data: {
        userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5),
        ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300),
      },
    });
    return token;
  }

  async login(input: z.infer<typeof loginSchema>, req: Request) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Same error and similar timing for unknown email vs wrong password.
    const ok = user ? await verifyPassword(input.password, user.passwordHash) : await verifyPassword(input.password, 'scrypt$AAAA$AAAA').then(() => false);
    if (!user || !ok) {
      await this.audit.record({ ip: req.ip }, 'user.login_failed', undefined, { email: input.email });
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.audit.record({ userId: user.id, ip: req.ip }, 'user.login');
    return { user, token: await this.createSession(user.id, req) };
  }

  async forgot(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // do not reveal whether the account exists
    const token = newToken();
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600e3) } });
    const link = `${config.appUrl}/reset-password?token=${token}`;
    if (config.smtpUrl) {
      await nodemailer.createTransport(config.smtpUrl).sendMail({
        from: config.mailFrom, to: email, subject: `${config.appName} password reset`,
        text: `Reset your password (valid 1 hour): ${link}\nIf you did not request this, ignore this email.`,
      });
    } else {
      // ponytail: no SMTP configured → operator reads the link from the API log (self-hosted default)
      this.log.warn(`Password reset link for ${email}: ${link}`);
    }
    await this.audit.record({ userId: user.id }, 'user.password_reset_requested');
  }

  async reset(token: string, password: string) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new BadRequestException('Reset link is invalid or expired');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } }),
      this.prisma.session.deleteMany({ where: { userId: row.userId } }), // sign out everywhere
    ]);
    await this.audit.record({ userId: row.userId }, 'user.password_reset');
  }
}

function setCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: SESSION_DAYS * 864e5,
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  @Public() @Throttle(authLimit) @Post('register') @ApiZod(registerSchema)
  async register(@Body(zp(registerSchema)) body: z.infer<typeof registerSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(body);
    const token = await this.auth.createSession(user.id, req);
    setCookie(res, token);
    return { id: user.id, email: user.email, name: user.name, token };
  }

  @Public() @Throttle(authLimit) @Post('login') @HttpCode(200) @ApiZod(loginSchema)
  async login(@Body(zp(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(body, req);
    setCookie(res, token);
    return { id: user.id, email: user.email, name: user.name, token };
  }

  @Public() @Post('logout') @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = tokenFromRequest(req);
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Public() @Throttle(authLimit) @Post('forgot-password') @HttpCode(200) @ApiZod(forgotSchema)
  async forgot(@Body(zp(forgotSchema)) body: z.infer<typeof forgotSchema>) {
    await this.auth.forgot(body.email);
    return { ok: true, message: 'If that account exists, a reset link has been sent.' };
  }

  @Public() @Throttle(authLimit) @Post('reset-password') @HttpCode(200) @ApiZod(resetSchema)
  async reset(@Body(zp(resetSchema)) body: z.infer<typeof resetSchema>) {
    await this.auth.reset(body.token, body.password);
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentCtx() ctx: Ctx) {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId: ctx.userId }, include: { workspace: { select: { id: true, name: true, personal: true } } },
    });
    return {
      user: { id: ctx.userId, email: ctx.email, name: ctx.name },
      workspaceId: ctx.workspaceId, role: ctx.role,
      workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
    };
  }
}
