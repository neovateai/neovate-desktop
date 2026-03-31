export interface DeeplinkHandler {
  handle(ctx: DeeplinkContext): unknown | Promise<unknown>;
}

export interface DeeplinkContext {
  path: string;
  searchParams: URLSearchParams;
}
