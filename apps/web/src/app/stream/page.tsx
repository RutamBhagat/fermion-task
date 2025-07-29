"use client";

import { Device } from "mediasoup-client";
import type {
	DtlsParameters,
	IceCandidate,
	IceParameters,
	Producer,
	RtpCapabilities,
	Transport,
} from "mediasoup-client/types";

interface TransportParams {
	params: {
		id: string;
		iceParameters: IceParameters;
		iceCandidates: IceCandidate[];
		dtlsParameters: DtlsParameters;
	};
}

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StreamPage() {
	const [isConnected, setIsConnected] = useState(false);
	const [isProducing, setIsProducing] = useState(false);
	const [status, setStatus] = useState("Connecting to server...");
	const [remoteStreams, _setRemoteStreams] = useState<MediaStream[]>([]);

	const localVideoRef = useRef<HTMLVideoElement>(null);
	const remoteVideoRef = useRef<HTMLVideoElement>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const socketRef = useRef<Socket | null>(null);
	const deviceRef = useRef<Device | null>(null);
	const transportRef = useRef<Transport | null>(null);
	const producerRef = useRef<Producer | null>(null);

	useEffect(() => {
		let mounted = true;

		const initializeConnection = async () => {
			try {
				// Connect to Socket.IO server
				const socket = io(
					process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
				);
				socketRef.current = socket;

				socket.on("connect", async () => {
					if (!mounted) return;
					setIsConnected(true);
					setStatus("Connected to server");

					try {
						// Get RTP capabilities
						const { rtpCapabilities } = await new Promise<{
							rtpCapabilities: RtpCapabilities;
						}>((resolve) => {
							socket.emit("getRtpCapabilities", resolve);
						});

						// Create device
						const device = new Device();
						await device.load({ routerRtpCapabilities: rtpCapabilities });
						deviceRef.current = device;

						// Get user media
						const stream = await navigator.mediaDevices.getUserMedia({
							video: true,
							audio: true,
						});

						localStreamRef.current = stream;
						if (localVideoRef.current && mounted) {
							localVideoRef.current.srcObject = stream;
						}

						setStatus("Ready to stream");
					} catch (error) {
						console.error("Failed to initialize:", error);
						setStatus("Error: Setup failed");
					}
				});

				socket.on("disconnect", () => {
					if (!mounted) return;
					setIsConnected(false);
					setStatus("Disconnected from server");
				});

				socket.on("newProducer", async ({ producerId, socketId }) => {
					console.log("New producer available:", producerId, socketId);
					// Simplified - just log for now
				});
			} catch (error) {
				console.error("Failed to connect:", error);
				setStatus("Failed to connect to server");
			}
		};

		initializeConnection();

		return () => {
			mounted = false;
			if (localStreamRef.current) {
				localStreamRef.current.getTracks().forEach((track) => track.stop());
			}
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
			if (transportRef.current) {
				transportRef.current.close();
			}
		};
	}, []);

	const startProducing = async () => {
		const socket = socketRef.current;
		const device = deviceRef.current;
		const localStream = localStreamRef.current;

		if (!socket || !device || !localStream) return;

		try {
			setStatus("Creating transport...");

			// Create transport
			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit("createWebRtcTransport", {}, resolve);
			});

			const transport = device.createSendTransport(params);
			transportRef.current = transport;

			transport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit("connectTransport", { dtlsParameters }, callback);
			});

			transport.on("produce", async (parameters, callback) => {
				const { id } = await new Promise<{ id: string }>((resolve) => {
					socket.emit(
						"produce",
						{
							kind: parameters.kind,
							rtpParameters: parameters.rtpParameters,
						},
						resolve,
					);
				});
				callback({ id });
			});

			// Produce video
			const videoTrack = localStream.getVideoTracks()[0];
			if (videoTrack) {
				const producer = await transport.produce({ track: videoTrack });
				producerRef.current = producer;
				setIsProducing(true);
				setStatus("Streaming video");
			}
		} catch (error) {
			console.error("Failed to start producing:", error);
			setStatus("Failed to start streaming");
		}
	};

	return (
		<div className="container mx-auto space-y-6 p-4">
			<div className="text-center">
				<h1 className="font-bold text-3xl">WebRTC SFU Stream (Mediasoup)</h1>
				<p className="mt-2 text-muted-foreground">{status}</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Your Stream</CardTitle>
					</CardHeader>
					<CardContent>
						<video
							ref={localVideoRef}
							autoPlay
							muted
							className="aspect-video w-full rounded-lg bg-gray-900"
							aria-label="Local video stream"
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Remote Stream</CardTitle>
					</CardHeader>
					<CardContent>
						{/* biome-ignore lint/a11y/useMediaCaption: Live video streams don't have captions */}
						<video
							ref={remoteVideoRef}
							autoPlay
							className="aspect-video w-full rounded-lg bg-gray-900"
							aria-label="Remote video stream"
						/>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Controls</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex gap-4">
						<Button
							onClick={startProducing}
							disabled={!deviceRef.current || isProducing}
							className="flex-1"
						>
							{isProducing ? "Streaming..." : "Start Stream"}
						</Button>
					</div>

					<div className="text-muted-foreground text-sm">
						<p>
							Connection Status:{" "}
							{isConnected ? "🟢 Connected" : "🔴 Disconnected"}
						</p>
						<p>Device Ready: {deviceRef.current ? "🟢 Yes" : "🔴 No"}</p>
						<p>Producing: {isProducing ? "🟢 Yes" : "🔴 No"}</p>
						<p>Remote Streams: {remoteStreams.length}</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
