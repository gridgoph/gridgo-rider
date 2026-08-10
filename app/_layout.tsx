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
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useHydrateTheme, useThemeColors, useThemeName } from "@/hooks/useTheme";
import {
  confirmSheetScreenOptions,
  multiOriginPushedScreenOptions,
} from "@/lib/navigationHeaders";
import { bindApiUnauthorizedHandler, useSession } from "@/store/session";

SplashScreen.preventAutoHideAsync();

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
  useHydrateTheme();

  // Keeps the window behind the navigator on canvas, so theme changes and
  // screen transitions never flash the wrong background.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(token.canvas);
  }, [token.canvas]);

  // The splash covers the session read as well as the fonts. Hiding it earlier
  // shows a login screen to a rider who is already signed in.
  useEffect(() => {
    if (fontsReady && sessionHydrated) SplashScreen.hideAsync();
  }, [fontsReady, sessionHydrated]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
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
            {/* The tab shell draws its own headers per tab. */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
