import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SessionShell } from "@/components/SessionShell";
import { useSession } from "@/store/session";

const tabs = (
  <>
    <Text>Offers</Text>
    <Text>Active</Text>
    <Text>Map</Text>
    <Text>Earnings</Text>
    <Text>Account</Text>
  </>
);

afterEach(() => {
  useSession.setState({ user: null });
});

describe("suspended /auth/me", () => {
  it("renders the reason and does not render the main tabs", async () => {
    useSession.setState({
      user: {
        id: "user_rider",
        email: "rider@gridgo.test",
        name: "Ria Rider",
        role: "rider",
        accountStatus: "suspended",
        accountStatusReason: "Licence review",
      },
    });

    await render(<SessionShell>{tabs}</SessionShell>);

    expect(screen.getByText("This account is suspended.")).toBeTruthy();
    expect(screen.getByText("Licence review")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.queryByText("Offers")).toBeNull();
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryByText("Map")).toBeNull();
    expect(screen.queryByText("Earnings")).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();
  });
});
