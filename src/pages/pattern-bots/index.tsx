import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import ReactDOM from 'react-dom';
import AutoSession from '@/components/vindolar/auto-session';
import BotLibrary from '@/components/vindolar/bot-library/bot-library';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { createDigitStrategy, getPreset } from '@/services/vindolar/digit-strategies';
import { fetchPublishedBots, publishBots, useOwner } from '@/services/vindolar/free-bots-api';
import { TStoredBot } from '@/services/vindolar/free-bots-schema';
import {
    builtInPresetRecords,
    deletedPresets,
    effectivePresets,
    presetToRecord,
    TEffectivePreset,
} from '@/services/vindolar/pattern-preset-settings';
import { LabelPairedArrowUpRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';

const PRESET_LIST = 'premium-ai-presets';

type TOwnerActions = {
    disabled: boolean;
    is_first: boolean;
    is_last: boolean;
    onEdit: () => void;
    onCopy: () => void;
    onToggleHidden: () => void;
    onDelete: () => void;
    onMove: (step: -1 | 1) => void;
};

const PresetCard = ({
    preset,
    number,
    is_selected,
    onOpen,
    owner,
}: {
    preset: TEffectivePreset;
    number: number;
    is_selected: boolean;
    onOpen: () => void;
    owner?: TOwnerActions;
}) => {
    const { state } = useAutoTrader(`pattern-${preset.id}`);
    const is_running = !['idle', 'stopped'].includes(state.status);
    return (
        <article
            className={classNames('vd-card vd-preset', {
                'vd-card--active': is_selected,
                'vd-preset--hidden': preset.hidden,
            })}
        >
            <div className='vd-preset__top'>
                <span className='vd-field__label'>
                    {preset.hidden ? localize('Hidden from users') : localize('Digit strategy')}
                </span>
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
            {owner && (
                <div className='vd-fb-admin__card-actions vd-fb-admin__card-actions--preset'>
                    <button type='button' disabled={owner.disabled} onClick={owner.onEdit}>
                        {localize('Edit')}
                    </button>
                    <button type='button' disabled={owner.disabled} onClick={owner.onCopy}>
                        {localize('Copy')}
                    </button>
                    <button type='button' disabled={owner.disabled} onClick={owner.onToggleHidden}>
                        {preset.hidden ? localize('Unhide') : localize('Hide')}
                    </button>
                    <button type='button' className='is-danger' disabled={owner.disabled} onClick={owner.onDelete}>
                        {localize('Delete')}
                    </button>
                    <button
                        type='button'
                        aria-label={localize('Move earlier')}
                        title={localize('Move earlier')}
                        disabled={owner.disabled || owner.is_first}
                        onClick={() => owner.onMove(-1)}
                    >
                        ↑
                    </button>
                    <button
                        type='button'
                        aria-label={localize('Move later')}
                        title={localize('Move later')}
                        disabled={owner.disabled || owner.is_last}
                        onClick={() => owner.onMove(1)}
                    >
                        ↓
                    </button>
                </div>
            )}
        </article>
    );
};

/** Edit a preset, or make a copy with different settings (owner only). */
const PresetEditor = ({
    preset,
    is_copy,
    busy,
    onCancel,
    onSave,
}: {
    preset: TEffectivePreset;
    is_copy: boolean;
    busy: boolean;
    onCancel: () => void;
    onSave: (record: TStoredBot) => void;
}) => {
    const [name, setName] = React.useState(is_copy ? `${preset.name} (copy)` : preset.name);
    const [description, setDescription] = React.useState(preset.description);
    const [chips, setChips] = React.useState(preset.chips.join(', '));
    const [confirmation, setConfirmation] = React.useState(String(preset.default_confirmation));
    const [problem, setProblem] = React.useState('');

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const clean_name = name.trim();
        const digits = Number(confirmation);
        if (!clean_name) return setProblem(localize('Give the preset a name.'));
        if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
            return setProblem(localize('Confirmation digits must be a whole number from 1 to 10.'));
        }
        const id = is_copy ? `${preset.base_id}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 60) : preset.id;
        onSave(
            presetToRecord(
                {
                    ...preset,
                    id,
                    name: clean_name,
                    description: description.trim(),
                    chips: chips
                        .split(',')
                        .map(chip => chip.trim())
                        .filter(Boolean),
                    default_confirmation: digits,
                },
                preset.base_id,
                is_copy ? undefined : preset.hidden
            )
        );
    };

    return ReactDOM.createPortal(
        <div className='vd-fb-admin__backdrop' role='presentation' onClick={onCancel}>
            <form
                className='vd-fb-admin__dialog'
                role='dialog'
                aria-modal='true'
                aria-label={is_copy ? localize('Copy preset') : localize('Edit preset')}
                onClick={e => e.stopPropagation()}
                onSubmit={submit}
            >
                <h3>{is_copy ? localize('Copy preset') : localize('Edit preset')}</h3>
                <p className='vd-fb-admin__hint'>
                    {localize(
                        'Trades with the {{rule}} rule. You can change how it is named and described, its labels and how many digits confirm a setup.',
                        { rule: localize(getPreset(preset.base_id).name) }
                    )}
                </p>
                <label>
                    <span>{localize('Name')}</span>
                    <input value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus />
                </label>
                <label>
                    <span>{localize('Description')}</span>
                    <textarea
                        value={description}
                        maxLength={400}
                        rows={3}
                        onChange={e => setDescription(e.target.value)}
                    />
                </label>
                <div className='vd-fb-admin__row'>
                    <label>
                        <span>{localize('Labels (comma separated)')}</span>
                        <input value={chips} maxLength={60} onChange={e => setChips(e.target.value)} />
                    </label>
                    <label>
                        <span>{localize('Confirmation digits (1-10)')}</span>
                        <input
                            inputMode='numeric'
                            value={confirmation}
                            onChange={e => setConfirmation(e.target.value)}
                        />
                    </label>
                </div>
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

const PresetRunner = ({ preset }: { preset: TEffectivePreset }) => {
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

const PatternBots = observer(() => {
    const { client } = useStore();
    const owner = useOwner(client?.loginid);
    const [selected, setSelected] = usePersistentState<string | null>('vd_pattern_selected', null);
    const [records, setRecords] = React.useState<TStoredBot[] | null>(null);
    const [editing, setEditing] = React.useState<{ preset: TEffectivePreset; is_copy: boolean } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

    React.useEffect(() => {
        let active = true;
        fetchPublishedBots(PRESET_LIST).then(saved => active && setRecords(saved));
        return () => {
            active = false;
        };
    }, []);

    const all_presets = effectivePresets(records);
    const presets = owner.is_admin ? all_presets : all_presets.filter(p => !p.hidden);
    const preset = presets.find(p => p.id === selected) ?? null;
    const missing = deletedPresets(records);
    const can_edit = owner.is_admin && owner.storage_ready && !busy;
    // The owner edits the saved list, or the coded presets the first time.
    const current_records = records ?? builtInPresetRecords();

    const open = (id: string) => {
        setSelected(id);
        requestAnimationFrame(() =>
            document.getElementById('vd-preset-runner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
    };

    const save = async (next: TStoredBot[], done: string) => {
        setBusy(true);
        setMessage(null);
        try {
            setRecords(await publishBots(next, PRESET_LIST));
            setEditing(null);
            setMessage({ tone: 'ok', text: done });
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('Your changes could not be saved.') });
        } finally {
            setBusy(false);
        }
    };

    const saveRecord = (record: TStoredBot) => {
        const exists = current_records.some(r => r.id === record.id);
        if (exists) {
            save(
                current_records.map(r => (r.id === record.id ? record : r)),
                localize('"{{name}}" updated.', { name: record.name })
            );
            return;
        }
        // A copy goes right after the preset it was copied from.
        const index = current_records.findIndex(r => r.id === editing?.preset.id);
        const next = [...current_records];
        next.splice(index < 0 ? next.length : index + 1, 0, record);
        save(next, localize('"{{name}}" added.', { name: record.name }));
    };

    const ownerActions = (p: TEffectivePreset, index: number): TOwnerActions => ({
        disabled: !can_edit,
        is_first: index === 0,
        is_last: index === presets.length - 1,
        onEdit: () => setEditing({ preset: p, is_copy: false }),
        onCopy: () => setEditing({ preset: p, is_copy: true }),
        onToggleHidden: () =>
            save(
                current_records.map(r => (r.id === p.id ? { ...r, hidden: !p.hidden || undefined } : r)),
                p.hidden
                    ? localize('"{{name}}" is visible to everyone again.', { name: p.name })
                    : localize('"{{name}}" is now hidden from users.', { name: p.name })
            ),
        onDelete: () => {
            if (!window.confirm(localize('Delete "{{name}}" for everyone?', { name: p.name }))) return;
            save(
                current_records.filter(r => r.id !== p.id),
                localize('"{{name}}" deleted.', { name: p.name })
            );
        },
        onMove: step => {
            const from = current_records.findIndex(r => r.id === p.id);
            const to = from + step;
            if (from < 0 || to < 0 || to >= current_records.length) return;
            const next = [...current_records];
            [next[from], next[to]] = [next[to], next[from]];
            save(next, localize('Order saved.'));
        },
    });

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

            {owner.is_admin && (
                <div className='vd-fb-admin__bar'>
                    <span className='vd-fb-admin__badge'>{localize('Owner')}</span>
                    <p>
                        {localize(
                            'Presets: edit their names, descriptions, labels and confirmation digits, copy them with other settings, reorder, hide or delete them.'
                        )}
                    </p>
                    {missing.length > 0 && (
                        <button
                            type='button'
                            className='vd-fb-admin__button'
                            disabled={!can_edit}
                            onClick={() =>
                                save(
                                    [...current_records, ...missing.map(p => presetToRecord(p))],
                                    localize('Deleted presets restored.')
                                )
                            }
                        >
                            {localize('Restore deleted presets ({{n}})', { n: missing.length })}
                        </button>
                    )}
                    {records && (
                        <button
                            type='button'
                            className='vd-fb-admin__button'
                            disabled={!can_edit}
                            onClick={() => {
                                if (window.confirm(localize('Undo all your preset changes and copies?'))) {
                                    save(builtInPresetRecords(), localize('Presets reset to the originals.'));
                                }
                            }}
                        >
                            {localize('Reset all presets')}
                        </button>
                    )}
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

            <div className='vd-page__grid vd-preset-grid'>
                {presets.map((p, i) => (
                    <PresetCard
                        key={p.id}
                        preset={p}
                        number={i + 1}
                        is_selected={p.id === selected}
                        onOpen={() => open(p.id)}
                        owner={owner.is_admin ? ownerActions(p, i) : undefined}
                    />
                ))}
            </div>
            {presets.length === 0 && (
                <p className='vd-page__note'>{localize('No preset bots are available right now.')}</p>
            )}
            {preset && (
                <div style={{ marginTop: '1.6rem' }}>
                    <PresetRunner key={preset.id} preset={preset} />
                </div>
            )}
            {editing && (
                <PresetEditor
                    key={`${editing.preset.id}-${editing.is_copy}`}
                    preset={editing.preset}
                    is_copy={editing.is_copy}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={saveRecord}
                />
            )}
        </div>
    );
});

export default PatternBots;
