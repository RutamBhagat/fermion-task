import type { Worker } from "mediasoup/types";
import { workerSettings } from "@/config/mediasoup";
import { createWorker } from "mediasoup";

let worker: Worker;

export async function initMediasoup() {
  worker = await createWorker(workerSettings);
  console.log("Mediasoup worker and legacy router initialized");
}

export function getWorker(): Worker {
  if (!worker) {
    throw new Error("Mediasoup worker not initialized");
  }
  return worker;
}
