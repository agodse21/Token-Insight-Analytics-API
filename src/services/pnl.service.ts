import { CandleSnapshot, FundingEvent, UserFill } from './hyperliquid.service';
import { endOfDayUtcMs, msToDateString } from '../utils/date';

export interface PositionState {
  size: number;
  avgEntryPx: number;
}

export interface DailyPnl {
  date: string;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  fees_usd: number;
  funding_usd: number;
  net_pnl_usd: number;
  equity_usd: number | null;
}

export interface PnlSummary {
  total_realized_usd: number;
  total_unrealized_usd: number;
  total_fees_usd: number;
  total_funding_usd: number;
  net_pnl_usd: number;
}

const num = (v: string) => Number(v) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Apply a single fill to a coin's running position, tracking a weighted-average entry price. */
export function applyFillToPosition(state: PositionState, fill: UserFill): PositionState {
  const signedSz = fill.side === 'B' ? num(fill.sz) : -num(fill.sz);
  const px = num(fill.px);
  const sameDirection = state.size === 0 || Math.sign(state.size) === Math.sign(signedSz);
  const newSize = state.size + signedSz;

  if (sameDirection) {
    const avgEntryPx =
      newSize !== 0
        ? (state.avgEntryPx * Math.abs(state.size) + px * Math.abs(signedSz)) / Math.abs(newSize)
        : 0;
    return { size: newSize, avgEntryPx };
  }

  if (Math.abs(newSize) < 1e-9) return { size: 0, avgEntryPx: 0 };
  if (Math.sign(newSize) === Math.sign(state.size)) {
    // Still reducing towards zero: cost basis of the remaining size is unchanged.
    return { size: newSize, avgEntryPx: state.avgEntryPx };
  }
  // Flipped through zero: the leftover size opens a fresh position at this fill's price.
  return { size: newSize, avgEntryPx: px };
}

/** End-of-day open position per coin, for each date, reconstructed by replaying fills in order. */
export function buildEndOfDayPositions(
  fillsSortedAsc: UserFill[],
  dates: string[],
): Map<string, Map<string, PositionState>> {
  const running = new Map<string, PositionState>();
  const snapshots = new Map<string, Map<string, PositionState>>();
  let idx = 0;

  for (const date of dates) {
    const dayEndMs = endOfDayUtcMs(date);
    while (idx < fillsSortedAsc.length && fillsSortedAsc[idx].time <= dayEndMs) {
      const fill = fillsSortedAsc[idx];
      const prev = running.get(fill.coin) ?? { size: 0, avgEntryPx: 0 };
      running.set(fill.coin, applyFillToPosition(prev, fill));
      idx++;
    }

    const snapshot = new Map<string, PositionState>();
    for (const [coin, state] of running) {
      if (Math.abs(state.size) > 1e-9) snapshot.set(coin, { ...state });
    }
    snapshots.set(date, snapshot);
  }

  return snapshots;
}

export function groupByDate<T extends { time: number }>(items: T[], dates: string[]): Map<string, T[]> {
  const dateSet = new Set(dates);
  const grouped = new Map<string, T[]>(dates.map((d) => [d, []]));
  for (const item of items) {
    const date = msToDateString(item.time);
    if (dateSet.has(date)) grouped.get(date)!.push(item);
  }
  return grouped;
}

/** Builds a coin -> date -> close price lookup from candle snapshots. */
export function buildClosePriceIndex(candlesByCoin: Map<string, CandleSnapshot[]>): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const [coin, candles] of candlesByCoin) {
    const byDate = new Map<string, number>();
    for (const candle of candles) {
      byDate.set(msToDateString(candle.t), num(candle.c));
    }
    index.set(coin, byDate);
  }
  return index;
}

export interface ComputeDailyPnlInput {
  dates: string[];
  fillsSortedAsc: UserFill[];
  fundingEvents: FundingEvent[];
  closePriceIndex: Map<string, Map<string, number>>;
  liveAccountValueUsd: number | null;
  anchorToLiveEquity: boolean;
}

export function computeDailyPnl(input: ComputeDailyPnlInput): { daily: DailyPnl[]; summary: PnlSummary } {
  const { dates, fillsSortedAsc, fundingEvents, closePriceIndex, liveAccountValueUsd, anchorToLiveEquity } = input;

  const fillsByDate = groupByDate(fillsSortedAsc, dates);
  const fundingByDate = groupByDate(fundingEvents, dates);
  const positionsByDate = buildEndOfDayPositions(fillsSortedAsc, dates);

  const daily: DailyPnl[] = dates.map((date) => {
    const dayFills = fillsByDate.get(date) ?? [];
    const dayFunding = fundingByDate.get(date) ?? [];

    const realized = dayFills.reduce((sum, f) => sum + num(f.closedPnl), 0);
    const fees = dayFills.reduce((sum, f) => sum + num(f.fee), 0);
    const funding = dayFunding.reduce((sum, f) => sum + num(f.delta.usdc), 0);

    let unrealized = 0;
    const positions = positionsByDate.get(date) ?? new Map<string, PositionState>();
    for (const [coin, state] of positions) {
      const close = closePriceIndex.get(coin)?.get(date);
      if (close !== undefined) {
        unrealized += state.size * (close - state.avgEntryPx);
      }
    }

    const net = realized + unrealized - fees + funding;

    return {
      date,
      realized_pnl_usd: round2(realized),
      unrealized_pnl_usd: round2(unrealized),
      fees_usd: round2(fees),
      funding_usd: round2(funding),
      net_pnl_usd: round2(net),
      equity_usd: null, // filled in below once net PnL for every day is known
    };
  });

  // Equity anchoring: if the range includes "today" we anchor the last day to the live
  // account value from HyperLiquid and walk backwards; otherwise equity is only meaningful
  // relative to the start of the requested range (no historical equity snapshot exists).
  if (anchorToLiveEquity && liveAccountValueUsd !== null && daily.length > 0) {
    daily[daily.length - 1].equity_usd = round2(liveAccountValueUsd);
    for (let i = daily.length - 2; i >= 0; i--) {
      daily[i].equity_usd = round2(daily[i + 1].equity_usd! - daily[i + 1].net_pnl_usd);
    }
  } else {
    let running = 0;
    for (const day of daily) {
      running += day.net_pnl_usd;
      day.equity_usd = round2(running);
    }
  }

  const summary: PnlSummary = {
    total_realized_usd: round2(daily.reduce((s, d) => s + d.realized_pnl_usd, 0)),
    total_unrealized_usd: round2(daily.reduce((s, d) => s + d.unrealized_pnl_usd, 0)),
    total_fees_usd: round2(daily.reduce((s, d) => s + d.fees_usd, 0)),
    total_funding_usd: round2(daily.reduce((s, d) => s + d.funding_usd, 0)),
    net_pnl_usd: round2(daily.reduce((s, d) => s + d.net_pnl_usd, 0)),
  };

  return { daily, summary };
}
