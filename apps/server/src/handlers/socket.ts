import { webRtcTransportOptions } from "@/config/mediasoup";
import { getLegacyRouter } from "@/services/mediasoup";
import type { Server, Socket } from "socket.io";

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
        const router = getLegacyRouter();
        const transport = await router.createWebRtcTransport(
          webRtcTransportOptions
        );

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

    socket.on("disconnect", () => {
      console.log(`A client disconnected in the new handler: ${socket.id}`);
    });
  });
}
