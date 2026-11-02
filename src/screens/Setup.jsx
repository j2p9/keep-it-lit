// Steps that come before the app: moving an account's data onto this phone (with an optional
// encrypted backup), and bringing it back on a new phone.
import { useState } from 'preact/hooks';
import { formatWhen } from '../lib/dates.js';
import { allGoals, checkinList, completeMigration, restoreFromBackup, restoreInfo, setupStep, startFresh } from '../lib/store.js';
import { setUi, showToast } from '../lib/ui.js';
import { Logo, SecretInput, Segmented, Switch } from '../components/controls.jsx';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const MIN_PASSPHRASE = 8;

/** An error message for a new passphrase, or '' when it's fine. */
export function passphraseProblem(pass, again) {
  if (pass.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
  if (pass !== again) return 'The two passphrases don’t match.';
  return '';
}

export function sizeLabel(bytes) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The two passphrase fields used wherever a backup is turned on. */
export function NewPassphrase({ pass, again, onPass, onAgain }) {
  return (
    <>
      <label class="field">
        <span class="label">Backup passphrase</span>
        <SecretInput label="Backup passphrase" value={pass} onInput={onPass} placeholder={`At least ${MIN_PASSPHRASE} characters`} />
      </label>
      <label class="field">
        <span class="label">Type it again</span>
        <SecretInput label="Type the passphrase again" value={again} onInput={onAgain} />
      </label>
    </>
  );
}

export function Setup() {
  return setupStep.value === 'restore' ? <Restore /> : <Migrate />;
}

function Migrate() {
  const [mode, setMode] = useState('backup');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const goalCount = allGoals.value.length;
  const checkCount = checkinList.value.filter((c) => c.count > 0).length;

  const submit = async (e) => {
    e.preventDefault();
    const problem = mode === 'backup' ? passphraseProblem(pass, again) : '';
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await completeMigration(mode === 'backup' ? pass : null);
      // They chose no backup on purpose: don't nag about it on the Today screen.
      if (mode === 'local') setUi({ backupDismissed: true });
      showToast(mode === 'backup' ? '🔒 Saved on this phone, with an encrypted backup' : '📱 Saved on this phone');
    } catch (err) {
      setError(err.message || 'Something went wrong. Nothing was deleted. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div class="auth">
      <form class="auth-inner" onSubmit={submit}>
        <div class="flame-big setup-emoji" aria-hidden="true">
          📱
        </div>
        <h1 class="onb-title" style="text-align:center">
          Your goals now live on your phone
        </h1>
        <p class="onb-sub" style="text-align:center">
          Keep It Lit now keeps your goals, check-ins, notes and awards only on this phone. Your account keeps just each goal’s streak, so
          reminders stay smart.
        </p>
        <div class="group" style="margin-bottom:18px">
          <div class="item">
            <span style="font-size:22px" aria-hidden="true">
              ✅
            </span>
            <div class="item-main">
              <div class="item-label">Copied to this phone</div>
              <div class="item-sub">
                {plural(goalCount, 'goal')} · {plural(checkCount, 'check-in')}
              </div>
            </div>
          </div>
        </div>

        <Segmented
          label="Backup"
          options={[
            ['backup', 'Encrypted backup'],
            ['local', 'This phone only'],
          ]}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError('');
          }}
        />
        {mode === 'backup' ? (
          <div style="margin-top:16px">
            <p class="form-note">
              Pick a passphrase. Your data is locked with it on this phone before it’s uploaded, so only you can open it. You’ll need it on a
              new phone.
            </p>
            <NewPassphrase pass={pass} again={again} onPass={setPass} onAgain={setAgain} />
            <p class="form-note">Write it down somewhere safe. Nobody can reset it, not even us. Your streaks can come back without it.</p>
          </div>
        ) : (
          <p class="form-note" style="margin-top:16px">
            Without a backup, losing this phone or deleting the app means losing your history. Your streaks can still come back. You can turn
            the backup on later in Settings.
          </p>
        )}
        {error && <p class="form-error">{error}</p>}
        <button class="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : mode === 'backup' ? 'Turn on backup' : 'Keep it on this phone'}
        </button>
      </form>
    </div>
  );
}

function Restore() {
  const info = restoreInfo.value || { backup: null, streaks: [] };
  const rows = info.streaks || [];
  const hasLocal = allGoals.value.length > 0;
  const [pass, setPass] = useState('');
  const [withStreaks, setWithStreaks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const restore = async (e) => {
    e.preventDefault();
    if (!pass) return setError('Enter your backup passphrase.');
    setBusy(true);
    setError('');
    try {
      const r = await restoreFromBackup(pass);
      showToast(`🔓 Welcome back! ${plural(r?.goals || 0, 'goal')} restored`);
    } catch (err) {
      setError(err.message || 'Couldn’t restore right now. Check your connection and try again.');
      setBusy(false);
    }
  };

  const fresh = () => {
    const keep = !hasLocal && withStreaks && rows.length > 0;
    startFresh({ withStreaks: keep });
    showToast(keep ? `🔥 ${plural(rows.length, 'streak')} brought back` : 'All set');
  };

  return (
    <div class="auth">
      <div class="auth-inner">
        <Logo />
        <h1>Welcome back</h1>
        <p class="tagline">{info.backup ? 'Your encrypted backup is ready.' : 'Your streaks are saved in your account.'}</p>

        {info.backup && (
          <form onSubmit={restore}>
            <div class="group" style="margin-bottom:14px">
              <div class="item">
                <span style="font-size:22px" aria-hidden="true">
                  🔐
                </span>
                <div class="item-main">
                  <div class="item-label">Encrypted backup</div>
                  <div class="item-sub">
                    Saved {formatWhen(info.backup.updated_at)}
                    {info.backup.bytes ? ` · ${sizeLabel(info.backup.bytes)}` : ''}
                  </div>
                </div>
              </div>
            </div>
            <label class="field">
              <span class="label">Backup passphrase</span>
              <SecretInput label="Backup passphrase" value={pass} onInput={setPass} />
            </label>
            {error && <p class="form-error">{error}</p>}
            <button class="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Unlocking…' : 'Restore everything'}
            </button>
            <div class="or-divider">
              <span>or</span>
            </div>
          </form>
        )}

        {hasLocal ? (
          <>
            <p class="form-note">This phone already has {plural(allGoals.value.length, 'goal')}.</p>
            <button class={`btn ${info.backup ? 'btn-secondary' : 'btn-primary'} btn-block`} onClick={fresh}>
              Keep what’s on this phone
            </button>
          </>
        ) : (
          <>
            {rows.length > 0 && (
              <div class="group" style="margin-bottom:14px">
                <div class="item">
                  <span style="font-size:22px" aria-hidden="true">
                    🔥
                  </span>
                  <div class="item-main">
                    <div class="item-label">Bring back my streaks</div>
                    <div class="item-sub">{rows.map((r) => `${r.emoji} ${r.current}${r.unit === 'week' ? 'w' : ''}`).join('  ')}</div>
                  </div>
                  <Switch label="Bring back my streaks" on={withStreaks} onChange={setWithStreaks} />
                </div>
              </div>
            )}
            <button class={`btn ${info.backup ? 'btn-secondary' : 'btn-primary'} btn-block`} onClick={fresh}>
              {info.backup ? 'Start fresh instead' : withStreaks && rows.length ? `Continue with ${plural(rows.length, 'goal')}` : 'Start fresh'}
            </button>
            {info.backup && (
              <p class="form-note" style="text-align:center;margin-top:12px">
                Forgot the passphrase? Start fresh. Your streaks can still come back.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
