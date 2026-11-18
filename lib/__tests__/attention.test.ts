import { attentionSummary } from "@/lib/attention";

describe("the attention chip", () => {
  it("is absent when nothing needs the rider", () => {
    expect(attentionSummary({})).toBeNull();
    expect(attentionSummary({ push: false, legal: false })).toBeNull();
  });

  it("names a single problem", () => {
    expect(attentionSummary({ push: true })).toMatchObject({ keys: ["push"], label: "Job alerts are off", tone: "info" });
  });

  it("counts several, most urgent first, and reads them all aloud", () => {
    const summary = attentionSummary({ legal: true, location: true, push: true });
    expect(summary?.keys).toEqual(["location", "push", "legal"]);
    expect(summary?.label).toBe("3 things need you");
    expect(summary?.tone).toBe("warning");
    expect(summary?.spoken).toBe("Location needs a fix, Job alerts are off, Updated terms to read. Opens the details.");
  });

  it("warns for a review in progress", () => {
    expect(attentionSummary({ approval: true })?.tone).toBe("warning");
  });
});
