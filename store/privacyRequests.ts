import { create } from "zustand";

import * as api from "@/lib/api";
import type { PrivacyRequest, PrivacyRequestKind } from "@/lib/api";
import { PRIVACY_REQUEST_FAILED } from "@/lib/legal";

/**
 * The rider's own privacy requests (`/me/privacy-requests`): the list on Your
 * data, and the send from the request screen.
 *
 * A store rather than screen state so the list is already up to date when the
 * rider is taken back to it after a send. Never persisted.
 */
type PrivacyRequestsState = {
  requests: PrivacyRequest[];
  status: "idle" | "loading" | "ready" | "failed";
  sending: boolean;
  error: string | null;
  /** The request just sent, for the confirmation. */
  sent: PrivacyRequest | null;
  load: () => Promise<void>;
  send: (kind: PrivacyRequestKind, details?: string) => Promise<PrivacyRequest | null>;
  /** A request sent from elsewhere (Delete account), so the list shows it at once. */
  remember: (request: PrivacyRequest) => void;
  clearSend: () => void;
  reset: () => void;
};

const initial = {
  requests: [] as PrivacyRequest[],
  status: "idle" as const,
  sending: false,
  error: null,
  sent: null,
};

export const usePrivacyRequests = create<PrivacyRequestsState>((set, get) => ({
  ...initial,

  load: async () => {
    if (!get().requests.length) set({ status: "loading" });
    try {
      const requests = await api.listPrivacyRequests();
      set({ requests: newestFirst(requests), status: "ready" });
    } catch {
      set({ status: get().requests.length ? "ready" : "failed" });
    }
  },

  send: async (kind, details) => {
    if (get().sending) return null;
    set({ sending: true, error: null, sent: null });
    try {
      const request = await api.createPrivacyRequest(kind, details);
      get().remember(request);
      set({ sent: request });
      return request;
    } catch {
      set({ error: PRIVACY_REQUEST_FAILED });
      return null;
    } finally {
      set({ sending: false });
    }
  },

  remember: (request) =>
    set({
      requests: newestFirst([request, ...get().requests.filter((r) => r.id !== request.id)]),
    }),

  clearSend: () => set({ sending: false, error: null, sent: null }),
  reset: () => set(initial),
}));

function newestFirst(requests: PrivacyRequest[]): PrivacyRequest[] {
  return [...requests].sort(
    (a, b) => (Date.parse(b.requestedAt) || 0) - (Date.parse(a.requestedAt) || 0),
  );
}
