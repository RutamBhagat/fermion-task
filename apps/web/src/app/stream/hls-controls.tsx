"use client";

import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface HLSStartResponse {
	error?: string;
	hlsUrl?: string;
	streamId?: string;
}

interface HLSStopResponse {
	error?: string;
	success?: boolean;
}

interface HLSControlsProps {
	socket: Socket | null;
	isConnected: boolean;
}

export function HLSControls({ socket, isConnected }: HLSControlsProps) {
	const [hlsUrl, setHlsUrl] = useState("");
	const [streamId, setStreamId] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [isStartingStream, setIsStartingStream] = useState(false);
	const [streamStatus, setStreamStatus] = useState<string>("idle");

	// Set up Socket.IO event listeners for HLS stream events
	useEffect(() => {
		if (!socket) return;

		const handleStreamReady = (data: { streamId: string }) => {
			console.log("HLS stream ready:", data);
			setStreamStatus("Stream ready!");
			setIsStreaming(true);
			setIsStartingStream(false);
		};

		const handleStreamFailed = (data: { streamId: string; error: string }) => {
			console.error("HLS stream failed:", data);
			setStreamStatus("idle");
			setIsStartingStream(false);
			alert(`Stream failed to initialize: ${data.error}`);
		};

		socket.on("hlsStreamReady", handleStreamReady);
		socket.on("hlsStreamFailed", handleStreamFailed);

		// Cleanup listeners on unmount
		return () => {
			socket.off("hlsStreamReady", handleStreamReady);
			socket.off("hlsStreamFailed", handleStreamFailed);
		};
	}, [socket]);

	const startHLS = async () => {
		if (!socket || !isConnected) {
			alert("Socket not connected");
			return;
		}

		setIsStartingStream(true);
		setStreamStatus("Starting HLS stream...");

		socket.emit(
			"startHLS",
			{ socketId: socket.id },
			(response: HLSStartResponse) => {
				if (response.error) {
					alert(`Error starting HLS: ${response.error}`);
					setIsStartingStream(false);
					setStreamStatus("idle");
				} else {
					console.log("HLS streaming started:", response);
					setStreamStatus("Stream created, waiting for segments...");
					
					// Store the stream details, but don't set streaming yet
					// Wait for the hlsStreamReady event from the server
					setHlsUrl(response?.hlsUrl || "");
					setStreamId(response?.streamId || "");
				}
			},
		);
	};

	const stopHLS = () => {
		if (!socket || !streamId) return;

		socket.emit("stopHLS", { streamId }, (response: HLSStopResponse) => {
			if (response.error) {
				alert(`Error stopping HLS: ${response.error}`);
			} else {
				setHlsUrl("");
				setStreamId("");
				setIsStreaming(false);
				setIsStartingStream(false);
				setStreamStatus("idle");
				console.log("HLS streaming stopped");
			}
		});
	};

	const copyHlsUrl = () => {
		if (hlsUrl) {
			const serverUrl =
				process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
			const fullUrl = `${serverUrl}${hlsUrl}`;
			navigator.clipboard.writeText(fullUrl);
			alert("HLS URL copied to clipboard!");
		}
	};

	const openWatchPage = () => {
		if (streamId) {
			const serverUrl =
				process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
			const fullUrl = `${serverUrl}${hlsUrl}`;
			window.open(`/watch?stream=${encodeURIComponent(fullUrl)}`, "_blank");
		}
	};

	return (
		<Card className="mt-4">
			<CardHeader>
				<CardTitle>HLS Streaming Controls</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex gap-2">
					<Button
						onClick={startHLS}
						disabled={!isConnected || isStreaming || isStartingStream}
						variant="outline"
					>
						{isStartingStream ? "Starting Stream..." : "Start HLS Stream"}
					</Button>
					<Button
						onClick={stopHLS}
						disabled={!isStreaming || isStartingStream}
						variant="outline"
					>
						Stop HLS Stream
					</Button>
				</div>

				{/* Show loading state and status */}
				{isStartingStream && (
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-blue-600">
							<div className="h-4 w-4 animate-spin rounded-full border-blue-600 border-b-2" />
							<span>{streamStatus}</span>
						</div>
						<p className="text-gray-500 text-sm">
							Please wait while the HLS stream initializes. This may take up to
							30 seconds.
						</p>
					</div>
				)}

				{isStreaming && hlsUrl && (
					<div className="space-y-2">
						<div className="flex gap-2">
							<Input
								value={`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"}${hlsUrl}`}
								readOnly
								className="flex-1"
							/>
							<Button onClick={copyHlsUrl} size="sm">
								Copy URL
							</Button>
							<Button onClick={openWatchPage} size="sm">
								Watch
							</Button>
						</div>
						<p className="text-gray-600 text-sm">Stream ID: {streamId}</p>
						<p className="text-gray-500 text-sm">
							Use this URL in the /watch page or any HLS-compatible player
						</p>
					</div>
				)}

				{!isConnected && (
					<p className="text-red-600 text-sm">
						Connect to the server first to enable HLS streaming
					</p>
				)}

				{isConnected && !isStreaming && (
					<p className="text-green-600 text-sm">
						Start your camera/microphone stream first, then click "Start HLS
						Stream"
					</p>
				)}
			</CardContent>
		</Card>
	);
}
