alter table strava_connections
add column granted_scope text not null default '';
