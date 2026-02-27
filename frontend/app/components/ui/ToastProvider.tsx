"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import AppToast, { ToastState, ToastType } from "./AppToast";

type ToastContextValue = {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  hideToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ show: false, message: "", type: "info" });
  const timeoutRef = useRef<number | null>(null);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info", durationMs = 3000) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToast({ show: true, message, type });
    timeoutRef.current = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
      timeoutRef.current = null;
    }, durationMs);
  }, []);

  const value = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <AppToast toast={toast} onClose={hideToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
