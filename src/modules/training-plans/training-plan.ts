export type TrainingPlan = {
  id: string;
  userId: string;
  title: string;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
};

export type PlannedWorkoutStatus = 'planned' | 'completed' | 'skipped' | 'changed';

export type PlannedWorkout = {
  id: string;
  trainingPlanId: string;
  scheduledOn: string;
  title: string;
  targetDistanceMeters: number | null;
  targetDurationSeconds: number | null;
  status: PlannedWorkoutStatus;
  completedRunId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
