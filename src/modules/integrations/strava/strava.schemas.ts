import { z } from 'zod';

export const stravaCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  scope: z.string().optional()
});

export const stravaWebhookVerificationQuerySchema = z.object({
  'hub.mode': z.string(),
  'hub.challenge': z.string(),
  'hub.verify_token': z.string()
});

export const stravaWebhookEventSchema = z.object({
  object_type: z.string(),
  object_id: z.number().int(),
  aspect_type: z.string(),
  owner_id: z.number().int(),
  event_time: z.number().int(),
  updates: z.record(z.unknown()).optional(),
  subscription_id: z.number().int().optional()
});
