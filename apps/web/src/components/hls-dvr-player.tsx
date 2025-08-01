"use client";

import { type SyntheticEvent, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { hlsConfig } from "@/lib/config/hls-config";

interface HlsDvrPlayerProps {
  streamId: string;
}

export function HlsDvrPlayer({ streamId }: HlsDvrPlayerProps) {
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL}/hls/${streamId}/stream.m3u8`;

  const handleReady = () => {
    console.log("🎬 HLS Player ready");
    setIsBuffering(false);
  };

  const handleWaiting = () => {
    console.log("⏳ Player buffering...");
    setIsBuffering(true);
  };

  const handlePlaying = () => {
    console.log("▶️ Player resumed after buffering");
    setIsBuffering(false);
  };

  const handleError = (event: SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error("❌ Player error:", event);
    setError("Video playback error occurred. Please refresh the page.");
    setIsBuffering(false);
  };

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="mb-4 text-red-500 text-xl">🚨 {error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <ReactPlayer
        ref={playerRef}
        src={hlsUrl}
        playing={true}
        controls={true}
        width="100%"
        height="100%"
        muted={true}
        playsInline={true}
        style={{
          visibility: isBuffering ? "hidden" : "visible",
        }}
        config={{
          hls: hlsConfig,
        }}
        onReady={() => {
          // biome-ignore lint/suspicious/noExplicitAny: ReactPlayer type is complex
          const player = (playerRef.current as any)?.getInternalPlayer?.();
          if (player?.startLoad) {
            player.startLoad();
            console.log(
              "🎬 HLS Player ready - manual startLoad() called for DVR",
            );
          }
          handleReady();
        }}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onError={handleError}
        onStart={() => console.log("🚀 Playback started")}
        onPause={() => console.log("⏸️ Playback paused")}
        onSeeking={() => console.log("🔍 User seeking...")}
        onSeeked={() => console.log("🎯 User finished seeking")}
        onEnded={() =>
          console.log("🏁 Stream ended (should not happen with live DVR)")
        }
      />

      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-white border-b-2" />
          <p className="text-lg">Loading Stream...</p>
          <p className="mt-2 text-gray-300 text-sm">Stream ID: {streamId}</p>
        </div>
      )}
    </div>
  );
}
