import pg from 'pg';

export function createPostgresPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}
