import { z } from 'zod';

export const weeklySummaryQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format').optional()
});
