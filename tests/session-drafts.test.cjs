const assert = require('node:assert/strict');
const test = require('node:test');
const { SnapBoothSessionDrafts, captureState, validateDraft } = require('../session-drafts.js');

const PHOTOS = ['data:image/jpeg;base64,/9j/AA==', 'data:image/png;base64,aGVsbG8='];

function appState() {
    const app = { selectedShotCount: 2, capturedPhotos: [], photoEdits: [], placedStickers: [], drawnPaths: [],
        currentScreen: 'home', currentLayout: 'strip-2', photoOrientation: 'portrait', frameColor: '#ffffff', photoCorners: 'rounded',
        activeFilter: 'warm', mainText: 'Our day', subText: 'SNAPBOOTHBYJAMES', dateText: '2026.11.03', fontClass: 'font-hand',
        timerDuration: 5, isMirrored: true, brushColor: '#2563eb', brushSize: 8, isEraser: true, exportPreset: 'story', controlTab: 'photos',
        lastPreviewWidth: 250, photoEditor: { selected: 0 }, soundEnabled: false,
        selectShotOption(count) { this.selectedShotCount = count; }, setPhotoOrientation() {}, setPhotoCorners() {}, updateFontFamily() {}, updateTextContent() {},
        updateFrameColor() {}, setTimerDuration() {}, setBrushColor() { this.isEraser = false; }, setBrushSize() {}, setToolMode(mode) { this.isEraser = mode === 'eraser'; },
        renderPlacedStickers() {}, renderPhotoReviewGrid() {}, setControlTab() {}, navigateTo(screen) { this.currentScreen = screen; }, stopWebcam() {},
        startWebcam() { throw new Error('Restoring a draft must not activate the camera'); } };
    return app;
}

function installDom() {
    const elements = new Map();
    global.document = { getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: '', hidden: true, value: '', removeAttribute() {} });
        return elements.get(id);
    }, addEventListener() {} };
    global.window = { addEventListener() {} };
    return elements;
}

function memoryStore() {
    return { record: null, photos: new Map(), photoWrites: 0,
        async read() { return this.record ? { ...this.record, capturedPhotos: this.record.photoKeys.map(key => this.photos.get(key)) } : null; },
        async write(record, fresh, old) {
            this.record = structuredClone(record);
            fresh.forEach(({ key, data }) => { this.photos.set(key, data); this.photoWrites++; });
            old.forEach(key => this.photos.delete(key));
        },
        async clear() { this.record = null; this.photos.clear(); }
    };
}

function addPhotos(app) {
    app.capturedPhotos = PHOTOS.slice();
    app.photoEdits = [{ zoom: 2, x: .2, y: .8 }, { zoom: 1.5, x: .4, y: .6 }];
    app.placedStickers = [{ id: 1, emoji: '🤍', x: 23, y: 75, scale: 1.2 }];
    app.drawnPaths = [{ color: '#111111', size: 6, isEraser: false, points: [{ x: .2, y: .4 }, { x: .3, y: .8 }] }];
    app.currentScreen = 'customize';
}

test('draft snapshots include edits and decorations without camera streams or share links', () => {
    const app = appState(); addPhotos(app);
    app.cameraStream = { secret: 'stream' }; app.sharedUrl = 'https://example.com/private';
    const state = validateDraft(captureState(app));
    assert.deepEqual(state.photoEdits, app.photoEdits);
    assert.deepEqual(state.drawnPaths, app.drawnPaths);
    assert.deepEqual(state.placedStickers, app.placedStickers);
    assert.equal(state.cameraStream, undefined); assert.equal(state.sharedUrl, undefined);
});

test('corrupt or externally linked draft images cannot be resumed', () => {
    const app = appState(); addPhotos(app);
    const state = captureState(app);
    assert.equal(validateDraft({ ...state, version: 99 }), null);
    assert.equal(validateDraft({ ...state, capturedPhotos: ['https://external.example/image.jpg'] }), null);
    assert.equal(validateDraft({ ...state, placedStickers: [{ emoji: '<img onerror=alert(1)>' }] }), null);
});

