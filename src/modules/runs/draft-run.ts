export type DraftRun = {
  id: string;
  userId: string;
  stravaActivityId: number | null;
  stravaActivityUrl: string | null;
  activityType: string | null;
  occurredAt: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number | null;
  title: string | null;
  clarifiedRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDraftRunInput = {
  userId: string;
  stravaActivityImportId: string | null;
  stravaActivityId: number | null;
  stravaActivityUrl: string | null;
  activityType: string | null;
  occurredAt: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number | null;
  title: string | null;
  rawActivity: unknown;
};
