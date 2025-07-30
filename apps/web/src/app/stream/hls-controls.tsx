"use client";

import { useState } from "react";
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

	const startHLS = () => {
		if (!socket || !isConnected) {
			alert("Socket not connected");
			return;
		}

		socket.emit(
			"startHLS",
			{ socketId: socket.id },
			(response: HLSStartResponse) => {
				if (response.error) {
					alert(`Error starting HLS: ${response.error}`);
				} else {
					setHlsUrl(response.hlsUrl);
					setStreamId(response.streamId);
					setIsStreaming(true);
					console.log("HLS streaming started:", response);
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
				console.log("HLS streaming stopped");
			}
		});
	};

	const copyHlsUrl = () => {
		if (hlsUrl) {
			const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
			const fullUrl = `${serverUrl}${hlsUrl}`;
			navigator.clipboard.writeText(fullUrl);
			alert("HLS URL copied to clipboard!");
		}
	};

	const openWatchPage = () => {
		if (streamId) {
			const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
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
						disabled={!isConnected || isStreaming}
						variant="outline"
					>
						Start HLS Stream
					</Button>
					<Button onClick={stopHLS} disabled={!isStreaming} variant="outline">
						Stop HLS Stream
					</Button>
				</div>

				{isStreaming && hlsUrl && (
					<div className="space-y-2">
						<div className="flex gap-2">
							<Input
								value={`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}${hlsUrl}`}
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
