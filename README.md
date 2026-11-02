# Keep It Lit 🔥

A daily-goals app for your iPhone Home Screen. Check off goals in one tap, keep a Snapchat-style streak on every goal, see your history as Apple Fitness-style rings, and collect awards.

**Open it:** https://j2p9.github.io/keep-it-lit/

## Put it on your iPhone

1. Open the link above in **Safari**.
2. Tap **Share** (or **•••** → Share), then **Add to Home Screen** → **Add**.
3. Open **Keep It Lit** from your Home Screen and create your account.
4. During setup tap **Allow notifications** to get reminders. You can also do this later in Settings → Notifications.

Reminders only work from the Home Screen app (iOS 16.4 or later).

## Put it on your Android phone

1. Open the link above in **Chrome**.
2. Tap **Install** on the banner in the app (or **⋮** → **Install app**).
3. Open **Keep It Lit** from your home screen and create your account.
4. Allow notifications when asked. On Android, reminders also work in the browser.

Press and hold the app icon for shortcuts to Today, Calendar, Progress and Awards. The back button closes whatever is open, then returns to Today.

## What's inside

- **Today:** one tap checks a goal off (or adds +1 to counted goals like 8 glasses of water). Press and hold a goal to skip a day, log an exact amount, edit it or see its stats. Every tap has Undo.
- **Streaks per goal:** 🔥 day count on every goal. ⏳ appears in the last 4 hours if a streak is about to end, and 💯 from 100 days on. Every 7 days in a row earns a ❄️ streak freeze (up to 2) that saves a missed day automatically. Skipped days never break a streak.
- **Daily welcome:** the first open each day shows yesterday's recap, your streaks, the week at a glance, the next milestone and today's plan.
- **Calendar:** a month of progress rings. Filter by goal to see its streak chain, and tap any day to fill it in, set a mood or write a note.
- **Progress:** Week / Month / Year completion charts, Highlights, habit strength and a 26-week heatmap per goal.
- **Awards:** 39 medals across streaks, perfect days, milestones, consistency, monthly challenges, limited editions and a few secrets. They always match your history: undo the check-offs behind an award and it goes away.
- **Reminders:** a daily check-in (3 PM), a streak saver (9 PM, only if goals are left) and an optional morning kickoff, plus a reminder per goal. Every time is adjustable.
- **Apple Health:** goals can follow Steps, Exercise, Active calories, Mindful minutes, Sleep, Water or Workouts. They fill in and check themselves off. Web apps can't read Health directly, so an iOS Shortcut uploads today's totals a few times a day. Settings → Apple Health has the key, the upload address and a step-by-step guide.
- **Your data stays on your phone:** goals, check-ins, notes, awards and Health numbers are stored only on the phone. Your account keeps just your settings and each goal's streak (so reminders know what's left), plus an **encrypted backup** if you turn it on: it's locked with your own passphrase before it leaves the phone, so nobody else can read it. On a new phone, sign in and enter the passphrase to bring everything back, or start fresh and keep your streaks. Export/Import a file is still there too.

## Development

```bash
npm install
npm run dev          # http://localhost:5173/?demo shows sample data without an account
npm test             # streak, stats and award logic
npm run build
```

Demo URLs on localhost: `?demo` (keeps your changes), `?demo=reset` (fresh sample), `?demo=fresh` (new-user onboarding), and `&at=2026-11-02T21:30` to preview a time of day. In demo mode the console has `kilDemo.health({ steps: 12000 })` to simulate a Health upload, and `kilDemo.setup('migrate')` or `kilDemo.setup('restore', { newPhone: true })` to preview the setup screens. The demo backup is kept in localStorage.

### Backend (Supabase)

- `supabase/migrations/0001_schema.sql`: tables with row-level security (each user sees only their own rows).
- `supabase/migrations/0002_reminders.sql`: `due_reminders()` plus a `pg_cron` job that calls the `send-reminders` Edge Function every minute.
- `supabase/migrations/0003_local_only.sql`: `goal_streaks` (the streak snapshot reminders read), `backups` (ciphertext only), `health_tokens` (SHA-256 of each Shortcut key) and `health_inbox` (Health numbers waiting for the app, cleared after 7 days at most). `purge_cloud_copy()` empties the older goal tables for an account once its phone holds everything.
- `supabase/functions/signup`: creates accounts that are ready to use immediately.
- `supabase/functions/send-reminders`: sends Web Push reminders and test notifications.
- `supabase/functions/health-import`: receives the Shortcut's uploads (`POST` JSON with `date` plus any of `steps`, `exercise`, `active`, `mindful`, `sleep`, `water`, `workouts`; `Authorization: Bearer <key>`).

The goals, check-ins, notes, achievements and challenges tables from 0001 are only read once per account, to move it to local-only. They can be dropped once every account has moved.

Secrets live in Supabase Vault, never in this repo: `kil_vapid_public`, `kil_vapid_private`, `kil_vapid_subject`, `kil_cron_secret` and `kil_project_url`. Public settings (project URL, publishable key, VAPID public key) are in `src/config.js`.

Optional: to send password-reset emails to any address, add a custom SMTP sender in Supabase → Authentication → Emails, and set Site URL to the app's address.

Pushing to `main` deploys to GitHub Pages automatically.
