import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/errors';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('Unhandled error:', err);
  res.status(500).json({ error: message });
}
