import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * Editorial notices this phone has already shown, per account.
 *
 * gridgo-api leaves remembering a notice to the app ("may remember its
 * version locally"); nothing is recorded server-side for reading one.
 */

export const LEGAL_NOTICES_STORAGE_KEY = "gridgo.rider.legalNotices.v1";
const MAX_SEEN = 60;

type LegalNoticesState = {
  seen: Record<string, string[]>;
  hydrated: boolean;
  markSeen: (userId: string, versionIds: readonly string[]) => void;
};

export const useLegalNotices = create<LegalNoticesState>((set, get) => ({
  seen: {},
  hydrated: false,
  markSeen: (userId, versionIds) => {
    if (!versionIds.length) return;
    const mine = get().seen[userId] ?? [];
    const next = [...mine, ...versionIds.filter((id) => !mine.includes(id))].slice(-MAX_SEEN);
    const seen = { ...get().seen, [userId]: next };
    set({ seen });
    void AsyncStorage.setItem(LEGAL_NOTICES_STORAGE_KEY, JSON.stringify(seen)).catch(() => {});
  },
}));

function parseSeen(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string"),
      ),
    );
  } catch {
    return {};
  }
}

let hydration: Promise<void> | null = null;

/** Read what this phone has shown. Storage that will not answer costs the memory, never the app. */
export function hydrateLegalNotices(): Promise<void> {
  hydration ??= AsyncStorage.getItem(LEGAL_NOTICES_STORAGE_KEY)
    .then((raw) => {
      const stored = parseSeen(raw);
      // A notice marked seen before the read answered is kept.
      const live = useLegalNotices.getState().seen;
      const merged = { ...stored };
      for (const [userId, ids] of Object.entries(live)) {
        merged[userId] = [...(stored[userId] ?? []), ...ids.filter((id) => !stored[userId]?.includes(id))];
      }
      useLegalNotices.setState({ seen: merged });
    })
    .catch(() => {})
    .finally(() => useLegalNotices.setState({ hydrated: true }));
  return hydration;
}

/** Tests only. */
export function resetLegalNoticesForTests(): void {
  hydration = null;
  useLegalNotices.setState({ seen: {}, hydrated: false });
}
