alter table runs
  add column workout_kind text check (workout_kind in ('easy', 'workout', 'long', 'race', 'other')),
  add column workout_structure text;

alter table workout_laps
  add column corrected_distance_meters integer check (corrected_distance_meters >= 0);
