import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

export const createTrainingPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  startsOn: isoDateSchema,
  endsOn: isoDateSchema.optional()
});

export const trainingPlanParamsSchema = z.object({
  planId: z.string().uuid()
});

export const plannedWorkoutParamsSchema = z.object({
  workoutId: z.string().uuid()
});

export const addPlannedWorkoutSchema = z.object({
  scheduledOn: isoDateSchema,
  title: z.string().trim().min(1).max(240),
  targetDistanceMeters: z.number().int().positive().optional(),
  targetDurationSeconds: z.number().int().positive().optional(),
  notes: z.string().trim().min(1).optional()
});

export const updatePlannedWorkoutSchema = z
  .object({
    scheduledOn: isoDateSchema.optional(),
    title: z.string().trim().min(1).max(240).optional(),
    targetDistanceMeters: z.number().int().positive().nullable().optional(),
    targetDurationSeconds: z.number().int().positive().nullable().optional(),
    status: z.enum(['planned', 'completed', 'skipped', 'changed']).optional(),
    notes: z.string().trim().min(1).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
