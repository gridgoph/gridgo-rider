import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ChangePasswordScreen from "@/app/change-password";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
}));

jest.mock("expo-image-picker", () => {
  throw new Error("Cannot find native module 'ExponentImagePicker'");
});

const mockUpdatePassword = jest.fn(async () => undefined);

const mockClerkUser = {
  passwordEnabled: true,
  updatePassword: mockUpdatePassword,
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser, isLoaded: true }),
}));

/** Fill a labelled box and let the value land before the next is typed. */
async function type(label: string, value: string) {
  fireEvent.changeText(screen.getByLabelText(label), value);
  await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(value));
}

/**
 * Setting a new password on the sign-in.
 *
 * Clerk's own user resource does this — `user.updatePassword` — so the rider
 * stays signed in. The assertion that matters most is `signOutOfOtherSessions`.
 *
 * Validation-only tests come first. The submit drives async state, and this
 * stack can empty later renders in the same file once that has happened.
 */
describe("changing the sign-in password", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockUpdatePassword.mockClear();
  });

  it("names the needed validation under the field that still fails it", async () => {
    const view = await render(<ChangePasswordScreen />);

    expect(screen.getByText("Change your password")).toBeTruthy();
    expect(screen.getByText(/At least 8 characters/)).toBeTruthy();
    expect(screen.getByLabelText("Show current password")).toBeTruthy();
    expect(screen.getByLabelText("Show new password")).toBeTruthy();
    expect(screen.getByLabelText("Show confirm new password")).toBeTruthy();

    await type("New password", "short");
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();

    fireEvent.press(screen.getByText("Change password"));

    expect(await screen.findByText("Enter the password you sign in with now.")).toBeTruthy();
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("sends both passwords to Clerk and signs every other session out", async () => {
    const view = await render(<ChangePasswordScreen />);

    expect(
      screen.getByText(/signs you out everywhere else you are signed in/i),
    ).toBeTruthy();

    await type("Current password", "oldpassword");
    await type("New password", "newpassword");
    await type("Confirm new password", "newpassword");

    fireEvent.press(screen.getByText("Change password"));

    await waitFor(() =>
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: "oldpassword",
        newPassword: "newpassword",
        signOutOfOtherSessions: true,
      }),
    );

    await waitFor(() => expect(screen.getByText("Password changed")).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
    await view.unmount();
  });
});
