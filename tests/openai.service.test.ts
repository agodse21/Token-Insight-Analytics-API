import { parseInsightResponse } from '../src/services/openai.service';

describe('parseInsightResponse', () => {
  it('parses a clean JSON object', () => {
    const result = parseInsightResponse('{"reasoning": "Price is up", "sentiment": "Bullish"}');
    expect(result).toEqual({ reasoning: 'Price is up', sentiment: 'Bullish' });
  });

  it('extracts JSON wrapped in a markdown code fence', () => {
    const raw = '```json\n{"reasoning": "Flat market", "sentiment": "Neutral"}\n```';
    const result = parseInsightResponse(raw);
    expect(result.sentiment).toBe('Neutral');
  });

  it('extracts a JSON object surrounded by prose', () => {
    const raw = 'Here is my analysis: {"reasoning": "Volume dropped", "sentiment": "Bearish"} Hope this helps!';
    const result = parseInsightResponse(raw);
    expect(result.sentiment).toBe('Bearish');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseInsightResponse('not json at all')).toThrow('invalid JSON');
  });

  it('throws when the sentiment enum is violated', () => {
    const raw = '{"reasoning": "Unclear", "sentiment": "VeryBullish"}';
    expect(() => parseInsightResponse(raw)).toThrow('schema validation');
  });

  it('throws when required fields are missing', () => {
    expect(() => parseInsightResponse('{"sentiment": "Neutral"}')).toThrow('schema validation');
  });
});
