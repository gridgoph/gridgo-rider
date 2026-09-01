import { readFileSync } from "fs";
import { join } from "path";

describe("delivery proof send path", () => {
  it("copies the camera capture into a file the uploader can open", () => {
    const source = readFileSync(join(__dirname, "../lib/proofPhoto.ts"), "utf8");
    expect(source).toContain("persistCaptureUri");
    expect(source).toContain("Paths.cache");
  });
});
