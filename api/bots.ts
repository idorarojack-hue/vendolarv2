/**
 * GET  /api/bots?collection=free|premium|premium-ai  → { bots: [...] | null }  Public.
 *      null means "nothing published yet" (the page then shows its built-in bots).
 * PUT  /api/bots?collection=…  → { bots: [...] }  Owner only (Deriv login checked). Body: { bots: [...] }
 */
import {
    cleanupBotFiles,
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
            const bots = await writeBots(body?.bots, collection);
            // Housekeeping: remove bot files no list uses any more. Never fails the save.
            await cleanupBotFiles().catch(error => console.error('bot file cleanup failed', error));
            res.status(200).json({ bots });
            return;
        }
        res.setHeader('Allow', 'GET, PUT');
        res.status(405).json({ error: 'Method not allowed.' });
    } catch (error) {
        sendError(res, error);
    }
}
