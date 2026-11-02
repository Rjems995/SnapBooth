import { getStore } from '@netlify/blobs';
import { createPhotoSharingHandler } from '../../server/photo-sharing.mjs';

export default createPhotoSharingHandler({
    getStore: () => getStore({ name: 'snapbooth-photo-shares', consistency: 'strong' })
});

export const config = {
    path: '/api/shares',
    rateLimit: { action: 'rate_limit', aggregateBy: ['ip'], windowSize: 60, windowLimit: 30 }
};
