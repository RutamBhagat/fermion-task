import * as mediasoup from "mediasoup";
import { mediaCodecs, workerSettings } from "../config/mediasoup.js";

let worker: mediasoup.types.Worker;
let legacyRouter: mediasoup.types.Router;

export async function initMediasoup() {
  worker = await mediasoup.createWorker(workerSettings);

  legacyRouter = await worker.createRouter({
    mediaCodecs,
  });

  console.log("Mediasoup worker and legacy router initialized");
}

export function getWorker(): mediasoup.types.Worker {
  if (!worker) {
    throw new Error("Mediasoup worker not initialized");
  }
  return worker;
}

export function getLegacyRouter(): mediasoup.types.Router {
  if (!legacyRouter) {
    throw new Error("Legacy router not initialized");
  }
  return legacyRouter;
}
