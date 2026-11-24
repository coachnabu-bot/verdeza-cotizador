import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { UserProfile } from '../types/verdeza';
import { GoogleSignInButton } from './GoogleSignInButton';

export type ActiveTab = 'cotizador' | 'inventario' | 'historial';

interface TopBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  user: UserProfile | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
  user,
  authLoading,
  onSignIn,
  onSignOut,
}) => {
  const [logoError, setLogoError] = useState(false);

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'cotizador', label: 'Cotizador' },
    { id: 'inventario', label: 'Inventario de Lotes' },
    { id: 'historial', label: 'Mis Cotizaciones' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E2E8E2]">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand */}
        <button
          type="button"
          onClick={() => onTabChange('cotizador')}
          className="flex items-center gap-3 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-[#14532D] rounded-md"
        >
          {!logoError ? (
            <img
              src="/assets/aistudio/Logo_Verdeza_con_Paisaje_Natural_7de6bb9d.png"
              alt="Verdeza Condominio de Campo"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="h-9 w-auto object-contain"
            />
          ) : (
            <span className="font-display text-lg font-bold tracking-tight text-[#14532D]">
              Verdeza
            </span>
          )}
        </button>

        {/* Zone 2: Single-line Navigation Links */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-7">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`relative py-5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#14532D] ${
                  isActive
                    ? 'text-[#14532D] font-semibold'
                    : 'text-[#4B5E52] hover:text-[#0F1F14]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#14532D]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary User Action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2.5 text-right">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover border border-[#D4DED7]"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#14532D] text-white text-xs font-semibold flex items-center justify-center">
                    {user.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="max-w-[180px]">
                  <p className="text-xs font-semibold text-[#0F1F14] truncate">
                    {user.displayName}
                  </p>
                  <p className="text-[11px] text-[#5B6E62] truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Cerrar sesión"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334139] bg-[#F2F6F3] hover:bg-[#E5ECE7] border border-[#D4DED7] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Salir</span>
              </button>
            </div>
          ) : (
            <GoogleSignInButton
              onClick={onSignIn}
              disabled={authLoading}
              label={authLoading ? 'Conectando...' : 'Entrar con Google'}
            />
          )}
        </div>
      </div>

      {/* Mobile Secondary Navigation Row */}
      <div className="md:hidden border-t border-[#E2E8E2] px-4 flex items-center justify-around bg-white">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`py-2.5 px-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-[#14532D] text-[#14532D] font-semibold'
                  : 'border-transparent text-[#5B6E62]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
