/* global __APP_VERSION__ */
import { useEffect, useRef, useState } from 'preact/hooks';
import { VAPID_PUBLIC_KEY } from '../config.js';
import { colorOf } from '../lib/colors.js';
import { formatTime, formatWhen } from '../lib/dates.js';
import { installPrompt, promptInstall } from '../lib/install.js';
import { isIOS, isStandalone, deviceTimezone } from '../lib/platform.js';
import { enablePush, hasSubscription, permission, pushSupported, sendTestPush } from '../lib/push.js';
import { scheduleLabel } from '../lib/schedule.js';
import {
  archivedGoals,
  backupState,
  currentGoals,
  deleteAccount,
  deleteGoal,
  exportData,
  importData,
  moveGoal,
  profile,
  restPlan,
  restRule,
  session,
  setRestRule,
  settings,
  signOut,
  syncNow,
  syncStatus,
  today,
  uid,
  unarchiveGoal,
  updateProfile,
  updateSettings,
} from '../lib/store.js';
import { cloudConfigured, supabase } from '../lib/supabase.js';
import { closeAllOverlays, openOverlay, showToast } from '../lib/ui.js';
import { Page, Sheet } from '../components/Sheet.jsx';
import { Segmented, Switch } from '../components/controls.jsx';
import { IconDown, IconNext, IconUp } from '../components/icons.jsx';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function syncText(st, demo) {
  if (demo) return 'Demo mode: nothing leaves this device';
  if (st.state === 'offline') return st.pending ? `Offline · ${plural(st.pending, 'change')} saved on this phone` : 'Offline';
  if (st.state === 'syncing') return 'Syncing…';
  if (st.state === 'error') return `Will retry · ${plural(st.pending, 'change')} waiting`;
  if (st.pending) return `${plural(st.pending, 'change')} waiting to sync`;
  return 'Streaks and settings are up to date';
}

function ReminderRow({ icon, title, sub, enabled, time, onEnabled, onTime }) {
  return (
    <div class="item">
      <span style="font-size:22px" aria-hidden="true">
        {icon}
      </span>
      <div class="item-main">
        <div class="item-label">{title}</div>
        <div class="item-sub">{sub}</div>
      </div>
      {enabled && (
        <input type="time" class="time-input" value={time} aria-label={`${title} time`} onChange={(e) => e.currentTarget.value && onTime(e.currentTarget.value)} />
      )}
      <Switch label={title} on={enabled} onChange={onEnabled} />
    </div>
  );
}

