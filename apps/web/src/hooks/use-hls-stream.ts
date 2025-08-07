"use client";

import { useCallback, useRef, useState } from "react";

import type { Socket } from "socket.io-client";
import { toast } from "sonner";

export function useHLSStream(roomId: string) {
  const [isHlsStreaming, setIsHlsStreaming] = useState(false);
  const [isStartingHls, setIsStartingHls] = useState(false);
  const [streamId, setStreamId] = useState("");

  const startHlsStream = useCallback(
    async (socket: Socket) => {
      if (!socket?.connected) {
        toast.error("Not connected to meeting");
        return;
      }

      setIsStartingHls(true);
      toast.info("Starting HLS stream...");

      socket.emit(
        "startHLS",
        { roomId },
        (response: { error?: string; hlsUrl?: string; streamId?: string }) => {
          if (response.error) {
            toast.error(`Error starting HLS: ${response.error}`);
            setIsStartingHls(false);
          } else {
            console.log("HLS streaming process started on server:", response);
            setStreamId(response?.streamId || "");
            setIsHlsStreaming(true);
            setIsStartingHls(false);
            const watchUrl = `${window.location.origin}/watch/${response.streamId}`;
            navigator.clipboard.writeText(watchUrl);
            toast.success(
              "HLS stream started! Watch link copied to clipboard."
            );
          }
        }
      );
    },
    [roomId]
  );

  const stopHlsStream = useCallback(
    (socket: Socket) => {
      if (!socket || !streamId) return;

      socket.emit(
        "stopHLS",
        { streamId },
        (response: { error?: string; success?: boolean }) => {
          if (response.error) {
            toast.error(`Error stopping HLS: ${response.error}`);
          } else {
            setStreamId("");
            setIsHlsStreaming(false);
            setIsStartingHls(false);
            toast.success("HLS streaming stopped");
          }
        }
      );
    },
    [streamId]
  );

  const handleHlsStreamReady = useCallback(() => {}, []);
  const handleHlsStreamFailed = useCallback(() => {}, []);

  return {
    isHlsStreaming,
    isStartingHls,
    streamId,
    startHlsStream,
    stopHlsStream,
    handleHlsStreamReady,
    handleHlsStreamFailed,
  };
}
