"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ControlBar } from "@/components/control-bar";
import { HlsPreviewBanner } from "@/components/hls-preview-banner";
import { VideoGrid } from "@/components/video-grid";
import { useControlsVisibility } from "@/hooks/use-controls-visibility";
import { useHLSStream } from "@/hooks/use-hls-stream";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useSocket } from "@/hooks/use-socket";
import { useVideoGrid } from "@/hooks/use-video-grid";
import { useWebRTC } from "@/hooks/use-webrtc";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.meetingId as string;

  const [status, setStatus] = useState("Connecting to meeting...");
  const [hlsPreviewMode] = useState(false);

  const { socket, isConnected } = useSocket({
    url: process.env.NEXT_PUBLIC_SERVER_URL,
    roomId: meetingId,
  });

  const {
    localStream,
    isMuted,
    isVideoOff,
    hasPermissions,
    getMedia,
    toggleMute,
    toggleVideo,
  } = useMediaDevices();

  const {
    isProducing,
    remoteParticipants,
    participantCount,
    setParticipantCount,
    initializeDevice,
    createConsumerTransport,
    createConsumer,
    startProducing,
    handleNewProducer,
    handleProducerClosed,
    cleanup,
  } = useWebRTC(meetingId);

  const {
    isHlsStreaming,
    isStartingHls,
    startHlsStream,
    stopHlsStream,
    handleHlsStreamReady,
    handleHlsStreamFailed,
  } = useHLSStream(meetingId);

  const { gridClass, hlsLayout, showEmptySlots, emptySlotCount } = useVideoGrid(
    participantCount,
    hlsPreviewMode,
  );

  const { showControls } = useControlsVisibility();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const initialize = async () => {
      try {
        setStatus(`Connected to meeting: ${meetingId}`);

        await initializeDevice(socket);
        const stream = await getMedia();

        setStatus(`Ready to join meeting: ${meetingId}`);
        await createConsumerTransport(socket);

        const existingProducers = await new Promise<
          Array<{ producerId: string; socketId: string }>
        >((resolve) => {
          socket.emit("getProducers", { roomId: meetingId }, resolve);
        });

        for (const { socketId } of existingProducers) {
          await createConsumer(socket, socketId);
        }

        if (stream) {
          setStatus(`Ready to stream in meeting: ${meetingId}`);
        } else {
          setStatus(
            `Joined meeting: ${meetingId} - Enable camera/mic to stream`,
          );
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
        setStatus("Error: Setup failed");
      }
    };

    initialize();

    socket.on("disconnect", () => {
      setStatus("Disconnected from meeting");
    });

    socket.on("newProducer", (data) => handleNewProducer(socket, data));
    socket.on("producerClosed", handleProducerClosed);
    socket.on("roomParticipantCount", ({ count }) =>
      setParticipantCount(count),
    );
    socket.on("hlsStreamReady", handleHlsStreamReady);
    socket.on("hlsStreamFailed", handleHlsStreamFailed);

    return () => {
      socket.off("disconnect");
      socket.off("newProducer");
      socket.off("producerClosed");
      socket.off("roomParticipantCount");
      socket.off("hlsStreamReady");
      socket.off("hlsStreamFailed");
      cleanup();
    };
  }, [
    socket,
    isConnected,
    meetingId,
    initializeDevice,
    getMedia,
    createConsumerTransport,
    createConsumer,
    handleNewProducer,
    handleProducerClosed,
    setParticipantCount,
    handleHlsStreamReady,
    handleHlsStreamFailed,
    cleanup,
  ]);

  const handleJoinCall = async () => {
    if (!socket) return;

    try {
      if (localStream) {
        setStatus("Starting stream...");
        await startProducing(socket, localStream);
        setStatus(`Streaming in meeting: ${meetingId}`);
      } else {
        setStatus(`Joined meeting: ${meetingId} - Enable camera/mic to stream`);
      }
    } catch (error) {
      console.error("Failed to start producing:", error);
      setStatus("Failed to start streaming");
    }
  };

  const handleLeaveCall = () => {
    router.push("/");
  };

  const handleToggleMute = async () => {
    await toggleMute();
  };

  const handleToggleVideo = async () => {
    await toggleVideo();
  };

  const handleCopyMeetingLink = () => {
    const meetingUrl = `${window.location.origin}/room/${meetingId}`;
    navigator.clipboard.writeText(meetingUrl);
    toast.success("Meeting link copied to clipboard");
  };

  const handleStartHls = () => {
    if (socket) startHlsStream(socket, isProducing);
  };

  const handleStopHls = () => {
    if (socket) stopHlsStream(socket);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <HlsPreviewBanner show={hlsPreviewMode} />

      <VideoGrid
        localStream={localStream}
        remoteParticipants={remoteParticipants}
        participantCount={participantCount}
        gridClass={gridClass}
        hlsPreviewMode={hlsPreviewMode}
        hlsAspectRatio={hlsLayout.aspectRatio}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        showEmptySlots={showEmptySlots}
        emptySlotCount={emptySlotCount}
      />

      <ControlBar
        isConnected={isConnected}
        isProducing={isProducing}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isHlsStreaming={isHlsStreaming}
        isStartingHls={isStartingHls}
        showControls={showControls}
        status={status}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onJoinCall={handleJoinCall}
        onLeaveCall={handleLeaveCall}
        onStartHls={handleStartHls}
        onStopHls={handleStopHls}
        onCopyMeetingLink={handleCopyMeetingLink}
        canJoinCall={hasPermissions}
      />
    </div>
  );
}
