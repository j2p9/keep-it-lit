import { useState } from 'preact/hooks';
import {
  budgetDay,
  CURRENCIES,
  currencySymbol,
  daysIn,
  formatMoney,
  fromMinor,
  guessCurrency,
  lastDayFor,
  lastEnded,
  onBudgetStreak,
  parseAmount,
  periodLeftover,
  periodOn,
  sameDayNextMonth,
  toMinor,
} from '../lib/budget.js';
import { addDays, daysBetween, formatDay } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { addSpend, budget, endBudget, removeSpend, restoreSpend, setBudgetPeriod, today } from '../lib/store.js';
import { openOverlay, showToast } from '../lib/ui.js';
import { daysLeftLabel } from '../components/BudgetCard.jsx';
import { Segmented, Switch } from '../components/controls.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { IconX } from '../components/icons.jsx';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dayName = (day, t) => (day === t ? 'today' : formatDay(day, { weekday: 'long' }));

/** Logs one purchase: an amount and, if you like, what it was for. */
export function SpendSheet({ day, onClose }) {
  const t = today.value;
  const b = budget.value;
  const cur = b.currency || 'USD';
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const info = budgetDay(b, day);

  const add = (e) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!(value > 0)) return setError('Type how much you spent.');
    const minor = toMinor(value);
    tick();
    addSpend(day, minor, note.trim());
    const after = budgetDay(budget.peek(), day);
    const left = after ? Math.round(after.left) : 0;
    showToast(
      `💰 ${formatMoney(minor, cur)} logged · ${left < 0 ? `${formatMoney(-left, cur)} over` : `${formatMoney(left, cur)} left`} ${dayName(day, t)}`,
      { duration: 3200 },
    );
    onClose();
  };

  return (
    <Sheet onClose={onClose} title={day === t ? 'Spent today' : `Spent on ${formatDay(day, { weekday: 'long' })}`}>
      <form onSubmit={add}>
        <label class="money-input">
          <span class="cur" aria-hidden="true">
            {currencySymbol(cur)}
          </span>
          <input
            inputMode="decimal"
            aria-label="Amount spent"
            placeholder="0"
            autoFocus
            value={amount}
            onInput={(e) => {
              setAmount(e.currentTarget.value);
              setError('');
            }}
          />
        </label>
        <input class="input" style="margin:12px 0" maxLength={40} placeholder="What for? (optional)" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        {error && <p class="form-error">{error}</p>}
        <button class="btn btn-primary btn-block">Add</button>
      </form>
      {info && (
        <p class="form-note" style="margin-top:12px;text-align:center">
          {Math.round(info.left) < 0
            ? `Already ${formatMoney(-Math.round(info.left), cur)} over ${dayName(day, t)}.`
            : `${formatMoney(Math.round(info.left), cur)} left ${dayName(day, t)}.`}
        </p>
      )}
    </Sheet>
  );
}

