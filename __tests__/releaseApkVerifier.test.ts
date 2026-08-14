import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

describe("release APK verifier", () => {
  it("rejects a fake bundle that is missing the configured Clerk value", () => {
    const work = mkdtempSync(join(root, ".release-verifier-test-"));
    try {
      const bin = join(work, "bin");
      const payload = join(work, "payload");
      const assets = join(payload, "assets");
      const apk = join(work, "fake.apk");
      mkdirSync(bin);
      mkdirSync(assets, { recursive: true });

      const apksigner = join(bin, "apksigner");
      writeFileSync(
        apksigner,
        '#!/bin/sh\ncase "$*" in *--print-certs*) echo "Signer certificate SHA-256 digest: aabb";; esac\n',
      );
      chmodSync(apksigner, 0o755);

      const keytool = join(bin, "keytool");
      writeFileSync(keytool, '#!/bin/sh\necho "SHA256: AA:BB"\n');
      chmodSync(keytool, 0o755);

      writeFileSync(join(assets, "index.android.bundle"), "https://api.gridgo.invalid/");
      const zipped = spawnSync("zip", ["-q", "-r", apk, "assets"], {
        cwd: payload,
        encoding: "utf8",
      });
      expect(zipped.status).toBe(0);

      const clerkValue = "pk_live_fakeVerifierValue123";
      const verified = spawnSync("bash", [join(root, "scripts/verify-release-apk.sh"), apk], {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          ANDROID_HOME: "",
          ANDROID_SDK_ROOT: "",
          ANDROID_KEYSTORE_PATH: join(work, "fake.keystore"),
          ANDROID_KEYSTORE_PASSWORD: "fake-password",
          ANDROID_KEY_ALIAS: "release",
          EXPO_PUBLIC_API_URL: "https://api.gridgo.invalid/",
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkValue,
        },
      });

      expect(verified.status).toBe(1);
      expect(verified.stderr).toMatch(/Clerk publishable key is not in/i);
      expect(verified.stderr).not.toContain(clerkValue);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
