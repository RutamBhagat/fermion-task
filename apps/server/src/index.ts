import "dotenv/config";
import { createServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./handlers/socket.js";
import { initMediasoup } from "./services/mediasoup.js";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/", (c) => {
  return c.text("Mediasoup SFU Server OK");
});

app.get("/hls/*", async (c) => {
  const path = c.req.path.replace("/hls", "");
  const fs = await import("node:fs/promises");
  try {
    const content = await fs.readFile(`./hls${path}`);
    const ext = path.split(".").pop();
    const contentType =
      ext === "m3u8"
        ? "application/vnd.apple.mpegurl"
        : ext === "ts"
          ? "video/mp2t"
          : "application/octet-stream";
    return new Response(content, {
      headers: { "Content-Type": contentType },
    });
  } catch (_error) {
    return c.text("File not found", 404);
  }
});

const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/socket.io")) {
    return;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers,
  });

  const response = await app.fetch(request);
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (response.body) {
    const reader = response.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) return;
      res.write(value);
      await pump();
    };
    await pump();
  }
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

initMediasoup()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Mediasoup SFU Server running on port ${PORT}`);
    });
  })
  .catch(console.error);
