import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1F14]/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-[#D4DED7] rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 p-2 rounded-lg shrink-0 ${
                destructive ? 'bg-red-50 text-red-700' : 'bg-[#ECF4EE] text-[#14532D]'
              }`}
            >
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="confirm-modal-title"
                className="font-display text-base font-semibold text-[#0F1F14]"
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm text-[#4B5E52] leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Cerrar diálogo"
            className="p-1.5 text-[#5B6E62] hover:text-[#0F1F14] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 bg-[#F8FAF8] border-t border-[#E2E8E2] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-[#334139] bg-white border border-[#D4DED7] rounded-lg hover:bg-[#F2F6F3] transition-colors whitespace-nowrap cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
              destructive
                ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                : 'bg-[#14532D] hover:bg-[#166534]'
            }`}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
