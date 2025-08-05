import { webRtcTransportOptions } from "@/config/mediasoup";
import type { Server, Socket } from "socket.io";
import { createRoom, getRoomState, joinRoom, leaveRoom } from "@/services/room";

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    let currentRoomId: string | null = null;

    const cleanup = () => {
      if (currentRoomId) {
        leaveRoom(currentRoomId, socket.id);
        io.to(currentRoomId).emit("producerClosed", { socketId: socket.id });
        currentRoomId = null;
      }
    };

    socket.on("joinRoom", async ({ roomId }, callback) => {
      try {
        await createRoom(roomId);
        await socket.join(roomId);
        joinRoom(roomId, socket.id);
        currentRoomId = roomId;

        const roomState = getRoomState(roomId)!;
        const producerList: { producerId: string; socketId: string }[] = [];
        for (const [socketId, producers] of roomState.producers.entries()) {
          if (socketId !== socket.id) {
            producers.forEach((p) =>
              producerList.push({ producerId: p.id, socketId })
            );
          }
        }

        callback({ producers: producerList });
      } catch (error) {
        callback({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("leaveRoom", cleanup);

    socket.on("getRtpCapabilities", ({ roomId }, callback) => {
      const roomState = getRoomState(roomId);
      if (!roomState) return callback({ error: "Room not found" });
      callback({ rtpCapabilities: roomState.router.rtpCapabilities });
    });

    socket.on("createWebRtcTransport", async ({ roomId, type }, callback) => {
      const roomState = getRoomState(roomId);
      if (!roomState) return callback({ error: "Room not found" });

      const transport = await roomState.router.createWebRtcTransport(
        webRtcTransportOptions
      );
      if (!roomState.transports.has(socket.id)) {
        roomState.transports.set(socket.id, {});
      }
      const socketTransports = roomState.transports.get(socket.id)!;
      const transportType = type === "consumer" ? "consumer" : "producer";
      socketTransports[transportType] = transport;

      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });
    });

    socket.on(
      "connectTransport",
      async ({ roomId, transportId, dtlsParameters }, callback) => {
        try {
          const roomState = getRoomState(roomId);
          if (!roomState) throw new Error("Room not found");

          const transports = roomState.transports.get(socket.id);
          if (!transports) throw new Error("Transports for socket not found");

          const transport =
            transports.producer?.id === transportId
              ? transports.producer
              : transports.consumer;

          if (!transport) throw new Error("Transport not found");

          await transport.connect({ dtlsParameters });
          callback();
        } catch (e) {
          callback({ error: e instanceof Error ? e.message : "Unknown error" });
        }
      }
    );

    socket.on("produce", async ({ roomId, kind, rtpParameters }, callback) => {
      try {
        const roomState = getRoomState(roomId);
        if (!roomState) throw new Error("Room not found");

        const transport = roomState.transports.get(socket.id)?.producer;
        if (!transport) throw new Error("Producer transport not found");

        const producer = await transport.produce({ kind, rtpParameters });

        if (!roomState.producers.has(socket.id)) {
          roomState.producers.set(socket.id, []);
        }
        roomState.producers.get(socket.id)!.push(producer);

        socket.to(roomId).emit("newProducer", {
          producerId: producer.id,
          socketId: socket.id,
        });
        callback({ id: producer.id });
      } catch (e) {
        callback({ error: e instanceof Error ? e.message : "Unknown error" });
      }
    });

    socket.on(
      "consume",
      async ({ roomId, producerSocketId, rtpCapabilities }, callback) => {
        const roomState = getRoomState(roomId);
        const router = roomState?.router;
        const transport = roomState?.transports.get(socket.id)?.consumer;
        if (!router || !transport)
          return callback({ error: "room or transport error" });

        const producers = roomState.producers.get(producerSocketId);
        if (!producers) return callback({ error: "producer not found" });

        const consumersData = [];
        for (const producer of producers) {
          if (router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            const consumer = await transport.consume({
              producerId: producer.id,
              rtpCapabilities,
              paused: true,
              appData: { socketId: socket.id, producerSocketId, roomId },
            });
            roomState.consumers.set(consumer.id, consumer);
            consumersData.push({
              id: consumer.id,
              producerId: producer.id,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
            });
          }
        }
        callback({ params: consumersData });
      }
    );

    socket.on("resume", async ({ roomId, consumerId }, callback) => {
      const roomState = getRoomState(roomId);
      const consumer = roomState?.consumers.get(consumerId);
      if (!consumer) return callback({ error: "Consumer not found" });

      await consumer.resume();
      callback();
    });

    socket.on("disconnect", cleanup);
  });
}
