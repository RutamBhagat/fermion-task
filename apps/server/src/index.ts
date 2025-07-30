import "dotenv/config";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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

// Serve HLS files statically
app.get("/hls/*", async (c) => {
	const path = c.req.path.replace("/hls", "");
	const fs = await import("node:fs/promises");
	try {
		const content = await fs.readFile(`./hls${path}`);
		const ext = path.split(".").pop();
		const contentType =
			ext === "m3u8"
				? "application/vnd.apple.mpegurl"
				: ext === "ts"
					? "video/mp2t"
					: "application/octet-stream";
		return new Response(content, {
			headers: { "Content-Type": contentType },
		});
	} catch (_error) {
		return c.text("File not found", 404);
	}
});

// Watch page endpoint
app.get("/watch/:streamId", (c) => {
	const streamId = c.req.param("streamId");
	const hlsUrl = `/hls/${streamId}/stream.m3u8`;

	return c.html(`
	<!DOCTYPE html>
	<html>
	<head>
		<title>Watch Stream - ${streamId}</title>
		<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
		<style>
			body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
			video { width: 100%; max-width: 800px; height: auto; }
		</style>
	</head>
	<body>
		<h1>Watching Stream: ${streamId}</h1>
		<video id="video" controls autoplay muted></video>
		<script>
			const video = document.getElementById('video');
			const videoSrc = '${hlsUrl}';
			
			if (Hls.isSupported()) {
				const hls = new Hls();
				hls.loadSource(videoSrc);
				hls.attachMedia(video);
			} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
				video.src = videoSrc;
			}
		</script>
	</body>
	</html>
	`);
});

// Create HTTP server for both Hono and Socket.IO
const server = createServer(async (req, res) => {
	if (req.url?.startsWith("/socket.io")) {
		return; // Let Socket.IO handle this
	}

	// Convert Node.js headers to standard Headers format
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : value);
		}
	}

	const request = new Request(`http://localhost${req.url}`, {
		method: req.method,
		headers,
	});

	const response = await app.fetch(request);
	res.statusCode = response.status;

	response.headers.forEach((value, key) => {
		res.setHeader(key, value);
	});

	if (response.body) {
		const reader = response.body.getReader();
		const pump = async () => {
			const { done, value } = await reader.read();
			if (done) return;
			res.write(value);
			await pump();
		};
		await pump();
	}
	res.end();
});

const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

// Mediasoup Worker and Router
let worker: mediasoup.types.Worker;
let router: mediasoup.types.Router;
interface SocketTransports {
	producer?: mediasoup.types.WebRtcTransport;
	consumer?: mediasoup.types.WebRtcTransport;
}

interface PlainTransports {
	audioTransport?: mediasoup.types.PlainTransport;
	videoTransport?: mediasoup.types.PlainTransport;
}

const transports = new Map<string, SocketTransports>(); // socket.id -> {producer?: Transport, consumer?: Transport}
const producers = new Map<string, mediasoup.types.Producer[]>(); // socket.id -> Producer[]
const consumers = new Map<string, mediasoup.types.Consumer>(); // consumerId -> Consumer

// HLS Streaming
const plainTransports = new Map<string, PlainTransports>(); // streamId -> PlainTransport
const hlsProcesses = new Map<string, ChildProcess>(); // streamId -> FFmpeg process
const HLS_DIR = "./hls";

// Initialize Mediasoup
// Create HLS directory
if (!existsSync(HLS_DIR)) {
	mkdirSync(HLS_DIR, { recursive: true });
}

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

// Function to find available ports
function getAvailablePorts(startPort: number, count: number): number[] {
	const ports: number[] = [];
	let currentPort = startPort;

	for (let i = 0; i < count; i++) {
		// Simple port allocation - in production you'd want to check if ports are actually free
		ports.push(currentPort);
		currentPort += 2; // Skip even numbers for RTP, odd for RTCP
	}

	return ports;
}

