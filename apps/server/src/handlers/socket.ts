import { webRtcTransportOptions } from "@/config/mediasoup";
import { getLegacyRouter } from "@/services/mediasoup"; // still need this for HLS fallback
import type { SocketTransports } from "@/types";
import type { Consumer, Producer } from "mediasoup/types";
import type { Server, Socket } from "socket.io";
import {
  getAllRooms,
  createRoom,
  getRoomState,
  joinRoom,
  leaveRoom,
} from "@/services/room";

// Keep legacy maps for the HLS stream creation, which might not be tied to a room initially
const legacyTransports = new Map<string, SocketTransports>();
const legacyProducers = new Map<string, Producer[]>();
const legacyConsumers = new Map<string, Consumer>();

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    let currentRoomId: string | null = null;

    socket.on("joinRoom", async (data: { roomId: string }) => {
      try {
        const { roomId } = data;
        currentRoomId = roomId;

        await createRoom(roomId);
        joinRoom(roomId, socket.id);

        console.log(`Socket ${socket.id} joined room ${roomId}`);
      } catch (error) {
        console.error("Error joining room:", error);
      }
    });

    socket.on("leaveRoom", (data) => {
      const { roomId } = data;
      if (roomId) {
        leaveRoom(roomId, socket.id);
        currentRoomId = null;
        const roomState = getRoomState(roomId);
        if (roomState) {
          // Not really needed it shows room participant count for all rooms
          io.emit("roomParticipantCount", {
            roomId,
            count: roomState.participants.size,
          });
        }
      }
    });

    socket.on("getRtpCapabilities", (data: { roomId: string }, callback) => {
      try {
        const { roomId } = data;
        const roomState = roomId ? getRoomState(roomId) : null;
        const targetRouter = roomState ? roomState.router : getLegacyRouter();
        callback({ rtpCapabilities: targetRouter.rtpCapabilities });
      } catch (error) {
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on(
      "createWebRtcTransport",
      async (data: { roomId: string; type: string }, callback) => {
        try {
          const { roomId, type } = data;
          const roomState = roomId ? getRoomState(roomId) : null;
          const targetRouter = roomState ? roomState.router : getLegacyRouter();
          const targetTransports = roomState
            ? roomState.transports
            : legacyTransports;

          const transport = await targetRouter.createWebRtcTransport(
            webRtcTransportOptions
          );
          if (!targetTransports.has(socket.id)) {
            targetTransports.set(socket.id, {});
          }
          const socketTransports = targetTransports.get(socket.id)!;
          if (type === "consumer") {
            socketTransports.consumer = transport;
          } else {
            socketTransports.producer = transport;
          }

          callback({
            params: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            },
          });
        } catch (error) {
          callback({
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    socket.on(
      "connectTransport",
      async (
        data: { roomId: string; transportId: string; dtlsParameters: any },
        callback
      ) => {
        try {
          const { roomId, transportId, dtlsParameters } = data;
          const roomState = roomId ? getRoomState(roomId) : null;
          const targetTransports = roomState
            ? roomState.transports
            : legacyTransports;
          const transportsForSocket = targetTransports.get(socket.id);
          if (!transportsForSocket) throw new Error("No transports found");

          const transport = Object.values(transportsForSocket).find(
            (t) => t?.id === transportId
          );
          if (!transport) throw new Error("Transport not found");

          await transport.connect({ dtlsParameters });
          callback();
        } catch (error) {
          callback({
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    socket.on(
      "produce",
      async (
        data: { roomId: string; kind: any; rtpParameters: any },
        callback
      ) => {
        try {
          const { roomId, kind, rtpParameters } = data;
          const roomState = roomId ? getRoomState(roomId) : null;
          const targetTransports = roomState
            ? roomState.transports
            : legacyTransports;
          const targetProducers = roomState
            ? roomState.producers
            : legacyProducers;

          const transport = targetTransports.get(socket.id)?.producer;
          if (!transport) throw new Error("Producer transport not found");

          const producer = await transport.produce({ kind, rtpParameters });
          if (!targetProducers.has(socket.id)) {
            targetProducers.set(socket.id, []);
          }
          targetProducers.get(socket.id)!.push(producer);

          if (roomId) {
            socket.to(roomId).emit("newProducer", {
              producerId: producer.id,
              socketId: socket.id,
            });
          } else {
            socket.broadcast.emit("newProducer", {
              producerId: producer.id,
              socketId: socket.id,
            });
          }

          callback({ id: producer.id });
        } catch (error) {
          callback({
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    socket.on(
      "consume",
      async (
        data: {
          roomId: string;
          producerSocketId: string;
          rtpCapabilities: any;
        },
        callback
      ) => {
        try {
          const { roomId, producerSocketId, rtpCapabilities } = data;
          const roomState = roomId ? getRoomState(roomId) : null;
          const targetRouter = roomState ? roomState.router : getLegacyRouter();
          const targetTransports = roomState
            ? roomState.transports
            : legacyTransports;
          const targetProducers = roomState
            ? roomState.producers
            : legacyProducers;
          const targetConsumers = roomState
            ? roomState.consumers
            : legacyConsumers;

          const transport = targetTransports.get(socket.id)?.consumer;
          if (!transport) throw new Error("Consumer transport not found");

          const producerList = targetProducers.get(producerSocketId);
          if (!producerList) throw new Error("Producers not found for socket");

          const consumersData = [];
          for (const producer of producerList) {
            if (
              targetRouter.canConsume({
                producerId: producer.id,
                rtpCapabilities,
              })
            ) {
              const consumer = await transport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true,
                appData: { socketId: socket.id, producerSocketId, roomId },
              });
              targetConsumers.set(consumer.id, consumer);
              consumersData.push({
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              });
            }
          }
          callback({ params: consumersData });
        } catch (error) {
          callback({
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    socket.on(
      "resume",
      async (data: { roomId: string; consumerId: string }, callback) => {
        try {
          const { roomId, consumerId } = data;
          let consumer: Consumer | undefined;
          if (roomId) {
            const roomState = getRoomState(roomId);
            consumer = roomState?.consumers.get(consumerId);
          } else {
            for (const room of getAllRooms().values()) {
              if (room.consumers.has(consumerId)) {
                consumer = room.consumers.get(consumerId);
                break;
              }
            }
            if (!consumer) consumer = legacyConsumers.get(consumerId);
          }

          if (!consumer) throw new Error("Consumer not found");

          await consumer.resume();
          callback();
        } catch (error) {
          callback({
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    socket.on("getProducers", (data: { roomId: string }, callback) => {
      const { roomId } = data;
      const roomState = roomId ? getRoomState(roomId) : null;
      const targetProducers = roomState ? roomState.producers : legacyProducers;

      const producerList: { producerId: string; socketId: string }[] = [];
      targetProducers.forEach((producers, socketId) => {
        if (socketId !== socket.id) {
          producers.forEach((p) =>
            producerList.push({ producerId: p.id, socketId })
          );
        }
      });
      callback(producerList);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      if (currentRoomId) {
        leaveRoom(currentRoomId, socket.id);
      }
      legacyTransports.delete(socket.id);
      legacyProducers.delete(socket.id);
    });
  });
}
