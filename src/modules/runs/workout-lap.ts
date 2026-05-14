export type WorkoutLapKind = 'warmup' | 'work' | 'recovery' | 'cooldown' | 'other';

export type WorkoutLap = {
  draftRunId: string;
  lapNumber: number;
  lapKind: WorkoutLapKind;
  distanceMeters: number;
  correctedDistanceMeters: number | null;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  heartRateRecoveryBpm: number | null;
  needsReview: boolean;
};

export type CreateWorkoutLapInput = {
  userId: string;
  draftRunId: string;
  stravaActivityId: number;
  lapNumber: number;
  lapKind: WorkoutLapKind;
  distanceMeters: number;
  correctedDistanceMeters: number | null;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  heartRateRecoveryBpm: number | null;
  needsReview: boolean;
  rawLap: unknown;
};
