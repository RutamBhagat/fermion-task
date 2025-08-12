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
    isProducing,
    remoteParticipants,
    joinRoom,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleProducerClosed,
    pauseProducer,
    resumeProducer,
    cleanup,
  } = useRoom(meetingId);
  
  const {
    localStream,
    isMuted,
    isVideoOff,
    mediaError,
    isLoading,
    getMedia,
    toggleMute,
    toggleVideo,
  } = useMediaDevices({
    onProducerPause: pauseProducer,
    onProducerResume: resumeProducer,
  });

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
    } else if (mediaError) {
      alert(mediaError);
    } else if (isLoading) {
      alert("Still loading media devices, please wait...");
    } else {
      alert("Could not get local media, please check permissions.");
    }
  };

  const handleLeaveCall = () => {
    cleanup();
    router.push("/");
  };

  useEffect(() => {
    getMedia();
  }, [getMedia]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const initialize = async () => {
      await joinRoom(socket);
    };

    initialize();

    socket.on("newProducer", ({ socketId }) =>
      createConsumer(socket, socketId)
    );
    socket.on("producerClosed", handleProducerClosed);

    return () => {
      socket.off("newProducer");
      socket.off("producerClosed");
      cleanup();
    };
  }, [
    socket,
    isConnected,
    handleProducerClosed,
    cleanup,
    createConsumer,
    joinRoom,
  ]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <VideoGrid
        localStream={localStream}
        remoteParticipants={remoteParticipants}
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
