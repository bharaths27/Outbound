-- T Quest: Tiger Data (TimescaleDB) schema
-- Run once:  psql "$TIGER_DATA_URL" -f tigerdata/schema.sql
-- (or paste into the Tiger Data console's SQL editor)

-- 1) Every train position, every poll (also powers replay mode)
create table if not exists train_positions (
  time           timestamptz not null,     -- when we polled
  vehicle_id     text not null,
  route_id       text not null,            -- Red, Orange, Green-B, Green-C, ...
  line           text not null,            -- Red, Orange, Green
  direction_id   int,
  lat            double precision,
  lon            double precision,
  bearing        double precision,
  current_status text,                     -- IN_TRANSIT_TO, STOPPED_AT, INCOMING_AT
  stop_id        text,
  trip_id        text,
  label          text,
  occupancy      text,
  updated_at     timestamptz               -- MBTA's own timestamp for the position
);
select create_hypertable('train_positions', 'time', if_not_exists => true);
create index if not exists train_positions_line_time on train_positions (line, time desc);

-- 2) Predicted vs scheduled arrival at key stations, every poll
create table if not exists arrival_predictions (
  time              timestamptz not null,
  route_id          text not null,
  line              text not null,
  stop_id           text not null,         -- child stop (platform) id from MBTA
  parent_station    text,                  -- e.g. place-kencl
  trip_id           text not null,
  direction_id      int,
  predicted_arrival timestamptz,
  scheduled_arrival timestamptz,           -- null when MBTA has no schedule match
  delay_s           double precision       -- predicted - scheduled, null if no schedule
);
select create_hypertable('arrival_predictions', 'time', if_not_exists => true);
create index if not exists arrival_predictions_line_time on arrival_predictions (line, time desc);
create index if not exists arrival_predictions_trip_stop on arrival_predictions (trip_id, stop_id, time);

-- 3) Summary table: average lateness per line per hour (continuous aggregate)
create materialized view if not exists line_delay_hourly
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket('1 hour', time) as bucket,
       line,
       avg(delay_s)                as avg_delay_s,
       count(delay_s)              as samples
from arrival_predictions
where delay_s is not null
group by bucket, line
with no data;

select add_continuous_aggregate_policy('line_delay_hourly',
  start_offset      => interval '3 days',
  end_offset        => interval '1 minute',
  schedule_interval => interval '5 minutes',
  if_not_exists     => true);

-- 4) Trains per line per 5 minutes (a quick "how much service is running" stat)
create materialized view if not exists line_trains_5min
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket('5 minutes', time) as bucket,
       line,
       count(distinct vehicle_id)     as trains
from train_positions
group by bucket, line
with no data;

select add_continuous_aggregate_policy('line_trains_5min',
  start_offset      => interval '1 day',
  end_offset        => interval '1 minute',
  schedule_interval => interval '5 minutes',
  if_not_exists     => true);

-- 5) Compression + retention so the free tier never fills up
alter table train_positions set (timescaledb.compress, timescaledb.compress_segmentby = 'line');
select add_compression_policy('train_positions', interval '6 hours', if_not_exists => true);
alter table arrival_predictions set (timescaledb.compress, timescaledb.compress_segmentby = 'line');
select add_compression_policy('arrival_predictions', interval '6 hours', if_not_exists => true);
select add_retention_policy('train_positions', interval '14 days', if_not_exists => true);

-- ============ THE "HOW LATE IS EACH LINE RIGHT NOW" QUERY ============
-- The API route runs this. "now" = last 15 min, using only the newest prediction
-- per (trip, stop) so one late train isn't counted 60 times.
--
--   with latest as (
--     select distinct on (trip_id, stop_id) line, delay_s, predicted_arrival
--     from arrival_predictions
--     where time > now() - interval '15 minutes'
--     order by trip_id, stop_id, time desc)
--   select line,
--          round(avg(delay_s) filter (where delay_s is not null) / 60.0, 1) as now_delay_min,
--          count(delay_s) as samples
--   from latest group by line;
--
-- Fallback when MBTA gives no schedule for a line ("drift"): how much later the
-- newest prediction is than the FIRST prediction we saw for the same trip+stop.
--
--   with firsts as (
--     select distinct on (trip_id, stop_id) trip_id, stop_id, predicted_arrival as first_pred
--     from arrival_predictions where time > now() - interval '45 minutes'
--     order by trip_id, stop_id, time asc),
--   latest as (
--     select distinct on (trip_id, stop_id) trip_id, stop_id, line, predicted_arrival as last_pred
--     from arrival_predictions where time > now() - interval '15 minutes'
--     order by trip_id, stop_id, time desc)
--   select l.line, round(avg(extract(epoch from l.last_pred - f.first_pred)) / 60.0, 1) as drift_min
--   from latest l join firsts f using (trip_id, stop_id)
--   group by l.line;
