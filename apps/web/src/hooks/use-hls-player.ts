"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

export function useHLSPlayer(streamId: string) {
	const [isHlsLoaded, setIsHlsLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const hlsRef = useRef<Hls | null>(null);
	const retryCountRef = useRef(0);
	const maxRetries = 5;
	const lastSeekPositionRef = useRef<number | null>(null);
	const isUserSeekingRef = useRef(false);

	const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"}/hls/${streamId}/stream.m3u8`;

	const createHlsInstance = useCallback(() => {
		if (!Hls.isSupported()) {
			return null;
		}

		return new Hls({
			// Buffer Management - optimized for full stream viewing
			maxBufferLength: 30, // 30 seconds buffer
			maxBufferSize: 100 * 1000 * 1000, // 100MB for longer streams
			maxBufferHole: 0.5, // Handle gaps up to 0.5s

			// Fragment Loading - optimized retry policies
			fragLoadPolicy: {
				default: {
					maxTimeToFirstByteMs: 10000,
					maxLoadTimeMs: 30000,
					timeoutRetry: {
						maxNumRetry: 4,
						retryDelayMs: 500,
						maxRetryDelayMs: 5000,
					},
					errorRetry: {
						maxNumRetry: 6,
						retryDelayMs: 1000,
						maxRetryDelayMs: 8000,
					},
				},
			},

			// Manifest/Playlist Loading
			manifestLoadPolicy: {
				default: {
					maxTimeToFirstByteMs: 10000,
					maxLoadTimeMs: 20000,
					timeoutRetry: {
						maxNumRetry: 3,
						retryDelayMs: 500,
						maxRetryDelayMs: 2000,
					},
					errorRetry: {
						maxNumRetry: 3,
						retryDelayMs: 1000,
						maxRetryDelayMs: 5000,
					},
				},
			},

			playlistLoadPolicy: {
				default: {
					maxTimeToFirstByteMs: 10000,
					maxLoadTimeMs: 20000,
					timeoutRetry: {
						maxNumRetry: 3,
						retryDelayMs: 0,
						maxRetryDelayMs: 0,
					},
					errorRetry: {
						maxNumRetry: 3,
						retryDelayMs: 1000,
						maxRetryDelayMs: 8000,
					},
				},
			},

			// DVR Configuration - CRITICAL FIX for seek-and-stay behavior
			liveSyncDurationCount: 3, // Stay 3 segments behind live edge when at live
			liveMaxLatencyDurationCount: Number.POSITIVE_INFINITY, // ✅ NEVER jump back to live automatically
			liveSyncOnStallIncrease: 1, // Increase target latency on stalls
			maxLiveSyncPlaybackRate: 1, // Disable speed-up to catch up to live

			// DVR-specific settings  
			liveDurationInfinity: false, // ✅ Keep finite duration for time display
			backBufferLength: 120, // Keep 2 minutes of back buffer for seeking

			// Performance optimizations
			enableWorker: true, // Use web workers
			startFragPrefetch: true, // Prefetch next fragment
			autoStartLoad: true, // Start loading immediately

			// Error handling
			appendErrorMaxRetry: 3, // Retry append errors
			nudgeMaxRetry: 5, // Retry playhead nudges

			// Debug (disable in production)
			debug: false,
		});
	}, []);

	const handleError = useCallback(async (_event: unknown, data: any) => {
		console.warn(
			"HLS Error:",
			data.details,
			"Fatal:",
			data.fatal,
			"Type:",
			data.type,
		);

		if (data.fatal) {
			switch (data.type) {
				case Hls.ErrorTypes.MEDIA_ERROR:
					console.log("Fatal media error, attempting recovery...");
					if (hlsRef.current) {
						try {
							hlsRef.current.recoverMediaError();
							retryCountRef.current++;
						} catch (e) {
							console.error("Media error recovery failed:", e);
							setError("Media playback error occurred");
						}
					}
					break;

				case Hls.ErrorTypes.NETWORK_ERROR:
					console.error("Fatal network error:", data);
					if (retryCountRef.current < maxRetries) {
						retryCountRef.current++;
						const delay = Math.min(1000 * 2 ** retryCountRef.current, 10000);
						console.log(
							`Retrying in ${delay}ms (attempt ${retryCountRef.current}/${maxRetries})`,
						);

						setTimeout(() => {
							if (hlsRef.current) {
								hlsRef.current.startLoad();
							}
						}, delay);
					} else {
						setError(
							"Network connection failed. Please check your connection and try again.",
						);
					}
					break;

				default:
					console.error("Unrecoverable HLS error:", data);
					setError("Video playback error occurred");
					if (hlsRef.current) {
						hlsRef.current.destroy();
						hlsRef.current = null;
					}
					break;
			}
		}
	}, []);

	const loadStream = useCallback(
		async (videoElement: HTMLVideoElement) => {
			if (!videoElement) {
				console.warn("No video element provided");
				return;
			}

			try {
				setIsLoading(true);
				setError(null);
				retryCountRef.current = 0;

				// Clean up existing instance
				if (hlsRef.current) {
					// Clean up DVR event listeners if they exist
					if ((hlsRef.current as any).__dvrCleanup) {
						(hlsRef.current as any).__dvrCleanup();
					}
					hlsRef.current.destroy();
					hlsRef.current = null;
				}

				// Check HLS support
				if (Hls.isSupported()) {
					const hls = createHlsInstance();
					if (!hls) {
						throw new Error("Failed to create HLS instance");
					}

					hlsRef.current = hls;

					// Set up event listeners
					hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
						console.log("HLS manifest parsed, levels:", data.levels.length);
						setIsLoading(false);
					});

					hls.on(Hls.Events.FRAG_LOADED, () => {
						// Reset retry count on successful fragment load
						retryCountRef.current = 0;
					});

					hls.on(Hls.Events.ERROR, handleError);

					// DVR: Track user seeking to preserve position
					const handleVideoSeeking = () => {
						isUserSeekingRef.current = true;
						lastSeekPositionRef.current = videoElement.currentTime;
						console.log(`User seeking to: ${videoElement.currentTime}s`);
					};

					const handleVideoSeeked = () => {
						isUserSeekingRef.current = false;
						console.log(
							`User finished seeking at: ${videoElement.currentTime}s`,
						);
					};

					// DVR: Prevent unwanted position changes after user seeks
					const handleTimeUpdate = () => {
						if (
							lastSeekPositionRef.current !== null &&
							!isUserSeekingRef.current
						) {
							const currentTime = videoElement.currentTime;
							const seekPosition = lastSeekPositionRef.current;

							// If we detect an unwanted jump forward (back to live edge)
							// and user recently sought backward, restore their position
							if (
								Math.abs(currentTime - seekPosition) > 30 &&
								currentTime > seekPosition
							) {
								console.warn(
									`Detected unwanted jump from ${seekPosition}s to ${currentTime}s - restoring position`,
								);
								videoElement.currentTime = seekPosition;
								return;
							}
						}
					};

					// DVR: Prevent auto-rewind when reaching end of buffered content
					const handleEnded = (event: Event) => {
						event.preventDefault();
						console.warn('Video ended event prevented - staying at current position');
						
						// Don't let the video rewind, just pause at current position
						videoElement.pause();
						
						// If this is a live stream, try to load more content
						if (hlsRef.current) {
							console.log('Attempting to load more content...');
							hlsRef.current.startLoad();
						}
					};

					// Add video event listeners for DVR functionality
					videoElement.addEventListener("seeking", handleVideoSeeking);
					videoElement.addEventListener("seeked", handleVideoSeeked);
					videoElement.addEventListener("timeupdate", handleTimeUpdate);
					videoElement.addEventListener("ended", handleEnded);

					// Store cleanup function for these listeners
					const cleanup = () => {
						videoElement.removeEventListener("seeking", handleVideoSeeking);
						videoElement.removeEventListener("seeked", handleVideoSeeked);
						videoElement.removeEventListener("timeupdate", handleTimeUpdate);
						videoElement.removeEventListener("ended", handleEnded);
					};

					// Store cleanup in HLS instance for later use
					(hls as any).__dvrCleanup = cleanup;

					// Load the stream
					hls.loadSource(hlsUrl);
					hls.attachMedia(videoElement);

					console.log("HLS stream loading:", hlsUrl);
				} else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
					// Native HLS support (Safari)
					console.log("Using native HLS support");
					videoElement.src = hlsUrl;
					setIsLoading(false);
				} else {
					throw new Error("HLS is not supported in this browser");
				}
			} catch (err) {
				console.error("Stream loading error:", err);
				setError(err instanceof Error ? err.message : "Failed to load stream");
				setIsLoading(false);
			}
		},
		[hlsUrl, createHlsInstance, handleError],
	);

	// Initialize HLS.js availability
	useEffect(() => {
		if (Hls.isSupported()) {
			setIsHlsLoaded(true);
		} else {
			// Check for native HLS support
			const video = document.createElement("video");
			if (video.canPlayType("application/vnd.apple.mpegurl")) {
				setIsHlsLoaded(true);
			} else {
				setError("HLS is not supported in this browser");
			}
		}
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (hlsRef.current) {
				// Clean up DVR event listeners if they exist
				if ((hlsRef.current as any).__dvrCleanup) {
					(hlsRef.current as any).__dvrCleanup();
				}
				hlsRef.current.destroy();
				hlsRef.current = null;
			}
		};
	}, []);

	return {
		isHlsLoaded,
		isLoading,
		error,
		loadStream,
		hlsInstance: hlsRef.current,
	};
}
