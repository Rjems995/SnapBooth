const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { connect, waitFor } = require('./browser-sharing.cjs');
const root = path.join(__dirname, '..');

async function main(extraChecks = null) {
    const executable = [process.env.SNAPBOOTH_TEST_BROWSER,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].find(candidate => candidate && fs.existsSync(candidate));
    assert.ok(executable, 'Install Chrome/Edge or set SNAPBOOTH_TEST_BROWSER.');
    const publish = path.join(root, 'dist');
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const target = path.resolve(publish, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
        if (!target.startsWith(publish + path.sep) || !fs.existsSync(target)) {
            response.writeHead(404); response.end('Not found'); return;
        }
        let data = fs.readFileSync(target);
        if (target.endsWith('.html')) data = data.toString().replace(/<link[^>]*href="https:[^>]*>/g, '');
        response.setHeader('Content-Type', target.endsWith('.css') ? 'text/css' : target.endsWith('.js') ? 'application/javascript' : target.endsWith('.png') ? 'image/png' : target.endsWith('.webp') ? 'image/webp' : 'text/html');
        response.end(data);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'snapbooth-editor-'));
    let browser, page;
    try {
        browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
            '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const endpoint = await new Promise((resolve, reject) => {
            let output = '';
            const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
            browser.once('error', error => { clearTimeout(timeout); reject(error); });
            browser.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited: ${code}`)); });
            browser.stderr.on('data', data => {
                output += data;
                const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
                if (match) { clearTimeout(timeout); resolve(match[1]); }
            });
        });
        const tabs = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
        page = await connect(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
        await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
        await page.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
        await waitFor(page, 'document.readyState === "complete" && typeof app === "object" && !!app.photoEditor');
        await page.evaluate(`(() => {
            app.soundEnabled = false;
            app.selectShotOption(4);
            app.capturedPhotos = ['#ef4444', '#22c55e', '#2563eb', '#eab308'].map((color, i) => {
                const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
                const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 1200, 800);
                ctx.fillStyle = 'white'; ctx.fillRect(450, 100, 300, 600);
                ctx.fillStyle = '#111'; ctx.font = '72px sans-serif'; ctx.fillText('PHOTO ' + (i + 1), 450, 410);
                return c.toDataURL('image/jpeg', .95);
            });
            app.navigateTo('customize');
        })()`);
        await waitFor(page, 'document.getElementById("cropPhotoImage").naturalWidth === 1200');
        console.log('Editor loaded. Checking mobile layout and touch gestures.');
        const layout = () => page.evaluate(`(() => {
            const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height }; };
            return { width: innerWidth, height: innerHeight, preview:rect('editorPreviewPanel'), settings:rect('editorSettingsPanel'), action:rect('editorExportBtn'),
                documentWidth:document.documentElement.scrollWidth, labelSize:getComputedStyle(document.querySelector('label[for=photoZoom]')).fontSize,
                buttons:[...document.querySelectorAll('#editorSettingsPanel button')].filter(b => b.getClientRects().length).map(b => ({ label:b.textContent, height:b.getBoundingClientRect().height, width:b.getBoundingClientRect().width })) };
        })()`);
        const initial = await layout();
        assert.equal(initial.width, 390);
        assert.ok(initial.preview.height > 100 && initial.preview.bottom <= initial.settings.top + 2, JSON.stringify(initial));
        assert.ok(initial.settings.height > 200, JSON.stringify(initial));
        assert.ok(initial.action.bottom <= initial.height && initial.action.height >= 44, JSON.stringify(initial));
        assert.ok(initial.documentWidth <= initial.width + 1, 'mobile editor must not overflow horizontally');
        assert.ok(parseFloat(initial.labelSize) >= 14);
        assert.ok(initial.buttons.every(button => button.height >= 43.5 && button.width >= 43.5), JSON.stringify(initial.buttons));
        await page.evaluate('document.getElementById("editorSettingsPanel").scrollTop = 240');
        const scrolled = await layout();
        assert.equal(scrolled.preview.top, initial.preview.top);
        assert.equal(scrolled.action.bottom, initial.action.bottom);
        await page.evaluate(`(() => {
            document.getElementById('photoZoom').value = '200';
            document.getElementById('photoZoom').dispatchEvent(new Event('input', {bubbles:true}));
            document.getElementById('cropStage').scrollIntoView({block:'center'});
        })()`);
        const stage = await page.evaluate(`(() => { const r = document.getElementById('cropStage').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}; })()`);
        const touch = (type, points) => page.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(({x,y,id}) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 })) });
        await touch('touchStart', [{ x:stage.x, y:stage.y, id:1 }]);
        await touch('touchMove', [{ x:stage.x + 32, y:stage.y, id:1 }]);
        await touch('touchEnd', []);
        const panned = await page.evaluate('({...app.photoEdits[0]})');
        assert.equal(panned.zoom, 2);
        assert.ok(panned.x < 0.5, JSON.stringify({ stage, panned }));
        await touch('touchStart', [{ x:stage.x - 20, y:stage.y, id:1 }, { x:stage.x + 20, y:stage.y, id:2 }]);
        await touch('touchMove', [{ x:stage.x - 28, y:stage.y, id:1 }, { x:stage.x + 28, y:stage.y, id:2 }]);
        await touch('touchEnd', []);
        const pinched = await page.evaluate('({...app.photoEdits[0]})');
        assert.ok(pinched.zoom > 2 && pinched.zoom <= 3, JSON.stringify(pinched));
        console.log('Touch pan and pinch passed. Checking reorder.');
        await page.evaluate('document.getElementById("editorSettingsPanel").scrollTop = 0');
        const positions = await page.evaluate(`(() => {
            const a = document.querySelector('#photoOrderList .photo-grip[data-photo-index="0"]').getBoundingClientRect();
            const b = document.querySelector('#photoOrderList .photo-tile[data-photo-index="2"]').getBoundingClientRect();
            return {from:{x:a.x+a.width/2,y:a.y+a.height/2},to:{x:b.x+b.width/2,y:b.y+b.height/2}, first:app.capturedPhotos[0]};
        })()`);
        await touch('touchStart', [{ ...positions.from, id:1 }]);
        await touch('touchMove', [{ x:positions.from.x + 12, y:positions.from.y, id:1 }]);
        await touch('touchMove', [{ ...positions.to, id:1 }]);
        await touch('touchEnd', []);
        const moved = await page.evaluate('({ photos: app.capturedPhotos, edits: app.photoEdits, selected: app.photoEditor.selected })');
        assert.equal(moved.photos[2], positions.first, 'touch drag must reorder the photo');
        assert.equal(moved.selected, 2);
        assert.ok(Math.abs(moved.edits[2].zoom - pinched.zoom) < .01, 'crop must follow the moved photo');
        await page.evaluate(`(() => {
            app.photoEditor.setEdit({zoom:2,x:0.2,y:0.8});
            document.querySelector('#photoOrderList .photo-grip[data-photo-index="2"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        })()`);
        assert.equal(await page.evaluate('app.photoEditor.selected'), 3);
        console.log('Touch and keyboard reorder passed. Checking viewport sizes.');
        for (const size of [[320, 568], [430, 932], [844, 390]]) {
            await page.send('Emulation.setDeviceMetricsOverride', { width: size[0], height:size[1], deviceScaleFactor:1, mobile:true });
            await new Promise(resolve => setTimeout(resolve, 100));
            const current = await layout();
            assert.ok(current.documentWidth <= current.width + 1, JSON.stringify(current));
            assert.ok(current.action.bottom <= current.height + 1 && current.settings.height > 70, JSON.stringify(current));
        }
        await page.send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
        await page.evaluate('app.photoEditor.expandPreview()');
        assert.equal(await page.evaluate('document.getElementById("expandedPreviewDialog").open'), true);
        await page.evaluate('document.getElementById("expandedPreviewDialog").close()');
        await waitFor(page, 'document.getElementById("photoboothPreviewContainer").parentElement.id === "editorPreviewPanel"');
        console.log('Responsive sizes and expanded preview passed. Checking export.');
        const artifactDir = path.join(root, '.tmp');
        fs.mkdirSync(artifactDir, { recursive: true });
        await page.evaluate('document.getElementById("editorSettingsPanel").scrollTop = 0');
        const screenshot = await page.send('Page.captureScreenshot', { format:'png' });
        fs.writeFileSync(path.join(artifactDir, 'editor-mobile.png'), Buffer.from(screenshot.data, 'base64'));
        await page.evaluate('app.navigateTo("export")');
        await waitFor(page, '!!app.photoSharing.file');
        const exportCheck = await page.evaluate(`(() => {
            const c = document.getElementById('exportCanvas'); const ctx = c.getContext('2d');
            const cellW = (1000-120-30)/2, cellH = cellW/(3/4);
            const rgba = [...ctx.getImageData(60+cellW*.1,60+cellH*.1,1,1).data];
            const cropped = [...ctx.getImageData(60+cellW+30+cellW/2,60+cellH+30+cellH/2,1,1).data];
            return {rgba, cropped, width:c.width, height:c.height, edits:app.photoEdits};
        })()`);
        assert.equal(exportCheck.width, 1000);
        assert.ok(exportCheck.rgba[1] > exportCheck.rgba[0] * 1.3, 'first exported frame should be the reordered green photo');
        assert.ok(exportCheck.cropped[0] > exportCheck.cropped[1] * 1.3, 'the moved red photo must keep its off-center crop in the export');
        assert.equal(exportCheck.edits[3].zoom, 2);
        console.log('Crop and export order passed. Checking desktop layout.');
        await page.send('Emulation.setDeviceMetricsOverride', { width:1440,height:1000,deviceScaleFactor:1,mobile:false });
        await page.evaluate('app.navigateTo("customize")');
        await new Promise(resolve => setTimeout(resolve, 100));
        const desktop = await layout();
        assert.ok(desktop.preview.right < desktop.settings.left + 2, 'desktop keeps two editor columns');
        assert.ok(desktop.preview.width > 480 && desktop.settings.width > 480, 'desktop panels must fill their grid columns');
        const desktopShot = await page.send('Page.captureScreenshot', { format:'png' });
        fs.writeFileSync(path.join(artifactDir, 'editor-desktop.png'), Buffer.from(desktopShot.data, 'base64'));
        await page.send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
        await page.evaluate(`(() => {
            app.selectShotOption(6);
            app.capturedPhotos.push(app.capturedPhotos[0], app.capturedPhotos[1]);
            app.setLayoutGeometry('strip-6');
            app.setPhotoOrientation('mobile');
        })()`);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(await page.evaluate(`(() => {
            const a=document.getElementById('photoboothStrip').getBoundingClientRect(), b=document.getElementById('photoboothPreviewContainer').getBoundingClientRect();
            return a.height>0 && a.top>=b.top && a.bottom<=b.bottom+1;
        })()`), 'a six-shot 9:16 strip must fit inside the pinned preview');
        await page.send('Emulation.setDeviceMetricsOverride', { width:320,height:568,deviceScaleFactor:1,mobile:true });
        await page.evaluate('app.renderPhotoReviewGrid(); app.navigateTo("review")');
        const review = await page.evaluate(`(() => {
            const before=app.capturedPhotos[0];
            document.querySelector('#photoReviewGrid .photo-grip[data-photo-index="0"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
            return { moved:app.capturedPhotos[1]===before, overflow:document.documentElement.scrollWidth>innerWidth+1,
                heights:[...document.querySelectorAll('#photoReviewGrid button')].map(b=>b.getBoundingClientRect().height) };
        })()`);
        assert.equal(review.moved, true, 'review ordering must remain available');
        assert.equal(review.overflow, false, 'review controls must fit narrow phones');
        assert.ok(review.heights.every(height => height>=44), 'review controls must have 44px touch targets');
        console.log('PASS: mobile layout (320px–844px), pinned preview/action, 44px controls, touch pan/pinch/reorder, keyboard ordering, crop persistence, export order, expanded preview, and desktop layout.');
        if (extraChecks) await extraChecks({ page, artifactDir, origin: `http://127.0.0.1:${server.address().port}` });
    } catch (error) {
        console.error('Editor check failed:', error.stack);
        if (page) {
            const directory = path.join(root, '.tmp');
            fs.mkdirSync(directory, { recursive: true });
            const shot = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
            if (shot) fs.writeFileSync(path.join(directory, 'editor-failure.png'), Buffer.from(shot.data, 'base64'));
        }
        throw error;
    } finally {
        page?.socket.close();
        if (browser && browser.exitCode === null) {
            const exited = new Promise(resolve => browser.once('exit', resolve)); browser.kill();
            await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
        }
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(profile).startsWith('snapbooth-editor-'));
        try { fs.rmSync(profile, { recursive:true, force:true, maxRetries:5, retryDelay:100 }); }
        catch (error) { console.error('Temporary browser profile cleanup:', error.message); }
    }
}
module.exports = { main };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
