import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useMarketDataStatus, useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { edgeZScore } from '@/services/vindolar/backtest';
import { getCurrentStreak, mostUnusual, TUnusualness } from '@/services/vindolar/digit-stats';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import { STRATEGY_CATALOG } from '@/services/vindolar/strategy-catalog';
import { runStrategyTest, TStrategyTestResult } from '@/services/vindolar/strategy-test-runner';
import { localize } from '@deriv-com/translations';
import { openPulseScanner } from './pulse-window';
import './vindolar.scss';
import '../../pages/analysis-tools/analysis-tools.scss';
import '../../pages/strategy-tester/strategy-tester.scss';

const WINDOW = 100;

/** Dispatch on `document` to open the scanner panel from anywhere. */
export const OPEN_SCANNER_EVENT = 'vd:open-scanner';

type TTone = 'up' | 'down';

type TRow = { market: TMarketSymbol; unusual: TUnusualness; streak: string; streak_tone: TTone; last: number[] };

// Green: even, digits 5–9, a digit showing up more than its fair 10%.
// Red: odd, digits 0–4, a digit showing up less than its fair 10%.
const toneForKind = (kind: string): TTone =>
    kind === 'even' || kind === 'over' || kind.endsWith('-hot') ? 'up' : 'down';

/** Watches one market and reports its stats to the panel (renders nothing itself). */
const Watch = ({ market, onUpdate }: { market: TMarketSymbol; onUpdate: (row: TRow) => void }) => {
    const ticks = useTicks(market.symbol, WINDOW);
    React.useEffect(() => {
        if (!ticks.length) return;
        const digits = ticks.map(t => t.digit);
        const parity = getCurrentStreak(digits, d => d % 2 === 0);
        const half = getCurrentStreak(digits, d => d <= 4);
        const use_parity = parity.length >= half.length;
        const streak = use_parity
            ? `${parity.length} ${parity.value ? 'even' : 'odd'} in a row`
            : `${half.length} at ${half.value ? '0-4' : '5-9'} in a row`;
        const streak_tone: TTone = use_parity ? (parity.value ? 'up' : 'down') : half.value ? 'down' : 'up';
        onUpdate({ market, unusual: mostUnusual(ticks), streak, streak_tone, last: digits.slice(-6) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticks]);
    return null;
};

const presetForKind = (kind: string) => {
    if (kind === 'even' || kind === 'odd') return { trade_type: 'even_odd' };
    if (kind === 'over' || kind === 'under') return { trade_type: 'over_under', digit: 4 };
    const digit = Number(/digit-(\d)/.exec(kind)?.[1] ?? 5);
    return { trade_type: 'matches_differs', digit };
};

const QuickTest = observer(({ default_symbol }: { default_symbol: string }) => {
    const { client } = useStore();
    const [strategy_id, setStrategyId] = usePersistentState('vd_scanner_quick_strategy', STRATEGY_CATALOG[0].id);
    const [symbol, setSymbol] = React.useState(default_symbol);
    const [progress, setProgress] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<TStrategyTestResult | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const { symbols } = useVolatilitySymbols();
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';

    React.useEffect(() => setSymbol(default_symbol), [default_symbol]);

    const run = async () => {
        setError(null);
        setResult(null);
        try {
            setResult(
                await runStrategyTest({
                    strategy_id,
                    symbol,
                    tick_count: 5000,
                    duration: 5,
                    // Flat stake, no limits: measures the strategy's raw edge.
                    settings: {
                        stake: 1,
                        take_profit: 1e9,
                        stop_loss: 1e9,
                        martingale: false,
                        multiplier: 2,
                        max_stake: 1,
                    },
                    currency,
                    onProgress: m => setProgress(localize(m)),
                })
            );
        } catch (e: any) {
            setError(e?.message ?? localize('The test could not run.'));
        } finally {
            setProgress(null);
        }
    };

    const z = result ? edgeZScore(result) : 0;
    return (
        <div className='vd-scanner-panel__quick'>
            <p className='vd-card__text'>
                {localize(
                    'Replay a strategy on the last 5,000 ticks with a flat 1 USD stake, using your real payouts.'
                )}
            </p>
            <label className='vd-number'>
                <span className='vd-field__label'>{localize('Strategy')}</span>
                <select className='vd-select' value={strategy_id} onChange={e => setStrategyId(e.target.value)}>
                    {STRATEGY_CATALOG.map(s => (
                        <option key={s.id} value={s.id}>
                            {s.group} · {s.name}
                        </option>
                    ))}
                </select>
            </label>
            <label className='vd-number'>
                <span className='vd-field__label'>{localize('Market')}</span>
                <select className='vd-select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {symbols.map(s => (
                        <option key={s.symbol} value={s.symbol}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </label>
            <button type='button' className='vd-primary-button' disabled={!!progress} onClick={run}>
                {progress ?? localize('Run quick test')}
            </button>
            {error && <p className='vd-message vd-message--error'>{error}</p>}
            {result && (
                <div
                    className={classNames(
                        'vd-tester__verdict',
                        result.return_on_staked < 0 ? 'vd-tester__verdict--bad' : 'vd-tester__verdict--good'
                    )}
                >
                    <span className='vd-field__label'>
                        {result.trades.length.toLocaleString()} {localize('trades')} · {localize('win rate')}{' '}
                        {result.win_rate.toFixed(1)}% · {localize('break-even')} {result.breakeven_win_rate.toFixed(1)}%
                    </span>
                    <strong>
                        {result.return_on_staked > 0 ? '+' : ''}
                        {result.return_on_staked.toFixed(2)}%
                    </strong>
                    <p>
                        {result.trades.length < 100
                            ? localize('Too few trades to judge.')
                            : result.return_on_staked < 0
                              ? localize('Loses on average — what the house edge predicts (z = {{z}}).', {
                                    z: z.toFixed(1),
                                })
                              : Math.abs(z) < 2
                                ? localize('Within normal luck (z = {{z}}): no evidence of an edge.', {
                                      z: z.toFixed(1),
                                  })
                                : z > 0
                                  ? localize(
                                        'Above chance on this sample (z = {{z}}). Re-test on other markets before trusting it.',
                                        { z: z.toFixed(1) }
                                    )
                                  : localize('Below chance on this sample (z = {{z}}).', { z: z.toFixed(1) })}
                    </p>
                </div>
            )}
        </div>
    );
});

/** Floating Scanner (bottom-right on every tab): live "most unusual" ranking + quick strategy test. */
const FloatingScanner = observer(({ lifted, beside_drawer }: { lifted: boolean; beside_drawer?: boolean }) => {
    const { dashboard } = useStore();
    const { symbols } = useVolatilitySymbols();
    const is_connected = useMarketDataStatus();
    const [open, setOpen] = React.useState(false);
    const [view, setView] = usePersistentState<'markets' | 'test'>('vd_scanner_view', 'markets');
    const [rows, setRows] = React.useState<Record<string, TRow>>({});
    const panel_ref = React.useRef<HTMLDivElement>(null);

    const onUpdate = React.useCallback(
        (row: TRow) => setRows(previous => ({ ...previous, [row.market.symbol]: row })),
        []
    );

    // Other pages (e.g. Bulk Trader's "Market scanner" button) open the panel with this event.
    React.useEffect(() => {
        const onOpen = () => {
            setView('markets');
            setOpen(true);
        };
        document.addEventListener(OPEN_SCANNER_EVENT, onOpen);
        return () => document.removeEventListener(OPEN_SCANNER_EVENT, onOpen);
    }, [setView]);

    React.useEffect(() => {
        if (!open) return undefined;
        panel_ref.current?.focus();
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const ranked = Object.values(rows).sort((a, b) => b.unusual.score - a.unusual.score);

    const trade = (row: TRow) => {
        try {
            const saved = JSON.parse(localStorage.getItem('vd_manual_trader_settings') ?? '{}');
            localStorage.setItem(
                'vd_manual_trader_settings',
                JSON.stringify({ ...saved, ...presetForKind(row.unusual.kind), duration: 1 })
            );
            localStorage.setItem('vd_manual_trader_symbol', row.market.symbol);
        } catch {
            // Opens with the last settings if storage is unavailable.
        }
        dashboard.setActiveTab(DBOT_TABS.MANUAL_TRADER);
        setOpen(false);
    };

    const test = (row: TRow) => {
        try {
            localStorage.setItem('vd_tester_symbol', JSON.stringify(row.market.symbol));
        } catch {
            // ignore
        }
        dashboard.setActiveTab(DBOT_TABS.STRATEGY_TESTER);
        setOpen(false);
    };

    return (
        <>
            <button
                type='button'
                className={classNames('vd-scanner-fab', {
                    'vd-scanner-fab--lifted': lifted,
                    'vd-scanner-fab--beside-drawer': beside_drawer,
                    'is-open': open,
                })}
                aria-expanded={open}
                aria-controls='vd-scanner-panel'
                onClick={() => setOpen(v => !v)}
            >
                <span className='vd-scanner-fab__icon' aria-hidden='true'>
                    <img src='/assets/ai-scanner.png' alt='' />
                    <span className='vd-scanner-fab__beam' />
                </span>
                <span className='vd-scanner-fab__label'>
                    <strong>{localize('AI Scanner')}</strong>
                    <small>{localize('Click to analyze')}</small>
                </span>
            </button>

            {open && (
                <div
                    id='vd-scanner-panel'
                    ref={panel_ref}
                    tabIndex={-1}
                    className={classNames('vd-scanner-panel', {
                        'vd-scanner-panel--lifted': lifted,
                        'vd-scanner-panel--beside-drawer': beside_drawer,
                    })}
                    role='dialog'
                    aria-label={localize('Scanner')}
                >
                    {symbols.map(m => (
                        <Watch key={m.symbol} market={m} onUpdate={onUpdate} />
                    ))}
                    <header className='vd-scanner-panel__header'>
                        <div>
                            <h2>{localize('Scanner')}</h2>
                            <span className={classNames('vd-live', { 'vd-live--off': !is_connected })}>
                                {is_connected
                                    ? localize('{{n}} markets live', { n: symbols.length })
                                    : localize('Connecting…')}
                            </span>
                        </div>
                        <button
                            type='button'
                            className='vd-scanner-panel__close'
                            aria-label={localize('Close scanner')}
                            onClick={() => setOpen(false)}
                        >
                            ×
                        </button>
                    </header>

                    <button
                        type='button'
                        className='vd-scanner-panel__pulse'
                        onClick={() => {
                            openPulseScanner();
                            setOpen(false);
                        }}
                    >
                        <span>
                            <strong>{localize('Open Pulse AI Scanner')}</strong>
                            <small>{localize('Full scanner with auto trading, in a window you can move')}</small>
                        </span>
                        <span aria-hidden='true'>↗</span>
                    </button>

                    <div className='vd-segmented' role='tablist'>
                        <button
                            type='button'
                            role='tab'
                            aria-selected={view === 'markets'}
                            className={classNames({ 'is-active': view === 'markets' })}
                            onClick={() => setView('markets')}
                        >
                            {localize('Markets')}
                        </button>
                        <button
                            type='button'
                            role='tab'
                            aria-selected={view === 'test'}
                            className={classNames({ 'is-active': view === 'test' })}
                            onClick={() => setView('test')}
                        >
                            {localize('Quick test')}
                        </button>
                    </div>

                    {view === 'markets' ? (
                        <>
                            <p className='vd-card__text'>
                                {localize(
                                    'Ranked by how far the last {{n}} ticks are from fair odds (σ). Above 2σ happens about 1 time in 20 by chance — unusual is not predictive.',
                                    { n: WINDOW }
                                )}
                            </p>
                            <ul className='vd-scanner-panel__list'>
                                {ranked.length === 0 && (
                                    <li className='vd-card__text'>{localize('Loading markets…')}</li>
                                )}
                                {ranked.map(row => (
                                    <li key={row.market.symbol}>
                                        <div className='vd-scanner-panel__row-main'>
                                            <strong>{row.market.name}</strong>
                                            <span
                                                className={classNames(
                                                    'vd-scanner-panel__finding',
                                                    toneForKind(row.unusual.kind) === 'up' ? 'is-up' : 'is-down'
                                                )}
                                            >
                                                {row.unusual.label}
                                            </span>
                                            <small
                                                className={classNames(
                                                    'vd-scanner-panel__streak',
                                                    row.streak_tone === 'up' ? 'is-up' : 'is-down'
                                                )}
                                            >
                                                {row.streak}
                                                {' · '}
                                                {localize('last')}{' '}
                                                <span className='vd-scanner-panel__digits'>
                                                    {row.last.map((digit, index) => (
                                                        <b
                                                            key={`${row.market.symbol}-${index}`}
                                                            className={digit % 2 === 0 ? 'is-even' : 'is-odd'}
                                                        >
                                                            {digit}
                                                        </b>
                                                    ))}
                                                </span>
                                            </small>
                                        </div>
                                        <span
                                            className={classNames('vd-scanner-panel__score', {
                                                'is-high': row.unusual.score >= 2,
                                            })}
                                        >
                                            {row.unusual.score.toFixed(1)}σ
                                        </span>
                                        <div className='vd-scanner-panel__actions'>
                                            <button
                                                type='button'
                                                className='vd-session__reset'
                                                onClick={() => trade(row)}
                                            >
                                                {localize('Trade')}
                                            </button>
                                            <button
                                                type='button'
                                                className='vd-session__reset'
                                                onClick={() => test(row)}
                                            >
                                                {localize('Test')}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <QuickTest default_symbol={ranked[0]?.market.symbol ?? '1HZ100V'} />
                    )}
                </div>
            )}
        </>
    );
});

export default FloatingScanner;
