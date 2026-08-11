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

/* ---------------------------------------------------------------------------
   Bar geometry

   Two platforms publish two different content-row heights, and one rule governs
   what sits underneath both. Both halves have been reported wrong by the
   captain once each, so both are cited rather than remembered. This file must
   stay in step with gridgo-client and gridgo-supplier.

   **iOS.** The UIKit tab bar is a 49pt content row — 83pt overall on a
   home-indicator iPhone, 49 of content plus the 34pt bottom safe-area inset.
   UIKit adds no design padding under the labels on top of that inset. This bar
   used to run Material's 80dp column on iOS too, which put it at 80 + 34 = 114
   against the platform's 83, and 31pt taller than the client and supplier bars
   on the same phone.

   **Android.** Material 3's navigation bar container is 80dp
   (`NavigationBarTokens.TallContainerHeight`), and the system inset is added
   *beneath* that container rather than absorbed into it. `NavigationBar` lays
   its row out as

       Modifier.fillMaxWidth()
               .windowInsetsPadding(windowInsets)                 // outer
               .defaultMinSize(minHeight = NavigationBarHeight)   // inner

   so the 80dp minimum applies to the content inside the padding and the total
   is 80 + inset. Under Expo's edge-to-edge Android the inset is real and
   non-zero on every phone: ~48dp for three-button navigation, ~24dp for
   gesture navigation. A three-button phone genuinely is 128dp, and that is
   Material's own answer rather than a double-count.

   **The rule both follow.** Whatever the platform reserves below the row is the
   breathing room, and nothing is added on top of it. The design gap is a floor
   under that, for the cases where the platform reserves less.

   Resulting bar heights — the content column plus whatever sits under it:
     iOS, home indicator     49 + 34 = 83pt   (UIKit exactly)
     iOS, no indicator       49 +  8 = 57pt
     Android, gesture nav    80 + 24 = 104dp
     Android, three-button   80 + 48 = 128dp
     Android/web, no inset   80 +  8 = 88dp
   `tabBarHeight` is that table as code, so the tests assert the totals rather
   than re-deriving them. None of those totals moved when the top gap below was
   fixed, and none of them may move again.

   **The gap above the icon is measured from the painted edge.** The captain
   reported the items sitting too close to the top of the bar against
   gridgo-supplier, and the cause was structural rather than a padding typo.

   This bar used to paint its surface from `actionRise` down (`inset-x-0
   bottom-0` with `top: actionRise`), leaving a transparent strip at the top of
   the column so the raised disc could break the hairline. The supplier has no
   disc and paints `inset-0`, so for it the painted edge and the layout edge are
   the same line. Every column in all three apps bottom-aligns its content
   (`justify-end` over `minHeight: columnHeight`), so what actually sets the gap
   is `columnHeight - itemPaddingBottom - (icon + itemGap + label)` — measured
   from the *layout* top. Subtracting the strip left the rider visibly tighter
   against the painted edge than the supplier, and on iOS it was worse than
   tight: the icons sat 6pt *above* the hairline they were supposed to sit under.

   Keeping the strip could not be reconciled with matching the supplier. With
   the shared Android padding below, the gap owed from the painted edge is 20dp
   and the column has 80 - 16 - 44 = 20dp to give — all of it, leaving nothing
   for a 16dp strip. Since `columnHeight` and the inset rule are settled, and
   shrinking `actionRise` was ruled out, the strip itself had to go.

   It turned out not to be needed. The strip existed because Android's old
   8dp bottom padding made the disc stack 56 + 16 + 8 = exactly 80 — flush with
   the row, overhanging nothing, so the hairline had to be moved down to fake
   the break. On the shared 16dp padding the stack is 56 + 16 + 16 = 88 against
   an 80dp column, so the disc genuinely rises 8dp above the row and breaks the
   hairline on its own. iOS never needed the strip either: its stack has always
   overhung by 14pt. So the surface now spans the full column, `inset-0`,
   exactly as the supplier paints it, and the disc breaks a real hairline on
   both platforms instead of a lowered one.

   Resulting gap above the icon, from the painted edge — identical to the
   supplier's on both platforms, which is the whole point:
     iOS       49 - 3  - (24 + 2 + 16) =  4pt
     Android   80 - 16 - (24 + 4 + 16) = 20dp
   `tabBarTopGap` is that as code. Keep it equal to the supplier's, and keep
   Android's 12 / 16 item padding equal to gridgo-client's and the supplier's —
   all three apps must read as one product.
   --------------------------------------------------------------------------- */

/**
 * The least breathing room the bar will leave under its labels. A floor beneath
 * whatever the platform reserves, not an alternative to it.
 */
export const TAB_BAR_MIN_BOTTOM_GAP = 8;

/**
 * The label's line box, on both platforms and in every column.
 *
 * It is the same 16 for a destination and for the action, which is the whole
 * reason the action's verb sits on the line its neighbours' labels sit on.
 */
