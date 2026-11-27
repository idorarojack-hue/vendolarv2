import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { loadBot, STRATEGY_LABELS, TBotConfig, TStrategyKey } from '@/services/vindolar/bot-loader';
import { builtInBots } from '@/services/vindolar/built-in-bots';
import { fetchPublishedBots, publishBots, useOwner } from '@/services/vindolar/free-bots-api';
import { BOT_COLLECTIONS, TBotCollection, TStoredBot } from '@/services/vindolar/free-bots-schema';
import { LabelPairedArrowUpRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { consumePendingPublish } from './publish-request';
import './bot-library.scss';

export const COLLECTION_NAMES: Record<TBotCollection, string> = {
    free: 'Free Bots',
    premium: 'Premium Bots',
    'premium-ai': 'Premium AI Bots',
};

/** The tab each list lives on (where "Load bot" errors send the user back to). */
const COLLECTION_TABS: Record<TBotCollection, number> = {
    free: DBOT_TABS.FREE_BOTS,
    premium: DBOT_TABS.QUICK_BOT,
    'premium-ai': DBOT_TABS.PATTERN_BOTS,
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
    onSave: (bot: TStoredBot, destination: TBotCollection) => void;
}) => {
    const [draft, setDraft] = React.useState<TDraft>(() => toDraft(collection, bot));
    const [problem, setProblem] = React.useState('');
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
            updated_at: Date.now(),
        };
        if (draft.use_workspace) {
            const xml = currentWorkspaceXml();
            if (!xml) return setProblem(localize('Open the Bot Builder and build or load the bot there first.'));
            next.xml = xml;
        } else if (bot?.xml) {
            next.xml = bot.xml;
        }
        if (!next.xml && bot?.config) {
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
        onSave(next, draft.destination);
    };

    return (
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
                            {BOT_COLLECTIONS.map(id => (
                                <option key={id} value={id}>
                                    {localize(COLLECTION_NAMES[id])}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {bot ? (
                    <label className='vd-fb-admin__check'>
                        <input type='checkbox' checked={draft.use_workspace} onChange={set('use_workspace')} />
                        <span>{localize('Replace this bot with what is open in the Bot Builder now')}</span>
                    </label>
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
        </div>
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
        setMessage(null);
        setLoading(bot.id);
        try {
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            if (bot.xml) {
                const workspace = (window as any).Blockly?.derivWorkspace;
                if (!workspace) {
                    throw new Error(localize('The Bot Builder is still starting. Please wait a moment and try again.'));
                }
                await load({
                    block_string: bot.xml,
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

    const saveBot = async (bot: TStoredBot, destination: TBotCollection) => {
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
                    <button
                        type='button'
                        className='vd-fb-admin__button vd-fb-admin__button--primary'
                        disabled={!can_edit}
                        onClick={() => setEditing('new')}
                    >
                        {localize('+ Add bot from Bot Builder')}
                    </button>
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
                        ? localize('No bots here yet. Build one in the Bot Builder, then press "+ Add bot".')
                        : empty_text}
                </p>
            )}

            <div className='vd-page__grid vd-preset-grid'>
                {bots.map((bot, index) => {
                    const strategy = bot.config?.strategy as TStrategyKey | undefined;
                    return (
                        <article
                            key={bot.id}
                            className={classNames('vd-card vd-preset', { 'vd-preset--hidden': bot.hidden })}
                        >
                            <div className='vd-preset__top'>
                                <span className='vd-field__label'>
                                    {bot.hidden
                                        ? localize('Hidden from users')
                                        : localize(card_label ?? COLLECTION_NAMES[collection])}
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
                                disabled={!!loading}
                                onClick={() => loadIntoBuilder(bot)}
                            >
                                {loading === bot.id ? localize('Loading…') : localize('Load bot')}
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
