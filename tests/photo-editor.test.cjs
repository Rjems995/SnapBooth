const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const Editor = require('../editor.js');

function near(actual, expected, epsilon = 1e-8) { assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`); }

test('default crop preserves the old centered cover behavior without stretching', () => {
    assert.deepEqual(Editor.cropRect(1600, 900, 300, 400), { sx: 462.5, sy: 0, sw: 675, sh: 900 });
    assert.deepEqual(Editor.cropRect(900, 1600, 400, 300), { sx: 0, sy: 462.5, sw: 900, sh: 675 });
    assert.deepEqual(Editor.cropRect(800, 800, 400, 400), { sx: 0, sy: 0, sw: 800, sh: 800 });
});

test('crop and zoom always stay inside the original photo at every aspect ratio', () => {
    for (const [width, height] of [[1600, 900], [900, 1600], [800, 800]]) {
        for (const aspect of [3 / 4, 4 / 3, 1, 9 / 16, 1 / 0.55]) {
            for (const zoom of [1, 1.5, 3]) {
                for (const x of [0, 0.5, 1]) for (const y of [0, 0.5, 1]) {
                    const crop = Editor.cropRect(width, height, 1000 * aspect, 1000, { zoom, x, y });
                    assert.ok(crop.sx >= 0 && crop.sy >= 0);
                    assert.ok(crop.sx + crop.sw <= width + 1e-8);
                    assert.ok(crop.sy + crop.sh <= height + 1e-8);
                    near(crop.sw / crop.sh, aspect);
                }
            }
        }
    }
});

test('preview and export resolve to the same source crop at different pixel sizes', () => {
    for (const aspect of [3 / 4, 4 / 3, 1, 9 / 16, 1 / 0.55]) {
        const edit = { zoom: 2.3, x: 0.2, y: 0.8 };
        const preview = Editor.cropRect(1920, 1080, aspect * 150, 150, edit);
        const exported = Editor.cropRect(1920, 1080, aspect * 1800, 1800, edit);
        Object.keys(preview).forEach(key => near(preview[key], exported[key]));
    }
});

test('panning follows the drag direction and clamps at photo edges', () => {
    const edit = { zoom: 2, x: 0.5, y: 0.5 };
    const right = Editor.panEdit(1600, 900, 300, 400, edit, 40, 0);
    assert.ok(right.x < edit.x, 'dragging the image right must expose more of its left side');
    assert.equal(Editor.panEdit(1600, 900, 300, 400, edit, 10000, -10000).x, 0);
    assert.equal(Editor.panEdit(1600, 900, 300, 400, edit, 10000, -10000).y, 1);
});

test('zoom keeps the current focal point when it fits inside the new crop', () => {
    const edit = { zoom: 1.5, x: 0.3, y: 0.7 };
    const before = Editor.cropRect(1600, 900, 300, 400, edit);
    const zoomed = Editor.zoomEdit(1600, 900, 300, 400, edit, 2.5);
    const after = Editor.cropRect(1600, 900, 300, 400, zoomed);
    near(before.sx + before.sw / 2, after.sx + after.sw / 2);
    near(before.sy + before.sh / 2, after.sy + after.sh / 2);
});

test('invalid edit values cannot create empty crops or excessive zoom', () => {
    assert.deepEqual(Editor.normalizeEdit({ zoom: Infinity, x: NaN, y: -10 }), { zoom: 1, x: 0.5, y: 0 });
    assert.deepEqual(Editor.normalizeEdit({ zoom: 10, x: -5, y: 4 }), { zoom: 3, x: 0, y: 1 });
    assert.throws(() => Editor.cropRect(0, 100, 100, 100), RangeError);
});

function editorState() {
    const app = { capturedPhotos: ['A', 'B', 'C', 'D'], photoEdits: [
        { zoom: 1, x: 0, y: 0 }, { zoom: 2, x: 0.2, y: 0.7 }, { zoom: 3, x: 0.8, y: 0.4 }, { zoom: 1.5, x: 1, y: 1 }
    ], currentScreen: 'customize', renderPhotoboothStrip() {}, renderPhotoReviewGrid() {} };
    const editor = Object.create(Editor.prototype);
    editor.app = app;
    editor.selected = 1;
    editor.announce = () => {};
    return { app, editor };
}

test('reordering moves each crop with its photo and keeps selection on the same image', () => {
    const { app, editor } = editorState();
    const originalEdits = structuredClone(app.photoEdits);
    assert.equal(editor.movePhoto(1, 3), true);
    assert.deepEqual(app.capturedPhotos, ['A', 'C', 'D', 'B']);
    assert.deepEqual(app.photoEdits, [originalEdits[0], originalEdits[2], originalEdits[3], originalEdits[1]]);
    assert.equal(editor.selected, 3);
    editor.movePhoto(0, 3);
    assert.equal(editor.selected, 2);
    assert.equal(app.capturedPhotos[editor.selected], 'B');
    editor.movePhoto(3, 0);
    assert.equal(app.capturedPhotos[editor.selected], 'B');
});

test('out of bounds reorder attempts leave photos and crop edits unchanged', () => {
    const { app, editor } = editorState();
    const before = structuredClone({ capturedPhotos: app.capturedPhotos, photoEdits: app.photoEdits });
    for (const [from, to] of [[-1, 0], [0, 4], [1, 1], [0, 0.5]]) assert.equal(editor.movePhoto(from, to), false);
    assert.deepEqual(app.capturedPhotos, before.capturedPhotos);
    assert.deepEqual(app.photoEdits, before.photoEdits);
});

test('resetting one crop keeps edits on every other photo', () => {
    const { app, editor } = editorState();
    editor.setEdit = edit => { app.photoEdits[editor.selected] = edit; };
    const before = structuredClone(app.photoEdits);
    editor.resetCrop();
    assert.deepEqual(app.photoEdits[1], { zoom: 1, x: 0.5, y: 0.5 });
    for (const index of [0, 2, 3]) assert.deepEqual(app.photoEdits[index], before[index]);
});

test('canvas export uses the crop belonging to each reordered photo', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'snapbooth_photobooth_app.html'), 'utf8');
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('const app ='))[1];
    const app = vm.runInNewContext(script + '\napp;', { window: { SnapBoothPhotoEditor: Editor } });
    app.photoEdits = [{ zoom: 1, x: 0.5, y: 0.5 }, { zoom: 2, x: 0.2, y: 0.8 }];
    let args;
    const image = { width: 1600, height: 900 };
    app.drawImageCover({ drawImage(...values) { args = values; } }, image, 60, 80, 580, 580 * 4 / 3, 1);
    const crop = Editor.cropRect(1600, 900, 580, 580 * 4 / 3, app.photoEdits[1]);
    assert.deepEqual(args, [image, crop.sx, crop.sy, crop.sw, crop.sh, 60, 80, 580, 580 * 4 / 3]);
});

test('upload order follows file selection even when readers finish out of order', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'snapbooth_photobooth_app.html'), 'utf8');
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('const app ='))[1];
    const readers = [];
    class Reader {
        constructor() { readers.push(this); }
        readAsDataURL(file) { this.file = file; }
    }
    const app = vm.runInNewContext(script + '\napp;', { window: {}, FileReader: Reader });
    app.selectedShotCount = 3;
    app.photoEdits = [{ zoom: 3, x: 0, y: 0 }];
    let reviews = 0;
    app.renderPhotoReviewGrid = () => { reviews++; };
    app.navigateTo = screen => { app.currentScreen = screen; };
    app.handleFileUploadFallback({ target: { files: ['first', 'second', 'third'] } });
    readers[2].onload({ target: { result: 'third-photo' } });
    readers[0].onload({ target: { result: 'first-photo' } });
    assert.equal(reviews, 0);
    readers[1].onload({ target: { result: 'second-photo' } });
    assert.deepEqual(Array.from(app.capturedPhotos), ['first-photo', 'second-photo', 'third-photo']);
    assert.equal(app.photoEdits.length, 0);
    assert.equal(reviews, 1);
    assert.equal(app.currentScreen, 'review');
});
