import { getHLSProcesses, stopHLSStream } from "./hls.js";

import type { RoomState } from "@/types/index.js";
import { getWorker } from "./mediasoup.js";
import { mediaCodecs } from "../config/mediasoup.js";

const rooms = new Map<string, RoomState>();

export async function createRoom(roomId: string): Promise<RoomState> {
  const existingRoom = rooms.get(roomId);
  if (existingRoom) {
    return existingRoom;
  }

  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs });

  const roomState: RoomState = {
    router,
    participants: new Set(),
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  };

  rooms.set(roomId, roomState);
  console.log(`Room created: ${roomId}`);
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
    producerList.forEach((producer) => producer.close());
    roomState.producers.delete(socketId);
  }

  for (const [consumerId, consumer] of roomState.consumers) {
    if (consumer.appData?.socketId === socketId) {
      consumer.close();
      roomState.consumers.delete(consumerId);
    }
  }

  console.log(`Socket ${socketId} left room ${roomId}`);

  if (roomState.participants.size === 0) {
    for (const [streamId] of getHLSProcesses()) {
      if (streamId.includes(`room_${roomId}_`)) {
        console.log(`Stopping HLS stream ${streamId} for empty room ${roomId}`);
        stopHLSStream(streamId);
      }
    }

    roomState.router.close();
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  }
}

export function getAllRooms(): Map<string, RoomState> {
  return rooms;
}
