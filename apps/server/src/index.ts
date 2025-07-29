import "dotenv/config";
import { createServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import * as mediasoup from "mediasoup";
import { Server } from "socket.io";

const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: process.env.CORS_ORIGIN || "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

app.get("/", (c) => {
	return c.text("Mediasoup SFU Server OK");
});

// Create HTTP server for both Hono and Socket.IO
const server = createServer();
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

// Mediasoup Worker and Router
let worker: mediasoup.types.Worker;
let router: mediasoup.types.Router;
const transports = new Map();
const producers = new Map();
const consumers = new Map();

// Initialize Mediasoup
async function initMediasoup() {
	worker = await mediasoup.createWorker({
		logLevel: "debug",
		rtcMinPort: 10000,
		rtcMaxPort: 10100,
	});

	router = await worker.createRouter({
		mediaCodecs: [
			{
				kind: "audio",
				mimeType: "audio/opus",
				clockRate: 48000,
				channels: 2,
			},
			{
				kind: "video",
				mimeType: "video/VP8",
				clockRate: 90000,
				parameters: {
					"x-google-start-bitrate": 1000,
				},
			},
		],
	});

	console.log("Mediasoup worker and router initialized");
}

// Socket.IO connection handling
io.on("connection", (socket) => {
	console.log(`Client connected: ${socket.id}`);

	socket.on("getRtpCapabilities", (callback) => {
		const rtpCapabilities = router.rtpCapabilities;
		callback({ rtpCapabilities });
	});

	socket.on("createWebRtcTransport", async (_data, callback) => {
		try {
			const transport = await router.createWebRtcTransport({
				listenIps: [
					{
						ip: "127.0.0.1",
						announcedIp: undefined,
					},
				],
				enableUdp: true,
				enableTcp: true,
				preferUdp: true,
			});

			transports.set(socket.id, transport);

			callback({
				params: {
					id: transport.id,
					iceParameters: transport.iceParameters,
					iceCandidates: transport.iceCandidates,
					dtlsParameters: transport.dtlsParameters,
				},
			});
		} catch (error) {
			console.error("Error creating WebRTC transport:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	socket.on("connectTransport", async (data, callback) => {
		try {
			const transport = transports.get(socket.id);
			await transport.connect({ dtlsParameters: data.dtlsParameters });
			callback();
		} catch (error) {
			console.error("Error connecting transport:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	socket.on("produce", async (data, callback) => {
		try {
			const transport = transports.get(socket.id);
			const producer = await transport.produce({
				kind: data.kind,
				rtpParameters: data.rtpParameters,
			});

			producers.set(socket.id, producer);

			// Notify other clients about new producer
			socket.broadcast.emit("newProducer", {
				producerId: producer.id,
				socketId: socket.id,
			});

			callback({ id: producer.id });
		} catch (error) {
			console.error("Error producing:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	socket.on("consume", async (data, callback) => {
		try {
			const transport = transports.get(socket.id);
			const producer = producers.get(data.producerSocketId);

			if (!producer) {
				callback({ error: "Producer not found" });
				return;
			}

			const consumer = await transport.consume({
				producerId: producer.id,
				rtpCapabilities: data.rtpCapabilities,
				paused: true,
			});

			consumers.set(`${socket.id}-${producer.id}`, consumer);

			callback({
				params: {
					id: consumer.id,
					producerId: producer.id,
					kind: consumer.kind,
					rtpParameters: consumer.rtpParameters,
				},
			});
		} catch (error) {
			console.error("Error consuming:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	socket.on("resume", async (data, callback) => {
		try {
			const consumer = consumers.get(`${socket.id}-${data.producerId}`);
			await consumer.resume();
			callback();
		} catch (error) {
			console.error("Error resuming consumer:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	socket.on("disconnect", () => {
		console.log(`Client disconnected: ${socket.id}`);
		// Clean up resources
		const transport = transports.get(socket.id);
		const producer = producers.get(socket.id);

		if (transport) transport.close();
		if (producer) producer.close();

		transports.delete(socket.id);
		producers.delete(socket.id);

		// Notify other clients
		socket.broadcast.emit("producerClosed", { socketId: socket.id });
	});
});

// Start server
const PORT = process.env.PORT || 3000;

initMediasoup()
	.then(() => {
		server.listen(PORT, () => {
			console.log(`Mediasoup SFU Server running on port ${PORT}`);
		});
	})
	.catch(console.error);
