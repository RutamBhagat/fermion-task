"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface HlsConfig {
	enableWorker?: boolean;
	debug?: boolean;
}

interface HlsEvents {
	MANIFEST_PARSED: string;
	ERROR: string;
}

interface HlsErrorData {
	details: string;
	[key: string]: unknown;
}

interface HlsConstructor {
	new (config?: HlsConfig): HlsInstance;
	isSupported(): boolean;
	Events: HlsEvents;
}

interface HlsInstance {
	loadSource(url: string): void;
	attachMedia(media: HTMLMediaElement): void;
	on(
		event: string,
		listener: (event: Event, data?: HlsErrorData) => void,
	): void;
	destroy(): void;
}

declare global {
	interface Window {
		Hls: HlsConstructor;
	}
}

export default function WatchStreamPage() {
	const params = useParams();
	const streamId = params.streamId as string;
	const videoRef = useRef<HTMLVideoElement>(null);
	const hlsRef = useRef<HlsInstance | null>(null);
	const [isHlsLoaded, setIsHlsLoaded] = useState(false);

	// Construct HLS URL from stream ID
	const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"}/hls/${streamId}/stream.m3u8`;

	const loadStream = useCallback(async () => {
		if (!videoRef.current) return;

		try {
			// Clean up previous HLS instance
			if (hlsRef.current) {
				hlsRef.current.destroy();
				hlsRef.current = null;
			}

			if (window.Hls?.isSupported()) {
				const hls = new window.Hls({
					enableWorker: false,
					debug: false,
				});

				hlsRef.current = hls;
				hls.loadSource(hlsUrl);
				hls.attachMedia(videoRef.current);

				hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
					// Stream ready, no UI needed
				});

				hls.on(
					window.Hls.Events.ERROR,
					(_event: Event, data?: HlsErrorData) => {
						if (!data) return;
						console.warn("HLS event:", data.details);

						// Handle errors silently, auto-retry for common issues
						if (data.fatal) {
							const normalStreamingErrors = [
								"bufferStalledError",
								"levelLoadError",
								"fragLoadError",
								"bufferAppendError",
								"networkError",
							];

							if (normalStreamingErrors.includes(data.details)) {
								// Auto-retry silently
								setTimeout(() => {
									if (hlsRef.current) {
										try {
											hlsRef.current.startLoad();
										} catch (_e) {
											// Silent retry
										}
									}
								}, 2000);
							}
						}
					},
				);
			} else if (
				videoRef.current.canPlayType("application/vnd.apple.mpegurl")
			) {
				// Native HLS support (Safari)
				videoRef.current.src = hlsUrl;
			}
		} catch (err) {
			console.error("Stream error:", err);
		}
	}, [hlsUrl]);

	useEffect(() => {
		// Load HLS.js dynamically
		const script = document.createElement("script");
		script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
		script.onload = () => {
			setIsHlsLoaded(true);
		};
		script.onerror = () => {
			console.error("Failed to load HLS.js");
		};
		document.head.appendChild(script);

		return () => {
			if (hlsRef.current) {
				hlsRef.current.destroy();
			}
		};
	}, []);

	useEffect(() => {
		if (isHlsLoaded && streamId) {
			loadStream();
		}
	}, [isHlsLoaded, streamId, loadStream]);

	return (
		<div className="h-screen w-screen bg-black">
			<video
				ref={videoRef}
				autoPlay
				controls
				muted
				className="h-full w-full object-contain"
				style={{ backgroundColor: "black" }}
			>
				Your browser does not support the video tag.
			</video>
		</div>
	);
}
