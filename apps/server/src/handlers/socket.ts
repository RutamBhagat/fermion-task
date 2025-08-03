import type * as mediasoup from "mediasoup";
import type { Server, Socket } from "socket.io";
import type { SocketTransports } from "@/types/index.js";
import { webRtcTransportOptions } from "../config/mediasoup.js";
import {
  createCompositeHLSStream,
  getHLSProcesses,
  stopHLSStream,
} from "../services/hls.js";
import { getLegacyRouter } from "../services/mediasoup.js";
import {
  createRoom,
  getAllRooms,
  getRoomState,
  joinRoom,
  leaveRoom,
} from "../services/room.js";

const legacyTransports = new Map<string, SocketTransports>();
const legacyProducers = new Map<string, mediasoup.types.Producer[]>();
const legacyConsumers = new Map<string, mediasoup.types.Consumer>();

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    let currentRoomId: string | null = null;

    socket.on("joinRoom", async (data) => {
      try {
        const { roomId } = data;
        currentRoomId = roomId;

        await createRoom(roomId);
        joinRoom(roomId, socket.id);

        const roomState = getRoomState(roomId);
        if (roomState) {
          io.emit("roomParticipantCount", {
            roomId,
            count: roomState.participants.size,
          });
        }

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
          io.emit("roomParticipantCount", {
            roomId,
            count: roomState.participants.size,
          });
        }
      }
    });

    socket.on("getRtpCapabilities", (data, callback) => {
      try {
        const { roomId } = data || {};
        let targetRouter: mediasoup.types.Router;

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }
          targetRouter = roomState.router;
        } else {
          targetRouter = getLegacyRouter();
        }

        const rtpCapabilities = targetRouter.rtpCapabilities;
        callback({ rtpCapabilities });
      } catch (error) {
        console.error("Error getting RTP capabilities:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("createWebRtcTransport", async (data, callback) => {
      try {
        const { roomId, type } = data || {};
        let targetRouter: mediasoup.types.Router;
        let targetTransports: Map<string, SocketTransports>;

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }
          targetRouter = roomState.router;
          targetTransports = roomState.transports;
        } else {
          targetRouter = getLegacyRouter();
          targetTransports = legacyTransports;
        }

        const transport = await targetRouter.createWebRtcTransport(
          webRtcTransportOptions,
        );

        if (!targetTransports.has(socket.id)) {
          targetTransports.set(socket.id, {});
        }
        const transportType = type || "producer";
        const socketTransports = targetTransports.get(socket.id);
        if (socketTransports) {
          if (transportType === "producer") {
            socketTransports.producer = transport;
          } else {
            socketTransports.consumer = transport;
          }
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
        console.error("Error creating WebRTC transport:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("connectTransport", async (data, callback) => {
      try {
        const { roomId, transportId, dtlsParameters } = data;
        let targetTransports: Map<string, SocketTransports>;

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }
          targetTransports = roomState.transports;
        } else {
          targetTransports = legacyTransports;
        }

        const transportsForSocket = targetTransports.get(socket.id);
        if (!transportsForSocket) {
          throw new Error("No transports found for socket");
        }

        const transport = Object.values(transportsForSocket).find(
          (t) => t && t.id === transportId,
        );

        if (!transport) {
          throw new Error("Transport not found");
        }

        if (transport.dtlsState !== "new") {
          console.log("Transport already connected, skipping");
          callback();
          return;
        }

        await transport.connect({ dtlsParameters });
        callback();
      } catch (error) {
        console.error("Error connecting transport:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("produce", async (data, callback) => {
      try {
        const { roomId, kind, rtpParameters } = data;
        let targetTransports: Map<string, SocketTransports>;
        let targetProducers: Map<string, mediasoup.types.Producer[]>;

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }
          targetTransports = roomState.transports;
          targetProducers = roomState.producers;
        } else {
          targetTransports = legacyTransports;
          targetProducers = legacyProducers;
        }

        const transportsForSocket = targetTransports.get(socket.id);
        const transport = transportsForSocket?.producer;

        if (!transport) {
          throw new Error("Producer transport not found");
        }

        const producer = await transport.produce({
          kind,
          rtpParameters,
        });

        if (!targetProducers.has(socket.id)) {
          targetProducers.set(socket.id, []);
        }
        const producerList = targetProducers.get(socket.id);
        if (producerList) {
          producerList.push(producer);
        }

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (roomState) {
            roomState.participants.forEach((participantId) => {
              if (participantId !== socket.id) {
                io.to(participantId).emit("newProducer", {
                  producerId: producer.id,
                  socketId: socket.id,
                  roomId,
                });
              }
            });
          }
        } else {
          socket.broadcast.emit("newProducer", {
            producerId: producer.id,
            socketId: socket.id,
          });
        }

        callback({ id: producer.id });
      } catch (error) {
        console.error("Error producing:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("consume", async (data, callback) => {
      try {
        const { roomId, producerSocketId, rtpCapabilities } = data;
        let targetTransports: Map<string, SocketTransports>;
        let targetProducers: Map<string, mediasoup.types.Producer[]>;
        let targetConsumers: Map<string, mediasoup.types.Consumer>;
        let targetRouter: mediasoup.types.Router;

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }
          targetTransports = roomState.transports;
          targetProducers = roomState.producers;
          targetConsumers = roomState.consumers;
          targetRouter = roomState.router;
        } else {
          targetTransports = legacyTransports;
          targetProducers = legacyProducers;
          targetConsumers = legacyConsumers;
          targetRouter = getLegacyRouter();
        }

        const transportsForSocket = targetTransports.get(socket.id);
        const transport = transportsForSocket?.consumer;

        if (!transport) {
          callback({ error: "Consumer transport not found" });
          return;
        }

        const producerList = targetProducers.get(producerSocketId);

        if (!producerList || producerList.length === 0) {
          callback({ error: "No producers found for socket" });
          return;
        }

        const consumableProducers = producerList.filter(
          (p: mediasoup.types.Producer) =>
            targetRouter.canConsume({
              producerId: p.id,
              rtpCapabilities,
            }),
        );

        if (consumableProducers.length === 0) {
          callback({ error: "No consumable producers found" });
          return;
        }

        const consumerParams = [];

        for (const producer of consumableProducers) {
          const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true,
            appData: {
              socketId: socket.id,
              producerSocketId,
              roomId,
            },
          });

          targetConsumers.set(consumer.id, consumer);

          consumerParams.push({
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });

          console.log(
            `Created consumer for ${consumer.kind} track:`,
            consumer.id,
            roomId ? `in room ${roomId}` : "(legacy)",
          );
        }

        callback({ params: consumerParams });
      } catch (error) {
        console.error("Error consuming:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("resume", async (data, callback) => {
      try {
        const { consumerId } = data;

        let consumer: mediasoup.types.Consumer | undefined;

        for (const [roomId, roomState] of getAllRooms()) {
          consumer = roomState.consumers.get(consumerId);
          if (consumer) {
            console.log(`Found consumer ${consumerId} in room ${roomId}`);
            break;
          }
        }

        if (!consumer) {
          consumer = legacyConsumers.get(consumerId);
          if (consumer) {
            console.log(`Found consumer ${consumerId} in legacy system`);
          }
        }

        if (!consumer) {
          throw new Error(`Consumer not found: ${consumerId}`);
        }

        if (consumer.paused) {
          await consumer.resume();
          console.log(`Consumer resumed: ${consumerId}`);
        }

        callback();
      } catch (error) {
        console.error("Error resuming consumer:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("getProducers", (data, callback) => {
      try {
        const { roomId } = data || {};
        let targetProducers: Map<string, mediasoup.types.Producer[]>;

        if (roomId) {
          const roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }
          targetProducers = roomState.producers;
        } else {
          targetProducers = legacyProducers;
        }

        const existingProducers: Array<{
          producerId: string;
          socketId: string;
        }> = [];
        targetProducers.forEach((producerList, socketId) => {
          if (socketId !== socket.id) {
            producerList.forEach((producer: mediasoup.types.Producer) => {
              existingProducers.push({
                producerId: producer.id,
                socketId: socketId,
              });
            });
          }
        });
        callback(existingProducers);
      } catch (error) {
        console.error("Error getting producers:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("startHLS", async (data, callback) => {
      try {
        const { roomId } = data || {};
        let streamId: string;
        const allAudioProducers: mediasoup.types.Producer[] = [];
        const allVideoProducers: mediasoup.types.Producer[] = [];
        let roomState: import("@/types/index.js").RoomState | null = null;

        if (roomId) {
          streamId = `room_${roomId}_${Date.now()}`;
          roomState = getRoomState(roomId);
          if (!roomState) {
            callback({ error: "Room not found" });
            return;
          }

          roomState.producers.forEach((producerList, socketId) => {
            if (!roomState?.participants.has(socketId)) {
              console.warn(
                `Skipping producers for disconnected participant ${socketId}`,
              );
              return;
            }

            const audioProducer = producerList.find(
              (p: mediasoup.types.Producer) => p.kind === "audio" && !p.closed,
            );
            const videoProducer = producerList.find(
              (p: mediasoup.types.Producer) => p.kind === "video" && !p.closed,
            );

            if (audioProducer) {
              console.log(
                `Adding audio producer ${audioProducer.id} from participant ${socketId}`,
              );
              allAudioProducers.push(audioProducer);
            }
            if (videoProducer) {
              console.log(
                `Adding video producer ${videoProducer.id} from participant ${socketId}`,
              );
              allVideoProducers.push(videoProducer);
            }
          });
        } else {
          streamId = `stream_composite_${Date.now()}`;

          legacyProducers.forEach((producerList, socketId) => {
            const audioProducer = producerList.find(
              (p: mediasoup.types.Producer) => p.kind === "audio" && !p.closed,
            );
            const videoProducer = producerList.find(
              (p: mediasoup.types.Producer) => p.kind === "video" && !p.closed,
            );

            if (audioProducer) {
              console.log(
                `Adding legacy audio producer ${audioProducer.id} from ${socketId}`,
              );
              allAudioProducers.push(audioProducer);
            }
            if (videoProducer) {
              console.log(
                `Adding legacy video producer ${videoProducer.id} from ${socketId}`,
              );
              allVideoProducers.push(videoProducer);
            }
          });
        }

        if (allAudioProducers.length === 0 && allVideoProducers.length === 0) {
          throw new Error("No producers found for HLS streaming");
        }

        const validAudioProducers = allAudioProducers.filter((p) => !p.closed);
        const validVideoProducers = allVideoProducers.filter((p) => !p.closed);

        if (
          validAudioProducers.length === 0 &&
          validVideoProducers.length === 0
        ) {
          throw new Error("All producers were closed during HLS preparation");
        }

        console.log(
          `Creating HLS stream with ${validAudioProducers.length} audio and ${validVideoProducers.length} video producers`,
        );

        let hlsRouter: mediasoup.types.Router;
        if (roomId && roomState?.router) {
          hlsRouter = roomState.router;
        } else {
          hlsRouter = getLegacyRouter();
        }

        const result = await createCompositeHLSStream(
          streamId,
          validAudioProducers,
          validVideoProducers,
          socket.id,
          hlsRouter,
          io,
        );
        callback(result);
      } catch (error) {
        console.error("Error starting HLS stream:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("stopHLS", (data, callback) => {
      try {
        const { streamId } = data;
        stopHLSStream(streamId);
        callback({ success: true });
      } catch (error) {
        console.error("Error stopping HLS stream:", error);
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });




    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);

      if (currentRoomId) {
        leaveRoom(currentRoomId, socket.id);

        const roomState = getRoomState(currentRoomId);
        if (roomState) {
          io.emit("roomParticipantCount", {
            roomId: currentRoomId,
            count: roomState.participants.size,
          });

          roomState.participants.forEach((participantId) => {
            io.to(participantId).emit("producerClosed", {
              socketId: socket.id,
              roomId: currentRoomId,
            });
          });
        }
      }

      const legacyTransportsForSocket = legacyTransports.get(socket.id);
      const legacyProducerList = legacyProducers.get(socket.id);

      if (legacyTransportsForSocket) {
        if (legacyTransportsForSocket.producer)
          legacyTransportsForSocket.producer.close();
        if (legacyTransportsForSocket.consumer)
          legacyTransportsForSocket.consumer.close();
      }

      if (legacyProducerList) {
        legacyProducerList.forEach((producer) => producer.close());
      }

      for (const [consumerId, consumer] of legacyConsumers) {
        if (consumer.appData?.socketId === socket.id) {
          consumer.close();
          legacyConsumers.delete(consumerId);
        }
      }

      legacyTransports.delete(socket.id);
      legacyProducers.delete(socket.id);

      for (const [streamId] of getHLSProcesses()) {
        if (streamId.includes(socket.id)) {
          stopHLSStream(streamId);
        }
      }

      socket.broadcast.emit("producerClosed", { socketId: socket.id });
    });
  });
}
