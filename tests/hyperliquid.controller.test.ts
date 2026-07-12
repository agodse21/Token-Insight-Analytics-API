import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
const VALID_WALLET = '0x' + '1'.repeat(40);

describe('GET /api/hyperliquid/:wallet/pnl validation', () => {
  it('rejects a malformed wallet address', async () => {
    const res = await request(app).get('/api/hyperliquid/not-a-wallet/pnl?start=2025-08-01&end=2025-08-02');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid wallet address/);
  });

  it('rejects missing date params', async () => {
    const res = await request(app).get(`/api/hyperliquid/${VALID_WALLET}/pnl`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start.*end/);
  });

  it('rejects start after end', async () => {
    const res = await request(app).get(
      `/api/hyperliquid/${VALID_WALLET}/pnl?start=2025-08-05&end=2025-08-01`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must not be after/);
  });

  it('rejects a date range that is too large', async () => {
    const res = await request(app).get(
      `/api/hyperliquid/${VALID_WALLET}/pnl?start=2025-01-01&end=2025-12-31`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/);
  });
});
