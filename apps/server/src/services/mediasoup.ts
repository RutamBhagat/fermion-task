import type { Worker } from "mediasoup/types";
import { createWorker } from "mediasoup";
import { workerSettings } from "@/config/mediasoup";

let worker: Worker;

export async function initMediasoup() {
  worker = await createWorker(workerSettings);
  console.log("Mediasoup worker initialized");
}

export function getWorker(): Worker {
  if (!worker) {
    throw new Error("Mediasoup worker not initialized");
  }
  return worker;
}
