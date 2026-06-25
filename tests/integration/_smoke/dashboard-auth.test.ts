import { describe, it, expect } from "vitest";
import { fetchRoute } from "../_helpers/server";
import { createSignedInUser } from "../_helpers/session";

describe("middleware auth gate on /dashboard", () => {
  it("redirects an unauthenticated request to /auth/signin", async () => {
    const res = await fetchRoute("/dashboard");
    expect([301, 302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get("Location") ?? "").toContain("/auth/signin");
  });

  it("returns 200 for a signed-in user", async () => {
    const user = await createSignedInUser();
    const res = await fetchRoute("/dashboard", { cookie: user.cookie });
    expect(res.status).toBe(200);
  });
});
