/**
 * Server side of the owner-managed Free Bots (Vercel functions in /api).
 *
 * Settings in the Vercel project:
 * - BLOB_READ_WRITE_TOKEN: added by Vercel when a Blob store is connected to the project.
 * - VINDOLAR_ADMIN_LOGINIDS: the owner's Deriv account IDs, comma separated.
 */
import { del, list, put } from '@vercel/blob';
import {
    BOT_COLLECTIONS,
    checkBotFileXml,
    isAdminAccount,
    isBotCollection,
    sanitizeBots,
    TBotCollection,
    TStoredBot,
} from '../../src/services/vindolar/free-bots-schema';

const BOT_FILES_PREFIX = 'bot-files/';
/** A file uploaded but not yet in any list is kept this long (the owner may still be publishing it). */
const UNUSED_FILE_GRACE_MS = 60 * 60 * 1000;

// Free Bots keep their original folder so lists saved before collections existed still load.
const prefixFor = (collection: TBotCollection) =>
    collection === 'free' ? 'free-bots/bots-' : `bot-lists/${collection}/bots-`;

/** Which list a request is about (?collection=…), "free" when not given. */
export const collectionFromQuery = (
    query: Record<string, string | string[] | undefined> | undefined
): TBotCollection => {
    const raw = query?.collection;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === '') return 'free';
    if (!isBotCollection(value)) throw new HttpError(400, 'Unknown bot list.');
    return value;
};
const ACCOUNTS_URL = process.env.DERIV_ACCOUNTS_URL || 'https://api.derivws.com/trading/v1/options/accounts';

export type TRequest = {
    method?: string;
    query?: Record<string, string | string[] | undefined>;
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
export const readBots = async (collection: TBotCollection = 'free'): Promise<TStoredBot[] | null> => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    const { blobs } = await list({ prefix: prefixFor(collection) });
    if (!blobs.length) return null;
    const latest = blobs.reduce((a, b) => (new Date(a.uploadedAt) > new Date(b.uploadedAt) ? a : b));
    // Every save gets a new file name, so this URL is never a stale cached copy.
    const response = await fetch(latest.url);
    if (!response.ok) throw new HttpError(502, 'Could not read the saved bots.');
    return (await response.json()) as TStoredBot[];
};

export const writeBots = async (input: unknown, collection: TBotCollection = 'free'): Promise<TStoredBot[]> => {
    assertStorage();
    let bots: TStoredBot[];
    try {
        bots = sanitizeBots(input);
    } catch (e) {
        throw new HttpError(400, (e as Error).message);
    }
    const prefix = prefixFor(collection);
    const saved = await put(`${prefix}${Date.now()}.json`, JSON.stringify(bots), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: true,
    });
    // Keep only the newest file.
    const { blobs } = await list({ prefix });
    const old = blobs.filter(blob => blob.url !== saved.url).map(blob => blob.url);
    if (old.length) await del(old);
    return bots;
};

/** Stores one uploaded Bot Builder file and returns its public URL (an unguessable name). */
export const writeBotFile = async (name: unknown, xml: unknown): Promise<string> => {
    assertStorage();
    let clean: string;
    try {
        clean = checkBotFileXml(xml);
    } catch (e) {
        throw new HttpError(400, (e as Error).message);
    }
    const slug =
        String(name ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'bot';
    const saved = await put(`${BOT_FILES_PREFIX}${slug}.xml`, clean, {
        access: 'public',
        contentType: 'application/xml',
        addRandomSuffix: true,
    });
    return saved.url;
};

/**
 * Deletes uploaded bot files that no list uses any more (a bot was deleted or its file replaced).
 * Skips everything if any list can't be read, and keeps files younger than an hour.
 */
export const cleanupBotFiles = async (now = Date.now()) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return 0;
    const lists = await Promise.all(BOT_COLLECTIONS.map(collection => readBots(collection)));
    const in_use = new Set(lists.flatMap(bots => (bots ?? []).map(bot => bot.xml_url).filter(Boolean)));
    const unused: string[] = [];
    let cursor: string | undefined;
    do {
        // eslint-disable-next-line no-await-in-loop
        const page = await list({ prefix: BOT_FILES_PREFIX, cursor });
        page.blobs.forEach(blob => {
            const age = now - new Date(blob.uploadedAt).getTime();
            if (!in_use.has(blob.url) && age > UNUSED_FILE_GRACE_MS) unused.push(blob.url);
        });
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (unused.length) await del(unused);
    return unused.length;
};

export const sendError = (res: TResponse, error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Something went wrong.';
    if (!(error instanceof HttpError)) console.error(error);
    res.status(status).json({ error: message });
};
