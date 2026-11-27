/**
 * Browser side of the owner-managed Free Bots: reads the published list from /api/bots and,
 * for the owner, publishes changes. The server checks the Deriv login on every change.
 *
 * Local development has no /api server. There, setting localStorage `vd_dev_owner` to "1"
 * turns on owner mode and keeps published bots in this browser only, so the screens can be tried.
 */
import React from 'react';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { TBotCollection, TStoredBot } from './free-bots-schema';

const DEV_OWNER_KEY = 'vd_dev_owner';
const devBotsKey = (collection: TBotCollection) =>
    collection === 'free' ? 'vd_dev_free_bots' : `vd_dev_bots_${collection}`;
const botsUrl = (collection: TBotCollection) => `/api/bots?collection=${collection}`;

const isDevOwner = () => {
    if (process.env.NODE_ENV === 'production') return false;
    try {
        return localStorage.getItem(DEV_OWNER_KEY) === '1';
    } catch {
        return false;
    }
};

const authHeaders = (): Record<string, string> => {
    const token = OAuthTokenExchangeService.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const readJson = async (response: Response) => {
    const type = response.headers.get('content-type') ?? '';
    // Without an /api server (local dev), the site answers with index.html instead of JSON.
    if (!type.includes('application/json')) return null;
    return response.json();
};

/** Published bots, or null to use the built-in list. Never throws. */
export const fetchPublishedBots = async (collection: TBotCollection = 'free'): Promise<TStoredBot[] | null> => {
    if (isDevOwner()) {
        try {
            const saved = localStorage.getItem(devBotsKey(collection));
            return saved ? (JSON.parse(saved) as TStoredBot[]) : null;
        } catch {
            return null;
        }
    }
    try {
        const response = await fetch(botsUrl(collection), { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await readJson(response);
        return Array.isArray(data?.bots) ? data.bots : null;
    } catch {
        return null;
    }
};

/** Owner only. Replaces the published list; rejects with the server's reason. */
export const publishBots = async (bots: TStoredBot[], collection: TBotCollection = 'free'): Promise<TStoredBot[]> => {
    if (isDevOwner()) {
        localStorage.setItem(devBotsKey(collection), JSON.stringify(bots));
        return bots;
    }
    const response = await fetch(botsUrl(collection), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ bots }),
    });
    const data = await readJson(response);
    if (!response.ok || !data) throw new Error(data?.error ?? 'Your changes could not be saved.');
    return data.bots;
};

/**
 * Owner only. Stores a bot's Bot Builder file on its own and returns where the bot should point
 * (`xml_url`). Local development keeps the file inside the bot instead (`xml`).
 */
export const storeBotFile = async (name: string, xml: string): Promise<Pick<TStoredBot, 'xml' | 'xml_url'>> => {
    if (isDevOwner()) return { xml };
    const response = await fetch('/api/bot-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name, xml }),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.url) throw new Error(data?.error ?? `"${name}" could not be uploaded.`);
    return { xml_url: data.url };
};

const xml_cache = new Map<string, string>();

/** The Bot Builder XML of a bot, wherever it is kept. */
export const fetchBotXml = async (bot: Pick<TStoredBot, 'xml' | 'xml_url' | 'name'>): Promise<string | null> => {
    if (bot.xml) return bot.xml;
    if (!bot.xml_url) return null;
    const cached = xml_cache.get(bot.xml_url);
    if (cached) return cached;
    const response = await fetch(bot.xml_url);
    if (!response.ok) throw new Error(`The file of "${bot.name}" could not be downloaded.`);
    const xml = await response.text();
    xml_cache.set(bot.xml_url, xml);
    return xml;
};

export type TOwnerStatus = { is_admin: boolean; storage_ready: boolean; checked: boolean };

let owner_promise: Promise<TOwnerStatus> | null = null;
let owner_token: string | null = null;

const checkOwner = async (): Promise<TOwnerStatus> => {
    if (isDevOwner()) return { is_admin: true, storage_ready: true, checked: true };
    const headers = authHeaders();
    if (!headers.Authorization) return { is_admin: false, storage_ready: false, checked: true };
    try {
        const response = await fetch('/api/me', { headers, cache: 'no-store' });
        const data = response.ok ? await readJson(response) : null;
        return { is_admin: Boolean(data?.is_admin), storage_ready: Boolean(data?.storage_ready), checked: true };
    } catch {
        return { is_admin: false, storage_ready: false, checked: true };
    }
};

/** Whether the logged-in Deriv user is the site owner. Checked once per login. */
export const getOwnerStatus = () => {
    const token = OAuthTokenExchangeService.getAccessToken();
    if (!owner_promise || token !== owner_token) {
        owner_token = token;
        owner_promise = checkOwner();
    }
    return owner_promise;
};

/** React hook for {@link getOwnerStatus}; re-checks when the login changes. */
export const useOwner = (login_key?: string | null): TOwnerStatus => {
    const [status, setStatus] = React.useState<TOwnerStatus>({ is_admin: false, storage_ready: false, checked: false });
    React.useEffect(() => {
        let active = true;
        getOwnerStatus().then(result => active && setStatus(result));
        return () => {
            active = false;
        };
    }, [login_key]);
    return status;
};
