import { webRtcTransportOptions } from "@/config/mediasoup";
import { getLegacyRouter } from "@/services/mediasoup";
import type { SocketTransports } from "@/types";
import type { Producer } from "mediasoup/types";
import type { Server, Socket } from "socket.io";

const legacyTransports = new Map<string, SocketTransports>();
const legacyProducers = new Map<string, Producer[]>();

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

        // Let other clients know (except the one that sent the produce request) a new producer is available
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

    socket.on("disconnect", () => {
      console.log(`A client disconnected in the new handler: ${socket.id}`);
    });
  });
}
