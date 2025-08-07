"use client";

import { HlsDvrPlayer } from "@/components/hls-dvr-player";
import { useParams } from "next/navigation";

export default function WatchStreamPage() {
  const params = useParams();
  const streamId = params.streamId as string;

  if (!streamId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <p>No Stream ID provided.</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      <HlsDvrPlayer streamId={streamId} />
    </div>
  );
}
