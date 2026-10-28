import React, { Component, ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global top-level safety handler to prevent blank screen if any unhandled error occurs
if (typeof window !== "undefined") {
  const mountEmergencyFallback = (msg: string) => {
    const rootEl = document.getElementById("root");
    if (rootEl && !rootEl.hasChildNodes()) {
      rootEl.innerHTML = `
        <div style="min-height: 100vh; background-color: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: ui-sans-serif, system-ui, sans-serif;">
          <div style="max-width: 420px; width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold;">
              ⚡
            </div>
            <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #ffffff;">Arexanstools OFFICIAL</h2>
            <p style="font-size: 13px; color: #94a3b8; margin: 0 0 20px 0;">Menghubungkan ke server...</p>
            <button onclick="window.location.reload()" style="width: 100%; padding: 10px 16px; background: #2563eb; color: #ffffff; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;">
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      `;
    }
  };

  window.addEventListener("error", (e) => {
    console.error("Window uncaught error:", e.error || e.message);
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("Window unhandled rejection:", e.reason);
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("RootErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    try {
      localStorage.removeItem("arexans_payment_state");
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mx-auto flex items-center justify-center text-xl font-bold">
              !
            </div>
            <h2 className="text-xl font-bold text-white">Terjadi Kendala Memuat Tampilan</h2>
            <p className="text-sm text-slate-400">
              {this.state.error?.message || "Terjadi kesalahan sistem saat memuat komponen."}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition"
              >
                Muat Ulang Halaman
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}