/** A day of the budget: its numbers, the purchases (tap ✕ to remove), and the period so far. */
export function BudgetSheet({ day, onClose }) {
  const t = today.value;
  const b = budget.value;
  const cur = b.currency || 'USD';
  const money = (m) => formatMoney(Math.round(m), cur);
  const info = budgetDay(b, day);
  if (!info) {
    return (
      <Sheet onClose={onClose} title="Daily budget">
        <p class="form-note">No budget covered {formatDay(day)}.</p>
        <button
          class="btn btn-primary btn-block"
          onClick={() => {
            onClose();
            openOverlay('budgetSetup', {});
          }}
        >
          Set up a budget
        </button>
      </Sheet>
    );
  }
  const p = info.period;
  const spends = b.spends[day] || [];
  const streak = onBudgetStreak(b, t);
  const left = Math.round(info.left);
  const remove = (s) => {
    tick();
    const gone = removeSpend(day, s.id);
    showToast(`Removed ${money(s.amount)}`, { action: { label: 'Undo', fn: () => restoreSpend(day, gone) }, duration: 3500 });
  };
  const time = (iso) => (iso ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '');

  return (
    <Sheet
      onClose={onClose}
      title={day === t ? 'Budget today' : formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' })}
      sub={`${money(info.daily)} a day · until ${formatDay(p.until, { month: 'short', day: 'numeric' })}`}
    >
      <div class="stat-row money-stats">
        <div class="stat">
          <div class="v">{money(info.todayBudget)}</div>
          <div class="k">{day === t ? 'Budget today' : 'Budget'}</div>
        </div>
        <div class="stat">
          <div class="v">{money(info.spent)}</div>
          <div class="k">Spent</div>
        </div>
        <div class={`stat${left < 0 ? ' over' : ''}`}>
          <div class="v">{money(Math.abs(left))}</div>
          <div class="k">{left < 0 ? 'Over' : 'Left'}</div>
        </div>
      </div>
      {Math.round(info.carried) !== 0 && (
        <p class="form-note" style="margin-top:10px">
          {Math.round(info.carried) > 0
            ? `Includes ${money(info.carried)} you didn’t spend on earlier days.`
            : `${money(-info.carried)} less, from spending more than the daily amount earlier.`}
        </p>
      )}

      <h3 class="section-title">Purchases</h3>
      <div class="group">
        {spends.length === 0 && (
          <div class="item">
            <div class="item-main item-sub">Nothing logged {day === t ? 'yet today' : 'that day'}.</div>
          </div>
        )}
        {spends.map((s) => (
          <div key={s.id} class="item">
            <div class="item-main">
              <div class="item-label">{s.note || 'Spent'}</div>
              {s.at && <div class="item-sub">{time(s.at)}</div>}
            </div>
            <span class="item-value">{money(s.amount)}</span>
            <button class="icon-btn" style="width:32px;height:32px" aria-label={`Remove ${money(s.amount)}`} onClick={() => remove(s)}>
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        class="btn btn-primary btn-block"
        style="margin-top:12px"
        onClick={() => {
          onClose();
          openOverlay('spend', { day });
        }}
      >
        + Add a purchase
      </button>

      <h3 class="section-title">{p.mode === 'payday' ? 'Until payday' : 'This month'}</h3>
      <div class="stat-row money-stats">
        <div class="stat">
          <div class="v">{money(info.periodSpent)}</div>
          <div class="k">Spent so far</div>
        </div>
        <div class="stat">
          <div class="v">{money(info.periodLeft)}</div>
          <div class="k">Left of {money(p.amount)}</div>
        </div>
        <div class="stat">
          <div class="v">{info.daysLeft}</div>
          <div class="k">{info.daysLeft === 1 ? 'Day left' : 'Days left'}</div>
        </div>
      </div>
      <p class="form-note" style="margin-top:10px">
        {streak > 0 ? `🔥 ${plural(streak, 'day')} in a row on budget. ` : ''}What you don’t spend carries over to the next day; spending more comes off it.
      </p>
      <button
        class="btn btn-secondary btn-block"
        onClick={() => {
          onClose();
          openOverlay('budgetSetup', {});
        }}
      >
        Edit budget
      </button>
    </Sheet>
  );
}

/**
 * Sets the money and how long it has to last. While a budget is running this edits it (its
 * daily amount is recalculated from its start); `fresh` starts a new one from today.
 */
export function BudgetSetup({ fresh = false, onClose }) {
  const t = today.value;
  const b = budget.value;
  const running = fresh ? null : periodOn(b, t);
  const last = lastEnded(b, t);
  const [startNew, setStartNew] = useState(false);
  const editing = Boolean(running) && !startNew;
  // Leftover offered to a new period: from the last period, or the running one when starting over early.
  const carrySource = running && startNew ? running : !running ? last : null;
  const leftover = carrySource ? (startNew ? Math.round(budgetDay(b, addDays(t, -1))?.periodLeft ?? periodLeftover(b, carrySource)) : periodLeftover(b, carrySource)) : 0;
  const [amount, setAmount] = useState(editing ? String(fromMinor(running.amount - (running.leftoverIn || 0))) : '');
  const [mode, setMode] = useState(running?.mode || last?.mode || 'payday');
  const [payday, setPayday] = useState(running?.payday || (last?.payday ? sameDayNextMonth(last.payday) : sameDayNextMonth(t)));
  const [currency, setCurrency] = useState(b.currency || guessCurrency());
  const [withLeftover, setWithLeftover] = useState(true);
  const [error, setError] = useState('');

  const start = editing ? running.start : t;
  const until = lastDayFor({ mode, payday }, start);
  const days = daysBetween(start, until) + 1;
  const value = parseAmount(amount);
  const extra = !editing && carrySource && withLeftover ? leftover : 0;
  const total = (value > 0 ? toMinor(value) : 0) + extra + (editing ? running.leftoverIn || 0 : 0);
  const valid = days >= 1 && total > 0 && (mode !== 'payday' || payday > start);

  const save = (e) => {
    e.preventDefault();
    if (!(value >= 0) || amount === '') return setError('Type how much money you have.');
    if (mode === 'payday' && !(payday > start)) return setError('Payday has to be after the day the budget starts.');
    if (!valid) return setError('Type how much money you have.');
    tick();
    setBudgetPeriod({ amount: toMinor(value), leftover: extra, mode, payday, currency, startNew });
    const info = budgetDay(budget.peek(), t);
    showToast(info ? `💰 ${formatMoney(Math.round(info.daily), currency)} a day · ${daysLeftLabel(info).toLowerCase()}` : '💰 Budget saved');
    onClose();
  };

  const stop = () => {
    if (!confirm('Stop counting your budget? What you logged so far is kept.')) return;
    endBudget();
    showToast('Budget turned off');
    onClose();
  };

  return (
    <Sheet onClose={onClose} title={editing ? 'Edit budget' : 'Daily budget'} sub={editing ? null : 'Split your money into an amount per day. What you don’t spend carries over.'}>
      <form onSubmit={save}>
        <span class="label">{editing ? 'Money for this budget' : 'How much money do you have?'}</span>
        <div class="money-row">
          <label class="money-input">
            <span class="cur" aria-hidden="true">
              {currencySymbol(currency)}
            </span>
            <input
              inputMode="decimal"
              aria-label="Money"
              placeholder="0"
              value={amount}
              onInput={(e) => {
                setAmount(e.currentTarget.value);
                setError('');
              }}
            />
          </label>
          <select class="time-input" aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.currentTarget.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {!editing && carrySource && leftover !== 0 && (
          <div class="group" style="margin-top:12px">
            <div class="item">
              <div class="item-main">
                <div class="item-label">{leftover > 0 ? `Add ${formatMoney(leftover, currency)} left over` : `Take off ${formatMoney(-leftover, currency)} overspent`}</div>
                <div class="item-sub">From your last budget</div>
              </div>
              <Switch label="Include last budget" on={withLeftover} onChange={setWithLeftover} />
            </div>
          </div>
        )}

        <span class="label" style="margin-top:18px">It has to last until</span>
        <Segmented
          label="Until"
          options={[
            ['payday', 'Payday'],
            ['month', 'End of month'],
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'payday' && (
          <label class="field" style="margin-top:12px">
            <span class="label">Next payday</span>
            <input class="input" type="date" min={addDays(start, 1)} value={payday} onInput={(e) => e.currentTarget.value && setPayday(e.currentTarget.value)} />
          </label>
        )}

        <div class="budget-preview" aria-live="polite">
          {valid ? (
            <>
              That’s <b>{formatMoney(Math.round(total / days), currency)} a day</b> for {plural(days, 'day')}
              {mode === 'payday' ? `, through ${formatDay(until, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}.
            </>
          ) : (
            'Type an amount to see your daily budget.'
          )}
        </div>
        {error && <p class="form-error">{error}</p>}
        <button class="btn btn-primary btn-block" disabled={!valid}>
          {editing ? 'Save changes' : 'Start budget'}
        </button>
      </form>

      {running && !startNew && (
        <div class="stack" style="margin-top:14px">
          <button
            class="btn btn-ghost btn-block"
            onClick={() => {
              setStartNew(true);
              setAmount('');
              if (mode === 'payday') setPayday(sameDayNextMonth(payday > t ? payday : t));
            }}
          >
            Got paid early? Start a new budget from today
          </button>
          <button class="btn btn-danger btn-block" onClick={stop}>
            Turn off budget
          </button>
        </div>
      )}
      {editing && (
        <p class="form-note" style="margin-top:12px">
          This budget started {formatDay(running.start, { month: 'short', day: 'numeric' })} ({plural(daysIn(running), 'day')}). Changes apply to all of it, so the
          daily amount is worked out again from that day.
        </p>
      )}
    </Sheet>
  );
}
