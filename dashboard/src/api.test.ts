import { afterEach, expect, it, vi } from "vitest";
import { getJson, postJson } from "./api";
import { stubApi } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("posts JSON and returns the reply", async () => {
  const fetchMock = stubApi({ "POST /api/thing": { ok: true } });
  expect(await postJson("/api/thing", { a: 1 })).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledWith("/api/thing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"a":1}',
  });
});

it("throws when the backend refuses", async () => {
  stubApi({});
  await expect(getJson("/api/missing")).rejects.toThrow("returned 404");
});
