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
