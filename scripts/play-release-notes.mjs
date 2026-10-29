#!/usr/bin/env node
/**
 * Release notes for a Play testing upload.
 *
 * `eas submit` uploads the bundle but carries no release notes, so testers saw
 * a release with nothing to say what changed. After the submit, the release
 * job runs this to set them on that same release through the Google Play
 * Developer API's edits flow, with the same service account EAS used.
 *
 *   node scripts/play-release-notes.mjs
 *
 * Reads from the environment:
 *   PLAY_SERVICE_ACCOUNT_KEY_PATH   the service-account JSON (a mode-600 temp file)
 *   PLAY_PACKAGE                    the app's package name
 *   PLAY_VERSION_CODE               the versionCode the submit uploaded
 *   PLAY_VERSION                    the version name, for the log line
 *   PLAY_TRACK                      optional, default "internal"
 *
 * This app keeps no What's new file, so the notes are the titles of the pull
 * requests this build carries that the last release (the newest `v*` tag, which
 * every push to main makes) did not: newest change first, whole lines only,
 * within Play's 500-character limit for en-US. Pull request titles are written
 * for people, which is why they are used rather than commit subjects. The job
 * fetches the full history first; a shallow clone has no tag to compare with.
 *
 * Plain Node with no dependencies. The key and the access token never reach
 * the log: errors carry an HTTP status and Google's own message only.
 */
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Play's limit for one language's release notes. */
export const PLAY_NOTES_LIMIT = 500;
export const NOTES_LANGUAGE = "en-US";
const MORE = "And more improvements in this version.";
const FALLBACK = "Fixes and improvements.";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** Characters as Play counts them, not UTF-16 units. */
const length = (text) => [...text].length;

/**
 * The notes text for some change lines, already newest first: one "• " line
 * each, whole lines only. When some do not fit, the last line says there is
 * more, so a tester never reads a cut line.
 */
