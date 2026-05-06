export type Run = {
  id: string;
  userId: string;
  occurredOn: string;
  distanceMeters: number;
  durationSeconds: number;
  perceivedEffort: number | null;
  title: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateRunInput = {
  userId: string;
  occurredOn: string;
  distanceMeters: number;
  durationSeconds: number;
  perceivedEffort?: number;
  title?: string;
  notes?: string;
};

export type UpdateRunInput = Partial<{
  occurredOn: string;
  distanceMeters: number;
  durationSeconds: number;
  perceivedEffort: number | null;
  title: string | null;
  notes: string | null;
}>;
