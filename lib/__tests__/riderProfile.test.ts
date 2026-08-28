import { ApiError, type RiderSelfProfile } from "@/lib/api";
import * as api from "@/lib/api";
import {
  draftFromProfile,
  hasRiderDetailChanges,
  loadRiderDetails,
  riderDetailPatch,
  riderDetailProblems,
  saveRiderDetails,
  type RiderDetailDraft,
} from "@/lib/riderProfile";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getRiderProfile: jest.fn(),
  updateRiderProfile: jest.fn(),
}));

const getRiderProfile = api.getRiderProfile as jest.MockedFunction<typeof api.getRiderProfile>;
const updateRiderProfile = api.updateRiderProfile as jest.MockedFunction<
  typeof api.updateRiderProfile
>;

const PROFILE: RiderSelfProfile = {
  userId: "usr_1",
  name: "Carlo Rider",
  phone: "+639171234567",
  email: "carlo@example.com",
  vehicleType: "motorcycle",
  plateNumber: "ABC 1234",
  licenseNumber: "N01-23-456789",
  version: 3,
  updatedAt: "2026-08-20T02:00:00.000Z",
};

const DRAFT: RiderDetailDraft = {
  name: "Carlo Rider",
  phone: "+639171234567",
  vehicleType: "motorcycle",
  plateNumber: "ABC 1234",
  licenseNumber: "N01-23-456789",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loading the rider's details", () => {
  it("returns the profile GRIDGO answered with", async () => {
    getRiderProfile.mockResolvedValue(PROFILE);

    await expect(loadRiderDetails()).resolves.toEqual({ status: "ok", value: PROFILE });
  });

  it.each([404, 405])("reads %s as not open yet rather than a failure", async (status) => {
    getRiderProfile.mockRejectedValue(new ApiError(status, { error: "not_found" }));

    await expect(loadRiderDetails()).resolves.toEqual({ status: "not_open_yet" });
  });
});

describe("saving the rider's details", () => {
  it("passes the version and only the given fields to GRIDGO", async () => {
    updateRiderProfile.mockResolvedValue({ ...PROFILE, version: 4 });

    const outcome = await saveRiderDetails(3, { name: "Carlo Dela Cruz" });

    expect(updateRiderProfile).toHaveBeenCalledWith(3, {
      name: "Carlo Dela Cruz",
    });
    expect(outcome).toEqual({ status: "ok", value: { ...PROFILE, version: 4 } });
  });

  it("reads 409 as stale, not as a failure to try again", async () => {
    updateRiderProfile.mockRejectedValue(
      new ApiError(409, {
        error: "rider_profile_stale",
        expectedVersion: 3,
        currentVersion: 4,
      }),
    );

    await expect(saveRiderDetails(3, { name: "x" })).resolves.toEqual({ status: "stale" });
  });

  it("puts a refusal on the field GRIDGO named", async () => {
    updateRiderProfile.mockRejectedValue(
      new ApiError(400, {
        error: "invalid_rider_profile",
        field: "phone",
        message: "phone must be a valid PH mobile number",
      }),
    );

    const outcome = await saveRiderDetails(3, { phone: "0917" });

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected a failure");
    expect(outcome.field).toBe("phone");
    expect(outcome.message).toContain("mobile number");
    expect(outcome.message).not.toContain("must be a valid PH");
  });
});

describe("what is worth sending", () => {
  it("sends nothing when nothing moved", () => {
    expect(riderDetailPatch(PROFILE, DRAFT)).toEqual({});
    expect(hasRiderDetailChanges(PROFILE, DRAFT)).toBe(false);
  });

  it("sends only the plate when that is what changed", () => {
    expect(riderDetailPatch(PROFILE, { ...DRAFT, plateNumber: "XYZ 9876" })).toEqual({
      plateNumber: "XYZ 9876",
    });
  });

  it("prefers the live Clerk name when filling the draft", () => {
    expect(draftFromProfile(PROFILE, "Carlo Dela Cruz").name).toBe("Carlo Dela Cruz");
  });
});

describe("what is still wrong with it", () => {
  it("asks for a name, a number, a vehicle, a plate and a licence", () => {
    const problems = riderDetailProblems({
      name: " ",
      phone: "0917",
      vehicleType: null,
      plateNumber: " ",
      licenseNumber: " ",
    });
    expect(problems.name).toMatch(/name/i);
    expect(problems.phone).toMatch(/mobile/i);
    expect(problems.vehicleType).toMatch(/vehicle/i);
    expect(problems.plateNumber).toMatch(/plate/i);
    expect(problems.licenseNumber).toMatch(/licence/i);
  });
});
