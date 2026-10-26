/**
 * Date utilities enforced in Morocco local timezone (Africa/Casablanca)
 * Prevents midnight-to-1am UTC drift (UTC+1 in Morocco).
 */

/**
 * Returns YYYY-MM-DD in Africa/Casablanca timezone
 */
export function getMoroccoDateString(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback using local offset if Intl timeZone is unavailable
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns YYYY-MM in Africa/Casablanca timezone
 */
export function getMoroccoYearMonth(date: Date = new Date()): string {
  return getMoroccoDateString(date).slice(0, 7);
}

/**
 * Safely adds N calendar months to a YYYY-MM-DD date string without overflowing
 * into the following month (e.g. 2026-01-31 + 1 month => 2026-02-28 instead of 2026-03-03).
 */
export function addMonthsClamped(dateStr: string, monthsToAdd: number): string {
  const clean = (dateStr || getMoroccoDateString()).split('T')[0];
  const [yStr, mStr, dStr] = clean.split('-');
  const year = parseInt(yStr, 10);
  const monthIndex = parseInt(mStr, 10) - 1; // 0..11
  const day = parseInt(dStr, 10);

  if (isNaN(year) || isNaN(monthIndex) || isNaN(day)) {
    return getMoroccoDateString();
  }

  const totalMonths = year * 12 + monthIndex + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;

  // Last day of targetMonthIndex: day 0 of (targetMonthIndex + 1)
  const maxDayInTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const clampedDay = Math.min(day, maxDayInTargetMonth);

  const yOut = String(targetYear).padStart(4, '0');
  const mOut = String(targetMonthIndex + 1).padStart(2, '0');
  const dOut = String(clampedDay).padStart(2, '0');
  return `${yOut}-${mOut}-${dOut}`;
}

export function todayMA(): string {
  return getMoroccoDateString();
}

export function monthMA(): string {
  return getMoroccoYearMonth();
}

export function nowMA(): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date()).replace(' ', 'T');
  } catch {
    return new Date().toISOString();
  }
}

