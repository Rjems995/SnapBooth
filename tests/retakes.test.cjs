const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'snapbooth_photobooth_app.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const appScript = scripts.find(script => script.includes('const app ='));

function element() {
    const classes = new Set(['hidden']);
    const attributes = new Map();
    return {
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: name => attributes.get(name) ?? null,
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name)
        },
        style: {},
        disabled: false,
        innerText: '',
        innerHTML: ''
    };
}

class Video extends EventTarget {
    constructor() {
        super();
        Object.assign(this, element());
        this.srcObject = null;
    }

    set srcObject(stream) {
        this.stream = stream;
        this.readyState = 0;
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.paused = true;
    }

    get srcObject() { return this.stream; }
    pause() { this.paused = true; }
    async play() { this.paused = false; }

    provideFrame() {
        this.readyState = 2;
        this.videoWidth = 1280;
        this.videoHeight = 720;
        this.dispatchEvent(new Event('loadeddata'));
    }
}

function mediaStream() {
    const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
    return { getTracks: () => [track], getVideoTracks: () => [track] };
}

function harness(options = {}) {
    const video = new Video();
    const elements = new Map([['webcamVideo', video]]);
    const streams = [];
    const countdowns = [];
    let requests = 0;
    let frames = 0;
    const context = vm.createContext({
        document: { getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        } },
        window: { scrollTo() {} },
        navigator: { mediaDevices: { getUserMedia: async constraints => {
            requests++;
            const stream = options.getUserMedia
                ? await options.getUserMedia(constraints, requests)
                : mediaStream();
            streams.push(stream);
            return stream;
        } } },
        setTimeout: (callback, ms) => setTimeout(callback, options.timeout && ms === 10000 ? options.timeout : ms === 600 ? 0 : ms),
        clearTimeout,
        setInterval,
        clearInterval
    });
    vm.runInContext(appScript + '\nwindow.testApp = app;', context);
    const app = context.window.testApp;
    app.currentScreen = 'review';
    app.capturedPhotos = ['original-1', 'original-2', 'original-3', 'original-4'];
    app.renderPhotoReviewGrid = () => {};
    app.updateStepIndicator = () => {};
    app.playSound = () => {};
    app.triggerFlash = () => {};
    app.enableFallbackCamera = () => { app.useFallbackCamera = true; };
    const runCountdown = app.runCountdown.bind(app);
    app.runCountdown = async seconds => { countdowns.push(seconds); };
    app.captureSingleFrame = () => {
        assert.ok(app.cameraStream, 'capture requires a running camera');
        assert.equal(video.readyState, 2, 'capture requires a decoded frame');
        assert.ok(video.videoWidth > 0 && video.videoHeight > 0);
        frames++;
        return `new-${frames}`;
    };
    return { app, video, elements, streams, countdowns, context, runCountdown,
        get requests() { return requests; }, get frames() { return frames; } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('all inline JavaScript parses', () => {
    scripts.forEach(script => new vm.Script(script));
});

test('initial capture stays blocked until the camera provides a decoded frame', async () => {
    const h = harness();
    h.app.currentScreen = 'camera';
    const originals = h.app.capturedPhotos;
    const ready = h.app.startWebcam();
    await flush();
    assert.equal(h.app.cameraState, 'loading');
    assert.equal(h.elements.get('cameraFeedback').hidden, false);
    assert.equal(h.elements.get('cameraViewport').getAttribute('aria-busy'), 'true');
    assert.equal(h.elements.get('startCaptureBtn').disabled, true);
    await h.app.startPhotoCaptureSequence();
    assert.equal(h.app.capturedPhotos, originals, 'an early capture must not discard existing photos');
    assert.deepEqual(h.countdowns, []);
    h.video.provideFrame();
    assert.equal(await ready, true);
    assert.equal(h.app.cameraState, 'ready');
    assert.equal(h.elements.get('cameraFeedback').hidden, true);
    assert.equal(h.elements.get('startCaptureBtn').disabled, false);
    h.app.stopWebcam();
});

test('leaving during camera startup prevents a late stream from restoring the ready state', async () => {
    let resolveMedia;
    const h = harness({ getUserMedia: () => new Promise(resolve => { resolveMedia = resolve; }) });
    h.app.currentScreen = 'camera';
    const ready = h.app.startWebcam();
    await flush();
    h.app.navigateTo('home');
    const lateStream = mediaStream();
    resolveMedia(lateStream);
    assert.equal(await ready, false);
    assert.equal(h.app.cameraState, 'idle');
    assert.equal(h.elements.get('cameraFeedback').hidden, true);
    assert.equal(lateStream.getTracks()[0].readyState, 'ended');
});

test('unavailable camera offers upload instead of capturing the fallback drawing', async () => {
    const h = harness();
    h.app.currentScreen = 'camera';
    h.app.setCameraState('unavailable', { name: 'NotAllowedError' });
    let uploads = 0;
    h.app.triggerFileUpload = () => uploads++;
    const originals = h.app.capturedPhotos;
    await h.app.startPhotoCaptureSequence();
    assert.equal(uploads, 1);
    assert.equal(h.frames, 0);
    assert.equal(h.app.capturedPhotos, originals);
    assert.equal(h.elements.get('cameraFeedbackTitle').textContent, 'Allow camera access');
    assert.equal(h.elements.get('retryCameraBtn').hidden, false);
});

for (const seconds of [3, 5, 10]) {
    test(`individual retake waits for a frame and uses the ${seconds}s timer`, async () => {
        const h = harness();
        h.app.timerDuration = seconds;
        h.app.photoEdits = [
            { zoom: 2, x: 0.2, y: 0.8 }, { zoom: 3, x: 0.3, y: 0.7 },
            { zoom: 1.5, x: 0.4, y: 0.6 }, { zoom: 2.5, x: 0.5, y: 0.5 }
        ];
        const originalEdits = structuredClone(h.app.photoEdits);
        const retake = h.app.retakeSinglePhoto(1);
        await flush();
        assert.equal(h.requests, 1, 'retake must reopen the camera');
        assert.equal(h.elements.get('startCaptureBtn').disabled, true);
        assert.deepEqual(h.countdowns, [], 'play() alone must not start the countdown');

        h.video.readyState = 1;
        h.video.videoWidth = 1280;
        h.video.videoHeight = 720;
        h.video.dispatchEvent(new Event('canplay'));
        await flush();
        assert.deepEqual(h.countdowns, [], 'metadata alone is not a usable frame');

        await h.app.retakeSinglePhoto(2);
        await h.app.startPhotoCaptureSequence();
        assert.equal(h.requests, 1, 'duplicate actions must not start another capture');
        assert.deepEqual(Array.from(h.app.capturedPhotos), ['original-1', 'original-2', 'original-3', 'original-4']);

        h.video.provideFrame();
        await retake;
        assert.deepEqual(h.countdowns, [seconds]);
        assert.deepEqual(Array.from(h.app.capturedPhotos), ['original-1', 'new-1', 'original-3', 'original-4']);
        assert.deepEqual(JSON.parse(JSON.stringify(h.app.photoEdits[1])), { zoom: 1, x: 0.5, y: 0.5 });
        for (const index of [0, 2, 3]) assert.deepEqual(h.app.photoEdits[index], originalEdits[index]);
        assert.equal(h.app.currentScreen, 'review');
        assert.equal(h.streams[0].getTracks()[0].readyState, 'ended');
        assert.equal(h.video.srcObject, null);
        assert.equal(h.app.isRetaking, false);
        assert.equal(h.elements.get('startCaptureBtn').disabled, false);
    });
}

test('retake all restarts the camera and honors the selected timer for every shot', async () => {
    const h = harness();
    h.app.timerDuration = 5;
    const retake = h.app.retakeAllPhotos();
    await flush();
    assert.deepEqual(h.countdowns, []);
    h.video.provideFrame();
    await retake;
    assert.deepEqual(h.countdowns, [5, 5, 5, 5]);
    assert.deepEqual(Array.from(h.app.capturedPhotos), ['new-1', 'new-2', 'new-3', 'new-4']);
    assert.equal(h.app.currentScreen, 'review');
});

test('camera constraint failure retries with a generic camera', async () => {
    const h = harness({ getUserMedia: async (constraints, request) => {
        if (request === 1) throw new Error('Unsupported facing mode');
        assert.equal(constraints.video, true);
        return mediaStream();
    } });
    const retake = h.app.retakeSinglePhoto(0);
    await flush();
    h.video.provideFrame();
    await retake;
    assert.equal(h.requests, 2);
    assert.equal(h.app.capturedPhotos[0], 'new-1');
});

for (const retakeMethod of ['retakeSinglePhoto', 'retakeAllPhotos']) {
    test(`${retakeMethod} preserves originals when camera permission is denied`, async () => {
        const h = harness({ getUserMedia: async () => { throw new Error('Permission denied'); } });
        const originals = h.app.capturedPhotos;
        await h.app[retakeMethod](0);
        assert.equal(h.app.capturedPhotos, originals);
        assert.equal(h.frames, 0);
        assert.deepEqual(h.countdowns, []);
        assert.equal(h.app.currentScreen, 'review');
        assert.equal(h.elements.get('reviewStatusMsg').classList.contains('hidden'), false);
        assert.match(h.elements.get('reviewStatusMsg').innerText, /original photos are safe/);
        assert.equal(h.elements.get('startCaptureBtn').disabled, false);
    });
}

test('a camera that never provides frames times out without replacing a photo', async () => {
    const h = harness({ timeout: 15 });
    const originals = h.app.capturedPhotos;
    await h.app.retakeSinglePhoto(1);
    assert.equal(h.app.capturedPhotos, originals);
    assert.deepEqual(h.countdowns, []);
    assert.equal(h.frames, 0);
    assert.equal(h.streams[0].getTracks()[0].readyState, 'ended');
    assert.equal(h.app.isRetaking, false);
});

test('retake all preserves every original if the camera disconnects during the sequence', async () => {
    const h = harness();
    const originals = h.app.capturedPhotos;
    let countdowns = 0;
    h.app.runCountdown = async () => {
        if (++countdowns === 2) h.streams[0].getTracks()[0].stop();
    };
    const retake = h.app.retakeAllPhotos();
    await flush();
    h.video.provideFrame();
    await retake;
    assert.equal(h.frames, 1);
    assert.equal(h.app.capturedPhotos, originals);
    assert.equal(h.app.currentScreen, 'review');
});

test('reset while camera permission is pending cancels the retake and stops a late stream', async () => {
    let grantCamera;
    const pendingCamera = new Promise(resolve => { grantCamera = resolve; });
    const h = harness({ getUserMedia: () => pendingCamera });
    const retake = h.app.retakeSinglePhoto(0);
    h.app.confirmResetSession();
    const stream = mediaStream();
    grantCamera(stream);
    await retake;
    assert.equal(h.app.currentScreen, 'home');
    assert.equal(h.app.capturedPhotos.length, 0);
    assert.equal(h.frames, 0);
    assert.equal(stream.getTracks()[0].readyState, 'ended');
});

test('reset during the countdown does not restore the discarded session', async () => {
    let finishCountdown;
    const h = harness();
    h.app.runCountdown = () => new Promise(resolve => { finishCountdown = resolve; });
    const retake = h.app.retakeSinglePhoto(0);
    await flush();
    h.video.provideFrame();
    await flush();
    h.app.confirmResetSession();
    finishCountdown();
    await retake;
    assert.equal(h.app.currentScreen, 'home');
    assert.equal(h.app.capturedPhotos.length, 0);
    assert.equal(h.frames, 0);
});

test('countdown seconds last one second each', async () => {
    const h = harness();
    let tick;
    let cleared = false;
    h.context.setInterval = (callback, ms) => {
        assert.equal(ms, 1000);
        tick = callback;
        return 1;
    };
    h.context.clearInterval = () => { cleared = true; };
    const countdown = h.runCountdown(3);
    assert.equal(h.elements.get('countdownNumber').innerText, 3);
    tick();
    assert.equal(h.elements.get('countdownNumber').innerText, 2);
    tick();
    assert.equal(h.elements.get('countdownNumber').innerText, 1);
    tick();
    await countdown;
    assert.equal(cleared, true);
    assert.equal(h.elements.get('countdownContainer').classList.contains('hidden'), true);
});
