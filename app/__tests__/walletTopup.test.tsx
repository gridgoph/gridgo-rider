import { render, screen, waitFor } from "@testing-library/react-native";

import { useSession } from "@/store/session";

import WalletTopupScreen from "@/app/wallet/topup";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useLocalSearchParams: () => ({ amount: "20000" }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getSettings: jest.fn(),
  getRiderWallet: jest.fn(),
  submitWalletTopup: jest.fn(),
}));

// The photo picker is native; the screen only needs its idle state here.
jest.mock("@/hooks/useCashPhoto", () => ({
  useCashPhoto: () => ({ phase: "none", fileId: null, uri: null, error: null, take: jest.fn(), retry: jest.fn(), forget: jest.fn() }),
}));
jest.mock("@/components/CashPhotoField", () => ({ CashPhotoField: () => null }));

const api = jest.requireMock("@/lib/api") as { getSettings: jest.Mock; getRiderWallet: jest.Mock; submitWalletTopup: jest.Mock };
const actual = jest.requireActual("@/lib/api") as typeof import("@/lib/api");

const rider = (verificationStatus: "pending" | "approved") => ({
  id: "user_rider",
  email: "rider@example.test",
  name: "Test Rider",
  role: "rider" as const,
  verificationStatus,
});

const settings = {
  cash: { enabled: true, limitMinor: 150_000, noShowWaitSeconds: 600 },
  paymentQr: { method: "gcash", caption: "GRIDGO", imageUrl: "/public/payment-qr?v=1" },
};
const wallet = {
  wallet: { balanceMinor: 0, availableMinor: 0, reservedMinor: 0, lowBalance: true, topupAmountsMinor: [20_000, 50_000, 100_000] },
  activity: [],
  incidents: [],
};

/*
  Cash review P2-1: the Wallet tab already kept an unapproved rider away from
  the wallet; the pushed top-up route has to as well, because it can be opened
  directly. The server would refuse the wallet read (403) — the point is that
  the app never asks, and never shows a send-money instruction.
*/
describe("top-up opened directly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getSettings.mockResolvedValue(settings);
    api.getRiderWallet.mockRejectedValue(new actual.ApiError(403, { error: "forbidden" }));
  });

  it("shows a pending rider the approval notice, reads nothing, and offers no payment", async () => {
    useSession.setState({ user: rider("pending") });
    await render(<WalletTopupScreen />);

    expect(await screen.findByText("Operations is reviewing your account")).toBeTruthy();
    expect(screen.getByText("Back to wallet")).toBeTruthy();
    expect(api.getRiderWallet).not.toHaveBeenCalled();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByText("Top up your wallet")).toBeNull();
    expect(screen.queryByText(/Send exactly/)).toBeNull();
    expect(screen.queryByText("Send for checking")).toBeNull();
    expect(api.submitWalletTopup).not.toHaveBeenCalled();
  });

  it("still opens the payment form for an approved rider", async () => {
    useSession.setState({ user: rider("approved") });
    api.getRiderWallet.mockResolvedValue(wallet);
    await render(<WalletTopupScreen />);

    await waitFor(() => expect(screen.getByText("Top up your wallet")).toBeTruthy());
    expect(screen.getByText("Send exactly ₱200.00")).toBeTruthy();
    expect(api.getRiderWallet).toHaveBeenCalledTimes(1);
  });
});
