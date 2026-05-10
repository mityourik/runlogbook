create table users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_id_idx on sessions(user_id);
create index sessions_expires_at_idx on sessions(expires_at);

create table strava_connections (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  strava_athlete_id bigint not null unique,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table strava_activity_imports (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  strava_connection_id uuid not null references strava_connections(id) on delete cascade,
  strava_activity_id bigint not null,
  aspect_type text not null,
  event_time timestamptz not null,
  raw_event jsonb not null,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique(strava_activity_id, aspect_type, event_time)
);

create index strava_activity_imports_user_created_at_idx on strava_activity_imports(user_id, created_at desc);

create table notifications (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, type, action_url)
);

create index notifications_user_created_at_idx on notifications(user_id, created_at desc);
create index notifications_user_unread_idx on notifications(user_id, created_at desc) where read_at is null;

create table runs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  occurred_on date not null,
  distance_meters integer not null check (distance_meters >= 0),
  duration_seconds integer not null check (duration_seconds > 0),
  perceived_effort integer check (perceived_effort between 1 and 10),
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table draft_runs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  strava_activity_import_id uuid references strava_activity_imports(id) on delete set null,
  strava_activity_id bigint unique,
  strava_activity_url text,
  activity_type text,
  occurred_at timestamptz not null,
  distance_meters integer not null check (distance_meters > 0),
  moving_time_seconds integer not null check (moving_time_seconds > 0),
  elapsed_time_seconds integer check (elapsed_time_seconds > 0),
  title text,
  raw_activity jsonb not null,
  clarified_run_id uuid references runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index draft_runs_user_created_at_idx on draft_runs(user_id, created_at desc);

create table training_plans (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now()
);

create table planned_workouts (
  id uuid primary key,
  training_plan_id uuid not null references training_plans(id) on delete cascade,
  scheduled_on date not null,
  title text not null,
  target_distance_meters integer check (target_distance_meters > 0),
  target_duration_seconds integer check (target_duration_seconds > 0),
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'changed')),
  completed_run_id uuid references runs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index runs_user_occurred_on_idx on runs(user_id, occurred_on desc);
create index planned_workouts_plan_scheduled_on_idx on planned_workouts(training_plan_id, scheduled_on);