export function Settings({ onClose }) {
  const p = profile.value || {};
  const s = settings.value;
  const rule = restRule.value;
  const demo = session.value.demo;
  const email = session.value.user?.email;
  const [push, setPush] = useState('checking');
  const [name, setName] = useState(p.display_name || '');
  const fileRef = useRef(null);

  const checkPush = async () => {
    if (demo || !cloudConfigured || !VAPID_PUBLIC_KEY) return setPush('unavailable');
    if (isIOS() && !isStandalone()) return setPush('install');
    if (!pushSupported()) return setPush('unsupported');
    if (permission() === 'denied') return setPush('denied');
    setPush(permission() === 'granted' && (await hasSubscription()) ? 'on' : 'off');
  };
  useEffect(() => {
    checkPush();
  }, []);

  const enable = async () => {
    setPush('working');
    try {
      const r = await enablePush(uid());
      if (!r.ok && r.reason === 'denied') showToast('Notifications are blocked. Allow them in iPhone Settings → Notifications.', { duration: 6000 });
      else if (r.ok) showToast('🔔 Reminders are on');
    } catch {
      showToast('Couldn’t turn on notifications. Please try again.');
    }
    checkPush();
  };

  const test = async () => {
    try {
      const r = await sendTestPush();
      showToast(r.sent ? 'Test sent. It should arrive in a few seconds.' : 'No device found. Turn notifications on first.');
    } catch {
      showToast('Couldn’t send a test right now.');
    }
  };

  const doExport = async () => {
    const name2 = `keep-it-lit-backup-${today.peek()}.json`;
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const file = new File([blob], name2, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Keep It Lit backup' });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name2;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const doImport = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!confirm('Add the goals and history from this file to this phone?')) return;
      const r = importData(data);
      showToast(`Imported ${plural(r.goals, 'goal')} and ${plural(r.checkins, 'check-in')}`);
    } catch (err) {
      showToast(err.message || 'That file couldn’t be read.');
    }
  };

  const doSignOut = async () => {
    const r = await signOut();
    if (r?.pending) {
      if (!confirm(`${plural(r.pending, 'setting')} haven’t synced yet because you’re offline. Sign out anyway? Your goals stay on this phone.`)) return;
      await signOut({ force: true });
    }
    closeAllOverlays();
  };

  const doDelete = async () => {
    if (
      !confirm(
        'Delete your account? Your streaks, settings and backup are deleted from the cloud, and this phone forgets your goals and history. This can’t be undone.',
      )
    )
      return;
    if (!confirm('Are you sure? Everything will be permanently deleted.')) return;
    try {
      await deleteAccount();
      closeAllOverlays();
    } catch {
      showToast('Couldn’t delete the account. Check your connection and try again.');
    }
  };

  const pushRow = {
    checking: ['Checking…', null],
    working: ['Turning on…', null],
    on: ['On for this device', <button class="btn btn-secondary btn-small" onClick={test}>Send test</button>],
    off: ['Off', <button class="btn btn-primary btn-small" onClick={enable}>Turn on</button>],
    denied: ['Blocked: allow in iPhone Settings → Notifications', null],
    install: ['Add the app to your Home Screen first', null],
    unsupported: ['Not supported in this browser', null],
    unavailable: [demo ? 'Not available in demo mode' : 'Not set up yet', null],
  }[push];

  const tz = deviceTimezone();

  return (
    <Page title="Settings" onBack={onClose} backLabel="Done" from="bottom">
      <div class="group">
        <div class="profile-card">
          <div class="avatar" aria-hidden="true">
            {(p.display_name || email || '🔥').trim().charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <input
              class="input"
              style="min-height:42px"
              aria-label="Your name"
              placeholder="Your name"
              maxLength={40}
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              onBlur={() => name.trim() !== (p.display_name || '') && updateProfile({ display_name: name.trim() })}
            />
            <div class="muted" style="font-size:13px;margin:6px 4px 0;overflow:hidden;text-overflow:ellipsis">
              {email}
            </div>
          </div>
        </div>
      </div>
      <div style="height:16px" />

      <h2 class="group-title">Reminders</h2>
      <div class="group">
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            🔔
          </span>
          <div class="item-main">
            <div class="item-label">Notifications</div>
            <div class="item-sub">{pushRow[0]}</div>
          </div>
          {pushRow[1]}
        </div>
        <ReminderRow
          icon="☀️"
          title="Daily check-in"
          sub="Only if goals are still left"
          enabled={p.reminder_checkin_enabled ?? true}
          time={p.reminder_checkin_time || '15:00'}
          onEnabled={(v) => updateProfile({ reminder_checkin_enabled: v })}
          onTime={(v) => updateProfile({ reminder_checkin_time: v })}
        />
        <ReminderRow
          icon="⏳"
          title="Streak saver"
          sub="Last call if goals aren’t done"
          enabled={p.reminder_saver_enabled ?? true}
          time={p.reminder_saver_time || '21:00'}
          onEnabled={(v) => updateProfile({ reminder_saver_enabled: v })}
          onTime={(v) => updateProfile({ reminder_saver_time: v })}
        />
        <ReminderRow
          icon="🌅"
          title="Morning kickoff"
          sub="Opens your daily summary"
          enabled={p.reminder_morning_enabled ?? false}
          time={p.reminder_morning_time || '08:00'}
          onEnabled={(v) => updateProfile({ reminder_morning_enabled: v })}
          onTime={(v) => updateProfile({ reminder_morning_time: v })}
        />
      </div>
      <p class="group-note">
        Reminders skip themselves when you’ve already finished. Each goal can also have its own reminder (edit the goal). Times follow your
        phone’s time zone ({tz}).
      </p>

      <h2 class="group-title">Goals</h2>
      <div class="group">
        <button class="item" onClick={() => openOverlay('manageGoals')}>
          <span style="font-size:22px" aria-hidden="true">
            🎯
          </span>
          <div class="item-main">
            <div class="item-label">Manage goals</div>
            <div class="item-sub">
              {plural(currentGoals.value.length, 'goal')}
              {archivedGoals.value.length ? ` · ${archivedGoals.value.length} archived` : ''}
            </div>
          </div>
          <IconNext size={18} class="chev" />
        </button>
      </div>
      <div style="height:16px" />

      <h2 class="group-title">Streaks</h2>
      <div class="group">
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            🛌
          </span>
          <div class="item-main">
            <div class="item-label">Rest days · {restPlan.value.bank} banked</div>
            <div class="item-sub">
              Bank days off with perfect days. A missed day (or a weekly goal’s missed week) uses one automatically. Changes apply from
              today on.
            </div>
          </div>
          <Switch label="Rest days" on={rule.on} onChange={(v) => setRestRule({ on: v })} />
        </div>
        {rule.on && (
          <div class="item rest-rule">
            <div class="item-main">
              Earn{' '}
              <select class="time-input" aria-label="Rest days earned each time" value={rule.amount} onChange={(e) => setRestRule({ amount: Number(e.currentTarget.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>{' '}
              every{' '}
              <select class="time-input" aria-label="Perfect days to earn a rest day" value={rule.every} onChange={(e) => setRestRule({ every: Number(e.currentTarget.value) })}>
                {[3, 4, 5, 6, 7, 10, 14, 21, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>{' '}
              perfect days, keep up to{' '}
              <select class="time-input" aria-label="Most rest days banked" value={rule.max} onChange={(e) => setRestRule({ max: Number(e.currentTarget.value) })}>
                {[1, 2, 3, 5, 7, 10, 14, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            ❄️
          </span>
          <div class="item-main">
            <div class="item-label">Streak freezes</div>
            <div class="item-sub">A backup for when you’re out of rest days: earn one every 7 days in a row on a goal</div>
          </div>
          <Switch label="Streak freezes" on={s.freezes} onChange={(v) => updateSettings({ freezes: v })} />
        </div>
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            🌙
          </span>
          <div class="item-main">
            <div class="item-label">My day ends at</div>
            <div class="item-sub">For night owls: late check-offs count for the day before. After midnight, Today lets you start the new day early.</div>
          </div>
          <select
            class="time-input"
            aria-label="Day ends at"
            value={s.dayEndHour}
            onChange={(e) => updateSettings({ dayEndHour: Number(e.currentTarget.value) })}
          >
            <option value="0">Midnight</option>
            <option value="1">1 AM</option>
            <option value="2">2 AM</option>
            <option value="3">3 AM</option>
            <option value="4">4 AM</option>
          </select>
        </div>
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            📅
          </span>
          <div class="item-main">
            <div class="item-label">Week starts on</div>
          </div>
          <select
            class="time-input"
            aria-label="Week starts on"
            value={s.weekStart}
            onChange={(e) => updateSettings({ weekStart: Number(e.currentTarget.value) })}
          >
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="6">Saturday</option>
          </select>
        </div>
      </div>
      <p class="group-note">
        🤒 Sick? Tap 🛌 on Today, or press and hold a goal. Sick days (and sick weeks for weekly goals) are free and pause your streaks.
        Only use them when you really are.
      </p>

      <h2 class="group-title">Appearance</h2>
      <div class="group" style="padding:12px">
        <Segmented
          label="Theme"
          options={[
            ['auto', 'Auto'],
            ['dark', 'Dark'],
            ['light', 'Light'],
          ]}
          value={s.theme}
          onChange={(v) => updateSettings({ theme: v })}
        />
      </div>
      <div style="height:16px" />

      {(isIOS() || demo || s.health) && (
        <>
          <h2 class="group-title">Apple Health</h2>
          <div class="group">
            <button class="item" onClick={() => openOverlay('healthSetup')}>
              <span style="font-size:22px" aria-hidden="true">
                ❤️
              </span>
              <div class="item-main">
                <div class="item-label">Apple Health</div>
                <div class="item-sub">{s.health ? 'Connected · fills in linked goals' : 'Let Health check off goals for you'}</div>
              </div>
              <IconNext size={18} class="chev" />
            </button>
          </div>
          <div style="height:16px" />
        </>
      )}

      <h2 class="group-title">Your data</h2>
      <div class="group">
        <button class="item" onClick={() => openOverlay('backup')}>
          <span style="font-size:22px" aria-hidden="true">
            🔐
          </span>
          <div class="item-main">
            <div class="item-label">Encrypted backup</div>
            <div class="item-sub">
              {backupState.value.on
                ? `On${backupState.value.at ? ` · saved ${formatWhen(backupState.value.at)}` : ''}`
                : 'Off · your history is only on this phone'}
            </div>
          </div>
          <IconNext size={18} class="chev" />
        </button>
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            ☁️
          </span>
          <div class="item-main">
            <div class="item-label">Cloud sync</div>
            <div class="item-sub">{syncText(syncStatus.value, demo)}</div>
          </div>
          {!demo && (
            <button
              class="btn btn-secondary btn-small"
              onClick={async () => {
                await syncNow();
                showToast('Synced');
              }}
            >
              Sync now
            </button>
          )}
        </div>
        <button class="item" onClick={doExport}>
          <span style="font-size:22px" aria-hidden="true">
            📤
          </span>
          <div class="item-main">
            <div class="item-label">Export a copy</div>
            <div class="item-sub">Save a file to Files, iCloud or email</div>
          </div>
        </button>
        <button class="item" onClick={() => fileRef.current?.click()}>
          <span style="font-size:22px" aria-hidden="true">
            📥
          </span>
          <div class="item-main">
            <div class="item-label">Import a copy</div>
          </div>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
      </div>
      <p class="group-note">
        Your goals, check-ins, notes, awards and Health numbers are stored only on this phone. Your account keeps your settings and each
        goal’s streak (for reminders), plus the encrypted backup if it’s on.
      </p>

      <h2 class="group-title">Account</h2>
      <div class="group">
        {installPrompt.value && !isStandalone() && (
          <button
            class="item"
            onClick={async () => {
              if (await promptInstall()) showToast('Installed! Open Keep It Lit from your home screen.');
            }}
          >
            <span style="font-size:22px" aria-hidden="true">
              📲
            </span>
            <div class="item-main">
              <div class="item-label">Install the app</div>
              <div class="item-sub">Put Keep It Lit on your home screen</div>
            </div>
          </button>
        )}
        {!demo && (
          <button class="item" onClick={() => openOverlay('changePassword')}>
            <span style="font-size:22px" aria-hidden="true">
              🔑
            </span>
            <div class="item-main">
              <div class="item-label">Change password</div>
            </div>
            <IconNext size={18} class="chev" />
          </button>
        )}
        <button class="item" onClick={doSignOut}>
          <span style="font-size:22px" aria-hidden="true">
            👋
          </span>
          <div class="item-main">
            <div class="item-label">{demo ? 'Reset demo' : 'Sign out'}</div>
            {!demo && <div class="item-sub">Your goals stay on this phone for next time</div>}
          </div>
        </button>
        {!demo && (
          <button class="item" onClick={doDelete}>
            <span style="font-size:22px" aria-hidden="true">
              🗑️
            </span>
            <div class="item-main">
              <div class="item-label" style="color:var(--danger)">
                Delete account
              </div>
            </div>
          </button>
        )}
      </div>
      <p class="group-note" style="text-align:center;margin-top:18px">
        Keep It Lit {__APP_VERSION__} · Made with 🔥
      </p>
    </Page>
  );
}

export function ManageGoals({ onClose }) {
  const list = currentGoals.value;
  const archived = archivedGoals.value;
  return (
    <Page title="Manage goals" onBack={onClose}>
      <h2 class="group-title">Order and edit</h2>
      <div class="group">
        {list.length === 0 && (
          <div class="item">
            <div class="item-main muted">No goals yet.</div>
          </div>
        )}
        {list.map((g, i) => (
          <div key={g.id} class="item" style={{ '--c': colorOf(g.color) }}>
            <div class="goal-icon" style="width:38px;height:38px;font-size:20px;border-radius:12px" aria-hidden="true">
              {g.emoji}
            </div>
            <button class="item-main" style="text-align:left" onClick={() => openOverlay('goalEditor', { goalId: g.id })}>
              <div class="item-label">{g.title}</div>
              <div class="item-sub">
                {scheduleLabel(g)}
                {g.reminder_time ? ` · 🔔 ${formatTime(g.reminder_time)}` : ''}
              </div>
            </button>
            <button class="icon-btn" style="width:34px;height:34px" aria-label={`Move ${g.title} up`} disabled={i === 0} onClick={() => moveGoal(g, -1)}>
              <IconUp size={18} />
            </button>
            <button
              class="icon-btn"
              style="width:34px;height:34px"
              aria-label={`Move ${g.title} down`}
              disabled={i === list.length - 1}
              onClick={() => moveGoal(g, 1)}
            >
              <IconDown size={18} />
            </button>
          </div>
        ))}
      </div>
      <button class="btn btn-secondary btn-block" style="margin:14px 0 24px" onClick={() => openOverlay('templates')}>
        + Add a goal
      </button>

      {archived.length > 0 && (
        <>
          <h2 class="group-title">Archived</h2>
          <div class="group">
            {archived.map((g) => (
              <div key={g.id} class="item">
                <span style="font-size:22px" aria-hidden="true">
                  {g.emoji}
                </span>
                <div class="item-main">
                  <div class="item-label">{g.title}</div>
                </div>
                <button class="btn btn-secondary btn-small" onClick={() => unarchiveGoal(g)}>
                  Restore
                </button>
                <button
                  class="btn btn-danger btn-small"
                  onClick={() => confirm(`Delete “${g.title}” and its history for good?`) && deleteGoal(g)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
          <p class="group-note">Archived goals keep their history and awards but stop showing up each day.</p>
        </>
      )}
    </Page>
  );
}

export function ChangePassword({ onClose }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    showToast('Password changed');
    onClose();
  };
  return (
    <Sheet onClose={onClose} title="Change password">
      <form onSubmit={save}>
        <label class="field">
          <span class="label">New password</span>
          <input
            class="input"
            type="password"
            autocomplete="new-password"
            minLength={8}
            required
            placeholder="At least 8 characters"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </label>
        {error && <p class="form-error">{error}</p>}
        <button class="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </Sheet>
  );
}
