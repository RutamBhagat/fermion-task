"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useSocket } from "@/hooks/use-socket";
import { useWebRTC } from "@/hooks/use-webrtc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Video, VideoOff, Phone } from "lucide-react";
import { VideoGrid } from "@/components/video-grid";
import { ControlBar } from "@/components/control-bar";
import { useRouter } from "next/navigation"; // Need this for leaving

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
    getMedia,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
  } = useMediaDevices();
  const {
    isProducing,
    remoteParticipants,
    initializeDevice,
    createConsumerTransport,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleNewProducer,
    handleProducerClosed,
    cleanup,
  } = useWebRTC();

  const handleJoinCall = () => {
    if (socket && localStream) {
      createProducerTransportAndStartProducing(socket, localStream);
    }
  };

  const handleLeaveCall = () => {
    cleanup();
    router.push("/");
  };

  useEffect(() => {
    if (!socket || !isConnected) return;

    const initialize = async () => {
      setStatus("Getting media...");
      const stream = await getMedia();
      if (!stream) {
        setStatus("Could not get media. Please check permissions.");
        return;
      }

      setStatus("Initializing device...");
      await initializeDevice(socket);

      setStatus("Creating consumer transport...");
      await createConsumerTransport(socket);

      console.log("Ready to join!");
      setStatus("Ready to join!");
    };

    initialize();

    socket.on("newProducer", (data) => handleNewProducer(socket, data));
    socket.on("producerClosed", handleProducerClosed);

    return () => {
      socket.off("newProducer");
      socket.off("producerClosed");
      cleanup();
    };
  }, [
    socket,
    isConnected,
    getMedia,
    initializeDevice,
    createConsumerTransport,
    handleNewProducer,
    handleProducerClosed,
    cleanup,
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
        // The component will currently not work, We'll add HLS props later
        isHlsStreaming={false}
        isStartingHls={false}
        onStartHls={() => {}}
        onStopHls={() => {}}
      />
    </div>
  );
}
