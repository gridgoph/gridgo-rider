import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  Camera,
  CircleAlert,
  ClipboardCheck,
  Hourglass,
  Inbox,
  Navigation,
  Search,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useRiderAction } from "@/hooks/useRiderAction";
import { useThemeColors } from "@/hooks/useTheme";
import type { RiderActionGlyph } from "@/lib/riderAction";

/**
 * One Lucide glyph per destination, all outline, all the same optical weight,
 * so the row reads as one set. The action disc has its own filled-weight glyph.
 */
const ICONS: Record<TabName, LucideIcon> = {
  offers: Inbox,
  active: Navigation,
  // The action column draws `ACTION_GLYPHS` instead; this keeps the map total.
  action: Navigation,
  earnings: Wallet,
  account: User,
};

/**
 * The disc's glyph follows its verb.
 *
 * A fixed icon over a changing label reads as a label that does not belong to
 * it. Pairing the two means the disc says the same thing twice — which is what
 * keeps it legible at a glance, and in greyscale.
 */
const ACTION_GLYPHS: Record<RiderActionGlyph, LucideIcon> = {
  checklist: ClipboardCheck,
  hold: CircleAlert,
  navigate: Navigation,
  camera: Camera,
  search: Search,
  waiting: Hourglass,
};

/**
 * Tab bar geometry (Material Design 3 icon+label bar = 80dp content column).
 *
 * The painted surface is an absolute overlay starting 16dp (top-4) below the
 * container top, so the visible bar is 64 + paddingBottom. The top 16dp stays
 * transparent; the raised action disc paints over that strip and breaks the
 * hairline — same structure as gridgo-client, and none of it moves here.
 */
export const TAB_CONTENT_HEIGHT = 80;
/**
 * The floor under the icon+label row, for a device that reserves nothing.
 *
 * Not an addend. See `tabBarPaddingBottom`: where the system reserves space at
 * the bottom, that reservation *is* the row's breathing room, and this stands
 * in only when there is none to inherit.
 */
export const TAB_DESIGN_PADDING = 8;
/**
 * How far the painted surface (bg + top hairline) sits below the container top.
 * Matches NativeWind `top-4` (16dp). Visible bar height = content − this + padding.
 */
export const TAB_SURFACE_TOP_OFFSET = 16;

