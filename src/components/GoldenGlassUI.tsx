import React from 'react';

/**
 * 3D Sculpted Gold Money Stack + Coin Illustration (matches Dashboard Card 1)
 */
export const GoldMoneyStack3D: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 96 80" fill="none" className={`${className} drop-shadow-[0_14px_24px_rgba(245,185,35,0.45)]`}>
    <defs>
      <linearGradient id="goldBillTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF6B7" />
        <stop offset="40%" stopColor="#FFD859" />
        <stop offset="75%" stopColor="#D99B16" />
        <stop offset="100%" stopColor="#8F5D04" />
      </linearGradient>
      <linearGradient id="goldBillSide" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#9A6506" />
        <stop offset="50%" stopColor="#E5A922" />
        <stop offset="100%" stopColor="#6E4402" />
      </linearGradient>
      <linearGradient id="goldCoinFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF9D2" />
        <stop offset="45%" stopColor="#FFCF40" />
        <stop offset="100%" stopColor="#B87908" />
      </linearGradient>
    </defs>
    <ellipse cx="48" cy="68" rx="34" ry="7" fill="rgba(0,0,0,0.55)" />
    <path d="M16 44 L48 58 L80 44 L80 54 L48 68 L16 54 Z" fill="url(#goldBillSide)" />
    <path d="M16 36 L48 50 L80 36 L80 45 L48 59 L16 45 Z" fill="url(#goldBillSide)" opacity="0.9" />
    <path d="M16 36 L48 22 L80 36 L48 50 Z" fill="url(#goldBillTop)" stroke="#FFF4B8" strokeWidth="1" />
    <path d="M24 36 L48 25.5 L72 36 L48 46.5 Z" stroke="#8F5D04" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
    <ellipse cx="48" cy="36" rx="9" ry="5" fill="#9A6506" fillOpacity="0.45" />
    <path d="M36 28 L44 31.5 L59 25 L51 21.5 Z" fill="#FFF7C2" opacity="0.7" />
    <ellipse cx="67" cy="26" rx="13" ry="13" fill="#7A4D03" />
    <circle cx="65" cy="24" r="13" fill="url(#goldCoinFace)" stroke="#FFF7C2" strokeWidth="1.2" />
    <circle cx="65" cy="24" r="9.5" stroke="#9A6506" strokeWidth="1" strokeDasharray="2 2" fill="none" />
    <text x="65" y="28.5" textAnchor="middle" fill="#6E4402" fontSize="12" fontWeight="900" fontFamily="sans-serif">$</text>
  </svg>
);

/**
 * 3D Sculpted Gold Trending Chart Illustration (matches Dashboard Card 2)
 */
export const GoldTrendChart3D: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 96 80" fill="none" className={`${className} drop-shadow-[0_14px_24px_rgba(245,185,35,0.45)]`}>
    <defs>
      <linearGradient id="goldBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFF3A8" />
        <stop offset="45%" stopColor="#FFCA3A" />
        <stop offset="100%" stopColor="#8F5D04" />
      </linearGradient>
      <linearGradient id="goldArrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#C4830B" />
        <stop offset="55%" stopColor="#FFE066" />
        <stop offset="100%" stopColor="#FFF9D6" />
      </linearGradient>
    </defs>
    <ellipse cx="48" cy="68" rx="34" ry="7" fill="rgba(0,0,0,0.55)" />
    <rect x="20" y="45" width="11" height="18" rx="3" fill="url(#goldBarGrad)" stroke="#FFE885" strokeWidth="0.8" />
    <rect x="36" y="36" width="11" height="27" rx="3" fill="url(#goldBarGrad)" stroke="#FFE885" strokeWidth="0.8" />
    <rect x="52" y="27" width="11" height="36" rx="3" fill="url(#goldBarGrad)" stroke="#FFE885" strokeWidth="0.8" />
    <rect x="68" y="18" width="11" height="45" rx="3" fill="url(#goldBarGrad)" stroke="#FFE885" strokeWidth="0.8" />
    <path
      d="M16 44 L34 30 L47 37 L74 12"
      stroke="url(#goldArrowGrad)"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M63 11 L77 10 L75 24 Z" fill="#FFF6B7" stroke="#D99B16" strokeWidth="1" />
  </svg>
);

/**
 * 3D Sculpted Gold Closed Parcel Box Illustration (matches Dashboard Card 3)
 */
