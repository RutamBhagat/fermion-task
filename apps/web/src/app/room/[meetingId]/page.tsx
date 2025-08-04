"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useSocket } from "@/hooks/use-socket";
import { useWebRTC } from "@/hooks/use-webrtc";

export default function RoomPage() {
  const params = useParams();
  const meetingId = params.meetingId as string;

  const [status, setStatus] = useState("Connecting...");

  const { socket, isConnected } = useSocket({
    url: `${process.env.NEXT_PUBLIC_SOCKET_URL}`,
  });
  const { localStream, getMedia } = useMediaDevices();
  const {
    initializeDevice,
    createConsumerTransport,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleNewProducer,
    handleProducerClosed,
    cleanup,
  } = useWebRTC();

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
    <div>
      <h1>Meeting: {meetingId}</h1>
      <p>Status: {status}</p>
    </div>
  );
}
