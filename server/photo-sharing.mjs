import { randomBytes } from 'node:crypto';

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const EXPIRY_SECONDS = new Set([900, 3600, 86400]);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PRIVATE_HEADERS = {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
};

function json(body, status = 200, headers = {}) {
    return Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

export function createPhotoSharingHandler({ getStore, now = Date.now }) {
    return async function handlePhotoShare(request) {
        const url = new URL(request.url);
        try {
            if (request.method === 'POST') {
                if (request.headers.get('origin') !== url.origin) {
                    return json({ error: 'Please create photo links from SnapBooth.' }, 403);
                }
                if (request.headers.get('content-type') !== 'image/jpeg') {
                    return json({ error: 'Only exported JPEG photos can be shared.' }, 415);
                }
                const seconds = Number(request.headers.get('x-share-expiry'));
                if (!EXPIRY_SECONDS.has(seconds)) {
                    return json({ error: 'Choose an expiry of 15 minutes, 1 hour, or 24 hours.' }, 400);
                }
                if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES) {
                    return json({ error: 'This photo is too large for a link. Please download it instead.' }, 413);
                }
                const bytes = new Uint8Array(await request.arrayBuffer());
                if (bytes.length > MAX_PHOTO_BYTES) {
                    return json({ error: 'This photo is too large for a link. Please download it instead.' }, 413);
                }
                if (bytes.length < 5 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
                    bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
                    return json({ error: 'The exported photo could not be read. Please try exporting again.' }, 400);
                }

                const token = randomBytes(32).toString('base64url');
                const expiresAt = now() + seconds * 1000;
                await getStore().set(token, bytes.buffer, { metadata: { expiresAt } });
                return json({ url: `/shared.html#${token}`, expiresAt: new Date(expiresAt).toISOString() }, 201);
            }

            if (request.method === 'GET') {
                const token = url.searchParams.get('id') || '';
                if (!TOKEN_PATTERN.test(token)) return json({ error: 'This photo link is invalid.' }, 404);
                const store = getStore();
                const entry = await store.getWithMetadata(token, { type: 'arrayBuffer' });
                if (!entry) return json({ error: 'This photo link has expired or is no longer available.' }, 404);

                const expiresAt = entry.metadata.expiresAt;
                if (!Number.isFinite(expiresAt) || expiresAt <= now()) {
                    await store.delete(token);
                    return json({ error: 'This photo link has expired.' }, 410);
                }

                return new Response(entry.data, {
                    headers: {
                        ...PRIVATE_HEADERS,
                        'Content-Type': 'image/jpeg',
                        'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="SNAPBOOTH.jpg"`,
                        'X-Share-Expires-At': new Date(expiresAt).toISOString()
                    }
                });
            }

            return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
        } catch {
            return json({ error: 'Photo links are temporarily unavailable. You can still download or share your photo directly.' }, 503);
        }
    };
}

export async function cleanupExpiredShares(store, now = Date.now()) {
    let deleted = 0;
    for await (const page of store.list({ paginate: true })) {
        for (let offset = 0; offset < page.blobs.length; offset += 25) {
            await Promise.all(page.blobs.slice(offset, offset + 25).map(async ({ key }) => {
                const entry = await store.getMetadata(key);
                if (entry && (!Number.isFinite(entry.metadata.expiresAt) || entry.metadata.expiresAt <= now)) {
                    await store.delete(key);
                    deleted++;
                }
            }));
        }
    }
    return deleted;
}
