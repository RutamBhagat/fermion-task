import type { Worker } from "mediasoup/types";
import { createWorker } from "mediasoup";
import { workerSettings } from "@/config/mediasoup";

interface WorkerInfo {
  worker: Worker;
  roomCount: number;
  cpuUsage: number;
  lastUsed: number;
}

const workers: WorkerInfo[] = [];
const WORKER_COUNT = parseInt(process.env.MEDIASOUP_WORKER_COUNT || "4");

export async function initMediasoup() {
  console.log(`Initializing ${WORKER_COUNT} Mediasoup workers...`);
  
  for (let i = 0; i < WORKER_COUNT; i++) {
    const basePort = (workerSettings.rtcMinPort || 10000) + (i * 1000);
    const worker = await createWorker({
      ...workerSettings,
      rtcMinPort: basePort,
      rtcMaxPort: basePort + 999,
    });

    const workerInfo: WorkerInfo = {
      worker,
      roomCount: 0,
      cpuUsage: 0,
      lastUsed: Date.now(),
    };

    worker.observer.on('newrouter', () => {
      workerInfo.roomCount++;
    });

    worker.observer.on('close', () => {
      console.log(`Worker ${i} closed`);
    });

    setInterval(async () => {
      try {
        const stats = await worker.getResourceUsage();
        workerInfo.cpuUsage = stats.ru_utime + stats.ru_stime;
      } catch (error) {
        console.warn(`Failed to get worker ${i} resource usage:`, error);
      }
    }, 5000);

    workers.push(workerInfo);
    console.log(`Mediasoup worker ${i + 1}/${WORKER_COUNT} initialized (ports: ${basePort}-${basePort + 999})`);
  }

  console.log("All Mediasoup workers initialized successfully");
}

export function getWorker(): Worker {
  if (workers.length === 0) {
    throw new Error("Mediasoup workers not initialized");
  }
  return getLeastLoadedWorker().worker;
}

export function getLeastLoadedWorker(): WorkerInfo {
  if (workers.length === 0) {
    throw new Error("Mediasoup workers not initialized");
  }

  const sortedWorkers = [...workers].sort((a, b) => {
    if (a.roomCount !== b.roomCount) {
      return a.roomCount - b.roomCount;
    }
    
    if (Math.abs(a.cpuUsage - b.cpuUsage) > 0.1) {
      return a.cpuUsage - b.cpuUsage;
    }
    
    return a.lastUsed - b.lastUsed;
  });

  const selectedWorker = sortedWorkers[0];
  selectedWorker.lastUsed = Date.now();
  
  return selectedWorker;
}

export function getWorkerStats() {
  return workers.map((workerInfo, index) => ({
    workerId: index,
    roomCount: workerInfo.roomCount,
    cpuUsage: workerInfo.cpuUsage,
    pid: workerInfo.worker.pid,
    closed: workerInfo.worker.closed,
  }));
}

export function getWorkerCount(): number {
  return workers.length;
}
