import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatAttemptAt } from "@/lib/riderOrder";

type Props = {
  label: string;
  helper?: string;
  value: Date;
  onChange: (next: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
};

/**
 * A date and a time, chosen with the platform picker.
 *
 * Never a text field. A rider on a motorbike is not going to type "10 Aug,
 * 3:00 PM", and two riders typing it would produce two different strings for
 * the same moment. iOS shows its compact picker inline; Android has no inline
 * form, so the value is a button that opens the system date dialog and then the
 * system time dialog.
 */
export function DateTimeField({
  label,
  helper,
  value,
  onChange,
  minimumDate,
  maximumDate,
  disabled = false,
}: Props) {
  const colors = useThemeColors();
  const [androidStage, setAndroidStage] = useState<"idle" | "date" | "time">("idle");

  function onAndroidDate(event: DateTimePickerEvent, picked?: Date) {
    if (event.type !== "set" || !picked) {
      setAndroidStage("idle");
      return;
    }
    const next = new Date(value);
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    onChange(next);
    setAndroidStage("time");
  }

  function onAndroidTime(event: DateTimePickerEvent, picked?: Date) {
    setAndroidStage("idle");
    if (event.type !== "set" || !picked) return;
    const next = new Date(value);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(next);
  }

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{label.toUpperCase()}</Text>
        {helper ? <Text className="text-body text-text-secondary">{helper}</Text> : null}
      </View>

      {Platform.OS === "ios" ? (
        <View className="flex-row items-center justify-between gap-3 rounded-field border border-outline bg-surface px-4 py-2">
          <Text className="text-body text-text-secondary">When</Text>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="compact"
            minuteInterval={15}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            disabled={disabled}
            onChange={(_event, picked) => {
              if (picked) onChange(picked);
            }}
            accessibilityLabel={label}
          />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setAndroidStage("date")}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${formatAttemptAt(value)}`}
            accessibilityHint="Opens the date picker, then the time picker"
            className="min-h-14 flex-row items-center gap-3 rounded-field border border-outline bg-surface px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <CalendarClock size={20} color={colors.textMuted} strokeWidth={2} />
            <Text className="flex-1 text-body-lg text-text-primary">
              {formatAttemptAt(value)}
            </Text>
            <Text className="text-button text-text-secondary">Change</Text>
          </Pressable>

          {androidStage === "date" ? (
            <DateTimePicker
              value={value}
              mode="date"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={onAndroidDate}
            />
          ) : null}
          {androidStage === "time" ? (
            <DateTimePicker value={value} mode="time" minuteInterval={15} onChange={onAndroidTime} />
          ) : null}
        </>
      )}
    </View>
  );
}
