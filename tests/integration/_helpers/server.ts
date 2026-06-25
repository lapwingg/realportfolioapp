function baseUrl(): string {
  const v = process.env.TEST_BASE_URL;
  if (!v) throw new Error("TEST_BASE_URL not set — globalSetup did not run?");
  return v;
}

export type FetchRouteInit = Omit<RequestInit, "headers"> & {
  cookie?: string;
  headers?: HeadersInit;
};

/**
 * Fetch an Astro route on the test dev server (booted by globalSetup) with
 * cookies attached. Wraps `fetch` so tests do not need to know the base URL
 * or how the cookie header is set.
 *
 * `redirect: "manual"` by default so middleware redirects are observable as
 * 3xx responses with a `Location` header rather than silently followed.
 */
export async function fetchRoute(path: string, init: FetchRouteInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("Cookie", init.cookie);
  return fetch(new URL(path, baseUrl()), {
    ...init,
    redirect: init.redirect ?? "manual",
    headers,
  });
}
