import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
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
 */
export default function LoginScreen() {
  const user = useSession((s) => s.user);
  const login = useSession((s) => s.login);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const colors = useThemeColors();

  const [email, setEmail] = useState("rider@gridgo.local");
  const [password, setPassword] = useState("demo");
  const [apiBase] = useState(() => getApiBase());
  const [healthState, setHealthState] = useState<HealthState>("checking");

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gg-page grow justify-center gap-8 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-6">
            <GridgoLogo role="rider" />
            <View className="gap-1">
              <Text className="text-h1 text-text-primary">Sign in</Text>
              <Text className="text-body-lg text-text-secondary">
                Riders only. Operations issues the account.
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
                placeholder="you@gridgo.local"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Email"
              />
            </View>

            <View className="gap-2">
              <Text className="text-overline text-text-muted">PASSWORD</Text>
              <TextInput
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

            <Text className="text-caption text-text-muted">
              Demo account: rider@gridgo.local / demo
            </Text>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