// Function to generate SDP file for FFmpeg
function generateSDP(
	audioConsumer?: mediasoup.types.Consumer,
	videoConsumer?: mediasoup.types.Consumer,
	audioPort?: number,
	videoPort?: number,
): string {
	let sdp = "v=0\r\n";
	sdp += "o=- 0 0 IN IP4 127.0.0.1\r\n";
	sdp += "s=FFmpeg\r\n";
	sdp += "c=IN IP4 127.0.0.1\r\n";
	sdp += "t=0 0\r\n";

	// Add video media description
	if (videoConsumer && videoPort) {
		const videoCodec = videoConsumer.rtpParameters.codecs[0];
		const videoPayloadType = videoCodec.payloadType;

		sdp += `m=video ${videoPort} RTP/AVP ${videoPayloadType}\r\n`;
		sdp += `a=rtpmap:${videoPayloadType} ${videoCodec.mimeType.split("/")[1]}/${videoCodec.clockRate}\r\n`;
		sdp += "a=sendonly\r\n";

		// Add video encodings SSRC
		if (videoConsumer.rtpParameters.encodings?.[0]?.ssrc) {
			sdp += `a=ssrc:${videoConsumer.rtpParameters.encodings[0].ssrc} cname:mediasoup\r\n`;
		}
	}

	// Add audio media description
	if (audioConsumer && audioPort) {
		const audioCodec = audioConsumer.rtpParameters.codecs[0];
		const audioPayloadType = audioCodec.payloadType;

		sdp += `m=audio ${audioPort} RTP/AVP ${audioPayloadType}\r\n`;
		sdp += `a=rtpmap:${audioPayloadType} ${audioCodec.mimeType.split("/")[1]}/${audioCodec.clockRate}`;

		// Add channels if present
		if (audioCodec.channels && audioCodec.channels > 1) {
			sdp += `/${audioCodec.channels}`;
		}
		sdp += "\r\n";
		sdp += "a=sendonly\r\n";

		// Add audio encodings SSRC
		if (audioConsumer.rtpParameters.encodings?.[0]?.ssrc) {
			sdp += `a=ssrc:${audioConsumer.rtpParameters.encodings[0].ssrc} cname:mediasoup\r\n`;
		}
	}

	return sdp;
}