export const GoldInventoryBox3D: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 96 80" fill="none" className={`${className} drop-shadow-[0_14px_24px_rgba(245,185,35,0.45)]`}>
    <defs>
      <linearGradient id="boxTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF6B7" />
        <stop offset="55%" stopColor="#FFD24C" />
        <stop offset="100%" stopColor="#C8870E" />
      </linearGradient>
      <linearGradient id="boxLeft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E6A81F" />
        <stop offset="100%" stopColor="#8A5704" />
      </linearGradient>
      <linearGradient id="boxRight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#B87809" />
        <stop offset="100%" stopColor="#5E3A02" />
      </linearGradient>
    </defs>
    <ellipse cx="48" cy="69" rx="30" ry="7" fill="rgba(0,0,0,0.55)" />
    <path d="M48 12 L78 26 L48 40 L18 26 Z" fill="url(#boxTop)" stroke="#FFF5BA" strokeWidth="1" />
    <path d="M18 26 L48 40 L48 66 L18 52 Z" fill="url(#boxLeft)" stroke="#F5C445" strokeWidth="0.8" />
    <path d="M48 40 L78 26 L78 52 L48 66 Z" fill="url(#boxRight)" stroke="#C8870E" strokeWidth="0.8" />
    <path d="M33 19 L63 33 L63 43 L56 46.5 L56 36.5 L26 22.5 Z" fill="#FFF7C4" opacity="0.82" />
  </svg>
);

/**
 * 3D Sculpted Gold Wrench & Gear Illustration (for Repairs & Spare Parts)
 */
export const GoldWrench3D: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 96 80" fill="none" className={`${className} drop-shadow-[0_14px_24px_rgba(245,185,35,0.45)]`}>
    <defs>
      <linearGradient id="goldToolFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF7C2" />
        <stop offset="45%" stopColor="#FFD24C" />
        <stop offset="100%" stopColor="#9A6506" />
      </linearGradient>
    </defs>
    <ellipse cx="48" cy="69" rx="28" ry="6" fill="rgba(0,0,0,0.55)" />
    <circle cx="56" cy="36" r="16" fill="url(#goldToolFace)" stroke="#FFF5BA" strokeWidth="1.2" />
    <circle cx="56" cy="36" r="7" fill="#181204" stroke="#C8870E" strokeWidth="1.5" />
    <path
      d="M24 54 L48 30 L54 36 L30 60 C27 63 23 62 21 60 C19 58 21 56 24 54 Z"
      fill="url(#goldToolFace)"
      stroke="#FFF7C2"
      strokeWidth="1.2"
    />
  </svg>
);

/**
 * Universal GlassCard matching Dashboard's exact Apple Liquid Glass Black & Gold card
 */
export const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  spotlight?: boolean;
  onClick?: () => void;
}> = ({ children, className = '', spotlight = false, onClick }) => (
  <div
    onClick={onClick}
    className={`relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.12)] transition-all duration-300 ${
      onClick ? 'cursor-pointer hover:scale-[1.01] hover:border-amber-400/40' : ''
    } ${className}`}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
    {spotlight && (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 48%, rgba(255, 200, 50, 0.12) 0%, transparent 68%)',
        }}
      />
    )}
    <div className="relative z-10">{children}</div>
  </div>
);

/**
 * Dashboard-identical 3D Gold KPI Card (matches DH 59,00 / DH 26,00 / DH 297,00 cards 100%)
 */
export const GlassKpiCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  variant?: 'gold' | 'green' | 'white';
  iconType?: 'money' | 'trend' | 'box' | 'wrench';
  onClick?: () => void;
}> = ({ title, value, subtitle, variant = 'gold', iconType = 'money', onClick }) => {
  const renderIcon = () => {
    switch (iconType) {
      case 'trend':
        return <GoldTrendChart3D />;
      case 'box':
        return <GoldInventoryBox3D />;
      case 'wrench':
        return <GoldWrench3D />;
      default:
        return <GoldMoneyStack3D />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:scale-[1.01] hover:border-amber-400/50 transition-all duration-300 flex flex-col justify-between min-h-[175px] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            variant === 'green'
              ? 'radial-gradient(circle at 50% 48%, rgba(255, 205, 55, 0.16) 0%, rgba(34, 197, 94, 0.08) 45%, transparent 70%)'
              : 'radial-gradient(circle at 50% 48%, rgba(255, 200, 50, 0.16) 0%, transparent 68%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between">
        <span className="text-gray-300 text-sm font-bold tracking-wide">{title}</span>
      </div>

      <div className="relative z-10 my-2 flex items-center justify-center">
        {renderIcon()}
      </div>

      <div className="relative z-10 flex items-end justify-between mt-1 gap-2">
        <div
          className={`text-2xl xl:text-3xl font-black tracking-tight tabular-nums ${
            variant === 'green'
              ? 'text-[#22c55e] drop-shadow-[0_2px_12px_rgba(34,197,94,0.35)]'
              : variant === 'gold'
              ? 'text-[#FFD700]'
              : 'text-white'
          }`}
          dir="ltr"
        >
          {value}
        </div>
        {subtitle && (
          <div
            className={`text-xs font-semibold text-left ${
              variant === 'green' ? 'text-[#22c55e]' : 'text-gray-300'
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
