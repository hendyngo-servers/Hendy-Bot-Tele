interface D1Result<T = Record<string, unknown>> { success: boolean; results?: T[]; meta?: Record<string, unknown>; }
interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<D1Result<T>>; run<T = Record<string, unknown>>(): Promise<D1Result<T>>; }
interface D1Database { prepare(query: string): D1PreparedStatement; batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>; }
interface R2ObjectBody { body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string }; size: number; }
interface R2Bucket { get(key: string): Promise<R2ObjectBody | null>; put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; delete(key: string): Promise<void>; }
interface Fetcher { fetch(request: Request): Promise<Response>; }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; }
interface ScheduledController { cron: string; scheduledTime: number; }