// HLS Streaming Functions
async function createHLSStream(
	streamId: string,
	audioProducer?: mediasoup.types.Producer,
	videoProducer?: mediasoup.types.Producer,
) {
	if (!audioProducer && !videoProducer) {
		throw new Error("At least one producer (audio or video) is required");
	}

	// Create stream directory
	const streamDir = `${HLS_DIR}/${streamId}`;
	if (!existsSync(streamDir)) {
		mkdirSync(streamDir, { recursive: true });
	}

	// Allocate ports for FFmpeg to listen on
	const availablePorts = getAvailablePorts(20000, 4); // Start from 20000 to avoid conflicts
	let audioRtpPort: number | undefined;
	let audioRtcpPort: number | undefined;
	let videoRtpPort: number | undefined;
	let videoRtcpPort: number | undefined;
	let portIndex = 0;

	if (audioProducer) {
		audioRtpPort = availablePorts[portIndex++];
		audioRtcpPort = availablePorts[portIndex++];
	}
	if (videoProducer) {
		videoRtpPort = availablePorts[portIndex++];
		videoRtcpPort = availablePorts[portIndex++];
	}

	// We'll build FFmpeg command after creating SDP file

	// Now create PlainTransports and connect them to FFmpeg
	let audioTransport: mediasoup.types.PlainTransport | undefined;
	let videoTransport: mediasoup.types.PlainTransport | undefined;
	let audioConsumer: mediasoup.types.Consumer | undefined;
	let videoConsumer: mediasoup.types.Consumer | undefined;

	if (audioProducer && audioRtpPort && audioRtcpPort) {
		audioTransport = await router.createPlainTransport({
			listenIp: { ip: "127.0.0.1" },
			rtcpMux: false,
			comedia: false, // We will connect TO FFmpeg
		});

		// Create consumer for audio (paused initially)
		audioConsumer = await audioTransport.consume({
			producerId: audioProducer.id,
			rtpCapabilities: router.rtpCapabilities,
			paused: true, // Start paused to avoid timing issues
		});

		// Connect transport to FFmpeg's listening ports
		await audioTransport.connect({
			ip: "127.0.0.1",
			port: audioRtpPort,
			rtcpPort: audioRtcpPort,
		});

		console.log(
			`Audio PlainTransport connected to FFmpeg on ports ${audioRtpPort}/${audioRtcpPort}`,
		);
		console.log(
			"Audio Consumer RTP Parameters:",
			JSON.stringify(audioConsumer.rtpParameters, null, 2),
		);
	}

	if (videoProducer && videoRtpPort && videoRtcpPort) {
		videoTransport = await router.createPlainTransport({
			listenIp: { ip: "127.0.0.1" },
			rtcpMux: false,
			comedia: false, // We will connect TO FFmpeg
		});

		// Create consumer for video (paused initially)
		videoConsumer = await videoTransport.consume({
			producerId: videoProducer.id,
			rtpCapabilities: router.rtpCapabilities,
			paused: true, // Start paused to avoid timing issues
		});

		// Connect transport to FFmpeg's listening ports
		await videoTransport.connect({
			ip: "127.0.0.1",
			port: videoRtpPort,
			rtcpPort: videoRtcpPort,
		});

		console.log(
			`Video PlainTransport connected to FFmpeg on ports ${videoRtpPort}/${videoRtcpPort}`,
		);
		console.log(
			"Video Consumer RTP Parameters:",
			JSON.stringify(videoConsumer.rtpParameters, null, 2),
		);
	}

	// Create SDP file for FFmpeg
	const sdpContent = generateSDP(
		audioConsumer,
		videoConsumer,
		audioRtpPort,
		videoRtpPort,
	);
	const sdpPath = `${streamDir}/stream.sdp`;
	const fs = await import("node:fs/promises");
	await fs.writeFile(sdpPath, sdpContent);
	console.log(`SDP file created at ${sdpPath}`);
	console.log(`SDP Content:\n${sdpContent}`);

	// Now build and start FFmpeg with SDP file input
	const ffmpegArgs = [
		"-y",
		"-loglevel",
		"debug",
		"-protocol_whitelist",
		"file,rtp,udp",
		"-f",
		"sdp",
		"-i",
		sdpPath,
	];

	// Add encoding options with better sync handling
	if (videoProducer && audioProducer) {
		// Both audio and video - ensure sync
		ffmpegArgs.push(
			"-c:v", "libx264",
			"-preset", "ultrafast", 
			"-tune", "zerolatency",
			"-profile:v", "baseline",
			"-level", "3.1",
			"-pix_fmt", "yuv420p",
			"-r", "30", // Force 30fps
			"-c:a", "aac", 
			"-b:a", "128k",
			"-ar", "48000",
			"-ac", "2",
			"-async", "1", // Audio sync
			"-vsync", "cfr" // Constant frame rate
		);
	} else if (videoProducer) {
		// Video only
		ffmpegArgs.push(
			"-c:v", "libx264",
			"-preset", "ultrafast", 
			"-tune", "zerolatency",
			"-profile:v", "baseline",
			"-level", "3.1",
			"-pix_fmt", "yuv420p",
			"-r", "30"
		);
	} else if (audioProducer) {
		// Audio only
		ffmpegArgs.push(
			"-c:a", "aac", 
			"-b:a", "128k",
			"-ar", "48000",
			"-ac", "2"
		);
	}

	// Add HLS options
	ffmpegArgs.push(
		"-f",
		"hls",
		"-hls_time",
		"2",
		"-hls_list_size",
		"5",
		"-hls_flags",
		"delete_segments+append_list",
		"-hls_allow_cache",
		"0",
		"-start_number",
		"0",
		`${streamDir}/stream.m3u8`,
	);

	console.log(`Starting FFmpeg with SDP input: ${ffmpegArgs.join(" ")}`);

	// Start FFmpeg process with SDP file
	const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, {
		stdio: ["ignore", "pipe", "pipe"],
	});

	ffmpegProcess.stdout?.on("data", (data: Buffer) => {
		console.log(`FFmpeg stdout [${streamId}]: ${data}`);
	});

	ffmpegProcess.stderr?.on("data", (data: Buffer) => {
		console.log(`FFmpeg stderr [${streamId}]: ${data}`);
	});

	ffmpegProcess.on("error", (error: Error) => {
		console.error(`FFmpeg process error [${streamId}]:`, error);
		hlsProcesses.delete(streamId);
	});

	ffmpegProcess.on("close", (code: number | null) => {
		console.log(
			`FFmpeg process for stream ${streamId} exited with code ${code}`,
		);
		hlsProcesses.delete(streamId);
	});

	// Give FFmpeg a moment to initialize, then resume consumers
	setTimeout(async () => {
		try {
			if (audioConsumer && audioConsumer.paused) {
				await audioConsumer.resume();
				console.log(`Audio consumer resumed for stream ${streamId}`);
			}
			if (videoConsumer && videoConsumer.paused) {
				await videoConsumer.resume();
				console.log(`Video consumer resumed for stream ${streamId}`);
			}
		} catch (error) {
			console.error(`Error resuming consumers for stream ${streamId}:`, error);
		}
	}, 2000); // Wait 2 seconds for FFmpeg to be ready

	// Store references
	plainTransports.set(streamId, { audioTransport, videoTransport });
	hlsProcesses.set(streamId, ffmpegProcess);

	console.log(`HLS stream created for ${streamId}`);
	return { streamId, hlsUrl: `/hls/${streamId}/stream.m3u8` };
}

