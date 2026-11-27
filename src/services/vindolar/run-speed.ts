/**
 * Bot run speed, set with the Slow / Fast switch beside Run.
 * Fast: the next run starts as soon as the last contract settles (Deriv Bot's normal behaviour).
 * Slow: the bot waits a few seconds between runs so each result can be followed.
 */
import { observable, runInAction } from 'mobx';

export type TRunSpeed = 'slow' | 'fast';

const STORAGE_KEY = 'vd_run_speed';
export const SLOW_PAUSE_MS = 3000;

const readSaved = (): TRunSpeed => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'slow' ? 'slow' : 'fast';
    } catch {
        return 'fast';
    }
};

export const run_speed = observable.box<TRunSpeed>(readSaved());

export const setRunSpeed = (speed: TRunSpeed) => {
    runInAction(() => run_speed.set(speed));
    try {
        localStorage.setItem(STORAGE_KEY, speed);
    } catch {
        // Not saved for next time; the switch still works for this visit.
    }
};

/** Pause before the next run, read fresh each time so the switch works while the bot runs. */
export const getRunPauseMs = () => (run_speed.get() === 'slow' ? SLOW_PAUSE_MS : 0);
