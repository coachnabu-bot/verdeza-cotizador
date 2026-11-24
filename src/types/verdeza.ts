export type LotStatus = 'Disponible' | 'Separado' | 'Vendido' | 'Bloqueado';

export type LotCategory = 'L.C.' | 'LOTE' | 'ESQUINERO' | 'LUXURY' | 'COMBINADO' | 'MANUAL';

export type QuoteMode = 'single' | 'combined' | 'manual';

export interface Lot {
  id: number;
  code: string; // e.g. "LOTE 42"
  areaM2: number;
  estado: LotStatus;
  ubicacion: LotCategory;
  valorM2: number;
  valorLote: number;
  manzana?: string;
  updatedAt?: string;
  updatedBy?: string;
  notes?: string;
}

export interface ManualLotEntry {
  codigo: string;
  ubicacion: string;
  areaM2: number;
  valorLote: number;
}

export type IdentificationType = 'C.C.' | 'C.E.' | 'PA.';

export interface ClientData {
  nombresApellidos: string;
  tipoIdentificacion: IdentificationType;
  numeroIdentificacion: string;
  telefono: string;
  ciudad: string;
  direccion: string;
  correo: string;
  empresaActividad: string;
}

export interface AdvisorData {
  nombre: string;
  telefono: string;
  correo: string;
}

export interface OfferorData {
  nombre: string;
  nit: string;
  direccion: string;
  correo: string;
  telefono: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
}

export type DiscountType = 'pct' | 'cop';

export interface QuoteConfig {
  mode: QuoteMode;
  lotId: number;
  secondaryLotId: number | null;
  manualLot1: ManualLotEntry;
  manualLot2: ManualLotEntry;
  manzana: string;
  fechaCotizacion: string; // YYYY-MM-DD
  fechaSeparacion: string; // YYYY-MM-DD
  valorSeparacion: number; // default 1000000
  cuotasCiMeses: 1 | 2 | 3 | 4; // 1 payment or up to 4 monthly installments for net down payment
  descuentoTotalTipo?: DiscountType;
  descuentoTotalPct: number; // discount % applied ONLY to the 80% financed portion
  descuentoTotalValorFijo?: number; // fixed COP discount applied ONLY to the 80% financed portion
  descuentoCiTipo?: DiscountType;
  descuentoCiPct: number; // deprecated: always 0 (discounts only apply to 80% financed portion)
  descuentoCiValorFijo?: number; // deprecated: always 0
  plazoSaldoMeses: number; // 48 months (80% of lot value)
  observacionesAdicionales: string;
}

export interface QuoteSubjectSummary {
  mode: QuoteMode;
  displayCode: string;
  displayCategory: string;
  totalAreaM2: number;
  averageValorM2: number;
  lotsIncluded: Array<{
    id?: number;
    code: string;
    ubicacion: string;
    areaM2: number;
    valorLote: number;
    estado?: LotStatus;
  }>;
}

export interface PaymentInstallment {
  numero: number;
  concepto: string;
  etapa: 'Separación' | 'Cuota Inicial (20%)' | 'Saldo Financiado (80%)';
  fechaPago: string; // YYYY-MM-DD
  valor: number;
  saldoRestante: number;
}

export interface QuoteCalculation {
  valorBrutoTotal: number;
  saldo80Bruto?: number;
  descuentoTotalValor: number;
  descuentoTotalPctEfectivo?: number;
  valorLote: number; // Valor total neto a pagar (20% bruto intacto + 80% con descuento)
  cuotaInicial20Bruta: number;
  descuentoValor: number; // siempre 0 (descuentos aplican solo al 80%)
  descuentoCiPctEfectivo?: number;
  cuotaInicialConDescuento: number;
  valorSeparacion: number;
  cuotaInicialNeta: number;
  cuotaCiMensualPromedio: number;
  saldo80: number;
  cuota48MensualBase: number;
  valorTotalAPagar: number;
  schedule: PaymentInstallment[];
  verificacionCuadre: boolean;
  sumaCronograma: number;
}

export interface SavedQuote {
  id: string;
  quoteNumber: string;
  mode: QuoteMode;
  lotId: number;
  secondaryLotId?: number | null;
  lotIds: number[];
  lotCode: string;
  lotAreaM2: number;
  lotCategory: string;
  lotsIncluded?: QuoteSubjectSummary['lotsIncluded'];
  manzana: string;
  client: ClientData;
  advisor: AdvisorData;
  config: QuoteConfig;
  calculation: QuoteCalculation;
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
  reservedLot: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  telefono: string;
  cargo: string;
  createdAt: string;
  lastLoginAt: string;
}
