(function () {
    const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
    const normalizeEdit = (edit = {}) => ({ zoom: clamp(edit.zoom, 1, 3, 1), x: clamp(edit.x, 0, 1, 0.5), y: clamp(edit.y, 0, 1, 0.5) });

    function cropRect(imageWidth, imageHeight, frameWidth, frameHeight, edit) {
        if (![imageWidth, imageHeight, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) {
            throw new RangeError('Image and frame dimensions must be positive.');
        }
        const state = normalizeEdit(edit);
        const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * state.zoom;
        const sw = Math.min(imageWidth, frameWidth / scale);
        const sh = Math.min(imageHeight, frameHeight / scale);
        return { sx: (imageWidth - sw) * state.x, sy: (imageHeight - sh) * state.y, sw, sh };
    }

    function positionCrop(imageWidth, imageHeight, frameWidth, frameHeight, zoom, sourceX, sourceY, u = 0.5, v = 0.5) {
        const crop = cropRect(imageWidth, imageHeight, frameWidth, frameHeight, { zoom });
        return normalizeEdit({ zoom,
            x: imageWidth > crop.sw ? (sourceX - u * crop.sw) / (imageWidth - crop.sw) : 0.5,
            y: imageHeight > crop.sh ? (sourceY - v * crop.sh) / (imageHeight - crop.sh) : 0.5
        });
    }

    function zoomEdit(imageWidth, imageHeight, frameWidth, frameHeight, edit, zoom) {
        const crop = cropRect(imageWidth, imageHeight, frameWidth, frameHeight, edit);
        return positionCrop(imageWidth, imageHeight, frameWidth, frameHeight, clamp(zoom, 1, 3, 1), crop.sx + crop.sw / 2, crop.sy + crop.sh / 2);
    }

    function panEdit(imageWidth, imageHeight, frameWidth, frameHeight, edit, dx, dy) {
        const state = normalizeEdit(edit);
        const crop = cropRect(imageWidth, imageHeight, frameWidth, frameHeight, state);
        return normalizeEdit({ ...state,
            x: imageWidth > crop.sw ? (crop.sx - dx * crop.sw / frameWidth) / (imageWidth - crop.sw) : state.x,
            y: imageHeight > crop.sh ? (crop.sy - dy * crop.sh / frameHeight) / (imageHeight - crop.sh) : state.y
        });
    }

    class SnapBoothPhotoEditor {
        static cropRect = cropRect;
        static normalizeEdit = normalizeEdit;
        static panEdit = panEdit;
        static zoomEdit = zoomEdit;

        constructor(app) {
            this.app = app;
            this.selected = 0;
            this.pointers = new Map();
            this.gesture = null;
            this.drag = null;
            this.expanded = false;
            this.stage = document.getElementById('cropStage');
            this.image = document.getElementById('cropPhotoImage');
            this.preview = document.getElementById('photoboothPreviewContainer');
            this.dialog = document.getElementById('expandedPreviewDialog');
            this.image.onload = () => this.applyImageCrop(this.image, this.selected);
            this.setupCropGestures();
            ['photoOrderList', 'photoReviewGrid'].forEach(id => this.setupReorder(document.getElementById(id)));
            this.dialog.addEventListener('close', () => {
                this.expanded = false;
                document.getElementById('editorPreviewPanel').appendChild(this.preview);
                this.fitPreview();
            });
            const resize = () => {
                if (this.app.currentScreen !== 'customize') return;
                this.renderStage();
                this.app.renderDoodleCanvas();
                this.fitPreview();
            };
            if (typeof ResizeObserver === 'function') {
                this.resizeObserver = new ResizeObserver(resize);
                this.resizeObserver.observe(this.preview);
                this.resizeObserver.observe(document.getElementById('photoboothStrip'));
            }
            window.addEventListener('resize', resize);
        }

        ensureEdits() {
            this.app.photoEdits = this.app.capturedPhotos.map((_, index) => normalizeEdit(this.app.photoEdits[index]));
            this.selected = Math.max(0, Math.min(this.selected, this.app.capturedPhotos.length - 1));
        }

        onNavigate(screen) {
            document.body.classList.toggle('is-editing', screen === 'customize');
            this.cancelDrag();
            this.pointers.clear();
            this.gesture = null;
            if (screen !== 'customize' && this.dialog.open) this.dialog.close();
        }

        onTabChange(tab) {
            this.pointers.clear();
            this.gesture = null;
            if (tab === 'photos') this.render();
            document.getElementById('editorSettingsPanel').scrollTop = 0;
        }

        render() {
            this.ensureEdits();
            const list = document.getElementById('photoOrderList');
            list.replaceChildren();
            this.app.capturedPhotos.forEach((source, index) => {
                const tile = document.createElement('div');
                tile.className = `photo-tile${index === this.selected ? ' selected' : ''}`;
                tile.dataset.photoIndex = index;
                const select = document.createElement('button');
                select.type = 'button';
                select.className = 'photo-select';
                select.setAttribute('aria-label', `Edit crop for photo ${index + 1}`);
                select.setAttribute('aria-pressed', String(index === this.selected));
                const image = document.createElement('img');
                image.src = source;
                image.alt = '';
                image.draggable = false;
                select.appendChild(image);
                const number = document.createElement('span');
                number.className = 'photo-number';
                number.textContent = index + 1;
                select.appendChild(number);
                select.addEventListener('click', () => this.select(index));
                const grip = document.createElement('button');
                grip.type = 'button';
                grip.className = 'photo-grip';
                grip.dataset.photoIndex = index;
                grip.textContent = '\u283F';
                grip.setAttribute('aria-label', `Drag to reorder photo ${index + 1}. Arrow keys also change its position.`);
                tile.append(select, grip);
                list.appendChild(tile);
            });
            this.renderStage();
            this.fitPreview();
        }

        select(index) {
            this.selected = index;
            this.pointers.clear();
            this.gesture = null;
            this.render();
            document.querySelector(`#photoOrderList [data-photo-index="${index}"] .photo-select`)?.focus({ preventScroll: true });
            this.stage.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        renderStage() {
            const source = this.app.capturedPhotos[this.selected];
            if (!source) return;
            const aspect = this.app.getPhotoFrameAspect(this.selected);
            this.stage.style.aspectRatio = aspect;
            this.stage.style.width = `${Math.min(280, Math.max(160, window.innerHeight * 0.28)) * aspect}px`;
            this.stage.style.borderRadius = this.app.photoCorners === 'rounded' ? '8px' : '0';
            if (this.image.getAttribute('src') !== source) this.image.src = source;
            this.image.className = this.app.getFilterClass();
            this.applyImageCrop(this.image, this.selected);
            const percent = Math.round(normalizeEdit(this.app.photoEdits[this.selected]).zoom * 100);
            document.getElementById('cropPhotoTitle').textContent = `Photo ${this.selected + 1} of ${this.app.capturedPhotos.length}`;
            document.getElementById('photoZoom').value = percent;
            document.getElementById('photoZoom').setAttribute('aria-valuetext', `${percent} percent`);
            document.getElementById('photoZoomValue').textContent = `${percent}%`;
            document.getElementById('movePhotoEarlier').disabled = this.selected === 0;
            document.getElementById('movePhotoLater').disabled = this.selected === this.app.capturedPhotos.length - 1;
        }

        applyImageCrop(image, index) {
            if (!image.naturalWidth || !image.naturalHeight) return;
            const crop = cropRect(image.naturalWidth, image.naturalHeight, this.app.getPhotoFrameAspect(index), 1, this.app.photoEdits[index]);
            image.style.width = `${image.naturalWidth / crop.sw * 100}%`;
            image.style.height = `${image.naturalHeight / crop.sh * 100}%`;
            image.style.left = `${-crop.sx / crop.sw * 100}%`;
            image.style.top = `${-crop.sy / crop.sh * 100}%`;
        }

        setEdit(edit) {
            this.app.photoEdits[this.selected] = normalizeEdit(edit);
            this.renderStage();
            const image = document.querySelector(`#stripPhotosContainer [data-crop-index="${this.selected}"]`);
            if (image) this.applyImageCrop(image, this.selected);
        }

        setZoom(zoom) {
            const rect = this.stage.getBoundingClientRect();
            if (!this.image.naturalWidth || !rect.width) return;
            this.setEdit(zoomEdit(this.image.naturalWidth, this.image.naturalHeight, rect.width, rect.height, this.app.photoEdits[this.selected], zoom));
        }

        resetCrop() {
            this.setEdit({ zoom: 1, x: 0.5, y: 0.5 });
            this.announce(`Photo ${this.selected + 1} crop reset.`);
        }

        moveSelected(delta) { this.movePhoto(this.selected, this.selected + delta); }

        movePhoto(from, to) {
            const photos = this.app.capturedPhotos;
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= photos.length || to >= photos.length || from === to) return false;
            this.ensureEdits();
            const [photo] = photos.splice(from, 1);
            const [edit] = this.app.photoEdits.splice(from, 1);
            photos.splice(to, 0, photo);
            this.app.photoEdits.splice(to, 0, edit);
            if (this.selected === from) this.selected = to;
            else if (from < this.selected && to >= this.selected) this.selected--;
            else if (from > this.selected && to <= this.selected) this.selected++;
            if (this.app.currentScreen === 'review') this.app.renderPhotoReviewGrid();
            else this.app.renderPhotoboothStrip();
            this.announce(`Photo ${from + 1} moved to position ${to + 1}.`);
            return true;
        }

        announce(message) {
            document.getElementById('photoEditStatus').textContent = message;
            document.getElementById('photoOrderAnnouncement').textContent = message;
        }

        fitPreview() {
            if (this.app.currentScreen !== 'customize') return;
            const strip = document.getElementById('photoboothStrip');
            const width = strip.offsetWidth, height = strip.offsetHeight;
            if (!width || !height || !this.preview.clientHeight) return;
            const style = getComputedStyle(this.preview);
            const availableWidth = this.preview.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const availableHeight = this.preview.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            const scale = Math.max(0.01, Math.min(1, availableWidth / width, this.expanded ? 1 : availableHeight / height));
            strip.style.transform = `scale(${scale})`;
            const frame = document.getElementById('previewScaleFrame');
            frame.style.width = `${width * scale}px`;
            frame.style.height = `${height * scale}px`;
            this.app.lastPreviewWidth = width;
        }

        expandPreview() {
            this.expanded = true;
            document.getElementById('expandedPreviewHost').appendChild(this.preview);
            this.dialog.showModal();
            this.fitPreview();
        }

        setupCropGestures() {
            const startGesture = () => {
                const points = [...this.pointers.values()];
                const rect = this.stage.getBoundingClientRect();
                if (!points.length || !this.image.naturalWidth || !rect.width) { this.gesture = null; return; }
                const edit = normalizeEdit(this.app.photoEdits[this.selected]);
                const crop = cropRect(this.image.naturalWidth, this.image.naturalHeight, rect.width, rect.height, edit);
                this.gesture = { edit, rect, first: points[0] };
                if (points.length === 2) {
                    const u = ((points[0].x + points[1].x) / 2 - rect.left) / rect.width;
                    const v = ((points[0].y + points[1].y) / 2 - rect.top) / rect.height;
                    Object.assign(this.gesture, {
                        distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)),
                        sourceX: crop.sx + u * crop.sw, sourceY: crop.sy + v * crop.sh
                    });
                }
            };
            this.stage.addEventListener('pointerdown', event => {
                if (event.button !== 0 || this.pointers.size >= 2) return;
                this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                this.stage.setPointerCapture(event.pointerId);
                startGesture();
                event.preventDefault();
            });
            this.stage.addEventListener('pointermove', event => {
                if (!this.pointers.has(event.pointerId) || !this.gesture) return;
                this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                const points = [...this.pointers.values()];
                const g = this.gesture;
                if (points.length === 2 && g.distance) {
                    const zoom = clamp(g.edit.zoom * Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / g.distance, 1, 3, 1);
                    const u = ((points[0].x + points[1].x) / 2 - g.rect.left) / g.rect.width;
                    const v = ((points[0].y + points[1].y) / 2 - g.rect.top) / g.rect.height;
                    this.setEdit(positionCrop(this.image.naturalWidth, this.image.naturalHeight, g.rect.width, g.rect.height, zoom, g.sourceX, g.sourceY, u, v));
                } else {
                    this.setEdit(panEdit(this.image.naturalWidth, this.image.naturalHeight, g.rect.width, g.rect.height, g.edit, event.clientX - g.first.x, event.clientY - g.first.y));
                }
                event.preventDefault();
            });
            const end = event => { this.pointers.delete(event.pointerId); startGesture(); };
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => this.stage.addEventListener(type, end));
            this.stage.addEventListener('keydown', event => {
                const directions = { ArrowLeft: ['x', -0.025], ArrowRight: ['x', 0.025], ArrowUp: ['y', -0.025], ArrowDown: ['y', 0.025] };
                const edit = normalizeEdit(this.app.photoEdits[this.selected]);
                if (directions[event.key]) {
                    const [axis, delta] = directions[event.key];
                    this.setEdit({ ...edit, [axis]: edit[axis] + delta });
                } else if (['+', '='].includes(event.key)) this.setZoom(edit.zoom + 0.1);
                else if (event.key === '-') this.setZoom(edit.zoom - 0.1);
                else if (event.key === 'Home') this.resetCrop();
                else return;
                event.preventDefault();
            });
        }

        setupReorder(list) {
            list.addEventListener('pointerdown', event => {
                const handle = event.target.closest('.photo-grip');
                if (!handle || event.button !== 0 || this.drag || this.app.isRetaking) return;
                const tile = handle.parentElement.closest('[data-photo-index]');
                const rect = tile.getBoundingClientRect();
                this.drag = { list, handle, tile, from: Number(handle.dataset.photoIndex), to: Number(handle.dataset.photoIndex),
                    pointer: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
                handle.setPointerCapture(event.pointerId);
                event.preventDefault();
            });
            list.addEventListener('keydown', event => {
                const handle = event.target.closest('.photo-grip');
                if (!handle) return;
                const from = Number(handle.dataset.photoIndex);
                let to;
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') to = from - 1;
                else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') to = from + 1;
                else if (event.key === 'Home') to = 0;
                else if (event.key === 'End') to = this.app.capturedPhotos.length - 1;
                else return;
                event.preventDefault();
                if (this.movePhoto(from, to)) list.querySelector(`.photo-grip[data-photo-index="${to}"]`)?.focus({ preventScroll: true });
            });
            window.addEventListener('pointermove', event => {
                const drag = this.drag;
                if (!drag || drag.list !== list || event.pointerId !== drag.pointer) return;
                if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
                if (!drag.ghost) {
                    const rect = drag.tile.getBoundingClientRect();
                    drag.ghost = drag.tile.cloneNode(true);
                    drag.ghost.classList.add('photo-drag-ghost');
                    drag.ghost.setAttribute('aria-hidden', 'true');
                    drag.ghost.inert = true;
                    drag.ghost.style.width = `${rect.width}px`;
                    drag.ghost.style.height = `${rect.height}px`;
                    document.body.appendChild(drag.ghost);
                    drag.tile.classList.add('dragging');
                }
                drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
                drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-photo-index]');
                list.querySelectorAll('.drop-target').forEach(tile => tile.classList.remove('drop-target'));
                drag.to = drag.from;
                if (target && list.contains(target)) {
                    drag.to = Number(target.dataset.photoIndex);
                    target.classList.add('drop-target');
                }
                event.preventDefault();
            });
            window.addEventListener('pointerup', event => {
                if (!this.drag || this.drag.list !== list || event.pointerId !== this.drag.pointer) return;
                const { from, to } = this.drag;
                this.cancelDrag();
                this.movePhoto(from, to);
            });
            window.addEventListener('pointercancel', event => {
                if (this.drag?.list === list && event.pointerId === this.drag.pointer) this.cancelDrag();
            });
            list.addEventListener('lostpointercapture', event => {
                if (this.drag?.handle === event.target && event.pointerId === this.drag.pointer) this.cancelDrag();
            });
        }

        cancelDrag() {
            if (!this.drag) return;
            const { handle, pointer, tile, ghost, list } = this.drag;
            this.drag = null;
            ghost?.remove();
            tile.classList.remove('dragging');
            list.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target'));
            if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
        }
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = SnapBoothPhotoEditor;
    if (typeof window !== 'undefined') window.SnapBoothPhotoEditor = SnapBoothPhotoEditor;
})();
