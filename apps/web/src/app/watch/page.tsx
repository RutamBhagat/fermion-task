"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export default function WatchPage() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const hlsRef = useRef<HlsInstance | null>(null);
	const [streamUrl, setStreamUrl] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		// Check for stream parameter in URL
		const urlParams = new URLSearchParams(window.location.search);
		const streamParam = urlParams.get("stream");
		if (streamParam) {
			setStreamUrl(streamParam);
		}
	}, []);

	useEffect(() => {
		// Load HLS.js dynamically
		const script = document.createElement("script");
		script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
		script.onload = () => {
			console.log("HLS.js loaded");
		};
		document.head.appendChild(script);

		return () => {
			if (hlsRef.current) {
				hlsRef.current.destroy();
			}
		};
	}, []);

	const loadStream = async () => {
		if (!streamUrl || !videoRef.current) return;

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
				hls.loadSource(streamUrl);
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
				videoRef.current.src = streamUrl;
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

	const stopStream = () => {
		if (hlsRef.current) {
			hlsRef.current.destroy();
			hlsRef.current = null;
		}
		if (videoRef.current) {
			videoRef.current.src = "";
		}
		setError("");
	};

	return (
		<div className="container mx-auto max-w-4xl p-6">
			<h1 className="mb-6 font-bold text-3xl">Watch HLS Stream</h1>

			<div className="mb-6 space-y-4">
				<div className="flex gap-2">
					<Input
						type="text"
						placeholder="Enter HLS stream URL (e.g., http://localhost:3000/hls/stream_123/stream.m3u8)"
						value={streamUrl}
						onChange={(e) => setStreamUrl(e.target.value)}
						className="flex-1"
					/>
					<Button onClick={loadStream} disabled={isLoading || !streamUrl}>
						{isLoading ? "Loading..." : "Load Stream"}
					</Button>
					<Button variant="outline" onClick={stopStream}>
						Stop
					</Button>
				</div>

				{error && (
					<div className="rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
						{error}
					</div>
				)}
			</div>

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
				<h3 className="mb-2 font-semibold">Instructions:</h3>
				<ol className="list-inside list-decimal space-y-1">
					<li>First, start a WebRTC stream on the /stream page</li>
					<li>Use the server API to start HLS streaming for that stream</li>
					<li>Copy the HLS URL and paste it above</li>
					<li>Click "Load Stream" to start watching</li>
				</ol>

				<div className="mt-4 rounded bg-gray-100 p-3">
					<p className="font-semibold">Example HLS URL format:</p>
					<code className="text-xs">
						http://localhost:3000/hls/stream_&lt;socketId&gt;_&lt;timestamp&gt;/stream.m3u8
					</code>
				</div>
			</div>
		</div>
	);
}
