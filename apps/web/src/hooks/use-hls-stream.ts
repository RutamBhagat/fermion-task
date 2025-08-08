"use client";

import { useCallback, useState } from "react";

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
      toast.info("Starting HLS stream and verifying .ts segments...");

      try {
        const response = await socket.emitWithAck("startHLS", { roomId });

        if ("error" in response) {
          toast.error(`Error starting HLS: ${response.error}`);
          setIsStartingHls(false);
        } else {
          console.log("HLS stream successfully started and verified:", response);
          setStreamId(response?.streamId || "");
          setIsHlsStreaming(true);
          setIsStartingHls(false);
          const watchUrl = `${window.location.origin}/watch/${response.streamId}`;
          navigator.clipboard.writeText(watchUrl);
          toast.success("HLS stream started with verified segments! Watch link copied to clipboard.");
        }
      } catch (error) {
        console.error("Error starting HLS stream:", error);
        toast.error("Failed to start HLS stream or generate .ts segments");
        setIsStartingHls(false);
      }
    },
    [roomId]
  );

  const stopHlsStream = useCallback(
    async (socket: Socket) => {
      if (!socket || !streamId) return;

      try {
        const response = await socket.emitWithAck("stopHLS", { streamId });

        if ("error" in response) {
          toast.error(`Error stopping HLS: ${response.error}`);
        } else {
          setStreamId("");
          setIsHlsStreaming(false);
          setIsStartingHls(false);
          toast.success("HLS streaming stopped");
        }
      } catch (error) {
        console.error("Error stopping HLS stream:", error);
        toast.error("Failed to stop HLS stream");
      }
    },
    [streamId]
  );

  const handleHlsStreamReady = useCallback((data: { streamId: string }) => {
    console.log("HLS stream ready confirmation received:", data);
    toast.success("HLS stream verified - .ts segments are being generated!");
  }, []);

  const handleHlsStreamFailed = useCallback((data: { streamId: string; error: string }) => {
    console.error("HLS stream failed:", data);
    toast.error(`HLS stream verification failed: ${data.error}`);
    setIsStartingHls(false);
    setIsHlsStreaming(false);
    setStreamId("");
  }, []);

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
