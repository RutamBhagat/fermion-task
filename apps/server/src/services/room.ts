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
