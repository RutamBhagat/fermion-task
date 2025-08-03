import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { initMediasoup } from "./services/mediasoup.js";
import { tryCatch } from "./utils/try-catch.js";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

app.get("/", (c) => {
  return c.text("Mediasoup SFU Server OK");
});

async function startServer() {
  const [_, error] = await tryCatch(initMediasoup());
  if (error) {
    console.error("Failed to initialize mediasoup:", error);
    process.exit(1);
  }
  serve(
    {
      fetch: app.fetch,
      port: 3000,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    }
  );
}

startServer();
