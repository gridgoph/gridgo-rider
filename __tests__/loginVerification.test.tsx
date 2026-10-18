import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockSendEmailCode = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockSetActive = jest.fn(async () => undefined);

let mockSignInStatus = "needs_client_trust";
let mockSupportedSecondFactors: { strategy: string }[] = [{ strategy: "email_code" }];

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: {
      password: (...args: unknown[]) => mockPassword(...args),
      finalize: (...args: unknown[]) => mockFinalize(...args),
      mfa: {
        sendEmailCode: (...args: unknown[]) => mockSendEmailCode(...args),
        verifyEmailCode: (...args: unknown[]) => mockVerifyEmailCode(...args),
        sendPhoneCode: jest.fn(async () => ({ error: null })),
        verifyPhoneCode: jest.fn(async () => ({ error: null })),
        verifyTOTP: jest.fn(async () => ({ error: null })),
        verifyBackupCode: jest.fn(async () => ({ error: null })),
      },
      get status() {
        return mockSignInStatus;
      },
      existingSession: null,
      get supportedSecondFactors() {
        return mockSupportedSecondFactors;
      },
    },
    fetchStatus: "idle",
  }),
  useAuth: () => ({
    isSignedIn: false,
    isLoaded: true,
    getToken: jest.fn(async () => null),
  }),
  useClerk: () => ({ setActive: mockSetActive, signOut: mockSignOut }),
}));

const mockSessionState = {
  user: null as { id: string } | null,
  login: jest.fn(),
  loading: false,
  error: null as string | null,
  clearError: jest.fn(),
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

import LoginScreen from "@/app/(auth)/login";

describe("Sign in new-device verification", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_client_trust";
    mockSupportedSecondFactors = [{ strategy: "email_code" }];
    mockPassword.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
    mockSendEmailCode.mockReset().mockResolvedValue({ error: null });
    mockVerifyEmailCode.mockReset().mockImplementation(async () => {
      mockSignInStatus = "complete";
      return { error: null };
    });
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSessionState.user = null;
    mockSessionState.loading = false;
    mockSessionState.error = null;
    mockSessionState.clearError.mockClear();
  });

  async function typeCredentialsAndSubmit() {
    await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Email"),
        "mddprado00290@usep.edu.ph",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "Ilovekali@0990-mark");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Sign in"));
    });
  }

  it("does not treat new-device trust as a wrong password", async () => {
    await typeCredentialsAndSubmit();

    await waitFor(() => {
      expect(mockSendEmailCode).toHaveBeenCalled();
    });
    expect(screen.queryByText("Wrong email or password.")).toBeNull();
    expect(screen.getByText("Confirm it’s you.")).toBeTruthy();
    expect(
      screen.getByText(/GRIDGO sent a 6-digit code to mddprado00290@usep.edu.ph/),
    ).toBeTruthy();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("finalizes after the emailed code is accepted", async () => {
    await typeCredentialsAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId("login-code")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Emailed code"), "123456");
    });

    await waitFor(() => {
      expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
      expect(mockFinalize).toHaveBeenCalled();
    });
  });

  it("lands a refused account on the refusal, not on a resubmitted code", async () => {
    // The supplier and client accounts this app refuses. A second verify after
    // Clerk already finished is what Clerk answers with "already signed in".
    const refusal = "This is a supplier account. Open the GRIDGO supplier app to sign in.";
    mockVerifyEmailCode.mockImplementation(async () => {
      if (mockSignInStatus === "complete") {
        return { error: { errors: [{ longMessage: "You're already signed in." }] } };
      }
      mockSignInStatus = "complete";
      return { error: null };
    });
    // Finalizing hands the session to the bridge, which holds the screen on
    // Signing you in while /auth/me answers.
    mockFinalize.mockImplementation(async () => {
      mockSessionState.loading = true;
      return { error: null };
    });

    await typeCredentialsAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId("login-code")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Emailed code"), "424242");
    });
    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalled();
    });
    await screen.rerender(<LoginScreen />);

    // /auth/me refused the role; the bridge signed Clerk out and left the reason.
    mockSessionState.loading = false;
    mockSessionState.error = refusal;
    await screen.rerender(<LoginScreen />);

    await waitFor(() => {
      expect(screen.getByText(refusal)).toBeTruthy();
    });
    expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Not signed in")).toBeTruthy();
    expect(screen.queryByText("Code not accepted")).toBeNull();
    expect(screen.queryByText("You're already signed in.")).toBeNull();
  });

  it("still names a real password rejection", async () => {
    mockPassword.mockResolvedValue({
      error: { errors: [{ longMessage: "Password is incorrect. Try again, or use another method." }] },
    });

    await typeCredentialsAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Password is incorrect. Try again, or use another method.")).toBeTruthy();
    });
    expect(mockSendEmailCode).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirm it’s you.")).toBeNull();
  });
});
