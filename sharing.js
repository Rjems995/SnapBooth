(function () {
    class SnapBoothSharing {
        constructor() {
            this.revision = 0;
            this.file = null;
            this.link = null;
            this.upload = null;
            this.expiryTimer = null;
            this.isSharing = false;
            this.previewUrl = null;
        }

        element(id) { return document.getElementById(id); }

        setStatus(message, id = 'shareStatus') {
            this.element(id).textContent = message;
        }

        updateControls() {
            this.element('sharePhotoBtn').disabled = !this.file || this.isSharing;
            this.element('createPhotoLinkBtn').disabled = !this.file || !!this.upload;
            this.element('shareExpiry').disabled = !!this.upload;
            this.element('createPhotoLinkBtn').textContent = this.upload ? 'CREATING LINK...' : 'CREATE LINK & QR';
        }

        clearLink() {
            clearTimeout(this.expiryTimer);
            this.link = null;
            this.element('photoLinkResult').classList.add('hidden');
            this.element('qrCodeImg').removeAttribute('src');
            this.element('photoShareUrl').value = '';
            this.element('photoLinkExpiry').textContent = '';
        }

        reset() {
            this.revision++;
            if (this.upload) this.upload.abort();
            this.upload = null;
            this.file = null;
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = null;
            this.clearLink();
            this.setStatus('');
            this.setStatus('', 'linkStatus');
            this.updateControls();
        }

        prepare(canvas, createBlob = null) {
            this.reset();
            const revision = this.revision;
            return new Promise(resolve => {
                const finish = blob => {
                    if (revision !== this.revision) return resolve(false);
                    if (!blob) {
                        this.setStatus('Photo sharing could not be prepared. Please try exporting again.');
                        return resolve(false);
                    }
                    this.file = new File([blob], `SNAPBOOTH_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    this.previewUrl = URL.createObjectURL(blob);
                    this.element('mobilePreviewImg').src = this.previewUrl;
                    this.updateControls();
                    resolve(true);
                };
                try {
                    if (createBlob) Promise.resolve().then(createBlob).then(finish, () => finish(null));
                    else canvas.toBlob(finish, 'image/jpeg', 0.95);
                }
                catch { finish(null); }
            });
        }

        async sharePhoto() {
            if (!this.file || this.isSharing) return;
            const revision = this.revision;
            const data = { files: [this.file], title: 'My SnapBooth photo strip' };
            try {
                if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' ||
                    !navigator.canShare({ files: data.files })) {
                    this.element('qrModal').classList.remove('hidden');
                    this.setStatus('Your browser cannot share photo files directly. Save the image above or create a temporary download link.', 'linkStatus');
                    return;
                }
                this.isSharing = true;
                this.updateControls();
                // The file is prepared during export so the share sheet opens within the click gesture.
                await navigator.share(data);
                if (revision === this.revision) this.setStatus('Photo sent to your share menu.');
            } catch (error) {
                if (revision === this.revision && error.name !== 'AbortError') {
                    this.element('qrModal').classList.remove('hidden');
                    this.setStatus('The share menu could not open. You can save the image or create a temporary link instead.', 'linkStatus');
                }
            } finally {
                this.isSharing = false;
                this.updateControls();
            }
        }

        async createLink() {
            if (!this.file || this.upload) return;
            if (!['http:', 'https:'].includes(window.location.protocol)) {
                this.setStatus('Temporary links are available on the hosted SnapBooth site. You can still save or share this image directly.', 'linkStatus');
                return;
            }
            if (typeof window.qrcode !== 'function') {
                this.setStatus('QR sharing could not load. Please reload the page and try again, or download your photo.', 'linkStatus');
                return;
            }
            if (this.file.size > 4 * 1024 * 1024) {
                this.setStatus('This photo is too large for a link. Please download it or use Share Photo instead.', 'linkStatus');
                return;
            }
            const revision = this.revision;
            const upload = new AbortController();
            const timeout = setTimeout(() => upload.abort(), 20000);
            this.upload = upload;
            this.updateControls();
            this.setStatus('Uploading this strip to create your temporary link...', 'linkStatus');
            try {
                const response = await fetch('/api/shares', {
                    method: 'POST',
                    headers: { 'Content-Type': 'image/jpeg', 'X-Share-Expiry': this.element('shareExpiry').value },
                    body: this.file,
                    credentials: 'omit',
                    signal: upload.signal
                });
                const result = await response.json().catch(() => null);
                if (revision !== this.revision) return;
                if (!response.ok || !result) {
                    throw new Error(result?.error || 'Temporary photo links are unavailable on this site. Please download or share the photo directly.');
                }
                const url = new URL(result.url, window.location.origin);
                const expiresAt = Date.parse(result.expiresAt);
                if (url.origin !== window.location.origin || url.pathname !== '/shared.html' ||
                    !/^#[A-Za-z0-9_-]{43}$/.test(url.hash) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                    throw new Error('The photo link could not be created. Please try again.');
                }
                const qr = window.qrcode(0, 'M');
                qr.addData(url.href);
                qr.make();
                this.clearLink();
                this.link = { url: url.href, expiresAt };
                this.element('qrCodeImg').src = qr.createDataURL(6, 24);
                this.element('photoShareUrl').value = url.href;
                this.element('photoLinkExpiry').textContent = `Expires ${new Date(expiresAt).toLocaleString()}`;
                this.element('photoLinkResult').classList.remove('hidden');
                this.setStatus('Scan this QR code on another device to download this finished strip.', 'linkStatus');
                this.expiryTimer = setTimeout(() => {
                    this.clearLink();
                    this.setStatus('This link has expired. Create a new link to share this strip again.', 'linkStatus');
                }, expiresAt - Date.now());
            } catch (error) {
                if (revision === this.revision) {
                    this.setStatus(error.name === 'AbortError'
                        ? 'Creating the link took too long. Please try again.'
                        : error.message || 'The photo link could not be created. Please try again.', 'linkStatus');
                }
            } finally {
                clearTimeout(timeout);
                if (revision === this.revision) {
                    this.upload = null;
                    this.updateControls();
                }
            }
        }

        async copyLink() {
            if (!this.link) return;
            const revision = this.revision;
            if (this.link.expiresAt <= Date.now()) {
                this.clearLink();
                this.setStatus('This link has expired. Create a new one to share this strip.', 'linkStatus');
                return;
            }
            try {
                await navigator.clipboard.writeText(this.link.url);
                if (revision === this.revision) this.setStatus('Photo link copied.', 'linkStatus');
            } catch {
                if (revision !== this.revision) return;
                this.element('photoShareUrl').focus();
                this.element('photoShareUrl').select();
                this.setStatus('Select and copy the photo link above.', 'linkStatus');
            }
        }
    }

    window.SnapBoothSharing = SnapBoothSharing;
})();
