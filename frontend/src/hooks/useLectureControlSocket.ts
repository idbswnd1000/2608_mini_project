import { useEffect, useRef, useState } from "react";
import { actionToPageId, lectureControlWsUrl } from "../services/lectureControl";
import { NavigationAction } from "../navigation/navigation";

type SocketStatus = "connecting" | "connected" | "disconnected";

export function useLectureControlSocket(onNavigate: (action: NavigationAction) => void, enabled = true) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const closedByCleanupRef = useRef(false);

  useEffect(() => {
    closedByCleanupRef.current = false;
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    function clearReconnectTimer() {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function connect() {
      if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

      setStatus("connecting");
      const socket = new WebSocket(lectureControlWsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!message || typeof message !== "object") return;
        const data = message as { type?: string; action?: string };
        if (data.type !== "lecture_command" || !data.action) return;

        const page = actionToPageId[data.action as keyof typeof actionToPageId];
        if (!page) return;
        onNavigate({
          type: "NAVIGATE",
          page,
          source: "voice",
          runPresentation: false
        });
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (closedByCleanupRef.current) return;
        setStatus("disconnected");
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(connect, 1500);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      closedByCleanupRef.current = true;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, onNavigate]);

  return status;
}
