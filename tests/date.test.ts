import { enumerateDates, isValidDateString, endOfDayUtcMs, dateToUtcMs } from '../src/utils/date';

describe('isValidDateString', () => {
  it('accepts well-formed dates', () => {
    expect(isValidDateString('2025-08-01')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidDateString('2025-13-01')).toBe(false);
    expect(isValidDateString('08-01-2025')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});

describe('enumerateDates', () => {
  it('lists every date in an inclusive range', () => {
    expect(enumerateDates('2025-08-01', '2025-08-03')).toEqual(['2025-08-01', '2025-08-02', '2025-08-03']);
  });

  it('returns a single date when start equals end', () => {
    expect(enumerateDates('2025-08-01', '2025-08-01')).toEqual(['2025-08-01']);
  });
});

describe('endOfDayUtcMs', () => {
  it('is exactly one millisecond before the next day starts', () => {
    expect(endOfDayUtcMs('2025-08-01') + 1).toBe(dateToUtcMs('2025-08-02'));
  });
});
