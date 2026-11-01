-- Keep It Lit: push reminders. A cron job calls the send-reminders Edge Function every minute;
-- due_reminders() decides who should hear from us, in each user's own time zone.
-- Secrets (VAPID keys, cron secret, project URL) live in Supabase Vault, never in this repo.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Push keys and the cron secret for the Edge Function. Only the service role may call this.
create or replace function public.kil_private_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(substr(name, 5), decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('kil_vapid_public', 'kil_vapid_private', 'kil_vapid_subject', 'kil_cron_secret');
$$;
revoke all on function public.kil_private_config() from public, anon, authenticated;
grant execute on function public.kil_private_config() to service_role;

-- Reminders due at p_at that haven't been sent yet. A reminder stays due for p_window_minutes,
-- so a late cron run still delivers it but a stale one never goes out.
create or replace function public.due_reminders(p_at timestamptz default now(), p_window_minutes integer default 120)
returns table (
  user_id uuid,
  kind text,
  local_day date,
  display_name text,
  goal_id uuid,
  goal_title text,
  goal_emoji text,
  due_count integer,
  done_count integer,
  has_goals boolean,
  remaining jsonb,
  stats jsonb,
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
      p.stats,
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
  -- Day-based goals due today, with whether they're done or skipped.
  g as (
    select
      u2.id as uid,
      gl.id as gid,
      gl.title,
      gl.emoji,
      gl.reminder_time,
      coalesce(c.count, 0) >= gl.target and not coalesce(c.skipped, false) as done,
      coalesce(c.skipped, false) as skipped
    from u2
    join public.goals gl
      on gl.user_id = u2.id
     and gl.deleted_at is null
     and gl.start_on <= u2.lday
     and (gl.archived_on is null or u2.lday < gl.archived_on)
     and (gl.schedule = 'daily' or (gl.schedule = 'weekdays' and extract(dow from u2.lday)::integer = any (gl.days)))
    left join public.checkins c on c.goal_id = gl.id and c.day = u2.lday
  ),
  s as (
    select
      uid,
      (count(*) filter (where not skipped))::integer as due_count,
      (count(*) filter (where done))::integer as done_count,
      coalesce(
        jsonb_agg(jsonb_build_object('id', gid, 'e', emoji, 't', title)) filter (where not done and not skipped),
        '[]'::jsonb
      ) as remaining
    from g
    group by uid
  ),
  -- Weekly goals with their own reminder, not done today and still short of this week's target.
  wk as (
    select u2.id as uid, gl.id as gid, gl.title, gl.emoji, gl.reminder_time
    from u2
    join public.goals gl
      on gl.user_id = u2.id
     and gl.deleted_at is null
     and gl.schedule = 'weekly'
     and gl.reminder_time is not null
     and gl.start_on <= u2.lday
     and (gl.archived_on is null or u2.lday < gl.archived_on)
    where not exists (
        select 1 from public.checkins c
        where c.goal_id = gl.id and c.day = u2.lday and (c.count >= gl.target or c.skipped)
      )
      and (
        select count(*) from public.checkins c
        where c.goal_id = gl.id
          and not c.skipped
          and c.count >= gl.target
          and c.day between u2.lday - ((extract(dow from u2.lday)::integer - u2.ws + 7) % 7) and u2.lday
      ) < gl.per_week
  ),
  base as (
    select
      u2.*,
      coalesce(s.due_count, 0) as due_count,
      coalesce(s.done_count, 0) as done_count,
      coalesce(s.remaining, '[]'::jsonb) as remaining,
      exists (
        select 1 from public.goals x
        where x.user_id = u2.id and x.deleted_at is null and (x.archived_on is null or x.archived_on > u2.lday)
      ) as has_goals
    from u2
    left join s on s.uid = u2.id
  ),
  cand as (
    select b.id, 'checkin'::text as kind, null::uuid as gid, null::text as gtitle, null::text as gemoji,
      b.reminder_checkin_time as rtime, b.reminder_checkin_enabled and b.due_count > b.done_count as wanted
    from base b
    union all
    select b.id, 'saver', null, null, null,
      b.reminder_saver_time, b.reminder_saver_enabled and (b.due_count > b.done_count or not b.has_goals)
    from base b
    union all
    select b.id, 'morning', null, null, null,
      b.reminder_morning_time, b.reminder_morning_enabled and b.has_goals
    from base b
    union all
    select g.uid, 'goal:' || g.gid::text, g.gid, g.title, g.emoji, g.reminder_time, not g.done and not g.skipped
    from g
    where g.reminder_time is not null
    union all
    select wk.uid, 'goal:' || wk.gid::text, wk.gid, wk.title, wk.emoji, wk.reminder_time, true
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
    b.due_count,
    b.done_count,
    b.has_goals,
    b.remaining,
    b.stats,
    b.deh
  from cand c
  join base b on b.id = c.id
  -- A reminder before the day's end hour (for night owls) belongs to the next calendar date.
  cross join lateral (
    select b.lday + c.rtime
      + case when c.rtime < make_time(b.deh, 0, 0) then interval '1 day' else interval '0' end as rts
  ) t
  where c.wanted
    and b.local_ts >= t.rts
    and b.local_ts < t.rts + make_interval(mins => p_window_minutes)
    and not exists (
      select 1 from public.reminder_log l
      where l.user_id = b.id and l.day = b.lday and l.kind = c.kind
    );
$$;
revoke all on function public.due_reminders(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.due_reminders(timestamptz, integer) to service_role;

select cron.schedule(
  'keep-it-lit-reminders',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'kil_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kil_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);

select cron.schedule(
  'keep-it-lit-cleanup',
  '17 3 * * *',
  $cron$ delete from public.reminder_log where day < current_date - 14 $cron$
);
