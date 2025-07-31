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

import {
	Copy,
	Loader2,
	Mic,
	MicOff,
	Phone,
	Share,
	Users,
	Video,
	VideoOff,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

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
	const [hlsPreviewMode, _setHlsPreviewMode] = useState(false); // Toggle for HLS preview mode

	// Media controls state
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [showControls, setShowControls] = useState(true);

	// HLS streaming state
	const [_hlsUrl, setHlsUrl] = useState("");
	const [streamId, setStreamId] = useState("");
	const [isHlsStreaming, setIsHlsStreaming] = useState(false);
	const [isStartingHls, setIsStartingHls] = useState(false);
	const [hlsStartedByMe, setHlsStartedByMe] = useState(false);
	const hlsUrlRef = useRef<string>("");

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
						roomId: meetingId,
					};

					await new Promise<void>((resolve) => {
						socket.emit(
							"resume",
							{ consumerId: consumer.id, roomId: meetingId },
							resolve,
						);
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

				// HLS streaming event listeners
				socket.on("hlsStreamReady", (data: { streamId: string }) => {
					console.log("HLS stream ready:", data);
					setIsHlsStreaming(true);
					setIsStartingHls(false);

					// Auto-copy the watch page URL to clipboard using the stream ID
					const currentHlsUrl = hlsUrlRef.current;
					if (currentHlsUrl) {
						// Extract streamId from HLS URL (e.g., /hls/room_xxx_timestamp/stream.m3u8)
						const streamIdMatch = currentHlsUrl.match(
							/\/hls\/([^/]+)\/stream\.m3u8/,
						);
						if (streamIdMatch) {
							const streamId = streamIdMatch[1];
							const watchUrl = `${window.location.origin}/watch/${streamId}`;
							navigator.clipboard.writeText(watchUrl);
							toast.success(
								"HLS stream is ready! Watch link copied to clipboard.",
							);
						} else {
							toast.success("HLS stream is ready!");
						}
					} else {
						toast.success("HLS stream is ready!");
					}
				});

				socket.on(
					"hlsStreamFailed",
					(data: { streamId: string; error: string }) => {
						console.error("HLS stream failed:", data);
						setIsStartingHls(false);
						setIsHlsStreaming(false);
						toast.error(`HLS stream failed: ${data.error}`);
					},
				);
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
		toast.success("Meeting link copied to clipboard");
	};

	const leaveMeeting = () => {
		if (socketRef.current) {
			socketRef.current.emit("leaveRoom", { roomId: meetingId });
		}
		router.push("/");
	};

	const toggleMute = () => {
		if (localStreamRef.current) {
			const audioTrack = localStreamRef.current.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
				setIsMuted(!audioTrack.enabled);
				toast.success(audioTrack.enabled ? "Microphone on" : "Microphone off");
			}
		}
	};

	const toggleVideo = () => {
		if (localStreamRef.current) {
			const videoTrack = localStreamRef.current.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !videoTrack.enabled;
				setIsVideoOff(!videoTrack.enabled);
				toast.success(videoTrack.enabled ? "Camera on" : "Camera off");
			}
		}
	};

	const startHlsStream = async () => {
		const socket = socketRef.current;
		if (!socket || !isConnected) {
			toast.error("Not connected to meeting");
			return;
		}

		if (!isProducing) {
			toast.error("Please join the call first before starting HLS stream");
			return;
		}

		setIsStartingHls(true);
		toast.info("Starting HLS stream...");

		socket.emit(
			"startHLS",
			{ socketId: socket.id, roomId: meetingId },
			(response: { error?: string; hlsUrl?: string; streamId?: string }) => {
				if (response.error) {
					toast.error(`Error starting HLS: ${response.error}`);
					setIsStartingHls(false);
				} else {
					console.log("HLS streaming started:", response);
					toast.info("HLS stream created, waiting for segments...");

					// Store the stream details
					const url = response?.hlsUrl || "";
					setHlsUrl(url);
					setStreamId(response?.streamId || "");
					setHlsStartedByMe(true);
					hlsUrlRef.current = url;
				}
			},
		);
	};

	const stopHlsStream = () => {
		const socket = socketRef.current;
		if (!socket || !streamId) return;

		socket.emit(
			"stopHLS",
			{ streamId },
			(response: { error?: string; success?: boolean }) => {
				if (response.error) {
					toast.error(`Error stopping HLS: ${response.error}`);
				} else {
					setHlsUrl("");
					setStreamId("");
					setIsHlsStreaming(false);
					setIsStartingHls(false);
					setHlsStartedByMe(false);
					hlsUrlRef.current = "";
					toast.success("HLS streaming stopped");
				}
			},
		);
	};

	// Auto-hide controls after 3 seconds of inactivity
	useEffect(() => {
		let timeout: NodeJS.Timeout;

		const hideControls = () => {
			setShowControls(false);
		};

		const showControlsTemporary = () => {
			setShowControls(true);
			clearTimeout(timeout);
			timeout = setTimeout(hideControls, 3000);
		};

		const handleMouseMove = () => {
			showControlsTemporary();
		};

		document.addEventListener("mousemove", handleMouseMove);
		showControlsTemporary(); // Show controls initially

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			clearTimeout(timeout);
		};
	}, []);

	// Calculate grid layout based on participant count (comfortable view)
	const getGridLayout = (count: number) => {
		if (count <= 1) return "grid-cols-1";
		if (count <= 4) return "grid-cols-2";
		if (count <= 9) return "grid-cols-3";
		return "grid-cols-4";
	};

	// Calculate HLS-style grid layout (matches server logic exactly)
	const getHlsGridLayout = (count: number) => {
		let cols: number;
		let rows: number;
		if (count <= 2) {
			cols = 2;
			rows = 1; // 2x1 layout
		} else if (count <= 4) {
			cols = 2;
			rows = 2; // 2x2 layout
		} else if (count <= 6) {
			cols = 3;
			rows = 2; // 3x2 layout
		} else if (count <= 9) {
			cols = 3;
			rows = 3; // 3x3 layout
		} else {
			cols = 4;
			rows = Math.ceil(count / 4); // 4xN layout for larger groups
		}

		// Calculate video dimensions for 1080p grid (matches server exactly)
		const gridWidth = 1920;
		const gridHeight = 1080;
		const videoWidth = Math.floor(gridWidth / cols);
		const videoHeight = Math.floor(gridHeight / rows);

		return {
			cols,
			rows,
			totalSlots: cols * rows,
			videoWidth,
			videoHeight,
			aspectRatio: videoWidth / videoHeight,
			gridClass: `grid-cols-${cols}`,
		};
	};

	return (
		<div className="relative h-screen w-screen overflow-hidden bg-black">
			{/* Top Bar - Only visible when controls are shown */}
			<div
				className={`absolute top-0 right-0 left-0 z-20 bg-gradient-to-b from-black/50 to-transparent p-4 transition-opacity duration-300 ${
					showControls ? "opacity-100" : "opacity-0"
				}`}
			>
				<div className="flex items-center justify-between text-white">
					<div className="flex items-center gap-4">
						<h1 className="font-medium text-lg">{meetingId}</h1>
						<div className="flex items-center gap-2 text-gray-300 text-sm">
							<Users className="h-4 w-4" />
							<span>{participantCount}</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{/* Stop HLS button - only show for stream starter */}
						{isHlsStreaming && hlsStartedByMe && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="destructive"
										size="sm"
										onClick={stopHlsStream}
										className="bg-red-600 text-white hover:bg-red-700"
									>
										Stop HLS
									</Button>
								</TooltipTrigger>
								<TooltipContent>Stop HLS streaming</TooltipContent>
							</Tooltip>
						)}
					</div>
				</div>
			</div>

			{/* HLS Preview Banner */}
			{hlsPreviewMode && (
				<div className="absolute top-16 right-4 left-4 z-20 rounded-lg border border-blue-400 bg-blue-600/90 p-3 text-sm text-white backdrop-blur-sm">
					<div className="flex items-center gap-2">
						<span className="font-medium">📺 HLS Preview Mode:</span>
						<span>
							This is exactly how you'll appear in the final stream recording
						</span>
					</div>
				</div>
			)}

			{/* Main Video Grid - Full Screen */}
			<div
				className={`grid h-full w-full gap-1 ${
					hlsPreviewMode
						? getHlsGridLayout(participantCount).gridClass
						: getGridLayout(participantCount)
				} p-2`}
			>
				{/* Local Video */}
				<div className="relative overflow-hidden rounded-lg bg-gray-900">
					<video
						ref={localVideoRef}
						autoPlay
						muted
						className={
							hlsPreviewMode
								? "h-full w-full object-cover"
								: "h-full w-full object-cover"
						}
						style={
							hlsPreviewMode
								? {
										aspectRatio: getHlsGridLayout(participantCount).aspectRatio,
									}
								: undefined
						}
						aria-label="Your video"
					>
						<track kind="captions" srcLang="en" label="English" />
					</video>
					{/* Video overlay indicators */}
					<div className="absolute bottom-2 left-2 flex items-center gap-2">
						<div className="rounded bg-black/70 px-2 py-1 font-medium text-white text-xs">
							You
						</div>
						{isMuted && (
							<div className="rounded-full bg-red-600 p-1">
								<MicOff className="h-3 w-3 text-white" />
							</div>
						)}
					</div>
					{isVideoOff && (
						<div className="absolute inset-0 flex items-center justify-center bg-gray-800">
							<div className="text-center text-white">
								<VideoOff className="mx-auto mb-2 h-8 w-8" />
								<p className="text-sm">Camera is off</p>
							</div>
						</div>
					)}
				</div>

				{/* Remote Participants */}
				{remoteParticipants.map((participant) => {
					const participantSocketId = participant.socketId;
					const _participantStream = participant.stream;

					return (
						<div
							key={participantSocketId}
							className="relative overflow-hidden rounded-lg bg-gray-900"
						>
							<video
								ref={(videoElement) => {
									if (videoElement) {
										const _element = videoElement;
										_element.srcObject = _participantStream;
										_remoteVideoRefs.current[participantSocketId] = _element;
									}
								}}
								autoPlay
								className="h-full w-full object-cover"
								style={
									hlsPreviewMode
										? {
												aspectRatio:
													getHlsGridLayout(participantCount).aspectRatio,
											}
										: undefined
								}
								aria-label={`Participant ${participantSocketId}`}
							>
								<track kind="captions" srcLang="en" label="English" />
							</video>
							<div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-medium text-white text-xs">
								{participantSocketId.slice(-6)}
							</div>
						</div>
					);
				})}

				{/* Empty slots for better visual balance - only show when not many participants */}
				{participantCount <= 2 &&
					Array.from(
						{ length: Math.max(0, 2 - participantCount) },
						(_, index) => index,
					).map((emptySlot) => (
						<div
							key={`empty-slot-${participantCount}-${emptySlot}`}
							className="flex items-center justify-end rounded-lg bg-gray-800/30"
						>
							<div className="text-center text-gray-400">
								<Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
								<p className="text-sm">Waiting for participants...</p>
							</div>
						</div>
					))}
			</div>

			{/* Bottom Control Bar - Google Meet Style */}
			<div
				className={`absolute right-0 bottom-0 left-0 z-20 bg-gradient-to-t from-black/50 to-transparent p-6 transition-opacity duration-300 ${
					showControls ? "opacity-100" : "opacity-0"
				}`}
			>
				<div className="flex items-center justify-center gap-4">
					{/* Mic Control */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={toggleMute}
								size="lg"
								variant={isMuted ? "destructive" : "secondary"}
								className={`h-12 w-12 rounded-full ${
									isMuted
										? "bg-red-600 hover:bg-red-700"
										: "bg-gray-700 hover:bg-gray-600"
								}`}
							>
								{isMuted ? (
									<MicOff className="h-5 w-5" />
								) : (
									<Mic className="h-5 w-5" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
					</Tooltip>

					{/* Video Control */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={toggleVideo}
								size="lg"
								variant={isVideoOff ? "destructive" : "secondary"}
								className={`h-12 w-12 rounded-full ${
									isVideoOff
										? "bg-red-600 hover:bg-red-700"
										: "bg-gray-700 hover:bg-gray-600"
								}`}
							>
								{isVideoOff ? (
									<VideoOff className="h-5 w-5" />
								) : (
									<Video className="h-5 w-5" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{isVideoOff ? "Turn on camera" : "Turn off camera"}
						</TooltipContent>
					</Tooltip>

					{/* Join/Leave Call Button */}
					{!isProducing ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={startProducing}
									disabled={!deviceRef.current}
									size="lg"
									className="h-12 rounded-full bg-green-600 px-6 text-white hover:bg-green-700"
								>
									Join Call
								</Button>
							</TooltipTrigger>
							<TooltipContent>Join the meeting</TooltipContent>
						</Tooltip>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={leaveMeeting}
									size="lg"
									variant="destructive"
									className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700"
								>
									<Phone className="h-5 w-5 rotate-[135deg]" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Leave call</TooltipContent>
						</Tooltip>
					)}

					{/* HLS Share */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={isHlsStreaming ? stopHlsStream : startHlsStream}
								disabled={isStartingHls}
								size="lg"
								variant={isHlsStreaming ? "destructive" : "secondary"}
								className={`h-12 w-12 rounded-full ${
									isHlsStreaming
										? "bg-red-600 hover:bg-red-700"
										: isStartingHls
											? "bg-blue-600 hover:bg-blue-700"
											: "bg-gray-700 hover:bg-gray-600"
								}`}
							>
								{isStartingHls ? (
									<Loader2 className="h-5 w-5 animate-spin" />
								) : (
									<Share className="h-5 w-5" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{isStartingHls
								? "Starting HLS stream..."
								: isHlsStreaming
									? "Stop HLS stream"
									: "Start HLS stream"}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={copyMeetingLink}
								size="lg"
								variant="secondary"
								className="h-12 w-12 rounded-full bg-gray-700 hover:bg-gray-600"
							>
								<Copy className="h-5 w-5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Copy meeting link</TooltipContent>
					</Tooltip>
				</div>

				{/* Status indicator - only shown when not connected/producing */}
				{(!isConnected || !isProducing) && (
					<div className="mt-2 text-center">
						<p className="text-sm text-white">{status}</p>
					</div>
				)}
			</div>
		</div>
	);
}
