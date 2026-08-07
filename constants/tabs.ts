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

export const ACTION_TAB = "active" as TabName;
