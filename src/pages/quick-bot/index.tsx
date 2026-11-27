import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import BotLibrary from '@/components/vindolar/bot-library/bot-library';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { DBOT_TABS } from '@/constants/bot-contents';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { loadBot, STRATEGY_LABELS, TBotConfig, TBotTradeType, TStrategyKey } from '@/services/vindolar/bot-loader';
import { localize } from '@deriv-com/translations';

const TRADE_TYPES: {
    id: TBotTradeType;
    label: string;
    contracts: { value: string; label: string }[];
    has_digit: boolean;
}[] = [
    {
        id: 'callput',
        label: 'Rise/Fall',
        contracts: [
            { value: 'CALL', label: 'Rise' },
            { value: 'PUT', label: 'Fall' },
        ],
        has_digit: false,
    },
    {
        id: 'evenodd',
        label: 'Even/Odd',
        contracts: [
            { value: 'DIGITEVEN', label: 'Even' },
            { value: 'DIGITODD', label: 'Odd' },
        ],
        has_digit: false,
    },
    {
        id: 'overunder',
        label: 'Over/Under',
        contracts: [
            { value: 'DIGITOVER', label: 'Over' },
            { value: 'DIGITUNDER', label: 'Under' },
        ],
        has_digit: true,
    },
    {
        id: 'matchesdiffers',
        label: 'Matches/Differs',
        contracts: [
            { value: 'DIGITMATCH', label: 'Matches' },
            { value: 'DIGITDIFF', label: 'Differs' },
        ],
        has_digit: true,
    },
];

const STRATEGY_HELP: Record<TStrategyKey, string> = {
    MARTINGALE: 'Multiplies the stake by the size after each loss; resets after a win.',
    REVERSE_MARTINGALE: 'Multiplies the stake by the size after each win; resets after a loss.',
    D_ALEMBERT: 'Adds one unit to the stake after a loss; removes one after a win.',
    REVERSE_D_ALEMBERT: 'Adds one unit after a win; removes one after a loss.',
    OSCARS_GRIND: 'Raises the stake by one unit after wins, aiming for one unit of profit per cycle.',
    STRATEGY_1_3_2_6: 'Follows the 1-3-2-6 stake sequence after wins; starts over after a loss.',
};

const DEFAULT: TBotConfig = {
    strategy: 'MARTINGALE',
    symbol: '1HZ100V',
    tradetype: 'evenodd',
    contract: 'DIGITEVEN',
    prediction: 4,
    stake: 1,
    duration: 1,
    profit: 5,
    loss: 10,
    size: 2,
    unit: 1,
    max_stake: 8,
};

