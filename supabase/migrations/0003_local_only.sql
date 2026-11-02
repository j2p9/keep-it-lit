-- Keep It Lit: local-only data.
-- Goals, check-ins, notes and awards now live on the phone. The database keeps each goal's
-- streak and today's progress (so reminders stay smart), an end-to-end encrypted backup the
-- server can't read, and a short-lived inbox for Apple Health numbers from the user's Shortcut.

-- One row per current goal, replaced as a set by the app (replace_goal_streaks).
create table public.goal_streaks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  title text not null check (char_length(title) between 1 and 60),
  emoji text not null default '🔥' check (char_length(emoji) <= 16),
  schedule text not null default 'daily' check (schedule in ('daily', 'weekdays', 'weekly')),
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  per_week smallint not null default 3 check (per_week between 1 and 7),
  unit text not null default 'day' check (unit in ('day', 'week')),
  current integer not null default 0 check (current >= 0),
  best integer not null default 0 check (best >= 0),
  start_on date not null,
  -- The local date this snapshot describes, and whether nothing is left for it that day
  -- (done or skipped).
  day date not null,
  done_today boolean not null default false,
  -- Weekly goals: check-offs so far in the week starting on week_of.
  week_of date,
  week_done smallint not null default 0 check (week_done between 0 and 7),
  reminder_time time,
  health_metric text check (health_metric in ('steps', 'exercise', 'active', 'stand', 'mindful', 'sleep', 'water', 'workouts')),
  health_target numeric check (health_target > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, goal_id)
);
create index goal_streaks_health_idx on public.goal_streaks (user_id, health_metric) where health_metric is not null;

-- End-to-end encrypted backup: encrypted on the phone with the user's passphrase.
create table public.backups (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) <= 4000000),
  salt text not null check (char_length(salt) <= 64),
  iv text not null check (char_length(iv) <= 64),
  kdf jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  bytes integer not null default 0,
  updated_at timestamptz not null default now()
);

