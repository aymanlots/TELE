import React, { createContext, useContext, useEffect, useState } from 'react';

export type ViewMode = 'desktop' | 'mobile';

interface ViewModeContextType {
  viewMode: ViewMode;
  isMobileMode: boolean;
  isDesktopMode: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | null>(null);

function applyViewModeClass(mode: ViewMode) {
  if (typeof document !== 'undefined') {
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (mode === 'mobile') {
      document.documentElement.classList.add('view-mode-mobile');
      document.documentElement.classList.remove('view-mode-desktop');
      if (metaViewport) {
        metaViewport.setAttribute(
          'content',
          'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes'
        );
      }
    } else {
      document.documentElement.classList.add('view-mode-desktop');
      document.documentElement.classList.remove('view-mode-mobile');
      if (metaViewport) {
        const isPhysicalMobile =
          typeof window !== 'undefined' && window.screen && window.screen.width < 900;
        if (isPhysicalMobile) {
          metaViewport.setAttribute(
            'content',
            'width=1280, initial-scale=0.32, minimum-scale=0.25, maximum-scale=5.0, user-scalable=yes'
          );
        } else {
          metaViewport.setAttribute(
            'content',
            'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes'
          );
        }
      }
    }
  }
}

export const ViewModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('golden_shop_view_mode');
      if (saved === 'mobile' || saved === 'desktop') {
        applyViewModeClass(saved);
        return saved;
      }
    } catch {}

    // First time automatic detection based on screen size
    const autoMode: ViewMode = typeof window !== 'undefined' && window.innerWidth < 900 ? 'mobile' : 'desktop';
    applyViewModeClass(autoMode);
    return autoMode;
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem('golden_shop_view_mode', mode);
    } catch {}
    applyViewModeClass(mode);
  };

  const toggleViewMode = () => {
    const nextMode: ViewMode = viewMode === 'desktop' ? 'mobile' : 'desktop';
    setViewMode(nextMode);
  };

  useEffect(() => {
    applyViewModeClass(viewMode);
  }, [viewMode]);

  return (
    <ViewModeContext.Provider
      value={{
        viewMode,
        isMobileMode: viewMode === 'mobile',
        isDesktopMode: viewMode === 'desktop',
        setViewMode,
        toggleViewMode,
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
};
