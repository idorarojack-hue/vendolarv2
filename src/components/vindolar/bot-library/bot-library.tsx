import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import ReactDOM from 'react-dom';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { readBotFiles, TBotFile } from '@/services/vindolar/bot-file';
import { loadBot, STRATEGY_LABELS, TBotConfig, TStrategyKey } from '@/services/vindolar/bot-loader';
import { builtInBots } from '@/services/vindolar/built-in-bots';
import {
    fetchBotXml,
    fetchPublishedBots,
    publishBots,
    storeBotFile,
    useOwner,
} from '@/services/vindolar/free-bots-api';
import { PUBLISH_COLLECTIONS, TBotCollection, TStoredBot } from '@/services/vindolar/free-bots-schema';
import { LabelPairedArrowUpRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { consumePendingPublish } from './publish-request';
import './bot-library.scss';

export const COLLECTION_NAMES: Record<TBotCollection, string> = {
    free: 'Free Bots',
    premium: 'Premium Bots',
    'premium-ai': 'Premium AI Bots',
    'premium-ai-presets': 'Premium AI presets',
};

/** The tab each list lives on (where "Load bot" errors send the user back to). */
const COLLECTION_TABS: Record<TBotCollection, number> = {
    free: DBOT_TABS.FREE_BOTS,
    premium: DBOT_TABS.QUICK_BOT,
    'premium-ai': DBOT_TABS.PATTERN_BOTS,
    'premium-ai-presets': DBOT_TABS.PATTERN_BOTS,
};

export const tabForCollection = (collection: TBotCollection) => COLLECTION_TABS[collection];

/** Current Bot Builder workspace as XML text, or null if the builder hasn't started. */
const currentWorkspaceXml = (): string | null => {
    const blockly = (window as any).Blockly;
    const workspace = blockly?.derivWorkspace;
    if (!workspace || !blockly?.Xml) return null;
    if (!workspace.getAllBlocks?.(false)?.length) return null;
    const dom = blockly.Xml.workspaceToDom(workspace);
    dom.setAttribute('is_dbot', 'true');
    dom.setAttribute('collection', 'false');
    return blockly.Xml.domToText(dom);
};

const newBotId = (name: string) =>
    `${
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'bot'
    }-${Math.random().toString(36).slice(2, 6)}`;

type TDraft = {
    id?: string;
    name: string;
    description: string;
    market_label: string;
    contract_label: string;
    use_workspace: boolean;
    stake: string;
    profit: string;
    loss: string;
    destination: TBotCollection;
};

const toDraft = (collection: TBotCollection, bot?: TStoredBot): TDraft => ({
    id: bot?.id,
    name: bot?.name ?? '',
    description: bot?.description ?? '',
    market_label: bot?.market_label ?? '',
    contract_label: bot?.contract_label ?? '',
    use_workspace: !bot,
    stake: bot?.config?.stake !== undefined ? String(bot.config.stake) : '',
    profit: bot?.config?.profit !== undefined ? String(bot.config.profit) : '',
    loss: bot?.config?.loss !== undefined ? String(bot.config.loss) : '',
    destination: collection,
});

/** Add or edit one bot (owner only). */
const BotEditor = ({
    collection,
    bot,
    busy,
    onCancel,
    onSave,
}: {
    collection: TBotCollection;
    bot?: TStoredBot;
    busy: boolean;
    onCancel: () => void;
    onSave: (bot: TStoredBot, destination: TBotCollection, new_xml?: string) => void;
}) => {
    const [draft, setDraft] = React.useState<TDraft>(() => toDraft(collection, bot));
    const [problem, setProblem] = React.useState('');
    const [replacement, setReplacement] = React.useState<TBotFile | null>(null);

    const pickReplacement = async (files: FileList | null) => {
        setProblem('');
        if (!files?.length) return;
        const [file] = await readBotFiles([files[0]]);
        if (file.problems.length) {
            setReplacement(null);
            setProblem(`${file.file_name}: ${file.problems.join(' ')}`);
            return;
        }
        setReplacement(file);
        setDraft(prev => ({
            ...prev,
            use_workspace: false,
            market_label: prev.market_label || file.market_label,
            contract_label: prev.contract_label || file.contract_label,
        }));
    };
    const is_template = Boolean(bot?.config);
    const set =
        (key: keyof TDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
            setDraft(prev => ({ ...prev, [key]: value }));
        };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setProblem('');
        const name = draft.name.trim();
        if (!name) return setProblem(localize('Give the bot a name.'));
        const next: TStoredBot = {
            id: draft.id ?? newBotId(name),
            name,
            description: draft.description.trim(),
            market_label: draft.market_label.trim(),
            contract_label: draft.contract_label.trim(),
            hidden: bot?.hidden,
            blocked: bot?.blocked,
            updated_at: Date.now(),
        };
        // A new bot file (uploaded or from the Bot Builder) is stored by the library before publishing.
        let new_xml: string | undefined;
        if (replacement) {
            new_xml = replacement.xml;
        } else if (draft.use_workspace) {
            const xml = currentWorkspaceXml();
            if (!xml) return setProblem(localize('Open the Bot Builder and build or load the bot there first.'));
            new_xml = xml;
        } else if (bot?.xml_url) {
            next.xml_url = bot.xml_url;
        } else if (bot?.xml) {
            next.xml = bot.xml;
        }
        if (!new_xml && !next.xml && !next.xml_url && bot?.config) {
            const numbers = { stake: draft.stake, profit: draft.profit, loss: draft.loss };
            const parsed: Record<string, number> = {};
            for (const [key, text] of Object.entries(numbers)) {
                const value = Number(text);
                if (!Number.isFinite(value) || value <= 0) {
                    return setProblem(localize('Stake, take profit and stop loss must be numbers above 0.'));
                }
                parsed[key] = value;
            }
            next.config = { ...bot.config, ...parsed };
        }
        onSave(next, draft.destination, new_xml);
    };

    // Rendered on <body>: the tool pages are their own layer, which would put the cards on top of the form.
    return ReactDOM.createPortal(
        <div className='vd-fb-admin__backdrop' role='presentation' onClick={onCancel}>
            <form
                className='vd-fb-admin__dialog'
                role='dialog'
                aria-modal='true'
                aria-label={bot ? localize('Edit bot') : localize('Add bot')}
                onClick={e => e.stopPropagation()}
                onSubmit={submit}
            >
                <h3>{bot ? localize('Edit bot') : localize('Add bot from the Bot Builder')}</h3>
                <label>
                    <span>{localize('Name')}</span>
                    <input value={draft.name} maxLength={60} onChange={set('name')} autoFocus />
                </label>
                <label>
                    <span>{localize('Description')}</span>
                    <textarea value={draft.description} maxLength={400} rows={3} onChange={set('description')} />
                </label>
                <div className='vd-fb-admin__row'>
                    <label>
                        <span>{localize('Market')}</span>
                        <input
                            value={draft.market_label}
                            maxLength={60}
                            placeholder={localize('e.g. Volatility 100 Index')}
                            onChange={set('market_label')}
                        />
                    </label>
                    <label>
                        <span>{localize('Contract')}</span>
                        <input
                            value={draft.contract_label}
                            maxLength={60}
                            placeholder={localize('e.g. Even · 1 tick')}
                            onChange={set('contract_label')}
                        />
                    </label>
                </div>
                {is_template && !draft.use_workspace && (
                    <div className='vd-fb-admin__row vd-fb-admin__row--three'>
                        <label>
                            <span>{localize('Stake')}</span>
                            <input inputMode='decimal' value={draft.stake} onChange={set('stake')} />
                        </label>
                        <label>
                            <span>{localize('Take profit')}</span>
                            <input inputMode='decimal' value={draft.profit} onChange={set('profit')} />
                        </label>
                        <label>
                            <span>{localize('Stop loss')}</span>
                            <input inputMode='decimal' value={draft.loss} onChange={set('loss')} />
                        </label>
                    </div>
                )}
                {!bot && (
                    <label>
                        <span>{localize('Publish to')}</span>
                        <select value={draft.destination} onChange={set('destination')}>
                            {PUBLISH_COLLECTIONS.map(id => (
                                <option key={id} value={id}>
                                    {localize(COLLECTION_NAMES[id])}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {bot ? (
                    <>
                        <label className='vd-fb-admin__check'>
                            <input
                                type='checkbox'
                                checked={draft.use_workspace}
                                onChange={e => {
                                    set('use_workspace')(e);
                                    if (e.target.checked) setReplacement(null);
                                }}
                            />
                            <span>{localize('Replace this bot with what is open in the Bot Builder now')}</span>
                        </label>
                        <label className='vd-fb-admin__file'>
                            <span>{localize('Or replace it with a bot file (.xml)')}</span>
                            <input
                                type='file'
                                accept='.xml,text/xml,application/xml'
                                onChange={e => pickReplacement(e.target.files)}
                            />
                            {replacement && (
                                <small>
                                    {localize('New file: {{file}}', { file: replacement.file_name })}
                                    {replacement.warnings.length ? ` — ${replacement.warnings.join(' ')}` : ''}
                                </small>
                            )}
                        </label>
                    </>
                ) : (
                    <p className='vd-fb-admin__hint'>
                        {localize(
                            'The bot open in the Bot Builder right now is saved with every block exactly as it is.'
                        )}
                    </p>
                )}
                {problem && (
                    <p className='vd-fb-admin__problem' role='alert'>
                        {problem}
                    </p>
                )}
                <div className='vd-fb-admin__actions'>
                    <button type='button' className='vd-fb-admin__button' onClick={onCancel}>
                        {localize('Cancel')}
                    </button>
                    <button type='submit' className='vd-fb-admin__button vd-fb-admin__button--primary' disabled={busy}>
                        {busy ? localize('Saving…') : localize('Save and publish')}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
};

type TUploadRow = TBotFile & { include: boolean; description: string };

/** Review uploaded .xml bot files, then publish them all to one list (owner only). */
const BotUploadDialog = ({
    collection,
    files,
    busy,
    progress,
    onCancel,
    onPublish,
}: {
    collection: TBotCollection;
    files: TBotFile[];
    busy: boolean;
    progress: string;
    onCancel: () => void;
    onPublish: (rows: TUploadRow[], destination: TBotCollection) => void;
}) => {
    const [rows, setRows] = React.useState<TUploadRow[]>(() =>
        files.map(file => ({ ...file, include: !file.problems.length, description: '' }))
    );
    const [destination, setDestination] = React.useState<TBotCollection>(collection);
    const chosen = rows.filter(row => row.include && !row.problems.length);
    const update = (index: number, patch: Partial<TUploadRow>) =>
        setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    return ReactDOM.createPortal(
        <div className='vd-fb-admin__backdrop' role='presentation' onClick={busy ? undefined : onCancel}>
            <form
                className='vd-fb-admin__dialog vd-fb-upload'
                role='dialog'
                aria-modal='true'
                aria-label={localize('Upload bot files')}
                onClick={e => e.stopPropagation()}
                onSubmit={e => {
                    e.preventDefault();
                    if (chosen.length && chosen.every(row => row.name.trim())) onPublish(chosen, destination);
                }}
            >
                <h3>{localize('Upload bot files')}</h3>
                <p className='vd-fb-admin__hint'>
                    {localize(
                        'Check each bot, add a short description, then publish. Users load the file into the Bot Builder exactly as it is.'
                    )}
                </p>
                <ul className='vd-fb-upload__list'>
                    {rows.map((row, index) => (
                        <li
                            // eslint-disable-next-line react/no-array-index-key
                            key={`${row.file_name}-${index}`}
                            className={classNames('vd-fb-upload__row', { 'is-off': !row.include })}
                        >
                            <label className='vd-fb-admin__check'>
                                <input
                                    type='checkbox'
                                    checked={row.include}
                                    disabled={busy || row.problems.length > 0}
                                    onChange={e => update(index, { include: e.target.checked })}
                                />
                                <span>{row.file_name}</span>
                            </label>
                            {row.problems.length > 0 ? (
                                <p className='vd-fb-admin__problem'>{row.problems.join(' ')}</p>
                            ) : (
                                <>
                                    <div className='vd-fb-admin__row'>
                                        <label>
                                            <span>{localize('Name')}</span>
                                            <input
                                                value={row.name}
                                                maxLength={60}
                                                disabled={busy || !row.include}
                                                onChange={e => update(index, { name: e.target.value })}
                                            />
                                        </label>
                                        <label>
                                            <span>{localize('Description')}</span>
                                            <input
                                                value={row.description}
                                                maxLength={400}
                                                disabled={busy || !row.include}
                                                placeholder={localize('What it trades and when')}
                                                onChange={e => update(index, { description: e.target.value })}
                                            />
                                        </label>
                                        <label>
                                            <span>{localize('Market')}</span>
                                            <input
                                                value={row.market_label}
                                                maxLength={60}
                                                disabled={busy || !row.include}
                                                onChange={e => update(index, { market_label: e.target.value })}
                                            />
                                        </label>
                                        <label>
                                            <span>{localize('Contract')}</span>
                                            <input
                                                value={row.contract_label}
                                                maxLength={60}
                                                disabled={busy || !row.include}
                                                onChange={e => update(index, { contract_label: e.target.value })}
                                            />
                                        </label>
                                    </div>
                                    {row.warnings.map(warning => (
                                        <p key={warning} className='vd-fb-upload__warning'>
                                            {warning}
                                        </p>
                                    ))}
                                </>
                            )}
                        </li>
                    ))}
                </ul>
                <label>
                    <span>{localize('Publish to')}</span>
                    <select
                        value={destination}
                        disabled={busy}
                        onChange={e => setDestination(e.target.value as TBotCollection)}
                    >
                        {PUBLISH_COLLECTIONS.map(id => (
                            <option key={id} value={id}>
                                {localize(COLLECTION_NAMES[id])}
                            </option>
                        ))}
                    </select>
                </label>
                {progress && <p className='vd-fb-admin__hint'>{progress}</p>}
                <div className='vd-fb-admin__actions'>
                    <button type='button' className='vd-fb-admin__button' disabled={busy} onClick={onCancel}>
                        {localize('Cancel')}
                    </button>
                    <button
                        type='submit'
                        className='vd-fb-admin__button vd-fb-admin__button--primary'
                        disabled={busy || !chosen.length || chosen.some(row => !row.name.trim())}
                    >
                        {busy
                            ? localize('Publishing…')
                            : chosen.length === 1
                              ? localize('Publish 1 bot')
                              : localize('Publish {{n}} bots', { n: chosen.length })}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
};

type TBotLibraryProps = {
    collection: TBotCollection;
    /** Heading above the list (Free Bots has its page title instead). */
    heading?: string;
    /** Shown to visitors when the list is empty; nothing is shown when omitted. */
    empty_text?: string;
    /** Badge on each card when it isn't one of the strategy templates. */
    card_label?: string;
};

/**
 * A list of bots the site owner manages. Everyone can load a bot into the Bot Builder; the
 * owner also gets Add (from the Bot Builder), Edit, Hide and Delete. Changes are saved through
 * /api/bots, which checks the owner's Deriv login.
 */
const BotLibrary = observer(({ collection, heading, empty_text, card_label }: TBotLibraryProps) => {
    const { quick_strategy, dashboard, client } = useStore();
    const owner = useOwner(client?.loginid);
    const [published, setPublished] = React.useState<TStoredBot[] | null>(null);
    const [ready, setReady] = React.useState(false);
    const [loading, setLoading] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
    const [editing, setEditing] = React.useState<TStoredBot | 'new' | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [uploads, setUploads] = React.useState<TBotFile[] | null>(null);
    const [upload_progress, setUploadProgress] = React.useState('');
    const file_input = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        let active = true;
        fetchPublishedBots(collection).then(bots => {
            if (!active) return;
            setPublished(bots);
            setReady(true);
        });
        return () => {
            active = false;
        };
    }, [collection]);

    // "Publish bot" in the Bot Builder toolbar opens the add form on the page it switched to.
    React.useEffect(() => {
        if (owner.is_admin && consumePendingPublish(collection)) setEditing('new');
    }, [owner.is_admin, collection]);

    const all_bots = published ?? builtInBots(collection);
    const bots = owner.is_admin ? all_bots : all_bots.filter(bot => !bot.hidden);
    const can_edit = owner.is_admin && owner.storage_ready && !busy;

    const loadIntoBuilder = async (bot: TStoredBot) => {
        if (bot.blocked && !owner.is_admin) {
            setMessage({ tone: 'error', text: localize('This bot is blocked by the site owner.') });
            return;
        }
        setMessage(null);
        setLoading(bot.id);
        try {
            const xml = await fetchBotXml(bot);
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            if (xml) {
                const workspace = (window as any).Blockly?.derivWorkspace;
                if (!workspace) {
                    throw new Error(localize('The Bot Builder is still starting. Please wait a moment and try again.'));
                }
                await load({
                    block_string: xml,
                    file_name: bot.name,
                    workspace,
                    from: save_types.LOCAL,
                    drop_event: {},
                    strategy_id: null,
                    showIncompatibleStrategyDialog: false,
                });
            } else if (bot.config) {
                await loadBot(quick_strategy, bot.config as unknown as TBotConfig);
            }
        } catch (e: any) {
            dashboard.setActiveTab(tabForCollection(collection));
            setMessage({ tone: 'error', text: e?.message ?? localize('The bot could not be loaded.') });
        } finally {
            setLoading(null);
        }
    };

    const publish = async (next: TStoredBot[], done: string, target: TBotCollection = collection) => {
        setBusy(true);
        setMessage(null);
        try {
            const saved = await publishBots(next, target);
            if (target === collection) setPublished(saved);
            setEditing(null);
            setMessage({ tone: 'ok', text: done });
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('Your changes could not be saved.') });
        } finally {
            setBusy(false);
        }
    };

    const saveBot = async (input: TStoredBot, destination: TBotCollection, new_xml?: string) => {
        let bot = input;
        if (new_xml) {
            setBusy(true);
            setMessage(null);
            try {
                const stored = await storeBotFile(bot.name, new_xml);
                bot = { ...bot, xml: stored.xml, xml_url: stored.xml_url, config: undefined };
                if (!bot.xml) delete bot.xml;
                if (!bot.xml_url) delete bot.xml_url;
            } catch (e: any) {
                setBusy(false);
                setMessage({ tone: 'error', text: e?.message ?? localize('The bot file could not be uploaded.') });
                return;
            }
        }
        if (destination !== collection) {
            // Publishing to another page's list: add it to the front of that list.
            const other = (await fetchPublishedBots(destination)) ?? builtInBots(destination);
            publish(
                [bot, ...other.filter(b => b.id !== bot.id)],
                localize('"{{name}}" published to {{list}}.', {
                    name: bot.name,
                    list: localize(COLLECTION_NAMES[destination]),
                }),
                destination
            );
            return;
        }
        const exists = all_bots.some(b => b.id === bot.id);
        const next = exists ? all_bots.map(b => (b.id === bot.id ? bot : b)) : [bot, ...all_bots];
        publish(
            next,
            exists
                ? localize('"{{name}}" updated.', { name: bot.name })
                : localize('"{{name}}" published.', { name: bot.name })
        );
    };

    const pickFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setMessage(null);
        setUploadProgress('');
        setUploads(await readBotFiles(files));
        if (file_input.current) file_input.current.value = '';
    };

    const publishUploads = async (rows: TUploadRow[], destination: TBotCollection) => {
        setBusy(true);
        setMessage(null);
        const added: TStoredBot[] = [];
        try {
            for (const [index, row] of rows.entries()) {
                setUploadProgress(
                    localize('Uploading {{n}} of {{total}}: {{name}}…', {
                        n: index + 1,
                        total: rows.length,
                        name: row.name,
                    })
                );
                // eslint-disable-next-line no-await-in-loop
                const stored = await storeBotFile(row.name.trim(), row.xml);
                added.push({
                    id: newBotId(row.name),
                    name: row.name.trim(),
                    description: row.description.trim(),
                    market_label: row.market_label.trim(),
                    contract_label: row.contract_label.trim(),
                    updated_at: Date.now(),
                    ...stored,
                });
            }
            setUploadProgress(localize('Publishing…'));
            const base =
                destination === collection
                    ? all_bots
                    : ((await fetchPublishedBots(destination)) ?? builtInBots(destination));
            const saved = await publishBots([...added, ...base], destination);
            if (destination === collection) setPublished(saved);
            setUploads(null);
            setMessage({
                tone: 'ok',
                text:
                    destination === collection
                        ? localize('{{n}} bot(s) published.', { n: added.length })
                        : localize('{{n}} bot(s) published to {{list}}.', {
                              n: added.length,
                              list: localize(COLLECTION_NAMES[destination]),
                          }),
            });
        } catch (e: any) {
            setUploadProgress('');
            setMessage({ tone: 'error', text: e?.message ?? localize('The bots could not be published.') });
        } finally {
            setBusy(false);
        }
    };

    const toggleBlocked = (bot: TStoredBot) => {
        const next = all_bots.map(b =>
            b.id === bot.id ? { ...b, blocked: !b.blocked || undefined, updated_at: Date.now() } : b
        );
        publish(
            next,
            bot.blocked
                ? localize('"{{name}}" can be used again.', { name: bot.name })
                : localize('"{{name}}" is blocked: users can see it but not load it.', { name: bot.name })
        );
    };

    const toggleHidden = (bot: TStoredBot) => {
        const next = all_bots.map(b => (b.id === bot.id ? { ...b, hidden: !b.hidden, updated_at: Date.now() } : b));
        publish(
            next,
            bot.hidden
                ? localize('"{{name}}" is visible to everyone again.', { name: bot.name })
                : localize('"{{name}}" is now hidden from users.', { name: bot.name })
        );
    };

    const removeBot = (bot: TStoredBot) => {
        if (!window.confirm(localize('Delete "{{name}}" for everyone? This cannot be undone.', { name: bot.name }))) {
            return;
        }
        publish(
            all_bots.filter(b => b.id !== bot.id),
            localize('"{{name}}" deleted.', { name: bot.name })
        );
    };

    const moveBot = (bot: TStoredBot, step: -1 | 1) => {
        const index = all_bots.findIndex(b => b.id === bot.id);
        const target = index + step;
        if (index < 0 || target < 0 || target >= all_bots.length) return;
        const next = [...all_bots];
        [next[index], next[target]] = [next[target], next[index]];
        publish(next, localize('Order saved.'));
    };

    // Nothing to show a visitor: keep the page clean.
    if (!owner.is_admin && ready && bots.length === 0 && !empty_text) return null;

    return (
        <section className='vd-bot-library' aria-label={heading ?? localize(COLLECTION_NAMES[collection])}>
            {heading && <h2 className='vd-bot-library__heading'>{heading}</h2>}

            {owner.is_admin && (
                <div className='vd-fb-admin__bar'>
                    <span className='vd-fb-admin__badge'>{localize('Owner')}</span>
                    <p>
                        {owner.storage_ready
                            ? localize(
                                  'You can add, edit, reorder, hide and delete the bots in {{list}}. Changes go live for everyone.',
                                  { list: localize(COLLECTION_NAMES[collection]) }
                              )
                            : localize(
                                  'Bot storage is not connected yet. Connect a Blob store to this project in Vercel to publish changes.'
                              )}
                    </p>
                    <div className='vd-fb-admin__bar-actions'>
                        <button
                            type='button'
                            className='vd-fb-admin__button vd-fb-admin__button--primary'
                            disabled={!can_edit}
                            onClick={() => file_input.current?.click()}
                        >
                            {localize('⬆ Upload bot files (.xml)')}
                        </button>
                        <button
                            type='button'
                            className='vd-fb-admin__button'
                            disabled={!can_edit}
                            onClick={() => setEditing('new')}
                        >
                            {localize('+ Add bot from Bot Builder')}
                        </button>
                        <input
                            ref={file_input}
                            type='file'
                            accept='.xml,text/xml,application/xml'
                            multiple
                            hidden
                            onChange={e => pickFiles(e.target.files)}
                        />
                    </div>
                </div>
            )}

            {message && (
                <p
                    role={message.tone === 'error' ? 'alert' : 'status'}
                    className={`vd-message vd-message--${message.tone === 'error' ? 'error' : 'success'}`}
                >
                    {message.text}
                </p>
            )}

            {ready && bots.length === 0 && (
                <p className='vd-page__note'>
                    {owner.is_admin
                        ? localize(
                              'No bots here yet. Upload your bot files (.xml), or build one in the Bot Builder and press "+ Add bot".'
                          )
                        : empty_text}
                </p>
            )}

            <div className='vd-page__grid vd-preset-grid'>
                {bots.map((bot, index) => {
                    const strategy = bot.config?.strategy as TStrategyKey | undefined;
                    return (
                        <article
                            key={bot.id}
                            className={classNames('vd-card vd-preset', {
                                'vd-preset--hidden': bot.hidden,
                                'vd-preset--blocked': bot.blocked,
                            })}
                        >
                            <div className='vd-preset__top'>
                                <span className='vd-field__label'>
                                    {bot.hidden
                                        ? localize('Hidden from users')
                                        : localize(card_label ?? COLLECTION_NAMES[collection])}
                                    {bot.blocked && <em className='vd-preset__blocked'>{localize('Blocked')}</em>}
                                </span>
                                <span className='vd-card__badge vd-card__badge--teal'>
                                    {strategy && STRATEGY_LABELS[strategy]
                                        ? localize(STRATEGY_LABELS[strategy])
                                        : localize('Custom bot')}
                                </span>
                            </div>
                            <h3 className='vd-card__title'>{bot.name}</h3>
                            <p className='vd-card__text'>{bot.description}</p>
                            <dl className='vd-preset__facts'>
                                <div>
                                    <dt>{localize('Market')}</dt>
                                    <dd>{bot.market_label || '—'}</dd>
                                </div>
                                <div>
                                    <dt>{localize('Contract')}</dt>
                                    <dd>{bot.contract_label || '—'}</dd>
                                </div>
                                {bot.config && (
                                    <div>
                                        <dt>{localize('Stake / TP / SL')}</dt>
                                        <dd>
                                            {bot.config.stake} / {bot.config.profit} / {bot.config.loss}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                            <button
                                type='button'
                                className='vd-primary-button vd-preset__open'
                                disabled={!!loading || (bot.blocked && !owner.is_admin)}
                                title={bot.blocked ? localize('This bot is blocked by the site owner.') : undefined}
                                onClick={() => loadIntoBuilder(bot)}
                            >
                                {loading === bot.id
                                    ? localize('Loading…')
                                    : bot.blocked && !owner.is_admin
                                      ? localize('Blocked')
                                      : localize('Load bot')}
                                <LabelPairedArrowUpRightCaptionRegularIcon
                                    height='16px'
                                    width='16px'
                                    fill='currentColor'
                                />
                            </button>
                            {owner.is_admin && (
                                <div className='vd-fb-admin__card-actions'>
                                    <button type='button' disabled={!can_edit} onClick={() => setEditing(bot)}>
                                        {localize('Edit')}
                                    </button>
                                    <button type='button' disabled={!can_edit} onClick={() => toggleHidden(bot)}>
                                        {bot.hidden ? localize('Unhide') : localize('Hide')}
                                    </button>
                                    <button type='button' disabled={!can_edit} onClick={() => toggleBlocked(bot)}>
                                        {bot.blocked ? localize('Unblock') : localize('Block')}
                                    </button>
                                    <button
                                        type='button'
                                        className='is-danger'
                                        disabled={!can_edit}
                                        onClick={() => removeBot(bot)}
                                    >
                                        {localize('Delete')}
                                    </button>
                                    <button
                                        type='button'
                                        aria-label={localize('Move earlier')}
                                        title={localize('Move earlier')}
                                        disabled={!can_edit || index === 0}
                                        onClick={() => moveBot(bot, -1)}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type='button'
                                        aria-label={localize('Move later')}
                                        title={localize('Move later')}
                                        disabled={!can_edit || index === bots.length - 1}
                                        onClick={() => moveBot(bot, 1)}
                                    >
                                        ↓
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            {uploads && (
                <BotUploadDialog
                    collection={collection}
                    files={uploads}
                    busy={busy}
                    progress={upload_progress}
                    onCancel={() => setUploads(null)}
                    onPublish={publishUploads}
                />
            )}

            {editing && (
                <BotEditor
                    // A new key per bot resets the form when switching between bots.
                    key={editing === 'new' ? 'new' : editing.id}
                    collection={collection}
                    bot={editing === 'new' ? undefined : editing}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={saveBot}
                />
            )}
        </section>
    );
});

export default BotLibrary;
