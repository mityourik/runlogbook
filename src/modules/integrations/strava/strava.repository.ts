import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type StravaConnectionInput = {
  userId: string;
  stravaAthleteId: number;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: Date;
};

export type StravaConnection = {
  id: string;
  userId: string;
  stravaAthleteId: number;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  tokenExpiresAt?: Date;
};

type StravaConnectionRow = {
  id: string;
  user_id: string;
  strava_athlete_id: string;
  access_token_encrypted?: string;
  refresh_token_encrypted?: string;
  token_expires_at?: Date;
};

export class StravaRepository {
  constructor(private readonly pool: Pool) {}

  async upsertConnection(input: StravaConnectionInput): Promise<StravaConnection> {
    const result = await this.pool.query<StravaConnectionRow>(
      `insert into strava_connections (
        id,
        user_id,
        strava_athlete_id,
        access_token_encrypted,
        refresh_token_encrypted,
        token_expires_at
      ) values ($1, $2, $3, $4, $5, $6)
      on conflict (user_id) do update set
        strava_athlete_id = excluded.strava_athlete_id,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        updated_at = now()
      returning id, user_id, strava_athlete_id`,
      [
        randomUUID(),
        input.userId,
        input.stravaAthleteId,
        input.accessTokenEncrypted,
        input.refreshTokenEncrypted,
        input.tokenExpiresAt
      ]
    );

    return toConnection(result.rows[0]);
  }

  async findConnectionByAthleteId(stravaAthleteId: number): Promise<StravaConnection | null> {
    const result = await this.pool.query<StravaConnectionRow>(
      `select id, user_id, strava_athlete_id, access_token_encrypted, refresh_token_encrypted, token_expires_at
      from strava_connections
      where strava_athlete_id = $1`,
      [stravaAthleteId]
    );
    const row = result.rows[0];

    return row ? toConnection(row) : null;
  }

  async updateTokens(input: {
    connectionId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenExpiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `update strava_connections
      set access_token_encrypted = $2,
        refresh_token_encrypted = $3,
        token_expires_at = $4,
        updated_at = now()
      where id = $1`,
      [input.connectionId, input.accessTokenEncrypted, input.refreshTokenEncrypted, input.tokenExpiresAt]
    );
  }

  async createActivityImport(input: {
    userId: string;
    stravaConnectionId: string;
    stravaActivityId: number;
    aspectType: string;
    eventTime: Date;
    rawEvent: unknown;
  }): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `insert into strava_activity_imports (
        id,
        user_id,
        strava_connection_id,
        strava_activity_id,
        aspect_type,
        event_time,
        raw_event
      ) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (strava_activity_id, aspect_type, event_time) do nothing
      returning id`,
      [
        randomUUID(),
        input.userId,
        input.stravaConnectionId,
        input.stravaActivityId,
        input.aspectType,
        input.eventTime,
        JSON.stringify(input.rawEvent)
      ]
    );

    return result.rows[0]?.id ?? null;
  }

  async markImportCompleted(importId: string): Promise<void> {
    await this.pool.query('update strava_activity_imports set imported_at = now() where id = $1', [importId]);
  }
}

function toConnection(row: StravaConnectionRow): StravaConnection {
  return {
    id: row.id,
    userId: row.user_id,
    stravaAthleteId: Number(row.strava_athlete_id),
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: row.token_expires_at
  };
}
