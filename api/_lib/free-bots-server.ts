/**
 * Server side of the owner-managed Free Bots (Vercel functions in /api).
 *
 * Settings in the Vercel project:
 * - BLOB_READ_WRITE_TOKEN: added by Vercel when a Blob store is connected to the project.
 * - VINDOLAR_ADMIN_LOGINIDS: the owner's Deriv account IDs, comma separated.
 */
import { del, list, put } from '@vercel/blob';
import { isAdminAccount, sanitizeBots, TStoredBot } from '../../src/services/vindolar/free-bots-schema';

const PREFIX = 'free-bots/bots-';
const ACCOUNTS_URL = process.env.DERIV_ACCOUNTS_URL || 'https://api.derivws.com/trading/v1/options/accounts';

export type TRequest = {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
};

export type TResponse = {
    status: (code: number) => TResponse;
    setHeader: (name: string, value: string) => void;
    json: (body: unknown) => void;
};

export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const bearerToken = (req: TRequest) => {
    const header = req.headers.authorization ?? req.headers.Authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const match = /^Bearer\s+(.+)$/i.exec(value ?? '');
    return match?.[1]?.trim() ?? '';
};

/** Asks Deriv which accounts this login token belongs to. */
export const accountIdsForToken = async (token: string, fetchImpl: typeof fetch = fetch): Promise<string[]> => {
    if (!token) throw new HttpError(401, 'Please log in.');
    const response = await fetchImpl(ACCOUNTS_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 || response.status === 403) throw new HttpError(401, 'Your login has expired.');
    if (!response.ok) throw new HttpError(502, 'Could not check your Deriv login.');
    const data = (await response.json()) as { data?: { account_id?: string }[] };
    return (data?.data ?? []).map(account => String(account.account_id ?? '')).filter(Boolean);
};

export const isAdminRequest = async (req: TRequest, fetchImpl: typeof fetch = fetch) => {
    const token = bearerToken(req);
    if (!token) return false;
    const ids = await accountIdsForToken(token, fetchImpl);
    return isAdminAccount(ids, process.env.VINDOLAR_ADMIN_LOGINIDS);
};

export const requireAdmin = async (req: TRequest, fetchImpl: typeof fetch = fetch) => {
    if (!process.env.VINDOLAR_ADMIN_LOGINIDS) throw new HttpError(503, 'No owner account is set up yet.');
    if (!(await isAdminRequest(req, fetchImpl))) throw new HttpError(403, 'Only the site owner can change bots.');
};

const assertStorage = () => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'Bot storage is not connected yet.');
};

/** The published list, or null when the owner has never published (the site then uses its built-in bots). */
export const readBots = async (): Promise<TStoredBot[] | null> => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    const { blobs } = await list({ prefix: PREFIX });
    if (!blobs.length) return null;
    const latest = blobs.reduce((a, b) => (new Date(a.uploadedAt) > new Date(b.uploadedAt) ? a : b));
    // Every save gets a new file name, so this URL is never a stale cached copy.
    const response = await fetch(latest.url);
    if (!response.ok) throw new HttpError(502, 'Could not read the saved bots.');
    return (await response.json()) as TStoredBot[];
};

export const writeBots = async (input: unknown): Promise<TStoredBot[]> => {
    assertStorage();
    let bots: TStoredBot[];
    try {
        bots = sanitizeBots(input);
    } catch (e) {
        throw new HttpError(400, (e as Error).message);
    }
    const saved = await put(`${PREFIX}${Date.now()}.json`, JSON.stringify(bots), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: true,
    });
    // Keep only the newest file.
    const { blobs } = await list({ prefix: PREFIX });
    const old = blobs.filter(blob => blob.url !== saved.url).map(blob => blob.url);
    if (old.length) await del(old);
    return bots;
};

export const sendError = (res: TResponse, error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Something went wrong.';
    if (!(error instanceof HttpError)) console.error(error);
    res.status(status).json({ error: message });
};
