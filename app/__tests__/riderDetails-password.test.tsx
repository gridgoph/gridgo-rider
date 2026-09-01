import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    user: {
      imageUrl: null,
      hasImage: false,
      firstName: "Carlo",
      lastName: "Rider",
    },
  }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getRiderProfile: jest.fn(),
  updateRiderProfile: jest.fn(),
}));

import RiderDetailsScreen from "@/app/rider-details";
import { getRiderProfile, type RiderSelfProfile } from "@/lib/api";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as { push: jest.Mock };

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

/**
 * Own file: Your details already spends this stack's render budget on five
 * cases, and a sixth in the same file comes back empty (see AGENTS.md).
 */
describe("the password card on your details", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRiderProfile as jest.Mock).mockResolvedValue(PROFILE);
    useSession.setState({
      refreshUser: jest.fn(async () => undefined),
      user: { id: "usr_1", email: "carlo@example.com", name: "Carlo Rider", role: "rider" },
    });
  });

  it("opens the change-password screen from the sign-in card", async () => {
    const view = await render(<RiderDetailsScreen />);

    expect(await screen.findByText("••••••••")).toBeTruthy();
    fireEvent.press(screen.getByText("Change password"));
    expect(mockRouter.push).toHaveBeenCalledWith("/change-password");
    await view.unmount();
  });
});
