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
const transports = new Map(); // socket.id -> {producer?: Transport, consumer?: Transport}
const producers = new Map(); // socket.id -> Producer[]
const consumers = new Map(); // consumerId -> Consumer

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

	socket.on("createWebRtcTransport", async (data, callback) => {
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

			// Store transport by type (producer or consumer)
			if (!transports.has(socket.id)) {
				transports.set(socket.id, {});
			}
			const transportType = data?.type || 'producer';
			transports.get(socket.id)[transportType] = transport;

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
			const transportsForSocket = transports.get(socket.id);
			if (!transportsForSocket) {
				throw new Error('No transports found for socket');
			}
			
			// Find the transport by ID
			const transport = Object.values(transportsForSocket).find(
				t => t && t.id === data.transportId
			);
			
			if (!transport) {
				throw new Error('Transport not found');
			}
			
			// Check if already connected
			if (transport.dtlsState !== 'new') {
				console.log('Transport already connected, skipping');
				callback();
				return;
			}
			
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
			const transportsForSocket = transports.get(socket.id);
			const transport = transportsForSocket?.producer;
			
			if (!transport) {
				throw new Error('Producer transport not found');
			}
			
			const producer = await transport.produce({
				kind: data.kind,
				rtpParameters: data.rtpParameters,
			});

			// Initialize producers array for this socket if it doesn't exist
			if (!producers.has(socket.id)) {
				producers.set(socket.id, []);
			}
			producers.get(socket.id).push(producer);

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
			const transportsForSocket = transports.get(socket.id);
			const transport = transportsForSocket?.consumer;
			
			if (!transport) {
				callback({ error: "Consumer transport not found" });
				return;
			}
			
			const producerList = producers.get(data.producerSocketId);

			if (!producerList || producerList.length === 0) {
				callback({ error: "No producers found for socket" });
				return;
			}

			// Find the first available producer (we'll improve this logic later)
			const producer = producerList.find(p => 
				router.canConsume({
					producerId: p.id,
					rtpCapabilities: data.rtpCapabilities,
				})
			);

			if (!producer) {
				callback({ error: "No consumable producer found" });
				return;
			}

			const consumer = await transport.consume({
				producerId: producer.id,
				rtpCapabilities: data.rtpCapabilities,
				paused: true,
				appData: { socketId: socket.id },
			});

			// Store consumer by its ID for easier lookup
			consumers.set(consumer.id, consumer);

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
			const consumer = consumers.get(data.consumerId);
			
			if (!consumer) {
				throw new Error(`Consumer not found: ${data.consumerId}`);
			}
			
			if (consumer.paused) {
				await consumer.resume();
			}
			
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
		const transportsForSocket = transports.get(socket.id);
		const producerList = producers.get(socket.id);

		if (transportsForSocket) {
			if (transportsForSocket.producer) transportsForSocket.producer.close();
			if (transportsForSocket.consumer) transportsForSocket.consumer.close();
		}
		
		if (producerList) {
			producerList.forEach(producer => producer.close());
		}

		// Clean up consumers for this socket
		for (const [consumerId, consumer] of consumers) {
			if (consumer.appData?.socketId === socket.id) {
				consumer.close();
				consumers.delete(consumerId);
			}
		}

		transports.delete(socket.id);
		producers.delete(socket.id);

		// Notify other clients
		socket.broadcast.emit("producerClosed", { socketId: socket.id });
	});

	// Send existing producers to new client
	socket.on("getProducers", (callback) => {
		const existingProducers = [];
		producers.forEach((producerList, socketId) => {
			if (socketId !== socket.id) {
				producerList.forEach(producer => {
					existingProducers.push({
						producerId: producer.id,
						socketId: socketId,
					});
				});
			}
		});
		callback(existingProducers);
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
