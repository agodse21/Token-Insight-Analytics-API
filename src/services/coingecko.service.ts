import axios from 'axios';
import { env } from '../config/env';
import { NotFoundError, UpstreamApiError } from '../utils/errors';

const client = axios.create({ baseURL: env.coingeckoBaseUrl, timeout: 10_000 });

export interface TokenMarketData {
  current_price_usd: number | null;
  market_cap_usd: number | null;
  total_volume_usd: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  ath_usd: number | null;
}

export interface TokenSnapshot {
  id: string;
  symbol: string;
  name: string;
  description: string;
  market_data: TokenMarketData;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

function pick(value: unknown, currency: string): number | null {
  if (value && typeof value === 'object' && currency in (value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[currency];
    return typeof v === 'number' ? v : null;
  }
  return null;
}

export async function fetchTokenSnapshot(id: string, vsCurrency: string): Promise<TokenSnapshot> {
  try {
    const { data } = await client.get(`/coins/${encodeURIComponent(id)}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false,
      },
    });

    const md = data.market_data ?? {};

    return {
      id: data.id,
      symbol: data.symbol,
      name: data.name,
      description: (data.description?.en ?? '').split('\n')[0].slice(0, 500),
      market_data: {
        current_price_usd: pick(md.current_price, vsCurrency),
        market_cap_usd: pick(md.market_cap, vsCurrency),
        total_volume_usd: pick(md.total_volume, vsCurrency),
        price_change_percentage_24h: md.price_change_percentage_24h ?? null,
        price_change_percentage_7d: md.price_change_percentage_7d ?? null,
        circulating_supply: md.circulating_supply ?? null,
        total_supply: md.total_supply ?? null,
        ath_usd: pick(md.ath, vsCurrency),
      },
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404) {
        throw new NotFoundError(`Token "${id}" not found on CoinGecko`);
      }
      throw new UpstreamApiError('CoinGecko', err.message, err.response?.data);
    }
    throw err;
  }
}

export async function fetchTokenPriceHistory(
  id: string,
  vsCurrency: string,
  days: number,
): Promise<PricePoint[]> {
  try {
    const { data } = await client.get(`/coins/${encodeURIComponent(id)}/market_chart`, {
      params: { vs_currency: vsCurrency, days },
    });

    const prices: [number, number][] = data.prices ?? [];
    return prices.map(([timestamp, price]) => ({ timestamp, price }));
  } catch (err) {
    if (axios.isAxiosError(err)) {
      // History is a "nice to have" for the prompt - degrade gracefully instead of failing the whole request.
      if (err.response?.status === 404) return [];
      throw new UpstreamApiError('CoinGecko market_chart', err.message, err.response?.data);
    }
    throw err;
  }
}
