import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

const mockClerkUser = {
  imageUrl: null as string | null,
  hasImage: false,
  firstName: "Carlo",
  lastName: "Rider",
  setProfileImage: jest.fn(async () => undefined),
  update: jest.fn(async () => undefined),
  reload: jest.fn(async () => undefined),
};
jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getRiderProfile: jest.fn(),
  updateRiderProfile: jest.fn(),
}));

import RiderDetailsScreen from "@/app/rider-details";
import { ApiError, getRiderProfile, updateRiderProfile, type RiderSelfProfile } from "@/lib/api";
import { invalidate } from "@/lib/live";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as { back: jest.Mock; push: jest.Mock };

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

const refreshUser = jest.fn(async () => undefined);

function load(profile: RiderSelfProfile = PROFILE) {
  (getRiderProfile as jest.Mock).mockResolvedValue(profile);
}

describe("the rider's own details", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ refreshUser, user: { id: "usr_1", email: "carlo@example.com", name: "Carlo Rider", role: "rider" } });
  });

  it("shows the details GRIDGO has on file", async () => {
    load();

    const view = await render(<RiderDetailsScreen />);

    expect((await screen.findByLabelText("Name")).props.value).toBe("Carlo Rider");
    expect(screen.getByLabelText("Mobile number").props.value).toBe("+639171234567");
    expect(screen.getByLabelText("Plate number").props.value).toBe("ABC 1234");
    expect(screen.getByText("carlo@example.com")).toBeTruthy();
    expect(screen.queryByDisplayValue("carlo@example.com")).toBeNull();
    expect(screen.getByText("Change password")).toBeTruthy();
    expect(screen.getByText("••••••••")).toBeTruthy();
    await view.unmount();
  });

  it("offers the rider's picture without touching GRIDGO details", async () => {
    load();

    const view = await render(<RiderDetailsScreen />);

    expect(await screen.findByText("Add a photo")).toBeTruthy();
    expect(updateRiderProfile).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("offers no save until something actually changes", async () => {
    load();

    const view = await render(<RiderDetailsScreen />);
    const name = await screen.findByLabelText("Name");

    expect(screen.queryByText("Save changes")).toBeNull();
    expect(screen.getByText(/Change one to save it/)).toBeTruthy();

    await fireEvent.changeText(name, "Carlo Dela Cruz");

    expect(screen.getByText("Save changes")).toBeTruthy();
    await view.unmount();
  });

  it("sends only the field that changed, against the version it read", async () => {
    load();
    (updateRiderProfile as jest.Mock).mockResolvedValue({
      ...PROFILE,
      name: "Carlo Dela Cruz",
      version: 4,
    });

    const view = await render(<RiderDetailsScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name"), "Carlo Dela Cruz");
    await fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(updateRiderProfile).toHaveBeenCalledWith(3, {
        name: "Carlo Dela Cruz",
      });
    });
    expect(mockClerkUser.update).toHaveBeenCalledWith({
      firstName: "Carlo",
      lastName: "Dela Cruz",
    });
    expect(mockRouter.back).toHaveBeenCalled();
    await view.unmount();
  });

  it("keeps a stale save on the screen and offers the latest", async () => {
    load();
    (updateRiderProfile as jest.Mock).mockRejectedValue(
      new ApiError(409, { error: "rider_profile_stale" }),
    );

    const view = await render(<RiderDetailsScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Plate number"), "XYZ 9876");
    await fireEvent.press(screen.getByText("Save changes"));

    expect(await screen.findByText(/changed somewhere else/)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await view.unmount();
  });
  it("keeps the edited draft paired with its original version until explicit reload", async () => {
    jest.useFakeTimers();
    load();
    (updateRiderProfile as jest.Mock).mockRejectedValue(new ApiError(409, { error: "rider_profile_stale" }));
    try {
      await render(<RiderDetailsScreen />);
      await fireEvent.changeText(screen.getByLabelText("Plate number"), "XYZ 9876");
      load({ ...PROFILE, phone: "+639189876543", version: 4 });
      await act(async () => { invalidate("identity"); await jest.advanceTimersByTimeAsync(100); });
      expect(screen.getByLabelText("Mobile number").props.value).toBe(PROFILE.phone);
      await fireEvent.press(screen.getByText("Save changes"));
      expect(updateRiderProfile).toHaveBeenLastCalledWith(3, { plateNumber: "XYZ 9876" });
      await fireEvent.press(screen.getByText("Load the latest"));
      expect(screen.getByLabelText("Mobile number").props.value).toBe("+639189876543");
      await fireEvent.changeText(screen.getByLabelText("Plate number"), "NEW 1234");
      await fireEvent.press(screen.getByText("Save changes"));
      expect(updateRiderProfile).toHaveBeenLastCalledWith(4, { plateNumber: "NEW 1234" });
    } finally { jest.useRealTimers(); }
  });

  it.each(["success", "failure"])("ignores an older profile %s after newer details arrive", async (outcome) => {
    jest.useFakeTimers();
    let finish!: (value: RiderSelfProfile) => void;
    let fail!: (error: Error) => void;
    (getRiderProfile as jest.Mock).mockReturnValueOnce(new Promise<RiderSelfProfile>((resolve, reject) => { finish = resolve; fail = reject; }))
      .mockResolvedValue({ ...PROFILE, phone: "+639189876543", version: 4 });
    try {
      await render(<RiderDetailsScreen />);
      await act(async () => { invalidate("identity"); await jest.advanceTimersByTimeAsync(100); });
      await act(async () => { if (outcome === "success") finish(PROFILE); else fail(new Error("offline")); });
      expect(screen.getByLabelText("Mobile number").props.value).toBe("+639189876543");
      expect(screen.queryByText("Could not refresh")).toBeNull();
    } finally { jest.useRealTimers(); }
  });

  it.each([false, true])("preserves explicit reload intent across a background read, then edited: %s", async (editAgain) => {
    jest.useFakeTimers();
    load();
    (updateRiderProfile as jest.Mock).mockRejectedValue(new ApiError(409, { error: "rider_profile_stale" }));
    let finishExplicit!: (profile: RiderSelfProfile) => void;
    let finishBackground!: (profile: RiderSelfProfile) => void;
    try {
      await render(<RiderDetailsScreen />);
      await fireEvent.changeText(screen.getByLabelText("Plate number"), "XYZ 9876");
      await fireEvent.press(screen.getByText("Save changes"));
      (getRiderProfile as jest.Mock)
        .mockReturnValueOnce(new Promise<RiderSelfProfile>((resolve) => { finishExplicit = resolve; }))
        .mockReturnValueOnce(new Promise<RiderSelfProfile>((resolve) => { finishBackground = resolve; }));
      await fireEvent.press(screen.getByText("Load the latest"));
      await act(async () => { invalidate("identity"); await jest.advanceTimersByTimeAsync(100); });
      if (editAgain) await fireEvent.changeText(screen.getByLabelText("Plate number"), "NEW 1234");
      await act(async () => { finishExplicit({ ...PROFILE, phone: "+639189876543", version: 4 }); });
      await act(async () => { finishBackground({ ...PROFILE, phone: "+639199876543", version: 5 }); });
      expect(screen.getByLabelText("Mobile number").props.value).toBe(editAgain ? PROFILE.phone : "+639199876543");
      expect(screen.getByLabelText("Plate number").props.value).toBe(editAgain ? "NEW 1234" : PROFILE.plateNumber);
      if (!editAgain) {
        expect(screen.queryByText("Load the latest")).toBeNull();
        await fireEvent.changeText(screen.getByLabelText("Plate number"), "NEW 1234");
      }
      await fireEvent.press(screen.getByText("Save changes"));
      expect(updateRiderProfile).toHaveBeenLastCalledWith(editAgain ? 3 : 5, { plateNumber: "NEW 1234" });
    } finally { jest.useRealTimers(); }
  });

});
