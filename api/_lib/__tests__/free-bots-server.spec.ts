/**
 * @jest-environment node
 */
import { del, list, put } from '@vercel/blob';
import { isAdminAccount, sanitizeBots } from '../../../src/services/vindolar/free-bots-schema';
import { accountIdsForToken, HttpError, readBots, requireAdmin, writeBots } from '../free-bots-server';

jest.mock('@vercel/blob', () => ({ list: jest.fn(), put: jest.fn(), del: jest.fn() }));

const bot = {
    id: 'even-steady',
    name: 'Even Steady',
    description: 'Buys Even.',
    contract_label: 'Even · 1 tick',
    market_label: 'Volatility 100 Index',
    config: { strategy: 'MARTINGALE', symbol: 'R_100', stake: 1 },
};

const accountsFetch = (ids: string[], status = 200) =>
    jest.fn().mockResolvedValue({
        ok: status === 200,
        status,
        json: async () => ({ data: ids.map(account_id => ({ account_id })) }),
    }) as unknown as typeof fetch;

const request = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('free bots schema', () => {
    it('accepts a template bot and an XML bot', () => {
        const bots = sanitizeBots([bot, { ...bot, id: 'from-builder', config: undefined, xml: '<xml></xml>' }], 5);
        expect(bots).toHaveLength(2);
        expect(bots[0].updated_at).toBe(5);
        expect(bots[1].xml).toBe('<xml></xml>');
    });

    it('rejects bad input with a readable reason', () => {
        expect(() => sanitizeBots([{ ...bot, id: 'Bad Id' }])).toThrow('may only use');
        expect(() => sanitizeBots([{ ...bot, config: undefined }])).toThrow('needs strategy settings');
        expect(() => sanitizeBots([bot, bot])).toThrow('share the id');
        expect(() => sanitizeBots([{ ...bot, xml: '<script>' }])).toThrow('Bot Builder workspace');
        expect(() => sanitizeBots([{ ...bot, config: { stake: { nested: 1 } } }])).toThrow('number or short text');
    });

    it('matches owner IDs without caring about case or spaces', () => {
        expect(isAdminAccount(['dot123'], ' CR1 , DOT123 ')).toBe(true);
        expect(isAdminAccount(['CR9'], 'CR1,DOT123')).toBe(false);
        expect(isAdminAccount(['CR1'], undefined)).toBe(false);
    });
});

describe('owner check', () => {
    const saved_env = process.env.VINDOLAR_ADMIN_LOGINIDS;
    afterEach(() => {
        process.env.VINDOLAR_ADMIN_LOGINIDS = saved_env;
    });

    it('reads account IDs for a login token', async () => {
        await expect(accountIdsForToken('t', accountsFetch(['CR1', 'DOT2']))).resolves.toEqual(['CR1', 'DOT2']);
        await expect(accountIdsForToken('t', accountsFetch([], 401))).rejects.toMatchObject({ status: 401 });
    });

    it('lets only the owner change bots', async () => {
        process.env.VINDOLAR_ADMIN_LOGINIDS = 'CR1';
        await expect(requireAdmin(request('t'), accountsFetch(['CR1']))).resolves.toBeUndefined();
        await expect(requireAdmin(request('t'), accountsFetch(['CR2']))).rejects.toMatchObject({ status: 403 });
        await expect(requireAdmin(request(), accountsFetch(['CR1']))).rejects.toMatchObject({ status: 403 });
    });

    it('refuses changes until an owner is configured', async () => {
        delete process.env.VINDOLAR_ADMIN_LOGINIDS;
        await expect(requireAdmin(request('t'), accountsFetch(['CR1']))).rejects.toBeInstanceOf(HttpError);
    });
});

describe('bot storage', () => {
    const saved_token = process.env.BLOB_READ_WRITE_TOKEN;
    beforeEach(() => {
        process.env.BLOB_READ_WRITE_TOKEN = 'test';
        jest.clearAllMocks();
    });
    afterEach(() => {
        process.env.BLOB_READ_WRITE_TOKEN = saved_token;
    });

    it('returns null before anything is published', async () => {
        (list as jest.Mock).mockResolvedValue({ blobs: [] });
        await expect(readBots()).resolves.toBeNull();
    });

    it('reads the newest saved file', async () => {
        (list as jest.Mock).mockResolvedValue({
            blobs: [
                { url: 'https://blob/old', uploadedAt: '2026-01-01T00:00:00Z' },
                { url: 'https://blob/new', uploadedAt: '2026-02-01T00:00:00Z' },
            ],
        });
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => [bot] });
        global.fetch = fetchMock as unknown as typeof fetch;
        await expect(readBots()).resolves.toEqual([bot]);
        expect(fetchMock).toHaveBeenCalledWith('https://blob/new');
    });

    it('saves a checked list and removes older files', async () => {
        (put as jest.Mock).mockResolvedValue({ url: 'https://blob/new' });
        (list as jest.Mock).mockResolvedValue({ blobs: [{ url: 'https://blob/new' }, { url: 'https://blob/old' }] });
        const bots = await writeBots([bot]);
        expect(bots[0].id).toBe('even-steady');
        expect(put).toHaveBeenCalledWith(
            expect.stringMatching(/^free-bots\/bots-/),
            expect.any(String),
            expect.any(Object)
        );
        expect(del).toHaveBeenCalledWith(['https://blob/old']);
    });

    it('rejects an invalid list without saving', async () => {
        await expect(writeBots([{ id: 'x' }])).rejects.toMatchObject({ status: 400 });
        expect(put).not.toHaveBeenCalled();
    });
});
