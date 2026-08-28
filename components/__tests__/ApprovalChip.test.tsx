import { render, screen } from "@testing-library/react-native";

import { ApprovalChip } from "@/components/ApprovalChip";
import type { VerificationStatus } from "@/lib/api";
import { useSession } from "@/store/session";

function signedInAs(verificationStatus: VerificationStatus) {
  useSession.setState({
    user: { id: "user_rider", role: "rider", verificationStatus } as never,
  });
}

describe("ApprovalChip", () => {
  beforeEach(() => {
    useSession.setState({ user: null });
  });

  it("says nothing at all once the account is accredited", async () => {
    signedInAs("approved");

    await render(<ApprovalChip />);

    // A permanent "Approved" on every screen is the app congratulating itself.
    expect(screen.queryByTestId("status-chip-icon")).toBeNull();
    expect(screen.queryByText(/approved/i)).toBeNull();
  });

  it("says nothing before the account has loaded", async () => {
    // A signed-out or not-yet-read store must not flash a wait the rider is not
    // in — see `verificationStatusOf`, which treats no status as approved.
    await render(<ApprovalChip />);

    expect(screen.queryByTestId("status-chip-icon")).toBeNull();
  });

  it("names the wait while Operations is reviewing the account", async () => {
    signedInAs("pending");

    await render(<ApprovalChip />);

    expect(screen.getByText("In review")).toBeTruthy();
    // Colour never carries it alone: the chip is icon plus label.
    expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
  });

  // Every state that stops a rider working says so, in its own words.
  it.each([
    ["unverified", "In review"],
    ["suspended", "Suspended"],
    ["rejected", "Not accredited"],
  ] as [VerificationStatus, string][])("names a %s account", async (status, label) => {
    signedInAs(status);

    await render(<ApprovalChip />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("is read, not pressed", async () => {
    // There is nowhere to send a rider under review that they are not already
    // looking at, so the chip is deliberately not a control.
    signedInAs("pending");

    await render(<ApprovalChip />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
