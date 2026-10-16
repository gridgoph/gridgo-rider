import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { APPLE_SIGN_UP_INCOMPLETE } from "@/lib/appleSignIn";

const mockStartApple = jest.fn();
const mockSetActive = jest.fn(async () => undefined);

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({ signIn: { status: "needs_identifier" }, fetchStatus: "idle" }),
  useAuth: () => ({ isSignedIn: false, isLoaded: true, getToken: jest.fn(async () => null) }),
  useClerk: () => ({ setActive: mockSetActive, signOut: jest.fn(async () => undefined) }),
}));

jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: mockStartApple }),
}));

const mockSessionState = {
  user: null,
  loading: false,
  error: null as string | null,
  clearError: jest.fn(),
  beginSessionWait: jest.fn(),
  clearSessionWait: jest.fn(),
};

jest.mock("@/store/session", () => {
  const useSession = (selector: (s: typeof mockSessionState) => unknown) =>
    selector(mockSessionState);
  useSession.getState = () => mockSessionState;
  return {
    isSignedIn: () => false,
    isClerkAdoptionBlocked: () => false,
    useSession,
  };
});

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/devLogin", () => ({ DEV_LOGIN: null }));

import LoginScreen from "@/app/(auth)/login";

/**
 * Sign in with Apple on the login screen (iPhone; the Jest preset runs as
 * iOS, so `AppleButton.ios.tsx` is the one rendered). One press per test.
 */
describe("Sign in with Apple", () => {
  beforeEach(() => {
    mockStartApple.mockReset();
    mockSetActive.mockClear();
    mockSessionState.beginSessionWait.mockClear();
    mockSessionState.clearSessionWait.mockClear();
  });

  it("puts Apple's button above Google's", async () => {
    await render(<LoginScreen />);
    const labels = screen
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel as string | undefined);
    expect(labels.indexOf("Continue with Apple")).toBeGreaterThan(-1);
    expect(labels.indexOf("Continue with Apple")).toBeLessThan(
      labels.indexOf("Continue with Google"),
    );
  });

  it("activates Apple's session and waits for the rider account like Google does", async () => {
    mockStartApple.mockResolvedValue({ createdSessionId: "sess_apple" });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByLabelText("Continue with Apple"));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_apple" }));
    await waitFor(() => expect(mockSessionState.beginSessionWait).toHaveBeenCalledWith("in"));
    await waitFor(() => expect(screen.getByText("Sign in")).toBeTruthy());
    expect(screen.queryByText("Not signed in")).toBeNull();
  });

  it("says nothing when the rider closes Apple's sheet", async () => {
    mockStartApple.mockResolvedValue({ createdSessionId: null });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByLabelText("Continue with Apple"));

    await waitFor(() => expect(mockStartApple).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Sign in")).toBeTruthy());
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockSessionState.beginSessionWait).not.toHaveBeenCalled();
    expect(screen.queryByText("Not signed in")).toBeNull();
  });

  it("says nothing either when Apple reports the cancel as an error", async () => {
    mockStartApple.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByLabelText("Continue with Apple"));

    await waitFor(() => expect(mockStartApple).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Sign in")).toBeTruthy());
    expect(screen.queryByText("Not signed in")).toBeNull();
  });

  it("says what is missing when Clerk cannot finish the Apple sign-up", async () => {
    mockStartApple.mockResolvedValue({
      createdSessionId: null,
      signUp: { status: "missing_requirements", missingFields: ["phone_number"] },
    });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByLabelText("Continue with Apple"));

    expect(await screen.findByText(APPLE_SIGN_UP_INCOMPLETE)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Sign in")).toBeTruthy());
  });
});
