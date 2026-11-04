(function () {
    const status = document.getElementById('pageStatus');
    const card = document.getElementById('sharedPhotoCard');
    const image = document.getElementById('sharedPhoto');
    const download = document.getElementById('downloadSharedPhoto');
    const share = document.getElementById('shareSharedPhoto');
    let photoUrl = null;
    let expiresAt = 0;

    function expire() {
        card.hidden = true;
        image.removeAttribute('src');
        download.removeAttribute('href');
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoUrl = null;
        status.textContent = 'This photo link has expired. Ask the sender for a new link.';
    }

    async function load() {
        const token = window.location.hash.slice(1);
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
            status.textContent = 'This photo link is invalid. Please check the link or scan the QR code again.';
            return;
        }
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 15000);
        try {
            const endpoint = `/api/shares?id=${encodeURIComponent(token)}`;
            const response = await fetch(endpoint, { cache: 'no-store', credentials: 'omit', signal: abort.signal });
            if (response.status === 404 || response.status === 410) {
                expire();
                return;
            }
            if (!response.ok || response.headers.get('content-type') !== 'image/jpeg') {
                throw new Error('Photo unavailable.');
            }
            expiresAt = Date.parse(response.headers.get('x-share-expires-at'));
            if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                expire();
                return;
            }
            const blob = await response.blob();
            if (expiresAt <= Date.now()) {
                expire();
                return;
            }
            const file = new File([blob], 'SNAPBOOTH.jpg', { type: 'image/jpeg' });
            photoUrl = URL.createObjectURL(blob);
            image.src = photoUrl;
            image.onerror = () => {
                card.hidden = true;
                status.textContent = 'This photo could not be displayed. Please ask the sender for a new link.';
            };
            download.href = `${endpoint}&download=1`;
            download.addEventListener('click', event => {
                if (expiresAt <= Date.now()) { event.preventDefault(); expire(); }
            });
            document.getElementById('sharedPhotoExpiry').textContent = `Available until ${new Date(expiresAt).toLocaleString()}`;
            card.hidden = false;
            status.textContent = 'Save your photo before this link expires.';
            setTimeout(expire, expiresAt - Date.now());
            document.addEventListener('visibilitychange', () => {
                if (Date.now() >= expiresAt) expire();
            });

            if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' &&
                navigator.canShare({ files: [file] })) {
                share.hidden = false;
                share.addEventListener('click', async () => {
                    if (expiresAt <= Date.now()) { expire(); return; }
                    try {
                        share.disabled = true;
                        await navigator.share({ files: [file], title: 'My SnapBooth photo strip' });
                    } catch (error) {
                        if (error.name !== 'AbortError') status.textContent = 'The share menu could not open. Use Download photo to save your strip.';
                    } finally { share.disabled = false; }
                });
            }
        } catch {
            status.textContent = 'Your photo could not load. Check your connection and try again.';
            document.getElementById('retrySharedPhoto').hidden = false;
        } finally { clearTimeout(timeout); }
    }

    load();
})();
