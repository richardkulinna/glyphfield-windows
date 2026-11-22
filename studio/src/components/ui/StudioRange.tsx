'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type InputEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';

type StudioRangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  entryFactor?: number;
  entryOffset?: number;
  openMax?: boolean;
  openMin?: boolean;
  onValueCommit?: (value: number) => void;
};

type StudioRangeStyle = CSSProperties & {
  '--studio-range-progress': string;
};

function numericValue(value: StudioRangeProps['value'] | StudioRangeProps['defaultValue'], fallback: number): number {
  const resolved = Array.isArray(value) ? value[0] : value;
  const parsed = Number(resolved);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function progressFor(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function setProgress(input: HTMLInputElement) {
  const min = numericValue(input.min, 0);
  const max = numericValue(input.max, 100);
  const value = numericValue(input.value, min);
  input.style.setProperty('--studio-range-progress', `${progressFor(value, min, max)}%`);
}

const StudioRange = forwardRef<HTMLInputElement, StudioRangeProps>(function StudioRange({
  className = '',
  entryFactor = 1,
  entryOffset = 0,
  defaultValue,
  max = 100,
  min = 0,
  openMax = false,
  openMin = false,
  onValueCommit,
  onClick,
  onInput,
  onPointerUp,
  style,
  value,
  ...props
}, ref) {
  const rangeRef = useRef<HTMLInputElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const done = useRef(false);
  const connect = useCallback((input: HTMLInputElement | null) => {
    rangeRef.current = input;
    if (typeof ref === 'function') return ref(input);
    if (ref) ref.current = input;
  }, [ref]);
  const numericCurrentValue = numericValue(value ?? defaultValue, numericValue(min, 0));
  const numericMin = openMin ? Math.min(numericValue(min, 0), numericCurrentValue) : numericValue(min, 0);
  const numericMax = openMax ? Math.max(numericValue(max, 100), numericCurrentValue) : numericValue(max, 100);
  const beginEntry = useCallback(() => {
    const range = rangeRef.current;
    if (!range || range.disabled) return;
    done.current = false;
    setDraft(String(Number((Number(range.value) * entryFactor + entryOffset).toPrecision(15))));
  }, [entryFactor, entryOffset]);
  useEffect(() => {
    const range = rangeRef.current;
    const labels = new Set(range?.labels ?? []);
    const parentLabel = range?.closest('label');
    if (parentLabel) labels.add(parentLabel);
    function fromLabel(event: globalThis.MouseEvent) {
      if (event.target instanceof Element && event.target.closest('output, .studio-range-value')) {
        event.preventDefault();
        beginEntry();
      }
    }
    for (const label of labels) label.addEventListener('dblclick', fromLabel);
    return () => { for (const label of labels) label.removeEventListener('dblclick', fromLabel); };
  }, [beginEntry]);
  const editing = draft !== null;
  useEffect(() => {
    if (editing) {
      manualRef.current?.focus();
      manualRef.current?.select();
    }
  }, [editing]);
  function finish(accept: boolean, focus: boolean) {
    if (done.current) return;
    const input = rangeRef.current;
    const next = (Number(draft?.trim().replace(',', '.')) - entryOffset) / entryFactor;
    const valid = Boolean(draft?.trim()) && Number.isFinite(next)
      && (openMin || next >= numericMin) && (openMax || next <= numericMax);
    if (accept && focus && !valid) {
      const hints = [
        !openMin && `minimum ${numericMin * entryFactor + entryOffset}`,
        !openMax && `maximum ${numericMax * entryFactor + entryOffset}`,
      ].filter(Boolean).join(', ');
      manualRef.current?.setCustomValidity(`Enter a finite number${hints ? ' (' + hints + ')' : ''}.`);
      manualRef.current?.reportValidity();
      return;
    }
    done.current = true;
    if (input && accept && valid) {
      if (onValueCommit) onValueCommit(next);
      else {
        // Dispatch through the original native control, including keyboard/preview handlers.
        if (next > numericMax && openMax) input.max = String(next);
        if (next < numericMin && openMin) input.min = String(next);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    setDraft(null);
    if (focus) requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  }
  const rangeStyle = {
    ...style,
    ...(editing ? { display: 'none' } : {}),
    '--studio-range-progress': `${progressFor(numericCurrentValue, numericMin, numericMax)}%`,
  } as StudioRangeStyle;

  function handleInput(event: InputEvent<HTMLInputElement>) {
    setProgress(event.currentTarget);
    onInput?.(event);
  }

  function handlePointerUp(event: PointerEvent<HTMLInputElement>) {
    onPointerUp?.(event);
    if (event.defaultPrevented || event.currentTarget.disabled || event.button !== 0 || event.isPrimary === false) return;
    // Safari's mousedown default action blurs pointerdown focus. Wait until the
    // gesture ends so native dragging finishes before assigning keyboard focus.
    event.currentTarget.focus({ preventScroll: true });
  }

  function handleClick(event: MouseEvent<HTMLInputElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.currentTarget.disabled || event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
  }

  return (
    <>
    <input
      {...props}
      className={`studio-range ${className}`.trim()}
      data-studio-range='true'
      defaultValue={defaultValue}
      max={numericMax}
      min={numericMin}
      hidden={editing}
      title={props.title ?? 'Double-click or press F2 to enter a value'}
      onDoubleClick={e => { props.onDoubleClick?.(e); if (!e.defaultPrevented) beginEntry(); }}
      onKeyDown={e => {
        props.onKeyDown?.(e);
        if (!e.defaultPrevented && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); e.stopPropagation(); beginEntry(); }
      }}
      onClick={handleClick}
      onInput={handleInput}
      onPointerUp={handlePointerUp}
      ref={connect}
      style={rangeStyle}
      type='range'
      value={value}
    />
    {editing && <input
      aria-label={props['aria-label'] || 'Exact value'}
      aria-labelledby={props['aria-labelledby']}
      className='h-8 min-w-12 w-full rounded border border-input bg-background px-2 text-sm tabular-nums text-foreground'
      inputMode='decimal'
      onBlur={() => finish(true, false)}
      onChange={e => { e.currentTarget.setCustomValidity(''); setDraft(e.currentTarget.value); }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          finish(e.key === 'Enter', true);
        }
      }}
      ref={manualRef}
      type='text'
      value={draft}
    />}
    </>
  );
});

export default StudioRange;
