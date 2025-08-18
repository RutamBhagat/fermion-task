"use client";

import { useVideoGrid } from "@/hooks/use-video-grid";
import { cn } from "@/lib/utils";
import { MicOff, VideoOff } from "lucide-react";

interface RemoteParticipant {
  socketId: string;
  stream: MediaStream;
}

interface Props {
  localStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  dominantSpeaker: string | null;
  currentSocketId?: string;
  isMuted: boolean;
  isVideoOff: boolean;
}

export function VideoGrid({
  localStream,
  remoteParticipants,
  dominantSpeaker,
  currentSocketId,
  isMuted,
  isVideoOff,
}: Props) {
  const participantCount = remoteParticipants.length + 1; // You + others
  const { gridClass } = useVideoGrid(participantCount);

  const isLocalDominant = dominantSpeaker === currentSocketId;

  return (
    <div className={cn("grid h-full w-full gap-1 p-1", gridClass)}>
      <div 
        key="local-video" 
        className={cn(
          "relative overflow-hidden rounded-lg bg-gray-900 transition-all duration-300",
          isLocalDominant && "ring-4 ring-green-500 shadow-lg shadow-green-500/30 animate-pulse"
        )}
      >
        <video
          ref={(element) => {
            if (element) {
              if (localStream) {
                element.srcObject = localStream;
              }
            }
          }}
          onLoadedMetadata={(e) => e.currentTarget.play()}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <div className={cn(
            "rounded px-2 py-1 font-medium text-xs transition-all duration-300",
            isLocalDominant 
              ? "bg-green-600/90 text-white shadow-lg" 
              : "bg-black/70 text-white"
          )}>
            You {isLocalDominant && "🎤"}
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

      {remoteParticipants.map((participant) => {
        const isParticipantDominant = dominantSpeaker === participant.socketId;
        
        return (
        <div
          key={participant.socketId}
          className={cn(
            "relative overflow-hidden rounded-lg bg-gray-900 transition-all duration-300",
            isParticipantDominant && "ring-4 ring-green-500 shadow-lg shadow-green-500/30 animate-pulse"
          )}
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
          <div className={cn(
            "absolute bottom-2 left-2 rounded px-2 py-1 font-medium text-xs transition-all duration-300",
            isParticipantDominant 
              ? "bg-green-600/90 text-white shadow-lg" 
              : "bg-black/70 text-white"
          )}>
            {participant.socketId.substring(0, 8)} {isParticipantDominant && "🎤"}
          </div>
        </div>
        );
      })}
    </div>
  );
}
