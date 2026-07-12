import {
  applyFillToPosition,
  buildClosePriceIndex,
  buildEndOfDayPositions,
  computeDailyPnl,
  PositionState,
} from '../src/services/pnl.service';
import { UserFill, FundingEvent, CandleSnapshot } from '../src/services/hyperliquid.service';

function fill(overrides: Partial<UserFill>): UserFill {
  return {
    coin: 'BTC',
    px: '100',
    sz: '1',
    side: 'B',
    time: 0,
    closedPnl: '0',
    fee: '0',
    startPosition: '0',
    dir: 'Open Long',
    ...overrides,
  };
}

describe('applyFillToPosition', () => {
  const flat: PositionState = { size: 0, avgEntryPx: 0 };

  it('opens a new long position', () => {
    const state = applyFillToPosition(flat, fill({ side: 'B', sz: '2', px: '100' }));
    expect(state).toEqual({ size: 2, avgEntryPx: 100 });
  });

  it('opens a new short position', () => {
    const state = applyFillToPosition(flat, fill({ side: 'A', sz: '2', px: '100' }));
    expect(state).toEqual({ size: -2, avgEntryPx: 100 });
  });

  it('averages entry price when adding to a long', () => {
    const afterFirst = applyFillToPosition(flat, fill({ side: 'B', sz: '1', px: '100' }));
    const afterSecond = applyFillToPosition(afterFirst, fill({ side: 'B', sz: '1', px: '200' }));
    expect(afterSecond.size).toBe(2);
    expect(afterSecond.avgEntryPx).toBe(150);
  });

  it('keeps entry price when partially reducing a long', () => {
    const open = { size: 2, avgEntryPx: 100 };
    const reduced = applyFillToPosition(open, fill({ side: 'A', sz: '1', px: '150' }));
    expect(reduced).toEqual({ size: 1, avgEntryPx: 100 });
  });

  it('fully closes a position back to flat', () => {
    const open = { size: 2, avgEntryPx: 100 };
    const closed = applyFillToPosition(open, fill({ side: 'A', sz: '2', px: '150' }));
    expect(closed).toEqual({ size: 0, avgEntryPx: 0 });
  });

  it('flips a long into a short at the fill price', () => {
    const open = { size: 1, avgEntryPx: 100 };
    const flipped = applyFillToPosition(open, fill({ side: 'A', sz: '3', px: '150' }));
    expect(flipped).toEqual({ size: -2, avgEntryPx: 150 });
  });
});

describe('buildEndOfDayPositions', () => {
  it('snapshots the running position at the end of each requested day', () => {
    const dayOneMs = Date.parse('2025-08-01T10:00:00.000Z');
    const dayTwoMs = Date.parse('2025-08-02T10:00:00.000Z');

    const fills = [
      fill({ side: 'B', sz: '1', px: '100', time: dayOneMs }),
      fill({ side: 'B', sz: '1', px: '200', time: dayTwoMs }),
    ];

    const snapshots = buildEndOfDayPositions(fills, ['2025-08-01', '2025-08-02']);

    expect(snapshots.get('2025-08-01')!.get('BTC')).toEqual({ size: 1, avgEntryPx: 100 });
    expect(snapshots.get('2025-08-02')!.get('BTC')).toEqual({ size: 2, avgEntryPx: 150 });
  });

  it('drops coins once their position is fully closed', () => {
    const dayOneMs = Date.parse('2025-08-01T10:00:00.000Z');
    const dayTwoMs = Date.parse('2025-08-02T10:00:00.000Z');

    const fills = [
      fill({ side: 'B', sz: '1', px: '100', time: dayOneMs }),
      fill({ side: 'A', sz: '1', px: '110', time: dayTwoMs }),
    ];

    const snapshots = buildEndOfDayPositions(fills, ['2025-08-01', '2025-08-02']);

    expect(snapshots.get('2025-08-01')!.has('BTC')).toBe(true);
    expect(snapshots.get('2025-08-02')!.has('BTC')).toBe(false);
  });
});

