import { useCallback, useEffect, useMemo, useState } from 'react';
import { CotizadorView } from './components/CotizadorView';
import { InventoryView } from './components/InventoryView';
import { QuotesHistoryView } from './components/QuotesHistoryView';
import { ActiveTab, TopBar } from './components/TopBar';
import { INITIAL_LOTS } from './data/lotsSeed';
import {
  getFreshIdToken,
  signInWithGoogle,
  signOutGoogle,
  subscribeToAuth,
} from './lib/firebaseAuth';
import {
  AdvisorData,
  ClientData,
  Lot,
  LotStatus,
  QuoteConfig,
  SavedQuote,
  UserProfile,
} from './types/verdeza';
import {
  buildQuoteSubject,
  calculateQuoteFromGrossValue,
  DEFAULT_OFFEROR,
} from './utils/calculations';

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('cotizador');
  const [lots, setLots] = useState<Lot[]>(INITIAL_LOTS);
  const [lotsLoading, setLotsLoading] = useState(true);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  const [selectedLotId, setSelectedLotId] = useState<number>(() => {
    const firstAvailable = INITIAL_LOTS.find((l) => l.estado === 'Disponible');
    return firstAvailable ? firstAvailable.id : INITIAL_LOTS[0].id;
  });

  const [config, setConfig] = useState<QuoteConfig>(() => ({
    mode: 'single',
    lotId: 42,
    secondaryLotId: null,
    manualLot1: {
      codigo: 'LOTE MANUAL 1',
      ubicacion: 'LOTE',
      areaM2: 400,
      valorLote: 74472000,
    },
    manualLot2: {
      codigo: 'LOTE MANUAL 2',
      ubicacion: 'LOTE',
      areaM2: 400,
      valorLote: 74472000,
    },
    manzana: '',
    fechaCotizacion: getTodayISO(),
    fechaSeparacion: getTodayISO(),
    valorSeparacion: 1000000,
    cuotasCiMeses: 4,
    descuentoTotalTipo: 'pct',
    descuentoTotalPct: 0,
    descuentoTotalValorFijo: 0,
    descuentoCiTipo: 'pct',
    descuentoCiPct: 0,
    descuentoCiValorFijo: 0,
    plazoSaldoMeses: 48,
    observacionesAdicionales: '',
  }));

  const [client, setClient] = useState<ClientData>({
    nombresApellidos: '',
    tipoIdentificacion: 'C.C.',
    numeroIdentificacion: '',
    telefono: '',
    ciudad: '',
    direccion: '',
    correo: '',
    empresaActividad: '',
  });

  const [advisor, setAdvisor] = useState<AdvisorData>({
    nombre: '',
    telefono: '',
    correo: '',
  });

  const fetchLots = useCallback(async () => {
    setLotsLoading(true);
    try {
      const res = await fetch('/api/lots');
      if (res.ok) {
        const data = (await res.json()) as { lots: Lot[] };
        if (Array.isArray(data.lots) && data.lots.length > 0) {
          setLots(data.lots);
          setSelectedLotId((prev) => {
            const exists = data.lots.find((l) => l.id === prev);
            if (exists) return prev;
            const firstAvail = data.lots.find((l) => l.estado === 'Disponible');
            return firstAvail ? firstAvail.id : data.lots[0].id;
          });
        }
      }
    } catch {
      // Keep seed fallback
    } finally {
      setLotsLoading(false);
    }
  }, []);

  const fetchQuotes = useCallback(async () => {
    const token = await getFreshIdToken();
    if (!token) {
      setQuotes([]);
      return;
    }
    setQuotesLoading(true);
    try {
      const res = await fetch('/api/quotes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { quotes: SavedQuote[] };
        setQuotes(data.quotes || []);
      }
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  const syncUserRegistration = useCallback(
    async (idToken: string, fallbackName: string, fallbackEmail: string, fallbackPhoto: string) => {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ displayName: fallbackName }),
        });
        if (res.ok) {
          const data = (await res.json()) as { user: UserProfile };
          setUser(data.user);
          setAdvisor((prev) => ({
            nombre: prev.nombre || data.user.displayName,
            telefono: prev.telefono || data.user.telefono,
            correo: prev.correo || data.user.email,
          }));
          return;
        }
      } catch {
        // Fallback below
      }
      const localProfile: UserProfile = {
        uid: 'local',
        email: fallbackEmail,
        displayName: fallbackName,
        photoURL: fallbackPhoto,
        telefono: '',
        cargo: 'Asesor Comercial',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      setUser(localProfile);
      setAdvisor((prev) => ({
        nombre: prev.nombre || localProfile.displayName,
        telefono: prev.telefono,
        correo: prev.correo || localProfile.email,
      }));
    },
    []
  );

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  useEffect(() => {
    const unsub = subscribeToAuth(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setQuotes([]);
        return;
      }
      const token = await firebaseUser.getIdToken();
      await syncUserRegistration(
        token,
        firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Asesor Verdeza',
        firebaseUser.email || '',
        firebaseUser.photoURL || ''
      );
      await fetchQuotes();
    });
    return () => unsub();
  }, [fetchQuotes, syncUserRegistration]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithGoogle();
      await syncUserRegistration(
        result.idToken,
        result.user.displayName || result.user.email?.split('@')[0] || 'Asesor Verdeza',
        result.user.email || '',
        result.user.photoURL || ''
      );
      await fetchQuotes();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('popup-closed-by-user')) {
        setAuthError(
          'No se pudo completar el inicio de sesión con Google. Verifica que las ventanas emergentes estén permitidas.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
    setUser(null);
    setQuotes([]);
  };

  const selectedLot = useMemo(() => {
    return lots.find((l) => l.id === selectedLotId) || null;
  }, [lots, selectedLotId]);

  const secondaryLot = useMemo(() => {
    if (!config.secondaryLotId) return null;
    return lots.find((l) => l.id === config.secondaryLotId) || null;
  }, [lots, config.secondaryLotId]);

  const subject = useMemo(() => {
    return buildQuoteSubject(config, selectedLot, secondaryLot);
  }, [config, selectedLot, secondaryLot]);

  const calculation = useMemo(() => {
    if (!subject) return null;
    const grossTotal = subject.lotsIncluded.reduce((sum, item) => sum + item.valorLote, 0);
    return calculateQuoteFromGrossValue(grossTotal, config);
  }, [subject, config]);

  const handleSelectLot = (lot: Lot) => {
    setSelectedLotId(lot.id);
    setConfig((prev) => ({
      ...prev,
      lotId: lot.id,
      manzana: lot.manzana || prev.manzana,
    }));
  };

  const handleSelectSecondaryLot = (lot: Lot | null) => {
    setConfig((prev) => ({
      ...prev,
      secondaryLotId: lot ? lot.id : null,
    }));
  };

  const handleSelectCombinedLotsFromInventory = (selected: Lot[]) => {
    if (selected.length === 0) return;
    if (selected.length === 1) {
      setSelectedLotId(selected[0].id);
      setConfig((prev) => ({
        ...prev,
        mode: 'single',
        lotId: selected[0].id,
        secondaryLotId: null,
        manzana: selected[0].manzana || prev.manzana,
      }));
      setActiveTab('cotizador');
      return;
    }
    const [first, second] = selected;
    setSelectedLotId(first.id);
    setConfig((prev) => ({
      ...prev,
      mode: 'combined',
      lotId: first.id,
      secondaryLotId: second.id,
      manzana: first.manzana || second.manzana || prev.manzana,
    }));
    setActiveTab('cotizador');
  };

  const handleUpdateLotStatus = async (lotId: number, nextStatus: LotStatus) => {
    const token = await getFreshIdToken();
    if (!token) {
      await handleSignIn();
      return;
    }
    const res = await fetch(`/api/lots/${lotId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ estado: nextStatus }),
    });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'No se pudo actualizar el estado del lote.');
    }
    const data = (await res.json()) as { lot: Lot };
    setLots((prev) => prev.map((l) => (l.id === lotId ? data.lot : l)));
  };

  const handleSaveQuote = async (reserveLot: boolean): Promise<string | null> => {
    const token = await getFreshIdToken();
    if (!token || !subject) return null;

    if (advisor.telefono) {
      fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: advisor.nombre || user?.displayName,
          telefono: advisor.telefono,
        }),
      }).catch(() => {});
    }

    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lotId: selectedLot?.id ?? 0,
        secondaryLotId: config.mode === 'combined' ? config.secondaryLotId : null,
        client,
        advisor,
        config,
        reserveLot,
      }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'No se pudo guardar la cotización.');
    }

    const data = (await res.json()) as {
      quote: SavedQuote;
      updatedLot: Lot | null;
      updatedLots?: Lot[];
    };
    setQuotes((prev) => [data.quote, ...prev]);

    const updatedList = data.updatedLots && data.updatedLots.length > 0
      ? data.updatedLots
      : data.updatedLot
      ? [data.updatedLot]
      : [];

    if (updatedList.length > 0) {
      const updatedMap = new Map(updatedList.map((u) => [u.id, u]));
      setLots((prev) => prev.map((l) => updatedMap.get(l.id) ?? l));
    }

    return data.quote.quoteNumber;
  };

  const handleDeleteQuote = async (quoteId: string) => {
    const token = await getFreshIdToken();
    if (!token) return;
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
    }
  };

  const handleLoadQuote = (quote: SavedQuote) => {
    if (quote.lotId) {
      setSelectedLotId(quote.lotId);
    }
    setConfig({
      ...config,
      ...quote.config,
      mode: quote.config.mode || quote.mode || 'single',
      secondaryLotId: quote.config.secondaryLotId ?? quote.secondaryLotId ?? null,
      descuentoTotalTipo: quote.config.descuentoTotalTipo === 'cop' ? 'cop' : 'pct',
      descuentoTotalPct: quote.config.descuentoTotalPct ?? 0,
      descuentoTotalValorFijo: quote.config.descuentoTotalValorFijo ?? 0,
      descuentoCiTipo: 'pct',
      descuentoCiPct: 0,
      descuentoCiValorFijo: 0,
    });
    setClient(quote.client);
    setAdvisor(quote.advisor);
    setActiveTab('cotizador');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAF8] text-[#0F1F14]">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {authError && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-red-50 border border-red-200 text-[#991B1B] text-sm rounded-xl">
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'cotizador' && (
          <CotizadorView
            lots={lots}
            selectedLot={selectedLot}
            secondaryLot={secondaryLot}
            subject={subject}
            onSelectLot={handleSelectLot}
            onSelectSecondaryLot={handleSelectSecondaryLot}
            config={config}
            onConfigChange={setConfig}
            client={client}
            onClientChange={setClient}
            advisor={advisor}
            onAdvisorChange={setAdvisor}
            calculation={calculation}
            user={user}
            onSignIn={handleSignIn}
            onSaveQuote={handleSaveQuote}
            onGoToInventory={() => setActiveTab('inventario')}
          />
        )}

        {activeTab === 'inventario' && (
          <InventoryView
            lots={lots}
            loading={lotsLoading}
            user={user}
            onSignIn={handleSignIn}
            onSelectLotForQuote={(lot) => {
              setSelectedLotId(lot.id);
              setConfig((prev) => ({
                ...prev,
                mode: 'single',
                lotId: lot.id,
                secondaryLotId: null,
                manzana: lot.manzana || prev.manzana,
              }));
              setActiveTab('cotizador');
            }}
            onSelectCombinedLotsForQuote={handleSelectCombinedLotsFromInventory}
            onUpdateLotStatus={handleUpdateLotStatus}
          />
        )}

        {activeTab === 'historial' && (
          <QuotesHistoryView
            quotes={quotes}
            loading={quotesLoading}
            user={user}
            onSignIn={handleSignIn}
            onLoadQuote={handleLoadQuote}
            onDeleteQuote={handleDeleteQuote}
            onGoToCotizador={() => setActiveTab('cotizador')}
          />
        )}
      </main>

      <footer className="border-t border-[#E2E8E2] bg-white">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5B6E62]">
          <p>
            {DEFAULT_OFFEROR.nombre} · NIT {DEFAULT_OFFEROR.nit} · {DEFAULT_OFFEROR.direccion}
          </p>
          <p>
            {DEFAULT_OFFEROR.banco} {DEFAULT_OFFEROR.tipoCuenta} {DEFAULT_OFFEROR.numeroCuenta}
          </p>
        </div>
      </footer>
    </div>
  );
}
