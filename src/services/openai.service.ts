import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env';
import { ApiError } from '../utils/errors';

const InsightSchema = z.object({
  reasoning: z.string().min(1),
  sentiment: z.enum(['Bullish', 'Bearish', 'Neutral']),
});

export type Insight = z.infer<typeof InsightSchema>;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.openaiApiKey) {
    throw new ApiError(
      500,
      'OPENAI_API_KEY is not configured. Set it in your .env file (see .env.example).',
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.openaiApiKey });
  }
  return client;
}

/** Extract the outermost JSON object from a string, in case the model wraps it in prose/markdown. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

export function parseInsightResponse(raw: string): Insight {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new ApiError(502, 'AI model returned invalid JSON', { raw });
  }

  const result = InsightSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(502, 'AI model response failed schema validation', {
      raw,
      issues: result.error.issues,
    });
  }
  return result.data;
}

export async function generateInsight(prompt: string): Promise<{ insight: Insight; model: string }> {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: env.openaiModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const insight = parseInsightResponse(raw);

  return { insight, model: completion.model };
}
