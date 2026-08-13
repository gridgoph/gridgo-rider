import { Redirect, useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { FormScroll } from "@/components/FormScroll";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { getApiBase, health } from "@/lib/api";
import { DEV_LOGIN } from "@/lib/devLogin";
import { useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

/**
 * The first screen of the app.
 *
 * The API address stays, with its reachability, because this build talks to a
 * demo server that moves between machines and "cannot reach GRIDGO" is
 * unanswerable without it. It is the one screen where that is true.
 *
 * Credentials never ship. In a development build the fields start filled with
 * the rider fixture so signing in is one tap (`lib/devLogin.ts`, behind
 * `__DEV__`). A production bundle folds that module to `null` and drops the
 * literals; the production-export assertion proves it. On a hosted pilot the
 * fields start empty — anything typed here is a way in for anyone who opens
 * the app.
 *
 * The password field carries a show/hide control: phone keyboards mistype
 * constantly, and without it the only recovery from a failed sign-in is to
 * clear the field and try again blind.
 */
export default function LoginScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const login = useSession((s) => s.login);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const colors = useThemeColors();

  // Prefill only when Metro left the literals in — `__DEV__` is compile-time.
  const [email, setEmail] = useState(() => DEV_LOGIN?.email ?? "");
  const [password, setPassword] = useState(() => DEV_LOGIN?.password ?? "");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [apiBase] = useState(() => getApiBase());
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const passwordField = useRef<TextInput>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await health();
        if (!cancelled) {
          setHealthState(result.ok ? "reachable" : "unreachable");
        }
      } catch {
        if (!cancelled) setHealthState("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Redirect href="/(tabs)/active" />;

  return (
    <Screen>
      <FormScroll contentClassName="gg-page grow justify-center gap-8 py-8">
        <View className="gap-6">
          <GridgoLogo role="rider" />
          <View className="gap-1">
            <Text className="text-h1 text-text-primary">Sign in</Text>
            <Text className="text-body-lg text-text-secondary">
              Riders only. New here? Create your account below — Operations accredits it
              before your first job.
            </Text>
          </View>
        </View>

        <View className="gap-4">
          <View className="gap-2">
            <Text className="text-overline text-text-muted">EMAIL</Text>
            <TextInput
              className="gg-field"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Email"
              // Return moves to the password rather than closing the keyboard,
              // so the whole sign-in happens without leaving it.
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordField.current?.focus()}
            />
          </View>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">PASSWORD</Text>
            {/*
              The reveal control sits inside the field's right edge as a full
              44×44 target. The input always keeps the same right padding so
              the glyph never covers the text and the layout does not jump
              when the icon swaps. Monochrome — yellow is reserved for Sign in.
            */}
            <View className="relative justify-center">
              <TextInput
                ref={passwordField}
                className="gg-field"
                style={{ paddingRight: 48 }}
                secureTextEntry={!passwordVisible}
                autoComplete="current-password"
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Password"
                onSubmitEditing={() => void login(email.trim(), password)}
                returnKeyType="go"
                // Keep the same TextInput instance when visibility toggles so
                // focus and caret are not reset by a remount.
                textContentType="password"
              />
              <Pressable
                onPress={() => setPasswordVisible((visible) => !visible)}
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                accessibilityState={{ selected: passwordVisible }}
                hitSlop={4}
                testID="password-visibility"
                className="absolute right-0 top-0 h-12 w-12 items-center justify-center"
              >
                {passwordVisible ? (
                  <EyeOff size={20} color={colors.textSecondary} strokeWidth={2} />
                ) : (
                  <Eye size={20} color={colors.textSecondary} strokeWidth={2} />
                )}
              </Pressable>
            </View>
          </View>

          {error ? (
            <InlineNotice tone="error" icon="circle-x" title="Not signed in" body={error} />
          ) : null}

          <PrimaryButton
            label={loading ? "Signing in…" : "Sign in"}
            onPress={() => void login(email.trim(), password)}
            disabled={loading}
            size="large"
          />

          <SecondaryButton
            label="Create a rider account"
            onPress={() => router.push("/(auth)/signup")}
            disabled={loading}
          />
        </View>

        {/*
          The door asks too, and it is the only surface that can. A rider that
          installs GRIDGO and does not sign in for a week never reaches a
          screen behind the gate, and on Android 13+ the permission can only
          be asked while the app is open — so a door that never asks is a
          phone GRIDGO can never tell to update. It draws only the ask, never
          a failure or a settings link (see `pushOffer`), and its copy
          promises only what an unclaimed phone actually receives.
        */}
        <PushEnableCard spacing="above" />

        <View className="flex-row flex-wrap items-center gap-2 pt-2">
          <Text className="text-caption text-text-muted" numberOfLines={2}>
            {apiBase}
          </Text>
          {healthState === "checking" ? (
            <StatusChip tone="neutral" label="Checking…" icon="clock" />
          ) : healthState === "reachable" ? (
            <StatusChip tone="success" label="Reachable" icon="circle-check" />
          ) : (
            <StatusChip tone="error" label="Unreachable" icon="circle-x" />
          )}
        </View>
      </FormScroll>
    </Screen>
  );
}
