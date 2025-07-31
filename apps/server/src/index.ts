import "dotenv/config";
import { type ChildProcess, spawn } from "node:child_process";
import fs, { existsSync, mkdirSync } from "node:fs";
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
			.loading { 
				background: #f0f0f0; 
				padding: 20px; 
				border-radius: 8px; 
				text-align: center; 
				margin: 20px 0;
			}
			.status { margin: 10px 0; color: #666; }
			.error { color: #d32f2f; }
			.success { color: #388e3c; }
		</style>
	</head>
	<body>
		<h1>Watching Stream: ${streamId}</h1>
		<div id="status" class="loading">
			<div>🔄 Initializing stream...</div>
			<div class="status">Waiting for HLS playlist to be ready</div>
		</div>
		<video id="video" controls muted style="display: none;"></video>
		<script>
			const video = document.getElementById('video');
			const status = document.getElementById('status');
			const videoSrc = '${hlsUrl}';
			
			let retryCount = 0;
			const maxRetries = 15; // 30 seconds with 2s intervals
			
			function updateStatus(message, className = '') {
				status.innerHTML = \`<div class="\${className}">\${message}</div>\`;
			}
			
			function initializeHLS() {
				if (Hls.isSupported()) {
					const hls = new Hls({
						// Live streaming configuration optimized for 1-second segments
						lowLatencyMode: false,
						liveSyncDurationCount: 3,        // Buffer 3 segments (3 seconds) from live edge
						liveMaxLatencyDurationCount: 6,  // Max 6 seconds behind live edge
						maxLiveSyncPlaybackRate: 2.0,    // Allow 2x speed
						liveSyncOnStallIncrease: 1,      // Conservative stall recovery
						
						// Buffer management for live streaming
						maxBufferLength: 15,             // Sufficient buffer for live streams
						maxBufferHole: 0.5,
						nudgeMaxRetry: 5,
						
						// Startup optimization
						initialLiveManifestSize: 3,      // Wait for 3 segments before starting
						startOnSegmentBoundary: true,    // Cleaner live starts
						
						// Error recovery
						appendErrorMaxRetry: 5,
						fragLoadPolicy: {
							default: {
								maxTimeToFirstByteMs: 8000,
								maxLoadTimeMs: 20000,
								timeoutRetry: {
									maxNumRetry: 4,
									retryDelayMs: 0,
									maxRetryDelayMs: 0,
								},
								errorRetry: {
									maxNumRetry: 6,
									retryDelayMs: 500,
									maxRetryDelayMs: 4000,
								},
							},
						}
					});
					
					hls.on(Hls.Events.MANIFEST_PARSED, () => {
						updateStatus('✅ Stream ready!', 'success');
						status.style.display = 'none';
						video.style.display = 'block';
						video.play().catch(e => console.log('Autoplay prevented:', e));
					});
					
					hls.on(Hls.Events.ERROR, (event, data) => {
						console.warn('HLS Error:', data);
						if (data.fatal) {
							updateStatus(\`❌ Stream error: \${data.details}\`, 'error');
						}
					});
					
					hls.loadSource(videoSrc);
					hls.attachMedia(video);
				} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
					video.src = videoSrc;
					video.onloadedmetadata = () => {
						updateStatus('✅ Stream ready!', 'success');
						status.style.display = 'none';
						video.style.display = 'block';
					};
				}
			}
			
			function checkStreamAvailability() {
				fetch(videoSrc)
					.then(response => {
						if (response.ok) {
							initializeHLS();
						} else {
							throw new Error('Stream not ready');
						}
					})
					.catch(() => {
						retryCount++;
						if (retryCount <= maxRetries) {
							updateStatus(\`🔄 Waiting for stream... (attempt \${retryCount}/\${maxRetries})\`);
							setTimeout(checkStreamAvailability, 2000);
						} else {
							updateStatus('❌ Stream failed to initialize. Please try starting HLS again.', 'error');
						}
					});
			}
			
			// Start checking for stream availability
			checkStreamAvailability();
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

interface SocketTransports {
	producer?: mediasoup.types.WebRtcTransport;
	consumer?: mediasoup.types.WebRtcTransport;
}

interface PlainTransports {
	audioTransport?: mediasoup.types.PlainTransport;
	videoTransport?: mediasoup.types.PlainTransport;
}

interface RoomState {
	router: mediasoup.types.Router;
	participants: Set<string>; // socket IDs
	transports: Map<string, SocketTransports>;
	producers: Map<string, mediasoup.types.Producer[]>;
	consumers: Map<string, mediasoup.types.Consumer>;
}

// Room management
const rooms = new Map<string, RoomState>(); // roomId -> RoomState

// Legacy support (for backward compatibility with existing /stream page)
let legacyRouter: mediasoup.types.Router;
const legacyTransports = new Map<string, SocketTransports>(); // socket.id -> {producer?: Transport, consumer?: Transport}
const legacyProducers = new Map<string, mediasoup.types.Producer[]>(); // socket.id -> Producer[]
const legacyConsumers = new Map<string, mediasoup.types.Consumer>(); // consumerId -> Consumer

// HLS Streaming
const plainTransports = new Map<string, PlainTransports>(); // streamId -> PlainTransport
const hlsProcesses = new Map<string, ChildProcess>(); // streamId -> FFmpeg process
const streamSocketMap = new Map<string, string>(); // streamId -> socketId
const HLS_DIR = "./hls";

// Initialize Mediasoup
// Create HLS directory
if (!existsSync(HLS_DIR)) {
	mkdirSync(HLS_DIR, { recursive: true });
}

// Room management helper functions
async function createRoom(roomId: string): Promise<RoomState> {
	const existingRoom = rooms.get(roomId);
	if (existingRoom) {
		return existingRoom;
	}

	const router = await worker.createRouter({
		mediaCodecs: [
			{
				kind: "audio",
				mimeType: "audio/opus",
				clockRate: 48000,
				channels: 2,
			},
			{
				kind: "video",
				mimeType: "video/H264",
				clockRate: 90000,
				parameters: {
					"packetization-mode": 1,
					"profile-level-id": "42001f", // Baseline profile
					"level-asymmetry-allowed": 1,
					"x-google-start-bitrate": 1000,
				},
			},
		],
	});

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

function getRoomState(roomId: string): RoomState | null {
	return rooms.get(roomId) || null;
}

function joinRoom(roomId: string, socketId: string): RoomState {
	const roomState = rooms.get(roomId);
	if (!roomState) {
		throw new Error(`Room ${roomId} does not exist`);
	}

	roomState.participants.add(socketId);
	console.log(`Socket ${socketId} joined room ${roomId}`);
	return roomState;
}

function leaveRoom(roomId: string, socketId: string): void {
	const roomState = rooms.get(roomId);
	if (!roomState) return;

	roomState.participants.delete(socketId);

	// Clean up transports, producers, and consumers for this socket
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

	// Clean up consumers for this socket
	for (const [consumerId, consumer] of roomState.consumers) {
		if (consumer.appData?.socketId === socketId) {
			consumer.close();
			roomState.consumers.delete(consumerId);
		}
	}

	console.log(`Socket ${socketId} left room ${roomId}`);

	// Clean up empty rooms
	if (roomState.participants.size === 0) {
		roomState.router.close();
		rooms.delete(roomId);
		console.log(`Room ${roomId} deleted (empty)`);
	}
}

async function initMediasoup() {
	worker = await mediasoup.createWorker({
		logLevel: "debug",
		rtcMinPort: 10000,
		rtcMaxPort: 10100,
	});

	// Create legacy router for backward compatibility
	legacyRouter = await worker.createRouter({
		mediaCodecs: [
			{
				kind: "audio",
				mimeType: "audio/opus",
				clockRate: 48000,
				channels: 2,
			},
			{
				kind: "video",
				mimeType: "video/H264",
				clockRate: 90000,
				parameters: {
					"packetization-mode": 1,
					"profile-level-id": "42001f", // Baseline profile
					"level-asymmetry-allowed": 1,
					"x-google-start-bitrate": 1000,
				},
			},
		],
	});

	console.log("Mediasoup worker and legacy router initialized");
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

// Function to generate composite SDP file with multiple streams
function generateCompositeSDP(
	audioConsumers: mediasoup.types.Consumer[],
	videoConsumers: mediasoup.types.Consumer[],
	basePort: number,
): string {
	let sdp = "v=0\r\n";
	sdp += "o=- 0 0 IN IP4 127.0.0.1\r\n";
	sdp += "s=FFmpeg\r\n";
	sdp += "c=IN IP4 127.0.0.1\r\n";
	sdp += "t=0 0\r\n";

	let currentPort = basePort;

	// Add all audio streams
	audioConsumers.forEach((consumer, _i) => {
		const audioCodec = consumer.rtpParameters.codecs[0];
		const audioPayloadType = audioCodec.payloadType;
		const audioPort = currentPort;
		currentPort += 2; // Skip RTCP port

		sdp += `m=audio ${audioPort} RTP/AVP ${audioPayloadType}\r\n`;
		sdp += `a=rtpmap:${audioPayloadType} ${audioCodec.mimeType.split("/")[1]}/${audioCodec.clockRate}`;

		if (audioCodec.channels && audioCodec.channels > 1) {
			sdp += `/${audioCodec.channels}`;
		}
		sdp += "\r\n";
		sdp += "a=sendonly\r\n";

		if (consumer.rtpParameters.encodings?.[0]?.ssrc) {
			sdp += `a=ssrc:${consumer.rtpParameters.encodings[0].ssrc} cname:mediasoup\r\n`;
		}
	});

	// Add all video streams
	videoConsumers.forEach((consumer, _i) => {
		const videoCodec = consumer.rtpParameters.codecs[0];
		const videoPayloadType = videoCodec.payloadType;
		const videoPort = currentPort;
		currentPort += 2; // Skip RTCP port

		sdp += `m=video ${videoPort} RTP/AVP ${videoPayloadType}\r\n`;
		sdp += `a=rtpmap:${videoPayloadType} ${videoCodec.mimeType.split("/")[1]}/${videoCodec.clockRate}\r\n`;
		sdp += "a=sendonly\r\n";

		if (consumer.rtpParameters.encodings?.[0]?.ssrc) {
			sdp += `a=ssrc:${consumer.rtpParameters.encodings[0].ssrc} cname:mediasoup\r\n`;
		}
	});

	return sdp;
}

// Function to monitor HLS stream readiness
function monitorHLSStream(streamId: string, socketId: string) {
	const streamDir = `${HLS_DIR}/${streamId}`;
	const streamPath = `${streamDir}/stream.m3u8`;

	const checkStream = () => {
		// Check if the playlist file exists and has content
		if (fs.existsSync(streamPath)) {
			try {
				const content = fs.readFileSync(streamPath, "utf-8");
				// Check if playlist has at least one segment
				if (content.includes(".ts")) {
					console.log(
						`HLS stream ${streamId} is ready - emitting event to ${socketId}`,
					);
					// Emit to the specific socket that requested the stream
					io.to(socketId).emit("hlsStreamReady", { streamId });
					return true;
				}
			} catch (error) {
				console.error(`Error reading HLS playlist for ${streamId}:`, error);
			}
		}
		return false;
	};

	// Check immediately and then every 1 second for up to 30 seconds
	let attempts = 0;
	const maxAttempts = 30;

	const interval = setInterval(() => {
		attempts++;

		if (checkStream()) {
			clearInterval(interval);
			return;
		}

		if (attempts >= maxAttempts) {
			console.warn(
				`HLS stream ${streamId} failed to initialize after ${maxAttempts} seconds`,
			);
			io.to(socketId).emit("hlsStreamFailed", {
				streamId,
				error: "Stream failed to initialize",
			});
			clearInterval(interval);
		}
	}, 1000);
}

// HLS Streaming Functions
async function createCompositeHLSStream(
	streamId: string,
	audioProducers: mediasoup.types.Producer[],
	videoProducers: mediasoup.types.Producer[],
	socketId: string,
	router: mediasoup.types.Router, // Pass the correct router
) {
	if (audioProducers.length === 0 && videoProducers.length === 0) {
		throw new Error("At least one producer (audio or video) is required");
	}

	// Create stream directory
	const streamDir = `${HLS_DIR}/${streamId}`;
	if (!existsSync(streamDir)) {
		mkdirSync(streamDir, { recursive: true });
	}

	// Create multiple PlainTransports and consumers for composition
	const audioTransports: mediasoup.types.PlainTransport[] = [];
	const videoTransports: mediasoup.types.PlainTransport[] = [];
	const audioConsumers: mediasoup.types.Consumer[] = [];
	const videoConsumers: mediasoup.types.Consumer[] = [];

	// Allocate ports for each stream
	const basePort = 20000;
	let currentPort = basePort;

	// Create consumers for all audio producers
	for (let i = 0; i < audioProducers.length; i++) {
		const audioProducer = audioProducers[i];
		
		// Skip if producer is closed
		if (audioProducer.closed) {
			console.warn(`Skipping closed audio producer ${audioProducer.id}`);
			continue;
		}
		
		const audioRtpPort = currentPort++;
		const audioRtcpPort = currentPort++;

		const audioTransport = await router.createPlainTransport({
			listenIp: { ip: "127.0.0.1" },
			rtcpMux: false,
			comedia: false,
		});

		const audioConsumer = await audioTransport.consume({
			producerId: audioProducer.id,
			rtpCapabilities: router.rtpCapabilities,
			paused: true,
		});

		await audioTransport.connect({
			ip: "127.0.0.1",
			port: audioRtpPort,
			rtcpPort: audioRtcpPort,
		});

		audioTransports.push(audioTransport);
		audioConsumers.push(audioConsumer);

		console.log(
			`Audio ${i} PlainTransport connected on ports ${audioRtpPort}/${audioRtcpPort}`,
		);
	}

	// Create consumers for all video producers
	for (let i = 0; i < videoProducers.length; i++) {
		const videoProducer = videoProducers[i];
		
		// Skip if producer is closed
		if (videoProducer.closed) {
			console.warn(`Skipping closed video producer ${videoProducer.id}`);
			continue;
		}
		
		const videoRtpPort = currentPort++;
		const videoRtcpPort = currentPort++;

		const videoTransport = await router.createPlainTransport({
			listenIp: { ip: "127.0.0.1" },
			rtcpMux: false,
			comedia: false,
		});

		const videoConsumer = await videoTransport.consume({
			producerId: videoProducer.id,
			rtpCapabilities: router.rtpCapabilities,
			paused: true,
		});

		await videoTransport.connect({
			ip: "127.0.0.1",
			port: videoRtpPort,
			rtcpPort: videoRtcpPort,
		});

		videoTransports.push(videoTransport);
		videoConsumers.push(videoConsumer);

		console.log(
			`Video ${i} PlainTransport connected on ports ${videoRtpPort}/${videoRtcpPort}`,
		);
	}

	// Validate we have at least one valid producer after filtering
	if (audioConsumers.length === 0 && videoConsumers.length === 0) {
		// Close any opened transports
		audioTransports.forEach(transport => transport.close());
		videoTransports.forEach(transport => transport.close());
		throw new Error("No valid producers available - all producers were closed");
	}

	// Create single composite SDP file with all streams
	const fs = await import("node:fs/promises");
	const compositeSdp = generateCompositeSDP(
		audioConsumers,
		videoConsumers,
		basePort,
	);
	const sdpPath = `${streamDir}/composite.sdp`;
	await fs.writeFile(sdpPath, compositeSdp);
	console.log(`Composite SDP created: ${sdpPath}`);
	console.log(`SDP Content:\n${compositeSdp}`);

	// Build FFmpeg command for single SDP input with multiple streams
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

	// Add filter complex for composition
	// Single input file with multiple streams: stream 0=audio0, stream 1=audio1, stream 2=video0, stream 3=video1
	const videoStartIndex = audioConsumers.length;

	let filterComplex = "";

	// Handle video composition with grid layout
	if (videoConsumers.length > 1) {
		// Create responsive grid layout for video composition
		const numVideos = videoConsumers.length;
		
		// Calculate grid dimensions - optimize for 1080p screens
		let cols: number, rows: number;
		if (numVideos <= 2) {
			cols = 2; rows = 1; // 2x1 layout
		} else if (numVideos <= 4) {
			cols = 2; rows = 2; // 2x2 layout
		} else if (numVideos <= 6) {
			cols = 3; rows = 2; // 3x2 layout
		} else if (numVideos <= 9) {
			cols = 3; rows = 3; // 3x3 layout
		} else {
			cols = 4; rows = Math.ceil(numVideos / 4); // 4xN layout for larger groups
		}

		// Calculate video dimensions for grid - assume 1080p output (1920x1080)
		const gridWidth = 1920;
		const gridHeight = 1080;
		const videoWidth = Math.floor(gridWidth / cols);
		const videoHeight = Math.floor(gridHeight / rows);

		// First scale all videos to fit grid cells
		const scaledInputs: string[] = [];
		for (let i = 0; i < numVideos; i++) {
			const inputLabel = `scaled${i}`;
			scaledInputs.push(`[0:${videoStartIndex + i}]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${videoWidth}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[${inputLabel}]`);
		}

		// Create grid positions for xstack layout - only use actual videos
		const positions: string[] = [];
		const xstackInputs: string[] = [];
		
		for (let i = 0; i < numVideos; i++) {
			const row = Math.floor(i / cols);
			const col = i % cols;
			const x = col * videoWidth;
			const y = row * videoHeight;
			positions.push(`${x}_${y}`);
			xstackInputs.push(`[scaled${i}]`);
		}

		// Build the complete filter complex
		const scaleFilters = scaledInputs.join(';');
		const xstackFilter = `${xstackInputs.join('')}xstack=inputs=${numVideos}:layout=${positions.join('|')}:fill=black[v]`;
		filterComplex = `${scaleFilters};${xstackFilter}`;
	}

	// Handle audio mixing
	if (audioConsumers.length > 1) {
		const audioInputs = audioConsumers.map((_, i) => `[0:${i}]`).join("");
		const audioFilter = `${audioInputs}amix=inputs=${audioConsumers.length}[a]`;

		if (filterComplex) {
			filterComplex += `;${audioFilter}`;
		} else {
			filterComplex = audioFilter;
		}
	}

	// Apply filter complex if needed
	if (filterComplex) {
		ffmpegArgs.push("-filter_complex", filterComplex);
	}

	// Map outputs
	if (videoConsumers.length > 1) {
		ffmpegArgs.push("-map", "[v]");
	} else if (videoConsumers.length === 1) {
		ffmpegArgs.push("-map", `0:${videoStartIndex}`);
	}

	if (audioConsumers.length > 1) {
		ffmpegArgs.push("-map", "[a]");
	} else if (audioConsumers.length === 1) {
		ffmpegArgs.push("-map", "0:0");
	}

	// Add encoding options
	if (videoConsumers.length > 0) {
		ffmpegArgs.push(
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-tune",
			"zerolatency",
			"-profile:v",
			"baseline",
			"-level",
			"3.1",
			"-pix_fmt",
			"yuv420p",
			"-r",
			"30",
			"-bf",
			"0",
		);
	}

	if (audioConsumers.length > 0) {
		ffmpegArgs.push("-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2");
	}

	// Add HLS options optimized for faster startup and playback speed support
	ffmpegArgs.push(
		"-f",
		"hls",
		"-hls_time",
		"1", // Shorter segments for faster startup
		"-hls_list_size",
		"12", // More segments in playlist for better buffering
		"-hls_flags",
		"delete_segments+omit_endlist+independent_segments",
		"-hls_segment_type",
		"mpegts",
		"-hls_allow_cache",
		"0",
		"-hls_init_time",
		"0.5", // First segment can be shorter for faster start
		"-start_number",
		"0",
		`${streamDir}/stream.m3u8`,
	);

	console.log(`Starting composite FFmpeg: ${ffmpegArgs.join(" ")}`);

	// Start FFmpeg process
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

	// Resume all consumers after FFmpeg starts
	setTimeout(async () => {
		try {
			for (const consumer of [...audioConsumers, ...videoConsumers]) {
				if (consumer.paused) {
					await consumer.resume();
					console.log(
						`Consumer resumed for stream ${streamId}: ${consumer.kind}`,
					);
				}
			}
		} catch (error) {
			console.error(`Error resuming consumers for stream ${streamId}:`, error);
		}
	}, 2000);

	// Store references
	plainTransports.set(streamId, {
		audioTransport: audioTransports[0],
		videoTransport: videoTransports[0],
	});
	hlsProcesses.set(streamId, ffmpegProcess);
	streamSocketMap.set(streamId, socketId);

	// Start monitoring the stream for readiness
	setTimeout(() => {
		monitorHLSStream(streamId, socketId);
	}, 3000); // Wait 3 seconds for FFmpeg to start generating files

	console.log(`Composite HLS stream created for ${streamId}`);
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

	// Clean up socket mapping
	streamSocketMap.delete(streamId);

	console.log(`HLS stream stopped for ${streamId}`);
}

// Socket.IO connection handling with room support
io.on("connection", (socket) => {
	console.log(`Client connected: ${socket.id}`);
	let currentRoomId: string | null = null;

	// Room management events
	socket.on("joinRoom", async (data) => {
		try {
			const { roomId } = data;
			currentRoomId = roomId;

			// Create room if it doesn't exist
			await createRoom(roomId);

			// Join the room
			joinRoom(roomId, socket.id);

			// Emit participant count to room
			const roomState = getRoomState(roomId);
			if (roomState) {
				io.emit("roomParticipantCount", {
					roomId,
					count: roomState.participants.size,
				});
			}

			console.log(`Socket ${socket.id} joined room ${roomId}`);
		} catch (error) {
			console.error("Error joining room:", error);
		}
	});

	socket.on("leaveRoom", (data) => {
		const { roomId } = data;
		if (roomId) {
			leaveRoom(roomId, socket.id);
			currentRoomId = null;

			// Emit updated participant count
			const roomState = getRoomState(roomId);
			if (roomState) {
				io.emit("roomParticipantCount", {
					roomId,
					count: roomState.participants.size,
				});
			}
		}
	});

	// WebRTC events (support both room-based and legacy)
	socket.on("getRtpCapabilities", (data, callback) => {
		try {
			const { roomId } = data || {};
			let targetRouter: mediasoup.types.Router;

			if (roomId) {
				const roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}
				targetRouter = roomState.router;
			} else {
				// Legacy support
				targetRouter = legacyRouter;
			}

			const rtpCapabilities = targetRouter.rtpCapabilities;
			callback({ rtpCapabilities });
		} catch (error) {
			console.error("Error getting RTP capabilities:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	socket.on("createWebRtcTransport", async (data, callback) => {
		try {
			const { roomId, type } = data || {};
			let targetRouter: mediasoup.types.Router;
			let targetTransports: Map<string, SocketTransports>;

			if (roomId) {
				const roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}
				targetRouter = roomState.router;
				targetTransports = roomState.transports;
			} else {
				// Legacy support
				targetRouter = legacyRouter;
				targetTransports = legacyTransports;
			}

			const transport = await targetRouter.createWebRtcTransport({
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
			if (!targetTransports.has(socket.id)) {
				targetTransports.set(socket.id, {});
			}
			const transportType = type || "producer";
			const socketTransports = targetTransports.get(socket.id);
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
			const { roomId, transportId, dtlsParameters } = data;
			let targetTransports: Map<string, SocketTransports>;

			if (roomId) {
				const roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}
				targetTransports = roomState.transports;
			} else {
				// Legacy support
				targetTransports = legacyTransports;
			}

			const transportsForSocket = targetTransports.get(socket.id);
			if (!transportsForSocket) {
				throw new Error("No transports found for socket");
			}

			// Find the transport by ID
			const transport = Object.values(transportsForSocket).find(
				(t) => t && t.id === transportId,
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

			await transport.connect({ dtlsParameters });
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
			const { roomId, kind, rtpParameters } = data;
			let targetTransports: Map<string, SocketTransports>;
			let targetProducers: Map<string, mediasoup.types.Producer[]>;

			if (roomId) {
				const roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}
				targetTransports = roomState.transports;
				targetProducers = roomState.producers;
			} else {
				// Legacy support
				targetTransports = legacyTransports;
				targetProducers = legacyProducers;
			}

			const transportsForSocket = targetTransports.get(socket.id);
			const transport = transportsForSocket?.producer;

			if (!transport) {
				throw new Error("Producer transport not found");
			}

			const producer = await transport.produce({
				kind,
				rtpParameters,
			});

			// Initialize producers array for this socket if it doesn't exist
			if (!targetProducers.has(socket.id)) {
				targetProducers.set(socket.id, []);
			}
			const producerList = targetProducers.get(socket.id);
			if (producerList) {
				producerList.push(producer);
			}

			// Notify other clients about new producer (room-specific or global)
			if (roomId) {
				const roomState = getRoomState(roomId);
				if (roomState) {
					// Notify only room participants
					roomState.participants.forEach((participantId) => {
						if (participantId !== socket.id) {
							io.to(participantId).emit("newProducer", {
								producerId: producer.id,
								socketId: socket.id,
								roomId,
							});
						}
					});
				}
			} else {
				// Legacy: notify all clients
				socket.broadcast.emit("newProducer", {
					producerId: producer.id,
					socketId: socket.id,
				});
			}

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
			const { roomId, producerSocketId, rtpCapabilities } = data;
			let targetTransports: Map<string, SocketTransports>;
			let targetProducers: Map<string, mediasoup.types.Producer[]>;
			let targetConsumers: Map<string, mediasoup.types.Consumer>;
			let targetRouter: mediasoup.types.Router;

			if (roomId) {
				const roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}
				targetTransports = roomState.transports;
				targetProducers = roomState.producers;
				targetConsumers = roomState.consumers;
				targetRouter = roomState.router;
			} else {
				// Legacy support
				targetTransports = legacyTransports;
				targetProducers = legacyProducers;
				targetConsumers = legacyConsumers;
				targetRouter = legacyRouter;
			}

			const transportsForSocket = targetTransports.get(socket.id);
			const transport = transportsForSocket?.consumer;

			if (!transport) {
				callback({ error: "Consumer transport not found" });
				return;
			}

			const producerList = targetProducers.get(producerSocketId);

			if (!producerList || producerList.length === 0) {
				callback({ error: "No producers found for socket" });
				return;
			}

			// Find all consumable producers (both audio and video)
			const consumableProducers = producerList.filter(
				(p: mediasoup.types.Producer) =>
					targetRouter.canConsume({
						producerId: p.id,
						rtpCapabilities,
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
					rtpCapabilities,
					paused: true,
					appData: {
						socketId: socket.id,
						producerSocketId,
						roomId,
					},
				});

				// Store consumer by its ID for easier lookup
				targetConsumers.set(consumer.id, consumer);

				consumerParams.push({
					id: consumer.id,
					producerId: producer.id,
					kind: consumer.kind,
					rtpParameters: consumer.rtpParameters,
				});

				console.log(
					`Created consumer for ${consumer.kind} track:`,
					consumer.id,
					roomId ? `in room ${roomId}` : "(legacy)",
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
			const { consumerId } = data;
			
			// First try to find consumer in room states
			let consumer: mediasoup.types.Consumer | undefined;
			
			// Search through all rooms first
			for (const [roomId, roomState] of rooms) {
				consumer = roomState.consumers.get(consumerId);
				if (consumer) {
					console.log(`Found consumer ${consumerId} in room ${roomId}`);
					break;
				}
			}
			
			// If not found in rooms, check legacy consumers
			if (!consumer) {
				consumer = legacyConsumers.get(consumerId);
				if (consumer) {
					console.log(`Found consumer ${consumerId} in legacy system`);
				}
			}

			if (!consumer) {
				throw new Error(`Consumer not found: ${consumerId}`);
			}

			if (consumer.paused) {
				await consumer.resume();
				console.log(`Consumer resumed: ${consumerId}`);
			}

			callback();
		} catch (error) {
			console.error("Error resuming consumer:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// Send existing producers to new client
	socket.on("getProducers", (data, callback) => {
		try {
			const { roomId } = data || {};
			let targetProducers: Map<string, mediasoup.types.Producer[]>;

			if (roomId) {
				const roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}
				targetProducers = roomState.producers;
			} else {
				// Legacy support
				targetProducers = legacyProducers;
			}

			const existingProducers: Array<{ producerId: string; socketId: string }> =
				[];
			targetProducers.forEach((producerList, socketId) => {
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
		} catch (error) {
			console.error("Error getting producers:", error);
			callback({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// Enhanced HLS streaming - supports room-based or legacy
	socket.on("startHLS", async (data, callback) => {
		try {
			const { roomId } = data || {};
			let streamId: string;
			const allAudioProducers: mediasoup.types.Producer[] = [];
			const allVideoProducers: mediasoup.types.Producer[] = [];
			let roomState: RoomState | null = null;

			if (roomId) {
				// Room-based HLS stream
				streamId = `room_${roomId}_${Date.now()}`;
				roomState = getRoomState(roomId);
				if (!roomState) {
					callback({ error: "Room not found" });
					return;
				}

				// Collect all producers from room participants - with real-time validation
				roomState.producers.forEach((producerList, socketId) => {
					// Check if participant is still in room
					if (!roomState?.participants.has(socketId)) {
						console.warn(`Skipping producers for disconnected participant ${socketId}`);
						return;
					}

					const audioProducer = producerList.find(
						(p: mediasoup.types.Producer) => p.kind === "audio" && !p.closed,
					);
					const videoProducer = producerList.find(
						(p: mediasoup.types.Producer) => p.kind === "video" && !p.closed,
					);

					if (audioProducer) {
						console.log(`Adding audio producer ${audioProducer.id} from participant ${socketId}`);
						allAudioProducers.push(audioProducer);
					}
					if (videoProducer) {
						console.log(`Adding video producer ${videoProducer.id} from participant ${socketId}`);
						allVideoProducers.push(videoProducer);
					}
				});
			} else {
				// Legacy HLS stream
				streamId = `stream_composite_${Date.now()}`;

				// Collect all producers from legacy system - with validation
				legacyProducers.forEach((producerList, socketId) => {
					const audioProducer = producerList.find(
						(p: mediasoup.types.Producer) => p.kind === "audio" && !p.closed,
					);
					const videoProducer = producerList.find(
						(p: mediasoup.types.Producer) => p.kind === "video" && !p.closed,
					);

					if (audioProducer) {
						console.log(`Adding legacy audio producer ${audioProducer.id} from ${socketId}`);
						allAudioProducers.push(audioProducer);
					}
					if (videoProducer) {
						console.log(`Adding legacy video producer ${videoProducer.id} from ${socketId}`);
						allVideoProducers.push(videoProducer);
					}
				});
			}

			if (allAudioProducers.length === 0 && allVideoProducers.length === 0) {
				throw new Error("No producers found for HLS streaming");
			}

			// Final validation - ensure all producers are still valid before HLS creation
			const validAudioProducers = allAudioProducers.filter(p => !p.closed);
			const validVideoProducers = allVideoProducers.filter(p => !p.closed);
			
			if (validAudioProducers.length === 0 && validVideoProducers.length === 0) {
				throw new Error("All producers were closed during HLS preparation");
			}

			console.log(`Creating HLS stream with ${validAudioProducers.length} audio and ${validVideoProducers.length} video producers`);

			// Use the correct router for HLS streaming
			let hlsRouter: mediasoup.types.Router;
			if (roomId) {
				// For room-based HLS, use the room's router
				hlsRouter = roomState!.router;
			} else {
				// For legacy HLS, use the legacy router
				hlsRouter = legacyRouter;
			}

			const result = await createCompositeHLSStream(
				streamId,
				validAudioProducers,
				validVideoProducers,
				socket.id,
				hlsRouter,
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

	socket.on("disconnect", () => {
		console.log(`Client disconnected: ${socket.id}`);

		// Clean up room resources if in a room
		if (currentRoomId) {
			leaveRoom(currentRoomId, socket.id);

			// Emit updated participant count
			const roomState = getRoomState(currentRoomId);
			if (roomState) {
				io.emit("roomParticipantCount", {
					roomId: currentRoomId,
					count: roomState.participants.size,
				});

				// Notify room participants about producer closure
				roomState.participants.forEach((participantId) => {
					io.to(participantId).emit("producerClosed", {
						socketId: socket.id,
						roomId: currentRoomId,
					});
				});
			}
		}

		// Clean up legacy resources
		const legacyTransportsForSocket = legacyTransports.get(socket.id);
		const legacyProducerList = legacyProducers.get(socket.id);

		if (legacyTransportsForSocket) {
			if (legacyTransportsForSocket.producer)
				legacyTransportsForSocket.producer.close();
			if (legacyTransportsForSocket.consumer)
				legacyTransportsForSocket.consumer.close();
		}

		if (legacyProducerList) {
			legacyProducerList.forEach((producer) => producer.close());
		}

		// Clean up legacy consumers for this socket
		for (const [consumerId, consumer] of legacyConsumers) {
			if (consumer.appData?.socketId === socket.id) {
				consumer.close();
				legacyConsumers.delete(consumerId);
			}
		}

		legacyTransports.delete(socket.id);
		legacyProducers.delete(socket.id);

		// Stop any HLS streams for this socket
		for (const [streamId] of hlsProcesses) {
			if (streamId.includes(socket.id)) {
				stopHLSStream(streamId);
			}
		}

		// Notify legacy clients
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
