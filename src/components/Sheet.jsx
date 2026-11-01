import { useEffect, useRef } from 'preact/hooks';
import { IconBack } from './icons.jsx';

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/** Bottom sheet. Swipe down from the top (or tap outside) to close. */
export function Sheet({ onClose, title, sub, label, children }) {
  const ref = useRef(null);
  const drag = useRef(null);
  useEscape(onClose);

  const onTouchStart = (e) => {
    if (ref.current.scrollTop > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.transition = 'none';
    ref.current.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const onTouchEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = '';
    ref.current.style.transform = '';
    if (dy > 110) onClose();
  };

  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div
        class="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label || title}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div class="grabber" aria-hidden="true" />
        {title && <h2 class="sheet-title">{title}</h2>}
        {sub && <p class="sheet-sub">{sub}</p>}
        {children}
      </div>
    </>
  );
}

/** Full-screen page with a navigation bar. `from="bottom"` slides up like a modal. */
export function Page({ title, onBack, backLabel = 'Back', right, from = 'right', children }) {
  useEscape(onBack);
  return (
    <div class={`page from-${from}`} role="dialog" aria-modal="true" aria-label={title}>
      <div class="page-bar">
        <button class="bar-btn" onClick={onBack}>
          {from === 'bottom' ? (
            backLabel
          ) : (
            <>
              <IconBack size={22} /> {backLabel}
            </>
          )}
        </button>
        <div class="page-bar-title">{title}</div>
        <div style="justify-self:end">{right}</div>
      </div>
      <div class="page-body">
        <div class="inner">{children}</div>
      </div>
    </div>
  );
}
