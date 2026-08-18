export type TabName = "offers" | "active" | "action" | "map" | "earnings" | "account";

export type TabDefinition = {
  /** Route file in `app/(tabs)`, without the extension. */
  name: TabName;
  /** Tab bar label. */
  label: string;
};

/**
 * The rider tab bar: five destinations around one action.
 *
 * Six columns, the action still in the middle. Map is the extra destination
 * because it is a different question from Active — the city and its shops,
 * not the one job in hand. Alerts is still not a destination: its content
 * already lives on Offers and the trip timeline.
 *
 * - **Offers** — where is my next job?
 * - **Active** — where am I going with the one I have?
 * - **Map** — where are the shops, and what does the city look like?
 * - **Earnings** — what has today paid? One number now that cash on delivery
 *   is gone: everything on that screen is the rider's own money, which is why
 *   it no longer needs a second card keeping GRIDGO's apart from it.
 * - **Account** — who is this phone signed in as, and where is everything else.
 *
 * `action` is not a screen. It is the raised centre disc — see ACTION_TAB.
 */
export const TABS: readonly TabDefinition[] = [
  { name: "offers", label: "Offers" },
  { name: "active", label: "Active" },
  { name: "action", label: "Action" },
  { name: "map", label: "Map" },
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
 * check the package, leave for the client, capture the proof.
 * Its verb changes with the job, so it is labelled — see `riderAction`.
 */
export const ACTION_TAB: TabName = "action";

/** Destinations, in bar order. Everything here is a real screen. */
export const DESTINATION_TABS = TABS.filter((tab) => tab.name !== ACTION_TAB);