-- The Apple Health upload key. Only its SHA-256 is stored; the app shows the key itself once.
create table public.health_tokens (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Health numbers wait here until the app picks them up (then deletes them), at most 7 days.
create table public.health_inbox (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  metrics jsonb not null,
  received_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger goal_streaks_touch before insert or update on public.goal_streaks for each row execute function public.touch_updated_at();
create trigger backups_touch before insert or update on public.backups for each row execute function public.touch_updated_at();

alter table public.goal_streaks enable row level security;
alter table public.backups enable row level security;
alter table public.health_tokens enable row level security;
alter table public.health_inbox enable row level security;

create policy "Own streaks" on public.goal_streaks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Own backup" on public.backups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Own Health key" on public.health_tokens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Users read and clear their own inbox; only the server (health-import) writes to it.
create policy "Read own Health inbox" on public.health_inbox
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Clear own Health inbox" on public.health_inbox
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.goal_streaks, public.backups, public.health_tokens, public.health_inbox from anon;
revoke insert, update on public.health_inbox from authenticated;

-- Replaces the user's streak rows with the given set, so archived or deleted goals disappear.
create or replace function public.replace_goal_streaks(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from public.goal_streaks s
  where s.user_id = me
    and s.goal_id not in (select (r ->> 'goal_id')::uuid from jsonb_array_elements(p_rows) r);
  insert into public.goal_streaks as s (
    user_id, goal_id, title, emoji, schedule, days, per_week, unit, current, best, start_on, day,
    done_today, week_of, week_done, reminder_time, health_metric, health_target
  )
  select
    me, x.goal_id, x.title, coalesce(x.emoji, '🔥'), coalesce(x.schedule, 'daily'), coalesce(x.days, '{0,1,2,3,4,5,6}'),
    coalesce(x.per_week, 3), coalesce(x.unit, 'day'), coalesce(x.current, 0), coalesce(x.best, 0), x.start_on, x.day,
    coalesce(x.done_today, false), x.week_of, coalesce(x.week_done, 0), x.reminder_time, x.health_metric, x.health_target
  from jsonb_to_recordset(p_rows) as x (
    goal_id uuid, title text, emoji text, schedule text, days smallint[], per_week smallint, unit text,
    current integer, best integer, start_on date, day date, done_today boolean, week_of date,
    week_done smallint, reminder_time time, health_metric text, health_target numeric
  )
  on conflict (user_id, goal_id) do update set
    title = excluded.title,
    emoji = excluded.emoji,
    schedule = excluded.schedule,
    days = excluded.days,
    per_week = excluded.per_week,
    unit = excluded.unit,
    current = excluded.current,
    best = excluded.best,
    start_on = excluded.start_on,
    day = excluded.day,
    done_today = excluded.done_today,
    week_of = excluded.week_of,
    week_done = excluded.week_done,
    reminder_time = excluded.reminder_time,
    health_metric = excluded.health_metric,
    health_target = excluded.health_target;
end;
$$;
revoke all on function public.replace_goal_streaks(jsonb) from public, anon;
grant execute on function public.replace_goal_streaks(jsonb) to authenticated;

-- Moving to local-only: once the phone holds everything, delete the cloud copy of the
-- caller's goals (check-ins go with them), notes, awards and challenges.
create or replace function public.purge_cloud_copy()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n_goals integer;
  n_notes integer;
  n_awards integer;
  n_challenges integer;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from public.goals where user_id = me;
  get diagnostics n_goals = row_count;
  delete from public.day_notes where user_id = me;
  get diagnostics n_notes = row_count;
  delete from public.achievements where user_id = me;
  get diagnostics n_awards = row_count;
  delete from public.challenges where user_id = me;
  get diagnostics n_challenges = row_count;
  return jsonb_build_object('goals', n_goals, 'notes', n_notes, 'awards', n_awards, 'challenges', n_challenges);
end;
$$;
revoke all on function public.purge_cloud_copy() from public, anon;
grant execute on function public.purge_cloud_copy() to authenticated;

-- Reminders now read the streak snapshot instead of goals and check-ins.
drop function if exists public.due_reminders(timestamptz, integer);

create function public.due_reminders(p_at timestamptz default now(), p_window_minutes integer default 120)
returns table (
  user_id uuid,
  kind text,
  local_day date,
  display_name text,
  goal_id uuid,
  goal_title text,
  goal_emoji text,
  goal_streak integer,
  due_count integer,
  done_count integer,
  has_goals boolean,
  remaining jsonb,
  day_end_hour integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select
      p.id,
      p.display_name,
      p.reminder_checkin_enabled,
      p.reminder_checkin_time,
      p.reminder_saver_enabled,
      p.reminder_saver_time,
      p.reminder_morning_enabled,
      p.reminder_morning_time,
      least(greatest(coalesce((p.settings ->> 'dayEndHour')::integer, 0), 0), 4) as deh,
      coalesce((p.settings ->> 'weekStart')::integer, 0) as ws,
      (p_at at time zone p.timezone) as local_ts
    from public.profiles p
    where exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      and exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = p.timezone)
  ),
  u2 as (
    select u.*, (u.local_ts - make_interval(hours => u.deh))::date as lday
    from u
  ),
  -- Day-based goals due today; "done" only counts if the snapshot is for today.
  g as (
    select
      u2.id as uid,
      s.goal_id as gid,
      s.title,
      s.emoji,
      s.reminder_time,
      s.current,
      (s.day = u2.lday and s.done_today) as done
    from u2
    join public.goal_streaks s
      on s.user_id = u2.id
     and s.start_on <= u2.lday
     and (s.schedule = 'daily' or (s.schedule = 'weekdays' and extract(dow from u2.lday)::integer = any (s.days)))
  ),
  t as (
    select
      uid,
      count(*)::integer as due_count,
      (count(*) filter (where done))::integer as done_count,
      coalesce(
        jsonb_agg(jsonb_build_object('id', gid, 'e', emoji, 't', title, 'n', current) order by current desc) filter (where not done),
        '[]'::jsonb
      ) as remaining
    from g
    group by uid
  ),
  -- Weekly goals with their own reminder, not done today and still short of this week's target.
  wk as (
    select u2.id as uid, s.goal_id as gid, s.title, s.emoji, s.reminder_time, s.current
    from u2
    join public.goal_streaks s
      on s.user_id = u2.id
     and s.schedule = 'weekly'
     and s.reminder_time is not null
     and s.start_on <= u2.lday
    where not (s.day = u2.lday and s.done_today)
      and (case
             when s.week_of = u2.lday - ((extract(dow from u2.lday)::integer - u2.ws + 7) % 7) then s.week_done
             else 0
           end) < s.per_week
  ),
  base as (
    select
      u2.*,
      coalesce(t.due_count, 0) as due_count,
      coalesce(t.done_count, 0) as done_count,
      coalesce(t.remaining, '[]'::jsonb) as remaining,
      exists (select 1 from public.goal_streaks x where x.user_id = u2.id) as has_goals
    from u2
    left join t on t.uid = u2.id
  ),
  cand as (
    select b.id, 'checkin'::text as kind, null::uuid as gid, null::text as gtitle, null::text as gemoji, null::integer as gstreak,
      b.reminder_checkin_time as rtime, b.reminder_checkin_enabled and b.due_count > b.done_count as wanted
    from base b
    union all
    select b.id, 'saver', null, null, null, null,
      b.reminder_saver_time, b.reminder_saver_enabled and (b.due_count > b.done_count or not b.has_goals)
    from base b
    union all
    select b.id, 'morning', null, null, null, null,
      b.reminder_morning_time, b.reminder_morning_enabled and b.has_goals
    from base b
    union all
    select g.uid, 'goal:' || g.gid::text, g.gid, g.title, g.emoji, g.current, g.reminder_time, not g.done
    from g
    where g.reminder_time is not null
    union all
    select wk.uid, 'goal:' || wk.gid::text, wk.gid, wk.title, wk.emoji, wk.current, wk.reminder_time, true
    from wk
  )
  select
    b.id,
    c.kind,
    b.lday,
    b.display_name,
    c.gid,
    c.gtitle,
    c.gemoji,
    c.gstreak,
    b.due_count,
    b.done_count,
    b.has_goals,
    b.remaining,
    b.deh
  from cand c
  join base b on b.id = c.id
  -- A reminder before the day's end hour (for night owls) belongs to the next calendar date.
  cross join lateral (
    select b.lday + c.rtime
      + case when c.rtime < make_time(b.deh, 0, 0) then interval '1 day' else interval '0' end as rts
  ) x
  where c.wanted
    and b.local_ts >= x.rts
    and b.local_ts < x.rts + make_interval(mins => p_window_minutes)
    and not exists (
      select 1 from public.reminder_log l
      where l.user_id = b.id and l.day = b.lday and l.kind = c.kind
    );
$$;
revoke all on function public.due_reminders(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.due_reminders(timestamptz, integer) to service_role;

select cron.schedule(
  'keep-it-lit-health-cleanup',
  '23 3 * * *',
  $cron$ delete from public.health_inbox where received_at < now() - interval '7 days' $cron$
);
