"use client";

import { type SyntheticEvent, useRef, useState } from "react";
import ReactPlayer from "react-player";

interface HlsDvrPlayerProps {
	streamId: string;
}

export function HlsDvrPlayer({ streamId }: HlsDvrPlayerProps) {
	const [isBuffering, setIsBuffering] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const playerRef = useRef<HTMLVideoElement>(null);

	const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL}/hls/${streamId}/stream.m3u8`;

	// Optimized HLS.js configuration for TRUE DVR functionality - prevents live edge snap
	const hlsConfig = {
		// 🎯 CRITICAL DVR Settings: Required to prevent automatic jump to live edge
		liveDurationInfinity: true, // Required so we can seek in the past
		autoStartLoad: false, // Manual load control to prevent auto-snap to live edge
		
		// 📺 Buffer Configuration for DVR
		backBufferLength: Number.POSITIVE_INFINITY, // Keep all played content for seeking
		liveBackBufferLength: 0, // Disable live-specific back buffer limits

		// ⚡ Performance optimizations
		maxBufferLength: 30, // Forward buffer
		maxBufferSize: 100 * 1000 * 1000, // 100MB buffer size for long DVR streams
		enableWorker: true, // Use web workers for performance

		// 🔄 Retry policies for stability
		fragLoadPolicy: {
			default: {
				maxTimeToFirstByteMs: 8000,
				maxLoadTimeMs: 20000,
				errorRetry: {
					maxNumRetry: 6,
					retryDelayMs: 500,
					maxRetryDelayMs: 4000,
				},
				timeoutRetry: {
					maxNumRetry: 4,
					retryDelayMs: 0,
					maxRetryDelayMs: 0,
				},
			},
		},

		// 🎛️ Additional DVR optimizations
		startFragPrefetch: true, // Prefetch next fragment
		appendErrorMaxRetry: 3, // Retry append errors
		nudgeMaxRetry: 5, // Retry playhead nudges
	};

	const handleReady = () => {
		console.log("🎬 HLS Player ready");
		setIsBuffering(false);
	};

	const handleWaiting = () => {
		console.log("⏳ Player buffering...");
		setIsBuffering(true);
	};

	const handlePlaying = () => {
		console.log("▶️ Player resumed after buffering");
		setIsBuffering(false);
	};

	const handleError = (event: SyntheticEvent<HTMLVideoElement, Event>) => {
		console.error("❌ Player error:", event);
		setError("Video playback error occurred. Please refresh the page.");
		setIsBuffering(false);
	};

	if (error) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-black text-white">
				<div className="text-center">
					<p className="mb-4 text-red-500 text-xl">🚨 {error}</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					>
						Refresh Page
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="relative h-full w-full bg-black">
			<ReactPlayer
				ref={playerRef}
				src={hlsUrl}
				playing={true} // Auto-start playback
				controls={true} // Show native controls
				width="100%"
				height="100%"
				muted={true} // Required for autoplay in modern browsers
				playsInline={true} // For mobile devices
				style={{
					visibility: isBuffering ? "hidden" : "visible",
				}}
				config={{
					hls: hlsConfig,
				}}
				// Event handlers for state management  
				onReady={() => {
					// Since autoStartLoad: false, we need to manually start loading for DVR
					const player = (playerRef.current as any)?.getInternalPlayer?.();
					if (player && player.startLoad) {
						player.startLoad();
						console.log("🎬 HLS Player ready - manual startLoad() called for DVR");
					}
					handleReady();
				}}
				onWaiting={handleWaiting}
				onPlaying={handlePlaying}
				onError={handleError}
				onStart={() => console.log("🚀 Playback started")}
				onPause={() => console.log("⏸️ Playback paused")}
				onSeeking={() => console.log("🔍 User seeking...")}
				onSeeked={() => console.log("🎯 User finished seeking")}
				onEnded={() =>
					console.log("🏁 Stream ended (should not happen with live DVR)")
				}
			/>

			{/* Loading overlay */}
			{isBuffering && (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-white border-b-2" />
					<p className="text-lg">Loading Stream...</p>
					<p className="mt-2 text-gray-300 text-sm">Stream ID: {streamId}</p>
				</div>
			)}
		</div>
	);
}
