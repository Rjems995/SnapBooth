(function () {
    const FIELDS = ['selectedShotCount', 'photoOrientation', 'currentLayout', 'frameColor', 'photoCorners', 'activeFilter',
        'mainText', 'subText', 'dateText', 'fontClass', 'timerDuration', 'isMirrored', 'brushColor', 'brushSize', 'isEraser',
        'exportPreset', 'controlTab', 'lastPreviewWidth'];
    const layouts = {
        2: ['strip-2', 'grid-2-horiz', 'polaroid-2'],
        3: ['strip-3', 'trio-polaroid', 'hero-3'],
        4: ['grid-2x2', 'strip-4', 'film-4', 'polaroid-4'],
        6: ['grid-3x2', 'grid-2x3', 'strip-6']
    };
    const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
    const choose = (value, values, fallback) => values.includes(value) ? value : fallback;
    const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    const text = (value, fallback) => typeof value === 'string' ? value.slice(0, 1000) : fallback;

    function captureState(app) {
        const state = { version: 1, savedAt: Date.now(), screen: ['review', 'customize', 'export'].includes(app.currentScreen) ? app.currentScreen : app.sessionDrafts?.lastScene || 'review',
            capturedPhotos: app.capturedPhotos.slice(), photoEdits: app.photoEdits.map(edit => ({ ...edit })),
            placedStickers: app.placedStickers.map(sticker => ({ ...sticker })),
            drawnPaths: app.drawnPaths.map(path => ({ ...path, points: path.points.map(point => ({ ...point })) })),
            selectedPhoto: app.photoEditor?.selected || 0 };
        FIELDS.forEach(field => { state[field] = app[field]; });
        return state;
    }

    function validateDraft(input) {
        if (!input || input.version !== 1 || !Array.isArray(input.capturedPhotos) || !input.capturedPhotos.length || input.capturedPhotos.length > 6) return null;
        if (!Array.from(input.capturedPhotos).every(photo => typeof photo === 'string' && photo.length <= 20 * 1024 * 1024 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(photo))) return null;
        const count = choose(input.selectedShotCount, [2, 3, 4, 6], 4);
        if (input.capturedPhotos.length > count) return null;
        const state = { version: 1, savedAt: clamp(input.savedAt, 0, 9e15, Date.now()),
            capturedPhotos: input.capturedPhotos.slice(), selectedShotCount: count,
            screen: input.capturedPhotos.length < count ? 'review' : choose(input.screen, ['review', 'customize', 'export'], 'customize'),
            photoOrientation: choose(input.photoOrientation, ['portrait', 'landscape', 'square', 'mobile'], 'portrait'),
            currentLayout: choose(input.currentLayout, layouts[count], layouts[count][0]),
            frameColor: color(input.frameColor, '#ffffff'), photoCorners: choose(input.photoCorners, ['sharp', 'rounded'], 'sharp'),
            activeFilter: choose(input.activeFilter, ['original', 'bw', 'vintage', 'sepia', 'warm', 'cool', 'contrast', 'bright'], 'original'),
            mainText: text(input.mainText, 'SNAPBOOTH'), subText: text(input.subText, 'SNAPBOOTHBYJAMES'), dateText: text(input.dateText, ''),
            fontClass: choose(input.fontClass, ['font-mono', 'font-sans', 'font-serif', 'font-hand'], 'font-mono'),
            timerDuration: choose(input.timerDuration, [3, 5, 10], 3), isMirrored: input.isMirrored !== false,
            brushColor: color(input.brushColor, '#2563eb'), brushSize: clamp(input.brushSize, 2, 24, 6), isEraser: input.isEraser === true,
            exportPreset: choose(input.exportPreset, ['original', 'story', 'wallpaper', 'strip2x6', 'print4x6'], 'original'),
            controlTab: choose(input.controlTab, ['photos', 'layouts', 'themes', 'filters', 'text', 'draw'], 'photos'),
            lastPreviewWidth: clamp(input.lastPreviewWidth, 100, 1000, 290), selectedPhoto: Math.floor(clamp(input.selectedPhoto, 0, input.capturedPhotos.length - 1, 0)),
            photoEdits: input.capturedPhotos.map((_, i) => {
                const edit = input.photoEdits?.[i] || {};
                return { zoom: clamp(edit.zoom, 1, 3, 1), x: clamp(edit.x, 0, 1, .5), y: clamp(edit.y, 0, 1, .5) };
            }), placedStickers: [], drawnPaths: [] };
        const stickers = input.placedStickers || [], paths = input.drawnPaths || [];
        if (!Array.isArray(stickers) || stickers.length > 500 || !Array.isArray(paths) || paths.length > 5000) return null;
        for (const sticker of stickers) {
            if (!sticker || typeof sticker !== 'object') return null;
            if (!['📸', '🤍', '✨', '🎀', '⭐', '🍒', '🧸', '🎟️'].includes(sticker.emoji)) return null;
            state.placedStickers.push({ id: clamp(sticker.id, 0, 9e15, Date.now()), emoji: sticker.emoji,
                x: clamp(sticker.x, 0, 100, 50), y: clamp(sticker.y, 0, 100, 50), scale: clamp(sticker.scale, .1, 10, 1) });
        }
        let points = 0;
        for (const path of paths) {
            if (!path || typeof path !== 'object') return null;
            if (!Array.isArray(path.points) || (points += path.points.length) > 200000 ||
                !path.points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
            state.drawnPaths.push({ color: color(path.color, '#2563eb'), size: clamp(path.size, 2, 24, 6), isEraser: path.isEraser === true,
                points: path.points.map(point => ({ x: point.x, y: point.y })) });
        }
        return state;
    }

    class IndexedDraftStore {
        open() {
            if (!this.opening) this.opening = new Promise((resolve, reject) => {
                const request = indexedDB.open('snapbooth-drafts', 1);
                request.onupgradeneeded = () => { request.result.createObjectStore('draft'); request.result.createObjectStore('photos'); };
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Draft storage is busy.'));
                request.onsuccess = () => {
                    const db = request.result;
                    db.onversionchange = () => { db.close(); this.opening = null; };
                    resolve(db);
                };
            });
            return this.opening;
        }

        async read() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['draft', 'photos'], 'readonly');
                let record = null;
                const photos = [];
                const request = tx.objectStore('draft').get('current');
                request.onsuccess = () => {
                    record = request.result;
                    if (!record || !Array.isArray(record.photoKeys) || record.photoKeys.length > 6) return;
                    record.photoKeys.forEach((key, index) => {
                        if (typeof key !== 'string') return;
                        const photo = tx.objectStore('photos').get(key);
                        photo.onsuccess = () => { photos[index] = photo.result; };
                    });
                };
                tx.oncomplete = () => resolve(record ? { ...record, capturedPhotos: photos } : null);
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('Draft could not be read.'));
            });
        }

        async write(record, newPhotos, oldKeys) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['draft', 'photos'], 'readwrite');
                tx.objectStore('draft').put(record, 'current');
                newPhotos.forEach(({ key, data }) => tx.objectStore('photos').put(data, key));
                oldKeys.forEach(key => tx.objectStore('photos').delete(key));
                tx.oncomplete = () => resolve();
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('Draft could not be saved.'));
            });
        }

        async clear() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['draft', 'photos'], 'readwrite');
                tx.objectStore('draft').clear(); tx.objectStore('photos').clear();
                tx.oncomplete = () => resolve();
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('Draft could not be deleted.'));
            });
        }
    }

    class SnapBoothSessionDrafts {
        constructor(app, store = new IndexedDraftStore()) {
            this.app = app; this.store = store;
            this.pending = null; this.photoKeys = new Map(); this.storedKeys = new Set();
            this.queue = Promise.resolve(); this.ready = Promise.resolve(); this.timer = null;
            this.suspended = false; this.epoch = 0; this.dirty = false;
            this.defaults = captureState(app);
        }

        init() {
            this.ready = (async () => {
                try {
                    const record = await this.store.read();
                    if (record) {
                        this.pending = validateDraft(record);
                        if (this.pending) record.photoKeys.forEach((key, i) => {
                            this.photoKeys.set(record.capturedPhotos[i], key); this.storedKeys.add(key);
                        });
                        else this.setStatus('The saved draft could not be restored. Delete it to start fresh.');
                        this.updateCard(!!record);
                    }
                } catch { this.setStatus('Draft saving is unavailable in this browser. Your current session still works.'); }
            })();
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
            window.addEventListener('pagehide', () => this.flush());
            return this.ready;
        }

        setStatus(message) {
            for (const id of ['draftSaveStatus', 'draftHomeStatus', 'draftExportStatus']) {
                const element = document.getElementById(id);
                if (element.textContent !== message) element.textContent = message;
            }
        }

        updateCard(exists = !!this.pending) {
            document.getElementById('draftResumeCard').hidden = !exists;
            document.getElementById('resumeDraftBtn').disabled = !this.pending;
            document.getElementById('draftResumeSummary').textContent = this.pending
                ? `${this.pending.capturedPhotos.length} of ${this.pending.selectedShotCount} photos · Saved ${new Date(this.pending.savedAt).toLocaleString()} · On this device`
                : 'You can delete this draft and make a new strip.';
        }

        schedule() {
            if (this.suspended || !this.app.capturedPhotos.length) return;
            if (['review', 'customize', 'export'].includes(this.app.currentScreen)) this.lastScene = this.app.currentScreen;
            this.dirty = true;
            // Throttle saves rather than postponing them throughout a long drag or drawing gesture.
            if (!this.timer) this.timer = setTimeout(() => this.flush(), 300);
        }

        async flush() {
            clearTimeout(this.timer); this.timer = null;
            if (!this.dirty || this.suspended) return this.queue;
            this.dirty = false;
            const state = validateDraft(captureState(this.app));
            if (!state) {
                if (this.app.capturedPhotos.length) this.setStatus('This draft could not be saved. You can still download your strip.');
                return;
            }
            const epoch = this.epoch;
            const work = this.queue.then(async () => {
                await this.ready;
                if (epoch !== this.epoch) return;
                const keys = new Map(), fresh = [];
                const photoKeys = state.capturedPhotos.map(data => {
                    let key = this.photoKeys.get(data) || keys.get(data);
                    if (!key) { key = crypto.randomUUID(); fresh.push({ key, data }); }
                    keys.set(data, key);
                    return key;
                });
                const record = { ...state, photoKeys };
                delete record.capturedPhotos;
                await this.store.write(record, fresh, [...this.storedKeys].filter(key => !photoKeys.includes(key)));
                if (epoch !== this.epoch) return;
                this.photoKeys = keys; this.storedKeys = new Set(photoKeys); this.pending = state;
                this.updateCard(); this.setStatus('Draft saved on this device.');
            });
            this.queue = work.catch(() => {});
            return work.catch(() => this.setStatus('Draft saving failed. Your current session is safe, but recent changes may not survive a refresh.'));
        }

        apply(state) {
            const app = this.app;
            app.selectShotOption(state.selectedShotCount);
            FIELDS.forEach(field => { app[field] = state[field]; });
            app.capturedPhotos = state.capturedPhotos.slice();
            app.photoEdits = state.photoEdits.map(edit => ({ ...edit }));
            app.placedStickers = state.placedStickers.map(sticker => ({ ...sticker }));
            app.drawnPaths = state.drawnPaths.map(path => ({ ...path, points: path.points.map(point => ({ ...point })) }));
            app.currentPath = null;
            app.photoEditor.selected = state.selectedPhoto || 0;
            document.getElementById('inputMainText').value = app.mainText;
            document.getElementById('inputDateText').value = app.dateText;
            document.getElementById('fontSelect').value = app.fontClass;
            app.setPhotoOrientation(app.photoOrientation);
            app.setPhotoCorners(app.photoCorners);
            app.updateFontFamily(app.fontClass); app.updateTextContent();
            app.updateFrameColor(app.frameColor); app.setTimerDuration(app.timerDuration);
            app.setBrushColor(app.brushColor); app.setBrushSize(app.brushSize);
            app.setToolMode(state.isEraser ? 'eraser' : 'pen');
            app.renderPlacedStickers(); app.renderPhotoReviewGrid();
            app.setControlTab(app.controlTab || 'photos');
        }

        async resume() {
            await this.ready;
            await this.flush();
            const state = validateDraft(captureState(this.app)) || this.pending;
            if (!state) return;
            this.suspended = true;
            const sound = this.app.soundEnabled;
            this.app.soundEnabled = false;
            try { this.apply(state); this.app.navigateTo(state.screen); }
            finally { this.suspended = false; this.app.soundEnabled = sound; }
            this.setStatus('Draft restored. Changes will keep saving on this device.');
        }

        async deleteDraft() {
            this.epoch++; clearTimeout(this.timer); this.timer = null; this.dirty = false;
            this.pending = null; this.updateCard(false);
            this.suspended = true;
            const sound = this.app.soundEnabled;
            this.app.soundEnabled = false;
            try {
                this.app.stopWebcam();
                this.apply(this.defaults);
                document.getElementById('cropPhotoImage').removeAttribute('src');
                document.getElementById('mobilePreviewImg').removeAttribute('src');
                this.app.navigateTo('home');
            } finally { this.suspended = false; this.app.soundEnabled = sound; }
            const work = this.queue.then(async () => { await this.ready; await this.store.clear(); });
            this.queue = work.catch(() => {});
            try {
                await work;
                this.pending = null; this.photoKeys.clear(); this.storedKeys.clear(); this.updateCard(false);
                this.setStatus('Saved draft deleted.');
            } catch { this.setStatus('The saved draft could not be deleted. Please try again.'); this.updateCard(true); }
        }
    }

    if (typeof window !== 'undefined') window.SnapBoothSessionDrafts = SnapBoothSessionDrafts;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SnapBoothSessionDrafts, IndexedDraftStore, captureState, validateDraft };
})();
