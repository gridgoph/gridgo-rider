export type TabName = "map" | "jobs" | "earnings" | "account";

export type TabDefinition = {
  /** Route file in `app/(tabs)`, without the extension. */
  name: TabName;
  /** Tab bar label. */
  label: string;
};

/**
 * The rider tab bar: four destinations, no raised centre control (#180).
 *
 * Map is home and the whole shift: going online, the one offer with its
 * countdown, and the trip with its four steps — so a delivery never needs a
 * second tab, and during one the bar steps aside (`GridgoTabBar`). Jobs is the
 * offer as a list, with past jobs. Earnings is today's money. Account is who
 * this phone is.
 *
 * Alerts is not a destination: it opens from the bell on the map and Jobs.
 */
export const TABS: readonly TabDefinition[] = [
  { name: "map", label: "Map" },
  { name: "jobs", label: "Jobs" },
  { name: "earnings", label: "Earnings" },
  { name: "account", label: "Account" },
];
