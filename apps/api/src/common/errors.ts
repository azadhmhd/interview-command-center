import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { InvalidTransitionError } from '../tasks/state-machine';

/** Maps known errors to clean HTTP responses; never leaks stack traces or internals. */
@Catch()
export class PrismaErrorFilter implements ExceptionFilter {
  private log = new Logger('Errors');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof HttpException) return res.status(e.getStatus()).json(typeof e.getResponse() === 'string' ? { statusCode: e.getStatus(), message: e.getResponse() } : e.getResponse());
    if (e instanceof InvalidTransitionError) return res.status(400).json({ statusCode: 400, message: e.message });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return res.status(404).json({ statusCode: 404, message: 'Not found' });
      if (e.code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'Duplicate record' });
    }
    if ((e as { type?: string })?.type === 'entity.too.large') return res.status(413).json({ statusCode: 413, message: 'Payload too large' });
    this.log.error((e as Error)?.stack ?? String(e));
    return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
