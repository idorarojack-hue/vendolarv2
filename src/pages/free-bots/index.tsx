import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { loadBot, STRATEGY_LABELS, TBotConfig, TStrategyKey } from '@/services/vindolar/bot-loader';
import { fetchPublishedBots, publishBots, useOwner } from '@/services/vindolar/free-bots-api';
import { TStoredBot } from '@/services/vindolar/free-bots-schema';
import { LabelPairedArrowUpRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { consumePendingPublish } from './publish-request';
import '@/components/vindolar/vindolar.scss';
import '../analysis-tools/analysis-tools.scss';
import './free-bots-admin.scss';

/** Built-in free bots, used until the owner publishes a list of their own. */
export const BUILT_IN_BOTS: TStoredBot[] = [
    {
        id: 'even-steady',
        name: 'Even Steady',
        description:
            'Buys Even on every run. Doubles the stake after a loss (capped at max stake), resets after a win.',
        contract_label: 'Even · 1 tick',
        market_label: 'Volatility 100 Index',
        config: {
            strategy: 'MARTINGALE',
            symbol: 'R_100',
            tradetype: 'evenodd',
            contract: 'DIGITEVEN',
            stake: 1,
            duration: 1,
            profit: 5,
            loss: 15,
            size: 2,
            max_stake: 8,
        },
    },
    {
        id: 'odd-steady',
        name: 'Odd Steady',
        description: 'Buys Odd on every run with the same capped martingale as Even Steady.',
        contract_label: 'Odd · 1 tick',
        market_label: 'Volatility 100 (1s) Index',
        config: {
            strategy: 'MARTINGALE',
            symbol: '1HZ100V',
            tradetype: 'evenodd',
            contract: 'DIGITODD',
            stake: 1,
            duration: 1,
            profit: 5,
            loss: 15,
            size: 2,
            max_stake: 8,
        },
    },
    {
        id: 'over-two-grinder',
        name: 'Over 2 Grinder',
        description:
            "Buys Over 2 using Oscar's Grind: raises the stake by one unit only after wins, aiming for one unit of profit per cycle.",
        contract_label: 'Over 2 · 1 tick',
        market_label: 'Volatility 50 Index',
        config: {
            strategy: 'OSCARS_GRIND',
            symbol: 'R_50',
            tradetype: 'overunder',
            contract: 'DIGITOVER',
            prediction: 2,
            stake: 0.5,
            duration: 1,
            profit: 5,
            loss: 10,
            max_stake: 5,
        },
    },
    {
        id: 'under-seven-grinder',
        name: 'Under 7 Grinder',
        description: "Buys Under 7 using Oscar's Grind on Volatility 25.",
        contract_label: 'Under 7 · 1 tick',
        market_label: 'Volatility 25 Index',
        config: {
            strategy: 'OSCARS_GRIND',
            symbol: 'R_25',
            tradetype: 'overunder',
            contract: 'DIGITUNDER',
            prediction: 7,
            stake: 0.5,
            duration: 1,
            profit: 5,
            loss: 10,
            max_stake: 5,
        },
    },
    {
        id: 'rise-stepper',
        name: 'Rise Stepper',
        description: "Buys Rise for 5 ticks using D'Alembert: adds one unit after a loss, removes one after a win.",
        contract_label: 'Rise · 5 ticks',
        market_label: 'Volatility 100 (1s) Index',
        config: {
            strategy: 'D_ALEMBERT',
            symbol: '1HZ100V',
            tradetype: 'callput',
            contract: 'CALL',
            stake: 1,
            duration: 5,
            profit: 5,
            loss: 15,
            unit: 1,
            max_stake: 6,
        },
    },
    {
        id: 'fall-stepper',
        name: 'Fall Stepper',
        description: "Buys Fall for 5 ticks using D'Alembert, the mirror of Rise Stepper.",
        contract_label: 'Fall · 5 ticks',
        market_label: 'Volatility 75 (1s) Index',
        config: {
            strategy: 'D_ALEMBERT',
            symbol: '1HZ75V',
            tradetype: 'callput',
            contract: 'PUT',
            stake: 1,
            duration: 5,
            profit: 5,
            loss: 15,
            unit: 1,
            max_stake: 6,
        },
    },
    {
        id: 'sequence-even',
        name: 'Sequence 1-3-2-6',
        description: 'Buys Even following the 1-3-2-6 stake sequence after wins and starts over after any loss.',
        contract_label: 'Even · 1 tick',
        market_label: 'Volatility 75 Index',
        config: {
            strategy: 'STRATEGY_1_3_2_6',
            symbol: 'R_75',
            tradetype: 'evenodd',
            contract: 'DIGITEVEN',
            stake: 0.5,
            duration: 1,
            profit: 5,
            loss: 10,
        },
    },
    {
        id: 'differs-climber',
        name: 'Differs Climber',
        description: 'Buys Differs 5 with Reverse Martingale: doubles the stake after a win, resets after a loss.',
        contract_label: 'Differs 5 · 1 tick',
        market_label: 'Volatility 50 (1s) Index',
        config: {
            strategy: 'REVERSE_MARTINGALE',
            symbol: '1HZ50V',
            tradetype: 'matchesdiffers',
            contract: 'DIGITDIFF',
            prediction: 5,
            stake: 1,
            duration: 1,
            profit: 5,
            loss: 10,
            size: 2,
        },
    },
];

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
};

