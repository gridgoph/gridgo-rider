import { deleteNotification } from "@/lib/api";

describe("notifications API client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("DELETEs one notification so it leaves the inbox", async () => {
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toContain("/notifications/ntf_1");
      expect(init?.method).toBe("DELETE");
      return {
        ok: true,
        text: async () =>
          JSON.stringify({ id: "ntf_1", deletedAt: "2026-09-01T04:00:00.000Z" }),
      };
    }) as unknown as typeof fetch;

    await expect(deleteNotification("ntf_1")).resolves.toEqual({
      id: "ntf_1",
      deletedAt: "2026-09-01T04:00:00.000Z",
    });
  });
});
