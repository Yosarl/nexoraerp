import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string; cause?: unknown } | null;
  if (!e) return false;
  if (e.code === 11000 || e.code === '11000') return true;
  if (typeof e.message === 'string' && e.message.includes('E11000')) return true;
  if (e.cause) return isDuplicateKeyError(e.cause);
  return false;
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDup = !(err instanceof AppError) && isDuplicateKeyError(err);
  const statusCode = err instanceof AppError ? err.statusCode : isDup ? 409 : 500;
  const message = isDup
    ? 'This document number is already in use. Please try saving again.'
    : (err.message || 'Internal server error');

  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