const toDraft = (bot?: TStoredBot): TDraft => ({
    id: bot?.id,
    name: bot?.name ?? '',
    description: bot?.description ?? '',
    market_label: bot?.market_label ?? '',
    contract_label: bot?.contract_label ?? '',
    use_workspace: !bot,
    stake: bot?.config?.stake !== undefined ? String(bot.config.stake) : '',
    profit: bot?.config?.profit !== undefined ? String(bot.config.profit) : '',
    loss: bot?.config?.loss !== undefined ? String(bot.config.loss) : '',
});

/** Add or edit one bot (owner only). */
const BotEditor = ({
    bot,
    busy,
    onCancel,
    onSave,
}: {
    bot?: TStoredBot;
    busy: boolean;
    onCancel: () => void;
    onSave: (bot: TStoredBot) => void;
}) => {
    const [draft, setDraft] = React.useState<TDraft>(() => toDraft(bot));
    const [problem, setProblem] = React.useState('');
    const is_template = Boolean(bot?.config);
    const set = (key: keyof TDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
        onSave(next);
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

const FreeBots = observer(() => {
    const { quick_strategy, dashboard, client } = useStore();
    const owner = useOwner(client?.loginid);
    const [published, setPublished] = React.useState<TStoredBot[] | null>(null);
    const [loading, setLoading] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
    const [editing, setEditing] = React.useState<TStoredBot | 'new' | null>(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let active = true;
        fetchPublishedBots().then(bots => active && setPublished(bots));
        return () => {
            active = false;
        };
    }, []);

    // "Publish to Free Bots" from the Bot Builder toolbar opens the add form here.
    React.useEffect(() => {
        if (owner.is_admin && consumePendingPublish()) setEditing('new');
    }, [owner.is_admin]);

    const all_bots = published ?? BUILT_IN_BOTS;
    const bots = owner.is_admin ? all_bots : all_bots.filter(bot => !bot.hidden);

    const loadIntoBuilder = async (bot: TStoredBot) => {
        setMessage(null);
        setLoading(bot.id);
        try {
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            if (bot.xml) {
                const workspace = (window as any).Blockly?.derivWorkspace;
                if (!workspace)
                    throw new Error(localize('The Bot Builder is still starting. Please wait a moment and try again.'));
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
            dashboard.setActiveTab(DBOT_TABS.FREE_BOTS);
            setMessage({ tone: 'error', text: e?.message ?? localize('The bot could not be loaded.') });
        } finally {
            setLoading(null);
        }
    };

    const publish = async (next: TStoredBot[], done: string) => {
        setBusy(true);
        setMessage(null);
        try {
            setPublished(await publishBots(next));
            setEditing(null);
            setMessage({ tone: 'ok', text: done });
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('Your changes could not be saved.') });
        } finally {
            setBusy(false);
        }
    };

    const saveBot = (bot: TStoredBot) => {
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
        if (!window.confirm(localize('Delete "{{name}}" for everyone? This cannot be undone.', { name: bot.name })))
            return;
        publish(
            all_bots.filter(b => b.id !== bot.id),
            localize('"{{name}}" deleted.', { name: bot.name })
        );
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Bots')}
                title={localize('Free Bots')}
                subtitle={localize(
                    'Ready-made bots. Loading one opens it in the Bot Builder, where you can read every block before pressing Run.'
                )}
            />
            <p className='vd-page__note'>
                {localize(
                    'Every bot has a take profit and stop loss already set. Start on your demo account, and remember that stake-sizing systems change how you win or lose, not your odds.'
                )}
            </p>

            {owner.is_admin && (
                <div className='vd-fb-admin__bar'>
                    <span className='vd-fb-admin__badge'>{localize('Owner')}</span>
                    <p>
                        {owner.storage_ready
                            ? localize('You can add, edit, hide and delete bots. Changes go live for everyone.')
                            : localize(
                                  'Bot storage is not connected yet. Connect a Blob store to this project in Vercel to publish changes.'
                              )}
                    </p>
                    <button
                        type='button'
                        className='vd-fb-admin__button vd-fb-admin__button--primary'
                        disabled={busy || !owner.storage_ready}
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

            {bots.length === 0 && <p className='vd-page__note'>{localize('No bots are published right now.')}</p>}

            <div className='vd-page__grid vd-preset-grid'>
                {bots.map(bot => {
                    const strategy = bot.config?.strategy as TStrategyKey | undefined;
                    return (
                        <article
                            key={bot.id}
                            className={classNames('vd-card vd-preset', { 'vd-preset--hidden': bot.hidden })}
                        >
                            <div className='vd-preset__top'>
                                <span className='vd-field__label'>
                                    {bot.hidden ? localize('Hidden from users') : localize('Free bot')}
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
                                    <button
                                        type='button'
                                        disabled={busy || !owner.storage_ready}
                                        onClick={() => setEditing(bot)}
                                    >
                                        {localize('Edit')}
                                    </button>
                                    <button
                                        type='button'
                                        disabled={busy || !owner.storage_ready}
                                        onClick={() => toggleHidden(bot)}
                                    >
                                        {bot.hidden ? localize('Unhide') : localize('Hide')}
                                    </button>
                                    <button
                                        type='button'
                                        className='is-danger'
                                        disabled={busy || !owner.storage_ready}
                                        onClick={() => removeBot(bot)}
                                    >
                                        {localize('Delete')}
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
                    bot={editing === 'new' ? undefined : editing}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={saveBot}
                />
            )}
        </div>
    );
});

export default FreeBots;
