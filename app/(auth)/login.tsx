import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { FormScroll } from "@/components/FormScroll";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { getApiBase, health } from "@/lib/api";
import { useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

/**
 * The first screen of the app, and until now the only one built out of
 * utilities the design system does not define: `font-satoshi`, `text-2xl` and
 * `text-sm` are all absent from `global.css` (the default Tailwind type and
 * weight scales are reset on purpose), so every line of it rendered in the
 * system font at Tailwind's own sizes. It is on tokens now, like everything
 * else.
 *
 * The API address stays, with its reachability, because this build talks to a
 * demo server that moves between machines and "cannot reach GRIDGO" is
 * unanswerable without it. It is the one screen where that is true.
 *
 * What does *not* stay is the demo account. This screen used to arrive with
 * `rider@gridgo.local` / `demo` already typed into it and printed underneath as
 * a hint. On a laptop that was a convenience; on a hosted pilot it is a signed
 * invitation — anyone who opens the app is one tap from a rider session. Demo
 * accounts still exist in the pilot, but their passwords come from deployment
 * configuration now, so there is nothing here that could honestly be printed
 * anyway. The fields start empty and the screen keeps only what helps a real
 * rider: who the app is for, the way to create an account, and whether the
 * server is answering.
 */
export default function LoginScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const login = useSession((s) => s.login);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const colors = useThemeColors();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
            <TextInput
              ref={passwordField}
              className="gg-field"
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Password"
              onSubmitEditing={() => void login(email.trim(), password)}
              returnKeyType="go"
            />
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