test('partial captures resume at review and preserve the selected shot count', () => {
    const app = appState(); addPhotos(app);
    app.capturedPhotos = [PHOTOS[0]]; app.currentScreen = 'export';
    const state = validateDraft(captureState(app));
    assert.equal(state.screen, 'review'); assert.equal(state.selectedShotCount, 2);
});

test('the three-shot Polaroid layout survives draft validation', () => {
    const app = appState(); addPhotos(app);
    app.selectedShotCount = 3; app.capturedPhotos.push(PHOTOS[0]); app.currentLayout = 'trio-polaroid';
    assert.equal(validateDraft(captureState(app)).currentLayout, 'trio-polaroid');
});

test('saving edits reuses image records instead of writing photo data on every change', async () => {
    installDom(); const app = appState(); const store = memoryStore();
    const drafts = new SnapBoothSessionDrafts(app, store); app.sessionDrafts = drafts;
    await drafts.init(); addPhotos(app); drafts.schedule(); await drafts.flush();
    assert.equal(store.photos.size, 2); assert.equal(store.photoWrites, 2);
    app.mainText = 'Changed title'; app.photoEdits[0].zoom = 2.5;
    drafts.schedule(); await drafts.flush();
    assert.equal(store.photoWrites, 2);
    assert.equal(store.record.mainText, 'Changed title'); assert.equal(store.record.photoEdits[0].zoom, 2.5);
    assert.equal(store.record.capturedPhotos, undefined);
});

test('a fresh page offers a saved draft and restores only after Resume is selected', async () => {
    const elements = installDom(); const first = appState(); const store = memoryStore();
    const writer = new SnapBoothSessionDrafts(first, store); first.sessionDrafts = writer;
    await writer.init(); addPhotos(first); first.photoEditor.selected = 1; writer.schedule(); await writer.flush();
    const app = appState(); const reader = new SnapBoothSessionDrafts(app, store); app.sessionDrafts = reader;
    await reader.init();
    assert.equal(app.capturedPhotos.length, 0);
    assert.equal(elements.get('draftResumeCard').hidden, false);
    await reader.resume();
    assert.deepEqual(app.capturedPhotos, PHOTOS); assert.equal(app.currentScreen, 'customize');
    assert.equal(app.photoEditor.selected, 1); assert.equal(app.isEraser, true);
    assert.deepEqual(app.photoEdits, first.photoEdits);
});

test('deleting a saved draft removes its image records and does not recreate it', async () => {
    const elements = installDom(); const app = appState(); const store = memoryStore();
    const drafts = new SnapBoothSessionDrafts(app, store); app.sessionDrafts = drafts;
    await drafts.init(); addPhotos(app); drafts.schedule(); await drafts.flush();
    await drafts.deleteDraft(); drafts.schedule(); await drafts.flush();
    assert.equal(store.record, null); assert.equal(store.photos.size, 0);
    assert.equal(app.capturedPhotos.length, 0); assert.equal(elements.get('draftResumeCard').hidden, true);
});

test('deleting while a save is in flight cannot resurrect the draft', async () => {
    installDom(); const app = appState(); const store = memoryStore();
    const originalWrite = store.write.bind(store);
    let release;
    store.write = async (...args) => { await new Promise(resolve => { release = resolve; }); return originalWrite(...args); };
    const drafts = new SnapBoothSessionDrafts(app, store); app.sessionDrafts = drafts;
    await drafts.init(); addPhotos(app); drafts.schedule(); const save = drafts.flush();
    await new Promise(resolve => setImmediate(resolve));
    const deleted = drafts.deleteDraft(); release();
    await Promise.all([save, deleted]);
    assert.equal(store.record, null); assert.equal(store.photos.size, 0); assert.equal(drafts.pending, null);
});

test('storage errors leave the active photos intact and report that saving failed', async () => {
    const elements = installDom(); const app = appState(); const store = memoryStore();
    store.write = async () => { throw new Error('Quota exceeded'); };
    const drafts = new SnapBoothSessionDrafts(app, store); app.sessionDrafts = drafts;
    await drafts.init(); addPhotos(app); drafts.schedule(); await drafts.flush();
    assert.deepEqual(app.capturedPhotos, PHOTOS);
    assert.match(elements.get('draftSaveStatus').textContent, /saving failed/);
});
