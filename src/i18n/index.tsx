import React, { createContext, useContext, useEffect, useState } from 'react';
import { ar } from './ar';
import { fr } from './fr';

export type Language = 'ar' | 'fr';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof fr;
  dir: 'rtl' | 'ltr';
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('golden_shop_language');
    return (saved === 'ar' || saved === 'fr') ? saved : 'ar';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('golden_shop_language', lang);
  };

  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', language);
  }, [language, dir]);

  const t = language === 'ar' ? (ar as unknown as typeof fr) : fr;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, dir: 'rtl', isRTL: true }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
