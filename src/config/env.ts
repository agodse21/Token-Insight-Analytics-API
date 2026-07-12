import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  coingeckoBaseUrl: required('COINGECKO_BASE_URL', 'https://api.coingecko.com/api/v3'),
  hyperliquidBaseUrl: required('HYPERLIQUID_BASE_URL', 'https://api.hyperliquid.xyz'),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
};
