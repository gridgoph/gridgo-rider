import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PLAY_NOTES_LIMIT,
  notesSinceLastRelease,
  pullRequestTitle,
  releaseNotesText,
  serviceAccountAssertion,
  setPlayReleaseNotes,
  withReleaseNotes,
} from './play-release-notes.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = {
  type: 'service_account',
  client_email: 'publisher@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token',
};

test('notes keep the order they are given, newest first, one bullet each', () => {
  assert.equal(releaseNotesText(['Newest change.', 'Oldest change.']), '• Newest change.\n• Oldest change.');
});

test('notes stay within Play\'s limit in whole lines and say when there is more', () => {
  const notes = Array.from({ length: 16 }, (_, i) => `Change ${i} `.padEnd(110, 'x') + '.');
  const text = releaseNotesText(notes);
  assert.ok([...text].length <= PLAY_NOTES_LIMIT);
  const lines = text.split('\n');
  assert.equal(lines.at(-1), '• And more improvements in this version.');
  assert.equal(lines[0], `• ${notes[0]}`);
  for (const line of lines.slice(0, -1)) assert.ok(notes.map((n) => `• ${n}`).includes(line));
});

test('notes that fit are all kept, with no "more" line', () => {
  const text = releaseNotesText(['A.', 'B.', 'C.']);
  assert.ok(!text.includes('And more'));
  assert.equal(text.split('\n').length, 3);
});

test('a version with no notes still tells testers something', () => {
  assert.equal(releaseNotesText([]), 'Fixes and improvements.');
});

test('a pull request title comes from a merge body or a squash subject, without references', () => {
  assert.equal(
    pullRequestTitle('Merge pull request #115 from gridgoph/fm/gg-148-rider', 'Rider can message the shop (C2BE8E7A)\n\nBody.'),
    'Rider can message the shop.',
  );
  assert.equal(
    pullRequestTitle('Rider sees the confirmed delivery pin (6C8DE953) (#123)', '* details'),
    'Rider sees the confirmed delivery pin.',
  );
  assert.equal(pullRequestTitle('Show the layout (gridgo-client#245) (#160)', ''), 'Show the layout.');
  assert.equal(pullRequestTitle('Done already! (#9)', ''), 'Done already!');
});

test('release promotions, back-merges and plain commits are not changes', () => {
  assert.equal(pullRequestTitle('Merge pull request #127 from gridgoph/dev', 'Release dev to production (16 Oct 2026)'), null);
  assert.equal(pullRequestTitle('Merge pull request #106 from gridgoph/main', 'Back-merge main into dev'), null);
  assert.equal(pullRequestTitle('Merge pull request #126 from gridgoph/fm/x', 'Merge main into dev so it merges cleanly'), null);
  assert.equal(pullRequestTitle('Fix a typo in the chat test', ''), null);
  assert.equal(pullRequestTitle('Merge main into dev: record a commit', 'Body.'), null);
});

