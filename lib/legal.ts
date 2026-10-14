/**
 * GRIDGO's legal documents, the agreements a rider makes, and the privacy
 * requests they can send (gridgo-api `docs/LEGAL_API.md`, report 879B25FC).
 *
 * The rules live here so screens only draw them:
 * - which documents the apply form and the library name, by slot;
 * - the exact bodies an agreement is recorded with — always the version IDs
 *   the rider was shown, never a hard-coded "version 1";
 * - how a version, a placeholder and a privacy request are worded.
 *
 * Text is plain text. Nothing here ever turns a document into HTML.
 */

import {
  ApiError,
  apiErrorCode,
  type EnrollmentConsentBody,
  type LegalAcceptanceContext,
  type LegalVersion,
  type PrivacyRequest,
  type PrivacyRequestKind,
} from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import type { Href } from "expo-router";

export const TERMS_ID = "terms-of-service";
export const PRIVACY_ID = "privacy-notice";
export const RIDER_AGREEMENT_ID = "rider-agreement";

/**
 * What a rider agrees to before GRIDGO files their application: the Rider
 * Agreement, and the Terms and Privacy Notice every GRIDGO account agrees to.
 */
export const SIGNUP_DOCUMENT_IDS = [RIDER_AGREEMENT_ID, TERMS_ID, PRIVACY_ID] as const;

/**
 * The library's reading order: the three agreements first, then the policies
 * that apply to everyone. Slots GRIDGO adds later follow, by title.
 */
const LIBRARY_ORDER = [
  RIDER_AGREEMENT_ID,
  TERMS_ID,
  PRIVACY_ID,
  "acceptable-use",
  "age-policy",
  "cookie-notice",
];

export function libraryOrder(documents: readonly LegalVersion[]): LegalVersion[] {
  const rank = (id: string) => {
    const at = LIBRARY_ORDER.indexOf(id);
    return at === -1 ? LIBRARY_ORDER.length : at;
  };
  return [...documents].sort(
    (a, b) => rank(a.documentId) - rank(b.documentId) || a.title.localeCompare(b.title),
  );
}

/** The reader for exactly this version — a stable link to what was agreed to. */
export function legalDocumentHref(doc: Pick<LegalVersion, "id">): Href {
  return { pathname: "/legal/[versionId]", params: { versionId: doc.id } } as Href;
}

export function documentFor(
  documents: readonly LegalVersion[] | null | undefined,
  documentId: string,
): LegalVersion | null {
  return documents?.find((doc) => doc.documentId === documentId) ?? null;
}

/** The three apply-time agreements, or null while any is missing from the library. */
export function signupDocuments(
  documents: readonly LegalVersion[] | null | undefined,
): LegalVersion[] | null {
  const found = SIGNUP_DOCUMENT_IDS.map((id) => documentFor(documents, id));
  return found.every(Boolean) ? (found as LegalVersion[]) : null;
}

