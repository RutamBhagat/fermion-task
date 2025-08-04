"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useSocket } from "@/hooks/use-socket";
import { useWebRTC } from "@/hooks/use-webrtc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Video, VideoOff, Phone } from "lucide-react";

export default function RoomPage() {
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
    remoteParticipants,
    isProducing,
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
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
      <div className="grid flex-grow grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Local Video */}
        <Card className="overflow-hidden bg-gray-800">
          <CardContent className="relative h-full p-0">
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
            <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-sm">
              You
            </div>
          </CardContent>
        </Card>

        {/* Remote Videos */}
        {remoteParticipants.map((p) => (
          <Card key={p.socketId} className="overflow-hidden bg-gray-800">
            <CardContent className="relative h-full p-0">
              <video
                ref={(el) => el && p.stream && (el.srcObject = p.stream)}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-sm">
                {p.socketId.slice(0, 6)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Control Bar */}
      <div className="mt-4 flex items-center justify-center gap-4 rounded-lg bg-gray-800 p-4">
        <Button
          onClick={toggleMute}
          variant={isMuted ? "destructive" : "secondary"}
          size="lg"
          className="rounded-full"
        >
          {isMuted ? <MicOff /> : <Mic />}
        </Button>
        <Button
          onClick={toggleVideo}
          variant={isVideoOff ? "destructive" : "secondary"}
          size="lg"
          className="rounded-full"
        >
          {isVideoOff ? <VideoOff /> : <Video />}
        </Button>

        {!isProducing ? (
          <Button
            onClick={handleJoinCall}
            size="lg"
            className="rounded-full bg-green-600 px-6 hover:bg-green-700"
          >
            Join Call
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="lg"
            className="rounded-full"
            // We'll add a leave call handler later
          >
            <Phone className="rotate-[135deg]" />
          </Button>
        )}
      </div>
    </div>
  );
}
