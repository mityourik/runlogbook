import { env } from '../../../shared/config/env.js';
import { decryptSecret, encryptSecret } from '../../../shared/crypto/encryption.js';
import { NotificationRepository } from '../../notifications/notification.repository.js';
import { notifyDraftRunNeedsClarification } from '../../notifications/notify-draft-run.js';
import { DraftRunRepository } from '../../runs/draft-run.repository.js';
import { fetchStravaActivity, refreshStravaToken } from './strava.client.js';
import type { StravaConnection, StravaRepository } from './strava.repository.js';

export async function importStravaActivity(input: {
  connection: StravaConnection;
  repository: StravaRepository;
  draftRuns: DraftRunRepository;
  notifications: NotificationRepository;
  stravaActivityImportId: string | null;
  stravaActivityId: number;
}): Promise<void> {
  if (!input.connection.accessTokenEncrypted || !input.connection.refreshTokenEncrypted || !input.connection.tokenExpiresAt) {
    throw new Error('Strava connection is missing token fields');
  }

  const accessToken = await getValidAccessToken(input.connection, input.repository);
  const activity = await fetchStravaActivity({ activityId: input.stravaActivityId, accessToken });

  const draftRun = await input.draftRuns.upsertFromStrava({
    userId: input.connection.userId,
    stravaActivityImportId: input.stravaActivityImportId,
    stravaActivityId: activity.id,
    stravaActivityUrl: `https://www.strava.com/activities/${activity.id}`,
    activityType: activity.sport_type ?? activity.type,
    occurredAt: activity.start_date,
    distanceMeters: Math.round(activity.distance),
    movingTimeSeconds: activity.moving_time,
    elapsedTimeSeconds: activity.elapsed_time,
    title: activity.name,
    rawActivity: activity
  });

  await notifyDraftRunNeedsClarification({ notifications: input.notifications, draftRun });
}

async function getValidAccessToken(connection: StravaConnection, repository: StravaRepository): Promise<string> {
  const expiresAt = connection.tokenExpiresAt!.getTime();
  const refreshThresholdMs = 5 * 60 * 1000;

  if (expiresAt > Date.now() + refreshThresholdMs) {
    return decryptSecret(connection.accessTokenEncrypted!, env.APP_SECRET);
  }

  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
    throw new Error('Strava OAuth is not configured');
  }

  const tokenResponse = await refreshStravaToken({
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    refreshToken: decryptSecret(connection.refreshTokenEncrypted!, env.APP_SECRET)
  });

  await repository.updateTokens({
    connectionId: connection.id,
    accessTokenEncrypted: encryptSecret(tokenResponse.access_token, env.APP_SECRET),
    refreshTokenEncrypted: encryptSecret(tokenResponse.refresh_token, env.APP_SECRET),
    tokenExpiresAt: new Date(tokenResponse.expires_at * 1000)
  });

  return tokenResponse.access_token;
}
