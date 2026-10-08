import { readFileSync } from "fs";
import { join } from "path";

/**
 * Where Google Maps is offered.
 *
 * Navigate belongs where the rider may still be riding: Active's next-stop
 * card, and the first screen of each stop. On the handoff and sign-off steps
 * the supplier is standing at the counter with the rider, and a pickup held by
 * an escalation means staying put — a button leaving the app there is noise.
 */

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
const headers = (path: string) => read(path).match(/<TripStepHeader[^>]*\/>/g) ?? [];

describe("Navigate placement", () => {
  it("offers Maps on the delivery step's header", () => {
    expect(headers("app/trip/delivery.tsx")).toEqual([expect.stringContaining(" navigate ")]);
  });

  it("offers Maps on the pickup checks, not while the pickup is blocked", () => {
    const source = read("app/trip/pickup.tsx");
    const blocked = source.slice(source.indexOf("order && escalated"), source.indexOf("order && !escalated"));
    const checks = source.slice(source.indexOf("order && !escalated"));
    expect(blocked).toContain("<TripStepHeader");
    expect(blocked).not.toMatch(/<TripStepHeader[^>]* navigate /);
    expect(checks).toMatch(/<TripStepHeader[^>]* navigate \/>/);
  });

  it.each(["app/trip/handoff.tsx", "app/trip/sign-off.tsx"])("keeps Maps off %s", (path) => {
    const found = headers(path);
    expect(found.length).toBeGreaterThan(0);
    found.forEach((header) => expect(header).not.toContain(" navigate "));
  });

  it("keeps Maps off Active's card while the package is held at the shop", () => {
    expect(read("app/(tabs)/active.tsx")).toMatch(
      /phase !== "pickup_blocked" \? \(\s*<NavigateButton order=\{trip\} stopKind=\{heading\.cardKind\} \/>/,
    );
  });
});
