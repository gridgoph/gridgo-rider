import { loadExpoNotifications } from "@/lib/expoNotifications";

describe("expo-notifications loads without taking the app down", () => {
  it("returns the mocked module in this harness", () => {
    const module = loadExpoNotifications();
    expect(module).not.toBeNull();
    expect(typeof module?.getPermissionsAsync).toBe("function");
  });
});
