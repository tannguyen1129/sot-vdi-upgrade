"use client";

export type ToastType = "success" | "error" | "info";

export interface ToastState {
  show: boolean;
  message: string;
  type: ToastType;
}

interface AppToastProps {
  toast: ToastState;
  title?: string;
  className?: string;
  onClose?: () => void;
}

export default function AppToast({ toast, title = "Thông báo", className = "", onClose }: AppToastProps) {
  return (
    <div
      className={`fixed top-[calc(env(safe-area-inset-top)+5rem)] right-4 z-[110] transition-all duration-300 transform ${
        toast.show ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      } ${className}`}
    >
      <div
        className={`flex items-start gap-3 px-5 py-4 border-l-4 shadow-2xl bg-white min-w-[300px] ${
          toast.type === "success" ? "border-emerald-500" : ""
        } ${toast.type === "error" ? "border-red-500" : ""} ${toast.type === "info" ? "border-blue-500" : ""}`}
      >
        <div
          className={`${toast.type === "success" ? "text-emerald-500" : ""} ${
            toast.type === "error" ? "text-red-500" : ""
          } ${toast.type === "info" ? "text-blue-500" : ""}`}
        >
          {toast.type === "success" && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === "error" && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.type === "info" && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">{title}</h4>
          <p className="text-slate-600 text-sm">{toast.message}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
