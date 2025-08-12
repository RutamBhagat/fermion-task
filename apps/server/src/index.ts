import "dotenv/config";

import { Hono } from "hono";
import { Server } from "socket.io";
import { cors } from "hono/cors";
import { initMediasoup, getWorkerStats } from "@/services/mediasoup";
import { getRoomDistribution } from "@/services/room";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from '@hono/node-server/serve-static';
import { setupSocketHandlers } from "@/handlers/socket";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

app.get("/", (c) => {
  return c.text("Mediasoup SFU Server OK");
});

app.get("/stats", (c) => {
  return c.json(getRoomDistribution());
});

app.get("/workers", (c) => {
  return c.json(getWorkerStats());
});

app.use('/hls/*', serveStatic({ root: './' }));

async function startServer() {
  try {
    await initMediasoup();

    const httpServer = serve(
      {
        fetch: app.fetch,
        port: Number(process.env.PORT) || 3000,
      },
      (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
      }
    );

    const io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
      },
    });

    setupSocketHandlers(io);
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

startServer();
