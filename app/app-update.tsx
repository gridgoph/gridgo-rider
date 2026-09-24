import { router } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { SpecRow } from "@/components/SpecRow";
import { useThemeColors } from "@/hooks/useTheme";
import { APP_UPDATE_COPY as COPY, APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { settleUpdateSheet, useAppUpdate, type UpdateOutcome } from "@/store/appUpdate";

/**
 * A newer GRIDGO is published, or one just landed.
 *
 * A sheet rather than a screen because it never blocks: dragging it down, the
 * back gesture and "Later" all mean the same thing, and the job underneath is
 * exactly where the rider left it. "Update now" hands the APK link to the
 * phone; Android's installer takes over from there, which is why "Update
 * completed" is said on the next launch rather than here.
 *
 * `hooks/useAppUpdateCheck.ts` decides when this opens.
 */
export default function AppUpdateSheet() {
  // Pinned to the finding it opened with: the content holds still while the
  // sheet animates away, and closing it can never settle the one after it.
  const [sheet] = useState(() => useAppUpdate.getState().open);
  const colors = useThemeColors();
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    // Reached with nothing to say (a stale deep link): leave at once.
    if (!sheet) {
      router.back();
      return;
    }
    // Every way out that is not a button still has to be recorded.
    return () => settleUpdateSheet("later", { sheet });
  }, [sheet]);

  if (!sheet) return null;

  const shown = sheet;
  function leave(outcome: UpdateOutcome) {
    settleUpdateSheet(outcome, { sheet: shown });
    router.back();
  }

  async function update() {
    setOpening(true);
    setOpenFailed(false);
    try {
      await Linking.openURL(APP_UPDATE_SOURCE.downloadUrl);
      leave("update");
    } catch {
      setOpenFailed(true);
    } finally {
      setOpening(false);
    }
  }

  if (sheet.kind === "completed") {
    return (
      <SheetSurface
        title={COPY.completedTitle}
        body={COPY.completedBody(sheet.installed.versionName)}
        cancelLabel={COPY.done}
        footer={<SecondaryButton label={COPY.done} size="large" onPress={() => leave("done")} />}
      >
        <View className="flex-row items-center gap-2">
          <CircleCheck size={18} color={colors.success} strokeWidth={2} />
          <Text className="text-body text-text-secondary">
            Installed and running on this phone
          </Text>
        </View>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface
      title={COPY.availableTitle}
      body={COPY.availableBody}
      cancelLabel={COPY.later}
      footer={
        <>
          <PrimaryButton
            label={opening ? "Opening…" : COPY.update}
            size="large"
            disabled={opening}
            onPress={() => void update()}
          />
          <SecondaryButton
            label={COPY.later}
            size="large"
            disabled={opening}
            onPress={() => leave("later")}
          />
        </>
      }
    >
      <View className="gap-4">
        <View className="rounded-card border border-outline px-4">
          <SpecRow label={COPY.installedLabel} value={sheet.installed.versionName} />
          <SpecRow label={COPY.latestLabel} value={sheet.latest.versionName} last />
        </View>
        {openFailed ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title={COPY.openFailedTitle}
            body={COPY.openFailedBody}
          />
        ) : null}
      </View>
    </SheetSurface>
  );
}
