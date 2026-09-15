// Reanimated 4 / Worklets 0.10 load a native TurboModule at import time.
// Jest has no UI runtime, so the Worklets mock must stand in before Reanimated
// calls setUpTests — otherwise every suite dies on `loadUnpackers`.
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/src/mock"),
);

// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();

// Screen reads insets from the provider. A test that renders a route
// without wrapping one used to throw; fall back to zero so those tests
// still exercise the screen. Tests that wrap a provider (Screen itself)
// keep the seeded metrics.
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => {
      const insets = React.useContext(actual.SafeAreaInsetsContext);
      return insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    },
  };
});

// Gesture Handler installs itself through a native module the JS-only test
// runtime does not have, and `GestureHandlerRootView` — which the root layout
// now renders — throws outright without it. Its own harness stands the module
// in, so a root render is a render rather than a crash.
require("react-native-gesture-handler/jestSetup");

// Clerk restores its session through native SecureStore in the app. Unit tests
// exercise our bridge and routing around a deterministic signed-out client;
// the SDK's own storage/network implementation is outside this JS runtime.
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_jest-only";
jest.mock("@clerk/expo", () => {
  const signOut = jest.fn(async () => undefined);
  const signIn = {
    status: "needs_identifier",
    existingSession: null,
    supportedSecondFactors: [],
    password: jest.fn(async () => ({ error: null })),
    create: jest.fn(async () => ({ error: null })),
    finalize: jest.fn(async () => ({ error: null })),
    mfa: {
      sendEmailCode: jest.fn(async () => ({ error: null })),
      verifyEmailCode: jest.fn(async () => ({ error: null })),
      sendPhoneCode: jest.fn(async () => ({ error: null })),
      verifyPhoneCode: jest.fn(async () => ({ error: null })),
      verifyTOTP: jest.fn(async () => ({ error: null })),
      verifyBackupCode: jest.fn(async () => ({ error: null })),
    },
    resetPasswordEmailCode: {
      sendCode: jest.fn(async () => ({ error: null })),
      verifyCode: jest.fn(async () => ({ error: null })),
      submitPassword: jest.fn(async () => ({ error: null })),
    },
  };
  const signUp = {
    status: "missing_requirements",
    ticket: jest.fn(async () => ({ error: null })),
    password: jest.fn(async () => ({ error: null })),
    finalize: jest.fn(async () => ({ error: null })),
  };
  return {
    ClerkProvider: ({ children }) => children,
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: false,
      getToken: jest.fn(async () => null),
      sessionClaims: null,
    }),
    useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
    useClerk: () => ({ signOut, setActive: jest.fn(async () => undefined) }),
    useSignIn: () => ({ isLoaded: true, signIn }),
    useSignUp: () => ({ isLoaded: true, signUp }),
  };
});
jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({
    startSSOFlow: jest.fn(async () => ({
      createdSessionId: null,
      authSessionResult: { type: "cancel" },
    })),
  }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: undefined }));

// Keyboard handling is native too. The library ships its own harness, which
// stands `KeyboardAwareScrollView` in as a plain `ScrollView` and
// `KeyboardStickyView` as a `View` — so a form renders in tests, and the parts
// only a real keyboard can prove stay honestly out of scope here.
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

// Push is FCM through a native module, so there is nothing to exercise in Jest:
// the module's own surface is mocked to inert, and every rule the app applies to
// it lives in lib/push.ts and is unit-tested there directly. Permission is
// reported undetermined, which is the state a fresh phone is in — so a screen
// rendering PushEnableCard renders the ask, and no test accidentally asserts
// against a granted phone it never granted.
// Location is native. Arrival and the trip map read it; tests supply a fix
// only when they are about that. Default is "no permission asked yet, no fix".
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: "undetermined" })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));

jest.mock("expo-notifications", () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: "android", data: "test-fcm-token" })),
  scheduleNotificationAsync: jest.fn(async () => "arrival-test"),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// AsyncStorage is native; theme preference persistence uses an in-memory map in tests.
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      setItem: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key) => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

// Expo installs `fetch` lazily, on first read, through a getter that also
// requires expo-modules-core. A state update that lands after a test file has
// finished (a store settling a permission read, say) makes React look at the
// global for the first time, the install logs a warning into a console Jest
// has already frozen, and the whole run exits 1 with every test green. Reading
// it once here installs it while the Expo globals still exist.
void globalThis.fetch;
