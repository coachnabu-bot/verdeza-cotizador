import React, { useMemo, useState } from 'react';
import {
  BookmarkCheck,
  CheckCircle2,
  Download,
  Lock,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  AdvisorData,
  ClientData,
  IdentificationType,
  Lot,
  LotCategory,
  QuoteCalculation,
  QuoteConfig,
  QuoteMode,
  QuoteSubjectSummary,
  UserProfile,
} from '../types/verdeza';
import {
  DEFAULT_OFFEROR,
  formatArea,
  formatCOP,
  formatDateES,
} from '../utils/calculations';
import { generateQuotePDF } from '../utils/pdfGenerator';
import { ConfirmModal } from './ConfirmModal';
import { GoogleSignInButton } from './GoogleSignInButton';

interface CotizadorViewProps {
  lots: Lot[];
  selectedLot: Lot | null;
  secondaryLot: Lot | null;
  subject: QuoteSubjectSummary | null;
  onSelectLot: (lot: Lot) => void;
  onSelectSecondaryLot: (lot: Lot | null) => void;
  config: QuoteConfig;
  onConfigChange: (next: QuoteConfig) => void;
  client: ClientData;
  onClientChange: (next: ClientData) => void;
  advisor: AdvisorData;
  onAdvisorChange: (next: AdvisorData) => void;
  calculation: QuoteCalculation | null;
  user: UserProfile | null;
  onSignIn: () => void;
  onSaveQuote: (reserveLot: boolean) => Promise<string | null>;
  onGoToInventory: () => void;
}

type ScheduleFilter = 'all' | 'inicial' | 'saldo48';

