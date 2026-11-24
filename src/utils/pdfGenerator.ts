import { jsPDF } from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import {
  AdvisorData,
  ClientData,
  QuoteCalculation,
  QuoteConfig,
  QuoteSubjectSummary,
} from '../types/verdeza';
import {
  DEFAULT_OFFEROR,
  formatArea,
  formatCOP,
  formatDateES,
} from './calculations';

export interface PdfQuotePayload {
  quoteNumber: string;
  subject: QuoteSubjectSummary;
  statusLabel: string;
  client: ClientData;
  advisor: AdvisorData;
  config: QuoteConfig;
  calculation: QuoteCalculation;
}

const LOGO_URL = '/assets/aistudio/Logo_Verdeza_con_Paisaje_Natural_7de6bb9d.png';

async function loadLogoAsDataUrl(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo cargar el logo'));
      img.src = LOGO_URL;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 600;
    canvas.height = img.naturalHeight || 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

export async function generateQuotePDF(payload: PdfQuotePayload): Promise<void> {
  const { quoteNumber, subject, statusLabel, client, advisor, config, calculation } = payload;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const verdezaDark: [number, number, number] = [20, 83, 45];
  const verdezaMuted: [number, number, number] = [236, 244, 238];
  const slateDark: [number, number, number] = [15, 31, 20];
  const slateGray: [number, number, number] = [82, 96, 88];
  const borderGray: [number, number, number] = [212, 222, 215];

  const logoData = await loadLogoAsDataUrl();

  const drawHeader = (subtitle: string) => {
    doc.setFillColor(...verdezaDark);
    doc.rect(0, 0, pageWidth, 4, 'F');

    if (logoData) {
      const targetHeight = 16;
      const ratio = logoData.width / logoData.height;
      const targetWidth = targetHeight * ratio;
      doc.addImage(logoData.dataUrl, 'PNG', marginX, 9, targetWidth, targetHeight);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...verdezaDark);
      doc.text('VERDEZA CONDOMINIO DE CAMPO', marginX, 18);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...slateDark);
    doc.text(subtitle, pageWidth - marginX, 13, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...slateGray);
    doc.text(`Cotización No: ${quoteNumber}`, pageWidth - marginX, 18.5, { align: 'right' });
    doc.text(
      `Fecha de emisión: ${formatDateES(config.fechaCotizacion)}  |  Estado: ${statusLabel}`,
      pageWidth - marginX,
      23,
      { align: 'right' }
    );

    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.35);
    doc.line(marginX, 27.5, pageWidth - marginX, 27.5);
  };

  // ==================== PÁGINA 1 ====================
  drawHeader(
    subject.lotsIncluded.length > 1
      ? 'COTIZACIÓN COMBINADA DE LOTES CAMPESTRES'
      : 'COTIZACIÓN OFICIAL DE LOTE CAMPESTRE'
  );

  let cursorY = 32;

  // Bloque 1: Información del Inmueble
  doc.setFillColor(...verdezaMuted);
  doc.rect(marginX, cursorY, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...verdezaDark);
  doc.text('1. INFORMACIÓN DEL INMUEBLE SELECCIONADO', marginX + 2.5, cursorY + 4.5);
  cursorY += 7.5;

  const propertyBody: RowInput[] = [
    [
      { content: 'Lote(s):', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
      subject.displayCode,
      { content: 'Manzana:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
      config.manzana.trim() || 'Por asignar',
      { content: 'Modalidad:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
      subject.displayCategory,
    ],
    [
      { content: 'Área Total:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
      formatArea(subject.totalAreaM2),
      { content: 'Prom. / m²:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
      subject.averageValorM2 > 0 ? formatCOP(subject.averageValorM2) : 'Manual',
      { content: 'Valor Bruto (100%):', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
      {
        content: formatCOP(calculation.valorBrutoTotal),
        styles: { fontStyle: 'bold' as const, textColor: verdezaDark },
      },
    ],
  ];

  if (subject.lotsIncluded.length > 1) {
    subject.lotsIncluded.forEach((item, idx) => {
      propertyBody.push([
        {
          content: `Detalle Lote ${idx + 1}:`,
          styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] },
        },
        `${item.code} (${item.ubicacion})`,
        {
          content: 'Área:',
          styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] },
        },
        formatArea(item.areaM2),
        {
          content: 'Valor Individual:',
          styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] },
        },
        formatCOP(item.valorLote),
      ]);
    });
  }

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      fontSize: 8.2,
      cellPadding: 2,
      lineColor: borderGray,
      lineWidth: 0.25,
      textColor: slateDark,
    },
    body: propertyBody,
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4.5;

  // Bloque 2: Datos del Oferente y Asesor
  doc.setFillColor(...verdezaMuted);
  doc.rect(marginX, cursorY, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...verdezaDark);
  doc.text('2. DATOS DEL OFERENTE Y ASESOR COMERCIAL', marginX + 2.5, cursorY + 4.5);
  cursorY += 7.5;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      fontSize: 8.1,
      cellPadding: 1.9,
      lineColor: borderGray,
      lineWidth: 0.25,
      textColor: slateDark,
    },
    body: [
      [
        { content: 'Oferente:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        DEFAULT_OFFEROR.nombre,
        { content: 'NIT:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        DEFAULT_OFFEROR.nit,
      ],
      [
        { content: 'Dirección:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        DEFAULT_OFFEROR.direccion,
        { content: 'Tel. Oficina:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        DEFAULT_OFFEROR.telefono,
      ],
      [
        { content: 'Asesor(a):', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        advisor.nombre || 'Asesor Comercial Verdeza',
        { content: 'Tel. Asesor(a):', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        advisor.telefono || 'Por confirmar',
      ],
      [
        { content: 'Correo Asesor:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        advisor.correo || DEFAULT_OFFEROR.correo,
        { content: 'Correo Empresa:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        DEFAULT_OFFEROR.correo,
      ],
    ],
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4.5;

  // Bloque 3: Datos del Futuro Comprador (Cliente)
  doc.setFillColor(...verdezaMuted);
  doc.rect(marginX, cursorY, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...verdezaDark);
  doc.text('3. DATOS DEL FUTURO COMPRADOR (CLIENTE)', marginX + 2.5, cursorY + 4.5);
  cursorY += 7.5;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      fontSize: 8.1,
      cellPadding: 1.9,
      lineColor: borderGray,
      lineWidth: 0.25,
      textColor: slateDark,
    },
    body: [
      [
        { content: 'Nombres y Apellidos:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        client.nombresApellidos || 'Por diligenciar',
        { content: 'Identificación:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        `${client.tipoIdentificacion} ${client.numeroIdentificacion || 'Por diligenciar'}`,
      ],
      [
        { content: 'No. Contacto:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        client.telefono || 'Por diligenciar',
        { content: 'Ciudad:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        client.ciudad || 'Por diligenciar',
      ],
      [
        { content: 'Dirección:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        client.direccion || 'Por diligenciar',
        { content: 'Correo Electrónico:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        client.correo || 'Por diligenciar',
      ],
      [
        { content: 'Empresa / Actividad:', styles: { fontStyle: 'bold' as const, fillColor: [248, 250, 248] } },
        { content: client.empresaActividad || 'Por diligenciar', colSpan: 3 },
      ],
    ],
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4.5;

  // Bloque 4: Resumen Financiero Automatizado
  doc.setFillColor(...verdezaMuted);
  doc.rect(marginX, cursorY, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...verdezaDark);
  doc.text('4. RESUMEN FINANCIERO AUTOMATIZADO (PLAN 20% INICIAL / 80% A 48 MESES)', marginX + 2.5, cursorY + 4.5);
  cursorY += 7.5;

  const summaryRows: RowInput[] = [
    [
      subject.lotsIncluded.length > 1
        ? 'Sumatoria Bruta de los Lotes (100%)'
        : 'Valor Bruto del Lote (100%)',
      subject.lotsIncluded.length > 1
        ? `Suma total de ${subject.displayCode}`
        : 'Precio de lista o valor configurado',
      { content: formatCOP(calculation.valorBrutoTotal), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ],
  ];

  const totalDiscountPctLabel = calculation.descuentoTotalPctEfectivo ?? config.descuentoTotalPct;
  const saldo80Bruto = calculation.saldo80Bruto ?? calculation.valorBrutoTotal - calculation.cuotaInicial20Bruta;

  summaryRows.push([
    'Cuota Inicial (20%)',
    '20% del valor total del lote (sin descuento)',
    { content: formatCOP(calculation.cuotaInicial20Bruta), styles: { halign: 'right' as const } },
  ]);

  if (calculation.descuentoTotalValor > 0) {
    summaryRows.push(
      [
        'Saldo Financiado Bruto (80%)',
        '80% del valor total antes de aplicar descuento',
        { content: formatCOP(saldo80Bruto), styles: { halign: 'right' as const } },
      ],
      [
        config.descuentoTotalTipo === 'cop'
          ? `Descuento sobre el 80% Financiado (Valor fijo · ${totalDiscountPctLabel}%)`
          : `Descuento sobre el 80% Financiado (${totalDiscountPctLabel}%)`,
        'Descuento comercial aplicado únicamente al 80% financiado',
        { content: `- ${formatCOP(calculation.descuentoTotalValor)}`, styles: { halign: 'right' as const, textColor: verdezaDark } },
      ]
    );
  }

  summaryRows.push(
    [
      'Separación (Descontada del total)',
      `Pago el ${formatDateES(config.fechaSeparacion)} (incluida en la C.I.)`,
      { content: formatCOP(calculation.valorSeparacion), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ],
    [
      `Saldo Cuota Inicial Neta (${config.cuotasCiMeses} ${config.cuotasCiMeses === 1 ? 'cuota' : 'cuotas'})`,
      config.cuotasCiMeses === 1
        ? 'Pago único del excedente de cuota inicial'
        : `${config.cuotasCiMeses} cuotas mensuales de aprox. ${formatCOP(calculation.cuotaCiMensualPromedio)}`,
      { content: formatCOP(calculation.cuotaInicialNeta), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ],
    [
      `Saldo Financiado (80% en ${config.plazoSaldoMeses} cuotas mensuales)`,
      `${config.plazoSaldoMeses} cuotas mensuales de ${formatCOP(calculation.cuota48MensualBase)} c/u`,
      { content: formatCOP(calculation.saldo80), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ],
    [
      { content: 'VALOR TOTAL PLAN DE PAGOS (CUADRE 100%)', styles: { fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
      { content: 'Separación + Cuota Inicial Neta + 48 Cuotas (80%)', styles: { fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
      { content: formatCOP(calculation.valorTotalAPagar), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
    ]
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      fontSize: 8.1,
      cellPadding: 2,
      lineColor: borderGray,
      lineWidth: 0.25,
      textColor: slateDark,
    },
    headStyles: {
      fillColor: verdezaDark,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    head: [['Concepto Financiero', 'Detalle del Cálculo', { content: 'Valor (COP)', styles: { halign: 'right' } }]],
    body: summaryRows,
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4.5;

  // Bloque 5: Datos Bancarios y Observaciones
  doc.setFillColor(...verdezaMuted);
  doc.rect(marginX, cursorY, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...verdezaDark);
  doc.text('5. INFORMACIÓN BANCARIA Y OBSERVACIONES', marginX + 2.5, cursorY + 4.5);
  cursorY += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...slateDark);
  doc.text(
    `Entidad Bancaria: ${DEFAULT_OFFEROR.banco}   |   Tipo de Cuenta: ${DEFAULT_OFFEROR.tipoCuenta}   |   No. de Cuenta: ${DEFAULT_OFFEROR.numeroCuenta}`,
    marginX,
    cursorY + 2
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.9);
  doc.setTextColor(...slateGray);
  const obsText = [
    subject.lotsIncluded.length > 1
      ? `Operación unificada por ${subject.displayCode} (Área total: ${formatArea(subject.totalAreaM2)}, sumatoria bruta: ${formatCOP(calculation.valorBrutoTotal)}).`
      : `Valor bruto ${formatCOP(calculation.valorBrutoTotal)}.`,
    `Cuota inicial del 20% sobre el valor total (${formatCOP(calculation.cuotaInicial20Bruta)}), con separación de ${formatCOP(calculation.valorSeparacion)} descontada.`,
    calculation.descuentoTotalValor > 0
      ? `Descuento de ${formatCOP(calculation.descuentoTotalValor)} (${totalDiscountPctLabel}%) aplicado únicamente al 80% financiado (${formatCOP(saldo80Bruto)}), quedando un saldo neto a financiar de ${formatCOP(calculation.saldo80)} en ${config.plazoSaldoMeses} cuotas mensuales de ${formatCOP(calculation.cuota48MensualBase)} c/u.`
      : `Saldo del 80% (${formatCOP(calculation.saldo80)}) en ${config.plazoSaldoMeses} cuotas mensuales de ${formatCOP(calculation.cuota48MensualBase)} c/u.`,
    config.observacionesAdicionales.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  const obsLines = doc.splitTextToSize(`Observación: ${obsText}`, contentWidth);
  doc.text(obsLines, marginX, cursorY + 6.5);

  // ==================== PÁGINA 2: CRONOGRAMA DE PAGOS ====================
  doc.addPage();
  drawHeader('CRONOGRAMA DETALLADO DE CUOTAS MENSUALES');

  let schedY = 32;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...slateGray);
  doc.text(
    `Plan completo de pagos para ${subject.displayCode} (${formatArea(subject.totalAreaM2)}) · Futuro Comprador: ${
      client.nombresApellidos || 'Por diligenciar'
    }`,
    marginX,
    schedY
  );
  schedY += 4;

  const scheduleRows: RowInput[] = calculation.schedule.map((item) => [
    item.numero === 0 ? 'SEP' : String(item.numero),
    item.concepto,
    item.etapa,
    formatDateES(item.fechaPago),
    { content: formatCOP(item.valor), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    { content: formatCOP(item.saldoRestante), styles: { halign: 'right' as const, textColor: slateGray } },
  ]);

  scheduleRows.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
    { content: 'SUMA VERIFICADA DEL PLAN DE PAGOS', styles: { fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
    { content: '100% Plan', styles: { fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
    { content: `${calculation.schedule.length} pagos`, styles: { fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
    { content: formatCOP(calculation.sumaCronograma), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
    { content: formatCOP(0), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: verdezaMuted, textColor: verdezaDark } },
  ]);

  autoTable(doc, {
    startY: schedY,
    margin: { left: marginX, right: marginX, bottom: 26 },
    theme: 'grid',
    styles: {
      fontSize: 7.4,
      cellPadding: 1.4,
      lineColor: borderGray,
      lineWidth: 0.2,
      textColor: slateDark,
    },
    headStyles: {
      fillColor: verdezaDark,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.6,
    },
    head: [
      [
        '#',
        'Concepto',
        'Etapa',
        'Fecha Estimada',
        { content: 'Valor Cuota', styles: { halign: 'right' } },
        { content: 'Saldo Restante', styles: { halign: 'right' } },
      ],
    ],
    body: scheduleRows,
    didDrawPage: () => {
      const currentPage = doc.getCurrentPageInfo().pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...slateGray);
      doc.text(
        `${DEFAULT_OFFEROR.nombre} · NIT ${DEFAULT_OFFEROR.nit} · Cotización informativa sujeta a disponibilidad de inventario.`,
        marginX,
        pageHeight - 8
      );
      doc.text(`Página ${currentPage}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (finalY + 34 < pageHeight - 12) {
    let sigY = finalY + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...verdezaDark);
    doc.text('NOTAS IMPORTANTES Y TÉRMINOS DE LA COTIZACIÓN', marginX, sigY);
    sigY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...slateGray);
    const legalNotes = [
      '1. Los asesores y directores comerciales NO están autorizados para recibir dinero en efectivo ni transferencias personales; todos los pagos deben realizarse exclusivamente a la cuenta bancaria de PROMOTORA VERDEZA S.A.S.',
      '2. La presente cotización tiene carácter informativo y está sujeta a la disponibilidad vigente de los lotes al momento de formalizar la separación e intención de compraventa.',
    ];
    legalNotes.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, contentWidth);
      doc.text(wrapped, marginX, sigY);
      sigY += wrapped.length * 3.3 + 1;
    });

    sigY += 10;
    doc.setDrawColor(...slateDark);
    doc.setLineWidth(0.3);
    doc.line(marginX + 8, sigY, marginX + 78, sigY);
    doc.line(pageWidth - marginX - 78, sigY, pageWidth - marginX - 8, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...slateDark);
    doc.text('FUTURO COMPRADOR', marginX + 43, sigY + 4, { align: 'center' });
    doc.text('ASESOR COMERCIAL / OFERENTE', pageWidth - marginX - 43, sigY + 4, { align: 'center' });
  }

  const safeClient = (client.nombresApellidos || 'Cliente')
    .trim()
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_')
    .slice(0, 32);
  const safeLotCode = subject.displayCode.replace(/[^a-zA-Z0-9+_-]+/g, '').slice(0, 24);
  const fileName = `Cotizacion_Verdeza_${safeLotCode}_${safeClient}.pdf`;
  doc.save(fileName);
}
