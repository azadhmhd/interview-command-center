import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { newToken, sha256 } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, MinRole, zp } from '../common/http';
import { readSettings, workspaceSettingsSchema } from '../common/workspace-settings';
import { PrismaService } from '../prisma.service';

const createSchema = z.object({ name: z.string().min(1).max(120) });
const inviteSchema = z.object({ email: z.string().email().transform((s) => s.toLowerCase()), role: z.enum(['EDITOR', 'VIEWER']) });
const roleSchema = z.object({ role: z.enum(['EDITOR', 'VIEWER']) });
const acceptSchema = z.object({ token: z.string().min(10) });
const settingsPatch = workspaceSettingsSchema.partial();

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Post() @ApiZod(createSchema)
  async create(@CurrentCtx() ctx: Ctx, @Body(zp(createSchema)) body: z.infer<typeof createSchema>) {
    const ws = await this.prisma.workspace.create({
      data: { name: body.name, memberships: { create: { userId: ctx.userId, role: 'OWNER' } }, profile: { create: {} } },
    });
    await this.audit.record({ ...ctx, workspaceId: ws.id }, 'workspace.create', { type: 'workspace', id: ws.id });
    return ws;
  }

  @Get('current')
  async current(@CurrentCtx() ctx: Ctx) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    return { ...ws, settings: readSettings(ws.settings), role: ctx.role };
  }

  @Patch('current') @MinRole('OWNER') @ApiZod(createSchema.partial())
  rename(@CurrentCtx() ctx: Ctx, @Body(zp(createSchema.partial())) body: { name?: string }) {
    return this.prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { name: body.name } });
  }

  @Put('current/settings') @MinRole('OWNER') @ApiZod(settingsPatch)
  async updateSettings(@CurrentCtx() ctx: Ctx, @Body(zp(settingsPatch)) body: z.infer<typeof settingsPatch>) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    const merged = workspaceSettingsSchema.parse({ ...readSettings(ws.settings), ...body });
    await this.prisma.workspace.update({ where: { id: ws.id }, data: { settings: merged as Prisma.InputJsonValue } });
    return merged;
  }

  @Get('current/members')
  async members(@CurrentCtx() ctx: Ctx) {
    const [members, invitations] = await Promise.all([
      this.prisma.workspaceMembership.findMany({ where: { workspaceId: ctx.workspaceId }, include: { user: { select: { id: true, email: true, name: true } } } }),
      ctx.role === 'OWNER'
        ? this.prisma.invitation.findMany({ where: { workspaceId: ctx.workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, role: true, expiresAt: true } })
        : [],
    ]);
    return { members: members.map((m) => ({ ...m.user, userId: m.user.id, id: m.id, role: m.role })), invitations };
  }

  @Post('current/invitations') @MinRole('OWNER') @ApiZod(inviteSchema)
  async invite(@CurrentCtx() ctx: Ctx, @Body(zp(inviteSchema)) body: z.infer<typeof inviteSchema>) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    if (ws.personal) throw new BadRequestException('Personal workspaces are private. Create a shared workspace or share individual records.');
    const token = newToken();
    const inv = await this.prisma.invitation.create({
      data: { workspaceId: ctx.workspaceId, email: body.email, role: body.role as Role, tokenHash: sha256(token), invitedById: ctx.userId, expiresAt: new Date(Date.now() + 7 * 864e5) },
    });
    await this.audit.record(ctx, 'workspace.invite', { type: 'invitation', id: inv.id }, { email: body.email, role: body.role });
    // Shown once to the owner, who sends it through their own channel (no email dependency).
    return { id: inv.id, email: inv.email, role: inv.role, acceptUrl: `${config.appUrl}/invite?token=${token}`, token };
  }

  @Delete('current/invitations/:id') @MinRole('OWNER')
  async revokeInvite(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.invitation.updateMany({ where: { id, workspaceId: ctx.workspaceId, acceptedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new NotFoundException();
    await this.audit.record(ctx, 'workspace.invite_revoked', { type: 'invitation', id });
    return { ok: true };
  }

  @Post('invitations/accept') @ApiZod(acceptSchema)
  async accept(@CurrentCtx() ctx: Ctx, @Body(zp(acceptSchema)) body: { token: string }) {
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) throw new BadRequestException('Invitation is invalid or expired');
    if (inv.email !== ctx.email) throw new ForbiddenException('This invitation was issued to a different email address');
    await this.prisma.$transaction([
      this.prisma.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: ctx.userId } },
        create: { workspaceId: inv.workspaceId, userId: ctx.userId, role: inv.role }, update: { role: inv.role },
      }),
      this.prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
    ]);
    await this.audit.record({ ...ctx, workspaceId: inv.workspaceId }, 'workspace.join', { type: 'workspace', id: inv.workspaceId });
    return { workspaceId: inv.workspaceId };
  }

  @Patch('current/members/:id') @MinRole('OWNER') @ApiZod(roleSchema)
  async setRole(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(roleSchema)) body: { role: Role }) {
    const m = await this.prisma.workspaceMembership.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!m) throw new NotFoundException();
    if (m.role === 'OWNER') throw new BadRequestException('The owner role cannot be changed');
    await this.prisma.workspaceMembership.update({ where: { id }, data: { role: body.role } });
    await this.audit.record(ctx, 'workspace.member_role', { type: 'membership', id }, { role: body.role });
    return { ok: true };
  }

  @Delete('current/members/:id') @MinRole('OWNER')
  async remove(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const m = await this.prisma.workspaceMembership.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!m) throw new NotFoundException();
    if (m.role === 'OWNER') throw new BadRequestException('The owner cannot be removed');
    await this.prisma.workspaceMembership.delete({ where: { id } });
    await this.audit.record(ctx, 'workspace.member_removed', { type: 'membership', id }, { userId: m.userId });
    return { ok: true };
  }

  @Get('current/audit') @MinRole('OWNER')
  auditLog(@CurrentCtx() ctx: Ctx) {
    return this.prisma.auditEvent.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}

@Injectable()
export class WorkspaceAccess {
  constructor(private prisma: PrismaService) {}
  /** Throws 404 (not 403) for records outside the caller's workspace, so ids cannot be probed. */
  async application(ctx: Ctx, id: string) {
    const a = await this.prisma.application.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!a) throw new NotFoundException('Application not found');
    return a;
  }
  async round(ctx: Ctx, id: string) {
    const r = await this.prisma.interviewRound.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r) throw new NotFoundException('Interview round not found');
    return r;
  }
  async course(ctx: Ctx, id: string) {
    const c = await this.prisma.preparationCourse.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!c) throw new NotFoundException('Course not found');
    return c;
  }
}
