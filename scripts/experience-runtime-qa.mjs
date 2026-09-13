// Run only against an isolated local Wrangler preview with AI disabled and synthetic secrets.
import assert from 'node:assert/strict';
const origin = process.env.CAPTION_QA_ORIGIN || 'http://127.0.0.1:8787';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Runtime QA must stay local.');
const results = [];
async function call(path, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
 const response = await fetch(origin + path, { method, headers: { origin, 'content-type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
 const text = await response.text();
 const value = text ? JSON.parse(text) : null;
 return { status: response.status, value };
}
for (const path of ['/read', '/operator/mobile', '/view']) {
 const response = await fetch(origin + path);
 assert.equal(response.status, 200);
 assert.equal(response.headers.get('cache-control'), 'no-store');
 assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
 assert.match(response.headers.get('permissions-policy'), /microphone=\(\)/);
 results.push(path + ' document headers');
}
assert.ok([200, 201].includes((await call('/api/live/channel', {})).status));
const start = await call('/api/live/channel/service', { saveHistory: true, takeover: true });
assert.equal(start.status, 200);
const { controllerToken, serviceId, translationRevision, readerUrl } = start.value;
const controller = { 'x-caption-controller': controllerToken };
const reader = { 'x-caption-reader': new URL(readerUrl).hash.slice(1) };
const pair = await call('/api/live/experience/pair', {}, controller);
assert.equal(pair.status, 200);
const remote = { 'x-caption-remote': new URL(pair.value.url).hash.slice(1).split('.')[1] };
const pause = await call('/api/live/experience/remote', { serviceId, action: 'pause', id: 'synthetic-remote-pause-0001' }, remote);
assert.equal(pause.status, 200); assert.equal(pause.value.command.status, 'pending');
assert.equal((await call('/api/live/channel/lease', {}, controller)).status, 409);
assert.equal((await call('/api/live/experience/host', { capturing: false, success: true, acknowledgement: 'synthetic-remote-pause-0001' }, controller)).value.command.status, 'confirmed');
assert.equal((await call('/api/live/channel/control', { action: 'resume' }, controller)).status, 200);
results.push('remote Pause blocks inference and requires host ACK');
let lease = await call('/api/live/channel/lease', {}, controller);
assert.equal(lease.status, 200);
const publish = (lease, text) => call('/api/live/channel/caption', { publicText: text, targetLanguage: 'en', translationRevision,
 captionEpoch: lease.captionEpoch, transcriptionAttempt: lease.transcriptionRequests, reader: { filterText: '', keywordText: '' } }, controller);
assert.equal((await publish(lease.value, 'Synthetic draft to clear.')).status, 200);
assert.equal((await call('/api/live/channel/control', { action: 'clear' }, controller)).status, 200);
assert.equal((await publish(lease.value, 'Late stale synthetic output.')).status, 409);
lease = await call('/api/live/channel/lease', {}, controller);
assert.equal((await publish(lease.value, 'Synthetic committed paragraph.')).status, 200);
let reading;
const deadline = Date.now() + 90000;
do {
 reading = await call('/api/live/reader', undefined, reader);
 if (reading.value.paragraphs?.length) break;
 await new Promise((resolve) => setTimeout(resolve, 1000));
} while (Date.now() < deadline);
assert.equal(reading.status, 200);
assert.equal(reading.value.paragraphs.length, 1);
assert.equal(reading.value.paragraphs[0].text, 'Synthetic committed paragraph.');
assert.equal(reading.value.paragraphs[0].fallback, true);
results.push('real Durable Object alarm commits fallback; Clear rejects stale output');
assert.equal((await call('/api/live/channel/control', { action: 'clear' }, controller)).status, 200);
assert.equal((await call('/api/live/reader', undefined, reader)).value.paragraphs.length, 1);
assert.ok([200, 204].includes((await call('/api/live/channel/service', undefined, controller, 'DELETE')).status));
assert.equal((await call('/api/live/reader', undefined, reader)).value.status, 'ended');
assert.equal((await call('/api/live/experience/remote', { serviceId }, remote)).status, 410);
const archivePath = '/api/live/experience/sermons/' + serviceId;
assert.equal((await call(archivePath + '/archive')).value.details.saved, true);
assert.equal((await call(archivePath + '/remove', { id: reading.value.paragraphs[0].id, confirm: true })).status, 200);
assert.equal((await call('/api/live/reader', undefined, reader)).value.removed.length, 1);
assert.equal((await call(archivePath + '/delete', { confirm: true })).status, 200);
assert.equal((await call('/api/live/experience/history')).value.services.some((entry) => entry.id === serviceId), false);
assert.equal((await call(archivePath + '/archive')).status, 410);
assert.equal((await call('/api/live/reader', undefined, reader)).status, 410);
results.push('End grace, remote revocation, passage removal, archive deletion');
assert.equal((await call('/api/live/experience/usage')).value.records.length, 0);
assert.equal((await call('/api/live/reader', undefined, { 'x-caption-reader': 'bad' })).status, 403);
results.push('no AI usage from mirror, remote, or disabled reader phrasing');
console.log(JSON.stringify({ checks: results, providerCalls: 0 }, null, 2));
