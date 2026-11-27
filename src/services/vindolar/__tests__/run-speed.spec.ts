import { getRunPauseMs, run_speed, setRunSpeed, SLOW_PAUSE_MS } from '../run-speed';

describe('run speed', () => {
    afterEach(() => setRunSpeed('fast'));

    it('starts the next run straight away on Fast', () => {
        setRunSpeed('fast');
        expect(getRunPauseMs()).toBe(0);
    });

    it('waits between runs on Slow and remembers the choice', () => {
        setRunSpeed('slow');
        expect(run_speed.get()).toBe('slow');
        expect(getRunPauseMs()).toBe(SLOW_PAUSE_MS);
        expect(localStorage.getItem('vd_run_speed')).toBe('slow');
    });
});