export const TAB_LABEL_BOX = 16;

/** The destination glyph, one size in both states and on both platforms. */
export const TAB_ICON_SIZE = 24;

export type TabBarMetrics = {
  /** The content row, above whatever the platform reserves below it. */
  columnHeight: number;
  itemPaddingTop: number;
  itemGap: number;
  itemPaddingBottom: number;
  /** The raised action disc. */
  actionDiameter: number;
};

/**
 * Pure, so both platforms' geometry can be asserted in one test run rather
 * than only whichever one the suite happens to be executing on.
 *
 * These numbers are shared with gridgo-client and gridgo-supplier. A change
 * here is a change in all three or it is a bug in one of them.
 */
export function tabBarMetrics(platformOS: string): TabBarMetrics {
  if (platformOS === "ios") {
    // 4 + 24 icon + 2 + 16 label + 3 = 49, the HIG row exactly.
    return {
      columnHeight: 49,
      itemPaddingTop: 4,
      itemGap: 2,
      itemPaddingBottom: 3,
      actionDiameter: 44,
    };
  }
  // Material 3's 80dp container, with the item padding gridgo-client and
  // gridgo-supplier both use: 12 above, 4 between, 16 below. This bar shipped
  // 8 and 8, which is what left its icons 8dp higher in the column than the
  // supplier's — and, once the painted strip above them is counted, visibly
  // tighter still. `justify-end` puts the label box at 48..64 in both column
  // kinds, and 16 below is also what gives the disc its 8dp overhang.
  return {
    columnHeight: 80,
    itemPaddingTop: 12,
    itemGap: 4,
    itemPaddingBottom: 16,
    actionDiameter: 56,
  };
}

/**
 * The gap above the icon, measured from the **painted** top edge of the bar.
 *
 * This is the number the captain reads as "how close the items sit to the top",
 * and the one that must equal gridgo-supplier's: 4pt on iOS, 20dp on Android.
 *
 * Every column bottom-aligns, so `itemPaddingTop` is slack the layout absorbs
 * rather than the term that sets this — on Android 12 + 44 + 16 is 72 in an
 * 80dp column, and the spare 8 lands above the icon. What sets it is the room
 * left over the content once the bottom padding is taken, which is why fixing
 * this meant the *bottom* padding and the painted edge, not the top padding.
 */
export function tabBarTopGap(platformOS: string): number {
  const { columnHeight, itemGap, itemPaddingBottom } = tabBarMetrics(platformOS);
  return columnHeight - itemPaddingBottom - (TAB_ICON_SIZE + itemGap + TAB_LABEL_BOX);
}

export const TAB_BAR_METRICS = tabBarMetrics(Platform.OS);

/**
 * How far the action disc rises above the top of the content row.
 *
 * The disc and its label are one bottom-aligned stack, and the label box is
 * pinned to the same line as every other label. On Android the stack is
 * 56 + 16 + 16 = 88 against an 80dp column, so the disc rises 8dp above the
 * row. On iOS a 49pt row cannot hold a 44pt disc above a 16pt label, so the
 * stack is 14pt taller than the row and the disc rises that far through it.
 *
 * This is what lets the surface paint the full column (`inset-0`, as
 * gridgo-supplier paints it) and still have the disc break the hairline on both
 * platforms. It was not true while Android's bottom padding was 8: the stack
 * was then exactly 80, the disc overhung nothing, and a transparent strip had
 * to be left at the top of the column to fake the break — which is what pushed
 * every item's icon too close to the painted edge. See the geometry block.
 *
 * That overhang is the deliberate answer to "a 56 disc does not fit a 49 row",
 * and it is the raised action behaving like one. The alternatives were both
 * worse: shrinking the disc to the ~28pt that would fit means an icon smaller
 * than the glyph it carries and a disc unlike the client's on the same phone,
 * and dropping the label means an unlabelled disc that performs four different
 * jobs — which is a guess, not an action. The bar's *height* is unaffected
 * either way: the overhang is drawn above the row, never measured into it, so
 * iOS stays on UIKit's 83pt.
 */
export function tabBarActionOverhang(platformOS: string): number {
  const { columnHeight, actionDiameter, itemPaddingBottom } = tabBarMetrics(platformOS);
  const stack = actionDiameter + TAB_LABEL_BOX + itemPaddingBottom;
  return Math.max(0, stack - columnHeight);
}