export function releaseNotesText(notes, limit = PLAY_NOTES_LIMIT) {
  const lines = notes.map((note) => `• ${note.trim()}`).filter((line) => line.length > 2);
  if (lines.length === 0) return FALLBACK;
  const kept = [];
  for (const [index, line] of lines.entries()) {
    const remaining = index < lines.length - 1;
    const next = [...kept, line];
    const room = remaining ? [...next, `• ${MORE}`] : next;
    if (length(room.join("\n")) > limit) {
      // This line does not fit with the "more" line after it. Stop here.
      return [...kept, `• ${MORE}`].join("\n");
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/** Release promotions and back-merges, which change nothing a tester sees. */
const HOUSEKEEPING = /^(release|promote|back-merge|merge)\b/i;
/** Branches whose pull requests only move other pull requests along. */
const PROMOTION_BRANCHES = new Set(["dev", "main"]);
/** A trailing reference such as "(#123)", "(C2BE8E7A)" or "(gridgo-client#245)". */
const TRAILING_REFERENCE = /\s*\((?:#\d+|[0-9A-F]{8}|[\w.-]+#\d+)\)\s*$/;

/**
 * The pull request title one commit stands for, or null.
 *
 * A merge commit ("Merge pull request #N from owner/branch") carries the title
 * as the first line of its body; a squash merge carries it as the subject,
 * ending in "(#N)". Anything else is a commit inside a pull request and is
 * already covered by that pull request's title.
 */
export function pullRequestTitle(subject, body) {
  const merge = /^Merge pull request #\d+ from [^/\s]+\/(\S+)$/.exec(subject);
  let title;
  if (merge) {
    if (PROMOTION_BRANCHES.has(merge[1])) return null;
    title = (body ?? "").trim().split("\n")[0];
  } else if (/\(#\d+\)\s*$/.test(subject)) {
    title = subject;
  } else {
    return null;
  }
  while (TRAILING_REFERENCE.test(title)) title = title.replace(TRAILING_REFERENCE, "");
  title = title.trim();
  if (!title || HOUSEKEEPING.test(title)) return null;
  return /[.!?]$/.test(title) ? title : `${title}.`;
}

const runGit = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

/**
 * The titles of the pull requests in HEAD that the newest `v*` release tag
 * does not have, newest first. Empty when there is no tag or nothing new.
 */
export function notesSinceLastRelease(root, git = runGit) {
  let tag;
  try {
    tag = git(root, ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD"]).trim();
  } catch {
    return [];
  }
  const log = git(root, ["log", "--format=%s%x1f%b%x1e", `${tag}..HEAD`]);
  const seen = new Set();
  const notes = [];
  for (const record of log.split("\x1e")) {
    const [subject, body] = record.replace(/^\n+/, "").split("\x1f");
    if (!subject) continue;
    const title = pullRequestTitle(subject.trim(), body);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    notes.push(title);
  }
  return notes;
}

/** The track update: the release with that versionCode gets the notes, the others are left as they are. */
export function withReleaseNotes(track, versionCode, text) {
  const code = String(versionCode);
  const releases = track.releases ?? [];
  const target = releases.find((release) => (release.versionCodes ?? []).map(String).includes(code));
  if (!target) {
    throw new Error(`the ${track.track} track has no release with versionCode ${code}`);
  }
  return {
    track: track.track,
    releases: releases.map((release) =>
      release === target ? { ...release, releaseNotes: [{ language: NOTES_LANGUAGE, text }] } : release,
    ),
  };
}

/** The notes on the release with that versionCode, or null. */
export function notesOnRelease(track, versionCode) {
  const code = String(versionCode);
  const release = (track.releases ?? []).find((r) => (r.versionCodes ?? []).map(String).includes(code));
  return release?.releaseNotes?.find((note) => note.language === NOTES_LANGUAGE)?.text ?? null;
}

const base64url = (value) => Buffer.from(value).toString("base64url");

/** A signed service-account assertion (RFC 7523), exchanged for an access token. */
export function serviceAccountAssertion(key, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: key.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key, "base64url")}`;
}

async function accessToken(key, transport) {
  const response = await transport(key.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(key),
    }).toString(),
  });
  // Only the status: the body of a token response is the token itself.
  if (!response.ok) throw new Error(`Google refused the service account (HTTP ${response.status})`);
  const { access_token: token } = await response.json();
  if (!token) throw new Error("Google sent no access token");
  return token;
}

function playClient(token, transport, packageName) {
  return async (method, path, body) => {
    const response = await transport(`${API}/${encodeURIComponent(packageName)}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = "";
      try {
        message = JSON.parse(text).error?.message ?? "";
      } catch {
        // Not JSON; say nothing more than the status.
      }
      const error = new Error(`Play API ${method} ${path.replace(/edits\/[^/:]+/, "edits/…")}: HTTP ${response.status}${message ? ` ${message}` : ""}`);
      error.status = response.status;
      error.playMessage = message;
      throw error;
    }
    return text ? JSON.parse(text) : {};
  };
}

/**
 * Sets the notes on the release, commits, and reads them back in a fresh edit.
 * Returns the notes Play now holds for that release.
 */
export async function setPlayReleaseNotes({ key, packageName, versionCode, track = "internal", text }, transport = fetch) {
  const play = playClient(await accessToken(key, transport), transport, packageName);

  const edit = await play("POST", "/edits");
  const current = await play("GET", `/edits/${edit.id}/tracks/${track}`);
  await play("PUT", `/edits/${edit.id}/tracks/${track}`, withReleaseNotes(current, versionCode, text));
  try {
    await play("POST", `/edits/${edit.id}:commit`);
  } catch (error) {
    // Play asks for this flag on an app whose changes go to review in a batch.
    if (!/changesNotSentForReview/i.test(error.playMessage ?? "")) throw error;
    await play("POST", `/edits/${edit.id}:commit?changesNotSentForReview=true`);
  }

  const check = await play("POST", "/edits");
  try {
    return notesOnRelease(await play("GET", `/edits/${check.id}/tracks/${track}`), versionCode);
  } finally {
    await play("DELETE", `/edits/${check.id}`).catch(() => {});
  }
}

async function main() {
  const env = process.env;
  for (const name of ["PLAY_SERVICE_ACCOUNT_KEY_PATH", "PLAY_PACKAGE", "PLAY_VERSION_CODE", "PLAY_VERSION"]) {
    if (!env[name]) throw new Error(`${name} is not set`);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const text = releaseNotesText(notesSinceLastRelease(root));
  const key = JSON.parse(readFileSync(env.PLAY_SERVICE_ACCOUNT_KEY_PATH, "utf8"));
  const track = env.PLAY_TRACK || "internal";

  const stored = await setPlayReleaseNotes({
    key,
    packageName: env.PLAY_PACKAGE,
    versionCode: env.PLAY_VERSION_CODE,
    track,
    text,
  });
  if (stored !== text) {
    throw new Error(`Play does not show the notes on versionCode ${env.PLAY_VERSION_CODE} after the commit`);
  }
  console.log(`Release notes for ${env.PLAY_VERSION} (${NOTES_LANGUAGE}, ${length(text)} characters) are on versionCode ${env.PLAY_VERSION_CODE} in the ${track} track, read back from Play:`);
  console.log(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