test('a build lists the pull requests the last release tag does not have, newest first', () => {
  const root = mkdtempSync(join(tmpdir(), 'play-notes-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'ci@example.com');
  git('config', 'user.name', 'CI');
  const commit = (message) => git('commit', '-q', '--allow-empty', '-m', message);
  assert.deepEqual(notesSinceLastRelease(root), [], 'no tag yet: nothing to compare with');
  commit('Already released (#1)');
  git('tag', 'v1.0.5');
  commit('Older change (#2)');
  commit('Inside a pull request');
  commit('Merge pull request #3 from gridgoph/fm/newer\n\nNewer change (ABCDEF12)');
  commit('Merge pull request #4 from gridgoph/dev\n\nRelease dev to production');
  assert.deepEqual(notesSinceLastRelease(root), ['Newer change.', 'Older change.']);
});

test('the notes go on the release with that versionCode only', () => {
  const track = {
    track: 'internal',
    releases: [
      { name: 'old', versionCodes: ['300'], status: 'completed' },
      { name: 'new', versionCodes: ['302'], status: 'completed' },
    ],
  };
  const updated = withReleaseNotes(track, 302, 'Notes');
  assert.deepEqual(updated.releases[0], track.releases[0]);
  assert.deepEqual(updated.releases[1].releaseNotes, [{ language: 'en-US', text: 'Notes' }]);
  assert.throws(() => withReleaseNotes(track, 999, 'Notes'), /no release with versionCode 999/);
});

test('the service-account assertion is signed with the key for the Play scope', () => {
  const [header, claims, signature] = serviceAccountAssertion(key, 1000).split('.');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${claims}`);
  assert.ok(verify.verify(publicKey, signature, 'base64url'));
  const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
  assert.equal(body.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.equal(body.iss, key.client_email);
  assert.equal(body.exp - body.iat, 600);
});

/** A fake Play: one internal track, edits that commit on request. */
function fakePlay({ commitNeedsFlag = false, tokenStatus = 200 } = {}) {
  const calls = [];
  let committed = { track: 'internal', releases: [{ name: '1.0.302', versionCodes: ['302'], status: 'completed' }] };
  const edits = new Map();
  let next = 1;
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const transport = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers });
    if (url.startsWith('https://oauth2')) return json(tokenStatus, tokenStatus === 200 ? { access_token: 'tok' } : { error: 'tok-in-error' });
    const path = url.replace('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/ph.gridgo.rider', '');
    if (options.method === 'POST' && path === '/edits') {
      const id = `e${next++}`;
      edits.set(id, structuredClone(committed));
      return json(200, { id });
    }
    let m = /^\/edits\/(\w+)\/tracks\/internal$/.exec(path);
    if (m && options.method === 'GET') return json(200, edits.get(m[1]));
    if (m && options.method === 'PUT') {
      edits.set(m[1], JSON.parse(options.body));
      return json(200, JSON.parse(options.body));
    }
    m = /^\/edits\/(\w+):commit(\?changesNotSentForReview=true)?$/.exec(path);
    if (m) {
      if (commitNeedsFlag && !m[2]) return json(400, { error: { message: 'Changes are sent for review automatically. changesNotSentForReview must be set.' } });
      committed = edits.get(m[1]);
      return json(200, { id: m[1] });
    }
    if (options.method === 'DELETE') return json(204, {});
    return json(404, { error: { message: 'not found' } });
  };
  return { transport, calls, committed: () => committed };
}

test('sets the notes through an edit, commits, and reads them back', async () => {
  const play = fakePlay();
  const stored = await setPlayReleaseNotes(
    { key, packageName: 'ph.gridgo.rider', versionCode: '302', text: '• Something new.' },
    play.transport,
  );
  assert.equal(stored, '• Something new.');
  assert.deepEqual(play.committed().releases[0].releaseNotes, [{ language: 'en-US', text: '• Something new.' }]);
  assert.equal(play.calls.at(-1).method, 'DELETE');
  assert.ok(play.calls.slice(1).every((call) => call.headers.authorization === 'Bearer tok'));
});

test('retries the commit with changesNotSentForReview only when Play asks for it', async () => {
  const play = fakePlay({ commitNeedsFlag: true });
  const stored = await setPlayReleaseNotes(
    { key, packageName: 'ph.gridgo.rider', versionCode: 302, text: 'Notes' },
    play.transport,
  );
  assert.equal(stored, 'Notes');
  assert.ok(play.calls.some((call) => call.url.endsWith(':commit?changesNotSentForReview=true')));
});

test('a refused service account fails with the status only', async () => {
  const play = fakePlay({ tokenStatus: 401 });
  await assert.rejects(
    setPlayReleaseNotes({ key, packageName: 'ph.gridgo.rider', versionCode: 302, text: 'x' }, play.transport),
    (error) => /HTTP 401/.test(error.message) && !error.message.includes('tok-in-error'),
  );
});
