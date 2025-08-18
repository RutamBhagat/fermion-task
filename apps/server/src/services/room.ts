import { getHLSProcesses, stopHLSStream } from "./hls.js";
import { getLeastLoadedWorker, getWorkerStats } from "./mediasoup.js";

import type { RoomState } from "@/types/index.js";
import { mediaCodecs } from "../config/mediasoup.js";

const rooms = new Map<string, RoomState>();
const roomToWorkerMap = new Map<string, number>();

export async function createRoom(roomId: string): Promise<RoomState> {
  const existingRoom = rooms.get(roomId);
  if (existingRoom) {
    return existingRoom;
  }

  const workerInfo = getLeastLoadedWorker();
  const router = await workerInfo.worker.createRouter({ 
    mediaCodecs,
    appData: { roomId }
  });

  const workerIndex = getWorkerStats().findIndex(stat => stat.pid === workerInfo.worker.pid);
  roomToWorkerMap.set(roomId, workerIndex);

  const activeSpeakerObserver = await router.createActiveSpeakerObserver({
    interval: 300,
  });

  const roomState: RoomState = {
    router,
    participants: new Set(),
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    activeSpeakerObserver,
    dominantSpeaker: undefined,
  };

  rooms.set(roomId, roomState);
  console.log(`Room created: ${roomId} on worker ${workerIndex} (${workerInfo.roomCount + 1} rooms)`);
  return roomState;
}

export function getRoomState(roomId: string): RoomState | null {
  return rooms.get(roomId) || null;
}

export function joinRoom(roomId: string, socketId: string): RoomState {
  const roomState = rooms.get(roomId);
  if (!roomState) {
    throw new Error(`Room ${roomId} does not exist`);
  }

  roomState.participants.add(socketId);
  console.log(`Socket ${socketId} joined room ${roomId}`);
  return roomState;
}

export function leaveRoom(roomId: string, socketId: string): void {
  const roomState = rooms.get(roomId);
  if (!roomState) return;

  roomState.participants.delete(socketId);

  const transportsForSocket = roomState.transports.get(socketId);
  const producerList = roomState.producers.get(socketId);

  if (transportsForSocket) {
    if (transportsForSocket.producer) transportsForSocket.producer.close();
    if (transportsForSocket.consumer) transportsForSocket.consumer.close();
    roomState.transports.delete(socketId);
  }

  if (producerList) {
    // Remove audio producers from active speaker observer
    if (roomState.activeSpeakerObserver) {
      producerList.forEach((producer) => {
        if (producer.kind === 'audio') {
          try {
            roomState.activeSpeakerObserver!.removeProducer({ producerId: producer.id });
          } catch (error) {
            console.warn(`Failed to remove producer ${producer.id} from active speaker observer:`, error);
          }
        }
      });
    }
    
    producerList.forEach((producer) => producer.close());
    roomState.producers.delete(socketId);
  }

  for (const [consumerId, consumer] of roomState.consumers) {
    if (consumer.appData?.socketId === socketId) {
      consumer.close();
      roomState.consumers.delete(consumerId);
    }
  }

  // Clear dominant speaker if it was the leaving participant
  if (roomState.dominantSpeaker === socketId) {
    roomState.dominantSpeaker = undefined;
  }

  console.log(`Socket ${socketId} left room ${roomId}`);

  if (roomState.participants.size === 0) {
    for (const [streamId] of getHLSProcesses()) {
      if (streamId.includes(`room_${roomId}_`)) {
        console.log(`Stopping HLS stream ${streamId} for empty room ${roomId}`);
        stopHLSStream(streamId);
      }
    }

    const workerIndex = roomToWorkerMap.get(roomId);
    if (roomState.activeSpeakerObserver) {
      roomState.activeSpeakerObserver.close();
    }
    roomState.router.close();
    rooms.delete(roomId);
    roomToWorkerMap.delete(roomId);
    console.log(`Room ${roomId} deleted (empty) from worker ${workerIndex}`);
  }
}

export function getAllRooms(): Map<string, RoomState> {
  return rooms;
}

export function getRoomDistribution() {
  const workerStats = getWorkerStats();
  const distribution = new Map<number, string[]>();
  
  workerStats.forEach((_, index) => {
    distribution.set(index, []);
  });
  
  for (const [roomId, workerIndex] of roomToWorkerMap) {
    const roomList = distribution.get(workerIndex) || [];
    roomList.push(roomId);
    distribution.set(workerIndex, roomList);
  }
  
  return {
    workers: workerStats,
    distribution: Object.fromEntries(distribution),
    totalRooms: rooms.size,
  };
}

export function getRoomWorkerInfo(roomId: string) {
  const workerIndex = roomToWorkerMap.get(roomId);
  if (workerIndex === undefined) {
    return null;
  }
  
  const workerStats = getWorkerStats();
  return {
    roomId,
    workerIndex,
    workerStats: workerStats[workerIndex],
  };
}
