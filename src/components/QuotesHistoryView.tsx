import React, { useState } from 'react';
import { Download, FileText, Trash2 } from 'lucide-react';
import { QuoteSubjectSummary, SavedQuote, UserProfile } from '../types/verdeza';
import { formatArea, formatCOP, formatDateES } from '../utils/calculations';
import { generateQuotePDF } from '../utils/pdfGenerator';
import { ConfirmModal } from './ConfirmModal';
import { GoogleSignInButton } from './GoogleSignInButton';

interface QuotesHistoryViewProps {
  quotes: SavedQuote[];
  loading: boolean;
  user: UserProfile | null;
  onSignIn: () => void;
  onLoadQuote: (quote: SavedQuote) => void;
  onDeleteQuote: (quoteId: string) => Promise<void>;
  onGoToCotizador: () => void;
}

export const QuotesHistoryView: React.FC<QuotesHistoryViewProps> = ({
  quotes,
  loading,
  user,
  onSignIn,
  onLoadQuote,
  onDeleteQuote,
  onGoToCotizador,
}) => {
  const [pendingDelete, setPendingDelete] = useState<SavedQuote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (quote: SavedQuote) => {
    setDownloadingId(quote.id);
    try {
      const lotsIncluded =
        quote.lotsIncluded && quote.lotsIncluded.length > 0
          ? quote.lotsIncluded
          : [
              {
                id: quote.lotId,
                code: quote.lotCode,
                ubicacion: quote.lotCategory,
                areaM2: quote.lotAreaM2,
                valorLote: quote.calculation.valorBrutoTotal ?? quote.calculation.valorLote,
              },
            ];

      const subject: QuoteSubjectSummary = {
        mode: quote.mode || 'single',
        displayCode: quote.lotCode,
        displayCategory: quote.lotCategory,
        totalAreaM2: quote.lotAreaM2,
        averageValorM2:
          quote.lotAreaM2 > 0
            ? Math.round((quote.calculation.valorBrutoTotal ?? quote.calculation.valorLote) / quote.lotAreaM2)
            : 0,
        lotsIncluded,
      };

      await generateQuotePDF({
        quoteNumber: quote.quoteNumber,
        subject,
        statusLabel: quote.reservedLot ? 'Separado' : 'Disponible',
        client: quote.client,
        advisor: quote.advisor,
        config: quote.config,
        calculation: quote.calculation,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDeleteQuote(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (!user) {
    return (
      <section className="max-w-xl mx-auto my-12 bg-white border border-[#E2E8E2] rounded-xl p-8 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-[#ECF4EE] text-[#14532D] flex items-center justify-center mx-auto">
          <FileText className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-xl font-bold text-[#0F1F14]">
            Accede a tus cotizaciones guardadas
          </h1>
          <p className="text-sm text-[#4B5E52] leading-relaxed">
            Regístrate o inicia sesión con tu cuenta de Google para guardar el historial de tus clientes, cargar cotizaciones anteriores y descargar sus PDFs cuando los necesites.
          </p>
        </div>
        <div className="pt-2 flex justify-center">
          <GoogleSignInButton onClick={onSignIn} label="Registrarse / Entrar con Google" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F1F14]">
            Historial de Cotizaciones
          </h1>
          <p className="mt-1 text-sm text-[#4B5E52]">
            Cotizaciones registradas por {user.displayName} ({user.email}).
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToCotizador}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Nueva Cotización
        </button>
      </div>

      <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-[#F2F6F3] rounded animate-pulse" />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <p className="text-sm font-medium text-[#0F1F14]">
              Aún no tienes cotizaciones guardadas en tu cuenta.
            </p>
            <p className="text-xs text-[#5B6E62]">
              Selecciona un lote disponible en el Cotizador, ingresa los datos del cliente y presiona &quot;Guardar Cotización&quot;.
            </p>
            <button
              type="button"
              onClick={onGoToCotizador}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors cursor-pointer"
            >
              Ir al Cotizador
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAF8] border-b border-[#E2E8E2] text-[11px] font-semibold text-[#5B6E62] uppercase tracking-wider">
                  <th className="py-3 px-4">No. Cotización</th>
                  <th className="py-3 px-3">Lote(s)</th>
                  <th className="py-3 px-3">Futuro Comprador</th>
                  <th className="py-3 px-3">Fecha Sep.</th>
                  <th className="py-3 px-3 text-right">Valor Plan</th>
                  <th className="py-3 px-3 text-right">Cuota 48 Meses</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE] text-sm">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-[#F8FAF8] transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono-tabular text-xs font-semibold text-[#0F1F14]">
                        {quote.quoteNumber}
                      </span>
                      {quote.reservedLot && (
                        <span className="block text-[11px] font-medium text-[#B45309]">
                          Con separación aplicada
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="font-display font-semibold text-[#0F1F14]">
                        {quote.lotCode}
                      </span>
                      <span className="block text-xs text-[#5B6E62]">
                        {formatArea(quote.lotAreaM2)} · {quote.lotCategory}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-[#0F1F14]">{quote.client.nombresApellidos}</p>
                      <p className="text-xs text-[#5B6E62]">
                        {quote.client.tipoIdentificacion} {quote.client.numeroIdentificacion || 'S/N'}{' '}
                        {quote.client.telefono ? `· ${quote.client.telefono}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-xs text-[#4B5E52] whitespace-nowrap">
                      {formatDateES(quote.config.fechaSeparacion)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-tabular text-xs font-semibold text-[#0F1F14] whitespace-nowrap">
                      {formatCOP(quote.calculation.valorTotalAPagar)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-tabular text-xs font-semibold text-[#14532D] whitespace-nowrap">
                      {formatCOP(quote.calculation.cuota48MensualBase)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onLoadQuote(quote)}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#334139] bg-white border border-[#D4DED7] hover:bg-[#F2F6F3] rounded-md transition-colors cursor-pointer"
                        >
                          Cargar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(quote)}
                          disabled={downloadingId === quote.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#166534] rounded-md transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{downloadingId === quote.id ? 'Generando...' : 'PDF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(quote)}
                          aria-label={`Eliminar cotización ${quote.quoteNumber}`}
                          className="p-1.5 text-[#5B6E62] hover:text-[#B91C1C] rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={`Eliminar ${pendingDelete?.quoteNumber ?? ''}`}
        description="¿Seguro que deseas eliminar esta cotización de tu historial? Esta acción no modifica el estado actual del lote en inventario."
        confirmLabel="Eliminar cotización"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
};
