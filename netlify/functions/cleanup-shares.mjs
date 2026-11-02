import { getStore } from '@netlify/blobs';
import { cleanupExpiredShares } from '../../server/photo-sharing.mjs';

export default async function cleanup() {
    const store = getStore({ name: 'snapbooth-photo-shares', consistency: 'strong' });
    const deleted = await cleanupExpiredShares(store);
    return Response.json({ deleted });
}
