import { readFileSync } from "fs";
import { join } from "path";

describe("delivery proof send path", () => {
  it("copies the camera capture into a file the uploader can open", () => {
    const source = readFileSync(join(__dirname, "../lib/proofPhoto.ts"), "utf8");
    expect(source).toContain("persistCaptureUri");
    expect(source).toContain("Paths.cache");
    expect(source).toContain("copyAsync");
    expect(source).toContain("unreadable_capture");
    expect(source).not.toMatch(/return uri;/);
  });

  it("awaits the signature file before sending it", () => {
    const source = readFileSync(join(__dirname, "../hooks/useProofEvidence.ts"), "utf8");
    expect(source).toContain("await signatureEvidence");
  });
});
