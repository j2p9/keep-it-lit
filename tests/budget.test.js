import { describe, expect, it } from 'vitest';
import {
  budgetDay,
  formatMoney,
  guessCurrency,
  lastDayFor,
  lastEnded,
  onBudgetStreak,
  parseAmount,
  periodLeftover,
  sameDayNextMonth,
  toMinor,
} from '../src/lib/budget.js';

// SAR 1,200 for November: SAR 40 a day.
const november = { id: 'p1', start: '2026-11-01', until: '2026-11-30', amount: 120000, leftoverIn: 0, mode: 'month' };
const spend = (amount) => ({ id: String(amount), amount, note: '', at: '' });
const budget = (over = {}) => ({
  currency: 'SAR',
  periods: [november],
  spends: { '2026-11-01': [spend(3000)], '2026-11-02': [spend(4000), spend(2500)] },
  ...over,
});

describe('Daily budget', () => {
  it('splits the money into a fixed amount per day', () => {
    const b = budgetDay(budget(), '2026-11-01');
    expect(b.daily).toBe(4000);
    expect(b).toMatchObject({ todayBudget: 4000, spent: 3000, left: 1000, carried: 0, daysLeft: 30 });
  });

  it('carries what was not spent to the next day, and takes overspending off it', () => {
    const day2 = budgetDay(budget(), '2026-11-02');
    expect(day2).toMatchObject({ carried: 1000, todayBudget: 5000, spent: 6500, left: -1500 });
    const day3 = budgetDay(budget(), '2026-11-03');
    expect(day3).toMatchObject({ carried: -1500, todayBudget: 2500, spent: 0, left: 2500, periodSpent: 9500, periodLeft: 110500 });
  });

  it('covers up to the end of the month, or the day before payday', () => {
    expect(lastDayFor({ mode: 'month' }, '2026-11-19')).toBe('2026-11-30');
    expect(lastDayFor({ mode: 'payday', payday: '2026-11-27' }, '2026-11-19')).toBe('2026-11-26');
    expect(sameDayNextMonth('2026-11-27')).toBe('2026-12-27');
    expect(sameDayNextMonth('2026-01-31')).toBe('2026-02-28');
  });

  it('recalculates the daily amount from the start when the budget changes', () => {
    const b = budget({ periods: [{ ...november, amount: 150000 }] });
    expect(budgetDay(b, '2026-11-03')).toMatchObject({ daily: 5000, todayBudget: 5500 });
  });

  it('can bring last period’s leftover into the next one', () => {
    const b = budget();
    expect(periodLeftover(b, november)).toBe(110500);
    const next = { id: 'p2', start: '2026-12-01', until: '2026-12-31', amount: 124000 + 110500, leftoverIn: 110500, mode: 'month' };
    const both = budget({ periods: [november, next] });
    expect(lastEnded(both, '2026-12-05')).toBe(november);
    expect(budgetDay(both, '2026-12-01').daily).toBe((124000 + 110500) / 31);
    expect(budgetDay(both, '2026-10-31')).toBeNull();
  });

  it('counts days in a row on budget', () => {
    expect(onBudgetStreak(budget(), '2026-11-01')).toBe(1);
    expect(onBudgetStreak(budget(), '2026-11-02')).toBe(0); // over today
    expect(onBudgetStreak(budget(), '2026-11-03')).toBe(1);
    const steady = budget({ spends: { '2026-11-01': [spend(3000)], '2026-11-02': [spend(4000)] } });
    expect(onBudgetStreak(steady, '2026-11-03')).toBe(3);
  });

  it('keeps amounts exact to the fils and reads typed amounts', () => {
    expect(toMinor('0.1') + toMinor('0.2')).toBe(toMinor('0.3'));
    expect(toMinor('12.34')).toBe(12340);
    expect(toMinor('1.125')).toBe(1125);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount(' 40 ')).toBe(40);
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('-5')).toBeNaN();
  });

  it('guesses the currency and formats amounts', () => {
    expect(guessCurrency('Asia/Kuwait', [])).toBe('KWD');
    expect(guessCurrency('Asia/Riyadh', [])).toBe('SAR');
    expect(guessCurrency('Europe/Paris', [])).toBe('EUR');
    expect(guessCurrency('America/New_York', ['en-US'])).toBe('USD');
    // An unknown time zone falls back to the region in the language settings.
    expect(guessCurrency('UTC', ['en-KW'])).toBe('KWD');
    expect(formatMoney(40000, 'USD')).toMatch(/40(?![.,]\d)/);
    expect(formatMoney(12500, 'USD')).toMatch(/12[.,]50(?!\d)/);
    expect(formatMoney(1125, 'KWD')).toMatch(/1[.,]125/);
    expect(formatMoney(12500, 'KWD')).toMatch(/12[.,]500/);
    expect(formatMoney(12000, 'KWD')).toMatch(/12(?![.,]\d)/);
  });
});
