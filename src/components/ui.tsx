import clsx from 'clsx';
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        variant === 'primary' && 'bg-amber-500 text-slate-950 hover:bg-amber-400',
        variant === 'secondary' && 'bg-slate-800 text-slate-100 hover:bg-slate-700',
        variant === 'ghost' && 'text-slate-300 hover:bg-slate-800 hover:text-white',
        variant === 'danger' && 'bg-rose-600/80 text-white hover:bg-rose-500',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1 text-xs', className)}>
      <span className="font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none';

export function TextInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className={clsx(inputCls, className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}

/** Number input that keeps free-form text while typing and commits valid numbers on blur/Enter. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  className,
  integer,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'min' | 'max'> & {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  integer?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [synced, setSynced] = useState(value);
  // Pick up external changes (undo, other editors) unless the user is mid-edit.
  if (!focused && value !== synced) {
    setSynced(value);
    setText(String(value));
  }

  const commit = () => {
    let n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onChange(n);
  };

  return (
    <div className={clsx('relative', className)}>
      <input
        inputMode="decimal"
        className={clsx(inputCls, suffix && 'pr-9')}
        value={text}
        step={step}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        onChange={(e) => setText(e.target.value)}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <select
      className={clsx(inputCls, 'pr-6', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        className="h-4 w-4 accent-amber-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean | 'full';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        className={clsx(
          'flex max-h-[92vh] w-full flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl',
          wide === 'full' ? 'h-[92vh] max-w-[1400px]' : wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: 'slate' | 'amber' | 'rose' | 'emerald' | 'sky';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tone === 'slate' && 'bg-slate-800 text-slate-300',
        tone === 'amber' && 'bg-amber-500/15 text-amber-300',
        tone === 'rose' && 'bg-rose-500/15 text-rose-300',
        tone === 'emerald' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'sky' && 'bg-sky-500/15 text-sky-300',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('rounded-xl border border-slate-800 bg-slate-900/60', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 p-10 text-center">
      <p className="font-medium text-slate-300">{title}</p>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}
