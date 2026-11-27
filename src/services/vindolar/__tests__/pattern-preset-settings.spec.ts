import { PATTERN_PRESETS } from '../digit-strategies';
import { sanitizeBots } from '../free-bots-schema';
import { builtInPresetRecords, deletedPresets, effectivePresets, presetToRecord } from '../pattern-preset-settings';

describe('Premium AI preset settings', () => {
    it('shows the coded presets until the owner saves changes', () => {
        const presets = effectivePresets(null);
        expect(presets.map(p => p.id)).toEqual(PATTERN_PRESETS.map(p => p.id));
        expect(deletedPresets(null)).toEqual([]);
    });

    it('records pass the server checks unchanged', () => {
        const records = builtInPresetRecords();
        expect(() => sanitizeBots(records)).not.toThrow();
        expect(effectivePresets(sanitizeBots(records)).map(p => p.name)).toEqual(PATTERN_PRESETS.map(p => p.name));
    });

    it('applies renames, labels, confirmation, order, hiding and deletion', () => {
        const [first, second, ...rest] = builtInPresetRecords();
        const renamed = {
            ...second,
            name: 'Renamed',
            description: 'New text',
            hidden: true,
            config: { ...second.config, confirmation: 4, chips: 'A|B' },
        };
        const presets = effectivePresets([renamed, first, ...rest.slice(1)]);
        expect(presets[0]).toMatchObject({
            id: second.id,
            name: 'Renamed',
            description: 'New text',
            chips: ['A', 'B'],
            default_confirmation: 4,
            hidden: true,
        });
        // The trading rule still comes from the coded preset.
        expect(presets[0].rule).toBe(PATTERN_PRESETS[1].rule);
        expect(deletedPresets([renamed, first, ...rest.slice(1)]).map(p => p.id)).toEqual([rest[0].id]);
    });

    it('runs a copy with the rule of the preset it was copied from', () => {
        const copy = presetToRecord(
            { ...PATTERN_PRESETS[0], id: 'low-bounce-fast', name: 'Fast' },
            PATTERN_PRESETS[0].id
        );
        const [preset] = effectivePresets([copy]);
        expect(preset).toMatchObject({ id: 'low-bounce-fast', base_id: PATTERN_PRESETS[0].id, name: 'Fast' });
        expect(preset.recovery).toBe(PATTERN_PRESETS[0].recovery);
    });
});
