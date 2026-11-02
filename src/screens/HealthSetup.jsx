import { useEffect, useState } from 'preact/hooks';
import { formatWhen } from '../lib/dates.js';
import { HEALTH_URL } from '../lib/health.js';
import { METRIC } from '../lib/healthMetrics.js';
import { isIOS } from '../lib/platform.js';
import { connectHealth, currentGoals, disconnectHealth, healthStatus, pullHealth, savedHealthKey, settings } from '../lib/store.js';
import { openOverlay, showToast } from '../lib/ui.js';
import { Page } from '../components/Sheet.jsx';
import { CopyBox } from '../components/controls.jsx';
import { runShortcut, SHORTCUT_NAME } from '../components/HealthCard.jsx';
import { IconNext } from '../components/icons.jsx';

/** Apple Health: the Shortcut's key and address, a step-by-step guide, and the linked goals. */
export function HealthSetup({ onClose }) {
  const connected = settings.value.health;
  const [key, setKey] = useState(() => savedHealthKey());
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const linked = currentGoals.value.filter((g) => g.health?.metric);

  const load = () => healthStatus().then(setStatus, () => {});
  useEffect(() => {
    load();
  }, []);

  const connect = async () => {
    if ((key || connected) && !confirm('Make a new key? The old one stops working, so you’ll paste the new one into your Shortcut.')) return;
    setBusy(true);
    try {
      setKey(await connectHealth());
      load();
      showToast('🔑 Key ready. Copy it into your Shortcut.');
    } catch {
      showToast('Couldn’t make a key. Check your connection and try again.');
    }
    setBusy(false);
  };

  const check = async () => {
    setBusy(true);
    const n = await pullHealth({ force: true });
    setBusy(false);
    load();
    if (n) showToast(`❤️ Got Health numbers for ${n === 1 ? '1 day' : `${n} days`}`);
    else if (n === 0) showToast('Nothing new yet. Run the Shortcut, then check again.');
    else showToast('Couldn’t check right now. Make a key first, and check your connection.');
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Apple Health? Your Shortcut’s key stops working. Numbers already on this phone are kept.')) return;
    try {
      await disconnectHealth();
      setKey(null);
      setStatus(null);
      showToast('Apple Health disconnected');
    } catch {
      showToast('Couldn’t disconnect right now. Please try again.');
    }
  };

  return (
    <Page title="Apple Health" onBack={onClose}>
      <div class="card" style="margin-bottom:18px">
        <div class="card-title">
          <span aria-hidden="true">❤️</span>Let Health check off your goals
        </div>
        <p class="muted" style="font-size:15px;line-height:1.45">
          Web apps can’t read Apple Health directly, so a Shortcut on your iPhone sends today’s numbers (steps, exercise, sleep and more) a few
          times a day. Goals linked to Health fill in and check themselves off. The numbers are deleted from the server as soon as this phone
          picks them up.
        </p>
      </div>

      <h2 class="group-title">Your Shortcut key</h2>
      <div class="group">
        <div class="item">
          <span style="font-size:22px" aria-hidden="true">
            {connected ? '🟢' : '⚪️'}
          </span>
          <div class="item-main">
            <div class="item-label">{connected ? 'Connected' : 'Not set up'}</div>
            <div class="item-sub">
              {status?.last_used_at ? `Last upload ${formatWhen(status.last_used_at)}` : connected ? 'Waiting for the first upload' : 'Make a key to start'}
            </div>
          </div>
          <button class={`btn ${connected ? 'btn-secondary' : 'btn-primary'} btn-small`} disabled={busy} onClick={connect}>
            {connected ? 'New key' : 'Make a key'}
          </button>
        </div>
      </div>
      {key ? (
        <div style="margin:12px 0 4px">
          <span class="label">Key</span>
          <CopyBox text={key} label="Key" />
          <span class="label" style="margin-top:12px">Upload address</span>
          <CopyBox text={HEALTH_URL} label="Upload address" />
          <p class="group-note" style="margin-top:8px">Keep the key private: anyone who has it can send numbers to your account.</p>
        </div>
      ) : (
        connected && <p class="group-note">This phone doesn’t have the key. Tap New key to get one, then paste it into your Shortcut.</p>
      )}

      <h2 class="group-title" style="margin-top:22px">1 · Build the Shortcut</h2>
      <ol class="guide">
        <li>
          Open the <b>Shortcuts</b> app, tap <b>+</b>, and name the shortcut <b>{SHORTCUT_NAME}</b>.
        </li>
        <li>
          Add <b>Find Health Samples</b>: Type <b>Steps</b>, Start Date <b>is today</b>, Group By <b>Day</b>. Grouping gives one total for the
          day.
        </li>
        <li>
          Repeat for each number you want: <b>Exercise Minutes</b>, <b>Active Energy</b>, <b>Mindful Minutes</b> and <b>Water</b> (unit mL).
          For workouts, add <b>Find Workouts</b> (Start Date is today), then <b>Count</b>.
        </li>
        <li>
          Sleep, if you track it: <b>Find Health Samples</b> with Type <b>Sleep</b>, Start Date <b>is in the last 1 day</b>, and filters Value{' '}
          <b>is not In Bed</b> and <b>is not Awake</b>. Then <b>Get Details of Health Samples</b> (Duration), <b>Calculate Statistics</b> (Sum)
          and <b>Convert Measurement</b> (to hours). Compare it once with the Health app.
        </li>
        <li>
          Add <b>Format Date</b>: Current Date, Custom format <code>yyyy-MM-dd</code>.
        </li>
        <li>
          Add <b>Get Contents of URL</b> with the upload address. Tap <b>Show More</b>: Method <b>POST</b>, a header <code>Authorization</code>{' '}
          with the value <code>Bearer</code>, a space and your key, and Request Body <b>JSON</b>.
        </li>
        <li>
          In the JSON add <code>date</code> (Text, the formatted date), then one Number field for each result: <code>steps</code>,{' '}
          <code>exercise</code>, <code>active</code>, <code>mindful</code>, <code>water</code>, <code>workouts</code>, <code>sleep</code>. Leave
          out the ones you don’t use.
        </li>
        <li>
          Tap ▶︎ to run it once and allow Health access. It should answer <code>"ok": true</code>.
        </li>
      </ol>

      <h2 class="group-title">2 · Run it automatically</h2>
      <ol class="guide">
        <li>
          In Shortcuts, open <b>Automation</b>, tap <b>+</b>, and pick <b>Time of Day</b>.
        </li>
        <li>
          Choose <b>2:45 PM</b>, <b>Daily</b> and <b>Run Immediately</b>, then pick <b>{SHORTCUT_NAME}</b>.
        </li>
        <li>
          Add the same for <b>8:45 PM</b> and <b>11:30 PM</b>, so your 3 PM and 9 PM reminders know what Health already counted.
        </li>
      </ol>

      <h2 class="group-title">3 · Link your goals</h2>
      <div class="group">
        {linked.length ? (
          linked.map((g) => (
            <button key={g.id} class="item" onClick={() => openOverlay('goalEditor', { goalId: g.id })}>
              <span style="font-size:22px" aria-hidden="true">
                {g.emoji}
              </span>
              <div class="item-main">
                <div class="item-label">{g.title}</div>
                <div class="item-sub">❤️ {METRIC[g.health.metric]?.label}</div>
              </div>
              <IconNext size={18} class="chev" />
            </button>
          ))
        ) : (
          <div class="item">
            <div class="item-main item-sub">Edit a goal and pick a number under “Fill in from Apple Health”. Walk, exercise, meditate and sleep goals work well.</div>
          </div>
        )}
      </div>

      <div class="stack" style="margin-top:18px">
        {isIOS() && (
          <button class="btn btn-secondary btn-block" onClick={runShortcut}>
            Run the Shortcut now
          </button>
        )}
        <button class="btn btn-secondary btn-block" disabled={busy || !connected} onClick={check}>
          Check for new numbers
        </button>
        {connected && (
          <button class="btn btn-danger btn-block" onClick={disconnect}>
            Disconnect Apple Health
          </button>
        )}
      </div>
      <p class="group-note" style="margin-top:12px">
        Only today’s totals are sent, never your Health history. Android can’t share Health data with web apps, so this is iPhone only.
      </p>
    </Page>
  );
}
