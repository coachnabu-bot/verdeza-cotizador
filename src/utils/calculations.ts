import {
  Lot,
  OfferorData,
  PaymentInstallment,
  QuoteCalculation,
  QuoteConfig,
  QuoteSubjectSummary,
} from '../types/verdeza';

export const DEFAULT_OFFEROR: OfferorData = {
  nombre: 'PROMOTORA VERDEZA S.A.S',
  nit: '902015266-1',
  direccion: 'Carrera 15 No. 19-10, piso 2, Av. Pastrana - Turbaco (Bolívar)',
  correo: 'promotoraverdezasas@gmail.com',
  telefono: '6056916278',
  banco: 'BANCOLOMBIA',
  tipoCuenta: 'AHORRO',
  numeroCuenta: '098-000094-65',
};

export function formatCOP(amount: number): string {
  const rounded = Math.round(amount);
  return `$ ${rounded.toLocaleString('es-CO')}`;
}

export function formatArea(area: number): string {
  return `${area.toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}

export function formatDateES(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function addMonthsToISODate(isoDate: string, monthsToAdd: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + monthsToAdd);
    return fallback.toISOString().slice(0, 10);
  }

  const [year, month, day] = parts;
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  const mm = String(normalizedMonth + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

export function buildQuoteSubject(
  config: QuoteConfig,
  primaryLot: Lot | null,
  secondaryLot: Lot | null
): QuoteSubjectSummary | null {
  if (config.mode === 'manual') {
    const items: QuoteSubjectSummary['lotsIncluded'] = [];
    if (config.manualLot1.valorLote > 0 || config.manualLot1.areaM2 > 0 || config.manualLot1.codigo.trim()) {
      items.push({
        code: config.manualLot1.codigo.trim() || 'LOTE MANUAL 1',
        ubicacion: config.manualLot1.ubicacion.trim() || 'LOTE',
        areaM2: Math.max(0, Number(config.manualLot1.areaM2) || 0),
        valorLote: Math.max(0, Math.round(Number(config.manualLot1.valorLote) || 0)),
      });
    }
    if (config.manualLot2.valorLote > 0 || config.manualLot2.areaM2 > 0 || config.manualLot2.codigo.trim()) {
      items.push({
        code: config.manualLot2.codigo.trim() || 'LOTE MANUAL 2',
        ubicacion: config.manualLot2.ubicacion.trim() || 'LOTE',
        areaM2: Math.max(0, Number(config.manualLot2.areaM2) || 0),
        valorLote: Math.max(0, Math.round(Number(config.manualLot2.valorLote) || 0)),
      });
    }

    const totalArea = items.reduce((sum, l) => sum + l.areaM2, 0);
    const totalValue = items.reduce((sum, l) => sum + l.valorLote, 0);
    if (items.length === 0 || totalValue <= 0) return null;

    return {
      mode: 'manual',
      displayCode: items.map((l) => l.code).join(' + '),
      displayCategory: items.length > 1 ? 'COMBINADO (MANUAL)' : items[0].ubicacion,
      totalAreaM2: Number(totalArea.toFixed(2)),
      averageValorM2: totalArea > 0 ? Math.round(totalValue / totalArea) : 0,
      lotsIncluded: items,
    };
  }

  if (config.mode === 'combined') {
    const selected: Lot[] = [];
    if (primaryLot) selected.push(primaryLot);
    if (secondaryLot && secondaryLot.id !== primaryLot?.id) selected.push(secondaryLot);
    if (selected.length === 0) return null;

    const totalArea = selected.reduce((sum, l) => sum + l.areaM2, 0);
    const totalValue = selected.reduce((sum, l) => sum + l.valorLote, 0);

    return {
      mode: 'combined',
      displayCode: selected.map((l) => l.code).join(' + '),
      displayCategory:
        selected.length > 1
          ? `UNIFICACIÓN (${selected.map((l) => l.ubicacion).join(' + ')})`
          : selected[0].ubicacion,
      totalAreaM2: Number(totalArea.toFixed(2)),
      averageValorM2: totalArea > 0 ? Math.round(totalValue / totalArea) : 0,
      lotsIncluded: selected.map((l) => ({
        id: l.id,
        code: l.code,
        ubicacion: l.ubicacion,
        areaM2: l.areaM2,
        valorLote: l.valorLote,
        estado: l.estado,
      })),
    };
  }

  if (!primaryLot) return null;
  return {
    mode: 'single',
    displayCode: primaryLot.code,
    displayCategory: primaryLot.ubicacion,
    totalAreaM2: primaryLot.areaM2,
    averageValorM2: primaryLot.valorM2,
    lotsIncluded: [
      {
        id: primaryLot.id,
        code: primaryLot.code,
        ubicacion: primaryLot.ubicacion,
        areaM2: primaryLot.areaM2,
        valorLote: primaryLot.valorLote,
        estado: primaryLot.estado,
      },
    ],
  };
}

export function calculateQuoteFromGrossValue(
  grossTotalValue: number,
  config: QuoteConfig
): QuoteCalculation {
  const valorBrutoTotal = Math.max(0, Math.round(grossTotalValue));

  // 20% Cuota Inicial y 80% Financiado Bruto calculados siempre sobre el 100% del valor del/los lote(s)
  const cuotaInicial20Bruta = Math.round(valorBrutoTotal * 0.2);
  const saldo80Bruto = valorBrutoTotal - cuotaInicial20Bruta;

  // Los descuentos (en % o en pesos COP) se aplican ÚNICAMENTE al 80% del valor financiado
  const totalDiscountMode = config.descuentoTotalTipo === 'cop' ? 'cop' : 'pct';
  let descuentoTotalValor = 0;
  if (totalDiscountMode === 'cop') {
    descuentoTotalValor = Math.min(
      saldo80Bruto,
      Math.max(0, Math.round(Number(config.descuentoTotalValorFijo) || 0))
    );
  } else {
    const clampedTotalDiscountPct = Math.max(
      0,
      Math.min(50, Number(config.descuentoTotalPct) || 0)
    );
    descuentoTotalValor = Math.round(saldo80Bruto * (clampedTotalDiscountPct / 100));
  }

  const descuentoTotalPctEfectivo =
    saldo80Bruto > 0
      ? Number(((descuentoTotalValor / saldo80Bruto) * 100).toFixed(2))
      : 0;

  // Saldo neto del 80% financiado a 48 meses ya descontado
  const saldo80 = Math.max(0, saldo80Bruto - descuentoTotalValor);

  // Valor total neto a pagar de la operación (20% inicial intacto + 80% financiado neto)
  const valorLote = cuotaInicial20Bruta + saldo80;

  // Sin descuentos sobre la Cuota Inicial (el descuento solo aplica al 80%)
  const descuentoValor = 0;
  const descuentoCiPctEfectivo = 0;
  const cuotaInicialConDescuento = cuotaInicial20Bruta;

  // Separación (por defecto $1.000.000 COP) descontada de la Cuota Inicial y del valor total
  const rawSeparacion = Math.max(0, Math.round(Number(config.valorSeparacion) || 0));
  const valorSeparacion = Math.min(rawSeparacion, cuotaInicialConDescuento);
  const cuotaInicialNeta = cuotaInicialConDescuento - valorSeparacion;

  const cuotasCiMeses = Math.max(1, Math.min(4, Math.round(config.cuotasCiMeses || 1)));
  const plazoSaldoMeses = Math.max(1, Math.min(60, Math.round(config.plazoSaldoMeses || 48)));

  const valorTotalAPagar = valorSeparacion + cuotaInicialNeta + saldo80;
  let runningBalance = valorTotalAPagar;

  const schedule: PaymentInstallment[] = [];
  const startDate = config.fechaSeparacion || new Date().toISOString().slice(0, 10);

  // 1. Separación (Mes 0)
  runningBalance -= valorSeparacion;
  schedule.push({
    numero: 0,
    concepto: 'Separación',
    etapa: 'Separación',
    fechaPago: startDate,
    valor: valorSeparacion,
    saldoRestante: runningBalance,
  });

  // 2. Cuotas de la Cuota Inicial Neta
  let monthOffset = 1;
  let installmentIndex = 1;
  if (cuotaInicialNeta > 0) {
    const baseCi = Math.floor(cuotaInicialNeta / cuotasCiMeses);
    const ciRemainder = cuotaInicialNeta - baseCi * cuotasCiMeses;

    for (let i = 0; i < cuotasCiMeses; i++) {
      const amount = i === cuotasCiMeses - 1 ? baseCi + ciRemainder : baseCi;
      runningBalance -= amount;
      const label =
        cuotasCiMeses === 1
          ? 'Cuota 1 (Saldo Cuota Inicial 20%)'
          : `Cuota Inicial ${i + 1} de ${cuotasCiMeses}`;

      schedule.push({
        numero: installmentIndex,
        concepto: label,
        etapa: 'Cuota Inicial (20%)',
        fechaPago: addMonthsToISODate(startDate, monthOffset),
        valor: amount,
        saldoRestante: runningBalance,
      });
      monthOffset++;
      installmentIndex++;
    }
  }

  // 3. 48 Cuotas Mensuales del 80%
  const baseSaldoCuota = Math.floor(saldo80 / plazoSaldoMeses);
  const saldoRemainder = saldo80 - baseSaldoCuota * plazoSaldoMeses;

  for (let i = 0; i < plazoSaldoMeses; i++) {
    const amount = i === plazoSaldoMeses - 1 ? baseSaldoCuota + saldoRemainder : baseSaldoCuota;
    runningBalance -= amount;
    schedule.push({
      numero: installmentIndex,
      concepto: `Cuota ${i + 1} de ${plazoSaldoMeses} (80% Financiado)`,
      etapa: 'Saldo Financiado (80%)',
      fechaPago: addMonthsToISODate(startDate, monthOffset),
      valor: amount,
      saldoRestante: Math.max(0, runningBalance),
    });
    monthOffset++;
    installmentIndex++;
  }

  const sumaCronograma = schedule.reduce((acc, row) => acc + row.valor, 0);
  const cuotaCiMensualPromedio = Math.round(cuotaInicialNeta / cuotasCiMeses);
  const cuota48MensualBase = Math.round(saldo80 / plazoSaldoMeses);

  return {
    valorBrutoTotal,
    saldo80Bruto,
    descuentoTotalValor,
    descuentoTotalPctEfectivo,
    valorLote,
    cuotaInicial20Bruta,
    descuentoValor,
    descuentoCiPctEfectivo,
    cuotaInicialConDescuento,
    valorSeparacion,
    cuotaInicialNeta,
    cuotaCiMensualPromedio,
    saldo80,
    cuota48MensualBase,
    valorTotalAPagar,
    schedule,
    verificacionCuadre: sumaCronograma === valorTotalAPagar,
    sumaCronograma,
  };
}

export function calculateQuote(lot: Lot, config: QuoteConfig): QuoteCalculation {
  return calculateQuoteFromGrossValue(lot.valorLote, config);
}
