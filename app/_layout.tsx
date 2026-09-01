import "../global.css";

import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { colors, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useArrivalAlert } from "@/hooks/useArrivalAlert";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useClerkSessionBridge } from "@/hooks/useClerkSessionBridge";
import { useLaunchReady } from "@/hooks/useLaunchReady";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useHydrateTheme, useThemeColors, useThemeName } from "@/hooks/useTheme";
import {
  confirmSheetScreenOptions,
  fullBleedScreenOptions,
  multiOriginPushedScreenOptions,
} from "@/lib/navigationHeaders";
import { resolveClerkPublishableKey } from "@/lib/clerkAuth";
import { bindApiUnauthorizedHandler, useSession } from "@/store/session";

// Nothing may throw out of the launch path, including this.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** React Navigation reads plain colours, so it gets them from the token file. */
function navigationTheme(scheme: ThemeName): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const token = colors[scheme];

  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      background: token.canvas,
      card: token.surface,
      text: token.textPrimary,
      border: token.outline,
      primary: token.accent,
      notification: token.error,
    },
  };
}

/**
 * Session ↔ route binding lives here, not only in app/index.tsx.
 * Sign-out, 401, and expired tokens all clear the session; this gate
 * replace-navigates to welcome so (tabs) is not left on the back stack.
 */
function AuthGate({ children }: { children: ReactNode }) {
  useAuthGate();

  useEffect(() => {
    return bindApiUnauthorizedHandler();
  }, []);

  return <>{children}</>;
}

