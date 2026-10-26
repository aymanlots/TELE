/**
 * Moroccan Dirham (MAD / DH) currency formatter
 */
export function formatMAD(amount: number | undefined | null, language: 'ar' | 'fr' = 'fr'): string {
  const num = Number(amount) || 0;
  
  if (language === 'ar') {
    const formatted = new Intl.NumberFormat('ar-MA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `${formatted} د.م.`;
  }

  const formatted = new Intl.NumberFormat('fr-MA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${formatted} DH`;
}

/**
 * Format numbers as tabular string
 */
export function formatNumber(amount: number | undefined | null): string {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}
