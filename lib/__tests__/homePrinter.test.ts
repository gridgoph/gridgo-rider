import type { Order } from "@/lib/api";
import { offerDistanceLabel } from "@/lib/dispatchOffer";
import { defaultSignerName, handoffBlockReason, shopDisplayName } from "@/lib/handoffSignature";
import {
  HOME_DISCREET_NOTE,
  homeBarangay,
  homeExactPickup,
  homeFindingLine,
  homeOfferPickup,
  homePickupLabel,
  isHomePrinter,
  signerCopy,
} from "@/lib/homePrinter";
import { pickupLabel } from "@/lib/riderOrder";
import { tripShop } from "@/lib/tripNav";
import { tripStepAction, tripStepNote } from "@/lib/tripSteps";

// Shapes as gridgo-api#439 serves them to a rider (made-up test values).
const contact = { shopName: "Sample Barangay", printerType: "home" as const, barangay: "Sample Barangay" };
const offered = {
  printerType: "home" as const,
  barangay: "Sample Barangay",
  pickup: { barangay: "Sample Barangay" } as unknown as Order["pickup"],
  supplierContact: contact,
  zone: null,
} as unknown as Order;
const active = {
  ...offered,
  pickup: { lat: 7.073412, lng: 125.612834, label: "Sample Street", landmark: "Blue gate", propertyType: "boarding_house" },
} as unknown as Order;
// After the job ends the API sends the area again, never the pin.
const finished = { ...offered, state: "completed" } as unknown as Order;
const shop = {
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  supplierContact: { shopName: "PrintRight Davao", contactName: "Ana Reyes" },
  zone: null,
} as unknown as Order;

const IDLE = { phase: "idle" } as const;
const allSix = {
  quantity_match: true,
  specification_match: true,
  visible_defects: true,
  packaging_integrity: true,
  documentation: true,
  supplier_sign_off: true,
};

describe("a home printer job", () => {
  it("is recognised from the order or its contact, and a shop is not", () => {
    expect(isHomePrinter(offered)).toBe(true);
    expect(isHomePrinter({ supplierContact: contact })).toBe(true);
    expect(isHomePrinter(shop)).toBe(false);
    expect(homeBarangay(offered)).toBe("Sample Barangay");
  });

  it("offers the barangay only, with the pin promised after Accept", () => {
    expect(homeExactPickup(offered)).toBeNull();
    expect(homeOfferPickup(offered)).toEqual({ label: "Sample Barangay", note: "Exact pin shows after you accept" });
    expect(pickupLabel(offered)).toBe("Home printer, Sample Barangay");
    expect(tripShop(offered).point).toBeNull();
  });

  it("shows the exact pin and how to find the door only while the API gives it", () => {
    expect(homeExactPickup(active)).toEqual({
      point: { lat: 7.073412, lng: 125.612834 },
      street: "Sample Street",
      landmark: "Blue gate",
      propertyType: "boarding_house",
    });
    expect(homeOfferPickup(active)).toBeNull();
    expect(homePickupLabel(active)).toBe("Sample Street, Sample Barangay");
    expect(homeFindingLine(homeExactPickup(active)!)).toBe("Boarding house · Blue gate");
    expect(tripShop(active)).toMatchObject({
      point: { lat: 7.073412, lng: 125.612834 },
      overline: "NEXT STOP · HOME PRINTER",
      navTitle: "TO THE HOME PRINTER",
    });
    expect(HOME_DISCREET_NOTE).toBe("This is a private home, please be discreet.");
  });

  it("keeps nothing of the pin once the job is over", () => {
    expect(homeExactPickup(finished)).toBeNull();
    expect(pickupLabel(finished)).toBe("Home printer, Sample Barangay");
    expect(tripShop(finished).point).toBeNull();
  });

  it("never prefills a person's name, and asks who handed it over", () => {
    expect(defaultSignerName(active)).toBe("");
    // Even if an API ever sent one, a home printer's name is not offered.
    expect(defaultSignerName({ ...active, supplierContact: { ...contact, contactName: "Sample Person" } })).toBe("");
    expect(shopDisplayName(active)).toBe("The home printer");
    const copy = signerCopy(active);
    expect(copy.fieldLabel).toBe("Who handed it over?");
    expect(
      handoffBlockReason({ answers: allSix, signerName: "", signed: true, upload: IDLE, storedFileId: null, missingName: copy.missingName }),
    ).toBe("Type the name of the person who handed it over.");
  });

  it("calls the stop a home printer on the trip steps", () => {
    expect(tripStepAction(active, "pickup_checks", "to_shop").kind).toBe("arrive_shop");
    expect(tripStepAction(active, "pickup_checks", "to_shop")).toMatchObject({ label: "I'm at the home printer" });
    expect(tripStepNote(active, "pickup_checks", "to_shop")).toBe(
      "Ride to the home printer. Tap the button when you reach their door.",
    );
    expect(tripStepAction(active, "pickup_sign", "check")).toMatchObject({ label: "Printer signs the handoff" });
    expect(tripStepAction(active, "pickup_checks", "check")).toMatchObject({ label: "Start the pickup check" });
  });

  it("says the server's rounded distance as about, without re-rounding it", () => {
    const approx = (distanceMeters: number) =>
      ({ ...offered, travelEstimate: { distanceMeters, durationSeconds: null, source: "order_snapshot", distanceApproximate: true } }) as Order;
    expect(offerDistanceLabel(approx(1500))).toBe("About 1.5 km from pickup to drop-off");
    expect(offerDistanceLabel(approx(500))).toBe("About 500 m from pickup to drop-off");
    expect(offerDistanceLabel(approx(2000))).toBe("About 2 km from pickup to drop-off");
    expect(offerDistanceLabel({ ...offered, travelEstimate: { distanceMeters: null, durationSeconds: null, source: "order_snapshot" } } as Order)).toBeNull();
  });
});

describe("a shop job is unchanged", () => {
  it("keeps its label, stop words, signer and distance", () => {
    expect(pickupLabel(shop)).toBe("PrintRight, Matina");
    expect(tripShop(shop)).toMatchObject({ overline: "NEXT STOP · SHOP", navTitle: "TO THE SHOP" });
    expect(defaultSignerName(shop)).toBe("Ana Reyes");
    expect(shopDisplayName(shop)).toBe("PrintRight Davao");
    expect(signerCopy(shop).fieldLabel).toBe("Name of the person signing");
    expect(homeOfferPickup(shop)).toBeNull();
    expect(tripStepAction(shop, "pickup_checks", "to_shop")).toMatchObject({ label: "I'm at the shop" });
    expect(tripStepNote(shop, "pickup_checks", "to_shop")).toBe("Ride to the shop. Tap the button when you reach the counter.");
    expect(
      offerDistanceLabel({ ...shop, travelEstimate: { distanceMeters: 1234, durationSeconds: null, source: "order_snapshot" } } as Order),
    ).toBe("1.2 km from shop to drop-off");
  });
});
