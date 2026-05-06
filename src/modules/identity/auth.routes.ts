import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { readBearerToken } from './auth.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { SessionRepository } from './session.repository.js';
import { UserRepository } from './user.repository.js';

const passwordHashRounds = 12;

export function registerAuthRoutes(app: FastifyInstance): void {
  const users = new UserRepository(app.dependencies.pool);
  const sessions = new SessionRepository(app.dependencies.pool);

  app.post('/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const existingUser = await users.findByEmail(input.email);

    if (existingUser) {
      throw app.httpErrors.conflict('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, passwordHashRounds);
    const user = await users.create({ email: input.email, passwordHash, displayName: input.displayName });
    const token = await sessions.create(user.id);

    return reply.code(201).send({ user, token });
  });

  app.post('/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    const user = await users.findByEmail(input.email);

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw app.httpErrors.unauthorized('Invalid email or password');
    }

    const token = await sessions.create(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt
      },
      token
    };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = readBearerToken(request);

    if (token) {
      await sessions.deleteByToken(token);
    }

    return reply.code(204).send();
  });

  app.get('/me', async (request) => {
    const token = readBearerToken(request);

    if (!token) {
      throw app.httpErrors.unauthorized('Missing bearer token');
    }

    const user = await sessions.findUserByToken(token);

    if (!user) {
      throw app.httpErrors.unauthorized('Invalid bearer token');
    }

    return { user };
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ message: 'Invalid request', issues: error.issues });
    }

    return reply.send(error);
  });
}
