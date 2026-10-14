import { ChevronDown, ChevronUp, CircleX, MapPinOff, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { locationHealthHeadline, type LocationFix, type LocationIssue } from "@/lib/locationHealth";

type Props = {
  issues: LocationIssue[];
  /** Who loses sight of the rider: the shop before pick-up, the client after. */
  watcher: "shop" | "client";
  onFix: (fix: LocationFix) => void;
};

/**
 * Why the shop or the client may not be seeing the rider, and how to fix it.
 *
 * The headline says what the problem costs — "The client cannot see you
 * coming" — because that is what a rider acts on, not the name of a setting.
 * Under it, every problem on this phone, most serious first. One is open with
 * its steps and the button that leads to the fix; the rest are a tap away, so
 * a phone with three problems is not a wall of instructions.
 *
 * Red when nothing is being shared, amber when sharing may stop. Never yellow:
 * the trip's next step owns the screen's one yellow, and this card is the
 * reason that step's location reaches anyone, not a rival to it.
 */
export function LocationHealthCard({ issues, watcher, onFix }: Props) {
  const colors = useThemeColors();
  const [chosen, setChosen] = useState<string | null>(null);
  const headline = locationHealthHeadline(issues, watcher);
  if (!headline) return null;

  const openKey = issues.some((issue) => issue.key === chosen) ? chosen : issues[0].key;
  const blocking = headline.tone === "error";
  const HeadIcon = blocking ? MapPinOff : TriangleAlert;
  const collapsible = issues.length > 1;

  return (
    <View
      className={`gap-3 rounded-card border bg-surface p-4 ${blocking ? "border-error" : "border-warning"}`}
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row gap-3" accessibilityRole="header" accessible accessibilityLabel={`${headline.title}. ${headline.body}`}>
        <View className="pt-0.5">
          <HeadIcon size={18} color={blocking ? colors.error : colors.warning} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-bold text-text-primary">{headline.title}</Text>
          <Text className="text-body text-text-secondary">{headline.body}</Text>
        </View>
      </View>

      {issues.map((issue) => {
        const open = issue.key === openKey;
        const IssueIcon = issue.severity === "blocking" ? CircleX : TriangleAlert;
        const tint = issue.severity === "blocking" ? colors.error : colors.warning;
        const Chevron = open ? ChevronUp : ChevronDown;
        return (
          <View key={issue.key} className="gap-3 border-t border-outline-subtle pt-3">
            <Pressable
              disabled={!collapsible}
              onPress={() => setChosen(open ? null : issue.key)}
              accessibilityRole={collapsible ? "button" : "text"}
              accessibilityState={collapsible ? { expanded: open } : undefined}
              accessibilityLabel={issue.title}
              // A row that toggles is a 44 pt target; a lone title is just text.
              className={collapsible ? "min-h-11 flex-row items-center gap-2" : "flex-row items-center gap-2"}
            >
              <IssueIcon size={16} color={tint} strokeWidth={2} />
              <Text className="min-w-0 flex-1 text-body font-bold text-text-primary">{issue.title}</Text>
              {collapsible ? <Chevron size={18} color={colors.textMuted} strokeWidth={2} /> : null}
            </Pressable>

            {open ? (
              <View className="gap-3">
                <Text className="text-body text-text-secondary">{issue.body}</Text>
                <View className="gap-2" accessibilityRole="list">
                  {issue.steps.map((step, index) => (
                    <View key={step} className="flex-row items-start gap-3" accessible accessibilityLabel={`Step ${index + 1}. ${step}`}>
                      <View className="h-6 min-w-6 items-center justify-center rounded-pill border border-outline px-1">
                        <Text className="text-caption font-bold text-text-primary">{index + 1}</Text>
                      </View>
                      <Text className="min-w-0 flex-1 text-body text-text-primary">{step}</Text>
                    </View>
                  ))}
                </View>
                {issue.action ? (
                  <SecondaryButton label={issue.action.label} onPress={() => onFix(issue.action!.fix)} />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
