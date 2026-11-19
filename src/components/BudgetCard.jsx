import { budgetDay, formatMoney, lastEnded, periodLeftover } from '../lib/budget.js';
import { formatDay } from '../lib/dates.js';
import { budget, today } from '../lib/store.js';
import { openOverlay, setUi, uiState } from '../lib/ui.js';
import { IconX } from './icons.jsx';

/** "7 days to payday", "12 days left this month". */
export function daysLeftLabel(info) {
  const n = info.daysLeft;
  if (info.period.mode === 'payday') return n === 1 ? 'Payday tomorrow' : `${n} days to payday`;
  return n === 1 ? 'Last day of the month' : `${n} days left this month`;
}

/** What's left to spend on a day, with a quick way to log a purchase. */
export function BudgetCard({ day }) {
  const b = budget.value;
  const t = today.value;
  const cur = b.currency || 'USD';
  const money = (m) => formatMoney(m, cur);
  const info = budgetDay(b, day);

  if (!info) {
    if (day !== t || b.off) return null;
    if (!b.periods.length) return uiState.value.budgetDismissed ? null : <BudgetNudge />;
    // The period is over: payday (or a new month).
    const last = lastEnded(b, t);
    const leftover = last ? periodLeftover(b, last) : 0;
    return (
      <section class="card budget-card" aria-label="Daily budget">
        <div class="card-title">
          <span aria-hidden="true">💰</span>
          {last?.mode === 'payday' ? 'Payday 🎉' : 'New month 🎉'}
        </div>
        <p class="muted" style="font-size:15px;line-height:1.4">
          {last
            ? `Your last budget ended ${leftover >= 0 ? `with ${money(leftover)} left` : `${money(-leftover)} over`}. Set up the new one to keep counting.`
            : 'Set up your budget to keep counting.'}
        </p>
        <button class="btn btn-primary btn-small" style="align-self:flex-start;margin-top:12px" onClick={() => openOverlay('budgetSetup', { fresh: true })}>
          Set up the new budget
        </button>
      </section>
    );
  }

  const left = Math.round(info.left);
  const over = left < 0;
  const used = info.todayBudget > 0 ? Math.min(1, info.spent / info.todayBudget) : info.spent > 0 ? 1 : 0;
  const carried = Math.round(info.carried);
  return (
    <section class={`card budget-card${over ? ' over' : ''}`} aria-label="Daily budget">
      <button class="budget-main" onClick={() => openOverlay('budget', { day })} aria-label={`${over ? `${money(-left)} over` : `${money(left)} left`} ${day === t ? 'today' : `on ${formatDay(day)}`}. Open budget.`}>
        <div class="card-title">
          <span aria-hidden="true">💰</span>
          {day === t ? 'Budget today' : 'Budget that day'}
          <span class="aside">{daysLeftLabel(info)}</span>
        </div>
        <div class="budget-left" key={left}>
          {over ? `${money(-left)} over` : `${money(left)} left`}
        </div>
        <div class="budget-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(used * 100)}%` }} />
        </div>
      </button>
      <div class="budget-foot">
        <span class="budget-sub">
          {money(info.daily)} a day
          {carried !== 0 ? ` ${carried > 0 ? '+' : '−'} ${money(Math.abs(carried))} ${carried > 0 ? 'carried over' : 'overspent'}` : ''}
          {info.spent ? ` · spent ${money(info.spent)}` : ''}
        </span>
        <button class="btn btn-secondary btn-small" onClick={() => openOverlay('spend', { day })}>
          + Spent
        </button>
      </div>
    </section>
  );
}

/** For anyone who hasn't set a budget yet: one tap to start, or dismiss for good. */
function BudgetNudge() {
  return (
    <div class="banner" role="note" style="margin-top:22px">
      <span style="font-size:24px" aria-hidden="true">
        💰
      </span>
      <div>
        <b>Daily budget</b>
        Split your money until payday into an amount per day. What you don’t spend carries over.
      </div>
      <button class="btn btn-primary btn-small" onClick={() => openOverlay('budgetSetup', {})}>
        Set up
      </button>
      <button class="close" aria-label="Dismiss" onClick={() => setUi({ budgetDismissed: true })}>
        <IconX size={18} />
      </button>
    </div>
  );
}
