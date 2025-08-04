"use client";

import { Device } from "mediasoup-client";
import type {
  RtpCapabilities,
  Transport,
  DtlsParameters,
  IceCandidate,
  IceParameters,
  Consumer,
  RtpParameters,
  Producer,
} from "mediasoup-client/types";
import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

interface TransportParams {
  params: {
    id: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
  };
}

export function useWebRTC() {
  const [isProducing, setIsProducing] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<any[]>([]);

  const deviceRef = useRef<Device | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);
  const consumersRef = useRef<Consumer[]>([]);
  const producerTransportRef = useRef<Transport | null>(null);
  const producersRef = useRef<Producer[]>([]);

  const initializeDevice = useCallback(async (socket: Socket) => {
    const { rtpCapabilities } = await new Promise<{
      rtpCapabilities: RtpCapabilities;
    }>((resolve) => {
      socket.emit("getRtpCapabilities", {}, resolve);
    });

    const device = new Device();

    await device.load({ routerRtpCapabilities: rtpCapabilities });

    deviceRef.current = device;

    console.log("Mediasoup device initialized.");
    return device;
  }, []);

  const createConsumerTransport = useCallback(async (socket: Socket) => {
    if (!deviceRef.current) return;

    const { params } = await new Promise<TransportParams>((resolve) => {
      socket.emit("createWebRtcTransport", { type: "consumer" }, resolve);
    });

    const consumerTransport = deviceRef.current.createRecvTransport(params);
    consumerTransportRef.current = consumerTransport;

    consumerTransport.on("connect", async ({ dtlsParameters }, callback) => {
      socket.emit(
        "connectTransport",
        {
          transportId: consumerTransport.id,
          dtlsParameters,
        },
        callback
      );
    });

    return consumerTransport;
  }, []);

  const createConsumer = useCallback(
    async (socket: Socket, socketId: string) => {
      if (!deviceRef.current || !consumerTransportRef.current) return;

      const { params: consumerParamsArray } = await new Promise<{
        params: Array<{
          id: string;
          producerId: string;
          kind: "audio" | "video";
          rtpParameters: RtpParameters;
        }>;
      }>((resolve) => {
        socket.emit(
          "consume",
          {
            producerSocketId: socketId,
            rtpCapabilities: deviceRef.current?.rtpCapabilities,
          },
          resolve
        );
      });

      for (const consumerParams of consumerParamsArray) {
        const consumer = await consumerTransportRef.current.consume({
          id: consumerParams.id,
          producerId: consumerParams.producerId,
          kind: consumerParams.kind,
          rtpParameters: consumerParams.rtpParameters,
        });

        consumersRef.current.push(consumer);

        await new Promise<void>((resolve) => {
          socket.emit("resume", { consumerId: consumer.id }, resolve);
        });
      }

      // This is a placeholder for now. We will improve this logic later.
      // It creates a MediaStream from all consumer tracks and updates the UI.
      const allTracks = consumersRef.current.map((c) => c.track);
      const stream = new MediaStream(allTracks);
      setRemoteParticipants([{ socketId, stream }]);
    },
    []
  );

  const createProducerTransportAndStartProducing = useCallback(
    async (socket: Socket, localStream: MediaStream) => {
      if (!deviceRef.current || !localStream) return;

      const { params } = await new Promise<TransportParams>((resolve) => {
        socket.emit("createWebRtcTransport", { type: "producer" }, resolve);
      });
      const transport = deviceRef.current.createSendTransport(params);
      producerTransportRef.current = transport;

      transport.on("connect", async ({ dtlsParameters }, callback) => {
        socket.emit(
          "connectTransport",
          { transportId: transport.id, dtlsParameters },
          callback
        );
      });

      transport.on("produce", async (parameters, callback) => {
        const { id } = await new Promise<{ id: string }>((resolve) => {
          socket.emit(
            "produce",
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            },
            resolve
          );
        });
        callback({ id });
      });

      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const videoProducer = await transport.produce({ track: videoTrack });
        producersRef.current.push(videoProducer);
      }
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await transport.produce({ track: audioTrack });
        producersRef.current.push(audioProducer);
      }

      if (producersRef.current.length > 0) {
        setIsProducing(true);
      }
    },
    []
  );

  const handleNewProducer = useCallback(
    async (socket: Socket, params: { socketId: string }) => {
      await createConsumer(socket, params.socketId);
    },
    [createConsumer]
  );

  const handleProducerClosed = useCallback((params: { socketId: string }) => {
    console.log(`Producer closed: ${params.socketId}, cleaning up consumers.`);
    setRemoteParticipants((prev) =>
      prev.filter((p) => p.socketId !== params.socketId)
    );
  }, []);

  const cleanup = useCallback(() => {
    producersRef.current.forEach((producer) => producer.close());
    consumersRef.current.forEach((consumer) => consumer.close());

    if (producerTransportRef.current) {
      producerTransportRef.current.close();
      producerTransportRef.current = null;
    }
    if (consumerTransportRef.current) {
      consumerTransportRef.current.close();
      consumerTransportRef.current = null;
    }

    producersRef.current = [];
    consumersRef.current = [];
    setIsProducing(false);
    setRemoteParticipants([]);
  }, []);

  return {
    isProducing,
    remoteParticipants,
    initializeDevice,
    createConsumerTransport,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleNewProducer,
    handleProducerClosed,
    cleanup,
  };
}
