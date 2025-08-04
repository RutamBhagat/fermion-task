import { webRtcTransportOptions } from "@/config/mediasoup";
import { getLegacyRouter } from "@/services/mediasoup";
import type { SocketTransports } from "@/types";
import type { Consumer, Producer } from "mediasoup/types";
import type { Server, Socket } from "socket.io";

const legacyTransports = new Map<string, SocketTransports>();
const legacyProducers = new Map<string, Producer[]>();
const legacyConsumers = new Map<string, Consumer>();

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`A client connected in the new handler: ${socket.id}`);

    socket.on("getRtpCapabilities", (data, callback) => {
      try {
        const router = getLegacyRouter();
        const rtpCapabilities = router.rtpCapabilities;
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
        const { type } = data;
        const router = getLegacyRouter();
        const transport = await router.createWebRtcTransport(
          webRtcTransportOptions
        );

        if (!legacyTransports.has(socket.id)) {
          legacyTransports.set(socket.id, {});
        }

        const transportType = type || "producer";
        const socketTransports = legacyTransports.get(socket.id);

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
        const { transportId, dtlsParameters } = data;
        const transportsForSocket = legacyTransports.get(socket.id);

        if (!transportsForSocket) {
          throw new Error("No transports found for socket");
        }

        // Find the transport (could be producer or consumer)
        const transport = Object.values(transportsForSocket).find(
          (t) => t && t.id === transportId
        );

        if (!transport) {
          throw new Error("Transport not found");
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
        const { kind, rtpParameters } = data;
        const transportsForSocket = legacyTransports.get(socket.id);
        const transport = transportsForSocket?.producer;

        if (!transport) {
          throw new Error("Producer transport not found");
        }

        const producer = await transport.produce({
          kind,
          rtpParameters,
        });

        if (!legacyProducers.has(socket.id)) {
          legacyProducers.set(socket.id, []);
        }
        const producerList = legacyProducers.get(socket.id);
        if (producerList) {
          producerList.push(producer);
        }

        // Let other clients know a new producer is available
        socket.broadcast.emit("newProducer", {
          producerId: producer.id,
          socketId: socket.id,
        });

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
        const { producerSocketId, rtpCapabilities } = data;
        const router = getLegacyRouter();
        const transportsForSocket = legacyTransports.get(socket.id);
        const transport = transportsForSocket?.consumer;

        if (!transport) {
          callback({ error: "Consumer transport not found" });
          return;
        }

        const producerList = legacyProducers.get(producerSocketId);

        if (!producerList || producerList.length === 0) {
          callback({ error: "No producers found for socket" });
          return;
        }

        const consumableProducers = producerList.filter((p: Producer) =>
          router.canConsume({
            producerId: p.id,
            rtpCapabilities,
          })
        );

        if (consumableProducers.length === 0) {
          callback({ error: "No consumable producers found" });
          return;
        }

        const consumerParamsArray = [];

        for (const producer of consumableProducers) {
          const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true,
            appData: {
              socketId: socket.id,
              producerSocketId,
            },
          });

          legacyConsumers.set(consumer.id, consumer);

          consumerParamsArray.push({
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });
        }

        callback({ params: consumerParamsArray });
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
        const consumer = legacyConsumers.get(consumerId);

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

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);

      const transportsForSocket = legacyTransports.get(socket.id);
      const producerList = legacyProducers.get(socket.id);

      if (transportsForSocket) {
        if (transportsForSocket.producer) transportsForSocket.producer.close();
        if (transportsForSocket.consumer) transportsForSocket.consumer.close();
      }

      if (producerList) {
        producerList.forEach((producer) => producer.close());
      }

      for (const [consumerId, consumer] of legacyConsumers) {
        if (consumer.appData?.socketId === socket.id) {
          consumer.close();
          legacyConsumers.delete(consumerId);
        }
      }

      legacyTransports.delete(socket.id);
      legacyProducers.delete(socket.id);

      // Let other clients know this producer has left
      socket.broadcast.emit("producerClosed", { socketId: socket.id });
    });
  });
}
