import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught crash]:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0a0a0a] text-white">
          <div
            className="w-full max-w-md rounded-2xl p-6 sm:p-8 text-center space-y-4"
            style={{
              background: 'rgba(18, 18, 24, 0.85)',
              border: '1.5px solid rgba(245, 215, 110, 0.45)',
              boxShadow: '0 0 25px rgba(212, 175, 55, 0.25)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-lg font-bold text-neutral-100">
              حدث خطأ غير متوقع / Une erreur est survenue
            </h2>

            <p className="text-xs text-neutral-400 font-mono bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 break-all text-start">
              {this.state.error?.message || 'Erreur inconnue'}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل التطبيق / Recharger</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs border border-neutral-700 transition"
              >
                <span>مسح الذاكرة المؤقتة وإعادة المحاولة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
