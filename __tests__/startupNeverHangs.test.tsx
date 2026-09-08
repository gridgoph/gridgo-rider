import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";

import RootLayout from "@/app/_layout";
import { SESSION_STORAGE_KEY } from "@/lib/sessionStorage";
import { useSession } from "@/store/session";

/**
 * The black-screen regression.
 *
 * The rider app used to render nothing at all until the stored session had been
 * read back, and it held the splash up over that wait. Neither the read nor the
 * render gate had a deadline, so a storage call that never answered — which a
 * native AsyncStorage call can do on a device, and which synchronous
 * `localStorage` can never do on web — left the app as a permanent blank
 * rectangle with no way out.
 *
 * These tests drive the real root layout with storage that never settles, and
 * with fonts that never load. An app that reaches login is recoverable; an app
 * that renders nothing forever is not.
 */

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(async () => undefined),
}));

// SafeAreaProvider withholds its children until a layout pass gives it insets,
// and nothing lays out in Jest. Insets are not what these tests are about.
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

/** Fires whenever the layout gets as far as mounting the navigator. */
const mockShellMounted = jest.fn();

// The opening is motion on its own clock. These tests drive launch deadlines
// with fake timers; BrandIntro's cascade would keep scheduling work and is
// not what the black-screen gate is about.
jest.mock("@/components/BrandIntro", () => ({
  BrandIntro: () => null,
}));

// The layout only needs a navigator shaped like a Stack. The routes themselves
// are covered by their own screens' tests; what matters here is whether the
// shell is reached at all.
jest.mock("expo-router", () => {
  const Stack = () => {
    mockShellMounted();
    return null;
  };
  Stack.Screen = () => null;
  return {
    Stack,
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    useSegments: () => [],
    useRootNavigationState: () => ({ key: "stack-1" }),
  };
});

/** Flipped per test to stand in for an asset download that never finishes. */
let mockFontsLoaded = true;
jest.mock("expo-font", () => ({
  useFonts: () => [mockFontsLoaded, null],
}));

const getItem = AsyncStorage.getItem as jest.Mock;
const workingGetItem = getItem.getMockImplementation() as (
  key: string,
) => Promise<string | null>;

/**
 * Stall the session read only. The theme preference is read from the same store
 * and is not what the render gate waits on.
 */
function stallSessionRead(): void {
  getItem.mockImplementation((key: string) =>
    key === SESSION_STORAGE_KEY
      ? new Promise<string | null>(() => {})
      : workingGetItem(key),
  );
}

/**
 * Let every launch deadline expire, several times over.
 *
 * Flush React updates caused by the elapsed deadlines before asserting the shell.
 */
async function waitOutEveryDeadline(): Promise<void> {
  await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
}

describe("startup can never hang", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    mockFontsLoaded = true;
    mockShellMounted.mockClear();
    useSession.setState({ user: null, hydrated: false, loading: false, error: null });
    (SplashScreen.hideAsync as jest.Mock).mockClear();
    // The launch report is the point of the diagnostic, not test output.
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    getItem.mockImplementation(workingGetItem);
  });

  it("renders the app anyway when the session read never comes back", async () => {
    stallSessionRead();

    await render(<RootLayout />);

    // Still behind the splash while the read is in flight.
    expect(mockShellMounted).not.toHaveBeenCalled();

    await waitOutEveryDeadline();

    expect(mockShellMounted).toHaveBeenCalled();
  });

  it("hides the splash when the session read never comes back", async () => {
    stallSessionRead();

    await render(<RootLayout />);
    await waitOutEveryDeadline();

    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it("renders the app anyway when the fonts never load", async () => {
    mockFontsLoaded = false;

    await render(<RootLayout />);
    await waitOutEveryDeadline();

    expect(mockShellMounted).toHaveBeenCalled();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it("releases every gate that waits on the stored session", async () => {
    stallSessionRead();

    await render(<RootLayout />);
    await waitOutEveryDeadline();

    // `hydrated` is what the auth gate and app/index.tsx both wait on. If it
    // never flips, the shell mounts but every screen inside it renders null —
    // the same black screen one layer down.
    expect(useSession.getState().hydrated).toBe(true);
    expect(useSession.getState().user).toBeNull();
  });

  it("says in the log which part of startup stalled", async () => {
    stallSessionRead();

    await render(<RootLayout />);
    await waitOutEveryDeadline();

    // Without this, a black launch screen is indistinguishable from any other
    // black launch screen — which is exactly the position this bug left us in.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stored session"));
  });
});
