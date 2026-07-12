import { Router } from 'express';
import { getTokenInsight } from '../controllers/token.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const tokenRouter = Router();

tokenRouter.post('/token/:id/insight', asyncHandler(getTokenInsight));
