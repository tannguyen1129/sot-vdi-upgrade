"use client";

import React, { useEffect, useRef, useState } from "react";
import Guacamole from "guacamole-common-js";

type MouseState = {
  x: number;
  y: number;
  left: boolean;
  middle: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

interface GuacamoleDisplayProps {
  token: string | null;
  wsPath?: string;
  isLocked?: boolean; 
  onActivity?: () => void; 
}

export default function GuacamoleDisplay({ token, wsPath, isLocked = false, onActivity }: GuacamoleDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayMountRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const isUnmountingRef = useRef(false);
  
  // Ref trạng thái
  const isConnected = useRef(false);
  const isLockedRef = useRef(isLocked);
  const displayScaleRef = useRef(1);
  const mouseStateRef = useRef<MouseState>({
    x: 0,
    y: 0,
    left: false,
    middle: false,
    right: false,
    up: false,
    down: false,
  });

  const [status, setStatus] = useState<string>("INITIALIZING");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  const getDisplayBounds = () => {
    const display = clientRef.current?.getDisplay?.();
    const width = display?.getWidth?.() || 0;
    const height = display?.getHeight?.() || 0;
    return { width, height };
  };

  const clampMouse = (state: MouseState) => {
    const { width, height } = getDisplayBounds();
    if (!width || !height) return state;
    return {
      ...state,
      x: Math.min(Math.max(state.x, 0), Math.max(width - 1, 0)),
      y: Math.min(Math.max(state.y, 0), Math.max(height - 1, 0)),
    };
  };

  // --- LOGIC SCALE MÀN HÌNH (QUAN TRỌNG) ---
  // Hàm này giúp màn hình co giãn vừa khít container mà không làm hỏng tọa độ chuột
  const updateScale = () => {
      if (!containerRef.current || !clientRef.current) return;
      
      const display = clientRef.current.getDisplay();
      if (!display) return;

      const displayEl = display.getElement();
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;

      // Kích thước thật của máy ảo
      const origW = display.getWidth();
      const origH = display.getHeight();

      if (origW === 0 || origH === 0) return;

      // Tính tỉ lệ scale để fit vào container (giữ nguyên aspect ratio)
      const scale = Math.min(containerW / origW, containerH / origH);
      
      display.scale(scale); // Guacamole tự xử lý scale chuột theo tỉ lệ này
      displayScaleRef.current = scale || 1;

      if (mouseStateRef.current.x === 0 && mouseStateRef.current.y === 0) {
        mouseStateRef.current = { ...mouseStateRef.current, x: Math.floor(origW / 2), y: Math.floor(origH / 2) };
      } else {
        mouseStateRef.current = clampMouse(mouseStateRef.current);
      }
  };

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
        // Khi container thay đổi kích thước -> cập nhật scale
        updateScale();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // --- LOGIC KẾT NỐI ---
  useEffect(() => {
    if (!token || !wsPath) return;
    if (clientRef.current) return;
    isUnmountingRef.current = false;

    console.log("🚀 Initializing Guacamole Connection...");
    setStatus("CONNECTING...");
    setErrorMsg("");

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const cleanWsPath = wsPath.split('?')[0]; 

    // Mặc định kích thước màn hình ảo (Nên set to để nét)
    const w = 1600; 
    const h = 900; 

    // Quan trọng: guacamole-common-js tự nối query trong client.connect(data).
    // Nếu đưa query trực tiếp vào tunnel URL sẽ dễ bị dính '?undefined'.
    const query = new URLSearchParams({
      token,
      width: String(w),
      height: String(h),
      dpi: '96',
    }).toString();
    const tunnelUrl = `${protocol}//${host}${cleanWsPath}`;

    const tunnel = new (Guacamole as any).WebSocketTunnel(tunnelUrl);
    const client = new (Guacamole as any).Client(tunnel);
    clientRef.current = client;

    // Error Handler
    client.onerror = (error: any) => {
        // Các mã/lỗi này thường xuất hiện khi phiên bị đóng có chủ đích (nộp bài/thu hồi VM).
        if (
          isUnmountingRef.current ||
          error.code === 519 ||
          error.code === 520 ||
          error.message?.includes("Connection closed") ||
          error.message?.includes("Aborted")
        ) {
          return;
        }
        console.error("Guac Error:", error);
        setStatus("ERROR");
        setErrorMsg(error.message || `Error Code: ${error.code}`);
        isConnected.current = false;
    };

    // State Handler
    client.onstatechange = (state: number) => {
        if (state === 3) { // CONNECTED
            setStatus("CONNECTED");
            isConnected.current = true;
            // Cập nhật scale ngay khi kết nối xong để hình ảnh vừa khít
            setTimeout(updateScale, 100); 
        } else if (state === 5) { // DISCONNECTED
            setStatus("DISCONNECTED");
            isConnected.current = false;
            clientRef.current = null;
        }
    };

    // --- SETUP DISPLAY ---
    const display = client.getDisplay();
    const el = display.getElement();
    
    // Style cho element hiển thị: Block bình thường, không dùng transform
    Object.assign(el.style, { 
        boxShadow: '0 0 50px rgba(0,0,0,0.5)',
        cursor: 'none' // Ẩn chuột thật, dùng chuột ảo
    });
    
    if (displayMountRef.current) {
        displayMountRef.current.innerHTML = "";
        displayMountRef.current.appendChild(el);
    }

    // --- MOUSE HANDLER ---
    // Khi pointer lock bật, dùng movementX/movementY để giữ chuột thật không thoát VM.
    const sendMouseState = (nextState: MouseState) => {
      if (!isConnected.current) return;
      const clamped = clampMouse(nextState);
      mouseStateRef.current = clamped;
      client.sendMouseState(clamped);
      if (onActivity) onActivity();
    };

    const toDisplayPosition = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const scale = displayScaleRef.current || 1;
      return clampMouse({
        ...mouseStateRef.current,
        x: Math.round((event.clientX - rect.left) / scale),
        y: Math.round((event.clientY - rect.top) / scale),
      });
    };

    const isPointerLocked = () => document.pointerLockElement !== null;

    const updateButtons = (button: number, pressed: boolean) => {
      const nextState = { ...mouseStateRef.current };
      if (button === 0) nextState.left = pressed;
      if (button === 1) nextState.middle = pressed;
      if (button === 2) nextState.right = pressed;
      sendMouseState(nextState);
    };

    const releaseMouseButtons = () => {
      sendMouseState({
        ...mouseStateRef.current,
        left: false,
        middle: false,
        right: false,
        up: false,
        down: false,
      });
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isConnected.current) return;
      if (isPointerLocked()) {
        const scale = displayScaleRef.current || 1;
        sendMouseState({
          ...mouseStateRef.current,
          x: mouseStateRef.current.x + event.movementX / scale,
          y: mouseStateRef.current.y + event.movementY / scale,
        });
        return;
      }
      sendMouseState(toDisplayPosition(event));
    };

    const handleMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      if (!isPointerLocked()) {
        sendMouseState(toDisplayPosition(event));
      }
      updateButtons(event.button, true);
    };

    const handleMouseUp = (event: MouseEvent) => {
      event.preventDefault();
      if (!isPointerLocked()) {
        sendMouseState(toDisplayPosition(event));
      }
      updateButtons(event.button, false);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!isPointerLocked()) {
        sendMouseState(toDisplayPosition(event as unknown as MouseEvent));
      }
      if (event.deltaY < 0) {
        sendMouseState({ ...mouseStateRef.current, up: true });
        sendMouseState({ ...mouseStateRef.current, up: false });
      } else if (event.deltaY > 0) {
        sendMouseState({ ...mouseStateRef.current, down: true });
        sendMouseState({ ...mouseStateRef.current, down: false });
      }
    };

    const handleDocumentWheel = (event: WheelEvent) => {
      if (!isPointerLocked() && !isLockedRef.current) return;
      event.preventDefault();
      handleWheel(event);
    };

    const handlePointerLockChange = () => {
      if (!isPointerLocked()) {
        releaseMouseButtons();
      }
    };

    const handleWindowBlur = () => {
      releaseMouseButtons();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    // Ẩn chuột hệ thống trên container
    if (containerRef.current) containerRef.current.style.cursor = 'none';

    const handleLockedMouseMove = (event: MouseEvent) => {
      if (!isPointerLocked()) return;
      handleMouseMove(event);
    };
    const handleLockedMouseDown = (event: MouseEvent) => {
      if (!isPointerLocked()) return;
      handleMouseDown(event);
    };
    const handleLockedMouseUp = (event: MouseEvent) => {
      if (!isPointerLocked()) return;
      handleMouseUp(event);
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("mousemove", handleLockedMouseMove);
    document.addEventListener("mousedown", handleLockedMouseDown);
    document.addEventListener("mouseup", handleLockedMouseUp);
    document.addEventListener("wheel", handleDocumentWheel, { passive: false });
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    window.addEventListener("blur", handleWindowBlur);

    // Keyboard Handler
    const kbd = new (Guacamole as any).Keyboard(document);
    kbd.onkeydown = (k: any) => isConnected.current && client.sendKeyEvent(1, k);
    kbd.onkeyup = (k: any) => isConnected.current && client.sendKeyEvent(0, k);

    client.connect(query);

    return () => {
        isUnmountingRef.current = true;
        isConnected.current = false;
        if (client) try { client.disconnect(); } catch {}
        clientRef.current = null;
        if (displayMountRef.current) displayMountRef.current.innerHTML = "";
        if (containerRef.current) containerRef.current.style.cursor = 'auto';
        kbd.onkeydown = null;
        kbd.onkeyup = null;
        el.removeEventListener("mousemove", handleMouseMove);
        el.removeEventListener("mousedown", handleMouseDown);
        el.removeEventListener("mouseup", handleMouseUp);
        el.removeEventListener("wheel", handleWheel);
        el.removeEventListener("contextmenu", handleContextMenu);
        document.removeEventListener("mousemove", handleLockedMouseMove);
        document.removeEventListener("mousedown", handleLockedMouseDown);
        document.removeEventListener("mouseup", handleLockedMouseUp);
        document.removeEventListener("wheel", handleDocumentWheel);
        document.removeEventListener("pointerlockchange", handlePointerLockChange);
        window.removeEventListener("blur", handleWindowBlur);
    };
  }, [token, wsPath]); 

  return (
    // Dùng Flexbox để căn giữa -> An toàn cho tọa độ chuột
    <div 
      ref={containerRef} 
      className="w-full h-full relative bg-[#090b10] flex items-center justify-center overflow-hidden cursor-none"
    >
      {status !== "CONNECTED" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center text-gray-400 bg-[#090b10]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
            <p className="font-mono text-xs tracking-widest">{status}</p>
            {errorMsg && <p className="text-red-500 text-xs mt-2">{errorMsg}</p>}
        </div>
      )}
      
      {/* Container chứa Canvas */}
      <div ref={displayMountRef} />
    </div>
  );
}
