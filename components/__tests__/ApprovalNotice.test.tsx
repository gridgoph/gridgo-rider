import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ApprovalNotice } from "@/components/ApprovalNotice";
import { useSession } from "@/store/session";

const mockPush = jest.fn();
const mockPrefetch = jest.fn();
let focusScreen: (() => void) | undefined;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, prefetch: mockPrefetch }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react") as typeof import("react");
    useEffect(() => {
      focusScreen = callback;
      callback();
    }, [callback]);
  },
}));

function pendingRider() {
  useSession.setState({
    user: {
      id: "user_rider",
      role: "rider",
      verificationStatus: "pending",
      riderProfile: {
        vehicleType: "Motorcycle",
        vehiclePlate: "ABC 1234",
        licenseNumber: "L-99",
      },
    } as never,
  });
}

describe("ApprovalNotice", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPrefetch.mockClear();
    useSession.setState({ user: null });
  });

  it("prefetches onboarding while the wait is on screen, then opens it on tap", async () => {
    pendingRider();

    await render(<ApprovalNotice />);

    expect(mockPrefetch).toHaveBeenCalledWith("/onboarding");

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "See how a GRIDGO delivery works" }));
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/onboarding",
      params: { from: "offers" },
    });
    expect(screen.getByRole("button", { name: "Opening…" })).toBeTruthy();

    await act(async () => {
      focusScreen?.();
    });

    expect(
      screen.getByRole("button", { name: "See how a GRIDGO delivery works" }),
    ).toBeTruthy();
  });
});
