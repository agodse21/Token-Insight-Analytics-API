const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function dateToUtcMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getTime();
}

export function endOfDayUtcMs(dateStr: string): number {
  return dateToUtcMs(dateStr) + 24 * 60 * 60 * 1000 - 1;
}

export function msToDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = dateToUtcMs(start);
  const endMs = dateToUtcMs(end);
  while (cursor <= endMs) {
    dates.push(msToDateString(cursor));
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
}

export function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
