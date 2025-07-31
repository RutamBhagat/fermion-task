"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

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
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [isHlsLoaded, setIsHlsLoaded] = useState(false);

	// Construct HLS URL from stream ID
	const hlsUrl = `${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"}/hls/${streamId}/stream.m3u8`;

	useEffect(() => {
		// Load HLS.js dynamically
		const script = document.createElement("script");
		script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
		script.onload = () => {
			console.log("HLS.js loaded");
			setIsHlsLoaded(true);
		};
		script.onerror = () => {
			setError("Failed to load HLS.js library");
			setIsLoading(false);
		};
		document.head.appendChild(script);

		return () => {
			if (hlsRef.current) {
				hlsRef.current.destroy();
			}
		};
	}, []);

	useEffect(() => {
		// Auto-load stream when HLS.js is ready
		if (isHlsLoaded && streamId) {
			loadStream();
		}
	}, [isHlsLoaded, streamId]);

	const loadStream = async () => {
		if (!videoRef.current) return;

		setIsLoading(true);
		setError("");

		try {
			// Clean up previous HLS instance
			if (hlsRef.current) {
				hlsRef.current.destroy();
				hlsRef.current = null;
			}

			if (window.Hls?.isSupported()) {
				const hls = new window.Hls({
					enableWorker: false,
					debug: true,
				});

				hlsRef.current = hls;
				hls.loadSource(hlsUrl);
				hls.attachMedia(videoRef.current);

				hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
					console.log("HLS manifest parsed, starting playback");
					setIsLoading(false);
				});

				hls.on(
					window.Hls.Events.ERROR,
					(_event: Event, data?: HlsErrorData) => {
						if (!data) return;
						console.error("HLS error:", data);
						setError(`HLS Error: ${data.details}`);
						setIsLoading(false);
					},
				);
			} else if (
				videoRef.current.canPlayType("application/vnd.apple.mpegurl")
			) {
				// Native HLS support (Safari)
				videoRef.current.src = hlsUrl;
				setIsLoading(false);
			} else {
				setError("HLS not supported in this browser");
				setIsLoading(false);
			}
		} catch (err) {
			setError(`Failed to load stream: ${err}`);
			setIsLoading(false);
		}
	};

	const retryLoad = () => {
		loadStream();
	};

	return (
		<div className="container mx-auto max-w-4xl p-6">
			<h1 className="mb-6 font-bold text-3xl">Watch Stream: {streamId}</h1>

			{error && (
				<div className="mb-6 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
					<p>{error}</p>
					<Button onClick={retryLoad} className="mt-2" variant="outline" size="sm">
						Retry
					</Button>
				</div>
			)}

			{isLoading && (
				<div className="mb-6 rounded border border-blue-400 bg-blue-100 px-4 py-3 text-blue-700">
					Loading stream...
				</div>
			)}

			<div className="overflow-hidden rounded-lg bg-black">
				<video
					ref={videoRef}
					controls
					autoPlay
					muted
					className="h-auto w-full"
					style={{ maxHeight: "70vh" }}
				>
					Your browser does not support the video tag.
				</video>
			</div>

			<div className="mt-6 text-gray-600 text-sm">
				<h3 className="mb-2 font-semibold">Stream Details:</h3>
				<p><strong>Stream ID:</strong> {streamId}</p>
				<p><strong>HLS URL:</strong> <code className="text-xs">{hlsUrl}</code></p>
				
				<div className="mt-4 rounded bg-gray-100 p-3">
					<p className="font-semibold">Troubleshooting:</p>
					<ul className="list-inside list-disc space-y-1 text-xs">
						<li>Ensure the HLS stream is active on the server</li>
						<li>Check that the stream ID matches the active stream</li>
						<li>Verify the server is running on the correct port</li>
					</ul>
				</div>
			</div>
		</div>
	);
}