function AppShell() {
  const scheme = useThemeName();
  const token = useThemeColors();
  const fontsReady = useAppFonts();
  const sessionHydrated = useSession((s) => s.hydrated);
  const hydrateSession = useSession((s) => s.hydrate);
  const identityReady = useClerkSessionBridge();
  const launchReady = useLaunchReady({ fontsReady, sessionHydrated, identityReady });
  useHydrateTheme();
  // Must sit above the launch-ready gate: hooks cannot be skipped on the
  // frames that still return null. It never raises the permission dialog —
  // only `PushEnableCard` does that. Expo Go throws from the native module;
  // the hook wraps every call so that costs push, never the first frame.
  usePushNotifications();
  // Same seat as push: arrival is about where the phone is, not which screen
  // is open, so the geofence lives here rather than on the Active tab.
  useArrivalAlert();

  // Read the stored session here, not in the gate: the gate lives inside the
  // tree that this component refuses to render until hydration finishes.
  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  // Keeps the window behind the navigator on canvas, so theme changes and
  // screen transitions never flash the wrong background.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(token.canvas);
  }, [token.canvas]);

  // The splash covers the session read as well as the fonts. Hiding it earlier
  // shows a welcome screen to a rider who is already signed in. `launchReady` is
  // time-bounded, so this always fires — the splash can never be left up.
  useEffect(() => {
    if (launchReady) void SplashScreen.hideAsync().catch(() => {});
  }, [launchReady]);

  /*
    Nothing renders until the fonts AND the stored session are ready — or until
    the launch deadline passes, whichever comes first.

    Waiting is what keeps a signed-in rider off the welcome screen: a screen that
    mounts first fires its data load with no bearer, and the server answers 401.
    Waiting *without a deadline* is what turned a stalled storage read into a
    permanent black screen, so `useLaunchReady` gives up rather than hang.
  */
  if (!launchReady) return null;

  return (
    /*
      Insets synchronously, from the native module, on the very first frame.
      Without `initialWindowMetrics` the provider reports zero until it has
      measured, so every screen shell — and the tab bar's bottom padding —
      lays out once at the wrong size and again a frame later. On a phone that
      is a visible settle as content drops under the status bar. It costs
      nothing here and a browser never showed it.
    */
    /*
      Swipe gestures inside a screen — the Alerts list clears an alert by
      swiping it away — need a gesture root above them. Android does not fall
      back gracefully without one: the gesture simply never fires, which is a
      dead control rather than an error, and exactly the kind of thing a browser
      would never show.
    */
    /*
      The keyboard is a native surface, and on Android under edge-to-edge the
      window no longer resizes when it opens — `adjustResize` is what React
      Native's own `KeyboardAvoidingView` measures, so that component sat there
      doing nothing while the keyboard covered the field. This provider reads
      the IME inset frame by frame instead, which is what `FormScroll` and
      `StickyActionBar` are driven from.

      No `statusBarTranslucent` / `navigationBarTranslucent` here on purpose:
      the library detects Expo's edge-to-edge window at runtime and forces both
      on, and passing them explicitly only earns a dev warning that they were
      ignored. Nothing about the tab bar's geometry changes — the safe-area
      insets it measures are unaffected.
    */
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider value={navigationTheme(scheme)}>
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: token.surface },
              headerTintColor: token.textPrimary,
              headerTitleStyle: {
                fontSize: typography.h3.fontSize,
                fontFamily: typography.h3.fontFamily,
              },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: token.canvas },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="sso-callback"
              options={{ headerShown: false, title: "Signing in" }}
            />
            <Stack.Screen name="(auth)/welcome" options={{ headerShown: false }} />
            <Stack.Screen
              name="(auth)/signup"
              options={{ title: "Sign up", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="(auth)/login"
              options={{ title: "Sign in", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="(auth)/accept-invitation"
              options={{ title: "Invitation", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="(auth)/reset-password"
              options={{ title: "Recover password", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="onboarding"
              options={{
                headerShown: false,
                animation: "fade",
                contentStyle: { backgroundColor: token.canvas },
              }}
            />
            {/*
              The tab shell draws its own headers per tab, so its header is
              hidden — but it still needs a title. Screens pushed above it set
              their own back label (`multiOriginPushedScreenOptions`); this is
              the second line of defence, so that if one ever forgets, iOS
              labels the back control "GRIDGO" and never `(tabs)`.
            */}
            <Stack.Screen
              name="(tabs)"
              options={{ headerShown: false, title: "GRIDGO" }}
            />
            <Stack.Screen
              name="alerts"
              options={{ title: "Alerts", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="past-jobs"
              options={{ title: "Past jobs", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="past-job"
              options={{ title: "Past job", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="settings"
              options={{
                title: "Settings",
                ...multiOriginPushedScreenOptions,
              }}
            />
            <Stack.Screen
              name="rider-details"
              options={{
                title: "Your details",
                ...multiOriginPushedScreenOptions,
              }}
            />
            <Stack.Screen
              name="change-password"
              options={{
                title: "Password",
                ...multiOriginPushedScreenOptions,
              }}
            />
            <Stack.Screen
              name="design-system"
              options={{
                title: "Design system",
                ...multiOriginPushedScreenOptions,
              }}
            />
            {/*
              Each proof step is its own screen so it can carry one action.
              The titles name the step, which lets the screens themselves stay
              quiet under it.
            */}
            <Stack.Screen
              name="trip/pickup"
              options={{ title: "Pickup checks", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="trip/sign-off"
              options={{ title: "Quality checkpoint", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="trip/delivery"
              options={{ title: "Delivery proof", ...multiOriginPushedScreenOptions }}
            />
            {/*
              Confirmations are the platform's own sheet, not a drawn overlay —
              see `confirmSheetScreenOptions` for what that buys.
            */}
            {/*
              The map, full screen. A destination rather than a sheet: it is
              the same trip seen properly, and a rider reading a road wants the
              whole display and the back gesture, not a card they can dismiss
              by dragging in the direction they are trying to pan.
            */}
            <Stack.Screen name="trip/map" options={fullBleedScreenOptions} />
            <Stack.Screen name="trip/start" options={confirmSheetScreenOptions} />
            <Stack.Screen name="confirm" options={confirmSheetScreenOptions} />
          </Stack>
        </AuthGate>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </ThemeProvider>
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const publishableKey = resolveClerkPublishableKey(
    Constants.expoConfig?.extra?.clerkPublishableKey,
    __DEV__,
  );

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppShell />
    </ClerkProvider>
  );
}
