import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSharingHandler, cleanupExpiredShares, MAX_PHOTO_BYTES } from '../server/photo-sharing.mjs';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]);

function fixture() {
    let clock = Date.parse('2026-11-02T12:00:00Z');
    const entries = new Map();
    const store = {
        async set(key, data, { metadata }) {
            assert.ok(data instanceof ArrayBuffer, 'Netlify Blobs expects an ArrayBuffer');
            entries.set(key, { data: data.slice(0), metadata });
        },
        async getWithMetadata(key) { return entries.get(key) || null; },
        async getMetadata(key) { return entries.get(key) || null; },
        async delete(key) { entries.delete(key); },
        async *list({ paginate }) {
            assert.equal(paginate, true);
            const keys = [...entries.keys()];
            for (let i = 0; i < keys.length; i += 2) yield { blobs: keys.slice(i, i + 2).map(key => ({ key })) };
        }
    };
    const handle = createPhotoSharingHandler({ getStore: () => store, now: () => clock });
    const upload = (seconds = 3600, headers = {}, body = JPEG) => handle(new Request('https://snapbooth.example/api/shares', {
        method: 'POST', headers: { Origin: 'https://snapbooth.example', 'Content-Type': 'image/jpeg', 'X-Share-Expiry': String(seconds), ...headers }, body
    }));
    const get = (token, suffix = '') => handle(new Request(`https://snapbooth.example/api/shares?id=${token}${suffix}`));
    return { handle, store, entries, upload, get, setTime(value) { clock = value; }, get now() { return clock; } };
}

for (const seconds of [900, 3600, 86400]) {
    test(`a ${seconds}s photo link returns the exact uploaded strip on another device`, async () => {
        const h = fixture();
        const response = await h.upload(seconds);
        assert.equal(response.status, 201);
        const result = await response.json();
        assert.equal(Date.parse(result.expiresAt), h.now + seconds * 1000);
        assert.match(result.url, /^\/shared\.html#[A-Za-z0-9_-]{43}$/);
        const token = result.url.split('#')[1];
        const photo = await h.get(token);
        assert.equal(photo.status, 200);
        assert.equal(photo.headers.get('content-type'), 'image/jpeg');
        assert.equal(photo.headers.get('x-share-expires-at'), result.expiresAt);
        assert.match(photo.headers.get('cache-control'), /no-store/);
        assert.equal(photo.headers.get('netlify-cdn-cache-control'), 'no-store');
        assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), JPEG);
        const download = await h.get(token, '&download=1');
        assert.match(download.headers.get('content-disposition'), /^attachment; filename="SNAPBOOTH.jpg"/);
    });
}

test('links stop serving the photo at the exact expiry even before cleanup runs', async () => {
    const h = fixture();
    const { url, expiresAt } = await (await h.upload(900)).json();
    const token = url.split('#')[1];
    h.setTime(Date.parse(expiresAt) - 1);
    assert.equal((await h.get(token)).status, 200);
    h.setTime(Date.parse(expiresAt));
    const expired = await h.get(token);
    assert.equal(expired.status, 410);
    assert.match((await expired.json()).error, /expired/);
    assert.equal(h.entries.size, 0);
    assert.equal((await h.get(token)).status, 404);
});

test('separate photo links use different unguessable identifiers', async () => {
    const h = fixture();
    const first = await (await h.upload()).json();
    const second = await (await h.upload()).json();
    assert.notEqual(first.url, second.url);
    assert.equal(h.entries.size, 2);
});

for (const [name, seconds, headers, body, status] of [
    ['unsupported expiry', 60, {}, JPEG, 400],
    ['unbounded expiry', Infinity, {}, JPEG, 400],
    ['cross-site upload', 3600, { Origin: 'https://another.example' }, JPEG, 403],
    ['incorrect image type', 3600, { 'Content-Type': 'text/html' }, JPEG, 415],
    ['invalid JPEG', 3600, {}, new Uint8Array([1, 2, 3]), 400],
    ['oversized declared image', 3600, { 'Content-Length': String(MAX_PHOTO_BYTES + 1) }, JPEG, 413],
    ['oversized actual image', 3600, {}, new Uint8Array(MAX_PHOTO_BYTES + 1), 413]
]) {
    test(`${name} is rejected without storing a photo`, async () => {
        const h = fixture();
        assert.equal((await h.upload(seconds, headers, body)).status, status);
        assert.equal(h.entries.size, 0);
    });
}

test('invalid and missing links return an unavailable response with no caching', async () => {
    const h = fixture();
    for (const token of ['../private-key', '', 'a'.repeat(43)]) {
        const response = await h.get(token);
        assert.equal(response.status, 404);
        assert.match(response.headers.get('cache-control'), /no-store/);
    }
    const response = await h.handle(new Request('https://snapbooth.example/api/shares', { method: 'DELETE' }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, POST');
});

test('storage failures provide a useful error without exposing storage credentials', async () => {
    const handle = createPhotoSharingHandler({ getStore: () => { throw new Error('private credential'); } });
    const response = await handle(new Request(`https://snapbooth.example/api/shares?id=${'a'.repeat(43)}`));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private credential/);
});

test('cleanup walks every page and deletes expired photos while keeping active links', async () => {
    const h = fixture();
    for (const [key, expiresAt] of [['old-1', h.now - 1], ['old-2', h.now], ['current', h.now + 1], ['invalid', undefined]]) {
        h.entries.set(key, { metadata: { expiresAt } });
    }
    assert.equal(await cleanupExpiredShares(h.store, h.now), 3);
    assert.deepEqual([...h.entries.keys()], ['current']);
});
