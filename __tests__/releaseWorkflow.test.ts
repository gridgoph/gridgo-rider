import { readFileSync } from "fs";
import { join } from "path";

/**
 * The release workflow's two load-bearing properties, asserted here because
 * neither shows up in a build log.
 *
 * `EXPO_PUBLIC_*` values are inlined by Babel while the JS bundle is built, so
 * `EXPO_PUBLIC_API_URL` has to be in the environment of the command that runs
 * the bundle — the gradle build. Set on the runner beforehand, in an earlier
 * step, or exported afterwards, it does nothing at all, and the APK falls back
 * to the loopback base in `lib/api.ts`: green in CI, dead on every phone in
 * Davao. `scripts/verify-release-apk.sh` catches it against the built
 * artifact; this catches it against the workflow, before a 20-minute build.
 *
 * And a pull request must never produce a signed release build, so the job
 * that touches the signing key is fenced off from that trigger.
 *
 * Parsed as text rather than YAML: this repo has no YAML parser as a declared
 * dependency, and the questions are about which step a line sits in.
 */

const workflow = readFileSync(
  join(__dirname, "..", ".github", "workflows", "android-release.yml"),
  "utf8",
);

/** A job body: every line from its key to the next job's key. */
function jobBody(name: string): string {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`workflow has no job "${name}"`);

  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (next === -1 ? rest : rest.slice(0, next)).join("\n");
}

/** A job body split into its steps: blocks opening with `- ` at step indent. */
function steps(body: string): string[] {
  return body.split(/^ {6}- /m).slice(1);
}

const apk = jobBody("apk");
const apkSteps = steps(apk);

describe("the release workflow bakes the deployed API URL into the bundle", () => {
  it("finds the step that builds the bundle", () => {
    expect(apkSteps.filter((step) => step.includes("gradlew assembleRelease"))).toHaveLength(1);
  });

  it("sets EXPO_PUBLIC_API_URL on that step, not somewhere it cannot reach", () => {
    const build = apkSteps.find((step) => step.includes("gradlew assembleRelease"));
    expect(build).toBeDefined();

    // The env: block of this step, up to the run: that consumes it.
    const env = /\n\s+env:\n([\s\S]*?)\n\s+run:/.exec(build as string)?.[1] ?? "";
    expect(env).toMatch(/EXPO_PUBLIC_API_URL:\s*\$\{\{\s*secrets\.EXPO_PUBLIC_API_URL\s*\}\}/);
  });

  it("verifies the built APK rather than trusting the build", () => {
    const verify = apkSteps.findIndex((step) =>
      step.includes("scripts/verify-release-apk.sh"),
    );
    const build = apkSteps.findIndex((step) => step.includes("gradlew assembleRelease"));
    const upload = apkSteps.findIndex((step) => step.includes("upload-artifact"));

    expect(verify).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(verify);
  });

  it("destroys the signing key however the job ends", () => {
    const cleanup = apkSteps.find((step) => step.includes("rm -f") && step.includes("release.jks"));
    expect(cleanup).toBeDefined();
    expect(cleanup).toMatch(/if:\s*always\(\)/);
  });
});

describe("a pull request never produces a signed release build", () => {
  it("fences the signing job off from the pull_request trigger", () => {
    expect(apk).toMatch(/if:\s*github\.event_name\s*!=\s*'pull_request'/);
  });

  it("keeps every secret inside that job", () => {
    const check = jobBody("check");
    expect(check).not.toMatch(/secrets\./);
  });
});
