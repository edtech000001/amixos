import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const realMessage = err.message || 'Internal Server Error';

  // Always log the real error server-side.
  console.error(`[ERROR] ${statusCode} - ${realMessage}`);

  // Only surface the real message for operational / client (4xx) errors.
  // Non-operational 5xx errors get a generic message so internal details
  // (stack traces, DB errors, secrets in messages) never leak to callers.
  const safeToSurface = err.isOperational === true || statusCode < 500;
  const message = safeToSurface ? realMessage : 'internal_error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
