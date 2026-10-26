import React from 'react';
import { LucideIcon } from 'lucide-react';
import { GoldMoneyStack3D, GoldTrendChart3D, GoldInventoryBox3D, GoldWrench3D } from './GoldenGlassUI';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'gold' | 'emerald' | 'rose' | 'blue' | 'purple' | 'amber';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'gold',
}) => {
  const isGreen = color === 'emerald';
  const isGold = color === 'gold' || color === 'amber';

  const render3DIcon = () => {
    if (color === 'emerald') return <GoldTrendChart3D className="w-14 h-14" />;
    if (color === 'blue' || color === 'purple') return <GoldInventoryBox3D className="w-14 h-14" />;
    if (color === 'rose') return <GoldWrench3D className="w-14 h-14" />;
    return <GoldMoneyStack3D className="w-14 h-14" />;
  };

  return (
    <div className="relative overflow-hidden bg-black/65 backdrop-blur-xl border border-yellow-500/20 rounded-[20px] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:scale-[1.02] transition-all duration-300 flex flex-col justify-between min-h-[168px]">
      {/* Subtle top inner glass specular highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
      {/* Warm golden ambient spotlight in center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isGreen
            ? 'radial-gradient(circle at 50% 48%, rgba(255, 205, 55, 0.16) 0%, rgba(34, 197, 94, 0.08) 45%, transparent 70%)'
            : 'radial-gradient(circle at 50% 48%, rgba(255, 200, 50, 0.16) 0%, transparent 68%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between">
        <span className="text-gray-300 text-sm font-bold tracking-wide">{title}</span>
        <div className="w-7 h-7 rounded-lg bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center text-[#FFD700]">
          <Icon className="w-4 h-4 drop-shadow-[0_2px_6px_rgba(255,215,0,0.5)]" />
        </div>
      </div>

      {/* Centered 3D Gold Illustration */}
      <div className="relative z-10 my-2 flex items-center justify-center">
        {render3DIcon()}
      </div>

      <div className="relative z-10 flex items-end justify-between mt-1 gap-2">
        <div
          className={`text-2xl xl:text-3xl font-black tracking-tight tabular-nums ${
            isGreen
              ? 'text-[#22c55e] drop-shadow-[0_2px_12px_rgba(34,197,94,0.35)]'
              : isGold
              ? 'text-[#FFD700]'
              : 'text-white'
          }`}
          dir="ltr"
        >
          {value}
        </div>
        <div className="flex flex-col items-end">
          {subtitle && (
            <p className={`text-xs font-semibold ${isGreen ? 'text-[#22c55e]' : 'text-gray-300'}`}>
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-0.5">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  trend.isPositive
                    ? 'bg-emerald-500/15 text-[#22c55e] border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                }`}
              >
                {trend.isPositive ? '+' : ''}
                {trend.value}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
