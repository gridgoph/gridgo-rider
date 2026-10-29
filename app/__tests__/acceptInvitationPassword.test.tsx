import { fireEvent, render, screen } from "@testing-library/react-native";

import AcceptInvitationScreen from "@/app/(auth)/accept-invitation";

const mockTicket = jest.fn(async () => ({ error: null }));
const mockPassword = jest.fn(async () => ({ error: null }));

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({ __clerk_ticket: "ticket_123" }),
}));

jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({
    fetchStatus: "idle",
    signUp: {
      status: "missing_requirements",
      ticket: mockTicket,
      password: mockPassword,
      finalize: jest.fn(async () => ({ error: null })),
    },
  }),
}));

/** Same rule, same words as apply (gridgo-supplier#215). */
describe("accept invitation password", () => {
  it("states Clerk's minimum and does not send a shorter password", async () => {
    const view = await render(<AcceptInvitationScreen />);

    expect(screen.getByText("At least 15 characters.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Password"), "eight-ok");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "eight-ok");
    await fireEvent.press(screen.getByRole("button", { name: "Activate rider account" }));

    expect(await screen.findByText("Use at least 15 characters.")).toBeTruthy();
    expect(screen.queryByText("Invitation not accepted")).toBeNull();
    expect(mockTicket).not.toHaveBeenCalled();
    expect(mockPassword).not.toHaveBeenCalled();
    await view.unmount();
  });
});
