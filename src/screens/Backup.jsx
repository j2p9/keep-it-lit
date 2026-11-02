import { useEffect, useState } from 'preact/hooks';
import { formatWhen } from '../lib/dates.js';
import { backupNow, backupState, disableBackup, enableBackup, fetchBackupInfo, restoreFromBackup } from '../lib/store.js';
import { showToast } from '../lib/ui.js';
import { Sheet } from '../components/Sheet.jsx';
import { SecretInput } from '../components/controls.jsx';
import { NewPassphrase, passphraseProblem, sizeLabel } from './Setup.jsx';

/** Encrypted backup: turn it on, back up now, change the passphrase, restore, or turn it off. */
export function BackupSheet({ onClose }) {
  const st = backupState.value;
  // undefined while loading, null when there's no backup in the account.
  const [cloudInfo, setCloudInfo] = useState(undefined);
  const [mode, setMode] = useState(null); // 'new' | 'restore'
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBackupInfo().then(setCloudInfo, () => setCloudInfo(null));
  }, [st.at]);

  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setMode(null);
      setPass('');
      setAgain('');
      if (done) showToast(done);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  const submitNew = (e) => {
    e.preventDefault();
    const problem = passphraseProblem(pass, again);
    if (problem) return setError(problem);
    run(() => enableBackup(pass), st.on ? '🔐 New passphrase saved' : '🔐 Backup is on');
  };

  const submitRestore = (e) => {
    e.preventDefault();
    if (!pass) return setError('Enter the backup’s passphrase.');
    run(async () => {
      const r = await restoreFromBackup(pass);
      showToast(`🔓 Restored ${r?.goals ?? 0} goals`);
    });
  };

  const turnOff = () => {
    if (!confirm('Turn off the backup and delete it from your account? Your data stays on this phone.')) return;
    run(disableBackup, 'Backup turned off');
  };

  let body;
  if (mode === 'new') {
    body = (
      <form onSubmit={submitNew}>
        <p class="form-note">
          {st.on ? 'Pick a new passphrase. The backup is saved again, locked with it.' : 'Your data is locked with this passphrase on this phone before it’s uploaded. Only you can open it.'}
        </p>
        <NewPassphrase pass={pass} again={again} onPass={setPass} onAgain={setAgain} />
        <p class="form-note">Write it down. Nobody can reset it, not even us.</p>
        {error && <p class="form-error">{error}</p>}
        <button class="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : st.on ? 'Save new passphrase' : 'Turn on backup'}
        </button>
        <button type="button" class="btn btn-ghost btn-block" onClick={() => setMode(null)}>
          Cancel
        </button>
      </form>
    );
  } else if (mode === 'restore') {
    body = (
      <form onSubmit={submitRestore}>
        <p class="form-note">The backup’s goals and history are added to what’s on this phone.</p>
        <label class="field">
          <span class="label">Backup passphrase</span>
          <SecretInput label="Backup passphrase" value={pass} onInput={setPass} />
        </label>
        {error && <p class="form-error">{error}</p>}
        <button class="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Unlocking…' : 'Restore'}
        </button>
        <button type="button" class="btn btn-ghost btn-block" onClick={() => setMode(null)}>
          Cancel
        </button>
      </form>
    );
  } else if (st.on) {
    body = (
      <>
        <div class="group" style="margin-bottom:14px">
          <div class="item">
            <span style="font-size:22px" aria-hidden="true">
              ✅
            </span>
            <div class="item-main">
              <div class="item-label">Backup is on</div>
              <div class="item-sub">
                {st.busy ? 'Saving now…' : st.at ? `Last saved ${formatWhen(st.at)}` : 'Not saved yet'}
                {cloudInfo?.bytes ? ` · ${sizeLabel(cloudInfo.bytes)}` : ''}
              </div>
            </div>
          </div>
        </div>
        {(error || st.error) && <p class="form-error">{error || st.error}</p>}
        <div class="stack">
          <button class="btn btn-secondary btn-block" disabled={busy || st.busy} onClick={() => run(backupNow, '🔐 Backed up')}>
            Back up now
          </button>
          <button class="btn btn-secondary btn-block" onClick={() => setMode('new')}>
            Change passphrase
          </button>
          <button class="btn btn-danger btn-block" disabled={busy} onClick={turnOff}>
            Turn off backup
          </button>
        </div>
        <p class="form-note" style="margin-top:14px">
          It saves itself a couple of minutes after each change and when you leave the app.
        </p>
      </>
    );
  } else {
    body = (
      <>
        {cloudInfo && (
          <div class="group" style="margin-bottom:14px">
            <div class="item">
              <span style="font-size:22px" aria-hidden="true">
                🔐
              </span>
              <div class="item-main">
                <div class="item-label">A backup is in your account</div>
                <div class="item-sub">
                  Saved {formatWhen(cloudInfo.updated_at)}
                  {cloudInfo.bytes ? ` · ${sizeLabel(cloudInfo.bytes)}` : ''}
                </div>
              </div>
              <button class="btn btn-secondary btn-small" onClick={() => setMode('restore')}>
                Restore
              </button>
            </div>
          </div>
        )}
        <p class="form-note">
          Your goals and history are only on this phone. Turn on the backup so a new phone can bring them back. It’s encrypted with your
          passphrase before it leaves the phone.
        </p>
        <button class="btn btn-primary btn-block" disabled={cloudInfo === undefined} onClick={() => setMode('new')}>
          {cloudInfo ? 'Replace it with a new backup' : 'Turn on backup'}
        </button>
      </>
    );
  }

  return (
    <Sheet onClose={onClose} title="Encrypted backup">
      {body}
    </Sheet>
  );
}
