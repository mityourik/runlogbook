import { env } from '../../../shared/config/env.js';
import { decryptSecret, encryptSecret } from '../../../shared/crypto/encryption.js';
import { NotificationRepository } from '../../notifications/notification.repository.js';
import { notifyDraftRunNeedsClarification } from '../../notifications/notify-draft-run.js';
import { DraftRunRepository } from '../../runs/draft-run.repository.js';
import { WorkoutLapRepository } from '../../runs/workout-lap.repository.js';
import type { CreateWorkoutLapInput, WorkoutLapKind } from '../../runs/workout-lap.js';
import { fetchStravaActivity, refreshStravaToken, type StravaActivityResponse, type StravaLapResponse } from './strava.client.js';
import type { StravaConnection, StravaRepository } from './strava.repository.js';

export async function importStravaActivity(input: {
  connection: StravaConnection;
  repository: StravaRepository;
  draftRuns: DraftRunRepository;
  workoutLaps?: WorkoutLapRepository;
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

  if (input.workoutLaps && isWorkoutActivity(activity)) {
    await input.workoutLaps.replaceForDraftRun(draftRun.id, buildWorkoutLaps(activity, draftRun.id, input.connection.userId));
  }

  await notifyDraftRunNeedsClarification({ notifications: input.notifications, draftRun });
}

export function isWorkoutActivity(activity: StravaActivityResponse): boolean {
  const laps = activity.laps ?? [];
  const title = `${activity.name} ${activity.description ?? ''}`.toLowerCase();
  const hasWorkoutText = /\b\d+\s*[xх]\s*\d+|\d+\s*[xх]|\/|interval|интервал|темп|tempo|фартлек|работ/u.test(title);
  const hasStructuredShortLaps = laps.length >= 6 && laps.filter((lap) => lap.distance >= 100 && lap.distance <= 2000).length >= 4;

  return activity.workout_type != null || hasWorkoutText || hasStructuredShortLaps;
}

export function buildWorkoutLaps(
  activity: StravaActivityResponse,
  draftRunId: string,
  userId: string
): CreateWorkoutLapInput[] {
  const laps = activity.laps ?? [];
  const classified = classifyLaps(laps);

  return laps.map((lap, index) => ({
    userId,
    draftRunId,
    stravaActivityId: activity.id,
    lapNumber: index + 1,
    lapKind: classified[index],
    distanceMeters: Math.round(lap.distance ?? 0),
    correctedDistanceMeters: null,
    movingTimeSeconds: lap.moving_time ?? 0,
    elapsedTimeSeconds: lap.elapsed_time ?? 0,
    averageHeartrate: lap.average_heartrate ?? null,
    maxHeartrate: lap.max_heartrate ?? null,
    heartRateRecoveryBpm: calculateHeartRateRecovery(lap, laps[index + 1], classified[index], classified[index + 1]),
    needsReview: false,
    rawLap: lap
  }));
}

function classifyLaps(laps: StravaLapResponse[]): WorkoutLapKind[] {
  const workLapIndexes = new Set<number>();

  laps.forEach((lap, index) => {
    const paceSecondsPerKm = lap.average_speed && lap.average_speed > 0 ? 1000 / lap.average_speed : null;

    if (lap.distance >= 350 && lap.distance <= 2500 && paceSecondsPerKm !== null && paceSecondsPerKm <= 270) {
      workLapIndexes.add(index);
    }
  });

  if (workLapIndexes.size < 2) {
    return laps.map((_, index) => (index === 0 ? 'warmup' : index === laps.length - 1 ? 'cooldown' : 'other'));
  }

  const firstWorkIndex = Math.min(...workLapIndexes);
  const lastWorkIndex = Math.max(...workLapIndexes);

  return laps.map((lap, index) => {
    if (index < firstWorkIndex) return 'warmup';
    if (index > lastWorkIndex) return 'cooldown';
    if (workLapIndexes.has(index)) return 'work';

    return lap.distance <= 500 ? 'recovery' : 'other';
  });
}

function calculateHeartRateRecovery(
  lap: StravaLapResponse,
  nextLap: StravaLapResponse | undefined,
  lapKind: WorkoutLapKind,
  nextLapKind: WorkoutLapKind | undefined
): number | null {
  if (lapKind !== 'work' || nextLapKind !== 'recovery' || !lap.max_heartrate || !nextLap?.average_heartrate) {
    return null;
  }

  return Number((lap.max_heartrate - nextLap.average_heartrate).toFixed(1));
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