export const CotizadorView: React.FC<CotizadorViewProps> = ({
  lots,
  selectedLot,
  secondaryLot,
  subject,
  onSelectLot,
  onSelectSecondaryLot,
  config,
  onConfigChange,
  client,
  onClientChange,
  advisor,
  onAdvisorChange,
  calculation,
  user,
  onSignIn,
  onSaveQuote,
  onGoToInventory,
}) => {
  const [lotSearch, setLotSearch] = useState('');
  const [lotCategoryFilter, setLotCategoryFilter] = useState<'Todas' | LotCategory>('Todas');
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const availableLots = useMemo(() => {
    const q = lotSearch.trim().toLowerCase();
    return lots.filter((l) => {
      if (l.estado !== 'Disponible') return false;
      if (lotCategoryFilter !== 'Todas' && l.ubicacion !== lotCategoryFilter) return false;
      if (q) {
        return (
          l.code.toLowerCase().includes(q) ||
          String(l.id).includes(q) ||
          l.ubicacion.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [lots, lotSearch, lotCategoryFilter]);

  const totalAvailableCount = useMemo(
    () => lots.filter((l) => l.estado === 'Disponible').length,
    [lots]
  );

  const filteredSchedule = useMemo(() => {
    if (!calculation) return [];
    if (scheduleFilter === 'inicial') {
      return calculation.schedule.filter((item) => item.etapa !== 'Saldo Financiado (80%)');
    }
    if (scheduleFilter === 'saldo48') {
      return calculation.schedule.filter((item) => item.etapa === 'Saldo Financiado (80%)');
    }
    return calculation.schedule;
  }, [calculation, scheduleFilter]);

  const canReserveFromInventory = useMemo(() => {
    if (config.mode === 'manual') return false;
    if (!selectedLot || selectedLot.estado !== 'Disponible') return false;
    if (config.mode === 'combined') {
      return Boolean(
        secondaryLot &&
          secondaryLot.id !== selectedLot.id &&
          secondaryLot.estado === 'Disponible'
      );
    }
    return true;
  }, [config.mode, selectedLot, secondaryLot]);

  const handleModeChange = (nextMode: QuoteMode) => {
    if (nextMode === 'combined') {
      let nextSecondaryId = config.secondaryLotId;
      if (!nextSecondaryId || nextSecondaryId === selectedLot?.id) {
        const another = lots.find(
          (l) => l.estado === 'Disponible' && l.id !== selectedLot?.id
        );
        nextSecondaryId = another ? another.id : null;
      }
      onConfigChange({
        ...config,
        mode: nextMode,
        secondaryLotId: nextSecondaryId,
      });
      return;
    }

    if (nextMode === 'manual') {
      const prefill1 =
        config.manualLot1.valorLote > 0
          ? config.manualLot1
          : selectedLot
          ? {
              codigo: selectedLot.code,
              ubicacion: selectedLot.ubicacion,
              areaM2: selectedLot.areaM2,
              valorLote: selectedLot.valorLote,
            }
          : config.manualLot1;

      const prefill2 =
        config.manualLot2.valorLote > 0
          ? config.manualLot2
          : secondaryLot
          ? {
              codigo: secondaryLot.code,
              ubicacion: secondaryLot.ubicacion,
              areaM2: secondaryLot.areaM2,
              valorLote: secondaryLot.valorLote,
            }
          : config.manualLot2;

      onConfigChange({
        ...config,
        mode: 'manual',
        manualLot1: prefill1,
        manualLot2: prefill2,
      });
      return;
    }

    onConfigChange({ ...config, mode: 'single' });
  };

  const handleDownloadPDF = async () => {
    if (!subject || !calculation) return;
    setDownloadingPdf(true);
    setFeedbackBanner(null);
    try {
      const refNum =
        config.mode === 'manual'
          ? 'MAN'
          : config.mode === 'combined'
          ? `${selectedLot?.id ?? 0}-${secondaryLot?.id ?? 0}`
          : String(selectedLot?.id ?? 0).padStart(3, '0');
      const previewQuoteNo = `COT-${new Date().getFullYear()}-${refNum}`;
      const statusLabel =
        config.mode === 'manual'
          ? 'Excepción Manual'
          : canReserveFromInventory
          ? 'Disponible'
          : selectedLot?.estado || 'Cotización';

      await generateQuotePDF({
        quoteNumber: previewQuoteNo,
        subject,
        statusLabel,
        client,
        advisor,
        config,
        calculation,
      });
      setFeedbackBanner({
        type: 'success',
        message: `PDF de cotización generado con el logo oficial de Verdeza para ${subject.displayCode}.`,
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        message: 'No se pudo generar el PDF. Inténtalo nuevamente.',
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSave = async (reserveLot: boolean) => {
    if (!user) {
      onSignIn();
      return;
    }
    if (!client.nombresApellidos.trim()) {
      setFeedbackBanner({
        type: 'error',
        message: 'Por favor ingresa los nombres y apellidos del futuro comprador antes de guardar.',
      });
      setReserveModalOpen(false);
      return;
    }
    setSaving(true);
    setFeedbackBanner(null);
    try {
      const quoteNumber = await onSaveQuote(reserveLot);
      if (quoteNumber) {
        setFeedbackBanner({
          type: 'success',
          message: reserveLot
            ? `Cotización ${quoteNumber} guardada y ${subject?.displayCode} actualizado(s) a estado "Separado".`
            : `Cotización ${quoteNumber} guardada en tu historial de Google.`,
        });
      }
      setReserveModalOpen(false);
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al guardar la cotización.',
      });
    } finally {
      setSaving(false);
    }
  };

  const ciPercentageWidth =
    calculation && calculation.valorTotalAPagar > 0
      ? Math.round(
          ((calculation.valorSeparacion + calculation.cuotaInicialNeta) /
            calculation.valorTotalAPagar) *
            100
        )
      : 20;

  return (
    <div className="space-y-6">
      {/* Page Intro + Auth Callout */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1F14] [text-wrap:balance]">
            Cotizador Automatizado de Lotes Campestres
          </h1>
          <p className="mt-1 text-sm text-[#4B5E52]">
            Plan 20% Cuota Inicial (menos separación) · 80% a 48 cuotas mensuales · Soporta lote individual, 2 lotes combinados o excepción manual · {totalAvailableCount} disponibles.
          </p>
        </div>

        {!user && (
          <div className="flex flex-wrap items-center gap-3 bg-white border border-[#D4DED7] rounded-xl px-4 py-2.5 shrink-0">
            <span className="text-xs font-medium text-[#334139]">
              Regístrate para guardar y separar lotes:
            </span>
            <GoogleSignInButton onClick={onSignIn} label="Registrarse con Google" />
          </div>
        )}
      </div>

      {feedbackBanner && (
        <div
          role="status"
          className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border text-sm ${
            feedbackBanner.type === 'success'
              ? 'bg-[#ECF4EE] border-[#B7D7C2] text-[#14532D]'
              : 'bg-red-50 border-red-200 text-[#991B1B]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-semibold underline shrink-0 cursor-pointer"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Configuration & Forms (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step 1: Mode & Lot Selection */}
          <div className="bg-white border border-[#E2E8E2] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#0F1F14]">
                01. Selección de Lote(s)
              </h2>
              <button
                type="button"
                onClick={onGoToInventory}
                className="text-xs font-medium text-[#14532D] hover:underline whitespace-nowrap cursor-pointer"
              >
                Seleccionar en inventario
              </button>
            </div>

            {/* Mode Segmented Control */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F2F6F3] rounded-lg">
              {(
                [
                  { id: 'single', label: '1 Lote' },
                  { id: 'combined', label: '2 Lotes (Uno)' },
                  { id: 'manual', label: 'Manual' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeChange(m.id)}
                  className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    config.mode === m.id
                      ? 'bg-white text-[#14532D] font-semibold shadow-xs'
                      : 'text-[#4B5E52] hover:text-[#0F1F14]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {config.mode !== 'manual' ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search
                      className="w-4 h-4 text-[#5B6E62] absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={lotSearch}
                      onChange={(e) => setLotSearch(e.target.value)}
                      placeholder="Filtrar lote (ej. 42, 134)..."
                      aria-label="Filtrar lotes disponibles"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                  <select
                    aria-label="Filtrar por categoría de lote"
                    value={lotCategoryFilter}
                    onChange={(e) => setLotCategoryFilter(e.target.value as 'Todas' | LotCategory)}
                    className="px-3 py-2 text-xs font-medium bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#334139] focus:outline-none focus:border-[#14532D]"
                  >
                    <option value="Todas">Todas las categorías</option>
                    <option value="LOTE">LOTE ($186.180/m²)</option>
                    <option value="ESQUINERO">ESQUINERO ($196.880/m²)</option>
                    <option value="LUXURY">LUXURY ($207.580/m²)</option>
                  </select>
                </div>

                {/* Primary Lot */}
                <div>
                  <label htmlFor="lot-select" className="block text-xs font-medium text-[#4B5E52] mb-1.5">
                    {config.mode === 'combined' ? 'Lote 1 (Disponible)' : `Lotes disponibles (${availableLots.length})`}
                  </label>
                  <select
                    id="lot-select"
                    value={selectedLot?.id ?? ''}
                    onChange={(e) => {
                      const found = lots.find((l) => l.id === Number(e.target.value));
                      if (found) onSelectLot(found);
                    }}
                    className="w-full px-3 py-2.5 text-sm font-medium bg-white border border-[#C7D4CB] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  >
                    {selectedLot && selectedLot.estado !== 'Disponible' && (
                      <option value={selectedLot.id}>
                        {selectedLot.code} ({selectedLot.estado}) · {formatArea(selectedLot.areaM2)} ·{' '}
                        {formatCOP(selectedLot.valorLote)}
                      </option>
                    )}
                    {availableLots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.code} · {lot.ubicacion} · {formatArea(lot.areaM2)} · {formatCOP(lot.valorLote)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Secondary Lot when in Combined Mode */}
                {config.mode === 'combined' && (
                  <div>
                    <label
                      htmlFor="lot-select-2"
                      className="block text-xs font-medium text-[#4B5E52] mb-1.5"
                    >
                      Lote 2 (Disponible para unificar)
                    </label>
                    <select
                      id="lot-select-2"
                      value={secondaryLot?.id ?? ''}
                      onChange={(e) => {
                        const found = lots.find((l) => l.id === Number(e.target.value)) || null;
                        onSelectSecondaryLot(found);
                      }}
                      className="w-full px-3 py-2.5 text-sm font-medium bg-white border border-[#C7D4CB] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                    >
                      <option value="">Selecciona el segundo lote...</option>
                      {secondaryLot && secondaryLot.estado !== 'Disponible' && (
                        <option value={secondaryLot.id}>
                          {secondaryLot.code} ({secondaryLot.estado}) · {formatArea(secondaryLot.areaM2)} ·{' '}
                          {formatCOP(secondaryLot.valorLote)}
                        </option>
                      )}
                      {availableLots
                        .filter((l) => l.id !== selectedLot?.id)
                        .map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.code} · {lot.ubicacion} · {formatArea(lot.areaM2)} · {formatCOP(lot.valorLote)}
                          </option>
                        ))}
                    </select>
                    {secondaryLot && secondaryLot.id === selectedLot?.id && (
                      <p className="mt-1 text-xs text-[#B91C1C]">
                        El Lote 2 debe ser diferente al Lote 1.
                      </p>
                    )}
                  </div>
                )}

                {subject && (
                  <div className="pt-3 border-t border-[#EDF2EE] space-y-1.5 text-xs">
                    {subject.lotsIncluded.map((item) => (
                      <div key={item.code} className="flex items-center justify-between text-[#4B5E52]">
                        <span>
                          <strong className="text-[#0F1F14]">{item.code}</strong> · {item.ubicacion} ·{' '}
                          <span className="font-mono-tabular">{formatArea(item.areaM2)}</span>
                        </span>
                        <span className="font-mono-tabular font-medium text-[#0F1F14]">
                          {formatCOP(item.valorLote)}
                        </span>
                      </div>
                    ))}
                    {subject.lotsIncluded.length > 1 && (
                      <div className="pt-1.5 border-t border-[#EDF2EE] flex items-center justify-between font-semibold text-[#14532D]">
                        <span>
                          Sumatoria Unificada ({formatArea(subject.totalAreaM2)})
                        </span>
                        <span className="font-mono-tabular">
                          {formatCOP(calculation?.valorBrutoTotal ?? 0)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Manual Mode (allows 1 or 2 manual lots combined) */
              <div className="space-y-4">
                <p className="text-xs text-[#4B5E52]">
                  Ingresa manualmente los valores de uno o dos lotes para unificarlos en una sola cotización excepcional.
                </p>

                {/* Manual Lot 1 */}
                <div className="p-3 bg-[#F8FAF8] border border-[#E2E8E2] rounded-lg space-y-2.5">
                  <p className="text-xs font-semibold text-[#0F1F14]">Lote Manual 1</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="man1-code" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Código / Nombre
                      </label>
                      <input
                        id="man1-code"
                        type="text"
                        value={config.manualLot1.codigo}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot1: { ...config.manualLot1, codigo: e.target.value },
                          })
                        }
                        placeholder="Ej. LOTE 42"
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                    <div>
                      <label htmlFor="man1-area" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Área (m²)
                      </label>
                      <input
                        id="man1-area"
                        type="number"
                        min={0}
                        step={0.01}
                        value={config.manualLot1.areaM2}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot1: {
                              ...config.manualLot1,
                              areaM2: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="man1-cat" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Ubicación / Tipo
                      </label>
                      <input
                        id="man1-cat"
                        type="text"
                        value={config.manualLot1.ubicacion}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot1: { ...config.manualLot1, ubicacion: e.target.value },
                          })
                        }
                        placeholder="LOTE / ESQUINERO"
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                    <div>
                      <label htmlFor="man1-val" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Valor Lote 1 (COP)
                      </label>
                      <input
                        id="man1-val"
                        type="number"
                        min={0}
                        step={100000}
                        value={config.manualLot1.valorLote}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot1: {
                              ...config.manualLot1,
                              valorLote: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                  </div>
                </div>

                {/* Manual Lot 2 */}
                <div className="p-3 bg-[#F8FAF8] border border-[#E2E8E2] rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#0F1F14]">Lote Manual 2 (opcional)</p>
                    {config.manualLot2.valorLote > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onConfigChange({
                            ...config,
                            manualLot2: { codigo: '', ubicacion: 'LOTE', areaM2: 0, valorLote: 0 },
                          })
                        }
                        className="text-[11px] text-[#5B6E62] hover:text-[#B91C1C] cursor-pointer"
                      >
                        Limpiar Lote 2
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="man2-code" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Código / Nombre
                      </label>
                      <input
                        id="man2-code"
                        type="text"
                        value={config.manualLot2.codigo}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot2: { ...config.manualLot2, codigo: e.target.value },
                          })
                        }
                        placeholder="Ej. LOTE 44"
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                    <div>
                      <label htmlFor="man2-area" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Área (m²)
                      </label>
                      <input
                        id="man2-area"
                        type="number"
                        min={0}
                        step={0.01}
                        value={config.manualLot2.areaM2}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot2: {
                              ...config.manualLot2,
                              areaM2: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="man2-cat" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Ubicación / Tipo
                      </label>
                      <input
                        id="man2-cat"
                        type="text"
                        value={config.manualLot2.ubicacion}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot2: { ...config.manualLot2, ubicacion: e.target.value },
                          })
                        }
                        placeholder="LOTE / ESQUINERO"
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                    <div>
                      <label htmlFor="man2-val" className="block text-[11px] font-medium text-[#4B5E52] mb-1">
                        Valor Lote 2 (COP)
                      </label>
                      <input
                        id="man2-val"
                        type="number"
                        min={0}
                        step={100000}
                        value={config.manualLot2.valorLote}
                        onChange={(e) =>
                          onConfigChange({
                            ...config,
                            manualLot2: {
                              ...config.manualLot2,
                              valorLote: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#D4DED7] rounded-md text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                      />
                    </div>
                  </div>
                </div>

                {subject && (
                  <div className="pt-2 border-t border-[#EDF2EE] flex items-center justify-between text-xs font-semibold text-[#14532D]">
                    <span>Sumatoria Manual ({formatArea(subject.totalAreaM2)})</span>
                    <span className="font-mono-tabular">
                      {formatCOP(calculation?.valorBrutoTotal ?? 0)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Financial Plan Settings */}
          <div className="bg-white border border-[#E2E8E2] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0F1F14]">
              02. Parámetros del Plan de Pagos
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="fecha-sep" className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Fecha de Separación
                </label>
                <input
                  id="fecha-sep"
                  type="date"
                  value={config.fechaSeparacion}
                  onChange={(e) =>
                    onConfigChange({ ...config, fechaSeparacion: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label htmlFor="manzana-input" className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Manzana (opcional)
                </label>
                <input
                  id="manzana-input"
                  type="text"
                  value={config.manzana}
                  onChange={(e) => onConfigChange({ ...config, manzana: e.target.value })}
                  placeholder="Ej. MZ 16"
                  maxLength={32}
                  className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>
            </div>

            {/* Discount ONLY on 80% Financed Balance (% or COP) */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="desc-total" className="text-xs font-medium text-[#4B5E52]">
                  Descuento sobre el 80% Financiado
                </label>
                <div
                  role="group"
                  aria-label="Tipo de descuento sobre el 80% financiado"
                  className="inline-flex p-0.5 bg-[#F2F6F3] border border-[#D4DED7] rounded-md"
                >
                  <button
                    type="button"
                    onClick={() => onConfigChange({ ...config, descuentoTotalTipo: 'pct' })}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                      (config.descuentoTotalTipo ?? 'pct') === 'pct'
                        ? 'bg-[#14532D] text-white'
                        : 'text-[#4B5E52] hover:text-[#0F1F14]'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfigChange({ ...config, descuentoTotalTipo: 'cop' })}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                      config.descuentoTotalTipo === 'cop'
                        ? 'bg-[#14532D] text-white'
                        : 'text-[#4B5E52] hover:text-[#0F1F14]'
                    }`}
                  >
                    $ COP
                  </button>
                </div>
              </div>

              {config.descuentoTotalTipo === 'cop' ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {[0, 2000000, 5000000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          onConfigChange({
                            ...config,
                            descuentoTotalTipo: 'cop',
                            descuentoTotalValorFijo: val,
                          })
                        }
                        className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                          (config.descuentoTotalValorFijo ?? 0) === val
                            ? 'bg-[#14532D] text-white border-[#14532D]'
                            : 'bg-[#F8FAF8] text-[#334139] border-[#D4DED7] hover:border-[#14532D]/50'
                        }`}
                      >
                        {val === 0 ? '$0' : `$${val / 1000000}M`}
                      </button>
                    ))}
                    <input
                      id="desc-total"
                      type="number"
                      min={0}
                      max={calculation?.saldo80Bruto || undefined}
                      step={500000}
                      value={config.descuentoTotalValorFijo ?? 0}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          descuentoTotalTipo: 'cop',
                          descuentoTotalValorFijo: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                      aria-label="Valor en pesos de descuento sobre el 80% financiado"
                      className="w-full px-2.5 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                  {calculation && (
                    <p className="text-[11px] text-[#5B6E62]">
                      Equivale al <strong className="font-mono-tabular text-[#14532D]">{calculation.descuentoTotalPctEfectivo ?? 0}%</strong> sobre el 80% financiado ({formatCOP(calculation.descuentoTotalValor)}). La C.I. del 20% se mantiene intacta.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    {[0, 5, 10].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() =>
                          onConfigChange({
                            ...config,
                            descuentoTotalTipo: 'pct',
                            descuentoTotalPct: pct,
                          })
                        }
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          config.descuentoTotalPct === pct
                            ? 'bg-[#14532D] text-white border-[#14532D]'
                            : 'bg-[#F8FAF8] text-[#334139] border-[#D4DED7] hover:border-[#14532D]/50'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                    <input
                      id="desc-total"
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={config.descuentoTotalPct}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          descuentoTotalTipo: 'pct',
                          descuentoTotalPct: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                        })
                      }
                      aria-label="Porcentaje de descuento sobre el 80% financiado"
                      className="w-full px-2.5 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#5B6E62]">
                    Aplica únicamente sobre el 80% financiado a 48 meses; el 20% de Cuota Inicial se calcula sobre el valor total sin descuento.
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="valor-sep" className="text-xs font-medium text-[#4B5E52]">
                    Separación (COP)
                  </label>
                  {config.valorSeparacion !== 1000000 && (
                    <button
                      type="button"
                      onClick={() => onConfigChange({ ...config, valorSeparacion: 1000000 })}
                      className="inline-flex items-center gap-1 text-[11px] text-[#14532D] hover:underline cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      $1.000.000
                    </button>
                  )}
                </div>
                <input
                  id="valor-sep"
                  type="number"
                  min={0}
                  step={100000}
                  value={config.valorSeparacion}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      valorSeparacion: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Cuota Inicial (20% fija)
                </span>
                <div className="w-full px-3 py-2 text-sm font-mono-tabular font-semibold bg-[#F2F6F3] border border-[#D4DED7] rounded-lg text-[#0F1F14]">
                  {calculation ? formatCOP(calculation.cuotaInicial20Bruta) : '$ 0'}
                </div>
                <p className="mt-1 text-[11px] text-[#5B6E62]">
                  20% exacto del valor del/los lote(s).
                </p>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-[#4B5E52] mb-1.5">
                Forma de pago del excedente de Cuota Inicial (20% - Separación)
              </span>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#F2F6F3] rounded-lg">
                {([1, 2, 3, 4] as const).map((meses) => (
                  <button
                    key={meses}
                    type="button"
                    onClick={() => onConfigChange({ ...config, cuotasCiMeses: meses })}
                    className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      config.cuotasCiMeses === meses
                        ? 'bg-white text-[#14532D] font-semibold shadow-xs'
                        : 'text-[#4B5E52] hover:text-[#0F1F14]'
                    }`}
                  >
                    {meses} {meses === 1 ? 'cuota' : 'cuotas'}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[#5B6E62]">
                El 80% restante se difiere automáticamente en 48 cuotas mensuales consecutivas.
              </p>
            </div>
          </div>

          {/* Step 3: Client & Advisor Data */}
          <div className="bg-white border border-[#E2E8E2] rounded-xl p-5 space-y-5">
            <div className="space-y-3.5">
              <h2 className="font-display text-base font-bold text-[#0F1F14]">
                03. Datos del Futuro Comprador (Cliente)
              </h2>

              <div>
                <label htmlFor="cli-name" className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Nombres y Apellidos *
                </label>
                <input
                  id="cli-name"
                  type="text"
                  value={client.nombresApellidos}
                  onChange={(e) =>
                    onClientChange({ ...client, nombresApellidos: e.target.value })
                  }
                  placeholder="Ej. Liliana Montoya Patiño"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="cli-id-type" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Tipo Doc.
                  </label>
                  <select
                    id="cli-id-type"
                    value={client.tipoIdentificacion}
                    onChange={(e) =>
                      onClientChange({
                        ...client,
                        tipoIdentificacion: e.target.value as IdentificationType,
                      })
                    }
                    className="w-full px-2.5 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  >
                    <option value="C.C.">C.C.</option>
                    <option value="C.E.">C.E.</option>
                    <option value="PA.">PA.</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="cli-id-num" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Número de Identificación
                  </label>
                  <input
                    id="cli-id-num"
                    type="text"
                    value={client.numeroIdentificacion}
                    onChange={(e) =>
                      onClientChange({ ...client, numeroIdentificacion: e.target.value })
                    }
                    placeholder="Ej. 42.095.205"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cli-phone" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    No. Contacto
                  </label>
                  <input
                    id="cli-phone"
                    type="tel"
                    value={client.telefono}
                    onChange={(e) => onClientChange({ ...client, telefono: e.target.value })}
                    placeholder="Ej. 302 124 3434"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label htmlFor="cli-city" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Ciudad
                  </label>
                  <input
                    id="cli-city"
                    type="text"
                    value={client.ciudad}
                    onChange={(e) => onClientChange({ ...client, ciudad: e.target.value })}
                    placeholder="Ej. Cartagena"
                    className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cli-email" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    id="cli-email"
                    type="email"
                    value={client.correo}
                    onChange={(e) => onClientChange({ ...client, correo: e.target.value })}
                    placeholder="cliente@correo.com"
                    className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label htmlFor="cli-company" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Empresa / Actividad Comercial
                  </label>
                  <input
                    id="cli-company"
                    type="text"
                    value={client.empresaActividad}
                    onChange={(e) =>
                      onClientChange({ ...client, empresaActividad: e.target.value })
                    }
                    placeholder="Ej. Independiente"
                    className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cli-addr" className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Dirección de Residencia
                </label>
                <input
                  id="cli-addr"
                  type="text"
                  value={client.direccion}
                  onChange={(e) => onClientChange({ ...client, direccion: e.target.value })}
                  placeholder="Ej. El Country Manzana H Lote 21"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>
            </div>

            <div className="pt-5 border-t border-[#EDF2EE] space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-[#0F1F14]">
                  04. Datos del Asesor Comercial
                </h3>
                <span className="text-[11px] text-[#5B6E62]">
                  {DEFAULT_OFFEROR.nombre}
                </span>
              </div>

              <div>
                <label htmlFor="adv-name" className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Nombre del Asesor(a)
                </label>
                <input
                  id="adv-name"
                  type="text"
                  value={advisor.nombre}
                  onChange={(e) => onAdvisorChange({ ...advisor, nombre: e.target.value })}
                  placeholder="Ej. Gustavo Daza Dejanon"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adv-phone" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Teléfono Asesor
                  </label>
                  <input
                    id="adv-phone"
                    type="tel"
                    value={advisor.telefono}
                    onChange={(e) => onAdvisorChange({ ...advisor, telefono: e.target.value })}
                    placeholder="Ej. 300 000 0000"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label htmlFor="adv-email" className="block text-xs font-medium text-[#4B5E52] mb-1">
                    Correo Asesor
                  </label>
                  <input
                    id="adv-email"
                    type="email"
                    value={advisor.correo}
                    onChange={(e) => onAdvisorChange({ ...advisor, correo: e.target.value })}
                    placeholder="asesor@verdeza.com"
                    className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="obs-extra" className="block text-xs font-medium text-[#4B5E52] mb-1">
                  Observaciones adicionales para el PDF (opcional)
                </label>
                <textarea
                  id="obs-extra"
                  rows={2}
                  value={config.observacionesAdicionales}
                  onChange={(e) =>
                    onConfigChange({ ...config, observacionesAdicionales: e.target.value })
                  }
                  placeholder="Notas sobre unificación de lotes, descuentos o fechas..."
                  className="w-full px-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] focus:outline-none focus:border-[#14532D]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Breakdown & 48-Month Schedule (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!subject || !calculation ? (
            <div className="bg-white border border-[#E2E8E2] rounded-xl p-10 text-center">
              <p className="text-sm font-medium text-[#0F1F14]">
                Completa los lotes o el valor manual para calcular el plan de pagos.
              </p>
              <p className="mt-1 text-xs text-[#5B6E62]">
                En modo combinado selecciona 2 lotes diferentes o en modo manual ingresa al menos un valor mayor a $0.
              </p>
            </div>
          ) : (
            <>
              {/* Financial Breakdown Card */}
              <div className="bg-white border border-[#E2E8E2] rounded-xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#5B6E62]">
                      Desglose Automatizado · {subject.displayCode} · {formatArea(subject.totalAreaM2)}
                    </p>
                    <h2 className="mt-0.5 font-display text-lg font-bold text-[#0F1F14]">
                      Estructura de Pagos (20% Inicial / 80% a 48 Meses)
                    </h2>
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadPDF}
                      disabled={downloadingPdf}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{downloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSave(false)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#14532D] bg-[#ECF4EE] hover:bg-[#DCECE1] border border-[#C3DFCC] rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Guardar</span>
                    </button>

                    {canReserveFromInventory && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            onSignIn();
                            return;
                          }
                          setReserveModalOpen(true);
                        }}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#92400E] bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                      >
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {subject.lotsIncluded.length > 1 ? 'Separar Ambos Lotes' : 'Separar Lote'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Discount Strip when 80% Discount > 0 */}
                {calculation.descuentoTotalValor > 0 && (
                  <div className="px-3.5 py-2.5 bg-[#ECF4EE] border border-[#C3DFCC] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#334139]">
                      80% Financiado bruto:{' '}
                      <strong className="font-mono-tabular">
                        {formatCOP(calculation.saldo80Bruto ?? calculation.valorBrutoTotal - calculation.cuotaInicial20Bruta)}
                      </strong>
                      {' · '}Descuento aplicado al 80% ({calculation.descuentoTotalPctEfectivo ?? 0}%):{' '}
                      <strong className="font-mono-tabular text-[#14532D]">
                        -{formatCOP(calculation.descuentoTotalValor)}
                      </strong>
                    </span>
                    <span className="font-semibold text-[#14532D] font-mono-tabular">
                      80% Neto (48 cuotas): {formatCOP(calculation.saldo80)}
                    </span>
                  </div>
                )}

                {/* 4-Metric Financial Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#EDF2EE]">
                  <div className="p-3 bg-[#F8FAF8] rounded-lg">
                    <p className="text-[11px] font-medium text-[#5B6E62]">
                      Valor Lote (100%)
                    </p>
                    <p className="mt-1 font-mono-tabular text-base font-bold text-[#0F1F14]">
                      {formatCOP(calculation.valorBrutoTotal)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5B6E62]">
                      {calculation.descuentoTotalValor > 0
                        ? `Plan neto: ${formatCOP(calculation.valorTotalAPagar)}`
                        : subject.lotsIncluded.length > 1
                        ? `${subject.lotsIncluded.length} lotes unificados`
                        : subject.averageValorM2 > 0
                        ? `${formatCOP(subject.averageValorM2)} / m²`
                        : 'Ingreso manual'}
                    </p>
                  </div>

                  <div className="p-3 bg-[#F8FAF8] rounded-lg">
                    <p className="text-[11px] font-medium text-[#5B6E62]">Separación</p>
                    <p className="mt-1 font-mono-tabular text-base font-bold text-[#0F1F14]">
                      {formatCOP(calculation.valorSeparacion)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5B6E62]">
                      Descontada del 20%
                    </p>
                  </div>

                  <div className="p-3 bg-[#F8FAF8] rounded-lg">
                    <p className="text-[11px] font-medium text-[#5B6E62]">
                      C.I. Neta ({config.cuotasCiMeses} {config.cuotasCiMeses === 1 ? 'cuota' : 'cuotas'})
                    </p>
                    <p className="mt-1 font-mono-tabular text-base font-bold text-[#0F1F14]">
                      {formatCOP(calculation.cuotaInicialNeta)}
                    </p>
                    <p className="mt-0.5 font-mono-tabular text-[11px] text-[#5B6E62]">
                      {config.cuotasCiMeses > 1
                        ? `~${formatCOP(calculation.cuotaCiMensualPromedio)} / mes`
                        : `20% fijo: ${formatCOP(calculation.cuotaInicial20Bruta)}`}
                    </p>
                  </div>

                  <div className="p-3 bg-[#ECF4EE] border border-[#C3DFCC] rounded-lg">
                    <p className="text-[11px] font-semibold text-[#14532D]">
                      Cuota 48 Meses (80%)
                    </p>
                    <p className="mt-1 font-mono-tabular text-base font-bold text-[#14532D]">
                      {formatCOP(calculation.cuota48MensualBase)}
                    </p>
                    <p className="mt-0.5 font-mono-tabular text-[11px] text-[#166534]">
                      Saldo neto: {formatCOP(calculation.saldo80)}
                    </p>
                  </div>
                </div>

                {/* Visual Allocation Bar + Exact Math Equation */}
                <div className="space-y-2.5 pt-1">
                  <div className="h-2.5 w-full bg-[#E6ECE8] rounded-full overflow-hidden flex">
                    <div
                      style={{
                        width: `${
                          calculation.valorTotalAPagar > 0
                            ? Math.max(
                                2,
                                Math.round(
                                  (calculation.valorSeparacion / calculation.valorTotalAPagar) * 100
                                )
                              )
                            : 2
                        }%`,
                      }}
                      className="bg-[#B45309] h-full"
                      title="Separación"
                    />
                    <div
                      style={{
                        width: `${
                          calculation.valorTotalAPagar > 0
                            ? Math.max(
                                4,
                                ciPercentageWidth -
                                  Math.round(
                                    (calculation.valorSeparacion / calculation.valorTotalAPagar) * 100
                                  )
                              )
                            : 18
                        }%`,
                      }}
                      className="bg-[#3F7D58] h-full"
                      title="Cuota Inicial Neta"
                    />
                    <div className="bg-[#14532D] h-full flex-1" title="Saldo 80% a 48 meses" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4B5E52]">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#B45309]" aria-hidden="true" />
                        Separación ({formatCOP(calculation.valorSeparacion)})
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#3F7D58]" aria-hidden="true" />
                        C.I. Neta ({formatCOP(calculation.cuotaInicialNeta)})
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#14532D]" aria-hidden="true" />
                        80% en 48 cuotas ({formatCOP(calculation.saldo80)})
                      </span>
                    </div>
                    <span className="font-mono-tabular font-semibold text-[#14532D]">
                      Total = {formatCOP(calculation.sumaCronograma)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Automated 48-Month Amortization Schedule */}
              <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden">
                <div className="p-4 sm:px-5 border-b border-[#E2E8E2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-[#0F1F14]">
                      Cronograma Mensual Automatizado ({calculation.schedule.length} pagos)
                    </h3>
                    <p className="text-xs text-[#5B6E62]">
                      Cuenta de pagos: {DEFAULT_OFFEROR.banco} Ahorros {DEFAULT_OFFEROR.numeroCuenta}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-[#F2F6F3] rounded-lg self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setScheduleFilter('all')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        scheduleFilter === 'all'
                          ? 'bg-white text-[#0F1F14] shadow-xs font-semibold'
                          : 'text-[#4B5E52]'
                      }`}
                    >
                      Todos ({calculation.schedule.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleFilter('inicial')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        scheduleFilter === 'inicial'
                          ? 'bg-white text-[#0F1F14] shadow-xs font-semibold'
                          : 'text-[#4B5E52]'
                      }`}
                    >
                      Sep. + C.I.
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleFilter('saldo48')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        scheduleFilter === 'saldo48'
                          ? 'bg-white text-[#0F1F14] shadow-xs font-semibold'
                          : 'text-[#4B5E52]'
                      }`}
                    >
                      48 Cuotas (80%)
                    </button>
                  </div>
                </div>

                <div className="max-h-[540px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#F8FAF8] border-b border-[#E2E8E2] z-10">
                      <tr className="text-[11px] font-semibold text-[#5B6E62] uppercase tracking-wider">
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-3">Concepto</th>
                        <th className="py-2.5 px-3">Fecha Pago</th>
                        <th className="py-2.5 px-3 text-right">Valor Cuota</th>
                        <th className="py-2.5 px-4 text-right">Saldo Restante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDF2EE] text-xs">
                      {filteredSchedule.map((row) => {
                        const isSep = row.etapa === 'Separación';
                        const isCi = row.etapa === 'Cuota Inicial (20%)';
                        return (
                          <tr
                            key={`${row.numero}-${row.concepto}`}
                            className={
                              isSep
                                ? 'bg-amber-50/40'
                                : isCi
                                ? 'bg-[#F8FAF8]'
                                : 'hover:bg-[#F8FAF8]'
                            }
                          >
                            <td className="py-2 px-4 font-mono-tabular font-semibold text-[#4B5E52] whitespace-nowrap">
                              {row.numero === 0 ? 'SEP' : row.numero}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-medium text-[#0F1F14]">{row.concepto}</span>
                              <span className="ml-2 text-[11px] text-[#5B6E62]">· {row.etapa}</span>
                            </td>
                            <td className="py-2 px-3 font-mono-tabular text-[#4B5E52] whitespace-nowrap">
                              {formatDateES(row.fechaPago)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-tabular font-semibold text-[#0F1F14] whitespace-nowrap">
                              {formatCOP(row.valor)}
                            </td>
                            <td className="py-2 px-4 text-right font-mono-tabular text-[#5B6E62] whitespace-nowrap">
                              {formatCOP(row.saldoRestante)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-[#ECF4EE] border-t border-[#C3DFCC]">
                      <tr className="text-xs font-bold text-[#14532D]">
                        <td className="py-3 px-4" colSpan={3}>
                          SUMA VERIFICADA DEL PLAN DE PAGOS (100%)
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular whitespace-nowrap">
                          {formatCOP(calculation.sumaCronograma)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          {formatCOP(0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={reserveModalOpen}
        title={`Separar ${subject?.displayCode ?? ''}`}
        description={`Al confirmar, se guardará la cotización para ${
          client.nombresApellidos || 'el cliente'
        } y ${
          subject && subject.lotsIncluded.length > 1 ? 'ambos lotes pasarán' : 'el lote pasará'
        } automáticamente a estado "Separado" para que no vuelva a ofrecerse como disponible.`}
        confirmLabel="Confirmar separación"
        loading={saving}
        onConfirm={() => handleSave(true)}
        onCancel={() => setReserveModalOpen(false)}
      />
    </div>
  );
};