/** "Rider Agreement, Terms of Service and Privacy Notice", for one box naming several. */
export function joinTitles(documents: readonly Pick<LegalVersion, "title">[]): string {
  const titles = documents.map((doc) => doc.title);
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

const DATE_PARTS = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "9 Oct 2026" in Davao time, whatever order the runtime's locale data prefers. */
export function legalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(
    DATE_PARTS.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}

/** "Version 2, in effect from 9 Oct 2026". */
export function versionLine(doc: Pick<LegalVersion, "version" | "effectiveAt">): string {
  const date = legalDate(doc.effectiveAt);
  return date ? `Version ${doc.version}, in effect from ${date}` : `Version ${doc.version}`;
}

export type LegalStatusLook = { tone: StatusTone; label: string; icon: StatusIconName };

/**
 * A placeholder is said in words every time it is drawn. Agreeing to one does
 * not stand in for agreeing to the real text, and the rider should know which
 * they are reading.
 */
export function legalStatusLook(
  doc: Pick<LegalVersion, "placeholder" | "status">,
): LegalStatusLook {
  if (doc.placeholder || doc.status === "placeholder") {
    return { tone: "warning", label: "Placeholder", icon: "square-pen" };
  }
  return { tone: "success", label: "In effect", icon: "circle-check" };
}

export const PLACEHOLDER_NOTE =
  "This is placeholder text. GRIDGO will publish the reviewed document here, and ask you to agree to it then.";

/**
 * The change note worth showing: a later version's own summary. The launch
 * placeholders all say "Launch placeholder", which tells a reader nothing the
 * Placeholder chip does not.
 */
export function changeNote(doc: Pick<LegalVersion, "version" | "changeSummary">): string | null {
  const summary = doc.changeSummary?.trim();
  if (!summary || doc.version <= 1) return null;
  return summary;
}

// ---------------------------------------------------------------------------
// Agreeing on the apply form
// ---------------------------------------------------------------------------

/** The apply form's answers. `adult` is null until the rider says. */
export type SignupConsent = {
  agreed: boolean;
  adult: boolean | null;
  guardian: boolean;
  marketing: boolean;
};

export const EMPTY_SIGNUP_CONSENT: SignupConsent = {
  agreed: false,
  adult: null,
  guardian: false,
  marketing: false,
};

/**
 * Why the application cannot go yet, in the order the boxes are drawn.
 * `documents` false means the library could not be read: there is nothing to
 * agree to yet, and saying so beats a box naming nothing.
 */
export function signupConsentProblem(
  consent: SignupConsent,
  documentsReady = true,
): string | null {
  if (!documentsReady) return "GRIDGO's terms have not loaded yet. Load them, then apply.";
  if (consent.adult === null) return "Say whether you are 18 or older.";
  if (consent.adult === false && !consent.guardian) {
    return "Under 18, a parent or guardian has to agree with you. Tick the guardian box.";
  }
  if (!consent.agreed) {
    return "Tick the box to agree to the Rider Agreement, Terms of Service and Privacy Notice.";
  }
  return null;
}

export function enrollmentConsentBody(
  versionIds: string[],
  consent: SignupConsent,
  context: LegalAcceptanceContext,
): EnrollmentConsentBody {
  const junior = consent.adult === false;
  return {
    accepted: true,
    versionIds,
    method: "checkbox",
    junior,
    ...(junior ? { guardian: consent.guardian } : {}),
    marketing: consent.marketing,
    ...context,
  };
}

/** Codes gridgo-api answers when an agreement could not be recorded. */
const LEGAL_REFUSALS = new Set([
  "legal_consent_required",
  "legal_version_changed",
  "invalid_legal_versions",
  "invalid_acceptance_metadata",
  "unsupported_legal_consent_version",
  "legal_audience_mismatch",
]);

export function isLegalRefusal(error: unknown): boolean {
  const code = apiErrorCode(error);
  return code != null && LEGAL_REFUSALS.has(code);
}

/** A newer version took effect while the rider was reading. */
export function isLegalVersionChanged(error: unknown): boolean {
  return apiErrorCode(error) === "legal_version_changed";
}

export const LEGAL_VERSION_CHANGED =
  "GRIDGO published a newer version while you were reading. Read it, then agree again.";

export const SIGNUP_CONSENT_REFUSED =
  "GRIDGO could not record your agreement, so the application was not sent. Read the terms again, tick the box, and apply.";

/** An API without the legal library answers its routes 404. */
export function isLegalUnsupported(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// ---------------------------------------------------------------------------
// The blocking screen and notices
// ---------------------------------------------------------------------------

/**
 * - `unknown` — not read yet for this account. The launch waits on it rather
 *   than painting Active and then snatching it away.
 * - `blocked` — a document is waiting. Ordinary navigation is closed and the
 *   agreement screen is the only way on; legal text, privacy requests and
 *   sign-out stay open.
 * - `clear` — nothing waiting, or the read failed. A failed read lets the
 *   rider in and asks again on the next return: an outage must never lock a
 *   rider out of the job they are carrying.
 */
export type LegalGateStatus = "unknown" | "clear" | "blocked";

/** "Agree to GRIDGO's terms", or "GRIDGO's terms have changed" for a later version. */
export function gateHeading(pending: readonly Pick<LegalVersion, "version">[]): string {
  return pending.some((doc) => doc.version > 1)
    ? "GRIDGO's terms have changed"
    : "Agree to GRIDGO's terms";
}

export function gateBody(pending: readonly Pick<LegalVersion, "version">[]): string {
  return pending.some((doc) => doc.version > 1)
    ? "Read what changed, then agree to keep riding with GRIDGO. A job you are carrying stays yours while you read."
    : "Read them, then agree to start riding with GRIDGO. A job you are carrying stays yours while you read.";
}

/**
 * Over the agreement screen's second list. On first use these are the other
 * policies in effect; after a change they are the ones edited alongside it.
 */
export function gateNoticesHeading(notices: readonly Pick<LegalVersion, "version">[]): string {
  return notices.some((doc) => doc.version > 1)
    ? "ALSO UPDATED, NOTHING TO AGREE TO"
    : "ALSO IN EFFECT, NOTHING TO AGREE TO";
}

/** Notices this phone has not shown yet. */
export function unseenNotices(
  notices: readonly LegalVersion[],
  seen: readonly string[],
): LegalVersion[] {
  return notices.filter((doc) => !seen.includes(doc.id));
}

export function noticeHeading(notices: readonly Pick<LegalVersion, "title" | "version">[]): string {
  const updated = notices.some((doc) => doc.version > 1);
  if (notices.length === 1) {
    return updated ? `GRIDGO updated its ${notices[0].title}` : `New to read: ${notices[0].title}`;
  }
  return updated
    ? `GRIDGO updated ${notices.length} policies`
    : `${notices.length} GRIDGO policies to read`;
}

/** The notice's line: which ones, and that nothing is asked of the rider. */
export function noticeBody(notices: readonly Pick<LegalVersion, "title">[]): string {
  const which = notices.length > 1 ? `${joinTitles(notices)}. ` : "";
  const where = notices.length > 1 ? "They stay" : "It stays";
  return `${which}Nothing to agree to. ${where} in Account, under Legal & Privacy.`;
}

// ---------------------------------------------------------------------------
// Privacy requests
// ---------------------------------------------------------------------------

export type PrivacyKindCopy = {
  title: string;
  /** The row's line on Your data. */
  detail: string;
  /** The request screen's opening paragraph. */
  explain: string;
  detailsLabel: string;
  detailsHelper: string;
  /** True when the request means little without the details. */
  detailsRequired: boolean;
};

export const PRIVACY_KINDS: Record<Exclude<PrivacyRequestKind, "deletion">, PrivacyKindCopy> = {
  access: {
    title: "See my data",
    detail: "Ask for a copy of the personal data GRIDGO holds about you",
    explain:
      "GRIDGO will check it is you, then send you a copy of the personal data it holds about you: your account, your application, the jobs you carried and their delivery records.",
    detailsLabel: "Anything in particular?",
    detailsHelper: "Optional. For example, only the jobs you carried this month.",
    detailsRequired: false,
  },
  correction: {
    title: "Correct my data",
    detail: "Tell GRIDGO about something it has wrong",
    explain:
      "Say what is wrong and what it should be. Your name, number, vehicle, plate and licence you can fix yourself in Your details; use this for anything else.",
    detailsLabel: "What should GRIDGO correct?",
    detailsHelper: "For example: the delivery time on job GG-1234 is wrong.",
    detailsRequired: true,
  },
};

export const DELETION_ROW = {
  title: "Delete my account",
  detail: "Ask GRIDGO to delete your account and personal data",
};

/**
 * Said wherever deletion is offered and once a request is sent: the records
 * GRIDGO must keep, and why, so "deleted" never promises more than it can.
 */
export const RETENTION_NOTE =
  "Some records stay, because the law requires GRIDGO to keep them: the delivery records of jobs you carried, your earnings and payout records, and the record of what you agreed to. GRIDGO tells you which ones it kept when it finishes your request.";

export const PRIVACY_REQUEST_FAILED =
  "Your request did not reach GRIDGO. Check this phone's connection and try again.";

export function privacyKindTitle(kind: string): string {
  if (kind === "deletion") return DELETION_ROW.title;
  if (kind === "access" || kind === "correction") return PRIVACY_KINDS[kind].title;
  return "Privacy request";
}

export function privacyStatusLook(status: string): LegalStatusLook {
  switch (status) {
    case "in_progress":
      return { tone: "info", label: "In progress", icon: "clock" };
    case "completed":
      return { tone: "success", label: "Done", icon: "circle-check" };
    case "rejected":
      return { tone: "error", label: "Declined", icon: "circle-x" };
    default:
      return { tone: "neutral", label: "Received", icon: "clock" };
  }
}

/** "Sent 9 Oct 2026, answer due by 24 Oct 2026", or the close when there is one. */
export function privacyRequestLine(
  request: Pick<PrivacyRequest, "status" | "requestedAt" | "dueAt" | "updatedAt">,
): string {
  const sent = legalDate(request.requestedAt);
  if (request.status === "completed" || request.status === "rejected") {
    const closed = legalDate(request.updatedAt);
    return [sent ? `Sent ${sent}` : null, closed ? `closed ${closed}` : null]
      .filter(Boolean)
      .join(", ");
  }
  const due = legalDate(request.dueAt);
  return [sent ? `Sent ${sent}` : null, due ? `answer due by ${due}` : null]
    .filter(Boolean)
    .join(", ");
}

/** An open request of this kind — a second one is allowed, but said first. */
export function openRequestOf(
  requests: readonly PrivacyRequest[],
  kind: string,
): PrivacyRequest | null {
  return (
    requests.find(
      (request) =>
        request.kind === kind && (request.status === "pending" || request.status === "in_progress"),
    ) ?? null
  );
}
