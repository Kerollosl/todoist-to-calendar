import type { ErrorInfo } from "../shared/types";

/** An error that carries a structured, user-presentable ErrorInfo. */
export class ApiError extends Error {
  readonly info: ErrorInfo;
  constructor(info: ErrorInfo) {
    super(info.message);
    this.info = info;
  }
}

export function toErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof ApiError) return error.info;
  // Never echo raw error text that could include request details; keep it generic.
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "http", message: message.slice(0, 300) || "Something went wrong." };
}

/** Seconds to wait from a 429, using Retry-After or Todoist's error_extra.retry_after. */
export function retryAfterSeconds(res: Response, body: unknown): number | undefined {
  const header = Number(res.headers.get("Retry-After"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header);
  const extra = (body as { error_extra?: { retry_after?: unknown } } | null)?.error_extra?.retry_after;
  const seconds = Number(extra);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
