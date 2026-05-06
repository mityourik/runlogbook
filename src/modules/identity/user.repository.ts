import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { User, UserWithPasswordHash } from './user.js';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: Date;
};

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: { email: string; passwordHash: string; displayName: string }): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `insert into users (id, email, password_hash, display_name)
      values ($1, $2, $3, $4)
      returning *`,
      [randomUUID(), input.email.toLowerCase(), input.passwordHash, input.displayName]
    );

    return toUser(result.rows[0]);
  }

  async findByEmail(email: string): Promise<UserWithPasswordHash | null> {
    const result = await this.pool.query<UserRow>('select * from users where email = $1', [email.toLowerCase()]);
    const row = result.rows[0];

    return row ? toUserWithPasswordHash(row) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>('select * from users where id = $1', [userId]);
    const row = result.rows[0];

    return row ? toUser(row) : null;
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString()
  };
}

function toUserWithPasswordHash(row: UserRow): UserWithPasswordHash {
  return {
    ...toUser(row),
    passwordHash: row.password_hash
  };
}
