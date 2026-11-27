/**
 * The owner's settings for the Premium AI presets. Each preset's trading rule stays in code
 * (digit-strategies.ts); the owner controls its name, description, labels, confirmation digits,
 * order, visibility, deletion, and copies with different settings.
 *
 * Saved as the "premium-ai-presets" bot list: one record per preset, where
 * config = { preset: <coded preset id>, confirmation: <digits>, chips: "Over 2|Under 7" }.
 */
import { PATTERN_PRESETS, TPatternPreset } from './digit-strategies';
import { TStoredBot } from './free-bots-schema';

export type TEffectivePreset = TPatternPreset & {
    /** The coded preset this one runs. */
    base_id: string;
    hidden?: boolean;
};

const CHIP_SEPARATOR = '|';

export const presetToRecord = (preset: TPatternPreset, base_id = preset.id, hidden?: boolean): TStoredBot => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    contract_label: '',
    market_label: '',
    config: {
        preset: base_id,
        confirmation: preset.default_confirmation,
        chips: preset.chips.join(CHIP_SEPARATOR).slice(0, 60),
    },
    ...(hidden ? { hidden: true } : {}),
});

/** The coded presets, as records (what the owner starts editing from). */
export const builtInPresetRecords = (): TStoredBot[] => PATTERN_PRESETS.map(p => presetToRecord(p));

const findCoded = (id: unknown) => PATTERN_PRESETS.find(p => p.id === id);

/** Presets to show: the coded ones, or the owner's saved list with their changes applied. */
export const effectivePresets = (records: TStoredBot[] | null): TEffectivePreset[] => {
    if (!records) return PATTERN_PRESETS.map(p => ({ ...p, base_id: p.id }));
    return records.flatMap(record => {
        const base = findCoded(record.config?.preset);
        if (!base) return []; // A coded preset that no longer exists.
        const confirmation = Number(record.config?.confirmation);
        const chips = String(record.config?.chips ?? '')
            .split(CHIP_SEPARATOR)
            .map(chip => chip.trim())
            .filter(Boolean);
        return [
            {
                ...base,
                id: record.id,
                base_id: base.id,
                name: record.name || base.name,
                description: record.description || base.description,
                chips: chips.length ? chips : base.chips,
                default_confirmation:
                    Number.isFinite(confirmation) && confirmation >= 1 && confirmation <= 10
                        ? Math.round(confirmation)
                        : base.default_confirmation,
                hidden: record.hidden,
            },
        ];
    });
};

/** Coded presets the owner has deleted (offered back by "Restore deleted presets"). */
export const deletedPresets = (records: TStoredBot[] | null) => {
    if (!records) return [];
    const kept = new Set(records.map(r => r.id));
    return PATTERN_PRESETS.filter(p => !kept.has(p.id));
};
