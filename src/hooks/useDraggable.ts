import React from 'react';

export type TPoint = { x: number; y: number };

const MOVE_THRESHOLD = 5;

const readSaved = (key: string): TPoint | null => {
    try {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
        return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
    } catch {
        return null;
    }
};

/** Keeps an element of this size fully inside the window. */
export const clampToViewport = (point: TPoint, width: number, height: number, margin = 6): TPoint => ({
    x: Math.min(Math.max(point.x, margin), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(point.y, margin), Math.max(margin, window.innerHeight - height - margin)),
});

/**
 * Drag an element (mouse or touch) to any point on the screen and remember where it was left.
 * `position` is null until the element is first moved, so it keeps its normal CSS place.
 * After a drag, the click that ends it is ignored (`consumeDrag()` returns true once).
 */
export const useDraggable = <T extends HTMLElement>(storage_key: string) => {
    const ref = React.useRef<T>(null);
    const [position, setPosition] = React.useState<TPoint | null>(() => readSaved(storage_key));
    const start = React.useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
    const just_dragged = React.useRef(false);

    const save = React.useCallback(
        (point: TPoint | null) => {
            try {
                if (point) localStorage.setItem(storage_key, JSON.stringify(point));
                else localStorage.removeItem(storage_key);
            } catch {
                // Only remembered for this visit.
            }
        },
        [storage_key]
    );

    // Stay on screen when the window gets smaller or the phone rotates.
    React.useEffect(() => {
        const onResize = () =>
            setPosition(previous => {
                const el = ref.current;
                if (!previous || !el) return previous;
                return clampToViewport(previous, el.offsetWidth, el.offsetHeight);
            });
        window.addEventListener('resize', onResize);
        onResize();
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onPointerDown = (e: React.PointerEvent<T>) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        start.current = { px: e.clientX, py: e.clientY, ox: rect.left, oy: rect.top, moved: false };
    };

    const onPointerMove = (e: React.PointerEvent<T>) => {
        const s = start.current;
        const el = ref.current;
        if (!s || !el) return;
        const dx = e.clientX - s.px;
        const dy = e.clientY - s.py;
        if (!s.moved) {
            if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
            s.moved = true;
            el.setPointerCapture?.(e.pointerId);
        }
        e.preventDefault();
        setPosition(clampToViewport({ x: s.ox + dx, y: s.oy + dy }, el.offsetWidth, el.offsetHeight));
    };

    const onPointerUp = () => {
        const s = start.current;
        start.current = null;
        if (!s?.moved) return;
        just_dragged.current = true;
        setPosition(current => {
            save(current);
            return current;
        });
    };

    /** True (once) right after a drag, so the button doesn't also open. */
    const consumeDrag = () => {
        const was = just_dragged.current;
        just_dragged.current = false;
        return was;
    };

    const reset = () => {
        setPosition(null);
        save(null);
    };

    const style: React.CSSProperties | undefined = position
        ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto', insetInlineEnd: 'auto' }
        : undefined;

    return {
        ref,
        position,
        style,
        reset,
        consumeDrag,
        handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    };
};
