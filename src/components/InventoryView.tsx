import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Layers, Lock, Search, XCircle } from 'lucide-react';
import { Lot, LotCategory, LotStatus, UserProfile } from '../types/verdeza';
import { formatArea, formatCOP } from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';
import { GoogleSignInButton } from './GoogleSignInButton';

interface InventoryViewProps {
  lots: Lot[];
  loading: boolean;
  user: UserProfile | null;
  onSignIn: () => void;
  onSelectLotForQuote: (lot: Lot) => void;
  onSelectCombinedLotsForQuote: (lotsToCombine: Lot[]) => void;
  onUpdateLotStatus: (lotId: number, nextStatus: LotStatus) => Promise<void>;
}

const STATUS_OPTIONS: Array<'Todos' | LotStatus> = [
  'Todos',
  'Disponible',
  'Separado',
  'Vendido',
  'Bloqueado',
];

const CATEGORY_OPTIONS: Array<'Todas' | LotCategory> = [
  'Todas',
  'LOTE',
  'ESQUINERO',
  'LUXURY',
  'L.C.',
];

function StatusLabel({ status }: { status: LotStatus }) {
  if (status === 'Disponible') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Disponible
      </span>
    );
  }
  if (status === 'Separado') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B45309] whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Separado
      </span>
    );
  }
  if (status === 'Vendido') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Vendido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] whitespace-nowrap">
      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Bloqueado
    </span>
  );
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  lots,
  loading,
  user,
  onSignIn,
  onSelectLotForQuote,
  onSelectCombinedLotsForQuote,
  onUpdateLotStatus,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | LotStatus>('Disponible');
  const [categoryFilter, setCategoryFilter] = useState<'Todas' | LotCategory>('Todas');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{ lot: Lot; nextStatus: LotStatus } | null>(
    null
  );
  const [updating, setUpdating] = useState(false);

  const summary = useMemo(() => {
    return {
      total: lots.length,
      disponibles: lots.filter((l) => l.estado === 'Disponible').length,
      separados: lots.filter((l) => l.estado === 'Separado').length,
      vendidos: lots.filter((l) => l.estado === 'Vendido').length,
      bloqueados: lots.filter((l) => l.estado === 'Bloqueado').length,
    };
  }, [lots]);

  const selectedLots = useMemo(() => {
    return selectedIds
      .map((id) => lots.find((l) => l.id === id))
      .filter((l): l is Lot => Boolean(l && l.estado === 'Disponible'));
  }, [lots, selectedIds]);

  const combinedTotalValue = useMemo(
    () => selectedLots.reduce((sum, l) => sum + l.valorLote, 0),
    [selectedLots]
  );
  const combinedTotalArea = useMemo(
    () => selectedLots.reduce((sum, l) => sum + l.areaM2, 0),
    [selectedLots]
  );

  const filteredLots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lots.filter((lot) => {
      if (statusFilter !== 'Todos' && lot.estado !== statusFilter) return false;
      if (categoryFilter !== 'Todas' && lot.ubicacion !== categoryFilter) return false;
      if (q) {
        const matchesCode = lot.code.toLowerCase().includes(q) || String(lot.id).includes(q);
        const matchesCat = lot.ubicacion.toLowerCase().includes(q);
        const matchesMz = (lot.manzana || '').toLowerCase().includes(q);
        if (!matchesCode && !matchesCat && !matchesMz) return false;
      }
      return true;
    });
  }, [lots, search, statusFilter, categoryFilter]);

  const toggleSelectLot = (lot: Lot) => {
    if (lot.estado !== 'Disponible') return;
    setSelectionWarning(null);
    setSelectedIds((prev) => {
      if (prev.includes(lot.id)) {
        return prev.filter((id) => id !== lot.id);
      }
      if (prev.length >= 2) {
        setSelectionWarning('Solo puedes seleccionar hasta 2 lotes para cotizarlos como uno solo.');
        return prev;
      }
      return [...prev, lot.id];
    });
  };

  const handleConfirmUpdate = async () => {
    if (!pendingUpdate) return;
    setUpdating(true);
    try {
      await onUpdateLotStatus(pendingUpdate.lot.id, pendingUpdate.nextStatus);
      setSelectedIds((prev) => prev.filter((id) => id !== pendingUpdate.lot.id));
      setPendingUpdate(null);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Header & Summary Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F1F14]">
            Inventario General de Lotes 2026
          </h1>
          <p className="mt-1 text-sm text-[#4B5E52]">
            Marca hasta 2 lotes disponibles para cotizarlos juntos como uno solo, o actualiza el estado cuando un lote sea separado o vendido.
          </p>
        </div>

        {!user && (
          <div className="flex items-center gap-3 bg-white border border-[#D4DED7] rounded-xl px-4 py-2.5">
            <span className="text-xs text-[#4B5E52]">
              Inicia sesión con Google para cambiar disponibilidad:
            </span>
            <GoogleSignInButton onClick={onSignIn} label="Entrar con Google" />
          </div>
        )}
      </div>

      {/* 4-column Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-4">
          <p className="text-xs font-medium text-[#5B6E62]">Total Lotes Proyecto</p>
          <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-[#0F1F14]">
            {summary.total}
          </p>
          <p className="mt-1 text-xs text-[#5B6E62]">Lista oficial 2026</p>
        </div>
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-4">
          <p className="text-xs font-medium text-[#15803D]">Disponibles</p>
          <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-[#15803D]">
            {summary.disponibles}
          </p>
          <p className="mt-1 text-xs text-[#5B6E62]">Listos para cotizar</p>
        </div>
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-4">
          <p className="text-xs font-medium text-[#B45309]">Separados</p>
          <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-[#B45309]">
            {summary.separados}
          </p>
          <p className="mt-1 text-xs text-[#5B6E62]">En proceso de compra</p>
        </div>
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-4">
          <p className="text-xs font-medium text-[#B91C1C]">Vendidos / Bloqueados</p>
          <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-[#0F1F14]">
            {summary.vendidos + summary.bloqueados}
          </p>
          <p className="mt-1 text-xs text-[#5B6E62]">
            {summary.vendidos} vendidos · {summary.bloqueados} bloqueados
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-[#E2E8E2] rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative w-full lg:w-80">
            <Search
              className="w-4 h-4 text-[#5B6E62] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número de lote (ej. 42, 134)..."
              aria-label="Buscar lote por número o categoría"
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAF8] border border-[#D4DED7] rounded-lg text-[#0F1F14] placeholder-[#6B7D72] focus:outline-none focus:border-[#14532D]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F2F6F3] rounded-lg">
            {STATUS_OPTIONS.map((status) => {
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#0F1F14] shadow-xs font-semibold'
                      : 'text-[#4B5E52] hover:text-[#0F1F14]'
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#EDF2EE]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[#5B6E62]">Ubicación / Tipo:</span>
            <div className="flex flex-wrap items-center gap-1">
              {CATEGORY_OPTIONS.map((cat) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#14532D] text-white border-[#14532D]'
                        : 'bg-white text-[#4B5E52] border-[#D4DED7] hover:border-[#14532D]/40'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-[#5B6E62] tabular-nums">
            Mostrando {filteredLots.length} de {lots.length} lotes
          </p>
        </div>
      </div>

      {/* Multi-select Combined Quote Action Bar */}
      {(selectedLots.length > 0 || selectionWarning) && (
        <div className="bg-[#ECF4EE] border border-[#B7D7C2] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#14532D]">
              <Layers className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {selectedLots.length === 2
                  ? `2 lotes seleccionados: ${selectedLots[0].code} + ${selectedLots[1].code}`
                  : `1 lote seleccionado: ${selectedLots[0]?.code ?? ''} (selecciona otro para combinarlos)`}
              </span>
            </div>
            {selectedLots.length > 0 && (
              <p className="text-xs text-[#334139] font-mono-tabular">
                Área sumada: {formatArea(combinedTotalArea)} · Sumatoria bruta: {formatCOP(combinedTotalValue)}
              </p>
            )}
            {selectionWarning && (
              <p className="text-xs font-medium text-[#B45309]">{selectionWarning}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                setSelectionWarning(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-[#334139] bg-white border border-[#D4DED7] rounded-lg hover:bg-[#F8FAF8] transition-colors cursor-pointer"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedLots.length === 1) {
                  onSelectLotForQuote(selectedLots[0]);
                } else if (selectedLots.length === 2) {
                  onSelectCombinedLotsForQuote(selectedLots);
                }
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {selectedLots.length === 2 ? 'Cotizar 2 lotes combinados' : 'Cotizar lote seleccionado'}
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-10 bg-[#F2F6F3] rounded animate-pulse" />
            ))}
          </div>
        ) : filteredLots.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-medium text-[#0F1F14]">
              No hay lotes que coincidan con los filtros seleccionados.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('Todos');
                setCategoryFilter('Todas');
              }}
              className="px-4 py-2 text-xs font-medium text-[#14532D] bg-[#ECF4EE] rounded-lg hover:bg-[#DCECE1] transition-colors cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAF8] border-b border-[#E2E8E2] text-[11px] font-semibold text-[#5B6E62] uppercase tracking-wider">
                  <th className="py-3 px-3 w-10 text-center">Comb.</th>
                  <th className="py-3 px-3">Lote</th>
                  <th className="py-3 px-3">Categoría</th>
                  <th className="py-3 px-3 text-right">Área (m²)</th>
                  <th className="py-3 px-3 text-right">Valor / m²</th>
                  <th className="py-3 px-3 text-right">Valor Total</th>
                  <th className="py-3 px-3 text-right">C.I. 20% (-$1M)</th>
                  <th className="py-3 px-3 text-right">Cuota 48 Meses</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE] text-sm">
                {filteredLots.map((lot) => {
                  const ciNeto = Math.max(0, Math.round(lot.valorLote * 0.2) - 1000000);
                  const saldo80 = lot.valorLote - Math.round(lot.valorLote * 0.2);
                  const cuota48 = Math.round(saldo80 / 48);
                  const isChecked = selectedIds.includes(lot.id);

                  return (
                    <tr
                      key={lot.id}
                      className={`transition-colors ${
                        isChecked ? 'bg-[#ECF4EE]/60' : 'hover:bg-[#F8FAF8]'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={lot.estado !== 'Disponible'}
                          onChange={() => toggleSelectLot(lot)}
                          aria-label={`Seleccionar ${lot.code} para cotización combinada`}
                          className="w-4 h-4 accent-[#14532D] rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-display font-semibold text-[#0F1F14] whitespace-nowrap">
                        {lot.code}
                        {lot.manzana && (
                          <span className="ml-2 text-xs font-normal text-[#5B6E62]">
                            · {lot.manzana}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#4B5E52] whitespace-nowrap">
                        {lot.ubicacion}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs text-[#0F1F14] whitespace-nowrap">
                        {formatArea(lot.areaM2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs text-[#4B5E52] whitespace-nowrap">
                        {formatCOP(lot.valorM2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs font-semibold text-[#0F1F14] whitespace-nowrap">
                        {formatCOP(lot.valorLote)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs text-[#4B5E52] whitespace-nowrap">
                        {formatCOP(ciNeto)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs font-medium text-[#14532D] whitespace-nowrap">
                        {formatCOP(cuota48)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <StatusLabel status={lot.estado} />
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <select
                            aria-label={`Cambiar estado de ${lot.code}`}
                            value={lot.estado}
                            onChange={(e) => {
                              const next = e.target.value as LotStatus;
                              if (next === lot.estado) return;
                              if (!user) {
                                onSignIn();
                                return;
                              }
                              setPendingUpdate({ lot, nextStatus: next });
                            }}
                            className="text-xs bg-white border border-[#D4DED7] rounded-md px-2 py-1 text-[#334139] focus:outline-none focus:border-[#14532D] cursor-pointer"
                          >
                            <option value="Disponible">Disponible</option>
                            <option value="Separado">Separado</option>
                            <option value="Vendido">Vendido</option>
                            <option value="Bloqueado">Bloqueado</option>
                          </select>

                          {lot.estado === 'Disponible' && (
                            <button
                              type="button"
                              onClick={() => onSelectLotForQuote(lot)}
                              className="px-3 py-1 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#166534] rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Cotizar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(pendingUpdate)}
        title={`Actualizar estado de ${pendingUpdate?.lot.code ?? ''}`}
        description={
          pendingUpdate
            ? `¿Confirmas cambiar la disponibilidad del ${pendingUpdate.lot.code} de "${pendingUpdate.lot.estado}" a "${pendingUpdate.nextStatus}"? Este cambio se reflejará de inmediato en el cotizador.`
            : ''
        }
        confirmLabel="Confirmar cambio"
        destructive={pendingUpdate?.nextStatus === 'Vendido' || pendingUpdate?.nextStatus === 'Bloqueado'}
        loading={updating}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingUpdate(null)}
      />
    </section>
  );
};
