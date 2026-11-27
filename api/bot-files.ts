/**
 * POST /api/bot-files  → { url }  Owner only (Deriv login checked). Body: { name, xml }
 * Stores one Deriv Bot (.xml) file so a bot list can point at it instead of carrying the whole file.
 */
import { requireAdmin, sendError, TRequest, TResponse, writeBotFile } from './_lib/free-bots-server';

export default async function handler(req: TRequest, res: TResponse) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            res.status(405).json({ error: 'Method not allowed.' });
            return;
        }
        await requireAdmin(req);
        const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
            name?: unknown;
            xml?: unknown;
        };
        res.status(200).json({ url: await writeBotFile(body?.name, body?.xml) });
    } catch (error) {
        sendError(res, error);
    }
}
