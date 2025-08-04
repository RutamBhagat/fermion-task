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
    url: `${process.env.NEXT_PUBLIC_SERVER_URL}`,
  });
  const { localStream, getMedia, toggleMute, toggleVideo } = useMediaDevices();
  const {
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
    <div style={{ padding: "20px" }}>
      <h1>Meeting: {meetingId}</h1>
      <p>Status: {status}</p>

      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div style={{ border: "1px solid #ccc", padding: "10px" }}>
          <h2>Your Video</h2>
          <video
            ref={(element) => {
              if (element && localStream) {
                element.srcObject = localStream;
              }
            }}
            autoPlay
            muted
            playsInline
            style={{ width: "320px", backgroundColor: "#000" }}
          />
        </div>

        {remoteParticipants.map((participant) => (
          <div
            key={participant.socketId}
            style={{ border: "1px solid #ccc", padding: "10px" }}
          >
            <h2>Remote Video ({participant.socketId.slice(0, 6)})</h2>
            <video
              ref={(element) => {
                if (element && participant.stream) {
                  element.srcObject = participant.stream;
                }
              }}
              autoPlay
              playsInline
              style={{ width: "320px", backgroundColor: "#000" }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
        <button onClick={handleJoinCall}>Join Call</button>
        <button onClick={toggleMute}>Toggle Mute</button>
        <button onClick={toggleVideo}>Toggle Video</button>
      </div>
    </div>
  );
}
