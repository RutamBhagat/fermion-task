import type { RoomState } from "@/types/index.js";
import { mediaCodecs } from "@/config/mediasoup";
import { getWorker } from "@/services/mediasoup";

const rooms = new Map<string, RoomState>();

export async function createRoom(roomId: string): Promise<RoomState> {
  const existingRoom = rooms.get(roomId);
  if (existingRoom) {
    console.log(`Room ${roomId} already exists. Returning existing room.`);
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
  console.log(`Socket ${socketId} left room ${roomId}`);

  if (roomState.participants.size === 0) {
    roomState.router.close();
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted because it is empty.`);
  }
}
