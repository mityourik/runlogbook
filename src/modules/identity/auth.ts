import type { FastifyRequest } from 'fastify';
import { SessionRepository, type SessionUser } from './session.repository.js';

export type AuthenticatedUser = SessionUser;

export function readBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();

  return token.length > 0 ? token : null;
}

export async function authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = readBearerToken(request);

  if (!token) {
    return null;
  }

  const sessions = new SessionRepository(request.server.dependencies.pool);

  return sessions.findUserByToken(token);
}
