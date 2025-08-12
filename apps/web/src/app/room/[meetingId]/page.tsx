"use client";

import { useParams, useRouter } from "next/navigation";

import { ControlBar } from "@/components/control-bar";
import { VideoGrid } from "@/components/video-grid";
import { useEffect } from "react";
import { useHLSStream } from "@/hooks/use-hls-stream";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useRoom } from "@/hooks/use-room";
import { useSocket } from "@/hooks/use-socket";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.meetingId as string;

  const { socket, isConnected } = useSocket({
    url: `${process.env.NEXT_PUBLIC_SERVER_URL}`,
  });
  const {
    localStream,
    isMuted,
    isVideoOff,
    getMedia,
    toggleMute,
    toggleVideo,
  } = useMediaDevices();
  const {
    isProducing,
    remoteParticipants,
    dominantSpeaker,
    joinRoom,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleProducerClosed,
    handleDominantSpeakerChanged,
    cleanup,
  } = useRoom(meetingId);

  const { isHlsStreaming, isStartingHls, startHlsStream, stopHlsStream } =
    useHLSStream(meetingId);

  const handleStartHls = () => {
    if (socket) startHlsStream(socket);
  };

  const handleStopHls = () => {
    if (socket) stopHlsStream(socket);
  };

  const handleJoinCall = () => {
    if (socket && localStream) {
      createProducerTransportAndStartProducing(socket, localStream).then(() => {
        console.log("Started producing local stream");
      });
    } else {
      alert("Could not get local media, please check permissions.");
    }
  };

  const handleLeaveCall = () => {
    cleanup();
    router.push("/");
  };

  useEffect(() => {
    if (!socket || !isConnected) return;

    const initialize = async () => {
      const stream = await getMedia();
      if (!stream) {
        return;
      }

      await joinRoom(socket);
    };

    initialize();

    socket.on("newProducer", ({ socketId }) =>
      createConsumer(socket, socketId)
    );
    socket.on("producerClosed", handleProducerClosed);
    socket.on("dominantSpeakerChanged", handleDominantSpeakerChanged);

    return () => {
      socket.off("newProducer");
      socket.off("producerClosed");
      socket.off("dominantSpeakerChanged");
      cleanup();
    };
  }, [
    socket,
    isConnected,
    getMedia,
    handleProducerClosed,
    handleDominantSpeakerChanged,
    cleanup,
    createConsumer,
    joinRoom,
  ]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <VideoGrid
        localStream={localStream}
        remoteParticipants={remoteParticipants}
        dominantSpeaker={dominantSpeaker}
        currentSocketId={socket?.id}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
      />
      <ControlBar
        isProducing={isProducing}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onJoinCall={handleJoinCall}
        onLeaveCall={handleLeaveCall}
        isHlsStreaming={isHlsStreaming}
        isStartingHls={isStartingHls}
        onStartHls={handleStartHls}
        onStopHls={handleStopHls}
      />
    </div>
  );
}
