/**
 * Free Bots managed by the site owner. Shared by the browser and the /api functions, so this
 * file must not import anything.
 */

export type TBotConfigValue = string | number;

export type TStoredBot = {
    id: string;
    name: string;
    description: string;
    contract_label: string;
    market_label: string;
    /** A bundled strategy template filled in with these settings (see bot-loader). */
    config?: Record<string, TBotConfigValue>;
    /** Or a full Bot Builder workspace, saved from the builder. */
    xml?: string;
    /** Hidden ("blocked") bots are only listed for the owner. */
    hidden?: boolean;
    updated_at?: number;
};

export const FREE_BOT_LIMITS = {
    max_bots: 100,
    max_text: 60,
    max_description: 400,
    max_config_keys: 30,
    max_xml_chars: 400_000,
};

const cleanText = (value: unknown, field: string, max: number, required = true) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) throw new Error(`${field} is required.`);
    if (text.length > max) throw new Error(`${field} must be at most ${max} characters.`);
    return text;
};

/** Checks one bot from the owner and returns a clean copy. Throws with a readable message. */
export const sanitizeBot = (input: unknown, now = Date.now()): TStoredBot => {
    if (!input || typeof input !== 'object') throw new Error('Each bot must be an object.');
    const raw = input as Record<string, unknown>;
    const { max_text, max_description, max_config_keys, max_xml_chars } = FREE_BOT_LIMITS;

    const id = cleanText(raw.id, 'Bot id', max_text);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Bot id "${id}" may only use a-z, 0-9 and "-".`);
    const name = cleanText(raw.name, 'Name', max_text);
    const bot: TStoredBot = {
        id,
        name,
        description: cleanText(raw.description, `Description of "${name}"`, max_description, false),
        contract_label: cleanText(raw.contract_label, `Contract of "${name}"`, max_text, false),
        market_label: cleanText(raw.market_label, `Market of "${name}"`, max_text, false),
        updated_at: typeof raw.updated_at === 'number' && Number.isFinite(raw.updated_at) ? raw.updated_at : now,
    };
    if (raw.hidden === true) bot.hidden = true;

    if (raw.config !== undefined) {
        if (!raw.config || typeof raw.config !== 'object' || Array.isArray(raw.config)) {
            throw new Error(`Settings of "${name}" must be an object.`);
        }
        const entries = Object.entries(raw.config as Record<string, unknown>);
        if (entries.length > max_config_keys) throw new Error(`"${name}" has too many settings.`);
        bot.config = {};
        entries.forEach(([key, value]) => {
            if (!/^[a-z_][a-z0-9_]*$/i.test(key)) throw new Error(`Setting "${key}" of "${name}" is not valid.`);
            if (typeof value === 'number' && Number.isFinite(value)) bot.config![key] = value;
            else if (typeof value === 'string' && value.length <= max_text) bot.config![key] = value;
            else throw new Error(`Setting "${key}" of "${name}" must be a number or short text.`);
        });
    }

    if (raw.xml !== undefined) {
        if (typeof raw.xml !== 'string' || !raw.xml.trim().startsWith('<xml')) {
            throw new Error(`"${name}" must contain a Bot Builder workspace (XML).`);
        }
        if (raw.xml.length > max_xml_chars) throw new Error(`"${name}" is too large to save.`);
        bot.xml = raw.xml;
    }

    if (!bot.config && !bot.xml) throw new Error(`"${name}" needs strategy settings or a Bot Builder workspace.`);
    return bot;
};

/** Checks the whole list the owner wants to publish. */
export const sanitizeBots = (input: unknown, now = Date.now()): TStoredBot[] => {
    if (!Array.isArray(input)) throw new Error('Bots must be a list.');
    if (input.length > FREE_BOT_LIMITS.max_bots) {
        throw new Error(`At most ${FREE_BOT_LIMITS.max_bots} bots can be published.`);
    }
    const bots = input.map(bot => sanitizeBot(bot, now));
    const ids = new Set<string>();
    bots.forEach(bot => {
        if (ids.has(bot.id)) throw new Error(`Two bots share the id "${bot.id}".`);
        ids.add(bot.id);
    });
    return bots;
};

/** Owner login IDs come from a comma-separated setting, e.g. "CR123456,DOT9521510". */
export const parseAdminIds = (setting: string | undefined) =>
    (setting ?? '')
        .split(',')
        .map(id => id.trim().toUpperCase())
        .filter(Boolean);

export const isAdminAccount = (account_ids: string[], setting: string | undefined) => {
    const admins = parseAdminIds(setting);
    return account_ids.some(id => admins.includes(String(id).trim().toUpperCase()));
};
