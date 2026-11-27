/**
 * GET  /api/bots  → { bots: [...] | null }  Public. null means "use the built-in Free Bots".
 * PUT  /api/bots  → { bots: [...] }         Owner only (Deriv login checked). Body: { bots: [...] }
 */
import { readBots, requireAdmin, sendError, TRequest, TResponse, writeBots } from './_lib/free-bots-server';

export default async function handler(req: TRequest, res: TResponse) {
    try {
        if (req.method === 'GET') {
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ bots: await readBots() });
            return;
        }
        if (req.method === 'PUT') {
            await requireAdmin(req);
            const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { bots?: unknown };
            res.status(200).json({ bots: await writeBots(body?.bots) });
            return;
        }
        res.setHeader('Allow', 'GET, PUT');
        res.status(405).json({ error: 'Method not allowed.' });
    } catch (error) {
        sendError(res, error);
    }
}
