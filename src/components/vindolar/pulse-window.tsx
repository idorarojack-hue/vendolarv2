import React, { lazy, Suspense } from 'react';
import classNames from 'classnames';
import ChunkLoader from '@/components/loader/chunk-loader';
import { localize } from '@deriv-com/translations';
import './pulse-window.scss';

const MarketScanner = lazy(() => import('@/pages/market-scanner'));

/** Dispatch on `document` to open the floating Pulse AI Scanner from anywhere. */
export const OPEN_PULSE_EVENT = 'vd:open-pulse';
export const openPulseScanner = () => document.dispatchEvent(new Event(OPEN_PULSE_EVENT));

const POSITION_KEY = 'vd_pulse_window_position';
const MARGIN = 8;

type TPosition = { x: number; y: number };

const readPosition = (): TPosition | null => {
    try {
        const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null');
        return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
    } catch {
        return null;
    }
};

/** Keep at least the title bar on screen. */
const clamp = (position: TPosition, width: number) => ({
    x: Math.min(Math.max(position.x, MARGIN - width + 120), window.innerWidth - 120),
    y: Math.min(Math.max(position.y, MARGIN), window.innerHeight - 48),
});

/**
 * The Pulse AI Scanner in a window that floats over every page. Drag it by the title bar
 * (desktop); on phones it fills the screen. Minimising keeps it running, so an auto-trading
 * session is not cut off; Close stops it.
 */
const PulseWindow = () => {
    const [mounted, setMounted] = React.useState(false);
    const [visible, setVisible] = React.useState(false);
    const [position, setPosition] = React.useState<TPosition | null>(readPosition);
    const window_ref = React.useRef<HTMLDivElement>(null);
    const drag = React.useRef<{ dx: number; dy: number } | null>(null);

    React.useEffect(() => {
        const open = () => {
            setMounted(true);
            setVisible(true);
        };
        document.addEventListener(OPEN_PULSE_EVENT, open);
        return () => document.removeEventListener(OPEN_PULSE_EVENT, open);
    }, []);

    React.useEffect(() => {
        if (visible) window_ref.current?.focus();
    }, [visible]);

    const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
        if (window.matchMedia('(max-width: 767px)').matches) return;
        if ((e.target as HTMLElement).closest('button')) return;
        const rect = window_ref.current?.getBoundingClientRect();
        if (!rect) return;
        drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
        if (!drag.current) return;
        const width = window_ref.current?.offsetWidth ?? 600;
        setPosition(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, width));
    };

    const onPointerUp = () => {
        if (!drag.current) return;
        drag.current = null;
        try {
            if (position) localStorage.setItem(POSITION_KEY, JSON.stringify(position));
        } catch {
            // Position is only remembered for this visit.
        }
    };

    const close = () => {
        setVisible(false);
        setMounted(false);
    };

    if (!mounted) return null;

    const style = position
        ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }
        : undefined;

    return (
        <div
            ref={window_ref}
            className={classNames('vd-pulse-window', { 'vd-pulse-window--hidden': !visible })}
            style={style}
            role='dialog'
            aria-label={localize('Pulse AI Scanner')}
            tabIndex={-1}
            onKeyDown={e => e.key === 'Escape' && setVisible(false)}
        >
            <header
                className='vd-pulse-window__bar'
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <span className='vd-pulse-window__grip' aria-hidden='true'>
                    ⠿
                </span>
                <strong>{localize('Pulse AI Scanner')}</strong>
                <small>{localize('Drag to move')}</small>
                <button
                    type='button'
                    className='vd-pulse-window__icon'
                    aria-label={localize('Minimise (keeps running)')}
                    title={localize('Minimise (keeps running)')}
                    onClick={() => setVisible(false)}
                >
                    –
                </button>
                <button
                    type='button'
                    className='vd-pulse-window__icon vd-pulse-window__icon--close'
                    aria-label={localize('Close and stop the scanner')}
                    title={localize('Close and stop the scanner')}
                    onClick={close}
                >
                    ×
                </button>
            </header>
            <div className='vd-pulse-window__body'>
                <Suspense fallback={<ChunkLoader message={localize('Please wait, loading...')} />}>
                    <MarketScanner />
                </Suspense>
            </div>
        </div>
    );
};

export default PulseWindow;
