"use client";

import { Device } from "mediasoup-client";
import type {
	Consumer,
	DtlsParameters,
	IceCandidate,
	IceParameters,
	Producer,
	RtpCapabilities,
	RtpParameters,
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

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HLSControls } from "../../stream/hls-controls";

interface RemoteParticipant {
	socketId: string;
	stream: MediaStream;
	consumers: Consumer[];
}

export default function RoomPage() {
	const router = useRouter();
	const params = useParams();
	const meetingId = params.meetingId as string;

	const [isConnected, setIsConnected] = useState(false);
	const [isProducing, setIsProducing] = useState(false);
	const [status, setStatus] = useState("Connecting to meeting...");
	const [remoteParticipants, setRemoteParticipants] = useState<
		RemoteParticipant[]
	>([]);
	const [participantCount, setParticipantCount] = useState(1); // Include self

	const localVideoRef = useRef<HTMLVideoElement>(null);
	const _remoteVideoRefs = useRef<{
		[socketId: string]: HTMLVideoElement | null;
	}>({});
	const localStreamRef = useRef<MediaStream | null>(null);
	const socketRef = useRef<Socket | null>(null);
	const deviceRef = useRef<Device | null>(null);
	const producerTransportRef = useRef<Transport | null>(null);
	const consumerTransportRef = useRef<Transport | null>(null);
	const producersRef = useRef<Producer[]>([]);
	const consumersRef = useRef<Consumer[]>([]);

	// Helper functions
	const createRemoteParticipant = useCallback(
		(socketId: string, consumers: Consumer[]): RemoteParticipant => {
			const tracks = consumers.map((consumer) => consumer.track);
			const stream = new MediaStream(tracks);

			return {
				socketId,
				stream,
				consumers,
			};
		},
		[],
	);

	const updateRemoteParticipants = useCallback(() => {
		// Group consumers by socket ID
		const participantMap = new Map<string, Consumer[]>();

		consumersRef.current.forEach((consumer) => {
			const socketId = consumer.appData?.producerSocketId as string;
			if (socketId) {
				if (!participantMap.has(socketId)) {
					participantMap.set(socketId, []);
				}
				participantMap.get(socketId)?.push(consumer);
			}
		});

		const participants: RemoteParticipant[] = [];
		participantMap.forEach((consumers, socketId) => {
			participants.push(createRemoteParticipant(socketId, consumers));
		});

		setRemoteParticipants(participants);
		setParticipantCount(participants.length + 1); // +1 for local participant
	}, [createRemoteParticipant]);

	const createConsumerTransport = useCallback(async () => {
		const socket = socketRef.current;
		const device = deviceRef.current;

		if (!socket || !device || consumerTransportRef.current) return;

		try {
			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit(
					"createWebRtcTransport",
					{ type: "consumer", roomId: meetingId },
					resolve,
				);
			});

			const consumerTransport = device.createRecvTransport(params);
			consumerTransportRef.current = consumerTransport;

			consumerTransport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit(
					"connectTransport",
					{
						transportId: consumerTransport.id,
						dtlsParameters,
						roomId: meetingId,
					},
					callback,
				);
			});

			console.log("Consumer transport created for room:", meetingId);
		} catch (error) {
			console.error("Failed to create consumer transport:", error);
		}
	}, [meetingId]);

	const createConsumer = useCallback(
		async (_producerId: string, socketId: string) => {
			const socket = socketRef.current;
			const device = deviceRef.current;

			if (!socket || !device || !consumerTransportRef.current) return;

			try {
				const { params: consumerParamsArray } = await new Promise<{
					params: Array<{
						id: string;
						producerId: string;
						kind: "audio" | "video";
						rtpParameters: RtpParameters;
					}>;
				}>((resolve) => {
					socket.emit(
						"consume",
						{
							producerSocketId: socketId,
							rtpCapabilities: device.rtpCapabilities,
							roomId: meetingId,
						},
						resolve,
					);
				});

				for (const consumerParams of consumerParamsArray) {
					const consumer = await consumerTransportRef.current.consume({
						id: consumerParams.id,
						producerId: consumerParams.producerId,
						kind: consumerParams.kind,
						rtpParameters: consumerParams.rtpParameters,
					});

					// Set appData for participant tracking
					consumer.appData = {
						...consumer.appData,
						producerSocketId: socketId,
					};

					await new Promise<void>((resolve) => {
						socket.emit("resume", { consumerId: consumer.id }, resolve);
					});

					consumersRef.current.push(consumer);

					console.log(
						"Consumer created for room:",
						meetingId,
						"consumer:",
						consumer.id,
						"producer:",
						consumerParams.producerId,
						"kind:",
						consumerParams.kind,
						"from:",
						socketId,
					);
				}

				updateRemoteParticipants();
			} catch (error) {
				console.error("Failed to create consumer:", error);
			}
		},
		[meetingId, updateRemoteParticipants],
	);

	useEffect(() => {
		let mounted = true;

		const initializeConnection = async () => {
			try {
				const socket = io(
					process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
				);
				socketRef.current = socket;

				// Join the specific room
				socket.emit("joinRoom", { roomId: meetingId });

				socket.on("connect", async () => {
					if (!mounted) return;
					setIsConnected(true);
					setStatus(`Connected to meeting: ${meetingId}`);

					try {
						const { rtpCapabilities } = await new Promise<{
							rtpCapabilities: RtpCapabilities;
						}>((resolve) => {
							socket.emit("getRtpCapabilities", { roomId: meetingId }, resolve);
						});

						const device = new Device();
						await device.load({ routerRtpCapabilities: rtpCapabilities });
						deviceRef.current = device;

						const stream = await navigator.mediaDevices.getUserMedia({
							video: true,
							audio: true,
						});

						localStreamRef.current = stream;
						if (localVideoRef.current && mounted) {
							localVideoRef.current.srcObject = stream;
						}

						setStatus(`Ready to stream in meeting: ${meetingId}`);

						await createConsumerTransport();

						const existingProducers = await new Promise<
							Array<{ producerId: string; socketId: string }>
						>((resolve) => {
							socket.emit("getProducers", { roomId: meetingId }, resolve);
						});

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
					setStatus("Disconnected from meeting");
				});

				socket.on("newProducer", async ({ producerId, socketId }) => {
					console.log(
						"New producer in room:",
						meetingId,
						"producer:",
						producerId,
						"from:",
						socketId,
					);
					await createConsumer(producerId, socketId);
				});

				socket.on("producerClosed", ({ socketId }) => {
					console.log("Producer closed in room:", meetingId, "from:", socketId);

					// Remove consumers for this socket
					const remainingConsumers = consumersRef.current.filter((consumer) => {
						if (consumer.appData?.producerSocketId === socketId) {
							consumer.close();
							return false;
						}
						return true;
					});
					consumersRef.current = remainingConsumers;

					updateRemoteParticipants();
				});

				socket.on("roomParticipantCount", ({ count }) => {
					setParticipantCount(count);
				});
			} catch (error) {
				console.error("Failed to connect:", error);
				setStatus("Failed to connect to meeting");
			}
		};

		initializeConnection();

		return () => {
			mounted = false;
			if (localStreamRef.current) {
				localStreamRef.current.getTracks().forEach((track) => track.stop());
			}
			if (socketRef.current) {
				socketRef.current.emit("leaveRoom", { roomId: meetingId });
				socketRef.current.disconnect();
			}
			if (producerTransportRef.current) {
				producerTransportRef.current.close();
			}
			if (consumerTransportRef.current) {
				consumerTransportRef.current.close();
			}
		};
	}, [
		meetingId,
		createConsumer,
		createConsumerTransport,
		updateRemoteParticipants,
	]);

	const startProducing = async () => {
		const socket = socketRef.current;
		const device = deviceRef.current;
		const localStream = localStreamRef.current;

		if (!socket || !device || !localStream) return;

		try {
			setStatus("Starting stream...");

			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit(
					"createWebRtcTransport",
					{ type: "producer", roomId: meetingId },
					resolve,
				);
			});

			const transport = device.createSendTransport(params);
			producerTransportRef.current = transport;

			transport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit(
					"connectTransport",
					{
						transportId: transport.id,
						dtlsParameters,
						roomId: meetingId,
					},
					callback,
				);
			});

			transport.on("produce", async (parameters, callback) => {
				const { id } = await new Promise<{ id: string }>((resolve) => {
					socket.emit(
						"produce",
						{
							kind: parameters.kind,
							rtpParameters: parameters.rtpParameters,
							roomId: meetingId,
						},
						resolve,
					);
				});
				callback({ id });
			});

			const videoTrack = localStream.getVideoTracks()[0];
			if (videoTrack) {
				const videoProducer = await transport.produce({ track: videoTrack });
				producersRef.current.push(videoProducer);
			}

			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack) {
				const audioProducer = await transport.produce({ track: audioTrack });
				producersRef.current.push(audioProducer);
			}

			if (producersRef.current.length > 0) {
				setIsProducing(true);
				setStatus(`Streaming in meeting: ${meetingId}`);
			}
		} catch (error) {
			console.error("Failed to start producing:", error);
			setStatus("Failed to start streaming");
		}
	};

	const copyMeetingLink = () => {
		const meetingUrl = `${window.location.origin}/room/${meetingId}`;
		navigator.clipboard.writeText(meetingUrl);
		// Could add a toast notification here
	};

	const leaveMeeting = () => {
		if (socketRef.current) {
			socketRef.current.emit("leaveRoom", { roomId: meetingId });
		}
		router.push("/");
	};

	// Calculate grid layout based on participant count
	const getGridLayout = (count: number) => {
		if (count <= 1) return "grid-cols-1";
		if (count <= 4) return "grid-cols-2";
		if (count <= 9) return "grid-cols-3";
		return "grid-cols-4";
	};

	return (
		<div className="container mx-auto space-y-4 p-4">
			{/* Meeting Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-2xl">Meeting: {meetingId}</h1>
					<p className="text-muted-foreground text-sm">{status}</p>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-sm">
						{participantCount} participant{participantCount !== 1 ? "s" : ""}
					</span>
					<Button variant="outline" size="sm" onClick={copyMeetingLink}>
						Copy Link
					</Button>
					<Button variant="destructive" size="sm" onClick={leaveMeeting}>
						Leave
					</Button>
				</div>
			</div>

			{/* Video Grid */}
			<div
				className={`grid gap-4 ${getGridLayout(participantCount)} min-h-[60vh] auto-rows-fr`}
			>
				{/* Local Video */}
				<Card className="relative">
					<CardContent className="p-2">
						<div className="relative">
							<video
								ref={localVideoRef}
								autoPlay
								muted
								className="aspect-video w-full rounded-lg bg-gray-900"
								aria-label="Your video"
							>
								<track kind="captions" srcLang="en" label="English" />
							</video>
							<div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-white text-xs">
								You
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Remote Participants */}
				{remoteParticipants.map((participant) => {
					const participantSocketId = participant.socketId;
					const _participantStream = participant.stream;

					return (
						<Card key={participantSocketId} className="relative">
							<CardContent className="p-2">
								<div className="relative">
									<video
										ref={(videoElement) => {
											// biome-ignore lint/style/noParameterAssign: React ref callback pattern
											if (videoElement) {
												// biome-ignore lint/style/noParameterAssign: React ref callback pattern
												const _element = videoElement;
												_element.srcObject = _participantStream;
												_remoteVideoRefs.current[participantSocketId] =
													_element;
											}
										}}
										autoPlay
										className="aspect-video w-full rounded-lg bg-gray-900"
										aria-label={`Participant ${participantSocketId}`}
									>
										<track kind="captions" srcLang="en" label="English" />
									</video>
									<div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-white text-xs">
										{participantSocketId.slice(-6)}
									</div>
								</div>
							</CardContent>
						</Card>
					);
				})}

				{/* Empty slots for better visual balance */}
				{participantCount < 4 &&
					Array.from({ length: 4 - participantCount }, (_, index) => index).map(
						(emptySlot) => (
							<Card
								key={`empty-slot-${participantCount}-${emptySlot}`}
								className="opacity-30"
							>
								<CardContent className="p-2">
									<div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-800">
										<span className="text-gray-400 text-sm">
											Waiting for participants...
										</span>
									</div>
								</CardContent>
							</Card>
						),
					)}
			</div>

			{/* Controls */}
			<Card>
				<CardHeader>
					<CardTitle>Meeting Controls</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex gap-4">
						<Button
							onClick={startProducing}
							disabled={!deviceRef.current || isProducing}
							className="flex-1"
						>
							{isProducing ? "Camera On" : "Join with Camera"}
						</Button>
					</div>

					<div className="text-muted-foreground text-sm">
						<p>
							Connection: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
						</p>
						<p>Device Ready: {deviceRef.current ? "🟢 Yes" : "🔴 No"}</p>
						<p>
							Streaming: {isProducing ? "🟢 Yes" : "🔴 No"} (
							{producersRef.current.length} tracks)
						</p>
						<p>Participants: {participantCount}</p>
						<p>Remote Streams: {remoteParticipants.length}</p>
					</div>
				</CardContent>
			</Card>

			{/* HLS Controls */}
			<HLSControls
				socket={socketRef.current}
				isConnected={isConnected}
				roomId={meetingId}
			/>
		</div>
	);
}
