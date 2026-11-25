import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected startup error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('RUSH LINE startup error:', error, info);
  }

  private handleResetAndReload = async (): Promise<void> => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } catch {
      // ignore cleanup failures
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0B1220] text-white p-6">
          <div className="w-full max-w-md rounded-lg bg-[#101C30] border-2 border-[#FFD014] p-6 text-center space-y-4 shadow-2xl">
            <div className="font-display italic font-black text-2xl text-[#FFD014]">
              RUSH LINE RECOVERY
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              The game hit a cached update or graphics error while launching. Tap below to clear stale cache and relaunch cleanly.
            </p>
            <button
              type="button"
              onClick={() => void this.handleResetAndReload()}
              className="w-full h-11 rounded bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] font-display italic font-black text-sm tracking-wide transition-colors"
            >
              CLEAR CACHE &amp; RELAUNCH
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
