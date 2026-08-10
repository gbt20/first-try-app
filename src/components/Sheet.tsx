import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  /** Rendered on the right of the header — usually a Save button. */
  action?: ReactNode;
  closeLabel?: string;
  children: ReactNode;
}

/** A full-screen page that slides up over the tabs. */
export function Sheet({ title, onClose, action, closeLabel = 'Close', children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stops the page underneath from scrolling behind the sheet on iOS.
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, [onClose]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="sheet-header">
        <button type="button" className="text-button" onClick={onClose}>
          {closeLabel}
        </button>
        <h2>{title}</h2>
        <div className="sheet-action">{action}</div>
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
