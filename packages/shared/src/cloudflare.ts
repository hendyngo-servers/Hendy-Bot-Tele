export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number; duration?: number; last_row_id?: number };
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
export interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  size: number;
  etag: string;
  writeHttpMetadata(headers: Headers): void;
}
export interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: Array<{ key: string; size: number; uploaded: Date }>; truncated: boolean; cursor?: string }>;
}
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
export interface BackendEnv {
  DB: D1Database;
  FILES: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ADMIN_IDS: string;
  TELEGRAM_BOT_USERNAME: string;
  WEB_APP_URL: string;
  WEB_USER_URL?: string;
  WEB_ADMIN_URL?: string;
  WEB_USER_URL?: string;
  WEB_ADMIN_URL?: string;
  APP_ENCRYPTION_KEY: string;
  BACKUP_SECRET: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_PER_MINUTE?: string;
}
