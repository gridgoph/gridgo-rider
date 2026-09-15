import { act, screen } from "@testing-library/react-native";
import { Slot } from "expo-router";
import { renderRouter } from "expo-router/testing-library";

import Index from "@/app/index";
import Login from "@/app/(auth)/login";
import Signup from "@/app/(auth)/signup";
import Welcome from "@/app/(auth)/welcome";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useClerkSessionBridge } from "@/hooks/useClerkSessionBridge";
import * as api from "@/lib/api";
import { CLERK_JOIN_TIMEOUT_MS } from "@/lib/authGate";
import { releaseClerkAdoptionBlock, useSession } from "@/store/session";

const mockGetToken = jest.fn(async () => "test-bearer");
const mockSignOut = jest.fn(async () => undefined);
const mockClaims = { sid: "recovery-session" };

// This test uses Slot, not the opt-in experimental navigator. Its ESM-only
// dependency is outside the project's Jest transform configuration.
jest.mock("expo-router/build/standard-navigation", () => ({}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true, isSignedIn: true,
    getToken: mockGetToken, sessionClaims: mockClaims,
  }),
  useUser: () => ({ isLoaded: false, user: null }),
  useClerk: () => ({ signOut: mockSignOut }),
  useSignIn: () => ({ isLoaded: true, signIn: {} }),
  useSignUp: () => ({ isLoaded: true, signUp: {} }),
}));

function RecoveryLayout() {
  useClerkSessionBridge();
  useAuthGate();
  return <Slot />;
}

// Real routes and navigation, with only the identity service and API boundary
// replaced. This checks that ending the store wait actually exposes recovery UI.
describe("Clerk join recovery screens", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    releaseClerkAdoptionBlock();
    useSession.getState().clearSession();
    useSession.setState({ hydrated: true });
    mockSignOut.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    api.setTokenProvider(null);
    releaseClerkAdoptionBlock();
    jest.useRealTimers();
  });

  async function launch() {
    const navigation = renderRouter({
      _layout: RecoveryLayout,
      index: Index,
      "(auth)/login": Login,
      "(auth)/signup": Signup,
      "(auth)/welcome": Welcome,
    }, { initialUrl: "/" });
    await navigation;
    return { pathname: () => navigation.getPathname() };
  }

  it("replaces the wait with actionable login recovery after 12 seconds", async () => {
    let finish!: (user: api.User) => void;
    const me = jest.spyOn(api, "me").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const navigation = await launch();
    expect(me).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Signing you in")).toBeTruthy();
    await act(async () => { await jest.advanceTimersByTimeAsync(CLERK_JOIN_TIMEOUT_MS - 1); });
    expect(screen.getByText("Signing you in")).toBeTruthy();
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(navigation.pathname()).toBe("/login");
    expect(screen.queryByText("Signing you in")).toBeNull();
    expect(screen.getByText(/Cannot reach GRIDGO at .*Check the phone's connection, then try again\./)).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();

    // A late network success must not silently admit the timed-out account.
    await act(async () => {
      finish({ id: "late", role: "rider", name: "Rider", email: "rider@test" });
    });
    expect(navigation.pathname()).toBe("/login");
    expect(useSession.getState().user).toBeNull();
  });

  it("shows the existing wrong-role message on login", async () => {
    jest.spyOn(api, "me").mockResolvedValue({
      id: "client", role: "client", name: "Client", email: "client@test",
    });
    const navigation = await launch();
    expect(navigation.pathname()).toBe("/login");
    expect(screen.getByText("This is a client account. Open the GRIDGO client app to sign in.")).toBeTruthy();
    expect(screen.queryByText("Signing you in")).toBeNull();
  });

  it("shows the application form for an unassigned identity", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, "unauthorized"));
    const navigation = await launch();
    expect(navigation.pathname()).toBe("/signup");
    expect(screen.getByText("Finish your application.")).toBeTruthy();
    expect(screen.queryByText("Signing you in")).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
