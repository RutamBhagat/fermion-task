import type { Server } from "socket.io";
import fs from "node:fs";

const HLS_DIR = "./hls";

export function monitorHLSStream(
  streamId: string,
  socketId: string,
  io: Server
) {
  const streamPath = `${HLS_DIR}/${streamId}/stream.m3u8`;

  const checkStream = () => {
    if (fs.existsSync(streamPath)) {
      const content = fs.readFileSync(streamPath, "utf-8");
      if (content.includes(".ts")) {
        io.to(socketId).emit("hlsStreamReady", { streamId });
        return true;
      }
    }
    return false;
  };

  let attempts = 0;
  const interval = setInterval(() => {
    if (checkStream() || ++attempts >= 30) {
      if (attempts >= 30) {
        io.to(socketId).emit("hlsStreamFailed", {
          streamId,
          error: "Stream timed out",
        });
      }
      clearInterval(interval);
    }
  }, 1000);
}
