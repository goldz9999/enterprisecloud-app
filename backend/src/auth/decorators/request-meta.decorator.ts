import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** IP y user-agent de la petición, para auditoría y sesiones. */
export const ReqMeta = createParamDecorator((_: unknown, context: ExecutionContext): RequestMeta => {
  const request = context.switchToHttp().getRequest<Request>();
  return { ip: request.ip ?? null, userAgent: request.get('user-agent') ?? null };
});