function stopHLSStream(streamId: string) {
	// Stop FFmpeg process
	const process = hlsProcesses.get(streamId);
	if (process) {
		process.kill("SIGTERM");
		hlsProcesses.delete(streamId);
	}

	// Close transports
	const transports = plainTransports.get(streamId);
	if (transports) {
		if (transports.audioTransport) transports.audioTransport.close();
		if (transports.videoTransport) transports.videoTransport.close();
		plainTransports.delete(streamId);
	}

	console.log(`HLS stream stopped for ${streamId}`);
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
			const transportType = data?.type || "producer";
			const socketTransports = transports.get(socket.id);
			if (socketTransports) {
				if (transportType === "producer") {
					socketTransports.producer = transport;
				} else {
					socketTransports.consumer = transport;
				}
			}

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
				throw new Error("No transports found for socket");
			}

			// Find the transport by ID
			const transport = Object.values(transportsForSocket).find(
				(t) => t && t.id === data.transportId,
			);

			if (!transport) {
				throw new Error("Transport not found");
			}

			// Check if already connected
			if (transport.dtlsState !== "new") {
				console.log("Transport already connected, skipping");
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
				throw new Error("Producer transport not found");
			}

			const producer = await transport.produce({
				kind: data.kind,
				rtpParameters: data.rtpParameters,
			});

			// Initialize producers array for this socket if it doesn't exist
			if (!producers.has(socket.id)) {
				producers.set(socket.id, []);
			}
			const producerList = producers.get(socket.id);
			if (producerList) {
				producerList.push(producer);
			}

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

			// Find all consumable producers (both audio and video)
			const consumableProducers = producerList.filter(
				(p: mediasoup.types.Producer) =>
					router.canConsume({
						producerId: p.id,
						rtpCapabilities: data.rtpCapabilities,
					}),
			);

			if (consumableProducers.length === 0) {
				callback({ error: "No consumable producers found" });
				return;
			}

			// Create consumers for all available producers (audio + video)
			const consumerParams = [];

			for (const producer of consumableProducers) {
				const consumer = await transport.consume({
					producerId: producer.id,
					rtpCapabilities: data.rtpCapabilities,
					paused: true,
					appData: {
						socketId: socket.id,
						producerSocketId: data.producerSocketId,
					},
				});

				// Store consumer by its ID for easier lookup
				consumers.set(consumer.id, consumer);

				consumerParams.push({
					id: consumer.id,
					producerId: producer.id,
					kind: consumer.kind,
					rtpParameters: consumer.rtpParameters,
				});

				console.log(
					`Created consumer for ${consumer.kind} track:`,
					consumer.id,
				);
			}

			callback({ params: consumerParams });
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
			producerList.forEach((producer) => producer.close());
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

		// Stop any HLS streams for this socket
		for (const [streamId] of hlsProcesses) {
			if (streamId.includes(socket.id)) {
				stopHLSStream(streamId);
			}
		}

		// Notify other clients
		socket.broadcast.emit("producerClosed", { socketId: socket.id });
	});

	// Send existing producers to new client
	socket.on("getProducers", (callback) => {
		const existingProducers: Array<{ producerId: string; socketId: string }> =
			[];
		producers.forEach((producerList, socketId) => {
			if (socketId !== socket.id) {
				producerList.forEach((producer: mediasoup.types.Producer) => {
					existingProducers.push({
						producerId: producer.id,
						socketId: socketId,
					});
				});
			}
		});
		callback(existingProducers);
	});

	// Start HLS streaming
	socket.on("startHLS", async (data, callback) => {
		try {
			const { socketId } = data;
			const streamId = `stream_${socketId}_${Date.now()}`;

			const producerList = producers.get(socketId);
			if (!producerList || producerList.length === 0) {
				throw new Error("No producers found for HLS streaming");
			}

			// Find audio and video producers
			const audioProducer = producerList.find(
				(p: mediasoup.types.Producer) => p.kind === "audio",
			);
			const videoProducer = producerList.find(
				(p: mediasoup.types.Producer) => p.kind === "video",
			);

			const result = await createHLSStream(
				streamId,
				audioProducer,
				videoProducer,
			);
			callback(result);
		} catch (error) {
			console.error("Error starting HLS stream:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// Stop HLS streaming
	socket.on("stopHLS", (data, callback) => {
		try {
			const { streamId } = data;
			stopHLSStream(streamId);
			callback({ success: true });
		} catch (error) {
			console.error("Error stopping HLS stream:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
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
