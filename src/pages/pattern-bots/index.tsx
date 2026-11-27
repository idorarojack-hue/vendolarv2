import classNames from 'classnames';
import AutoSession from '@/components/vindolar/auto-session';
import BotLibrary from '@/components/vindolar/bot-library/bot-library';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { createDigitStrategy, getPreset, PATTERN_PRESETS, TPatternPreset } from '@/services/vindolar/digit-strategies';
import { LabelPairedArrowUpRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';

const PresetCard = ({
    preset,
    number,
    is_selected,
    onOpen,
}: {
    preset: TPatternPreset;
    number: number;
    is_selected: boolean;
    onOpen: () => void;
}) => {
    const { state } = useAutoTrader(`pattern-${preset.id}`);
    const is_running = !['idle', 'stopped'].includes(state.status);
    return (
        <article className={classNames('vd-card vd-preset', { 'vd-card--active': is_selected })}>
            <div className='vd-preset__top'>
                <span className='vd-field__label'>{localize('Digit strategy')}</span>
                <span className={classNames('vd-card__badge', { 'vd-card__badge--teal': is_running })}>
                    {is_running ? localize('Running') : `${localize('Bot')} ${String(number).padStart(2, '0')}`}
                </span>
            </div>
            <h3 className='vd-card__title'>{localize(preset.name)}</h3>
            <p className='vd-card__text'>{localize(preset.description)}</p>
            <div className='vd-preset__chips'>
                {preset.chips.map(chip => (
                    <span key={chip} className='vd-card__badge'>
                        {chip}
                    </span>
                ))}
            </div>
            <dl className='vd-preset__facts'>
                <div>
                    <dt>{localize('After a loss')}</dt>
                    <dd>{localize(getPreset(preset.recovery).name)}</dd>
                </div>
                <div>
                    <dt>{localize('Confirmation')}</dt>
                    <dd>{localize('{{n}} digits', { n: preset.default_confirmation })}</dd>
                </div>
            </dl>
            <button type='button' className='vd-primary-button vd-preset__open' onClick={onOpen}>
                {is_selected ? localize('Open below') : localize('Open bot')}
                <LabelPairedArrowUpRightCaptionRegularIcon height='16px' width='16px' fill='currentColor' />
            </button>
        </article>
    );
};

const PresetRunner = ({ preset }: { preset: TPatternPreset }) => {
    const id = `pattern-${preset.id}`;
    const { symbols } = useVolatilitySymbols();
    const { state } = useAutoTrader(id);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [market, setMarket] = usePersistentState(`vd_${id}_market`, 'ALL');
    const [confirmation, setConfirmation] = usePersistentState(`vd_${id}_confirmation`, preset.default_confirmation);
    const recovery = getPreset(preset.recovery);

    const buildStrategy = () =>
        createDigitStrategy({
            name: preset.name,
            markets: market === 'ALL' ? symbols.map(s => s.symbol) : [market],
            rule: preset.rule(confirmation),
            recovery_rule: recovery.rule(recovery.default_confirmation),
        });

    return (
        <section className='vd-card' id='vd-preset-runner'>
            <h3 className='vd-card__title'>
                {localize(preset.name)}
                <span className='vd-card__badge vd-card__badge--amber'>{localize('Uses recovery')}</span>
            </h3>
            <p className='vd-card__text'>
                {localize(preset.description)}{' '}
                {localize('After a loss, the next trade uses the {{name}} rule; after a win it returns to this rule.', {
                    name: localize(recovery.name),
                })}
            </p>
            <AutoSession
                id={id}
                buildStrategy={buildStrategy}
                start_label={localize('Start {{name}}', { name: localize(preset.name) })}
            >
                <div className='vd-row'>
                    <MarketSelect value={market} onChange={setMarket} include_all disabled={is_running} />
                    <NumberField
                        label={localize('Confirmation digits')}
                        value={confirmation}
                        min={1}
                        max={10}
                        decimals={0}
                        disabled={is_running}
                        onChange={setConfirmation}
                    />
                </div>
            </AutoSession>
        </section>
    );
};

const PatternBots = () => {
    const [selected, setSelected] = usePersistentState<string | null>('vd_pattern_selected', null);
    const preset = selected ? getPreset(selected) : null;

    const open = (id: string) => {
        setSelected(id);
        requestAnimationFrame(() =>
            document.getElementById('vd-preset-runner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Bots')}
                title={localize('Premium AI Bots')}
                subtitle={localize('Preset digit-pattern bots. Each one explains exactly when it trades.')}
            />
            {/* Bots the owner publishes for this page (Bot Builder bots); hidden when empty. */}
            <BotLibrary
                collection='premium-ai'
                heading={localize('Premium AI bot library')}
                card_label='Premium AI bot'
            />
            <p className='vd-page__note'>
                {localize(
                    'These bots follow fixed rules on recent digits and switch to a recovery rule after a loss. Digits are random, so no pattern guarantees a win — use the stop loss.'
                )}
            </p>
            <div className='vd-page__grid vd-preset-grid'>
                {PATTERN_PRESETS.map((p, i) => (
                    <PresetCard
                        key={p.id}
                        preset={p}
                        number={i + 1}
                        is_selected={p.id === selected}
                        onOpen={() => open(p.id)}
                    />
                ))}
            </div>
            {preset && (
                <div style={{ marginTop: '1.6rem' }}>
                    <PresetRunner key={preset.id} preset={preset} />
                </div>
            )}
        </div>
    );
};

export default PatternBots;
