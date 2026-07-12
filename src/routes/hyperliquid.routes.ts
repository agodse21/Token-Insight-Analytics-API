import { Router } from 'express';
import { getWalletPnl } from '../controllers/hyperliquid.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const hyperliquidRouter = Router();

hyperliquidRouter.get('/hyperliquid/:wallet/pnl', asyncHandler(getWalletPnl));
