/**
 * @jest-environment node
 */
import { del, list, put } from '@vercel/blob';
import { checkBotFileXml, isBotFileUrl, sanitizeBots } from '../../../src/services/vindolar/free-bots-schema';
import { cleanupBotFiles, writeBotFile } from '../free-bots-server';

jest.mock('@vercel/blob', () => ({ list: jest.fn(), put: jest.fn(), del: jest.fn() }));

const XML = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="trade_definition"></block></xml>';
const FILE_URL = 'https://abc123.public.blob.vercel-storage.com/bot-files/premium-x.xml';

describe('bot file checks', () => {
    it('accepts a Deriv Bot file and strips a byte-order mark', () => {
        expect(checkBotFileXml(`﻿  ${XML}\n`)).toBe(XML);
    });

    it('rejects other files with a readable reason', () => {
        expect(() => checkBotFileXml('{"json": true}')).toThrow('not a Deriv Bot file');
        expect(() => checkBotFileXml('<xml></xml>')).toThrow('no blocks');
        expect(() => checkBotFileXml(`<xml><block>${'x'.repeat(2_000_001)}</block></xml>`)).toThrow('too large');
    });

    it('only lets lists point at files in this site storage', () => {
        expect(isBotFileUrl(FILE_URL)).toBe(true);
        expect(isBotFileUrl('https://evil.example.com/bot.xml')).toBe(false);
        expect(isBotFileUrl('http://abc.public.blob.vercel-storage.com/x.xml')).toBe(false);
        const bot = { id: 'premium-x', name: 'Premium X', description: '', contract_label: '', market_label: '' };
        expect(sanitizeBots([{ ...bot, xml_url: FILE_URL }])[0].xml_url).toBe(FILE_URL);
        expect(() => sanitizeBots([{ ...bot, xml_url: 'https://evil.example.com/bot.xml' }])).toThrow(
            "this site's storage"
        );
    });
});

describe('bot file storage', () => {
    const saved_token = process.env.BLOB_READ_WRITE_TOKEN;
    beforeEach(() => {
        process.env.BLOB_READ_WRITE_TOKEN = 'test';
        jest.clearAllMocks();
    });
    afterEach(() => {
        process.env.BLOB_READ_WRITE_TOKEN = saved_token;
    });

    it('stores a checked file under bot-files/ with an unguessable name', async () => {
        (put as jest.Mock).mockResolvedValue({ url: FILE_URL });
        await expect(writeBotFile('Premium X!', XML)).resolves.toBe(FILE_URL);
        expect(put).toHaveBeenCalledWith(
            'bot-files/premium-x.xml',
            XML,
            expect.objectContaining({ access: 'public', addRandomSuffix: true })
        );
    });

    it('refuses a file that is not a bot', async () => {
        await expect(writeBotFile('x', 'hello')).rejects.toMatchObject({ status: 400 });
        expect(put).not.toHaveBeenCalled();
    });

    it('deletes only old files that no list uses', async () => {
        const now = Date.parse('2026-11-27T12:00:00Z');
        const list_file = {
            url: 'https://abc.public.blob.vercel-storage.com/bot-lists/premium/bots-1.json',
            uploadedAt: '2026-11-27T11:00:00Z',
        };
        (list as jest.Mock).mockImplementation(async ({ prefix }: { prefix: string }) => {
            if (prefix === 'bot-files/') {
                return {
                    blobs: [
                        { url: FILE_URL, uploadedAt: '2026-11-20T00:00:00Z' }, // in use
                        {
                            url: 'https://abc.public.blob.vercel-storage.com/bot-files/old.xml',
                            uploadedAt: '2026-11-20T00:00:00Z',
                        },
                        {
                            url: 'https://abc.public.blob.vercel-storage.com/bot-files/new.xml',
                            uploadedAt: '2026-11-27T11:30:00Z',
                        },
                    ],
                    hasMore: false,
                };
            }
            return { blobs: prefix === 'bot-lists/premium/bots-' ? [list_file] : [] };
        });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ id: 'premium-x', name: 'Premium X', xml_url: FILE_URL }],
        }) as unknown as typeof fetch;

        await expect(cleanupBotFiles(now)).resolves.toBe(1);
        expect(del).toHaveBeenCalledWith(['https://abc.public.blob.vercel-storage.com/bot-files/old.xml']);
    });
});
