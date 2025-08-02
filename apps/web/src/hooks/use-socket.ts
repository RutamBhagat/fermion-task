"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

interface UseSocketOptions {
  url?: string;
  roomId: string;
}

export function useSocket({ url, roomId }: UseSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    const socket = io(url || `${process.env.NEXT_PUBLIC_SERVER_URL}`);
    socketRef.current = socket;

    socket.emit("joinRoom", { roomId });

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    return socket;
  }, [url, roomId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("leaveRoom", { roomId });
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, [roomId]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    connect,
    disconnect,
  };
}
