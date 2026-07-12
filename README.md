# Token Insight & Analytics API

A backend service with two endpoints:

1. **`POST /api/token/:id/insight`** — fetches token metadata/market data from CoinGecko, builds a structured prompt, and asks an LLM (OpenAI `gpt-4o-mini` by default) for a sentiment + reasoning insight.
2. **`GET /api/hyperliquid/:wallet/pnl`** — fetches a HyperLiquid wallet's trade fills, funding payments, and position history, and computes realized/unrealized/fees/funding/net PnL per day over a date range.

Built with Node.js, Express, and TypeScript. No database — everything is fetched live from CoinGecko / HyperLiquid on each request.

## Quick start (Docker — preferred)

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY (see "AI setup" below)

docker compose up --build
```

The API is now available at `http://localhost:3000`.

## Quick start (local Node)

Requires Node 20+.

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY

npm install
npm run build
npm start

# or, for hot-reload during development:
npm run dev
```

## AI setup

The Token Insight endpoint calls OpenAI's Chat Completions API (`gpt-4o-mini` by default, JSON-mode enabled).

1. Get an API key at https://platform.openai.com/api-keys (a free trial account has enough credit for this endpoint).
2. Set `OPENAI_API_KEY` in `.env` (copy `.env.example` first — never commit `.env`).
3. Optionally override `OPENAI_MODEL` in `.env` to use a different chat-completion model.

If `OPENAI_API_KEY` is missing or invalid, the endpoint returns a `500` with a clear error message instead of crashing the server.

## Endpoints

### `POST /api/token/:id/insight`

`:id` is a CoinGecko coin id (e.g. `chainlink`, `bitcoin`, `ethereum`).

Request body (all fields optional):

```json
{ "vs_currency": "usd", "history_days": 30 }
```

Flow: fetch `/coins/{id}` + `/coins/{id}/market_chart` from CoinGecko → build a structured prompt from the market data and price history → call OpenAI with `response_format: json_object` → validate the response against a strict schema (`reasoning: string`, `sentiment: "Bullish"|"Bearish"|"Neutral"`) → return combined output. If the model returns malformed JSON or violates the schema, the endpoint returns a `502` rather than passing bad data through.

Errors: `404` if the token id doesn't exist on CoinGecko, `502` if CoinGecko/OpenAI fail or the AI response is invalid, `500` if `OPENAI_API_KEY` isn't configured.

### `GET /api/hyperliquid/:wallet/pnl?start=YYYY-MM-DD&end=YYYY-MM-DD`

`:wallet` is a `0x`-prefixed 40-hex-character address. Date range is capped at 90 days per request.

**How each figure is computed:**

- **Realized PnL / fees** — summed directly from HyperLiquid's `userFillsByTime` (`closedPnl`, `fee` fields), bucketed by UTC day.
- **Funding** — summed directly from `userFunding` (`delta.usdc`), bucketed by UTC day.
- **Unrealized PnL** — the wallet's open position per coin is reconstructed by replaying fills within the requested range in time order (weighted-average entry price, correctly handling adds/reduces/flips through zero), then marked to that day's close price from HyperLiquid's `candleSnapshot` (1d interval). Positions open **before** `start` are treated as opening at zero — the public API doesn't expose full account history, so a wallet with a pre-existing position will show its unrealized PnL "restart" at the range start. This is documented per-response in `diagnostics.notes`.
- **Equity** — if `end` is today, the last day is anchored to the live `clearinghouseState.marginSummary.accountValue` and earlier days are computed backwards (`equity[d] = equity[d+1] - net_pnl[d+1]`). If `end` is in the past, there's no way to get a historical equity snapshot from the public API, so equity falls back to a relative cumulative sum of net PnL starting at 0 — this is also called out in `diagnostics.notes` so API consumers aren't misled into treating it as an absolute balance.
- **Net PnL** = `realized + unrealized - fees + funding`, matching the assignment spec.

Errors: `400` for a malformed wallet, invalid/missing dates, `start > end`, or a range over 90 days. A wallet with no trading history returns `200` with all-zero daily rows rather than an error (HyperLiquid doesn't distinguish "unknown" from "inactive" addresses).

## Testing

```bash
npm test
```

Unit tests cover the PnL calculation engine (position reconstruction across adds/reduces/flips, daily aggregation, both equity-anchoring modes) and the AI response parser (clean JSON, markdown-fenced JSON, JSON embedded in prose, malformed JSON, and schema violations), plus request-validation tests for the HyperLiquid route. No network calls are made in tests.

## Postman collection

Import `postman_collection.json` — it includes both endpoints plus a couple of the error-path requests (unknown token, invalid wallet). Set the `baseUrl` collection variable if not running on `localhost:3000`.

## Project structure

```
src/
  config/        env loading
  controllers/   request/response handling per endpoint
  services/      CoinGecko, OpenAI, HyperLiquid clients + PnL calculation engine
  routes/        Express routers
  middleware/    centralized error handling
  utils/         shared error types, date helpers, async wrapper
tests/           Jest unit tests (mirrors src/ for the pieces with real logic)
```

## Known limitations

- Unrealized PnL and equity for historical (non-today) ranges are best-effort approximations given what HyperLiquid's public API exposes — see the per-response `diagnostics.notes` field for exactly which approximation was used on that request.
- No database/persistence layer, per the assignment's "not required" guidance — every request re-fetches from CoinGecko/HyperLiquid live.
