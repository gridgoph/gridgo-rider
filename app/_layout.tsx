import { useTripTracking } from "@/hooks/useTripTracking";
import { useAlertStream } from "@/hooks/useAlertStream";
import { useSupportChatUnread } from "@/hooks/useSupportChatUnread";
import "../global.css";

import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "expo-router/react-navigation";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { BrandIntro } from "@/components/BrandIntro";
import { SessionShell } from "@/components/SessionShell";
import { colors, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useAppUpdateCheck } from "@/hooks/useAppUpdateCheck";
import { useArrivalAlert } from "@/hooks/useArrivalAlert";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useClerkSessionBridge } from "@/hooks/useClerkSessionBridge";
import { useLaunchReady } from "@/hooks/useLaunchReady";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePushPrompt } from "@/hooks/usePushPrompt";
import { useHydrateTheme, useThemeColors, useThemeName } from "@/hooks/useTheme";
import {
  confirmSheetScreenOptions,
  fullBleedScreenOptions,
  multiOriginPushedScreenOptions,
} from "@/lib/navigationHeaders";
import { nativeHeaderInsetOptions } from "@/lib/nativeHeaderInsets";
import { resolveClerkPublishableKey } from "@/lib/clerkAuth";
import { rootStackOwner } from "@/lib/riderApproval";
import { bounceToIsolatedDevWebHost, GRIDGO_DEV_WEB_HOST } from "@/lib/devWebHost";
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
  // only a tap on `PushEnableCard` or the `push-permission` sheet does that. Expo Go throws from the native module;
  // the hook wraps every call so that costs push, never the first frame.
  usePushNotifications();
  useAlertStream();
  useSupportChatUnread();
  // Same seat as push: arrival is about where the phone is, not which screen
  // is open, so the geofence lives here rather than on the Active tab.
  useTripTracking();
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

  // The opening covers the session read. Hide the native splash on the first
  // frame so the GRIDGO overlay is what you see, matching the legacy app.
  // `launchReady` still gates the navigator so a signed-in rider is not shown
  // welcome underneath.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  // The opening plays once per launch, over everything. This layout mounts
  // once, so the flag is the whole gate — no route, no back-stack entry, and
  // nothing about where the launch lands is decided here.
  const [introPlaying, setIntroPlaying] = useState(true);

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
        {launchReady ? (
        <AuthGate>
          <RootStack />
          <AppUpdatePrompt ready={!introPlaying} />
          <PushPrompt ready={!introPlaying} />
        </AuthGate>
        ) : (
          <View style={{ flex: 1, backgroundColor: token.canvas }} />
        )}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          {introPlaying ? <BrandIntro onDone={() => setIntroPlaying(false)} /> : null}
        </ThemeProvider>
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Offers a newer GRIDGO, and says once when one has landed. Mounted with the
 * navigator it pushes onto, signed in or out, and held back until the opening
 * has played so the sheet is never drawn under it.
 */
function AppUpdatePrompt({ ready }: { ready: boolean }) {
  useAppUpdateCheck({ ready });
  return null;
}

/**
 * Explains notifications to a signed-in rider, then lets the phone ask. Held
 * back like the update sheet, and behind it: see `hooks/usePushPrompt.ts`.
 */
function PushPrompt({ ready }: { ready: boolean }) {
  usePushPrompt({ ready });
  return null;
}

/** Reads insets below the measured provider, not from the host window. */
function RootStack() {
  const ownerId = useSession((s) => rootStackOwner(s.user));
  const token = useThemeColors();
  const { top } = useSafeAreaInsets();

  return (
    <SessionShell>
    <Stack
      key={ownerId}
      screenOptions={{
        ...nativeHeaderInsetOptions(Platform.OS, top),
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
        name="chat/index"
        options={{ title: "Chat", ...multiOriginPushedScreenOptions }}
      />
      <Stack.Screen
        name="chat/[thread]"
        options={{ title: "Chat", ...multiOriginPushedScreenOptions }}
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
        name="trip/handoff"
        options={{ title: "Supplier signature", ...multiOriginPushedScreenOptions }}
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
      <Stack.Screen name="app-update" options={confirmSheetScreenOptions} />
      <Stack.Screen name="push-permission" options={confirmSheetScreenOptions} />
    </Stack>
    </SessionShell>
  );
}

export default function RootLayout() {
  if (bounceToIsolatedDevWebHost(GRIDGO_DEV_WEB_HOST)) {
    return null;
  }

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
