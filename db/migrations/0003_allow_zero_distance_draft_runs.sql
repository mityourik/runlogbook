alter table draft_runs
drop constraint draft_runs_distance_meters_check;

alter table draft_runs
add constraint draft_runs_distance_meters_check check (distance_meters >= 0);
