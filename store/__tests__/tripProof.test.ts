import AsyncStorage from "@react-native-async-storage/async-storage";

import { exceptionSummary, useTripProof } from "@/store/tripProof";

const ORDER = "ord_1";

async function flush() {
  // Persistence is queued behind a promise chain; let it drain.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useTripProof.setState({ drafts: {}, exceptions: {}, hydrated: false });
});

describe("proof drafts", () => {
  it("keeps a half-filled proof per order and per step", () => {
    const store = useTripProof.getState();
    store.saveDraft(ORDER, "pickup", { otp: "12" });
    store.saveDraft(ORDER, "delivery", { otp: "9" });
    store.saveDraft("ord_2", "pickup", { otp: "77" });

    expect(useTripProof.getState().getDraft(ORDER, "pickup")?.otp).toBe("12");
    expect(useTripProof.getState().getDraft(ORDER, "delivery")?.otp).toBe("9");
    expect(useTripProof.getState().getDraft("ord_2", "pickup")?.otp).toBe("77");
  });

  it("merges patches instead of replacing the draft", () => {
    const store = useTripProof.getState();
    store.saveDraft(ORDER, "failed", { reasonId: "unavailable" });
    useTripProof.getState().saveDraft(ORDER, "failed", { note: "Gate locked" });

    const draft = useTripProof.getState().getDraft(ORDER, "failed");
    expect(draft?.reasonId).toBe("unavailable");
    expect(draft?.note).toBe("Gate locked");
  });

  it("survives the app closing", async () => {
    useTripProof.getState().saveDraft(ORDER, "delivery", { otp: "4321" });
    await flush();

    // A cold start: same storage, fresh in-memory state.
    useTripProof.setState({ drafts: {}, exceptions: {}, hydrated: false });
    await useTripProof.getState().hydrate();

    expect(useTripProof.getState().getDraft(ORDER, "delivery")?.otp).toBe("4321");
  });

  it("is gone once the step is recorded", () => {
    useTripProof.getState().saveDraft(ORDER, "pickup", { otp: "1234" });
    useTripProof.getState().clearDraft(ORDER, "pickup");
    expect(useTripProof.getState().getDraft(ORDER, "pickup")).toBeNull();
  });

  it("starts clean rather than crashing on a corrupt store", async () => {
    await AsyncStorage.setItem("gridgo.tripProof.v1", "{not json");
    await useTripProof.getState().hydrate();
    expect(useTripProof.getState().hydrated).toBe(true);
    expect(useTripProof.getState().getDraft(ORDER, "pickup")).toBeNull();
  });
});

describe("recorded exceptions", () => {
  const attempt = {
    reasonId: "unavailable" as const,
    outcome: "retry" as const,
    note: "Nobody at the address",
    at: "2026-08-10T02:00:00.000Z",
    evidenceKind: "photo" as const,
  };

  it("accumulates attempts and tracks the latest outcome", () => {
    useTripProof.getState().recordAttempt(ORDER, attempt);
    useTripProof.getState().recordAttempt(ORDER, { ...attempt, outcome: "return" });

    const exception = useTripProof.getState().getException(ORDER);
    expect(exception?.attempts).toHaveLength(2);
    expect(exception?.outcome).toBe("return");
  });

  it("reopens the job when a fresh attempt follows a recorded return", () => {
    useTripProof.getState().recordAttempt(ORDER, { ...attempt, outcome: "return" });
    useTripProof.getState().recordReturned(ORDER, "2026-08-10T03:00:00.000Z");
    expect(useTripProof.getState().getException(ORDER)?.returnedAt).not.toBeNull();

    useTripProof.getState().recordAttempt(ORDER, attempt);
    expect(useTripProof.getState().getException(ORDER)?.returnedAt).toBeNull();
  });

  it("clears completely when the client turns out to be able to take it", () => {
    useTripProof.getState().recordAttempt(ORDER, attempt);
    useTripProof.getState().clearException(ORDER);
    expect(useTripProof.getState().getException(ORDER)).toBeNull();
  });

  it("summarises nothing as nothing", () => {
    expect(exceptionSummary(null)).toBeNull();
    expect(
      exceptionSummary({ attempts: [attempt], outcome: "retry", returnedAt: null }),
    ).toEqual({ attemptCount: 1, outcome: "retry", returnedAt: null });
  });
});
