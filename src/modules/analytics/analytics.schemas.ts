import { z } from 'zod';
import { classifiedAnalyticsIntentsSchema } from './analytics-intents.js';

export const weeklySummaryQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format').optional()
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

export const distanceSummaryQuerySchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema
  })
  .refine((value) => value.startDate <= value.endDate, 'startDate must be before or equal to endDate');

export const analyticsQueryRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    selectedOption: z
      .object({
        intents: classifiedAnalyticsIntentsSchema
      })
      .strict()
      .optional()
  })
  .strict();
