/** GET /api/me → { is_admin, storage_ready }. Send the Deriv login token as "Authorization: Bearer …". */
import { isAdminRequest, sendError, TRequest, TResponse } from './_lib/free-bots-server';

export default async function handler(req: TRequest, res: TResponse) {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const is_admin = Boolean(process.env.VINDOLAR_ADMIN_LOGINIDS) && (await isAdminRequest(req));
        res.status(200).json({ is_admin, storage_ready: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
    } catch (error) {
        sendError(res, error);
    }
}
