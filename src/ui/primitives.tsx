import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { animation } from '../animation/AnimationController';
import { money } from '../utils/format';

/** Accessible glass modal: focus trap-lite, Escape to close, restores focus. */
export function Modal({ title, onClose, children, wide, labelledBy = 'modal-title', dismissable = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; labelledBy?: string; dismissable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('[data-autofocus], button, [href], input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose, dismissable]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div ref={ref} className={`glass modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <header className="modal-head">
          <h2 id={labelledBy}>{title}</h2>
          {dismissable && (
            <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
              <X size={18} />
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Count-up money text that follows the animation controller without re-rendering React per frame. */
export function WinCounter({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const off = animation.on('win-count', (v) => {
      if (ref.current) ref.current.textContent = money(v as number);
    });
    return off;
  }, []);
  return <span ref={ref} className={className} />;
}
