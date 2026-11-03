// Express 4 does not catch a rejected async handler, and on Node 22 an
// unhandled rejection kills the process — taking every in-flight request on
// the instance with it. Route handler rejections to next(err) → errorHandler.
// Must be imported BEFORE any router is built (first import in index.ts).
// shortcut: same job as express-async-errors; drop this file when moving to Express 5.
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Route = (express as any).Route;

for (const method of ['all', 'get', 'post', 'put', 'patch', 'delete']) {
  const original = Route.prototype[method];
  Route.prototype[method] = function (...handlers: unknown[]) {
    const wrapped = handlers.flat().map((h) =>
      typeof h === 'function' && h.length < 4
        ? (req: Request, res: Response, next: NextFunction) => {
            try {
              const r = (h as Handler)(req, res, next);
              if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(next);
            } catch (e) {
              next(e);
            }
          }
        : h,
    );
    return original.apply(this, wrapped);
  };
}
