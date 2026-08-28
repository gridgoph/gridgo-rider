export type TabName = "offers" | "active" | "map" | "earnings" | "account";

export type TabDefinition = {
  /** Route file in `app/(tabs)`, without the extension. */
  name: TabName;
  /** Tab bar label. */
  label: string;
};

/**
 * The rider tab bar: five destinations, no raised centre control.
 *
 * Finding work is Offers. The job in hand, and its next step, is Active —
 * status, route, and the yellow button that advances the trip. Map is the
 * city. Earnings is today's money. Account is who this phone is.
 *
 * Alerts is not a destination: its content already lives on Offers and the
 * trip timeline.
 */
export const TABS: readonly TabDefinition[] = [
  { name: "offers", label: "Offers" },
  { name: "active", label: "Active" },
  { name: "map", label: "Map" },
  { name: "earnings", label: "Earnings" },
  { name: "account", label: "Account" },
];
