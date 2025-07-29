"use client";

import { Device } from "mediasoup-client";
import type {
	DtlsParameters,
	IceCandidate,
	IceParameters,
	Producer,
	RtpCapabilities,
	RtpParameters,
	Transport,
} from "mediasoup-client/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Type definitions
interface RtpCapabilitiesResponse {
	rtpCapabilities: RtpCapabilities;
}

interface TransportParams {
	params: {
		id: string;
		iceParameters: IceParameters;
		iceCandidates: IceCandidate[];
		dtlsParameters: DtlsParameters;
	};
}

interface ProducerResponse {
	id: string;
}

interface ConsumerParams {
	params: {
		id: string;
		producerId: string;
		kind: "video" | "audio";
		rtpParameters: RtpParameters;
	};
}

export default function StreamPage() {
	const [socket, setSocket] = useState<Socket | null>(null);
	const [device, setDevice] = useState<Device | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [isProducing, setIsProducing] = useState(false);
	const [status, setStatus] = useState("Connecting to server...");
	const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);

	const localVideoRef = useRef<HTMLVideoElement>(null);
	const remoteVideoRef = useRef<HTMLVideoElement>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const transportRef = useRef<Transport | null>(null);
	const producerRef = useRef<Producer | null>(null);

	const cleanup = useCallback(() => {
		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach((track) => track.stop());
		}
		if (socket) {
			socket.disconnect();
		}
		if (transportRef.current) {
			transportRef.current.close();
		}
	}, [socket]);

	const initializeDevice = useCallback(async (socketConnection: Socket) => {
		try {
			// Get RTP capabilities from server
			const { rtpCapabilities } = await new Promise<RtpCapabilitiesResponse>(
				(resolve) => {
					socketConnection.emit("getRtpCapabilities", resolve);
				},
			);

			// Create Mediasoup device
			const newDevice = new Device();
			await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
			setDevice(newDevice);

			// Get user media
			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true,
			});

			localStreamRef.current = stream;
			if (localVideoRef.current) {
				localVideoRef.current.srcObject = stream;
			}

			setStatus("Ready to stream");
		} catch (error) {
			console.error("Failed to initialize device:", error);
			setStatus("Error: Camera/microphone access denied");
		}
	}, []);

	const startProducing = async () => {
		if (!socket || !device || !localStreamRef.current) return;

		try {
			setStatus("Creating transport...");

			// Create WebRTC transport
			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit("createWebRtcTransport", {}, resolve);
			});

			const transport = device.createSendTransport(params);
			transportRef.current = transport;

			transport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit("connectTransport", { dtlsParameters }, callback);
			});

			transport.on("produce", async (parameters, callback) => {
				const { id } = await new Promise<ProducerResponse>((resolve) => {
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
			const videoTrack = localStreamRef.current.getVideoTracks()[0];
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

	const consumeMedia = useCallback(
		async (socketConnection: Socket, producerSocketId: string) => {
			if (!device) return;

			try {
				// Create receive transport (simplified - reusing send transport for demo)
				const { params } = await new Promise<TransportParams>((resolve) => {
					socketConnection.emit("createWebRtcTransport", {}, resolve);
				});

				const receiveTransport = device.createRecvTransport(params);

				receiveTransport.on("connect", async ({ dtlsParameters }, callback) => {
					socketConnection.emit(
						"connectTransport",
						{ dtlsParameters },
						callback,
					);
				});

				// Consume the media
				const { params: consumerParams } = await new Promise<ConsumerParams>(
					(resolve) => {
						socketConnection.emit(
							"consume",
							{
								producerSocketId,
								rtpCapabilities: device.rtpCapabilities,
							},
							resolve,
						);
					},
				);

				const consumer = await receiveTransport.consume(consumerParams);

				// Resume consumer
				await new Promise<void>((resolve) => {
					socketConnection.emit(
						"resume",
						{ producerId: consumerParams.producerId },
						resolve,
					);
				});

				// Add remote stream
				const stream = new MediaStream([consumer.track]);
				setRemoteStreams((prev) => [...prev, stream]);

				if (remoteVideoRef.current && remoteStreams.length === 0) {
					remoteVideoRef.current.srcObject = stream;
				}
			} catch (error) {
				console.error("Failed to consume media:", error);
			}
		},
		[device, remoteStreams.length],
	);

	const initializeMediasoup = useCallback(async () => {
		try {
			// Connect to Socket.IO server
			const socketConnection = io(
				process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
			);
			setSocket(socketConnection);

			socketConnection.on("connect", () => {
				setIsConnected(true);
				setStatus("Connected to server");
				initializeDevice(socketConnection);
			});

			socketConnection.on("disconnect", () => {
				setIsConnected(false);
				setStatus("Disconnected from server");
			});

			socketConnection.on("newProducer", async ({ producerId, socketId }) => {
				console.log("New producer available:", producerId, socketId);
				await consumeMedia(socketConnection, socketId);
			});

			socketConnection.on("producerClosed", ({ socketId }) => {
				console.log("Producer closed:", socketId);
				// Remove remote stream for this producer
				setRemoteStreams((prev) =>
					prev.filter((stream) => stream.id !== socketId),
				);
			});
		} catch (error) {
			console.error("Failed to initialize Mediasoup:", error);
			setStatus("Failed to connect to server");
		}
	}, [consumeMedia, initializeDevice]);

	useEffect(() => {
		initializeMediasoup();
		return cleanup;
	}, [cleanup, initializeMediasoup]);

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
							disabled={!device || isProducing}
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
						<p>Device Ready: {device ? "🟢 Yes" : "🔴 No"}</p>
						<p>Producing: {isProducing ? "🟢 Yes" : "🔴 No"}</p>
						<p>Remote Streams: {remoteStreams.length}</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
