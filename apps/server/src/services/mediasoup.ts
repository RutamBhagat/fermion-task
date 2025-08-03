import type { Worker, Router } from "mediasoup/types";
import { mediaCodecs, workerSettings } from "@/config/mediasoup";
import { createWorker } from "mediasoup";

let worker: Worker;
let legacyRouter: Router;

export async function initMediasoup() {
  worker = await createWorker(workerSettings);

  legacyRouter = await worker.createRouter({
    mediaCodecs,
  });

  console.log("Mediasoup worker and legacy router initialized");
}

export function getWorker(): Worker {
  if (!worker) {
    throw new Error("Mediasoup worker not initialized");
  }
  return worker;
}

export function getLegacyRouter(): Router {
  if (!legacyRouter) {
    throw new Error("Legacy router not initialized");
  }
  return legacyRouter;
}