/**
 * The bar's bottom padding. **One rule, both platforms:**
 *
 * > Where the system reserves space at the bottom of the screen, that
 * > reservation is the row's breathing room. `TAB_DESIGN_PADDING` is a floor
 * > for a device that reserves none — never something added on top.
 *
 * The rule used to fork per platform, on the belief that an Android inset means
 * something different from an iOS one. It does not, and the fork is what put
 * 8dp of unasked-for bar under every Android phone. Both halves of that belief
 * were checked against the specs and both are false:
 *
 * - **MD3's 80dp navigation bar sits above the system inset, not around it.**
 *   `androidx.compose.material3.NavigationBar` applies
 *   `Modifier.fillMaxWidth().windowInsetsPadding(windowInsets)
 *   .defaultMinSize(minHeight = NavigationBarHeight)` — inset padding *outside*
 *   the 80dp minimum, so a spec-exact MD3 bar is 80dp + inset and nothing more.
 *   Our column is `h-20` = that same 80dp, so `padding = inset` lands on the
 *   spec exactly, and `inset + 8` overshoots it on every Android device.
 * - **A three-button phone does not report a zero inset.** This app is
 *   edge-to-edge (`android.edgeToEdgeEnabled`), and under edge-to-edge
 *   `react-native-safe-area-context` reports `navigationBars` to JS: ~24dp on
 *   gesture navigation, ~48dp on three-button. Both were being double-counted;
 *   three-button was simply the worse of the two, at MD3 + 8 = 136dp of bar.
 *
 * iOS already followed this rule and is unchanged by it. UIKit's tab bar is
 * 49pt of content plus the 34pt inset — 83pt, with no padding of its own — and
 * React Navigation's own `BottomTabBar` is branch-free about it for exactly the
 * reason above: `getTabBarHeight` returns `TABBAR_HEIGHT_UIKIT + inset` and the
 * bar takes `paddingBottom: insets.bottom`, on every platform.
 *
 * Resulting heights. The layout footprint — what actually pushes a screen up —
 * is the 80dp column plus this padding; the painted slab is 16dp shorter,
 * because the top strip is left transparent for the disc to break.
 *
 * | Device | Inset | Padding | Layout (80+) | Painted (64+) |
 * |---|---:|---:|---:|---:|
 * | Android, three-button navigation | 48 | 48 | 128 | 112 |
 * | Android, gesture navigation | 24 | 24 | 104 | 88 |
 * | iPhone with a home indicator | 34 | 34 | 114 | 98 |
 * | iPhone with a home button | 0 | 8 | 88 | 72 |
 *
 * Both Android rows are now `80 + inset`, which is MD3 to the dp. iOS keeps the
 * 80dp row rather than UIKit's 49 — that is GRIDGO's own settled choice of one
 * bar across both platforms, and it is not what this function decides.
 *
 * Platform is no longer a parameter because it is no longer a term: it decides
 * what the inset *is*, never what is done with it.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  // A floor, on purpose — and yes, arithmetically this is
  // `Math.max(insetBottom, TAB_DESIGN_PADDING)`. `Math.max` was banned back when
  // the pad was meant to stack on top of the inset, because it silently threw
  // the pad away. Under the rule above the pad was never meant to stack, so the
  // floor *is* the rule. Written out rather than as `Math.max` so a reader sees
  // a decision instead of the shape of the old mistake.
  return insetBottom >= TAB_DESIGN_PADDING ? insetBottom : TAB_DESIGN_PADDING;
}

/**
 * The GRIDGO rider tab bar.
 *
 * Four labelled destinations around one raised action, in the shape the client
 * app already ships. What changed is what the disc means: it used to open
 * Active, which is a place, and a raised disc that delivers a screen reads as
 * an unfinished shortcut. It now performs the next step of the job — check it,
 * set off, hand over — and says which in a word underneath.
 *
 * The disc keeps its label inside the 24dp the column already had spare below
 * a 56dp disc in an 80dp column, so it lands in exactly the same 16dp label box
 * as the destinations beside it. No geometry moves: the column is still `h-20`,
 * the disc is still 56 at the top of it, and the painted surface still starts
 * 16dp down so the disc breaks the hairline.
 *
 * The open tab is said twice over, in colour and in weight, so the row still
 * reads in grayscale. Yellow is spent in one place: the disc.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { action, orderId } = useRiderAction();

  function runAction() {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (action.needsOrderId && orderId) {
      router.push({ pathname: action.route, params: { orderId } });
      return;
    }
    router.push(action.route);
  }

  return (
    <View
      testID="gridgo-tab-bar"
      className="relative"
      style={{ paddingBottom: tabBarPaddingBottom(insets.bottom) }}
    >
      {/*
        Drawn before the row, so the action disc paints over the top border and
        the hairline breaks around it with no cut-out to maintain. Spans the
        full outer height including the bottom inset region.
      */}
      <View className="absolute inset-x-0 bottom-0 top-4 border-t border-outline bg-surface" />

      <View className="flex-row items-end">
        {TABS.map((tab) => {
          if (tab.name === ACTION_TAB) {
            return (
              <ActionDisc
                key="action"
                glyph={action.glyph}
                label={action.label}
                spoken={action.spoken}
                onPress={runAction}
              />
            );
          }

          const index = state.routes.findIndex((route) => route.name === tab.name);
          const route = state.routes[index];
          if (!route) return null;

          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              name={tab.name}
              label={tab.label}
              focused={focused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

type ActionDiscProps = {
  glyph: RiderActionGlyph;
  label: string;
  spoken: string;
  onPress: () => void;
};

/**
 * The raised action.
 *
 * 80 tall, matching the destinations' MD3 height. The 56 disc sits at the top
 * of the column; the surface starts 16 below the row top, so the disc breaks
 * the hairline. `justify-between` puts the label in the same 16dp box the
 * destination labels sit in — 56 + 16 + 8 is exactly 80, so nothing shifts.
 *
 * Unlike the client's plus, this verb changes with the job, so it is labelled.
 * An unlabelled disc that does four different things is a guess, not an action.
 */
function ActionDisc({ glyph, label, spoken, onPress }: ActionDiscProps) {
  const colors = useThemeColors();
  const Glyph = ACTION_GLYPHS[glyph];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      testID="tab-action-disc"
      className="h-20 flex-1 items-center justify-between pb-2"
    >
      {({ pressed }) => (
        <>
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-action-yellow">
            <Glyph size={26} color={colors.actionYellowOn} strokeWidth={2.5} />
            {pressed ? <View className="gg-pressed absolute inset-0 rounded-pill" /> : null}
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{ includeFontPadding: false, textAlignVertical: "center" }}
            className="h-4 text-nav font-medium text-text-primary"
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type TabItemProps = {
  name: TabName;
  label: string;
  focused: boolean;
  onPress: () => void;
};

function TabItem({ name, label, focused, onPress }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      // min-h-20 = MD3 80dp icon+label bar. pt-2 keeps the glyph off the
      // hairline. Grows with content if the label scales; never a rigid h-13.
      className="min-h-20 flex-1 items-center justify-end gap-1 pb-2 pt-2"
    >
      {({ pressed }) => (
        <>
          {/*
            One glyph, one size, one stroke weight, in both states. Only the
            colour moves — nothing is filled, swapped or rescaled when a tab
            opens, so the row never shifts under your thumb.
          */}
          <View className={pressed ? "opacity-60" : undefined}>
            <Icon size={24} strokeWidth={2} color={focused ? colors.textPrimary : colors.textMuted} />
          </View>
          <Text
            numberOfLines={1}
            /*
              The label still grows with the system font scale, but only to
              14px — the most a 16px line box holds. Left uncapped, a large
              accessibility scale clips the label against the pinned box below.
            */
            maxFontSizeMultiplier={1.4}
            /*
              Android pads a text box with the font's own ascent and descent on
              top of the line height. Off, the box is the 16px it claims to be
              on every platform.
            */
            style={{ includeFontPadding: false, textAlignVertical: "center" }}
            className={
              focused ? "h-4 text-nav font-medium text-text-primary" : "h-4 text-nav text-text-muted"
            }
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
