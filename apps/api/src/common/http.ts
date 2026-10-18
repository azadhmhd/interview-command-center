import {
  applyDecorators, BadRequestException, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException,
  Injectable, PipeTransform, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBody } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { z, ZodType } from 'zod';
import { sha256 } from './crypto';
import { PrismaService } from '../prisma.service';

export const SESSION_COOKIE = 'icc_session';

export interface Ctx {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  role: Role;
  ip?: string;
}

const PUBLIC = 'icc:public';
const MIN_ROLE = 'icc:minRole';
export const Public = () => SetMetadata(PUBLIC, true);
/** Default: GET needs VIEWER, every other method needs EDITOR. Override per route. */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);
const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export const CurrentCtx = createParamDecorator((_: unknown, ctx: ExecutionContext): Ctx => {
  return (ctx.switchToHttp().getRequest() as Request & { ctx: Ctx }).ctx;
});

export function tokenFromRequest(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
}

/**
 * Global guard: resolves session → user → workspace membership → role on EVERY request.
 * All data access below this point is scoped by ctx.workspaceId; never trust client-side filtering.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, handlers)) return true;
    const req = context.switchToHttp().getRequest<Request & { ctx: Ctx }>();
    const token = tokenFromRequest(req);
    if (!token) throw new UnauthorizedException('Not signed in');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    const wsHeader = req.headers['x-workspace-id'];
    const membership = await this.prisma.workspaceMembership.findFirst({
      where: typeof wsHeader === 'string' && wsHeader
        ? { userId: session.userId, workspaceId: wsHeader }
        : { userId: session.userId, workspace: { personal: true } },
    });
    if (!membership) throw new ForbiddenException('No access to this workspace');

    const needed = this.reflector.getAllAndOverride<Role>(MIN_ROLE, handlers) ?? (req.method === 'GET' ? 'VIEWER' : 'EDITOR');
    if (RANK[membership.role] < RANK[needed]) throw new ForbiddenException(`Requires ${needed} role`);

    req.ctx = {
      userId: session.userId, email: session.user.email, name: session.user.name,
      workspaceId: membership.workspaceId, role: membership.role, ip: req.ip,
    };
    return true;
  }
}

export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

/** Swagger body doc generated from the same zod schema used for validation. */
export const ApiZod = (schema: ZodType) =>
  applyDecorators(ApiBody({ schema: z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as object }));

export const zp = <T extends ZodType>(schema: T) => new ZodPipe(schema);

// Shared field helpers
export const optStr = (max = 20000) => z.string().max(max).optional().nullable();
export const optDate = () => z.coerce.date().optional().nullable();
export const optInt = () => z.coerce.number().int().optional().nullable();
