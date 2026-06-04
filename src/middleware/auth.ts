import type { FastifyReply, FastifyRequest } from 'fastify';

import { UnauthorizedError } from '../lib/errors.js';

export type JwtPayload = {
  sub: string;
  email?: string;
};

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError();
  }
}

export function getUserId(request: FastifyRequest): string {
  const payload = request.user as JwtPayload;
  if (!payload?.sub) {
    throw new UnauthorizedError();
  }
  return payload.sub;
}
