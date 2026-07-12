import { PricePoint, TokenSnapshot } from './coingecko.service';

export function buildInsightPrompt(token: TokenSnapshot, history: PricePoint[]): string {
  const md = token.market_data;

  const historySummary =
    history.length > 1
      ? (() => {
          const first = history[0].price;
          const last = history[history.length - 1].price;
          const changePct = first ? ((last - first) / first) * 100 : null;
          return `Price moved from $${first} to $${last} over ${history.length} data points (${
            changePct === null ? 'n/a' : changePct.toFixed(2) + '%'
          } change).`;
        })()
      : 'No historical price series available.';

  return `You are a crypto market analyst. Analyze the following token data and respond with STRICT JSON only, no markdown, no prose outside the JSON object.

Token: ${token.name} (${token.symbol.toUpperCase()})
Description: ${token.description || 'n/a'}

Market data:
- Current price (USD): ${md.current_price_usd ?? 'n/a'}
- Market cap (USD): ${md.market_cap_usd ?? 'n/a'}
- 24h volume (USD): ${md.total_volume_usd ?? 'n/a'}
- 24h price change: ${md.price_change_percentage_24h ?? 'n/a'}%
- 7d price change: ${md.price_change_percentage_7d ?? 'n/a'}%
- Circulating supply: ${md.circulating_supply ?? 'n/a'}
- Total supply: ${md.total_supply ?? 'n/a'}
- All-time high (USD): ${md.ath_usd ?? 'n/a'}

Recent price history: ${historySummary}

Respond with a JSON object matching exactly this shape:
{
  "reasoning": "<2-4 sentence explanation grounded in the numbers above>",
  "sentiment": "<one of: Bullish, Bearish, Neutral>"
}`;
}
