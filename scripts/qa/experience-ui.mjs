import { QA_VIEWPORT_WIDTHS, openSettings } from "./dashboard-helpers.mjs";
// Synthetic browser checks only. All API requests are mocked and external traffic is blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, 'Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.');
const { chromium } = await import(pathToFileURL(path.join(tooling, 'node_modules/playwright/index.mjs')));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, 'node_modules/@axe-core/playwright/dist/index.mjs')));
const output = path.resolve('test-results/live-session-plan-1');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

function loadTypeScriptModule(source, stubs = {}) {
 const loadedModule = { exports: {} };
 const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 runInNewContext(
  `(function(require,module,exports){${javascript}})(require,module,exports);`,
  { require: stubs.require ?? (() => ({})), module: loadedModule, exports: loadedModule.exports, Response, Request },
 );
 return loadedModule.exports;
}

const en = loadTypeScriptModule(await fs.readFile('src/i18n/messages/en.ts', 'utf8')).en;
const idMessages = loadTypeScriptModule(await fs.readFile('src/i18n/messages/id.ts', 'utf8')).id;
const viewerSource = await fs.readFile('src/live/viewer-document.ts', 'utf8');
function viewerHtml(locale) {
 const messages = locale === 'id' ? idMessages : en;
 const loadedModule = loadTypeScriptModule(viewerSource, {
  require: () => ({
   // Fills the placeholders the way the real translate does: passed values first, then General's session term.
   translate: (_locale, key, params = {}) => {
    const general = locale === 'id' ? { Term_session: 'Sesi', term_session: 'sesi' } : { Term_session: 'Session', term_session: 'session' };
    return (messages[key] ?? en[key] ?? key).replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, name) => params[name] ?? general[name] ?? match);
   },
   localeFromAcceptLanguage: () => locale,
  }),
 });
 return loadedModule.viewerDocumentResponse().text();
}
const viewerHtmlEn = await viewerHtml('en');
const viewerHtmlId = await viewerHtml('id');
const id = '12345678-1234-1234-1234-123456789012';
const origin = 'http://127.0.0.1:3100';
const source = { id: 1, text: 'Synthetic transcript source about patience.', language: 'id', at: Date.now(), epoch: 0, translationRevision: 1 };
const paragraph = { id: 1, sourceIds: [1], text: 'Synthetic readable paragraph about patience.', language: 'en', at: Date.now(), epoch: 0, translationRevision: 1, fallback: true };
try {
 for (const width of QA_VIEWPORT_WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: width > 500 ? 1080 : 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); const errors = []; const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let readerStatus = 'live', readerExpired = false, readerRemoved = false;
  let remote = { status: 'live', connected: true, command: null };
  let summary = null; let excluded = false; const summaryIds = [];
  let workspaceProfile = null;
  // The session's format snapshot as the reader and viewer receive it, and the viewer's first message.
  let readerPreset;
  let viewerReady = { status: 'live' };
  await page.route('**/*', async (route) => {
   const request = route.request(); const url = new URL(request.url());
   if (url.origin !== origin) return route.abort();
   if (url.pathname === '/view') return route.fulfill({ contentType: 'text/html', body: (request.headers()['accept-language'] ?? '').toLowerCase().includes('id') ? viewerHtmlId : viewerHtmlEn });
   if (!url.pathname.startsWith('/api/')) return route.continue();
   requests.push(url.pathname);
   let body = {}; try { body = request.postDataJSON() ?? {}; } catch {}
   let payload;
   if (url.pathname === '/api/live/reader') {
    if (readerExpired) return route.fulfill({ status: 403, json: { error: 'Expired' } });
    payload = { status: readerStatus, saved: true, ...(readerPreset ? { preset: readerPreset } : {}), paragraphs: Number(url.searchParams.get('after')) < 1 ? [paragraph] : [], removed: readerRemoved ? [1] : [] };
   } else if (url.pathname.endsWith('/experience/remote')) {
    if (body.action) { remote = { status: body.action === 'pause' ? 'paused' : body.action === 'resume' ? 'live' : remote.status, connected: true, command: { action: body.action, status: 'pending' } }; }
    else if (remote.command) remote.command.status = 'confirmed';
    payload = remote;
   } else if (url.pathname.startsWith('/api/ai/health')) payload = { status: 'ready', hosting: 'cloudflare', access: { ready: true, provider: 'Cloudflare Access' }, transcription: { ready: true, model: 'whisper-large-v3-turbo' }, translation: { ready: true, model: 'openai/gpt-oss-20b' } };
   else if (url.pathname === '/api/live/channel') payload = { channelId: 'main', configured: true, status: 'idle', overlayUrl: origin + '/overlay#main.' + 'o'.repeat(43), style: {}, startedAt: null, expiresAt: null, transcriptionRequests: 0, llmUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, translationRequests: 0, providerRateLimit: null }, translationRevision: 1 };
   else if (url.pathname.endsWith('/experience/history')) payload = { sessions: [{ id, startedAt: Date.now() }], services: [{ id, startedAt: Date.now() }] };
   else if (url.pathname.endsWith('/archive')) payload = { details: { id, status: 'ended', saved: true, startedAt: Date.now(), expiresAt: Date.now() + 5400000, endedAt: Date.now(), incomplete: false }, sources: [{ ...source, excluded }], paragraphs: excluded ? [] : [paragraph], notes: [], summary, more: false, moreParagraphs: false };
   else if (url.pathname.endsWith('/summary')) { summaryIds.push(body.requestId); summary = { status: 'completed', result: [{ text: 'Synthetic supported summary.', sourceIds: [1] }] }; if (summaryIds.length === 1) return route.abort('failed'); assert.equal(summaryIds[1], summaryIds[0], 'Retry must reuse the acknowledged-lost summary request ID'); payload = summary; }
   else if (url.pathname.endsWith('/remove')) { assert.equal(body.confirm, true); excluded = true; summary = null; payload = { removed: true }; }
   else if (url.pathname.endsWith('/correct')) { assert.ok(body.text); summary = null; payload = { corrected: true }; }
   else if (url.pathname.endsWith('/delete')) { assert.equal(body.confirm, true); payload = { deleted: true }; }
   else if (url.pathname.endsWith('/experience/preferences') || url.pathname.endsWith('/experience/setup')) payload = { version: 1, theme: 'system', profile: url.pathname.endsWith('/experience/setup') ? workspaceProfile : null, translationSystemPrompt: null, summaryDefaults: null, captionStyle: null, translationDefaults: null, updatedAt: workspaceProfile && url.pathname.endsWith('/experience/setup') ? Date.now() : null };
   else if (url.pathname.endsWith('/experience/usage')) payload = { records: [{ id: 'synthetic-attempt', sessionId: id, at: Date.now(), stage: 'translation', provider: 'groq', model: 'openai/gpt-oss-20b', status: 'completed', tokens: { promptTokens: 150, completionTokens: 50, totalTokens: 200 }, audioSeconds: null, estimatedNeurons: 0 }], next: null };
   else { errors.push('Unexpected API: ' + url.pathname); return route.fulfill({ status: 400, json: { error: 'Unexpected request' } }); }
   return route.fulfill({ status: 200, json: payload });
  });
  async function check(screen) {
   await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
   const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? '' : [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(-4).map((el) => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().right)}`).join(' | '));
   assert.ok(!wide, width + '/' + screen + ' overflow: ' + wide);
   const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
   results.push({ width, screen, violations: axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })) });
   await page.screenshot({ path: `${output}/${screen}-${width}.png`, fullPage: true });
  }
  await page.routeWebSocket('**/api/live/viewer?*', (socket) => socket.send(JSON.stringify({ type: 'ready', ...viewerReady, caption: { sequence: 1, publicText: 'Synthetic latest translation.', targetLanguage: 'en' } })));
  await page.goto(origin + '/view#main.' + 'v'.repeat(43));
  await page.getByText('Synthetic latest translation.', { exact: true }).waitFor();
  await check('viewer');
  await page.goto(origin + '/read#' + id + '.' + 'r'.repeat(43));
  await page.getByText(paragraph.text, { exact: true }).waitFor();
  await page.getByLabel('Text size').selectOption('extra'); await check('reader');
  readerStatus = 'paused'; await page.getByText('Paused', { exact: true }).waitFor();
  assert.equal(await page.getByText(paragraph.text, { exact: true }).count(), 1);
  readerRemoved = true; await page.getByText('Waiting for the next readable paragraph…').waitFor();
  readerExpired = true; await page.getByText('Reader link expired or replaced', { exact: true }).waitFor();
  assert.ok(requests.every((url) => url === '/api/live/reader'));
  // Audience pages render the session's own snapshot, whatever format the workspace uses now: a Sermon session reads "Service".
  const sermonSnapshot = { id: 'builtin:sermon', version: 1, terms: {
   en: { session: { singular: 'service', plural: 'services' }, speaker: { singular: 'preacher', plural: 'preachers' }, audience: { singular: 'congregation', plural: 'congregations' }, transcripts: { singular: 'sermons' } },
   id: { session: { singular: 'ibadah', plural: 'ibadah' }, speaker: { singular: 'pengkhotbah', plural: 'pengkhotbah' }, audience: { singular: 'jemaat', plural: 'jemaat' }, transcripts: { singular: 'khotbah' } },
  } };
  readerExpired = false; readerRemoved = false; readerStatus = 'ended';
  // The reader link is already open, so reload it instead of navigating to the same address.
  await page.reload();
  await page.getByText('Session ended', { exact: true }).waitFor();
  await page.getByText('Earlier paragraphs are available during this session and for 30 minutes after it ends.', { exact: true }).waitFor();
  readerPreset = sermonSnapshot;
  await page.getByText('Service ended', { exact: true }).waitFor();
  await page.getByText('Earlier paragraphs are available during this service and for 30 minutes after it ends.', { exact: true }).waitFor();
  await check('reader-snapshot');
  viewerReady = { status: 'idle' };
  await page.goto(origin + '/view#main.' + 'v'.repeat(43));
  await page.locator('.status', { hasText: 'Session ended' }).waitFor();
  viewerReady = { status: 'idle', preset: sermonSnapshot };
  await page.reload();
  await page.locator('.status', { hasText: 'Service ended' }).waitFor();
  await check('viewer-snapshot');
  readerPreset = undefined; readerStatus = 'live'; viewerReady = { status: 'live' };
  await page.setExtraHTTPHeaders({ 'accept-language': 'id-ID,id;q=0.9' });
  readerStatus = 'live'; readerExpired = false; readerRemoved = false;
  await page.goto(origin + '/view#main.' + 'v'.repeat(43));
  await page.getByText('Terjemahan Live', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'id'); await check('viewer-id');
  await page.goto(origin + '/read#' + id + '.' + 'r'.repeat(43));
  await page.getByText('Pembaca transkrip', { exact: true }).waitFor();
  await page.getByText('Live · teks muncul setelah sekitar 30 detik', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'id'); await check('reader-id');
  // The same snapshot reads in Indonesian on both audience pages.
  readerPreset = sermonSnapshot; readerStatus = 'ended';
  await page.reload();
  await page.getByText('Ibadah berakhir', { exact: true }).waitFor();
  viewerReady = { status: 'idle', preset: sermonSnapshot };
  await page.reload();
  await page.locator('.status', { hasText: 'Ibadah berakhir' }).waitFor();
  readerPreset = undefined; readerStatus = 'live'; viewerReady = { status: 'live' };
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });
  requests.length = 0;
  await page.evaluate(() => localStorage.setItem('caption-studio:ui-locale:v1', 'id'));
  await page.goto(origin + '/operator/mobile#' + id + '.' + 'p'.repeat(43));
  await page.getByText('Sistem caption terhubung · live', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'id');
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await page.getByText('Jeda: dikonfirmasi oleh sistem caption.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
  await page.getByText('Lanjutkan: dikonfirmasi oleh sistem caption.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Bersihkan layar', exact: true }).click();
  await page.getByText('Bersihkan layar: dikonfirmasi oleh sistem caption.', { exact: true }).waitFor(); await check('remote');
  assert.ok(requests.every((url) => url === '/api/live/experience/remote'));
  await page.evaluate(() => localStorage.removeItem('caption-studio:ui-locale:v1'));
  await page.goto(origin + '/#transcripts'); await page.getByRole('heading', { name: 'Transcripts', exact: true }).waitFor();
  await page.goto(origin + '/#sermons'); await page.getByRole('heading', { name: 'Transcripts', exact: true }).waitFor();
  await page.locator('.archiveList button').first().click();
  await page.getByText('Show the transcript', { exact: true }).click();
  await page.getByRole('button', { name: 'Correct', exact: true }).click();
  await page.getByLabel('Corrected text').fill('Reviewed synthetic source.');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
  await page.getByText('Couldn’t reach the transcript store. Check the connection, then try again.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
  await page.getByText('Synthetic supported summary.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export summary', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '#1', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'source-1');
  await check('archive');
  await page.getByText('Show reader passages', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await check('remove-dialog');
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove passage', exact: true }).click();
  await page.getByText('Done.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Synthetic supported summary.', { exact: false }).count(), 0);
  await openSettings(page, "usage");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${output}/usage-before-${width}.png`, fullPage: true });
  await fs.writeFile(`${output}/usage-before-${width}.txt`, await page.locator('body').innerText());
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Usage by day (UTC)', { exact: true }).click(); assert.equal(await page.getByText('Plan monthly service capacity', { exact: true }).count(), 0); await check('usage');
  // The saved Sermon format relabels the Transcripts heading.
  workspaceProfile = 'builtin:sermon';
  await page.goto(origin + '/#transcripts'); await page.reload();
  await page.getByRole('heading', { name: 'Sermons', exact: true }).waitFor();
  await check('transcripts-sermon');
  assert.deepEqual(errors, []); await context.close();
 }
 await fs.writeFile(output + '/results.json', JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results, null, 2));
 assert.ok(results.every((r) => r.violations.length === 0));
} finally { await browser.close(); }
