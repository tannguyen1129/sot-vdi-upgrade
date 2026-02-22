"use client";

import React, { useEffect, useRef, useState } from "react";
import Guacamole from "guacamole-common-js";

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
  
  // Ref trạng thái
  const isConnected = useRef(false);

  const [status, setStatus] = useState<string>("INITIALIZING");
  const [errorMsg, setErrorMsg] = useState<string>("");

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

    console.log("🚀 Initializing Guacamole Connection...");
    setStatus("CONNECTING...");
    setErrorMsg("");

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const cleanWsPath = wsPath.split('?')[0]; 

    // Mặc định kích thước màn hình ảo (Nên set to để nét)
    const w = 1600; 
    const h = 900; 

    // URL kết nối
    const query = `token=${encodeURIComponent(token)}&width=${w}&height=${h}&dpi=96`;
    const tunnelUrl = `${protocol}//${host}${cleanWsPath}?${query}`;

    const tunnel = new (Guacamole as any).WebSocketTunnel(tunnelUrl);
    const client = new (Guacamole as any).Client(tunnel);
    clientRef.current = client;

    // Error Handler
    client.onerror = (error: any) => {
        console.error("Guac Error:", error);
        if (error.code === 519 || error.message?.includes("Connection closed")) return;
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

    // --- MOUSE HANDLER (ĐÃ SỬA LỖI) ---
    // Guacamole.Mouse tự động xử lý scale nếu ta dùng hàm display.scale()
    const mouse = new (Guacamole as any).Mouse(el);

    // Ẩn chuột hệ thống trên container
    if (containerRef.current) containerRef.current.style.cursor = 'none';

    mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (state: any) => {
        if (!isLocked && isConnected.current) {
            client.sendMouseState(state);
            if (onActivity) onActivity();
        }
    };

    // Keyboard Handler
    const kbd = new (Guacamole as any).Keyboard(document);
    kbd.onkeydown = (k: any) => isConnected.current && client.sendKeyEvent(1, k);
    kbd.onkeyup = (k: any) => isConnected.current && client.sendKeyEvent(0, k);

    client.connect();

    return () => {
        isConnected.current = false;
        if (client) try { client.disconnect(); } catch {}
        clientRef.current = null;
        if (displayMountRef.current) displayMountRef.current.innerHTML = "";
        if (containerRef.current) containerRef.current.style.cursor = 'auto';
        kbd.onkeydown = null;
        kbd.onkeyup = null;
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