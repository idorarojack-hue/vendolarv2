/**
 * GET  /api/bots?collection=free|premium|premium-ai  → { bots: [...] | null }  Public.
 *      null means "nothing published yet" (the page then shows its built-in bots).
 * PUT  /api/bots?collection=…  → { bots: [...] }  Owner only (Deriv login checked). Body: { bots: [...] }
 */
import {
    collectionFromQuery,
    readBots,
    requireAdmin,
    sendError,
    TRequest,
    TResponse,
    writeBots,
} from './_lib/free-bots-server';

export default async function handler(req: TRequest, res: TResponse) {
    try {
        const collection = collectionFromQuery(req.query);
        if (req.method === 'GET') {
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ bots: await readBots(collection) });
            return;
        }
        if (req.method === 'PUT') {
            await requireAdmin(req);
            const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { bots?: unknown };
            res.status(200).json({ bots: await writeBots(body?.bots, collection) });
            return;
        }
        res.setHeader('Allow', 'GET, PUT');
        res.status(405).json({ error: 'Method not allowed.' });
    } catch (error) {
        sendError(res, error);
    }
}
