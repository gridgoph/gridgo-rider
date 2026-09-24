import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createElement, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import RootLayout from "@/app/_layout";
import type { User } from "@/lib/api";
import { resetAppUpdateForTests, useAppUpdate } from "@/store/appUpdate";
import { useSession } from "@/store/session";

/**
 * The path firstmate tests on a phone: Expo Go on Android, served by
 * `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=90 npx expo start --go`, signed
 * out, the real root layout from launch through the opening to the sheet.
 *
 * The navigator is a stand-in that presents whatever route the prompt pushes,
 * so what is exercised is everything between launch and `router.push`: the
 * launch gate, the opening, the override reaching the build, the release read,
 * and the presentation guards.
 */

jest.mock("@/hooks/useAppFonts", () => ({ useAppFonts: () => true }));
jest.mock("@/hooks/useClerkSessionBridge", () => ({ useClerkSessionBridge: () => true }));
jest.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: jest.fn() }));
jest.mock("@/hooks/useAlertStream", () => ({ useAlertStream: jest.fn() }));
jest.mock("@/hooks/useSupportChatUnread", () => ({ useSupportChatUnread: jest.fn() }));
jest.mock("@/hooks/useTripTracking", () => ({ useTripTracking: jest.fn() }));
jest.mock("@/hooks/useArrivalAlert", () => ({ useArrivalAlert: jest.fn() }));

// The opening finishes on its own, the way it does on a phone.
jest.mock("@/components/BrandIntro", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    BrandIntro: ({ onDone }: { onDone: () => void }) => {
      useEffect(() => {
        const timer = setTimeout(onDone, 50);
        return () => clearTimeout(timer);
      }, [onDone]);
      return null;
    },
  };
});

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(async () => undefined) }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  SafeAreaProvider: ({ children }: { children?: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("expo-router/react-navigation", () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

/**
 * A Stack that starts empty every time it mounts — as the real one does when
 * the root layout re-keys it for a new owner — and draws the update sheet when
 * it is pushed.
 */
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  let present: ((href: string | null) => void) | null = null;
  const router = {
    push: jest.fn((href: string) => present?.(href)),
    back: jest.fn(() => present?.(null)),
    replace: jest.fn(),
  };
  function Stack() {
    const [route, setRoute] = React.useState(null);
    React.useEffect(() => {
      present = setRoute;
      return () => {
        if (present === setRoute) present = null;
      };
    }, []);
    if (route !== "/app-update") return null;
    const AppUpdateSheet = jest.requireActual("@/app/app-update").default;
    return React.createElement(AppUpdateSheet);
  }
  Stack.Screen = function MockStackScreen() {
    return null;
  };
  return {
    Stack,
    router,
    useRouter: () => router,
    // Signed out, the launch redirect has landed on welcome.
    useSegments: () => ["(auth)", "welcome"],
    useRootNavigationState: () => ({ key: "root" }),
  };
});

// Expo Go: no real versionCode, so only the dev override can make a build.
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
  default: {
    appOwnership: "expo",
    executionEnvironment: "storeClient",
    expoConfig: { version: "1.0.0", android: { versionCode: 1 }, extra: {} },
  },
}));

const mockedAppState = AppState.currentState;
const TITLE = "A new version of GRIDGO is ready";

function releaseAnswer() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "v1.0.95", draft: false, prerelease: false }),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetAppUpdateForTests();
  useSession.setState({ user: null, hydrated: false, loading: false, error: null });
  jest.clearAllMocks();
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE = "90";
  jest.replaceProperty(Platform, "OS", "android");
  // React Native's Jest mock stands a function in for the state; a phone that
  // has just opened the app is in front.
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  jest.spyOn(global, "fetch").mockImplementation(
    async () => releaseAnswer() as unknown as Response,
  );
});

afterEach(() => {
  Object.defineProperty(AppState, "currentState", { value: mockedAppState, configurable: true });
  delete process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE;
  jest.restoreAllMocks();
});

describe("root layout, forced update check in Expo Go", () => {
  it("offers the latest release once the opening is over, signed out, and logs why", async () => {
    await render(createElement(RootLayout));

    expect(await screen.findByText(TITLE, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("1.0.90")).toBeTruthy();
    expect(screen.getByText("1.0.95")).toBeTruthy();

    const releaseReads = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("/releases/latest"),
    );
    expect(releaseReads).toHaveLength(1);
    expect(releaseReads[0][1].headers["User-Agent"]).toBe("GRIDGO-rider");
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] installed 1.0.90 (versionCode 90, forced by override)",
    );
    expect(console.info).toHaveBeenCalledWith("[update-check] latest release is 1.0.95");
    expect(console.info).toHaveBeenCalledWith("[update-check] offering 1.0.95 over 1.0.90");
    expect(console.info).toHaveBeenCalledWith("[update-check] presenting the update sheet");
  });

  // The root layout re-keys the whole Stack when the signed-in owner changes,
  // which unmounts an open sheet without anyone touching it. That must not be
  // remembered as "Later", or the release is silently put off for the day.
  it("offers again, not put off, when the stack remounts under the open sheet", async () => {
    await render(createElement(RootLayout));
    expect(await screen.findByText(TITLE, {}, { timeout: 3000 })).toBeTruthy();

    await act(async () => {
      useSession.setState({ user: { id: "rider-1", role: "rider" } as User });
    });

    const { router } = jest.requireMock("expo-router");
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(useAppUpdate.getState().memory.dismissed).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] the sheet was taken down without an answer; it will be shown again",
    );
  });
});
