create table workout_laps (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  draft_run_id uuid not null references draft_runs(id) on delete cascade,
  strava_activity_id bigint not null,
  lap_number integer not null,
  lap_kind text not null check (lap_kind in ('warmup', 'work', 'recovery', 'cooldown', 'other')),
  distance_meters integer not null check (distance_meters >= 0),
  moving_time_seconds integer not null check (moving_time_seconds >= 0),
  elapsed_time_seconds integer not null check (elapsed_time_seconds >= 0),
  average_heartrate numeric(5, 1),
  max_heartrate integer,
  heart_rate_recovery_bpm numeric(5, 1),
  raw_lap jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(draft_run_id, lap_number)
);

create index workout_laps_user_activity_idx on workout_laps(user_id, strava_activity_id, lap_number);
create index workout_laps_draft_run_idx on workout_laps(draft_run_id, lap_number);
