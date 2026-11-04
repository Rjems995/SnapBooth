const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { waitFor } = require('./browser-sharing.cjs');

module.exports = async function checkInteractions({ page, artifactDir }) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.evaluate(`(() => {
        app.navigateTo('camera');
        window.__originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        window.__permissionCalls = 0;
        navigator.mediaDevices.getUserMedia = () => { window.__permissionCalls++; return new Promise((resolve, reject) => { window.__rejectPermission = reject; }); };
        window.__cameraRequest = app.startWebcam();
    })()`);
    try {
        assert.deepEqual(await page.evaluate(`({state:app.cameraState, visible:!document.getElementById('cameraFeedback').hidden,
            disabled:document.getElementById('startCaptureBtn').disabled, busy:document.getElementById('cameraViewport').getAttribute('aria-busy')})`),
        { state: 'loading', visible: true, disabled: true, busy: 'true' });
        const loading = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifactDir, 'camera-loading.png'), Buffer.from(loading.data, 'base64'));
        await page.evaluate(`window.__rejectPermission(new DOMException('Permission denied', 'NotAllowedError')); window.__cameraRequest`);
        assert.equal(await page.evaluate('window.__permissionCalls'), 1, 'denied permission must not trigger another permission request');
        assert.equal(await page.evaluate('app.cameraState'), 'unavailable');
        assert.equal(await page.evaluate('document.getElementById("cameraFeedbackTitle").textContent'), 'Allow camera access');
        assert.equal(await page.evaluate('document.getElementById("startCaptureLabel").textContent'), 'Upload photos');
        const denied = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifactDir, 'camera-permission.png'), Buffer.from(denied.data, 'base64'));
        await page.evaluate('navigator.mediaDevices.getUserMedia = window.__originalMedia; document.getElementById("retryCameraBtn").click()');
        await waitFor(page, 'app.cameraState === "ready"');
        assert.equal(await page.evaluate('document.getElementById("startCaptureBtn").disabled'), false);
        assert.equal(await page.evaluate('document.getElementById("cameraFeedback").hidden'), true);
        assert.ok(await page.evaluate('document.getElementById("webcamVideo").videoWidth > 0'));
    } finally {
        await page.evaluate('navigator.mediaDevices.getUserMedia = window.__originalMedia; app.navigateTo("home")');
    }

    await page.evaluate(`app.selectShotOption(4); app.navigateTo('customize'); app.setControlTab('themes'); app.applyPresetTheme('cute')`);
    const selected = group => page.evaluate(`Array.from(document.querySelectorAll('[data-choice="${group}"][aria-pressed="true"]')).map(b=>b.dataset.value)`);
    assert.deepEqual(await selected('theme'), ['cute']);
    assert.deepEqual(await selected('filter'), ['warm']);
    await page.evaluate('app.setFilter("bw")');
    assert.deepEqual(await selected('filter'), ['bw']);
    assert.deepEqual(await selected('theme'), [], 'changing a theme component must clear the preset marker');
    await page.evaluate('app.applyPresetTheme("film"); app.updateFrameColor("#abcdef")');
    assert.deepEqual(await selected('theme'), []);
    await page.evaluate('app.applyPresetTheme("film"); app.updateFontFamily("font-hand")');
    assert.deepEqual(await selected('theme'), []);
    await page.evaluate('app.applyPresetTheme("film"); app.setPhotoCorners("rounded"); app.setPhotoOrientation("square")');
    assert.deepEqual(await selected('theme'), ['film']);
    assert.deepEqual(await selected('corners'), ['rounded']);
    assert.deepEqual(await selected('orientation'), ['square']);
    assert.deepEqual(await selected('frameColor'), ['#111111']);
    await page.evaluate('app.setBrushColor("#dc2626"); app.setBrushSize(14); app.setToolMode("eraser")');
    assert.deepEqual(await selected('brushColor'), ['#dc2626']);
    assert.deepEqual(await selected('brushSize'), ['14']);
    assert.deepEqual(await selected('tool'), ['eraser']);
    await page.evaluate('app.setBrushSize(9)');
    assert.deepEqual(await selected('brushSize'), [], 'custom brush sizes must clear preset markers');
    const choices = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'selected-theme.png'), Buffer.from(choices.data, 'base64'));
    await page.evaluate(`app.setControlTab('layouts'); const b=document.querySelector('[data-choice="layout"][data-value="strip-4"]'); b.focus(); b.click()`);
    assert.deepEqual(await selected('layout'), ['strip-4']);
    assert.equal(await page.evaluate('document.activeElement.dataset.value'), 'strip-4', 'layout redraw must preserve keyboard focus');
    assert.equal(await page.evaluate('document.querySelectorAll("#tabBarScrollContainer [aria-pressed=true]").length'), 1);
    assert.equal(await page.evaluate('document.getElementById("tabBtn-layouts").getAttribute("aria-pressed")'), 'true');
    console.log('PASS: camera loading, permission denial, retry, decoded-frame readiness, selected themes/filters/framing, and keyboard focus.');
};
