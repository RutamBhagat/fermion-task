import fs from "node:fs";
import type { Server } from "socket.io";

const HLS_DIR = "./hls";

export function monitorHLSStream(
  streamId: string,
  socketId: string,
  io: Server,
) {
  const streamDir = `${HLS_DIR}/${streamId}`;
  const streamPath = `${streamDir}/stream.m3u8`;

  const checkStream = () => {
    if (fs.existsSync(streamPath)) {
      try {
        const content = fs.readFileSync(streamPath, "utf-8");
        if (content.includes(".ts")) {
          console.log(
            `HLS stream ${streamId} is ready - emitting event to ${socketId}`,
          );
          io.to(socketId).emit("hlsStreamReady", { streamId });
          return true;
        }
      } catch (error) {
        console.error(`Error reading HLS playlist for ${streamId}:`, error);
      }
    }
    return false;
  };

  let attempts = 0;
  const maxAttempts = 30;

  const interval = setInterval(() => {
    attempts++;

    if (checkStream()) {
      clearInterval(interval);
      return;
    }

    if (attempts >= maxAttempts) {
      console.warn(
        `HLS stream ${streamId} failed to initialize after ${maxAttempts} seconds`,
      );
      io.to(socketId).emit("hlsStreamFailed", {
        streamId,
        error: "Stream failed to initialize",
      });
      clearInterval(interval);
    }
  }, 1000);
}
