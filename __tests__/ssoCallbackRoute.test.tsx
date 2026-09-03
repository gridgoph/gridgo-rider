import { render, screen } from "@testing-library/react-native";
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

  it("stays on Signing you in and does not dump onto Welcome", async () => {
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

    expect(screen.getByText("Signing you in")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
