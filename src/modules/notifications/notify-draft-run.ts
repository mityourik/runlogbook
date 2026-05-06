import type { DraftRun } from '../runs/draft-run.js';
import type { NotificationRepository } from './notification.repository.js';

export async function notifyDraftRunNeedsClarification(input: {
  notifications: NotificationRepository;
  draftRun: DraftRun;
}): Promise<void> {
  await input.notifications.create({
    userId: input.draftRun.userId,
    type: 'draft_run_needs_clarification',
    title: 'Clarify your run',
    body: input.draftRun.title
      ? `Add effort and notes for ${input.draftRun.title}.`
      : 'Add effort and notes for your latest run.',
    actionUrl: `/runs/drafts/${input.draftRun.id}`
  });
}
