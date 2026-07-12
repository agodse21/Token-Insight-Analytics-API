import { Request, Response } from 'express';
import { z } from 'zod';
import { fetchTokenPriceHistory, fetchTokenSnapshot } from '../services/coingecko.service';
import { generateInsight } from '../services/openai.service';
import { buildInsightPrompt } from '../services/prompt';
import { ValidationError } from '../utils/errors';

const RequestBodySchema = z.object({
  vs_currency: z.string().min(1).default('usd'),
  history_days: z.number().int().positive().max(365).default(30),
});

export async function getTokenInsight(req: Request, res: Response) {
  const tokenId = req.params.id;
  if (!tokenId) {
    throw new ValidationError('Token id is required in the URL path');
  }

  const parsedBody = RequestBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    throw new ValidationError('Invalid request body', parsedBody.error.issues);
  }
  const { vs_currency: vsCurrency, history_days: historyDays } = parsedBody.data;

  const [token, history] = await Promise.all([
    fetchTokenSnapshot(tokenId, vsCurrency),
    fetchTokenPriceHistory(tokenId, vsCurrency, historyDays),
  ]);

  const prompt = buildInsightPrompt(token, history);
  const { insight, model } = await generateInsight(prompt);

  res.json({
    source: 'coingecko',
    token: {
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      market_data: token.market_data,
    },
    insight,
    model: { provider: 'openai', model },
  });
}
