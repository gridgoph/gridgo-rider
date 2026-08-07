export type TabName = "offers" | "active" | "notifications" | "account";

export type TabDefinition = {
  name: TabName;
  label: string;
};

/**
 * Rider tab set — one job at a time.
 *
 * Home was removed: it restated offer count and the active trip that Offers
 * and Active already own. A rider mid-delivery should not hunt a dashboard.
 *
 * - Active: the job in hand (raised centre disc, zero taps from launch).
 * - Offers: accept the next job when idle.
 * - Alerts / Account: carried over unchanged.
 */
export const TABS: readonly TabDefinition[] = [
  { name: "offers", label: "Offers" },
  { name: "active", label: "Active" },
  { name: "notifications", label: "Alerts" },
  { name: "account", label: "Account" },
];

/**
 * Raised centre disc destination.
 *
 * Active is the rider's primary working surface — the one place they open
 * one-handed while moving. The raised yellow disc spends the bar's single
 * yellow budget on that destination.
 */
export const ACTION_TAB: TabName = "active";
