"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useSocket } from "@/hooks/use-socket";
import { useRoom } from "@/hooks/use-room";
import { VideoGrid } from "@/components/video-grid";
import { ControlBar } from "@/components/control-bar";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.meetingId as string;

  const [status, setStatus] = useState("Connecting...");

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
    joinRoom,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleProducerClosed,
    cleanup,
  } = useRoom(meetingId);

  const handleJoinCall = () => {
    if (socket && localStream) {
      setStatus("Joining call...");
      createProducerTransportAndStartProducing(socket, localStream).then(() => {
        setStatus("Live in call!");
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
        setStatus("Could not get media. Please check permissions.");
        return;
      }

      setStatus("Joining room...");
      await joinRoom(socket);
      setStatus("In room, ready to join call.");
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
  }, [socket, isConnected, getMedia, handleProducerClosed, cleanup]);

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
        // We'll add HLS props later
        isHlsStreaming={false}
        isStartingHls={false}
        onStartHls={() => {}}
        onStopHls={() => {}}
      />
    </div>
  );
}
