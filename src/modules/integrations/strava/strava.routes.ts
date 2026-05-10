import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from '../../identity/auth.js';
import { NotificationRepository } from '../../notifications/notification.repository.js';
import { DraftRunRepository } from '../../runs/draft-run.repository.js';
import { env } from '../../../shared/config/env.js';
import { encryptSecret } from '../../../shared/crypto/encryption.js';
import { exchangeStravaCode } from './strava.client.js';
import { importStravaActivity } from './import-strava-activity.js';
import { createStravaOAuthState, parseStravaOAuthState } from './strava-oauth-state.js';
import { StravaRepository } from './strava.repository.js';
import {
  stravaCallbackErrorQuerySchema,
  stravaCallbackQuerySchema,
  stravaWebhookEventSchema,
  stravaWebhookVerificationQuerySchema
} from './strava.schemas.js';

export function registerStravaRoutes(app: FastifyInstance): void {
  const repository = new StravaRepository(app.dependencies.pool);
  const draftRuns = new DraftRunRepository(app.dependencies.pool);
  const notifications = new NotificationRepository(app.dependencies.pool);

  app.get('/integrations/strava/connect', async (request, reply) => {
    const user = await authenticateRequest(request);

    if (!user) {
      throw app.httpErrors.unauthorized('Missing or invalid bearer token');
    }

    if (!env.STRAVA_CLIENT_ID) {
      throw app.httpErrors.internalServerError('STRAVA_CLIENT_ID is not configured');
    }

    const callbackUrl = new URL('/integrations/strava/callback', env.APP_BASE_URL);
    const authorizationUrl = new URL('https://www.strava.com/oauth/authorize');

    authorizationUrl.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl.toString());
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('approval_prompt', 'auto');
    authorizationUrl.searchParams.set('scope', 'read,activity:read,activity:read_all');
    authorizationUrl.searchParams.set('state', createStravaOAuthState(user.id, env.APP_SECRET));

    return reply.redirect(authorizationUrl.toString());
  });

  app.get('/integrations/strava/callback', async (request) => {
    const errorQuery = stravaCallbackErrorQuerySchema.safeParse(request.query);

    if (errorQuery.success) {
      throw app.httpErrors.badRequest(`Strava OAuth failed: ${errorQuery.data.error}`);
    }

    const query = stravaCallbackQuerySchema.parse(request.query);
    const state = parseStravaOAuthState(query.state, env.APP_SECRET);

    if (!state) {
      throw app.httpErrors.badRequest('Invalid Strava OAuth state');
    }

    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
      throw app.httpErrors.internalServerError('Strava OAuth is not configured');
    }

    const tokenResponse = await exchangeStravaCode({
      clientId: env.STRAVA_CLIENT_ID,
      clientSecret: env.STRAVA_CLIENT_SECRET,
      code: query.code
    });

    const connection = await repository.upsertConnection({
      userId: state.userId,
      stravaAthleteId: tokenResponse.athlete.id,
      accessTokenEncrypted: encryptSecret(tokenResponse.access_token, env.APP_SECRET),
      refreshTokenEncrypted: encryptSecret(tokenResponse.refresh_token, env.APP_SECRET),
      tokenExpiresAt: new Date(tokenResponse.expires_at * 1000),
      grantedScope: tokenResponse.scope ?? query.scope ?? ''
    });

    return { connection };
  });

  app.get('/integrations/strava/webhook', async (request) => {
    const query = stravaWebhookVerificationQuerySchema.parse(request.query);

    if (query['hub.verify_token'] !== env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      throw app.httpErrors.forbidden('Invalid Strava webhook verify token');
    }

    return { 'hub.challenge': query['hub.challenge'] };
  });

  app.post('/integrations/strava/webhook', async (request, reply) => {
    const event = stravaWebhookEventSchema.parse(request.body);

    if (event.object_type !== 'activity') {
      return reply.code(204).send();
    }

    const connection = await repository.findConnectionByAthleteId(event.owner_id);

    if (!connection) {
      request.log.warn({ stravaAthleteId: event.owner_id }, 'Received Strava event for unknown athlete');
      return reply.code(204).send();
    }

    const importId = await repository.createActivityImport({
      userId: connection.userId,
      stravaConnectionId: connection.id,
      stravaActivityId: event.object_id,
      aspectType: event.aspect_type,
      eventTime: new Date(event.event_time * 1000),
      rawEvent: event
    });

    if (event.aspect_type === 'create' && importId) {
      try {
        await importStravaActivity({
          connection,
          repository,
          draftRuns,
          notifications,
          stravaActivityImportId: importId,
          stravaActivityId: event.object_id
        });
        await repository.markImportCompleted(importId);
      } catch (error) {
        request.log.error({ err: error, stravaActivityId: event.object_id }, 'Failed to import Strava activity');
      }
    }

    return reply.code(204).send();
  });
}
