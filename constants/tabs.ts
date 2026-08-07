export type TabName = "home" | "offers" | "active" | "notifications" | "account";

export type TabDefinition = {
  name: TabName;
  label: string;
};

export const TABS: readonly TabDefinition[] = [
  { name: "home", label: "Home" },
  { name: "offers", label: "Offers" },
  { name: "active", label: "Active" },
  { name: "notifications", label: "Alerts" },
  { name: "account", label: "Account" },
];

/**
 * Raised centre disc destination.
 *
 * Decision (keep): Active is the rider's primary working surface — the one
 * place they open one-handed while moving. The raised yellow disc spends the
 * bar's single yellow budget on that destination, not on "start something new".
 * Offers is a list of jobs to accept; Active is the job in hand.
 *
 * Set to a TabName to raise that tab as a disc. There is no client-style
 * "create" action in this binary, so the disc always points at a real tab.
 */
export const ACTION_TAB: TabName = "active";
