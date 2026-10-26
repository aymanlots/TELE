import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { useI18n } from '../i18n';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDestructive = true,
}) => {
  const { t } = useI18n();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="flex items-start gap-4">
        <div
          className={`p-2.5 rounded-lg shrink-0 ${
            isDestructive ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-neutral-300 leading-relaxed pt-1">{message}</p>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
        >
          {cancelLabel || t.cancel}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${
            isDestructive
              ? 'bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md'
              : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black shadow-md'
          }`}
        >
          {confirmLabel || t.confirm}
        </button>
      </div>
    </Modal>
  );
};
