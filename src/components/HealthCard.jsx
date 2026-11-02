import { addDays, formatWhen } from '../lib/dates.js';
import { HEALTH_METRICS, metricNumber } from '../lib/healthMetrics.js';
import { isIOS } from '../lib/platform.js';
import { clock, expectHealth, health, settings } from '../lib/store.js';

export const SHORTCUT_NAME = 'Keep It Lit Health';
export const runShortcut = () => {
  expectHealth();
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
};

// Steps and workouts are their own unit; the rest show it next to the number.
const unitShown = (m) => (m.unit === 'steps' || m.unit === 'workouts' ? null : m.unit);

/** Today's Apple Health numbers (or the last day that has some, with `latest`). */
export function HealthCard({ day, latest = false, title }) {
  let shownDay = day;
  if (latest && !health.value[day]) shownDay = addDays(day, -1);
  const h = health.value[shownDay];
  if (!h && !settings.value.health) return null;
  if (latest && !h) return null;
  const metrics = HEALTH_METRICS.filter((m) => h?.[m.key] != null);
  const heading = title || (shownDay === day ? 'Health today' : 'Health yesterday');
  return (
    <section class="card health-card" aria-label={heading}>
      <div class="card-title">
        <span aria-hidden="true">❤️</span>
        {heading}
        {h?.at && <span class="aside">{formatWhen(h.at, clock.value)}</span>}
      </div>
      {metrics.length ? (
        <div class="stat-row">
          {metrics.map((m) => (
            <div key={m.key} class="stat">
              <div class="v">
                {metricNumber(m.key, h[m.key])}
                {unitShown(m) && <small>{unitShown(m)}</small>}
              </div>
              <div class="k">
                {m.emoji} {m.short}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p class="muted" style="font-size:15px;line-height:1.4">
          No numbers yet today. Your Shortcut sends them in the afternoon and evening.
        </p>
      )}
      {!latest && isIOS() && (
        <button class="link" style="margin-top:12px;font-size:15px" onClick={runShortcut}>
          Update from Apple Health now
        </button>
      )}
    </section>
  );
}
