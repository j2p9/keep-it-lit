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
- **Never lose anything:** every change is saved on the phone first and synced to your account, so it works offline and on a new phone. There's also Export/Import backup.

## Development

```bash
npm install
npm run dev          # http://localhost:5173/?demo shows sample data without an account
npm test             # streak, stats and award logic
npm run build
```

Demo URLs on localhost: `?demo` (keeps your changes), `?demo=reset` (fresh sample), `?demo=fresh` (new-user onboarding), and `&at=2026-11-02T21:30` to preview a time of day.

### Backend (Supabase)

- `supabase/migrations/0001_schema.sql`: tables with row-level security (each user sees only their own rows).
- `supabase/migrations/0002_reminders.sql`: `due_reminders()` plus a `pg_cron` job that calls the `send-reminders` Edge Function every minute.
- `supabase/functions/signup`: creates accounts that are ready to use immediately.
- `supabase/functions/send-reminders`: sends Web Push reminders and test notifications.

Secrets live in Supabase Vault, never in this repo: `kil_vapid_public`, `kil_vapid_private`, `kil_vapid_subject`, `kil_cron_secret` and `kil_project_url`. Public settings (project URL, publishable key, VAPID public key) are in `src/config.js`.

Optional: to send password-reset emails to any address, add a custom SMTP sender in Supabase → Authentication → Emails, and set Site URL to the app's address.

Pushing to `main` deploys to GitHub Pages automatically.
