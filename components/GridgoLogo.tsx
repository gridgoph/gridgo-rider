import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * The GRIDGO mark: a 3x3 grid with one corner lit.
 *
 * The grid is the product — a marketplace that routes a print job across a
 * city — and the single yellow dot is the job moving through it. Six
 * structural dots, two muted, one brand.
 *
 * Drawn in SVG rather than nine Views so the same component can be exported
 * for the app icon and splash screen later. `react-native-svg` takes colours
 * as props, which classes cannot reach, so this file reads tokens directly.
 */

/** Circle centres on both axes. 26-unit diameter against a 9-unit gap. */
const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;

/**
 * Product role for the logo lockup family.
 *
 * Labels are fixed copy — never free strings — so a typo cannot ship the wrong
 * product identity. Rider is the deliberate exception: uppercase pill, not
 * plain type. See the brand lockup reference sheet.
 */
export type GridgoLogoRole =
  | "client"
  | "business"
  | "supplier"
  | "rider"
  | "admin";

type RoleMeta = {
  /** Visible label under the wordmark; null = client individual (wordmark only). */
  label: string | null;
  /** One accessible name for the whole lockup. */
  accessibilityLabel: string;
  /** Rider alone uses a filled yellow pill; every other role is plain type. */
  presentation: "none" | "plain" | "pill";
};

const ROLE_META: Record<GridgoLogoRole, RoleMeta> = {
  client: {
    label: null,
    accessibilityLabel: "GRIDGO",
    presentation: "none",
  },
  business: {
    label: "Business",
    accessibilityLabel: "GRIDGO Business",
    presentation: "plain",
  },
  supplier: {
    label: "Supplier",
    accessibilityLabel: "GRIDGO Supplier",
    presentation: "plain",
  },
  rider: {
    label: "RIDER",
    accessibilityLabel: "GRIDGO Rider",
    presentation: "pill",
  },
  admin: {
    label: "Admin",
    accessibilityLabel: "GRIDGO Admin",
    presentation: "plain",
  },
};

/** Pure helper for tests and callers that need the a11y string without render. */
export function gridgoLogoAccessibilityLabel(
  role: GridgoLogoRole = "client",
): string {
  return ROLE_META[role].accessibilityLabel;
}

type Props = {
  /** Rendered edge length in px. The grid scales with it. */
  size?: number;
  /**
   * Product role lockup. Omit or pass `"client"` for the bare wordmark (no
   * role label). Other roles place a subordinate label under the wordmark,
   * left-aligned with it — never centred under the whole lockup.
   */
  role?: GridgoLogoRole;
};

export function GridgoMark({ size = 28 }: Props) {
  const colors = useThemeColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {CENTRES.map((cy, row) =>
        CENTRES.map((cx, column) => (
          <Circle
            key={`${row}-${column}`}
            cx={cx}
            cy={cy}
            r={RADIUS}
            // Columns 1-2 are structural, so they invert with the theme. Only
            // the top-right dot holds yellow, and it holds it in both themes.
            fill={
              column < 2
                ? colors.accent
                : row === 0
                  ? colors.brandLogo
                  : colors.textMuted
            }
          />
        )),
      )}
    </Svg>
  );
}

/**
 * Mark plus wordmark, optionally with a role lockup.
 *
 * `GO` uses `brand`, not `actionYellow`. `#FFDE58` on the light canvas is
 * illegible, and `brand` resolves to `#D4A017` in Light and `#FFDE58` in
 * Dark — yellow in both themes, without spending the screen's one CTA colour.
 *
 * Layout when a role label is present: mark left, wordmark right, role label
 * under the wordmark and left-aligned with it. The whole lockup is one
 * accessible image node.
 */
export function GridgoLogo({ size = 28, role = "client" }: Props) {
  const meta = ROLE_META[role];
  const hasRoleLabel = meta.presentation !== "none";

  return (
    <View
      // Mark top-aligns with the wordmark so the role label hangs under the
      // text column only — matching the brand lockup sheet.
      className={`flex-row gap-2 ${hasRoleLabel ? "items-start" : "items-center"}`}
      // Collapses the mark, wordmark, and role into one node, so a screen
      // reader says e.g. "GRIDGO Rider" once rather than spelling out pieces.
      accessible
      accessibilityRole="image"
      accessibilityLabel={meta.accessibilityLabel}
    >
      <GridgoMark size={size} />
      <View className="min-w-0 shrink">
        <Text className="font-brand text-h3 text-text-primary">
          GRID<Text className="text-brand">GO</Text>
        </Text>
        {meta.presentation === "plain" && meta.label ? (
          <Text className="mt-0.5 text-caption text-text-muted" numberOfLines={1}>
            {meta.label}
          </Text>
        ) : null}
        {meta.presentation === "pill" && meta.label ? (
          // Yellow pill is rider brand identity, not a CTA. Dark text is fixed
          // (`action-yellow-on`) so it stays legible on yellow in both themes.
          <View className="mt-0.5 self-start rounded-pill bg-action-yellow px-2 py-0.5">
            <Text
              className="font-medium text-caption text-action-yellow-on"
              numberOfLines={1}
            >
              {meta.label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
