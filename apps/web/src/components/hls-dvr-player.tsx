"use client";

import { useRef, useState } from "react";

import ReactPlayer from "react-player";

interface HlsDvrPlayerProps {
  streamId: string;
}

export function HlsDvrPlayer({ streamId }: HlsDvrPlayerProps) {
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL}/hls/${streamId}/stream.m3u8`;

  return (
    <div className="relative h-full w-full bg-black">
      <ReactPlayer
        src={hlsUrl}
        playing={true}
        controls={true}
        width="100%"
        height="100%"
        onReady={() => setIsBuffering(false)}
        onError={(e) => {
          console.error("Player error:", e);
          setError(
            "Video playback error. The stream may have ended or failed."
          );
          setIsBuffering(false);
        }}
      />

      {(isBuffering || error) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
          {error ? (
            <>
              <p className="text-xl text-red-400">🚨 {error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              <p className="text-lg">Loading Stream...</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
