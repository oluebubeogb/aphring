import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";

export class HttpError extends Error {
  /** expose=true: show the message even for 5xx in production (e.g. "AI service unavailable"). */
  constructor(public status: number, message: string, public expose = false) {
    super(message);
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
    });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === "production" && !err.expose ? "Internal server error" : err.message || "Internal server error",
  });
}
