import { render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SsoCallbackScreen from "@/app/sso-callback";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

describe("SSO callback route", () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it("matches Clerk's default callback path and quietly returns to launch", async () => {
    await render(<SsoCallbackScreen />, {
      wrapper: ({ children }) => (
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 47, left: 0, right: 0, bottom: 34 },
          }}
        >
          {children}
        </SafeAreaProvider>
      ),
    });

    expect(screen.getByText("Signing you in…")).toBeTruthy();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });
});
