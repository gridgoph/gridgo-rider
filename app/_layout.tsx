import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, type ReactNode } from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { colors, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useLaunchReady } from "@/hooks/useLaunchReady";
import { useHydrateTheme, useThemeColors, useThemeName } from "@/hooks/useTheme";
import {
  confirmSheetScreenOptions,
  multiOriginPushedScreenOptions,
} from "@/lib/navigationHeaders";
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
 * replace-navigates to login so (tabs) is not left on the back stack.
 */
function AuthGate({ children }: { children: ReactNode }) {
  useAuthGate();

  useEffect(() => {
    return bindApiUnauthorizedHandler();
  }, []);

  return <>{children}</>;
}

export default function RootLayout() {
  const scheme = useThemeName();
  const token = useThemeColors();
  const fontsReady = useAppFonts();
  const sessionHydrated = useSession((s) => s.hydrated);
  const hydrateSession = useSession((s) => s.hydrate);
  const launchReady = useLaunchReady({ fontsReady, sessionHydrated });
  useHydrateTheme();

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
  // shows a login screen to a rider who is already signed in. `launchReady` is
  // time-bounded, so this always fires — the splash can never be left up.
  useEffect(() => {
    if (launchReady) void SplashScreen.hideAsync().catch(() => {});
  }, [launchReady]);

  /*
    Nothing renders until the fonts AND the stored session are ready — or until
    the launch deadline passes, whichever comes first.

    Waiting is what keeps a signed-in rider off the login screen: a screen that
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
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
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
              name="settings"
              options={{
                title: "Settings",
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
              options={{ title: "Pickup proof", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="trip/delivery"
              options={{ title: "Delivery proof", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="trip/cod"
              options={{ title: "Cash on delivery", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="trip/failed"
              options={{ title: "Failed attempt", ...multiOriginPushedScreenOptions }}
            />
            {/*
              Confirmations are the platform's own sheet, not a drawn overlay —
              see `confirmSheetScreenOptions` for what that buys.
            */}
            <Stack.Screen name="trip/start" options={confirmSheetScreenOptions} />
            <Stack.Screen name="trip/handback" options={confirmSheetScreenOptions} />
            <Stack.Screen name="trip/cod-confirm" options={confirmSheetScreenOptions} />
          </Stack>
        </AuthGate>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
