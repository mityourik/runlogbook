import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateNotificationInput, Notification } from './notification.js';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  read_at: Date | null;
  created_at: Date;
};

export class NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const result = await this.pool.query<NotificationRow>(
      `insert into notifications (id, user_id, type, title, body, action_url)
      values ($1, $2, $3, $4, $5, $6)
      returning *`,
      [randomUUID(), input.userId, input.type, input.title, input.body, input.actionUrl ?? null]
    );

    return toNotification(result.rows[0]);
  }

  async listByUser(userId: string, limit: number, offset: number): Promise<Notification[]> {
    const result = await this.pool.query<NotificationRow>(
      `select *
      from notifications
      where user_id = $1
      order by created_at desc
      limit $2 offset $3`,
      [userId, limit, offset]
    );

    return result.rows.map(toNotification);
  }

  async markRead(notificationId: string, userId: string): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `update notifications
      set read_at = coalesce(read_at, now())
      where id = $1 and user_id = $2
      returning *`,
      [notificationId, userId]
    );
    const row = result.rows[0];

    return row ? toNotification(row) : null;
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString()
  };
}
