import { fireEvent, render, screen } from "@testing-library/react-native";

import SignupScreen from "@/app/(auth)/signup";
import { useLegalLibrary } from "@/store/legalLibrary";

const mockSignUpPassword = jest.fn(async () => ({ error: null }));

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: jest.fn(async () => null) }),
  useUser: () => ({ user: null }),
  useClerk: () => ({ setActive: jest.fn(), signOut: jest.fn(async () => undefined) }),
  useSignUp: () => ({ signUp: { password: mockSignUpPassword } }),
}));

/**
 * The rider app said "At least 8 characters" while Clerk wanted 15, so a short
 * password passed the whole form and was refused by Clerk after "Apply to
 * ride" (same mismatch as gridgo-supplier#215). The rule is said and held on
 * the field, before Clerk is ever asked.
 */
describe("apply password", () => {
  beforeEach(() => {
    mockSignUpPassword.mockClear();
    useLegalLibrary.setState({ documents: [], status: "unsupported", load: jest.fn(async () => {}) });
  });

  it("states Clerk's minimum and stops a shorter password on the field", async () => {
    const view = await render(<SignupScreen />);

    expect(screen.getByText("At least 15 characters.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Full name"), "Carlo Rider");
    await fireEvent.changeText(screen.getByLabelText("Email"), "carlo@example.com");
    await fireEvent.changeText(screen.getByLabelText("Phone"), "09171234567");
    await fireEvent.changeText(screen.getByLabelText("Password"), "eight-ok");
    await fireEvent(screen.getByLabelText("Password"), "blur");

    expect(await screen.findByText("Use at least 15 characters.")).toBeTruthy();
    expect(screen.queryByText("At least 15 characters.")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "eight-ok");
    await fireEvent(screen.getByLabelText("Licence number"), "submitEditing");
    expect(mockSignUpPassword).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Password"), "fifteen-or-more");
    expect(screen.queryByText("Use at least 15 characters.")).toBeNull();
    expect(screen.getByText("At least 15 characters.")).toBeTruthy();
    await view.unmount();
  });
});
