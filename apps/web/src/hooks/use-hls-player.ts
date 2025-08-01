"use client";

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
	fatal?: boolean;
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
	startLoad(): void;
}

declare global {
	interface Window {
		Hls: HlsConstructor;
	}
}

export function useHLSPlayer(streamId: string) {
	const [isHlsLoaded, setIsHlsLoaded] = useState(false);
	const hlsRef = useRef<HlsInstance | null>(null);

	const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"}/hls/${streamId}/stream.m3u8`;

	const loadStream = useCallback(
		async (videoElement: HTMLVideoElement) => {
			if (!videoElement) return;

			try {
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
					hls.attachMedia(videoElement);

					hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
						// Stream ready
					});

					hls.on(
						window.Hls.Events.ERROR,
						(_event: Event, data?: HlsErrorData) => {
							if (!data) return;
							console.warn("HLS event:", data.details);

							if (data.fatal) {
								const normalStreamingErrors = [
									"bufferStalledError",
									"levelLoadError",
									"fragLoadError",
									"bufferAppendError",
									"networkError",
								];

								if (normalStreamingErrors.includes(data.details)) {
									setTimeout(() => {
										if (hlsRef.current) {
											try {
												hlsRef.current.startLoad();
											} catch (e) {
												console.log("Retrying HLS stream load...", e);
											}
										}
									}, 2000);
								}
							}
						},
					);
				} else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
					videoElement.src = hlsUrl;
				}
			} catch (err) {
				console.error("Stream error:", err);
			}
		},
		[hlsUrl],
	);

	useEffect(() => {
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

	return {
		isHlsLoaded,
		loadStream,
	};
}
