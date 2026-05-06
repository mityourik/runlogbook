import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from '../identity/auth.js';
import { NotificationRepository } from './notification.repository.js';
import { listNotificationsQuerySchema, notificationParamsSchema } from './notification.schemas.js';

export function registerNotificationRoutes(app: FastifyInstance): void {
  const notifications = new NotificationRepository(app.dependencies.pool);

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/notifications')) {
      return;
    }

    const user = await authenticateRequest(request);

    if (!user) {
      throw app.httpErrors.unauthorized('Missing or invalid bearer token');
    }

    request.user = user;
  });

  app.get('/notifications', async (request) => {
    const query = listNotificationsQuerySchema.parse(request.query);
    const items = await notifications.listByUser(request.user!.id, query.limit, query.offset);

    return { notifications: items };
  });

  app.post('/notifications/:notificationId/read', async (request) => {
    const { notificationId } = notificationParamsSchema.parse(request.params);
    const notification = await notifications.markRead(notificationId, request.user!.id);

    if (!notification) {
      throw app.httpErrors.notFound('Notification not found');
    }

    return { notification };
  });
}
