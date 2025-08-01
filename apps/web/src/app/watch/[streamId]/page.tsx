"use client";

import { useParams } from "next/navigation";
import { HlsDvrPlayer } from "@/components/hls-dvr-player";

export default function WatchStreamPage() {
  const params = useParams();
  const streamId = params.streamId as string;

  if (!streamId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="mb-4 text-red-500 text-xl">❌ No Stream ID provided</p>
          <p className="text-gray-400">Please check the URL and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      <HlsDvrPlayer streamId={streamId} />
    </div>
  );
}
