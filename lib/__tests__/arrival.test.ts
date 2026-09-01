import {
  ARRIVAL_RADIUS_METRES,
  arrivalCopy,
  arrivalKey,
  claimArrivalNotice,
  claimArrivalSheet,
  resetArrivalMemory,
  shouldAnnounceArrival,
} from "@/lib/arrival";
import { GRIDGO_OFFICE } from "@/lib/gridgoOffice";
import type { NextStop } from "@/lib/tripNav";
import { haversineMetres, type LatLng } from "@/lib/geo";

const shopPoint: LatLng = { lat: 7.064, lng: 125.6085 };
const clientPoint: LatLng = { lat: 7.047, lng: 125.586 };

function offset(point: LatLng, northMetres: number, eastMetres: number): LatLng {
  const lat = point.lat + northMetres / 111_320;
  const lng =
    point.lng +
    eastMetres / (111_320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat, lng };
}

function shopStop(): NextStop {
  return {
    kind: "shop",
    cardKind: "pickup",
    point: shopPoint,
    label: "Lovis Printshop",
    overline: "NEXT STOP · SHOP",
    heading: "Check the finished job at the counter before you carry it",
    navTitle: "TO THE SHOP",
  };
}

function officeStop(): NextStop {
  return {
    kind: "office",
    cardKind: "dropoff",
    point: { lat: GRIDGO_OFFICE.lat, lng: GRIDGO_OFFICE.lng },
    label: GRIDGO_OFFICE.label,
    overline: "NEXT STOP · GRIDGO OFFICE",
    heading: "Leave the finished job at the GRIDGO counter",
    navTitle: "TO GRIDGO OFFICE",
  };
}

function clientStop(): NextStop {
  return {
    kind: "client",
    cardKind: "dropoff",
    point: clientPoint,
    label: "Matina Crossing",
    overline: "NEXT STOP · CLIENT",
    heading: "Hand the package to the client",
    navTitle: "TO THE CLIENT",
  };
}

describe("shouldAnnounceArrival", () => {
  afterEach(() => {
    resetArrivalMemory();
  });

  it("does not invent a trip", () => {
    const verdict = shouldAnnounceArrival({
      orderId: null,
      stop: shopStop(),
      rider: shopPoint,
      accuracyMetres: 12,
      freshness: "live",
    });
    expect(verdict.inside).toBe(false);
    if (!verdict.inside) expect(verdict.reason).toBe("no-trip");
  });

  it("waits for a next stop", () => {
    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: null,
      rider: shopPoint,
      accuracyMetres: 12,
      freshness: "live",
    });
    expect(verdict.inside).toBe(false);
    if (!verdict.inside) expect(verdict.reason).toBe("no-stop");
  });

  it("does not treat a last-known or waiting fix as arrival", () => {
    for (const freshness of ["stale", "waiting", "off"] as const) {
      const verdict = shouldAnnounceArrival({
        orderId: "ord_1",
        stop: shopStop(),
        rider: shopPoint,
        accuracyMetres: 12,
        freshness,
      });
      expect(verdict.inside).toBe(false);
      if (!verdict.inside) expect(verdict.reason).toBe("stale");
    }
  });

  it("refuses a wide accuracy circle that happens to contain the pin", () => {
    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: shopStop(),
      rider: shopPoint,
      accuracyMetres: 500,
      freshness: "live",
    });
    expect(verdict.inside).toBe(false);
    if (!verdict.inside) expect(verdict.reason).toBe("inaccurate");
  });

  it("refuses a missing accuracy rather than guessing", () => {
    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: shopStop(),
      rider: shopPoint,
      accuracyMetres: null,
      freshness: "live",
    });
    expect(verdict.inside).toBe(false);
    if (!verdict.inside) expect(verdict.reason).toBe("inaccurate");
  });

  it("fires inside the shop radius with a live accurate fix", () => {
    const rider = offset(shopPoint, 40, 0);
    expect(haversineMetres(rider, shopPoint)).toBeLessThan(ARRIVAL_RADIUS_METRES);

    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: shopStop(),
      rider,
      accuracyMetres: 15,
      freshness: "live",
    });
    expect(verdict).toMatchObject({
      inside: true,
      kind: "shop",
      key: "ord_1:shop",
    });
  });

  it("does not fire a street away from the shop", () => {
    const rider = offset(shopPoint, 200, 0);
    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: shopStop(),
      rider,
      accuracyMetres: 15,
      freshness: "live",
    });
    expect(verdict.inside).toBe(false);
    if (!verdict.inside) expect(verdict.reason).toBe("too-far");
  });

  it("fires at GRIDGO Office, not only at a shop", () => {
    const rider = offset(GRIDGO_OFFICE, 20, 10);
    const verdict = shouldAnnounceArrival({
      orderId: "ord_collect",
      stop: officeStop(),
      rider,
      accuracyMetres: 18,
      freshness: "live",
    });
    expect(verdict).toMatchObject({
      inside: true,
      kind: "office",
      key: "ord_collect:office",
    });
  });

  it("fires at the client door on a delivery job", () => {
    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: clientStop(),
      rider: clientPoint,
      accuracyMetres: 10,
      freshness: "live",
    });
    expect(verdict).toMatchObject({ inside: true, kind: "client" });
  });

  it("does not fire when the stop has no pin", () => {
    const verdict = shouldAnnounceArrival({
      orderId: "ord_1",
      stop: { ...shopStop(), point: null },
      rider: shopPoint,
      accuracyMetres: 12,
      freshness: "live",
    });
    expect(verdict.inside).toBe(false);
    if (!verdict.inside) expect(verdict.reason).toBe("no-point");
  });
});

describe("arrivalCopy", () => {
  it("names the shop and what to do at the counter", () => {
    const copy = arrivalCopy(shopStop());
    expect(copy.question).toBe("You've arrived at the shop");
    expect(copy.consequence).toContain("Lovis Printshop");
    expect(copy.consequence).toMatch(/counter/i);
    expect(copy.confirmLabel).toBe("Got it");
  });

  it("names GRIDGO Office for a collect drop-off", () => {
    const copy = arrivalCopy(officeStop());
    expect(copy.question).toBe("You've arrived at GRIDGO Office");
    expect(copy.consequence).toContain(GRIDGO_OFFICE.label);
  });

  it("names the client for a door drop-off", () => {
    const copy = arrivalCopy(clientStop());
    expect(copy.question).toBe("You've arrived at the client");
    expect(copy.consequence).toContain("Matina Crossing");
  });
});

describe("arrival claims", () => {
  afterEach(() => {
    resetArrivalMemory();
  });

  it("lets the notice and the sheet each fire once per stop", () => {
    const key = arrivalKey("ord_1", "shop");
    expect(claimArrivalNotice(key)).toBe(true);
    expect(claimArrivalNotice(key)).toBe(false);
    expect(claimArrivalSheet(key)).toBe(true);
    expect(claimArrivalSheet(key)).toBe(false);
  });

  it("treats the office as a different stop from the shop", () => {
    expect(claimArrivalNotice(arrivalKey("ord_1", "shop"))).toBe(true);
    expect(claimArrivalNotice(arrivalKey("ord_1", "office"))).toBe(true);
  });
});
