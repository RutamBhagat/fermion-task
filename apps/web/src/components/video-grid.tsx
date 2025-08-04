"use client";

import { MicOff, VideoOff } from "lucide-react";

interface RemoteParticipant {
  socketId: string;
  stream: MediaStream;
}

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  isMuted: boolean;
  isVideoOff: boolean;
}

export function VideoGrid({
  localStream,
  remoteParticipants,
  isMuted,
  isVideoOff,
}: VideoGridProps) {
  return (
    <div className="grid h-full w-full gap-4 p-4 grid-cols-1 md:grid-cols-2">
      <div className="relative overflow-hidden rounded-lg bg-gray-900">
        <video
          ref={(element) => {
            if (element && localStream) {
              element.srcObject = localStream;
            }
          }}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <div className="rounded bg-black/70 px-2 py-1 font-medium text-white text-xs">
            You
          </div>
          {isMuted && (
            <div className="rounded-full bg-red-600 p-1">
              <MicOff className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        {isVideoOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center text-white">
              <VideoOff className="mx-auto mb-2 h-8 w-8" />
              <p className="text-sm">Camera is off</p>
            </div>
          </div>
        )}
      </div>

      {remoteParticipants.map((participant) => (
        <div
          key={participant.socketId}
          className="relative overflow-hidden rounded-lg bg-gray-900"
        >
          <video
            ref={(element) => {
              if (element && participant.stream) {
                element.srcObject = participant.stream;
              }
            }}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-medium text-white text-xs">
            {participant.socketId.slice(-6)}
          </div>
        </div>
      ))}
    </div>
  );
}
