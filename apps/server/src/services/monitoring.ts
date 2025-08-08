import type { Server } from "socket.io";
import fs from "node:fs";

const HLS_DIR = "./hls";

export function monitorHLSStream(
  streamId: string,
  socketId: string,
  io: Server
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
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
        clearInterval(interval);
        if (attempts >= 30) {
          const error = "Stream timed out - no .ts segments generated";
          io.to(socketId).emit("hlsStreamFailed", {
            streamId,
            error,
          });
          resolve({ success: false, error });
        } else {
          resolve({ success: true });
        }
      }
    }, 1000);
  });
}
