// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();

// Gesture Handler installs itself through a native module the JS-only test
// runtime does not have, and `GestureHandlerRootView` — which the root layout
// now renders — throws outright without it. Its own harness stands the module
// in, so a root render is a render rather than a crash.
require("react-native-gesture-handler/jestSetup");

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
