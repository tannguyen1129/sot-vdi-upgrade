"use client";

import { useRef } from "react";

interface InputDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function InputDialog({
  open,
  title,
  description,
  label = "Giá trị",
  defaultValue = "",
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  loading = false,
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel}></div>
      <div className="relative w-full max-w-md border border-slate-200 bg-white shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
        </div>
        <div className="p-5 space-y-3">
          {description && <p className="text-sm text-slate-600">{description}</p>}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{label}</label>
            <input
              ref={inputRef}
              defaultValue={defaultValue}
              className="w-full bg-slate-50 border border-slate-300 p-2 text-slate-800 font-mono focus:border-blue-600 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirm(inputRef.current?.value || "");
              }}
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(inputRef.current?.value || "")}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold uppercase text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Đang xử lý..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
