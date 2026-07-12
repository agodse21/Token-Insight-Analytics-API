import { Request, Response } from 'express';
import {
  fetchClearinghouseState,
  fetchDailyCandles,
  fetchUserFills,
  fetchUserFunding,
} from '../services/hyperliquid.service';
import { buildClosePriceIndex, computeDailyPnl } from '../services/pnl.service';
import { dateToUtcMs, enumerateDates, endOfDayUtcMs, isValidDateString, todayUtcDateString } from '../utils/date';
import { ValidationError } from '../utils/errors';

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_RANGE_DAYS = 90;

export async function getWalletPnl(req: Request, res: Response) {
  const wallet = req.params.wallet;
  const { start, end } = req.query;

  if (!WALLET_RE.test(wallet)) {
    throw new ValidationError(`Invalid wallet address: ${wallet}. Expected a 0x-prefixed 40-hex-char address.`);
  }
  if (typeof start !== 'string' || typeof end !== 'string' || !isValidDateString(start) || !isValidDateString(end)) {
    throw new ValidationError('Query params "start" and "end" are required as YYYY-MM-DD dates.');
  }
  if (dateToUtcMs(start) > dateToUtcMs(end)) {
    throw new ValidationError('"start" must not be after "end".');
  }

  const dates = enumerateDates(start, end);
  if (dates.length > MAX_RANGE_DAYS) {
    throw new ValidationError(`Date range too large: max ${MAX_RANGE_DAYS} days, got ${dates.length}.`);
  }

  const rangeStartMs = dateToUtcMs(start);
  const rangeEndMs = endOfDayUtcMs(end);

  const [fills, fundingEvents, clearinghouse] = await Promise.all([
    fetchUserFills(wallet, rangeStartMs, rangeEndMs),
    fetchUserFunding(wallet, rangeStartMs, rangeEndMs),
    fetchClearinghouseState(wallet).catch(() => null),
  ]);

  const fillsSortedAsc = [...fills].sort((a, b) => a.time - b.time);

  const coins = [...new Set(fillsSortedAsc.map((f) => f.coin))];
  const candlesByCoin = new Map(
    await Promise.all(
      coins.map(async (coin) => [coin, await fetchDailyCandles(coin, rangeStartMs, rangeEndMs)] as const),
    ),
  );
  const closePriceIndex = buildClosePriceIndex(candlesByCoin);

  const isEndToday = end === todayUtcDateString();
  const liveAccountValueUsd = clearinghouse ? Number(clearinghouse.marginSummary.accountValue) : null;

  const { daily, summary } = computeDailyPnl({
    dates,
    fillsSortedAsc,
    fundingEvents,
    closePriceIndex,
    liveAccountValueUsd,
    anchorToLiveEquity: isEndToday && liveAccountValueUsd !== null,
  });

  res.json({
    wallet,
    start,
    end,
    daily,
    summary,
    diagnostics: {
      data_source: 'hyperliquid_api',
      last_api_call: new Date().toISOString(),
      fills_count: fills.length,
      funding_events_count: fundingEvents.length,
      coins_traded: coins,
      notes:
        'Realized PnL, fees, and funding are read directly from HyperLiquid fill/funding history. ' +
        'Unrealized PnL is reconstructed from fills within the requested range (positions open before ' +
        '"start" are treated as opening at zero) and marked to each day\'s HyperLiquid daily close price. ' +
        (isEndToday && liveAccountValueUsd !== null
          ? 'Equity is anchored to the live account value from clearinghouseState and projected backwards day by day.'
          : 'Equity is a relative running total of net PnL (no historical equity anchor is available from the public API for past date ranges).'),
    },
  });
}
