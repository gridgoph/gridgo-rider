export type TabName = "offers" | "active" | "action" | "earnings" | "account";

export type TabDefinition = {
  /** Route file in `app/(tabs)`, without the extension. */
  name: TabName;
  /** Tab bar label. */
  label: string;
};

/**
 * The rider tab bar: four destinations around one action.
 *
 * Five columns, the action in the middle, matching the client app's shape so
 * the two products read as one family. The rider's four destinations are the
 * four questions they ask a phone all day:
 *
 * - **Offers** — where is my next job?
 * - **Active** — where am I going with the one I have?
 * - **Earnings** — what has today paid, and how much of GRIDGO's cash am I
 *   carrying? (COD makes the second question a real one — a rider needs to
 *   know what they owe before they finish for the day.)
 * - **Account** — who is this phone signed in as, and where is everything else.
 *
 * Alerts is deliberately **not** a destination. Its content is dispatch pings
 * and trip movements, both of which already have a home — the offer list and
 * the trip timeline — so as a fifth home it would restate them. It is a pushed
 * route behind a bell that carries the unread count on the two screens a rider
 * actually sits on, which keeps the badge visible without spending a permanent
 * slot on a list you read once and never return to.
 *
 * `action` is not a screen. It is the raised centre disc — see ACTION_TAB.
 */
export const TABS: readonly TabDefinition[] = [
  { name: "offers", label: "Offers" },
  { name: "active", label: "Active" },
  { name: "action", label: "Action" },
  { name: "earnings", label: "Earnings" },
  { name: "account", label: "Account" },
];

/**
 * The raised centre disc is an **action**, not a destination.
 *
 * The previous bar put Active — a place — on the disc, which is why it read as
 * unfinished: a raised disc promises "do the thing", and delivering a screen
 * instead breaks that promise. What the disc does now is the one thing that
 * moves the rider's job forward from wherever they are standing in the app:
 * collect the package, leave for the client, take the cash, capture the proof.
 * Its verb changes with the job, so it is labelled — see `riderAction`.
 */
export const ACTION_TAB: TabName = "action";

/** Destinations, in bar order. Everything here is a real screen. */
export const DESTINATION_TABS = TABS.filter((tab) => tab.name !== ACTION_TAB);
