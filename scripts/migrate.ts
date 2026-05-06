import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../src/shared/config/env.js';
import { createPostgresPool } from '../src/shared/infrastructure/postgres.js';

const pool = createPostgresPool(env.DATABASE_URL);

await pool.query(`
  create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )
`);

const migrationsDirectory = join(process.cwd(), 'db', 'migrations');
const filenames = (await readdir(migrationsDirectory)).filter((filename) => filename.endsWith('.sql')).sort();

for (const filename of filenames) {
  const existing = await pool.query('select 1 from schema_migrations where filename = $1', [filename]);

  if (existing.rowCount) {
    continue;
  }

  const sql = await readFile(join(migrationsDirectory, filename), 'utf8');

  await pool.query('begin');
  try {
    await pool.query(sql);
    await pool.query('insert into schema_migrations (filename) values ($1)', [filename]);
    await pool.query('commit');
    console.log(`Applied ${filename}`);
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

await pool.end();
