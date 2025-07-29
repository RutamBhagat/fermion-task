"use client";

import { Device } from "mediasoup-client";
import type {
	Consumer,
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
	const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);

	const localVideoRef = useRef<HTMLVideoElement>(null);
	const remoteVideoRef = useRef<HTMLVideoElement>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const socketRef = useRef<Socket | null>(null);
	const deviceRef = useRef<Device | null>(null);
	const producerTransportRef = useRef<Transport | null>(null);
	const consumerTransportRef = useRef<Transport | null>(null);
	const producersRef = useRef<Producer[]>([]);
	const consumersRef = useRef<Consumer[]>([]);

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
						
						// Create consumer transport immediately after device setup
						await createConsumerTransport();

						// Get existing producers
						const existingProducers = await new Promise<
							Array<{ producerId: string; socketId: string }>
						>((resolve) => {
							socket.emit("getProducers", resolve);
						});

						// Consume existing producers
						for (const { producerId, socketId } of existingProducers) {
							await createConsumer(producerId, socketId);
						}
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
					await createConsumer(producerId, socketId);
				});

				socket.on("producerClosed", ({ socketId }) => {
					console.log("Producer closed:", socketId);
					// Remove consumers associated with this producer
					const remainingConsumers = consumersRef.current.filter(consumer => {
						// Remove consumer if it belongs to the closed producer
						if (consumer.producerId.includes(socketId)) {
							consumer.close();
							return false;
						}
						return true;
					});
					consumersRef.current = remainingConsumers;
					
					// Update remote streams
					setRemoteStreams(prev => 
						prev.filter((_, index) => index < remainingConsumers.length)
					);
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
			if (producerTransportRef.current) {
				producerTransportRef.current.close();
			}
			if (consumerTransportRef.current) {
				consumerTransportRef.current.close();
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

			// Create producer transport
			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit("createWebRtcTransport", { type: 'producer' }, resolve);
			});

			const transport = device.createSendTransport(params);
			producerTransportRef.current = transport;

			transport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit("connectTransport", { 
					transportId: transport.id,
					dtlsParameters 
				}, callback);
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
				const videoProducer = await transport.produce({ track: videoTrack });
				producersRef.current.push(videoProducer);
			}

			// Produce audio
			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack) {
				const audioProducer = await transport.produce({ track: audioTrack });
				producersRef.current.push(audioProducer);
			}

			if (producersRef.current.length > 0) {
				setIsProducing(true);
				setStatus("Streaming video and audio");
			}
		} catch (error) {
			console.error("Failed to start producing:", error);
			setStatus("Failed to start streaming");
		}
	};

	const createConsumerTransport = async () => {
		const socket = socketRef.current;
		const device = deviceRef.current;

		if (!socket || !device || consumerTransportRef.current) return;

		try {
			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit("createWebRtcTransport", { type: 'consumer' }, resolve);
			});

			const consumerTransport = device.createRecvTransport(params);
			consumerTransportRef.current = consumerTransport;

			consumerTransport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit("connectTransport", { 
					transportId: consumerTransport.id,
					dtlsParameters 
				}, callback);
			});

			console.log("Consumer transport created");
		} catch (error) {
			console.error("Failed to create consumer transport:", error);
		}
	};

	const createConsumer = async (producerId: string, socketId: string) => {
		const socket = socketRef.current;
		const device = deviceRef.current;

		if (!socket || !device || !consumerTransportRef.current) return;

		try {
			// Create consumer
			const { params: consumerParams } = await new Promise<{
				params: {
					id: string;
					producerId: string;
					kind: "audio" | "video";
					rtpParameters: any;
				};
			}>((resolve) => {
				socket.emit(
					"consume",
					{
						producerSocketId: socketId,
						rtpCapabilities: device.rtpCapabilities,
					},
					resolve,
				);
			});

			const consumer = await consumerTransportRef.current.consume({
				id: consumerParams.id,
				producerId: consumerParams.producerId,
				kind: consumerParams.kind,
				rtpParameters: consumerParams.rtpParameters,
			});

			// Resume consumer
			await new Promise<void>((resolve) => {
				socket.emit("resume", { consumerId: consumer.id }, resolve);
			});

			// Add consumer to list
			consumersRef.current.push(consumer);

			// Update or create media stream
			updateRemoteStream();

			console.log("Consumer created:", consumer.id, "for producer:", producerId, "kind:", consumerParams.kind);
		} catch (error) {
			console.error("Failed to create consumer:", error);
		}
	};

	const updateRemoteStream = () => {
		if (consumersRef.current.length === 0) return;

		// Combine all consumer tracks into one stream
		const tracks = consumersRef.current.map(consumer => consumer.track);
		const combinedStream = new MediaStream(tracks);

		setRemoteStreams([combinedStream]);

		// Display in remote video element
		if (remoteVideoRef.current) {
			remoteVideoRef.current.srcObject = combinedStream;
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
						{remoteStreams.length > 0 ? (
							/* biome-ignore lint/a11y/useMediaCaption: Live video streams don't have captions */
							<video
								ref={remoteVideoRef}
								autoPlay
								className="aspect-video w-full rounded-lg bg-gray-900"
								aria-label="Remote video stream"
							/>
						) : (
							<div className="aspect-video w-full rounded-lg bg-gray-900 flex items-center justify-center text-gray-400">
								<p>Waiting for remote stream...</p>
							</div>
						)}
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
						<p>Producing: {isProducing ? "🟢 Yes" : "🔴 No"} ({producersRef.current.length} tracks)</p>
						<p>Consumer Transport: {consumerTransportRef.current ? "🟢 Ready" : "🔴 Not Ready"}</p>
						<p>Remote Streams: {remoteStreams.length}</p>
						<p>Active Consumers: {consumersRef.current.length}</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
