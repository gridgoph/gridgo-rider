import { fireEvent, render, screen } from "@testing-library/react-native";

const focusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => {
      focusCallbacks.push(callback);
      callback();
      return () => {
        const at = focusCallbacks.indexOf(callback);
        if (at >= 0) focusCallbacks.splice(at, 1);
      };
    }, [callback]);
  },
}));

const mockClerkUser = {
  firstName: "Carlo",
  lastName: "Rider",
  imageUrl: "https://img.clerk.test/carlo.jpg",
  hasImage: true,
};
jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => false),
}));

import AccountScreen from "@/app/(tabs)/account";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";
import { useActiveTrip } from "@/store/activeTrip";

const rider = {
  id: "u1",
  email: "carlo@gridgo.ph",
  name: "Carlo Rider",
  role: "rider" as const,
  riderProfile: {
    vehicleType: "motorcycle",
    vehiclePlate: "ABC 1234",
    licenseNumber: "N01-23-456789",
  },
};

const refreshUser = jest.fn(async () => undefined);
const logout = jest.fn(async () => undefined);

describe("the rider's account", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
    useSession.setState({
      user: rider,
      loading: false,
      error: null,
      authSource: "clerk",
      refreshUser,
      logout,
    });
    useActiveTrip.setState({ order: null });
  });

  afterEach(async () => {
    await view?.unmount();
  });

  it("shows the Clerk photo and name, and opens the details screen from the card", async () => {
    view = await render(<AccountScreen />);

    expect(screen.getByLabelText("Carlo Rider, profile photo")).toBeTruthy();
    expect(screen.getByText("carlo@gridgo.ph")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Your details"));
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/rider-details");
  });

  it("asks before signing out", async () => {
    view = await render(<AccountScreen />);

    await fireEvent.press(screen.getByText("Sign out"));

    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Sign out of GRIDGO on this phone?",
        confirmLabel: "Sign out",
        cancelLabel: "Stay signed in",
        destructive: true,
      }),
    );
    expect(logout).not.toHaveBeenCalled();
  });
});
