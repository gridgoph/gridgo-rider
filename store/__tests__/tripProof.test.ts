import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTripProof } from "@/store/tripProof";

const ORDER = "ord_1";

async function flush() {
  // Persistence is queued behind a promise chain; let it drain.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useTripProof.setState({ checklists: {}, hydrated: false });
});

describe("the pickup checklist draft", () => {
  it("keeps answers per order", () => {
    const store = useTripProof.getState();
    store.answerCheck(ORDER, "quantity_match", true);
    store.answerCheck(ORDER, "visible_defects", false);
    store.answerCheck("ord_2", "quantity_match", false);

    const mine = useTripProof.getState().getChecklist(ORDER);
    expect(mine?.answers.quantity_match).toBe(true);
    expect(mine?.answers.visible_defects).toBe(false);
    // Unanswered stays unanswered — never defaulted to a pass.
    expect(mine?.answers.documentation).toBeNull();
    expect(useTripProof.getState().getChecklist("ord_2")?.answers.quantity_match).toBe(false);
  });

  it("keeps the failure note alongside the answers", () => {
    useTripProof.getState().answerCheck(ORDER, "visible_defects", false);
    useTripProof.getState().saveFailureNote(ORDER, "Colour is off across the batch");

    const draft = useTripProof.getState().getChecklist(ORDER);
    expect(draft?.answers.visible_defects).toBe(false);
    expect(draft?.failureNote).toBe("Colour is off across the batch");
  });

  it("survives the app closing at the counter", async () => {
    useTripProof.getState().answerCheck(ORDER, "packaging_integrity", true);
    useTripProof.getState().saveFailureNote(ORDER, "Half the batch is smudged");
    await flush();

    // A cold start: same storage, fresh in-memory state.
    useTripProof.setState({ checklists: {}, hydrated: false });
    await useTripProof.getState().hydrate();

    const draft = useTripProof.getState().getChecklist(ORDER);
    expect(draft?.answers.packaging_integrity).toBe(true);
    expect(draft?.failureNote).toBe("Half the batch is smudged");
  });

  it("is gone once the checks are recorded", () => {
    useTripProof.getState().answerCheck(ORDER, "documentation", true);
    useTripProof.getState().clearChecklist(ORDER);
    expect(useTripProof.getState().getChecklist(ORDER)).toBeNull();
  });

  it("starts clean rather than crashing on a corrupt store", async () => {
    await AsyncStorage.setItem("gridgo.tripProof.v2", "{not json");
    await useTripProof.getState().hydrate();
    expect(useTripProof.getState().hydrated).toBe(true);
    expect(useTripProof.getState().getChecklist(ORDER)).toBeNull();
  });

  it("never persists a captured photo", async () => {
    useTripProof.getState().answerCheck(ORDER, "visible_defects", false);
    await flush();

    const raw = (await AsyncStorage.getItem("gridgo.tripProof.v2")) ?? "";
    // The camera writes to a cache the system can reclaim, so a stored file
    // name would be a claim the app cannot keep.
    expect(raw).not.toMatch(/file:|\.jpg|\.png|fileId/i);
  });
});

describe("the supplier's signature draft", () => {
  it("keeps the strokes, the pad width and the signer beside the answers", () => {
    const store = useTripProof.getState();
    store.answerCheck(ORDER, "quantity_match", true);
    store.saveSignature(ORDER, { signerName: "Ana Reyes" });
    store.saveSignature(ORDER, { strokes: [[{ x: 1, y: 2 }, { x: 30, y: 4 }]], padWidth: 320 });

    const draft = useTripProof.getState().getChecklist(ORDER);
    expect(draft?.answers.quantity_match).toBe(true);
    expect(draft?.signature).toEqual({
      strokes: [[{ x: 1, y: 2 }, { x: 30, y: 4 }]],
      padWidth: 320,
      signerName: "Ana Reyes",
      storedFileId: null,
    });
  });

  it("survives the app closing with the supplier mid-signature", async () => {
    useTripProof.getState().saveSignature(ORDER, {
      strokes: [[{ x: 5, y: 5 }, { x: 50, y: 9 }]],
      padWidth: 300,
      signerName: "Ana",
      storedFileId: "fil_sig",
    });
    await flush();

    useTripProof.setState({ checklists: {}, hydrated: false });
    await useTripProof.getState().hydrate();

    const draft = useTripProof.getState().getChecklist(ORDER);
    expect(draft?.signature?.strokes).toHaveLength(1);
    expect(draft?.signature?.signerName).toBe("Ana");
    expect(draft?.signature?.storedFileId).toBe("fil_sig");
  });

  it("stamps when the sixth answer was given, and unstamps if one is reopened", () => {
    const store = useTripProof.getState();
    const codes = [
      "quantity_match",
      "specification_match",
      "visible_defects",
      "packaging_integrity",
      "documentation",
    ] as const;
    for (const code of codes) store.answerCheck(ORDER, code, true);
    expect(useTripProof.getState().getChecklist(ORDER)?.completedAt).toBeNull();
    store.answerCheck(ORDER, "supplier_sign_off", true);
    expect(useTripProof.getState().getChecklist(ORDER)?.completedAt).toEqual(expect.any(String));
  });

  it("goes with the checklist once the handoff is recorded", () => {
    useTripProof.getState().saveSignature(ORDER, { signerName: "Ana" });
    useTripProof.getState().clearChecklist(ORDER);
    expect(useTripProof.getState().getChecklist(ORDER)).toBeNull();
  });
});
