// Daily budget: money that has to last until payday (or the end of the month), split into a
// fixed amount per day. What isn't spent carries over to the next day, and overspending comes
// off it. Amounts are kept in thousandths of the currency (so the fils of a Kuwaiti dinar, and
// cents, are exact) and sums never drift.
import { addDays, daysBetween, daysInMonth, endOfMonth, fromKey, toKey } from './dates.js';

export const EMPTY_BUDGET = { currency: null, periods: [], spends: {}, off: false };

export const toMinor = (value) => Math.round(Number(value) * 1000);
export const fromMinor = (minor) => minor / 1000;

/** "12.50", "12,5", " 40 " → a number, or NaN. */
export function parseAmount(text) {
  const clean = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return /^\d*\.?\d+$|^\d+\.$/.test(clean) ? Number(clean) : NaN;
}

const CURRENCY_BY_ZONE = {
  'Asia/Riyadh': 'SAR',
  'Asia/Dubai': 'AED',
  'Asia/Kuwait': 'KWD',
  'Asia/Qatar': 'QAR',
  'Asia/Bahrain': 'BHD',
  'Asia/Muscat': 'OMR',
  'Asia/Amman': 'JOD',
  'Africa/Cairo': 'EGP',
  'Europe/London': 'GBP',
  'Europe/Istanbul': 'TRY',
  'Asia/Kolkata': 'INR',
  'Asia/Karachi': 'PKR',
  'Asia/Tokyo': 'JPY',
  'Australia/Sydney': 'AUD',
  'Australia/Melbourne': 'AUD',
  'America/Toronto': 'CAD',
  'America/Vancouver': 'CAD',
};
export const CURRENCIES = ['KWD', 'SAR', 'AED', 'QAR', 'BHD', 'OMR', 'JOD', 'EGP', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'PKR', 'TRY', 'JPY'];

const CURRENCY_BY_REGION = {
  KW: 'KWD',
  SA: 'SAR',
  AE: 'AED',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
  JO: 'JOD',
  EG: 'EGP',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  IN: 'INR',
  PK: 'PKR',
  TR: 'TRY',
  JP: 'JPY',
};

/** A sensible currency for this phone: its time zone first, then the region in its language settings. */
export function guessCurrency(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, languages = globalThis.navigator?.languages || []) {
  if (CURRENCY_BY_ZONE[timeZone]) return CURRENCY_BY_ZONE[timeZone];
  for (const tag of languages) {
    const region = tag.split('-')[1]?.toUpperCase();
    if (CURRENCY_BY_REGION[region]) return CURRENCY_BY_REGION[region];
  }
  if (timeZone?.startsWith('Europe/')) return 'EUR';
  return 'USD';
}

/** How many decimals a currency uses: 3 for KWD, 2 for SAR, 0 for JPY. */
function decimalsOf(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

/** "KWD 12.500", "SAR 40", "$12.50". Whole amounts drop the decimals. */
export function formatMoney(minor, currency = 'USD') {
  const digits = decimalsOf(currency);
  const value = Math.round(Number(minor) / 10 ** (3 - Math.min(3, digits))) / 10 ** Math.min(3, digits);
  const whole = Number.isInteger(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : digits,
      maximumFractionDigits: whole ? 0 : digits,
    }).format(value);
  } catch {
    return `${currency} ${whole ? value : value.toFixed(digits)}`;
  }
}

/** The symbol or code shown before an amount: "$", "SAR". */
export function currencySymbol(currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

/** The last day the money covers: the end of the month, or the day before payday. */
export function lastDayFor({ mode, payday }, start) {
  return mode === 'payday' && payday ? addDays(payday, -1) : endOfMonth(start);
}

/** The same day of the month, one month on (clamped, so Jan 31 → Feb 28). */
export function sameDayNextMonth(key) {
  const d = fromKey(key);
  const next = toKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  return `${next.slice(0, 8)}${String(Math.min(d.getDate(), daysInMonth(next))).padStart(2, '0')}`;
}

export const daysIn = (p) => daysBetween(p.start, p.until) + 1;

/** The budget period covering `day` (the latest one, if they ever overlap). */
export function periodOn(budget, day) {
  let found = null;
  for (const p of budget?.periods || []) if (p.start <= day && day <= p.until && (!found || p.start > found.start)) found = p;
  return found;
}

export const spentOn = (budget, day) => (budget?.spends?.[day] || []).reduce((sum, s) => sum + s.amount, 0);

function spentBetween(budget, from, to) {
  let sum = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) sum += spentOn(budget, d);
  return sum;
}

/**
 * One day of the budget: the fixed daily amount, what carried over from earlier days of the
 * period (negative after overspending), the day's budget, what was spent and what's left, plus
 * the period's totals through that day. null when no period covers the day.
 */
export function budgetDay(budget, day) {
  const period = periodOn(budget, day);
  if (!period) return null;
  const daily = period.amount / daysIn(period);
  const spentBefore = spentBetween(budget, period.start, addDays(day, -1));
  const todayBudget = daily * (daysBetween(period.start, day) + 1) - spentBefore;
  const spent = spentOn(budget, day);
  return {
    period,
    daily,
    carried: todayBudget - daily,
    todayBudget,
    spent,
    left: todayBudget - spent,
    daysLeft: daysBetween(day, period.until) + 1,
    periodSpent: spentBefore + spent,
    periodLeft: period.amount - spentBefore - spent,
  };
}

/** What a finished (or running) period has left over in total; negative when overspent. */
export const periodLeftover = (budget, period) => period.amount - spentBetween(budget, period.start, period.until);

/** The period that ended most recently before `day`. */
export function lastEnded(budget, day) {
  let found = null;
  for (const p of budget?.periods || []) if (p.until < day && (!found || p.until > found.until)) found = p;
  return found;
}

/** Days in a row, up to today, that ended (or are so far) within budget. */
export function onBudgetStreak(budget, today) {
  let n = 0;
  for (let d = today, guard = 0; guard < 400; d = addDays(d, -1), guard += 1) {
    const b = budgetDay(budget, d);
    if (!b || Math.round(b.left) < 0) break;
    n += 1;
  }
  return n;
}
