-- Keep It Lit: tables, row-level security and account helpers.
-- Every table is private to its owner: (select auth.uid()) must match the row's user.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  settings jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  reminder_checkin_enabled boolean not null default true,
  reminder_checkin_time time not null default '15:00',
  reminder_saver_enabled boolean not null default true,
  reminder_saver_time time not null default '21:00',
  reminder_morning_enabled boolean not null default false,
  reminder_morning_time time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  emoji text not null default '🔥' check (char_length(emoji) <= 16),
  color text not null default 'flame' check (char_length(color) <= 16),
  target integer not null default 1 check (target between 1 and 100000),
  unit text check (char_length(unit) <= 20),
  schedule text not null default 'daily' check (schedule in ('daily', 'weekdays', 'weekly')),
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  per_week smallint not null default 3 check (per_week between 1 and 7),
  time_of_day text not null default 'anytime' check (time_of_day in ('morning', 'afternoon', 'evening', 'anytime')),
  reminder_time time,
  sort_order integer not null default 0,
  start_on date not null default current_date,
  archived_on date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_updated_idx on public.goals (user_id, updated_at);

create table public.checkins (
  goal_id uuid not null references public.goals (id) on delete cascade,
  day date not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  count integer not null default 0 check (count between 0 and 100000),
  skipped boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (goal_id, day)
);
create index checkins_user_updated_idx on public.checkins (user_id, updated_at);
create index checkins_user_day_idx on public.checkins (user_id, day);

create table public.day_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  note text not null default '' check (char_length(note) <= 1000),
  mood smallint check (mood between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index day_notes_user_updated_idx on public.day_notes (user_id, updated_at);

create table public.achievements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  award_key text not null check (char_length(award_key) <= 80),
  earned_on date not null,
  seen boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, award_key)
);
create index achievements_user_updated_idx on public.achievements (user_id, updated_at);

create table public.challenges (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null,
  target integer not null check (target between 1 and 31),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
create index challenges_user_updated_idx on public.challenges (user_id, updated_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Which reminders went out, so each one is sent at most once a day. Server-only.
create table public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (char_length(kind) <= 60),
  sent_at timestamptz not null default now(),
  primary key (user_id, day, kind)
);

-- updated_at is set by the server: it is the cursor the app syncs from.
create trigger profiles_touch before insert or update on public.profiles for each row execute function public.touch_updated_at();
create trigger goals_touch before insert or update on public.goals for each row execute function public.touch_updated_at();
create trigger checkins_touch before insert or update on public.checkins for each row execute function public.touch_updated_at();
create trigger day_notes_touch before insert or update on public.day_notes for each row execute function public.touch_updated_at();
create trigger achievements_touch before insert or update on public.achievements for each row execute function public.touch_updated_at();
create trigger challenges_touch before insert or update on public.challenges for each row execute function public.touch_updated_at();
create trigger push_subscriptions_touch before insert or update on public.push_subscriptions for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.checkins enable row level security;
alter table public.day_notes enable row level security;
alter table public.achievements enable row level security;
alter table public.challenges enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;

create policy "Own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Own goals" on public.goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Own check-ins on own goals" on public.checkins
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid()))
  );

create policy "Own notes" on public.day_notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Own awards" on public.achievements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Own challenges" on public.challenges
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Signed-out visitors never touch any table; reminder_log is for the server only.
revoke all on public.profiles, public.goals, public.checkins, public.day_notes, public.achievements,
  public.challenges, public.push_subscriptions, public.reminder_log from anon;
revoke all on public.reminder_log from authenticated;

-- A profile for every new account, named from sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- "Delete account" in Settings: removes the login and, through cascades, every row it owns.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
