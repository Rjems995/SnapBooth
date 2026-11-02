const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const qrcode = require('qrcode-generator');

const source = fs.readFileSync(path.join(__dirname, '..', 'sharing.js'), 'utf8');
const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])], { type: 'image/jpeg' });
const token = 'a'.repeat(43);

function harness({ navigator = {}, fetch = async () => { throw new Error('Unexpected upload'); } } = {}) {
    const elements = new Map();
    const timers = new Map();
    const payloads = [];
    const document = { getElementById(id) {
        if (!elements.has(id)) {
            const classes = new Set(['hidden']);
            elements.set(id, {
                classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
                disabled: false, value: id === 'shareExpiry' ? '3600' : '', textContent: '',
                removeAttribute(name) { delete this[name]; },
                focus() { this.focused = true; }, select() { this.selected = true; }
            });
        }
        return elements.get(id);
    } };
    let nextTimer = 0;
    const window = { location: { origin: 'https://snapbooth.example', protocol: 'https:' }, qrcode(...args) {
        const qr = qrcode(...args);
        const addData = qr.addData;
        qr.addData = data => { payloads.push(data); addData(data); };
        return qr;
    } };
    const context = vm.createContext({ window, document, navigator, fetch, File, Blob, URL, AbortController,
        setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    vm.runInContext(source, context);
    const sharing = new window.SnapBoothSharing();
    const prepare = () => sharing.prepare({ toBlob(callback) { callback(photo); } });
    return { sharing, prepare, elements, timers, payloads, navigator, window, context };
}

test('export prepares the current JPEG before the share gesture and sends its exact bytes', async () => {
    let call;
    const h = harness({ navigator: { canShare: () => true, share: data => { call = data; return Promise.resolve(); } } });
    await h.prepare();
    const pending = h.sharing.sharePhoto();
    assert.ok(call, 'the native API must be called synchronously from the click handler');
    assert.equal(call.files.length, 1);
    assert.equal(call.files[0].type, 'image/jpeg');
    assert.deepEqual(new Uint8Array(await call.files[0].arrayBuffer()), new Uint8Array(await photo.arrayBuffer()));
    await pending;
    assert.equal(h.elements.get('sharePhotoBtn').disabled, false);
});

test('unsupported file sharing opens local save options without uploading a photo', async () => {
    const h = harness();
    await h.prepare();
    await h.sharing.sharePhoto();
    assert.equal(h.elements.get('qrModal').classList.contains('hidden'), false);
    assert.match(h.elements.get('linkStatus').textContent, /cannot share photo files/);
    assert.equal(h.sharing.link, null);
});

test('cancelling the share sheet is silent and unlocks the button', async () => {
    const h = harness({ navigator: { canShare: () => true, share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); } } });
    await h.prepare();
    await h.sharing.sharePhoto();
    assert.equal(h.elements.get('shareStatus').textContent, '');
    assert.equal(h.elements.get('linkStatus').textContent, '');
    assert.equal(h.elements.get('sharePhotoBtn').disabled, false);
});

test('creating a link uploads only the prepared JPEG and encodes the returned photo link in the QR', async () => {
    let request;
    const result = { url: `/shared.html#${token}`, expiresAt: new Date(Date.now() + 3600000).toISOString() };
    const h = harness({ fetch: async (url, options) => {
        request = { url, options };
        return Response.json(result, { status: 201 });
    } });
    await h.prepare();
    assert.equal(request, undefined, 'preparing a photo must not upload it');
    h.elements.get('shareExpiry').value = '900';
    await h.sharing.createLink();
    assert.equal(request.url, '/api/shares');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['X-Share-Expiry'], '900');
    assert.equal(request.options.body, h.sharing.file);
    assert.deepEqual(h.payloads, [`https://snapbooth.example/shared.html#${token}`]);
    assert.match(h.elements.get('qrCodeImg').src, /^data:image\/gif;base64,/);
    assert.equal(h.elements.get('photoShareUrl').value, h.sharing.link.url);
    assert.equal(h.elements.get('photoLinkResult').classList.contains('hidden'), false);
    assert.equal(h.elements.get('createPhotoLinkBtn').disabled, false);
    assert.equal(h.timers.size, 1, 'only the link expiry timer should remain');
    [...h.timers.values()][0].callback();
    assert.equal(h.sharing.link, null);
    assert.equal(h.elements.get('photoLinkResult').classList.contains('hidden'), true);
    assert.match(h.elements.get('linkStatus').textContent, /expired/);
});

test('static hosts without sharing functions show an actionable fallback and never create a homepage QR', async () => {
    const h = harness({ fetch: async () => new Response('<html>Not found</html>', { status: 404 }) });
    await h.prepare();
    await h.sharing.createLink();
    assert.match(h.elements.get('linkStatus').textContent, /unavailable on this site/);
    assert.equal(h.sharing.link, null);
    assert.deepEqual(h.payloads, []);
    assert.equal(h.elements.get('createPhotoLinkBtn').disabled, false);
});

test('editing while an upload is pending aborts it and discards its late response', async () => {
    let finish;
    let signal;
    const h = harness({ fetch: (url, options) => {
        signal = options.signal;
        return new Promise(resolve => { finish = resolve; });
    } });
    await h.prepare();
    const pending = h.sharing.createLink();
    h.sharing.reset();
    assert.equal(signal.aborted, true);
    finish(Response.json({ url: `/shared.html#${token}`, expiresAt: new Date(Date.now() + 3600000).toISOString() }, { status: 201 }));
    await pending;
    assert.equal(h.sharing.file, null);
    assert.equal(h.sharing.link, null);
    assert.deepEqual(h.payloads, []);
    assert.equal(h.elements.get('linkStatus').textContent, '');
});

test('a late JPEG encoding callback cannot restore a photo after reset', async () => {
    const h = harness();
    let finish;
    const preparing = h.sharing.prepare({ toBlob(callback) { finish = callback; } });
    h.sharing.reset();
    finish(photo);
    assert.equal(await preparing, false);
    assert.equal(h.sharing.file, null);
    assert.equal(h.elements.get('sharePhotoBtn').disabled, true);
});

test('untrusted photo URLs cannot be presented as a download QR', async () => {
    const h = harness({ fetch: async () => Response.json({ url: `https://another.example/shared.html#${token}`, expiresAt: new Date(Date.now() + 3600000).toISOString() }) });
    await h.prepare();
    await h.sharing.createLink();
    assert.equal(h.sharing.link, null);
    assert.deepEqual(h.payloads, []);
});

test('copy link works through the clipboard and falls back to selecting the URL', async () => {
    let copied;
    const h = harness({ navigator: { clipboard: { writeText: async text => { copied = text; } } } });
    await h.prepare();
    h.sharing.link = { url: `https://snapbooth.example/shared.html#${token}`, expiresAt: Date.now() + 3600000 };
    await h.sharing.copyLink();
    assert.equal(copied, h.sharing.link.url);
    assert.match(h.elements.get('linkStatus').textContent, /copied/);
    h.navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); };
    await h.sharing.copyLink();
    assert.equal(h.elements.get('photoShareUrl').selected, true);
    assert.match(h.elements.get('linkStatus').textContent, /copy the photo link/);
});
