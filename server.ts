import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { INITIAL_LOTS } from './src/data/lotsSeed.ts';
import { Lot, LotStatus, QuoteMode, SavedQuote, UserProfile } from './src/types/verdeza.ts';
import {
  buildQuoteSubject,
  calculateQuoteFromGrossValue,
} from './src/utils/calculations.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'verdeza-store.json');
const FIREBASE_CONFIG_PATH = path.resolve(__dirname, 'firebase-applet-config.json');

interface FirebaseConfig {
  apiKey?: string;
  projectId?: string;
}

function loadFirebaseApiKey(): string {
  try {
    const raw = fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as FirebaseConfig;
    return parsed.apiKey || '';
  } catch {
    return '';
  }
}

const FIREBASE_API_KEY = loadFirebaseApiKey();

interface StoreData {
  lots: Lot[];
  users: Record<string, UserProfile>;
  quotes: SavedQuote[];
}

function ensureStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = {
      lots: INITIAL_LOTS,
      users: {},
      quotes: [],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const lots = Array.isArray(parsed.lots) && parsed.lots.length > 0 ? parsed.lots : INITIAL_LOTS;
    return {
      lots,
      users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
    };
  } catch {
    const fallback: StoreData = {
      lots: INITIAL_LOTS,
      users: {},
      quotes: [],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

let store: StoreData = ensureStore();
let writeQueue: Promise<void> = Promise.resolve();

function persistStore(nextStore: StoreData): Promise<void> {
  store = nextStore;
  writeQueue = writeQueue.then(async () => {
    const tempPath = `${STORE_PATH}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, STORE_PATH);
  });
  return writeQueue;
}

interface VerifiedGoogleUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  emailVerified: boolean;
}

interface AuthenticatedRequest extends Request {
  authUser?: VerifiedGoogleUser;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedGoogleUser | null> {
  if (!idToken || !FIREBASE_API_KEY) return null;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        displayName?: string;
        photoUrl?: string;
        emailVerified?: boolean;
      }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || !user?.email) return null;
    return {
      uid: user.localId,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL: user.photoUrl || '',
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Debes iniciar sesión con tu cuenta de Google para continuar.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión nuevamente con Google.' });
    return;
  }
  req.authUser = verified;
  next();
}

const VALID_STATUSES: LotStatus[] = ['Disponible', 'Separado', 'Vendido', 'Bloqueado'];

function sanitizeText(value: unknown, maxLen = 160): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, lotsCount: store.lots.length });
  });

  // Listar lotes (público para visualización del catálogo y cotizador)
  app.get('/api/lots', (req, res) => {
    const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
    const categoryParam = typeof req.query.category === 'string' ? req.query.category : '';
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let result = store.lots;
    if (statusParam && statusParam !== 'Todos') {
      result = result.filter((l) => l.estado === statusParam);
    }
    if (categoryParam && categoryParam !== 'Todas') {
      result = result.filter((l) => l.ubicacion === categoryParam);
    }
    if (searchParam) {
      result = result.filter(
        (l) =>
          l.code.toLowerCase().includes(searchParam) ||
          String(l.id).includes(searchParam) ||
          l.ubicacion.toLowerCase().includes(searchParam) ||
          (l.manzana && l.manzana.toLowerCase().includes(searchParam))
      );
    }

    const summary = {
      total: store.lots.length,
      disponibles: store.lots.filter((l) => l.estado === 'Disponible').length,
      separados: store.lots.filter((l) => l.estado === 'Separado').length,
      vendidos: store.lots.filter((l) => l.estado === 'Vendido').length,
      bloqueados: store.lots.filter((l) => l.estado === 'Bloqueado').length,
    };

    res.json({ lots: result, summary });
  });

  // Actualizar estado de disponibilidad de un lote (requiere sesión Google)
  app.patch('/api/lots/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    const lotId = Number(req.params.id);
    if (!Number.isInteger(lotId) || lotId <= 0) {
      res.status(400).json({ error: 'ID de lote inválido.' });
      return;
    }

    const nextStatus = req.body?.estado as LotStatus;
    if (!VALID_STATUSES.includes(nextStatus)) {
      res.status(400).json({ error: 'Estado inválido. Usa Disponible, Separado, Vendido o Bloqueado.' });
      return;
    }

    const lotIndex = store.lots.findIndex((l) => l.id === lotId);
    if (lotIndex === -1) {
      res.status(404).json({ error: 'Lote no encontrado.' });
      return;
    }

    const existingLot = store.lots[lotIndex];
    const updatedLot: Lot = {
      ...existingLot,
      estado: nextStatus,
      manzana:
        req.body?.manzana !== undefined
          ? sanitizeText(req.body.manzana, 32)
          : existingLot.manzana,
      notes:
        req.body?.notes !== undefined
          ? sanitizeText(req.body.notes, 240)
          : existingLot.notes,
      updatedAt: new Date().toISOString(),
      updatedBy: req.authUser?.email || 'asesor',
    };

    const nextLots = [...store.lots];
    nextLots[lotIndex] = updatedLot;
    await persistStore({ ...store, lots: nextLots });

    res.json({ lot: updatedLot });
  });

  // Registro / inicio de sesión con cuenta de Google
  app.post('/api/auth/register', requireAuth, async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const now = new Date().toISOString();
    const existing = store.users[authUser.uid];

    const profile: UserProfile = {
      uid: authUser.uid,
      email: authUser.email,
      displayName: sanitizeText(req.body?.displayName, 120) || existing?.displayName || authUser.displayName,
      photoURL: authUser.photoURL || existing?.photoURL || '',
      telefono: sanitizeText(req.body?.telefono, 40) || existing?.telefono || '',
      cargo: sanitizeText(req.body?.cargo, 80) || existing?.cargo || 'Asesor Comercial',
      createdAt: existing?.createdAt || now,
      lastLoginAt: now,
    };

    await persistStore({
      ...store,
      users: {
        ...store.users,
        [authUser.uid]: profile,
      },
    });

    res.json({ user: profile });
  });

  app.get('/api/users/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const existing = store.users[authUser.uid];
    if (!existing) {
      res.json({
        user: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          photoURL: authUser.photoURL,
          telefono: '',
          cargo: 'Asesor Comercial',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        },
      });
      return;
    }
    res.json({ user: existing });
  });

  app.patch('/api/users/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const now = new Date().toISOString();
    const existing = store.users[authUser.uid];

    const updated: UserProfile = {
      uid: authUser.uid,
      email: authUser.email,
      displayName: sanitizeText(req.body?.displayName, 120) || existing?.displayName || authUser.displayName,
      photoURL: authUser.photoURL || existing?.photoURL || '',
      telefono: sanitizeText(req.body?.telefono, 40),
      cargo: sanitizeText(req.body?.cargo, 80) || 'Asesor Comercial',
      createdAt: existing?.createdAt || now,
      lastLoginAt: now,
    };

    await persistStore({
      ...store,
      users: {
        ...store.users,
        [authUser.uid]: updated,
      },
    });

    res.json({ user: updated });
  });

  // Listar cotizaciones guardadas (requiere sesión Google)
  app.get('/api/quotes', requireAuth, (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const userQuotes = store.quotes
      .filter((q) => q.createdByUid === authUser.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ quotes: userQuotes });
  });

  // Guardar cotización (lote individual, 2 lotes combinados o manual, con reserva opcional)
  app.post('/api/quotes', requireAuth, async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const { lotId, secondaryLotId, client, advisor, config, reserveLot } = req.body || {};

    const rawMode = config?.mode;
    const mode: QuoteMode =
      rawMode === 'combined' || rawMode === 'manual' ? rawMode : 'single';

    const clientName = sanitizeText(client?.nombresApellidos, 120);
    if (!clientName) {
      res.status(400).json({ error: 'Ingresa el nombre completo del futuro comprador.' });
      return;
    }

    let primaryLot: Lot | null = null;
    let secondaryLot: Lot | null = null;
    const lotIndicesToReserve: number[] = [];

    if (mode !== 'manual') {
      const parsedLotId = Number(lotId ?? config?.lotId);
      const lotIndex = store.lots.findIndex((l) => l.id === parsedLotId);
      if (lotIndex === -1) {
        res.status(404).json({ error: 'El lote principal seleccionado no existe.' });
        return;
      }
      primaryLot = store.lots[lotIndex];
      lotIndicesToReserve.push(lotIndex);

      if (mode === 'combined') {
        const parsedSecondaryId = Number(secondaryLotId ?? config?.secondaryLotId);
        if (!parsedSecondaryId || parsedSecondaryId === parsedLotId) {
          res.status(400).json({
            error: 'Selecciona dos lotes diferentes para generar una cotización combinada.',
          });
          return;
        }
        const secIndex = store.lots.findIndex((l) => l.id === parsedSecondaryId);
        if (secIndex === -1) {
          res.status(404).json({ error: 'El segundo lote seleccionado no existe.' });
          return;
        }
        secondaryLot = store.lots[secIndex];
        lotIndicesToReserve.push(secIndex);
      }

      if (reserveLot) {
        for (const idx of lotIndicesToReserve) {
          const candidate = store.lots[idx];
          if (candidate.estado !== 'Disponible') {
            res.status(409).json({
              error: `El ${candidate.code} ya no está disponible (estado actual: ${candidate.estado}).`,
            });
            return;
          }
        }
      }
    }

    const cleanConfig = {
      mode,
      lotId: primaryLot?.id ?? Number(config?.lotId || 0),
      secondaryLotId: mode === 'combined' ? (secondaryLot?.id ?? null) : null,
      manualLot1: {
        codigo: sanitizeText(config?.manualLot1?.codigo, 40) || 'LOTE MANUAL 1',
        ubicacion: sanitizeText(config?.manualLot1?.ubicacion, 30) || 'LOTE',
        areaM2: Math.max(0, Number(config?.manualLot1?.areaM2) || 0),
        valorLote: Math.max(0, Math.round(Number(config?.manualLot1?.valorLote) || 0)),
      },
      manualLot2: {
        codigo: sanitizeText(config?.manualLot2?.codigo, 40) || 'LOTE MANUAL 2',
        ubicacion: sanitizeText(config?.manualLot2?.ubicacion, 30) || 'LOTE',
        areaM2: Math.max(0, Number(config?.manualLot2?.areaM2) || 0),
        valorLote: Math.max(0, Math.round(Number(config?.manualLot2?.valorLote) || 0)),
      },
      manzana: sanitizeText(config?.manzana, 32),
      fechaCotizacion: sanitizeText(config?.fechaCotizacion, 20) || new Date().toISOString().slice(0, 10),
      fechaSeparacion: sanitizeText(config?.fechaSeparacion, 20) || new Date().toISOString().slice(0, 10),
      valorSeparacion: Math.max(0, Number(config?.valorSeparacion ?? 1000000)),
      cuotasCiMeses: ([1, 2, 3, 4].includes(Number(config?.cuotasCiMeses))
        ? Number(config.cuotasCiMeses)
        : 1) as 1 | 2 | 3 | 4,
      descuentoTotalTipo: (config?.descuentoTotalTipo === 'cop' ? 'cop' : 'pct') as 'pct' | 'cop',
      descuentoTotalPct: Math.max(0, Math.min(50, Number(config?.descuentoTotalPct ?? 0))),
      descuentoTotalValorFijo: Math.max(0, Math.round(Number(config?.descuentoTotalValorFijo ?? 0))),
      descuentoCiTipo: 'pct' as const,
      descuentoCiPct: 0,
      descuentoCiValorFijo: 0,
      plazoSaldoMeses: 48,
      observacionesAdicionales: sanitizeText(config?.observacionesAdicionales, 400),
    };

    const subject = buildQuoteSubject(cleanConfig, primaryLot, secondaryLot);
    if (!subject) {
      res.status(400).json({ error: 'Ingresa valores válidos para el lote o los lotes a cotizar.' });
      return;
    }

    const grossTotal = subject.lotsIncluded.reduce((acc, item) => acc + item.valorLote, 0);
    const calculation = calculateQuoteFromGrossValue(grossTotal, cleanConfig);

    const quoteId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const quoteNumber = `COT-${new Date().getFullYear()}-${String(store.quotes.length + 1).padStart(4, '0')}`;

    const lotIds = lotIndicesToReserve.map((idx) => store.lots[idx].id);

    const savedQuote: SavedQuote = {
      id: quoteId,
      quoteNumber,
      mode,
      lotId: lotIds[0] ?? 0,
      secondaryLotId: lotIds[1] ?? null,
      lotIds,
      lotCode: subject.displayCode,
      lotAreaM2: subject.totalAreaM2,
      lotCategory: subject.displayCategory,
      lotsIncluded: subject.lotsIncluded,
      manzana: cleanConfig.manzana,
      client: {
        nombresApellidos: clientName,
        tipoIdentificacion: ['C.C.', 'C.E.', 'PA.'].includes(client?.tipoIdentificacion)
          ? client.tipoIdentificacion
          : 'C.C.',
        numeroIdentificacion: sanitizeText(client?.numeroIdentificacion, 40),
        telefono: sanitizeText(client?.telefono, 40),
        ciudad: sanitizeText(client?.ciudad, 80),
        direccion: sanitizeText(client?.direccion, 160),
        correo: sanitizeText(client?.correo, 120),
        empresaActividad: sanitizeText(client?.empresaActividad, 120),
      },
      advisor: {
        nombre: sanitizeText(advisor?.nombre, 120) || authUser.displayName,
        telefono: sanitizeText(advisor?.telefono, 40),
        correo: sanitizeText(advisor?.correo, 120) || authUser.email,
      },
      config: cleanConfig,
      calculation,
      createdByUid: authUser.uid,
      createdByEmail: authUser.email,
      createdAt: new Date().toISOString(),
      reservedLot: Boolean(reserveLot && lotIndicesToReserve.length > 0),
    };

    let nextLots = store.lots;
    const updatedLots: Lot[] = [];
    if (reserveLot && lotIndicesToReserve.length > 0) {
      nextLots = [...store.lots];
      for (const idx of lotIndicesToReserve) {
        const target = nextLots[idx];
        const updated: Lot = {
          ...target,
          estado: 'Separado',
          manzana: cleanConfig.manzana || target.manzana,
          notes: `Separado con cotización ${quoteNumber} para ${clientName}`,
          updatedAt: new Date().toISOString(),
          updatedBy: authUser.email,
        };
        nextLots[idx] = updated;
        updatedLots.push(updated);
      }
    }

    await persistStore({
      ...store,
      lots: nextLots,
      quotes: [savedQuote, ...store.quotes],
    });

    res.status(201).json({
      quote: savedQuote,
      updatedLot: updatedLots[0] ?? null,
      updatedLots,
    });
  });

  app.delete('/api/quotes/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const target = store.quotes.find((q) => q.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Cotización no encontrada.' });
      return;
    }
    if (target.createdByUid !== authUser.uid) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta cotización.' });
      return;
    }
    await persistStore({
      ...store,
      quotes: store.quotes.filter((q) => q.id !== req.params.id),
    });
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Verdeza Cotizador server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
