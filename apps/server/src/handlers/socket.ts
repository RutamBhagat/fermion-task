import type { Server, Socket } from "socket.io";

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`A client connected in the new handler: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`A client disconnected in the new handler: ${socket.id}`);
    });
  });
}
