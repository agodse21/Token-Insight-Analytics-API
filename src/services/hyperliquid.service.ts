import axios from 'axios';
import { env } from '../config/env';
import { UpstreamApiError } from '../utils/errors';

const client = axios.create({ baseURL: env.hyperliquidBaseUrl, timeout: 15_000 });

export interface UserFill {
  coin: string;
  px: string;
  sz: string;
  side: 'A' | 'B';
  time: number;
  closedPnl: string;
  fee: string;
  startPosition: string;
  dir: string;
}

export interface FundingEvent {
  time: number;
  delta: {
    coin: string;
    usdc: string;
    fundingRate: string;
  };
}

export interface CandleSnapshot {
  t: number; // open time (ms)
  T: number; // close time (ms)
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  withdrawable: string;
  time: number;
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  try {
    const { data } = await client.post('/info', body);
    return data as T;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new UpstreamApiError('HyperLiquid', err.message, err.response?.data);
    }
    throw err;
  }
}

export async function fetchUserFills(
  user: string,
  startTime: number,
  endTime: number,
): Promise<UserFill[]> {
  const fills: UserFill[] = [];
  let cursorStart = startTime;

  // HyperLiquid caps userFillsByTime at 2000 results per call; paginate on the returned timestamps.
  for (let page = 0; page < 25; page++) {
    const batch = await postInfo<UserFill[]>({
      type: 'userFillsByTime',
      user,
      startTime: cursorStart,
      endTime,
      aggregateByTime: true,
    });

    if (!batch.length) break;
    fills.push(...batch);

    if (batch.length < 2000) break;
    const lastTime = Math.max(...batch.map((f) => f.time));
    if (lastTime <= cursorStart) break;
    cursorStart = lastTime + 1;
  }

  return fills;
}

export async function fetchUserFunding(
  user: string,
  startTime: number,
  endTime: number,
): Promise<FundingEvent[]> {
  return postInfo<FundingEvent[]>({
    type: 'userFunding',
    user,
    startTime,
    endTime,
  });
}

export async function fetchClearinghouseState(user: string): Promise<ClearinghouseState> {
  return postInfo<ClearinghouseState>({
    type: 'clearinghouseState',
    user,
    dex: '',
  });
}

export async function fetchDailyCandles(
  coin: string,
  startTime: number,
  endTime: number,
): Promise<CandleSnapshot[]> {
  return postInfo<CandleSnapshot[]>({
    type: 'candleSnapshot',
    req: { coin, interval: '1d', startTime, endTime },
  });
}
