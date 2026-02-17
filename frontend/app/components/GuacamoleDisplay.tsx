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
  const [status, setStatus] = useState<string>("INITIALIZING");
  const [hasDimensions, setHasDimensions] = useState(false); 
  const stateRef = useRef<number>(0); 
  
  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
            if (!hasDimensions) setHasDimensions(true);
            if (clientRef.current && stateRef.current === 3) {
                const w = Math.floor(entry.contentRect.width);
                const h = Math.floor(entry.contentRect.height);
                clientRef.current.sendSize(w, h);
            }
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [hasDimensions]);

  // KẾT NỐI GUACAMOLE
  useEffect(() => {
    if (!token || !wsPath) return;

    let cleanupFn = () => {};

    const connect = () => {
      if (clientRef.current) { 
          try { clientRef.current.disconnect(); } catch {} 
      }
      if (displayMountRef.current) displayMountRef.current.innerHTML = "";

      setStatus("CONNECTING...");

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      
      // [FIX] Xóa sạch query params thừa trong wsPath
      const cleanWsPath = wsPath.split('?')[0]; 
      
      const w = Math.floor(containerRef.current?.getBoundingClientRect().width || 1024);
      const h = Math.floor(containerRef.current?.getBoundingClientRect().height || 768);
      
      // Tạo chuỗi query string thủ công, đảm bảo không bao giờ có undefined
      const queryString = `token=${encodeURIComponent(token)}&width=${w}&height=${h}&dpi=96`;
      
      const tunnelUrl = `${protocol}//${host}${cleanWsPath}?${queryString}`;
      
      console.log("Connecting to Tunnel:", tunnelUrl);

      const tunnel = new (Guacamole as any).WebSocketTunnel(tunnelUrl);
      const client = new (Guacamole as any).Client(tunnel);
      clientRef.current = client;

      client.onerror = (error: any) => {
         console.error("Guac Error:", error);
         setStatus(`ERROR: ${error.message || error.code}`);
      };

      client.onstatechange = (state: number) => {
         stateRef.current = state;
         if (state === 3) {
             setStatus("CONNECTED");
             // Gửi lại size chuẩn khi connect xong
             if (containerRef.current) {
                const r = containerRef.current.getBoundingClientRect();
                client.sendSize(Math.floor(r.width), Math.floor(r.height));
             }
         } else if (state === 5) {
             setStatus("DISCONNECTED");
         }
      };

      const display = client.getDisplay();
      const displayEl = display.getElement();
      Object.assign(displayEl.style, {
          width: '100%', height: '100%', zIndex: '10', touchAction: 'none'
      });
      displayMountRef.current?.appendChild(displayEl);

      // Input handlers...
      const mouse = new (Guacamole as any).Mouse(displayEl);
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (s: any) => {
          if (!isLocked && clientRef.current) clientRef.current.sendMouseState(s);
      };
      const keyboard = new (Guacamole as any).Keyboard(document);
      keyboard.onkeydown = (k: any) => clientRef.current?.sendKeyEvent(1, k);
      keyboard.onkeyup = (k: any) => clientRef.current?.sendKeyEvent(0, k);

      client.connect();

      cleanupFn = () => {
          try { client.disconnect(); } catch {}
          if (displayMountRef.current) displayMountRef.current.innerHTML = "";
      };
    };

    connect();
    return () => { cleanupFn(); };
  }, [token, wsPath]); // Dependency chuẩn

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black flex items-center justify-center overflow-hidden">
      {status !== "CONNECTED" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#090b10] text-gray-400">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
            <p className="font-mono text-xs tracking-widest">{status}</p>
        </div>
      )}
      <div ref={displayMountRef} className="w-full h-full absolute inset-0" />
    </div>
  );
}