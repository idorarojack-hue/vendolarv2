import { observer } from 'mobx-react-lite';
import { run_speed, setRunSpeed, SLOW_PAUSE_MS } from '@/services/vindolar/run-speed';
import { localize } from '@deriv-com/translations';

/** "Execution: Slow / Fast" switch beside Run. Can be changed while the bot is running. */
const RunSpeedSwitch = observer(() => {
    const is_fast = run_speed.get() === 'fast';
    const seconds = SLOW_PAUSE_MS / 1000;

    return (
        <button
            type='button'
            role='switch'
            aria-checked={is_fast}
            className={`run-speed ${is_fast ? 'run-speed--fast' : 'run-speed--slow'}`}
            title={
                is_fast
                    ? localize('Fast: the next run starts as soon as the last contract settles.')
                    : localize('Slow: waits {{seconds}} seconds between runs.', { seconds })
            }
            onClick={() => setRunSpeed(is_fast ? 'slow' : 'fast')}
        >
            <span className='run-speed__text'>
                <small>{localize('Execution')}</small>
                <strong>{is_fast ? localize('Fast') : localize('Slow')}</strong>
            </span>
            <span className='run-speed__track' aria-hidden='true'>
                <span className='run-speed__thumb' />
            </span>
        </button>
    );
});

export default RunSpeedSwitch;
