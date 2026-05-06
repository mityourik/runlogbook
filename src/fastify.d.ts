import type { AppDependencies } from './app.js';
import type { AuthenticatedUser } from './modules/identity/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    dependencies: AppDependencies;
  }

  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