const QuickBot = observer(() => {
    const { quick_strategy, dashboard, client } = useStore();
    const [config, setConfig] = usePersistentState<TBotConfig>('vd_quick_bot', DEFAULT);
    const [use_max, setUseMax] = usePersistentState('vd_quick_bot_use_max', true);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [real_ok, setRealOk] = React.useState(false);
    const update = (patch: Partial<TBotConfig>) => setConfig(previous => ({ ...previous, ...patch }));

    const trade_type = TRADE_TYPES.find(t => t.id === config.tradetype) ?? TRADE_TYPES[1];
    const is_real = client.is_logged_in && !client.is_virtual;
    const uses_size = config.strategy === 'MARTINGALE' || config.strategy === 'REVERSE_MARTINGALE';
    const uses_unit = config.strategy === 'D_ALEMBERT' || config.strategy === 'REVERSE_D_ALEMBERT';
    const digit_max = config.contract === 'DIGITOVER' ? 8 : 9;
    const digit_min = config.contract === 'DIGITUNDER' ? 1 : 0;

    const problems: string[] = [];
    if (config.stake < 0.35) problems.push(localize('Stake must be at least 0.35.'));
    if (!(config.profit > 0)) problems.push(localize('Set a take profit above 0.'));
    if (!(config.loss > 0)) problems.push(localize('Set a stop loss above 0.'));
    if (use_max && (config.max_stake ?? 0) < config.stake)
        problems.push(localize('Max stake must be at least the stake.'));

    const open = async (action: 'LOAD' | 'RUN') => {
        setError(null);
        if (problems.length) return;
        if (action === 'RUN' && is_real && !real_ok) {
            setError(localize('Tick the real-money box first, or switch to your demo account.'));
            return;
        }
        setBusy(true);
        try {
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            await loadBot(
                quick_strategy,
                {
                    ...config,
                    prediction: trade_type.has_digit
                        ? Math.min(Math.max(config.prediction ?? 4, digit_min), digit_max)
                        : undefined,
                    duration: Math.max(config.duration, 1),
                    max_stake: use_max ? config.max_stake : undefined,
                },
                action
            );
        } catch (e: any) {
            dashboard.setActiveTab(DBOT_TABS.QUICK_BOT);
            setError(e?.message ?? localize('The bot could not be created.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Bots')}
                title={localize('Premium Bots')}
                subtitle={localize(
                    'Build a bot from a simple form. It opens in the Bot Builder, where you can check or change every block.'
                )}
            />
            {/* Ready-made premium bots the owner publishes; hidden when empty. */}
            <BotLibrary collection='premium' heading={localize('Premium bot library')} card_label='Premium bot' />

            <div className='vd-page__columns'>
                <section className='vd-card'>
                    <h3 className='vd-card__title'>{localize('Trade parameters')}</h3>
                    <div className='vd-row'>
                        <MarketSelect value={config.symbol} onChange={symbol => update({ symbol })} />
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize('Trade type')}</span>
                            <select
                                className='vd-select'
                                value={config.tradetype}
                                onChange={e => {
                                    const next = TRADE_TYPES.find(t => t.id === e.target.value) ?? TRADE_TYPES[1];
                                    update({
                                        tradetype: next.id,
                                        contract: next.contracts[0].value,
                                        duration: next.id === 'callput' ? 5 : 1,
                                    });
                                }}
                            >
                                {TRADE_TYPES.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {localize(t.label)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className='vd-number'>
                        <span className='vd-field__label'>{localize('Purchase')}</span>
                        <div className='vd-chip-select'>
                            {trade_type.contracts.map(c => (
                                <button
                                    key={c.value}
                                    type='button'
                                    className={classNames({ 'is-active': config.contract === c.value })}
                                    onClick={() => update({ contract: c.value })}
                                >
                                    {localize(c.label)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className='vd-row'>
                        {trade_type.has_digit && (
                            <NumberField
                                label={localize('Prediction digit')}
                                value={config.prediction ?? 4}
                                min={digit_min}
                                max={digit_max}
                                decimals={0}
                                onChange={prediction => update({ prediction })}
                            />
                        )}
                        <NumberField
                            label={localize('Duration (ticks)')}
                            value={config.duration}
                            min={1}
                            max={10}
                            decimals={0}
                            onChange={duration => update({ duration })}
                        />
                        <NumberField
                            label={localize('Stake')}
                            unit='USD'
                            value={config.stake}
                            min={0.35}
                            onChange={stake => update({ stake })}
                        />
                    </div>

                    <h3 className='vd-card__title'>{localize('Bot parameters')}</h3>
                    <div className='vd-number'>
                        <label className='vd-field__label' htmlFor='vd-quick-bot-system'>
                            {localize('Stake system')}
                        </label>
                        <select
                            id='vd-quick-bot-system'
                            className='vd-select'
                            value={config.strategy}
                            onChange={e => update({ strategy: e.target.value as TStrategyKey })}
                        >
                            {(Object.keys(STRATEGY_LABELS) as TStrategyKey[]).map(key => (
                                <option key={key} value={key}>
                                    {STRATEGY_LABELS[key]}
                                </option>
                            ))}
                        </select>
                        <small className='vd-number__hint'>{localize(STRATEGY_HELP[config.strategy])}</small>
                    </div>
                    <div className='vd-row'>
                        <NumberField
                            label={localize('Take profit')}
                            unit='USD'
                            value={config.profit}
                            min={0}
                            onChange={profit => update({ profit })}
                        />
                        <NumberField
                            label={localize('Stop loss')}
                            unit='USD'
                            value={config.loss}
                            min={0}
                            onChange={loss => update({ loss })}
                        />
                        {uses_size && (
                            <NumberField
                                label={localize('Size (multiplier)')}
                                unit='×'
                                value={config.size ?? 2}
                                min={1.1}
                                max={10}
                                onChange={size => update({ size })}
                            />
                        )}
                        {uses_unit && (
                            <NumberField
                                label={localize('Unit')}
                                value={config.unit ?? 1}
                                min={1}
                                max={10}
                                decimals={0}
                                onChange={unit => update({ unit })}
                            />
                        )}
                    </div>
                    {config.strategy !== 'STRATEGY_1_3_2_6' &&
                        config.strategy !== 'REVERSE_MARTINGALE' &&
                        config.strategy !== 'REVERSE_D_ALEMBERT' && (
                            <div className='vd-row'>
                                <label className='vd-switch'>
                                    <input
                                        type='checkbox'
                                        checked={use_max}
                                        onChange={e => setUseMax(e.target.checked)}
                                    />
                                    <span className='vd-switch__track' aria-hidden='true' />
                                    <span>{localize('Max stake')}</span>
                                </label>
                                {use_max && (
                                    <NumberField
                                        label={localize('Max stake')}
                                        unit='USD'
                                        value={config.max_stake ?? 8}
                                        min={0.35}
                                        onChange={max_stake => update({ max_stake })}
                                    />
                                )}
                            </div>
                        )}
                </section>

                <aside className='vd-card'>
                    <h3 className='vd-card__title'>{localize('Your bot')}</h3>
                    <p className='vd-card__text'>
                        {localize(
                            'Buys {{contract}}{{digit}} on {{market}} for {{duration}} tick(s), starting at {{stake}} USD, using {{strategy}}. Stops at +{{tp}} USD profit or -{{sl}} USD loss.',
                            {
                                contract:
                                    trade_type.contracts.find(c => c.value === config.contract)?.label ??
                                    config.contract,
                                digit: trade_type.has_digit ? ` ${config.prediction}` : '',
                                market: config.symbol,
                                duration: config.duration,
                                stake: config.stake,
                                strategy: STRATEGY_LABELS[config.strategy],
                                tp: config.profit,
                                sl: config.loss,
                            }
                        )}
                    </p>
                    {problems.map(p => (
                        <p key={p} className='vd-message vd-message--error'>
                            {p}
                        </p>
                    ))}
                    {is_real && (
                        <label className='vd-real-confirm'>
                            <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                            <span>{localize('I understand "Open and run" trades real money.')}</span>
                        </label>
                    )}
                    <button
                        type='button'
                        className='vd-primary-button'
                        disabled={busy || problems.length > 0}
                        onClick={() => open('LOAD')}
                    >
                        {busy ? localize('Building…') : localize('Open in Bot Builder')}
                    </button>
                    <button
                        type='button'
                        className='vd-primary-button vd-primary-button--teal'
                        disabled={busy || problems.length > 0 || !client.is_logged_in}
                        onClick={() => open('RUN')}
                    >
                        ▶ {localize('Open and run')}
                    </button>
                    <p className='vd-card__text'>
                        {localize(
                            'To keep the bot as a file, use the Save button in the Bot Builder toolbar after it opens.'
                        )}
                    </p>
                    {error && (
                        <p role='alert' className='vd-message vd-message--error'>
                            {error}
                        </p>
                    )}
                </aside>
            </div>
        </div>
    );
});

export default QuickBot;
