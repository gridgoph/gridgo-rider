import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getApiBase: () => "https://gridgo.example",
  health: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("@/store/session", () => ({
  isSignedIn: () => false,
  useSession: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      user: null,
      login: jest.fn(),
      loading: false,
      error: null,
    }),
}));

/**
 * The production path leaves credentials folded away. Mock the guard to
 * `null` so this suite describes what a shipped build renders — the live
 * `__DEV__` prefill is covered by `lib/__tests__/devLogin.guard.test.ts` and
 * the production-export scan.
 */
jest.mock("@/lib/devLogin", () => ({ DEV_LOGIN: null }));

import LoginScreen from "@/app/(auth)/login";

/**
 * Sign-in screen behaviour that is independent of the production-bundle proof.
 *
 * Credential *presence* in a shipped build is asserted by the export scan and
 * the source guard on `lib/devLogin.ts`. Here we prove the password reveal
 * control and the empty production path.
 */
describe("Sign in", () => {
  // @testing-library/react-native 14 made render async by default.
  it("hands nobody a credential when the guard is folded away", async () => {
    await render(<LoginScreen />);

    expect(screen.getByLabelText("Email").props.value).toBe("");
    expect(screen.getByLabelText("Password").props.value).toBe("");
  });

  it("defaults the password to hidden and flips the accessible label", async () => {
    await render(<LoginScreen />);

    expect(screen.getByLabelText("Show password")).toBeTruthy();
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId("password-visibility"));
    });

    expect(screen.getByLabelText("Hide password")).toBeTruthy();
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId("password-visibility"));
    });

    expect(screen.getByLabelText("Show password")).toBeTruthy();
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });

  it("keeps Android native field text centered and away from both strokes", async () => {
    await render(<LoginScreen />);

    expect(StyleSheet.flatten(screen.getByLabelText("Email").props.style)).toMatchObject({
      paddingStart: 16,
      paddingEnd: 16,
      includeFontPadding: false,
      textAlignVertical: "center",
    });
    expect(StyleSheet.flatten(screen.getByLabelText("Password").props.style)).toMatchObject({
      paddingStart: 16,
      paddingEnd: 56,
      includeFontPadding: false,
      textAlignVertical: "center",
    });
  });

  it("still says which host it is talking to, and what to do next", async () => {
    await render(<LoginScreen />);

    expect(screen.getByText(/gridgo\.example/)).toBeTruthy();
    expect(screen.getByText("Welcome Back.")).toBeTruthy();
    expect(screen.getByText("Let’s sign in")).toBeTruthy();
    expect(screen.getByText("Recover password")).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText("Need an account? Sign up")).toBeTruthy();
    expect(screen.queryByText(/Turn on alerts/i)).toBeNull();
    expect(screen.queryByText(/Client accounts/i)).toBeNull();
  });
});
