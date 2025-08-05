"use client";

import { Device } from "mediasoup-client";
import type { Transport, Consumer, Producer } from "mediasoup-client/types";
import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

interface RemoteParticipant {
  socketId: string;
  stream: MediaStream;
  consumers: Consumer[];
}

export function useRoom(roomId: string) {
  const [isProducing, setIsProducing] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);
  const deviceRef = useRef<Device | null>(null);
  const producerTransportRef = useRef<Transport | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);
  const producersRef = useRef<Producer[]>([]);
  const consumersRef = useRef<Consumer[]>([]);

  const updateRemoteParticipants = useCallback(() => {
    const participantMap = new Map<string, Consumer[]>();
    consumersRef.current.forEach((consumer) => {
      const socketId = consumer.appData.producerSocketId as string;
      if (!participantMap.has(socketId)) {
        participantMap.set(socketId, []);
      }
      participantMap.get(socketId)!.push(consumer);
    });

    const newParticipants: RemoteParticipant[] = [];
    participantMap.forEach((consumers, socketId) => {
      const tracks = consumers.map((c) => c.track);
      newParticipants.push({
        socketId,
        stream: new MediaStream(tracks),
        consumers,
      });
    });
    setRemoteParticipants(newParticipants);
  }, []);

  const joinRoom = useCallback(
    async (socket: Socket) => {
      const joinRoomResponse = await socket.emitWithAck("joinRoom", { roomId });

      if ("error" in joinRoomResponse) {
        throw new Error(`Failed to join room: ${joinRoomResponse.error}`);
      }

      const { producers: existingProducers } = joinRoomResponse;

      const rtpCapabilitiesResponse = await socket.emitWithAck(
        "getRtpCapabilities",
        {
          roomId,
        }
      );

      if ("error" in rtpCapabilitiesResponse) {
        throw new Error(
          `Failed to get RTP capabilities: ${rtpCapabilitiesResponse.error}`
        );
      }

      const rtpCapabilities = rtpCapabilitiesResponse.rtpCapabilities;
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;

      const consumerTransportParams = await socket.emitWithAck(
        "createWebRtcTransport",
        { roomId, type: "consumer" }
      );

      if ("error" in consumerTransportParams) {
        throw new Error(
          `Failed to create consumer transport: ${consumerTransportParams.error}`
        );
      }

      const consumerTransport = device.createRecvTransport(
        consumerTransportParams.params
      );
      consumerTransport.on("connect", ({ dtlsParameters }, callback) => {
        socket.emit(
          "connectTransport",
          { roomId, transportId: consumerTransport.id, dtlsParameters },
          callback
        );
      });
      consumerTransportRef.current = consumerTransport;

      for (const { socketId } of existingProducers) {
        await createConsumer(socket, socketId);
      }
    },
    [roomId]
  );

  const createConsumer = async (socket: Socket, producerSocketId: string) => {
    if (!deviceRef.current || !consumerTransportRef.current) return;
    const consumeResponse = await socket.emitWithAck("consume", {
      roomId,
      producerSocketId,
      rtpCapabilities: deviceRef.current.rtpCapabilities,
    });

    if ("error" in consumeResponse) {
      throw new Error(`Failed to create consumer: ${consumeResponse.error}`);
    }

    const { params } = consumeResponse;

    for (const consumerParam of params) {
      const consumer = await consumerTransportRef.current.consume(
        consumerParam
      );
      consumersRef.current.push(consumer);
      await socket.emitWithAck("resume", { roomId, consumerId: consumer.id });
    }
    updateRemoteParticipants();
  };

  const createProducerTransportAndStartProducing = async (
    socket: Socket,
    localStream: MediaStream
  ) => {
    const device = deviceRef.current;
    if (!device) return;

    const producerTransportParams = await socket.emitWithAck(
      "createWebRtcTransport",
      { roomId, type: "producer" }
    );

    if ("error" in producerTransportParams) {
      throw new Error(
        `Failed to create producer transport: ${producerTransportParams.error}`
      );
    }

    const transport = device.createSendTransport(
      producerTransportParams.params
    );

    transport.on("connect", ({ dtlsParameters }, callback) => {
      socket.emit(
        "connectTransport",
        { roomId, transportId: transport.id, dtlsParameters },
        callback
      );
    });

    transport.on("produce", async (parameters, callback, errback) => {
      try {
        const { id } = await socket.emitWithAck("produce", {
          roomId,
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
        });
        callback({ id });
      } catch (error) {
        errback(error as Error);
      }
    });

    for (const track of localStream.getTracks()) {
      const producer = await transport.produce({ track });
      producersRef.current.push(producer);
    }
    setIsProducing(true);
  };

  const handleProducerClosed = useCallback(
    ({ socketId }: { socketId: string }) => {
      consumersRef.current = consumersRef.current.filter((c) => {
        if (c.appData.producerSocketId === socketId) {
          c.close();
          return false;
        }
        return true;
      });
      updateRemoteParticipants();
    },
    [updateRemoteParticipants]
  );

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
    joinRoom,
    createConsumer,
    createProducerTransportAndStartProducing,
    handleProducerClosed,
    cleanup,
  };
}
