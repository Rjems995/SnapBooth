// Optional integration check: Chrome/Edge, a temporary browser profile, and an isolated photo store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const decodeQr = require('jsqr');

const root = path.join(__dirname, '..');

async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('DevTools connection timed out')), 5000);
        socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('DevTools connection failed')); }, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        const entry = pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timeout);
        pending.delete(message.id);
        message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
    });
    return {
        socket, send,
        async evaluate(expression) {
            const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        }
    };
}

async function waitFor(page, expression) {
    for (let i = 0; i < 150; i++) {
        if (await page.evaluate(expression).catch(() => false)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Page did not become ready: ${expression}`);
}

async function main() {
    const executable = [process.env.SNAPBOOTH_TEST_BROWSER,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].find(candidate => candidate && fs.existsSync(candidate));
    assert.ok(executable, 'Install Chrome/Edge or set SNAPBOOTH_TEST_BROWSER to its executable.');
    const { createPhotoSharingHandler } = await import(pathToFileURL(path.join(root, 'server', 'photo-sharing.mjs')));
    const entries = new Map();
    let clockOffset = 0;
    let uploads = 0;
    const handler = createPhotoSharingHandler({ now: () => Date.now() + clockOffset, getStore: () => ({
        async set(key, data, { metadata }) { entries.set(key, { data, metadata }); },
        async getWithMetadata(key) { return entries.get(key) || null; },
        async delete(key) { entries.delete(key); }
    }) });
    const server = http.createServer(async (request, response) => {
        try {
            const origin = `http://127.0.0.1:${server.address().port}`;
            const url = new URL(request.url, origin);
            if (url.pathname === '/api/shares') {
                const chunks = [];
                for await (const chunk of request) chunks.push(chunk);
                const result = await handler(new Request(url, { method: request.method, headers: request.headers,
                    ...(request.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }));
                if (request.method === 'POST' && result.status === 201) uploads++;
                response.writeHead(result.status, Object.fromEntries(result.headers));
                response.end(Buffer.from(await result.arrayBuffer()));
                return;
            }
            const publish = path.resolve(root, 'dist');
            const target = path.resolve(publish, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
            if (!target.startsWith(publish + path.sep) || !fs.existsSync(target)) {
                response.writeHead(404); response.end('Not found'); return;
            }
            let content = fs.readFileSync(target);
            if (target.endsWith('.html')) {
                // Keep integration tests independent of public font and styling CDNs.
                content = content.toString('utf8')
                    .replace(/<script src="https:[^"]*"><\/script>/g, '<script>window.tailwind = {};</script>')
                    .replace(/<link[^>]*href="https:[^>]*>/g, '')
                    .replace('</head>', '<style>.hidden{display:none!important}</style></head>');
            }
            response.setHeader('Content-Type', target.endsWith('.js') ? 'application/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
            response.end(content);
        } catch (error) { response.writeHead(500); response.end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'snapbooth-sharing-'));
    let browser;
    const pages = [];
    try {
        browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const endpoint = await new Promise((resolve, reject) => {
            let output = '';
            const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
            browser.once('error', error => { clearTimeout(timeout); reject(error); });
            browser.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited during startup: ${code}`)); });
            browser.stderr.on('data', data => {
                output += data;
                const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
                if (match) { clearTimeout(timeout); resolve(match[1]); }
            });
        });
        const debug = `http://127.0.0.1:${new URL(endpoint).port}`;
        async function newPage(url) {
            const response = await fetch(`${debug}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(5000) });
            const tab = await response.json();
            const page = await connect(tab.webSocketDebuggerUrl);
            pages.push(page);
            await page.send('Page.navigate', { url });
            await waitFor(page, 'document.readyState === "complete"');
            return page;
        }
        const studio = await newPage(origin);
        await waitFor(studio, 'typeof app === "object" && !!app.photoSharing');
        await studio.evaluate(`(() => {
            app.soundEnabled = false;
            app.selectShotOption(2);
            const photo = document.createElement('canvas');
            photo.width = 640; photo.height = 480;
            const ctx = photo.getContext('2d');
            ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = 'white'; ctx.font = '40px sans-serif'; ctx.fillText('SNAPBOOTH SHARE TEST', 30, 240);
            app.capturedPhotos = [photo.toDataURL('image/jpeg'), photo.toDataURL('image/jpeg')];
            app.navigateTo('export');
        })()`);
        await waitFor(studio, '!!app.photoSharing.file');
        assert.equal(uploads, 0, 'export must not upload photos');
        const native = await studio.evaluate(`(async () => {
            let calls = 0, activation = false, currentFile = false;
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
            Object.defineProperty(navigator, 'share', { configurable: true, value: data => {
                calls++; activation = navigator.userActivation.isActive; currentFile = data.files[0] === app.photoSharing.file;
                return Promise.resolve();
            } });
            document.getElementById('sharePhotoBtn').click();
            await Promise.resolve();
            Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
            await app.photoSharing.sharePhoto();
            return { calls, activation, currentFile, fallback: !document.getElementById('qrModal').classList.contains('hidden') };
        })()`);
        assert.deepEqual(native, { calls: 1, activation: true, currentFile: true, fallback: true });
        assert.equal(uploads, 0, 'native sharing and its fallback must not upload photos');
        const created = await studio.evaluate(`(async () => {
            document.getElementById('shareExpiry').value = '900';
            await app.photoSharing.createLink();
            if (!app.photoSharing.link) throw new Error(document.getElementById('linkStatus').textContent);
            const qrImage = document.getElementById('qrCodeImg');
            await qrImage.decode();
            const canvas = document.createElement('canvas');
            canvas.width = qrImage.naturalWidth; canvas.height = qrImage.naturalHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(qrImage, 0, 0);
            const bytes = new Uint8Array(await app.photoSharing.file.arrayBuffer());
            let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
            return { url: app.photoSharing.link.url, jpeg: btoa(binary), width: canvas.width, height: canvas.height,
                pixels: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
        })()`);
        assert.equal(uploads, 1);
        const decoded = decodeQr(new Uint8ClampedArray(created.pixels), created.width, created.height);
        assert.ok(decoded, 'generated QR must be decodable');
        assert.equal(decoded.data, created.url, 'scanning must open the finished strip link');
        const receiver = await newPage(decoded.data);
        await waitFor(receiver, '!document.getElementById("sharedPhotoCard").hidden');
        const received = await receiver.evaluate(`(async () => {
            const image = document.getElementById('sharedPhoto'); await image.decode();
            return { width: image.naturalWidth, height: image.naturalHeight,
                download: document.getElementById('downloadSharedPhoto').href };
        })()`);
        assert.ok(received.width > 0 && received.height > 0);
        const download = await fetch(received.download);
        assert.match(download.headers.get('content-disposition'), /^attachment/);
        assert.match(download.headers.get('cache-control'), /no-store/);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), Buffer.from(created.jpeg, 'base64'));
        clockOffset = 900000;
        const expired = await newPage(decoded.data);
        await waitFor(expired, 'document.getElementById("pageStatus").textContent.includes("expired")');
        assert.equal(await expired.evaluate('document.getElementById("sharedPhotoCard").hidden'), true);
        assert.equal(entries.size, 0, 'expired photo must be deleted when accessed');
        console.log('PASS: native share handler, local fallback, opt-in upload, decoded QR, recipient preview, exact JPEG download, and expired-link denial.');
    } finally {
        pages.forEach(page => page.socket.close());
        if (browser && browser.exitCode === null) {
            const exited = new Promise(resolve => browser.once('exit', resolve));
            browser.kill();
            await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
        }
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(profile).startsWith('snapbooth-sharing-'));
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}

module.exports = { connect, waitFor };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
