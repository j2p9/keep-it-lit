import { addDays, formatDay, startOfWeek, weekdayLetters } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { daySummary } from '../lib/stats.js';
import { allGoals, lookup, settings, today } from '../lib/store.js';
import { Ring } from './Ring.jsx';
import { IconBack, IconNext } from './icons.jsx';

/** The week around the day Today shows. Tap a day to open it; ‹ › move a week. */
export function DayStrip({ day, onPick }) {
  const t = today.value;
  const ws = settings.value.weekStart;
  const start = startOfWeek(day, ws);
  const letters = weekdayLetters(ws);
  const list = allGoals.value;
  const lk = lookup.value;
  const pick = (d) => {
    tick();
    onPick(d > t ? t : d);
  };
  return (
    <div class="day-strip" role="group" aria-label="Pick a day">
      <button class="ds-arrow" aria-label="Previous week" onClick={() => pick(addDays(day, -7))}>
        <IconBack size={18} />
      </button>
      <div class="ds-days" key={start}>
        {letters.map((letter, i) => {
          const d = addDays(start, i);
          const future = d > t;
          const s = future ? null : daySummary(list, lk, d);
          const label = formatDay(d, { weekday: 'long', month: 'short', day: 'numeric' });
          return (
            <button
              key={d}
              class={`ds-day${d === day ? ' on' : ''}${d === t ? ' today' : ''}`}
              disabled={future}
              aria-pressed={d === day}
              aria-label={s?.due ? `${label}: ${s.done} of ${s.due} done` : label}
              onClick={() => pick(d)}
            >
              <span class="wd">{letter}</span>
              <Ring size={36} stroke={3.5} value={s?.due ? s.fill : 0} color={s?.perfect ? 'url(#kil-flame)' : 'var(--accent)'}>
                <span class="n">{Number(d.slice(8))}</span>
              </Ring>
            </button>
          );
        })}
      </div>
      <button class="ds-arrow" aria-label="Next week" disabled={addDays(start, 7) > t} onClick={() => pick(addDays(day, 7))}>
        <IconNext size={18} />
      </button>
    </div>
  );
}
