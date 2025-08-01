"use client";

import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

export function useHLSStream(roomId: string) {
  const [isHlsStreaming, setIsHlsStreaming] = useState(false);
  const [isStartingHls, setIsStartingHls] = useState(false);
  const [hlsStartedByMe, setHlsStartedByMe] = useState(false);
  const [streamId, setStreamId] = useState("");
  const hlsUrlRef = useRef<string>("");

  const startHlsStream = useCallback(
    async (socket: Socket, isProducing: boolean) => {
      if (!socket?.connected) {
        toast.error("Not connected to meeting");
        return;
      }

      if (!isProducing) {
        toast.error("Please join the call first before starting HLS stream");
        return;
      }

      setIsStartingHls(true);
      toast.info("Starting HLS stream...");

      socket.emit(
        "startHLS",
        { socketId: socket.id, roomId },
        (response: { error?: string; hlsUrl?: string; streamId?: string }) => {
          if (response.error) {
            toast.error(`Error starting HLS: ${response.error}`);
            setIsStartingHls(false);
          } else {
            console.log("HLS streaming started:", response);
            toast.info("HLS stream created, waiting for segments...");

            const url = response?.hlsUrl || "";
            setStreamId(response?.streamId || "");
            setHlsStartedByMe(true);
            hlsUrlRef.current = url;
          }
        },
      );
    },
    [roomId],
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
            setHlsStartedByMe(false);
            hlsUrlRef.current = "";
            toast.success("HLS streaming stopped");
          }
        },
      );
    },
    [streamId],
  );

  const handleHlsStreamReady = useCallback(() => {
    setIsHlsStreaming(true);
    setIsStartingHls(false);

    const currentHlsUrl = hlsUrlRef.current;
    if (currentHlsUrl) {
      const streamIdMatch = currentHlsUrl.match(/\/hls\/([^/]+)\/stream\.m3u8/);
      if (streamIdMatch) {
        const streamId = streamIdMatch[1];
        const watchUrl = `${window.location.origin}/watch/${streamId}`;
        navigator.clipboard.writeText(watchUrl);
        toast.success("HLS stream is ready! Watch link copied to clipboard.");
      } else {
        toast.success("HLS stream is ready!");
      }
    } else {
      toast.success("HLS stream is ready!");
    }
  }, []);

  const handleHlsStreamFailed = useCallback(
    (data: { streamId: string; error: string }) => {
      console.error("HLS stream failed:", data);
      setIsStartingHls(false);
      setIsHlsStreaming(false);
      toast.error(`HLS stream failed: ${data.error}`);
    },
    [],
  );

  return {
    isHlsStreaming,
    isStartingHls,
    hlsStartedByMe,
    streamId,
    startHlsStream,
    stopHlsStream,
    handleHlsStreamReady,
    handleHlsStreamFailed,
  };
}
