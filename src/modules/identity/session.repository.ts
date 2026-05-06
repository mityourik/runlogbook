import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

type SessionUserRow = {
  id: string;
  email: string;
  display_name: string;
};

const sessionTtlDays = 30;

export class SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);

    await this.pool.query(
      `insert into sessions (id, user_id, token_hash, expires_at)
      values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [randomUUID(), userId, tokenHash, sessionTtlDays]
    );

    return token;
  }

  async findUserByToken(token: string): Promise<SessionUser | null> {
    const result = await this.pool.query<SessionUserRow>(
      `select users.id, users.email, users.display_name
      from sessions
      join users on users.id = sessions.user_id
      where sessions.token_hash = $1 and sessions.expires_at > now()`,
      [hashToken(token)]
    );
    const row = result.rows[0];

    return row
      ? {
          id: row.id,
          email: row.email,
          displayName: row.display_name
        }
      : null;
  }

  async deleteByToken(token: string): Promise<void> {
    await this.pool.query('delete from sessions where token_hash = $1', [hashToken(token)]);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
