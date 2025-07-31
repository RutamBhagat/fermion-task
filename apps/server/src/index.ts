import "dotenv/config";
import { createServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./handlers/socket.js";
import { initMediasoup } from "./services/mediasoup.js";

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
			const maxRetries = 15;
			
			function updateStatus(message, className = '') {
				status.innerHTML = \`<div class="\${className}">\${message}</div>\`;
			}
			
			function initializeHLS() {
				if (Hls.isSupported()) {
					const hls = new Hls({
						lowLatencyMode: false,
						liveSyncDurationCount: 3,
						liveMaxLatencyDurationCount: 6,
						maxLiveSyncPlaybackRate: 2.0,
						liveSyncOnStallIncrease: 1,
						maxBufferLength: 15,
						maxBufferHole: 0.5,
						nudgeMaxRetry: 5,
						initialLiveManifestSize: 3,
						startOnSegmentBoundary: true,
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
							if (data.details === 'levelLoadError' || data.details === 'fragLoadError' || data.details === 'bufferStalledError') {
								updateStatus('🔄 Stream catching up...', '');
								status.style.display = 'block';
								setTimeout(() => {
									if (hls && !hls.destroyed) {
										try {
											hls.startLoad();
										} catch (e) {
											console.log('Recovery attempt failed:', e);
										}
									}
								}, 2000);
							} else {
								updateStatus(\`❌ Stream error: \${data.details}\`, 'error');
							}
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
			
			checkStreamAvailability();
		</script>
	</body>
	</html>
	`);
});

const server = createServer(async (req, res) => {
	if (req.url?.startsWith("/socket.io")) {
		return;
	}

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

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

initMediasoup()
	.then(() => {
		server.listen(PORT, () => {
			console.log(`Mediasoup SFU Server running on port ${PORT}`);
		});
	})
	.catch(console.error);