/**
 * What sits below the content row: whatever the platform reserves, with the
 * design gap as a deliberate floor under it.
 *
 * Not `inset + gap`: on a home-indicator iPhone that added 8pt to a 34pt
 * keep-out the platform had already sized as the bar's breathing room, and on
 * Android it overshot Material's own total on every phone — ~24dp of gesture
 * inset and ~48dp of three-button inset were both being double-counted.
 *
 * The floor is compared against the gap, not against zero. A `> 0` test reads
 * as if it says this, but it only floors at *nothing*: a device reporting a 2dp
 * inset would get a 2dp gap and sit closer to the physical edge than a phone
 * reserving nothing at all — a bar that gets shorter as the device reserves
 * more, which cannot be right in either direction. Spelled longhand rather than
 * as `Math.max` so it stays legible that the gap is a floor and never a
 * replacement for the inset, which is what got `Math.max` banned.
 *
 * Platform is not a parameter here because it is not a term: it decides what
 * the inset *is*, and what the row above it measures, never what is done with
 * the inset.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  return insetBottom >= TAB_BAR_MIN_BOTTOM_GAP ? insetBottom : TAB_BAR_MIN_BOTTOM_GAP;
}

/**
 * The bar's whole height: the platform's content row plus whatever sits under
 * it. Pure arithmetic over a platform and an inset, so every device case in the
 * table above is one assertion rather than a re-derivation in the test.
 */
export function tabBarHeight(platformOS: string, insetBottom: number): number {
  return tabBarMetrics(platformOS).columnHeight + tabBarPaddingBottom(insetBottom);
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
 * The disc's label lands in exactly the same 16dp label box as the destinations
 * beside it, because both column kinds bottom-align over the same bottom
 * padding. The disc itself overhangs the row rather than fitting inside it, so
 * it breaks the hairline of a surface that paints the full column.
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
      // `overflow: visible` is the React Native default, and it is written down
      // because on iOS the action disc is drawn 14pt above this container (see
      // `tabBarActionOverhang`). A later style setting it to "hidden" would
      // slice the top off the disc rather than fail loudly.
      style={{ paddingBottom: tabBarPaddingBottom(insets.bottom), overflow: "visible" }}
    >
      {/*
        Drawn before the row, so the action disc paints over the top border and
        the hairline breaks around it with no cut-out to maintain. Spans the
        whole container — the content row and the bottom inset region both —
        exactly as gridgo-supplier paints it. It used to start `actionRise`
        below the row top to leave the disc somewhere to break; the disc now
        overhangs the row on both platforms and does that unaided, and the strip
        was what left every item's icon too close to the painted edge.
      */}
      <View
        testID="gridgo-tab-bar-surface"
        className="absolute inset-0 border-t border-outline bg-surface"
      />

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
 * The column is the platform's own row height, so the disc's label lands in the
 * same line box as the destination labels beside it. `justify-end` pins that
 * stack to the bottom, which is what keeps the labels on one line: on Android
 * 56 + 16 + 16 is 88 against an 80dp column, and on iOS 44 + 16 + 3 is 63
 * against a 49pt row, so the disc rises 8dp and 14pt above the row
 * respectively. See `tabBarActionOverhang` for why the overhang is the right
 * answer on a row too short to hold the disc.
 *
 * That overhang is what breaks the hairline on both platforms, so the surface
 * can paint the full column instead of starting below it.
 *
 * Unlike the client's plus, this verb changes with the job, so it is labelled.
 * An unlabelled disc that does four different things is a guess, not an action.
 */
function ActionDisc({ glyph, label, spoken, onPress }: ActionDiscProps) {
  const colors = useThemeColors();
  const Glyph = ACTION_GLYPHS[glyph];
  const { columnHeight, actionDiameter, itemPaddingBottom } = TAB_BAR_METRICS;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      testID="tab-action-disc"
      className="flex-1 items-center justify-end"
      // The row height is the touch target, and it is the platform's own: 49pt
      // clears the 44pt floor, 80dp clears it comfortably.
      style={{ height: columnHeight, paddingBottom: itemPaddingBottom }}
    >
      {({ pressed }) => (
        <>
          <View
            className="items-center justify-center rounded-pill bg-action-yellow"
            style={{ height: actionDiameter, width: actionDiameter }}
          >
            {/* 26 on both platforms, as in gridgo-client — the disc resizes, the glyph does not. */}
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
      // Height and padding are the platform's, from `tabBarMetrics` — the HIG's
      // 49pt row or Material's 80dp container. A minimum rather than a fixed
      // height, so the column still grows if the label scales.
      className="flex-1 items-center justify-end"
      style={{
        minHeight: TAB_BAR_METRICS.columnHeight,
        paddingTop: TAB_BAR_METRICS.itemPaddingTop,
        paddingBottom: TAB_BAR_METRICS.itemPaddingBottom,
        rowGap: TAB_BAR_METRICS.itemGap,
      }}
    >
      {({ pressed }) => (
        <>
          {/*
            One glyph, one size, one stroke weight, in both states. Only the
            colour moves — nothing is filled, swapped or rescaled when a tab
            opens, so the row never shifts under your thumb.
          */}
          <View className={pressed ? "opacity-60" : undefined}>
            <Icon
              size={TAB_ICON_SIZE}
              strokeWidth={2}
              color={focused ? colors.textPrimary : colors.textMuted}
            />
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