describe('computeDailyPnl', () => {
  const dayOneMs = Date.parse('2025-08-01T10:00:00.000Z');
  const dayTwoMs = Date.parse('2025-08-02T10:00:00.000Z');

  const fills: UserFill[] = [
    fill({ side: 'B', sz: '1', px: '100', time: dayOneMs, fee: '1', closedPnl: '0' }),
    fill({ side: 'A', sz: '1', px: '120', time: dayTwoMs, fee: '1', closedPnl: '20' }),
  ];

  const fundingEvents: FundingEvent[] = [
    { time: dayOneMs, delta: { coin: 'BTC', usdc: '-0.5', fundingRate: '0.0001' } },
    { time: dayTwoMs, delta: { coin: 'BTC', usdc: '0.2', fundingRate: '0.0001' } },
  ];

  const candles: CandleSnapshot[] = [
    { t: Date.parse('2025-08-01T00:00:00.000Z'), T: 0, o: '100', h: '110', l: '95', c: '110', v: '1' },
    { t: Date.parse('2025-08-02T00:00:00.000Z'), T: 0, o: '110', h: '125', l: '105', c: '120', v: '1' },
  ];

  const closePriceIndex = buildClosePriceIndex(new Map([['BTC', candles]]));

  it('computes realized, unrealized, fees, funding, and net PnL per day', () => {
    const { daily, summary } = computeDailyPnl({
      dates: ['2025-08-01', '2025-08-02'],
      fillsSortedAsc: fills,
      fundingEvents,
      closePriceIndex,
      liveAccountValueUsd: null,
      anchorToLiveEquity: false,
    });

    // Day 1: opened 1 BTC long @100, marked to day-1 close of 110 -> unrealized = 10
    expect(daily[0]).toMatchObject({
      date: '2025-08-01',
      realized_pnl_usd: 0,
      unrealized_pnl_usd: 10,
      fees_usd: 1,
      funding_usd: -0.5,
      net_pnl_usd: 0 + 10 - 1 + -0.5,
    });

    // Day 2: closed the position for +20 realized, flat afterwards -> no unrealized
    expect(daily[1]).toMatchObject({
      date: '2025-08-02',
      realized_pnl_usd: 20,
      unrealized_pnl_usd: 0,
      fees_usd: 1,
      funding_usd: 0.2,
      net_pnl_usd: 20 + 0 - 1 + 0.2,
    });

    expect(summary.net_pnl_usd).toBeCloseTo(daily[0].net_pnl_usd + daily[1].net_pnl_usd, 5);
    expect(summary.total_realized_usd).toBeCloseTo(20, 5);
    expect(summary.total_fees_usd).toBeCloseTo(2, 5);
  });

  it('anchors equity to the live account value and walks backwards when requested', () => {
    const { daily } = computeDailyPnl({
      dates: ['2025-08-01', '2025-08-02'],
      fillsSortedAsc: fills,
      fundingEvents,
      closePriceIndex,
      liveAccountValueUsd: 1000,
      anchorToLiveEquity: true,
    });

    expect(daily[1].equity_usd).toBe(1000);
    expect(daily[0].equity_usd).toBeCloseTo(1000 - daily[1].net_pnl_usd, 5);
  });

  it('falls back to a relative cumulative equity when no live anchor is available', () => {
    const { daily } = computeDailyPnl({
      dates: ['2025-08-01', '2025-08-02'],
      fillsSortedAsc: fills,
      fundingEvents,
      closePriceIndex,
      liveAccountValueUsd: null,
      anchorToLiveEquity: false,
    });

    expect(daily[0].equity_usd).toBeCloseTo(daily[0].net_pnl_usd, 5);
    expect(daily[1].equity_usd).toBeCloseTo(daily[0].net_pnl_usd + daily[1].net_pnl_usd, 5);
  });
});
