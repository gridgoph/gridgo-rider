import { ApiError, getHandover, recordDelivery } from "@/lib/api";

const originalFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { global.fetch = originalFetch; });
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue({ ok: status === 200, status, text: async () => JSON.stringify(body) });
}

it("reads otpRequired without exposing credentials, and preserves explicit no-code", async () => {
  respond({ handover: { otpRequired: true, otp: "012345", qrToken: "private" } });
  expect(await getHandover("ord_1")).toEqual({ otpRequired: true });
  respond({ handover: null });
  expect(await getHandover("ord_1")).toBeNull();
});

it.each([{}, { handover: {} }, { handover: { otp: "012345" } }])(
  "does not turn an unexpected response into an evidence-only delivery: %p", async (body) => {
    respond(body);
    await expect(getHandover("ord_1")).rejects.toThrow(/requirement could not be read/);
  },
);

it("does not treat a missing route as permission to omit a code", async () => {
  respond({ error: "not_found" }, 404);
  await expect(getHandover("ord_1")).rejects.toBeInstanceOf(ApiError);
});

it.each(["photo", "signature"] as const)("sends a leading-zero code with attached %s evidence", async (evidenceType) => {
  respond({ order: { id: "ord_1", state: "issue_window_open" } });
  await expect(recordDelivery("ord_1", { evidenceType, evidenceFileId: "fil_1", otp: "012345" }))
    .resolves.toMatchObject({ state: "issue_window_open" });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ evidenceType, evidenceFileId: "fil_1", otp: "012345" });
});
