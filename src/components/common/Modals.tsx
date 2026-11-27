import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

function Dialog({ label, description, onClose, children, maxWidth }: {
  label: string; description?: string; onClose: () => void; children: React.ReactNode; maxWidth: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={label} aria-describedby={description}
      onCancel={event => { event.preventDefault(); onClose(); }}
      className={`m-auto max-h-[90vh] w-[calc(100%-2rem)] ${maxWidth} overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl backdrop:bg-slate-900/60`}>
      {children}
    </dialog>
  );
}

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ isOpen, onClose, title, children, maxWidth = 'md' }) => {
  const label = useId();
  if (!isOpen) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' }[maxWidth];

  return (
    <Dialog label={label} onClose={onClose} maxWidth={width}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h3 id={label} className="text-base font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={onClose} aria-label="Close dialog"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </Dialog>
  );
};

export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', isDangerous = false }) => {
  const label = useId();
  const description = useId();
  if (!isOpen) return null;

  return (
    <Dialog label={label} description={description} onClose={onClose} maxWidth="max-w-sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isDangerous ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 id={label} className="text-base font-bold text-slate-900">{title}</h3>
            <p id={description} className="mt-1 text-xs leading-relaxed text-slate-700">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose}
            className="min-h-11 rounded-lg bg-slate-100 px-4 text-xs font-semibold text-slate-800 hover:bg-slate-200">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }}
            className={`min-h-11 rounded-lg px-4 text-xs font-semibold text-white ${isDangerous ? 'bg-rose-700 hover:bg-rose-800' : 'bg-blue-700 hover:bg-blue-800'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
