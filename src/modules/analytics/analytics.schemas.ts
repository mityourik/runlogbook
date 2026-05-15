import { z } from 'zod';
import { classifiedAnalyticsIntentsSchema } from './analytics-intents.js';

export const weeklySummaryQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format').optional()
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

const selectedOptionSchema = z
  .object({
    intents: classifiedAnalyticsIntentsSchema
  })
  .strict()
  .superRefine((value, context) => {
    value.intents.forEach((intent, index) => {
      const hasStartDate = intent.parameters.startDate !== undefined;
      const hasEndDate = intent.parameters.endDate !== undefined;

      if (hasStartDate !== hasEndDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intents', index, 'parameters'],
          message: 'startDate and endDate are both required'
        });
        return;
      }

      if (intent.parameters.startDate && intent.parameters.endDate && intent.parameters.startDate > intent.parameters.endDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intents', index, 'parameters', 'startDate'],
          message: 'startDate must be before or equal to endDate'
        });
      }
    });
  });

export const distanceSummaryQuerySchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema
  })
  .refine((value) => value.startDate <= value.endDate, 'startDate must be before or equal to endDate');

export const analyticsQueryRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    selectedOption: selectedOptionSchema.optional()
  })
  .strict();
