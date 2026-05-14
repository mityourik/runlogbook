import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');
const workoutKindSchema = z.enum(['easy', 'workout', 'long', 'race', 'other']);
const workoutLapCorrectionSchema = z.object({
  lapNumber: z.number().int().positive(),
  correctedDistanceMeters: z.number().int().positive()
});

export const createRunSchema = z.object({
  occurredOn: isoDateSchema,
  distanceMeters: z.number().int().positive(),
  durationSeconds: z.number().int().positive(),
  perceivedEffort: z.number().int().min(1).max(10).optional(),
  workoutKind: workoutKindSchema.optional(),
  workoutStructure: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional()
});

export const updateRunSchema = z
  .object({
    occurredOn: isoDateSchema.optional(),
    distanceMeters: z.number().int().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
    perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
    workoutKind: workoutKindSchema.nullable().optional(),
    workoutStructure: z.string().trim().min(1).max(120).nullable().optional(),
    title: z.string().trim().min(1).nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const runParamsSchema = z.object({
  runId: z.string().uuid()
});

export const draftRunParamsSchema = z.object({
  draftRunId: z.string().uuid()
});

export const clarifyDraftRunSchema = z.object({
  occurredOn: isoDateSchema.optional(),
  distanceMeters: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
  perceivedEffort: z.number().int().min(1).max(10),
  workoutKind: workoutKindSchema,
  workoutStructure: z.string().trim().min(1).max(120).optional(),
  workoutLapCorrections: z.array(workoutLapCorrectionSchema).default([]),
  plannedWorkoutId: z.string().uuid().optional(),
  plannedWorkoutStatus: z.enum(['completed', 'changed']).default('completed'),
  title: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional()
}).refine((value) => value.workoutKind !== 'workout' || Boolean(value.workoutStructure), {
  message: 'workoutStructure is required for workout runs',
  path: ['workoutStructure']
});
