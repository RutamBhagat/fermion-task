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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
	Mic, 
	MicOff, 
	Video, 
	VideoOff, 
	Phone, 
	ScreenShare, 
	MoreVertical,
	Copy,
	Settings,
	Users
} from "lucide-react";
import { toast } from "sonner";
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
	const [hlsPreviewMode, setHlsPreviewMode] = useState(false); // Toggle for HLS preview mode
	
	// Media controls state
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [showControls, setShowControls] = useState(true);

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
						socket.emit("resume", { consumerId: consumer.id, roomId: meetingId }, resolve);
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

		document.addEventListener('mousemove', handleMouseMove);
		showControlsTemporary(); // Show controls initially

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
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
		let cols: number, rows: number;
		if (count <= 2) {
			cols = 2; rows = 1; // 2x1 layout
		} else if (count <= 4) {
			cols = 2; rows = 2; // 2x2 layout
		} else if (count <= 6) {
			cols = 3; rows = 2; // 3x2 layout
		} else if (count <= 9) {
			cols = 3; rows = 3; // 3x3 layout
		} else {
			cols = 4; rows = Math.ceil(count / 4); // 4xN layout for larger groups
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
		<div className="relative h-screen w-screen bg-black overflow-hidden">
			{/* Top Bar - Only visible when controls are shown */}
			<div className={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/50 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
				<div className="flex items-center justify-between text-white">
					<div className="flex items-center gap-4">
						<h1 className="font-medium text-lg">{meetingId}</h1>
						<div className="flex items-center gap-2 text-sm text-gray-300">
							<Users className="h-4 w-4" />
							<span>{participantCount}</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button 
									variant="ghost" 
									size="sm" 
									onClick={() => setHlsPreviewMode(!hlsPreviewMode)}
									className="text-white hover:bg-white/20"
								>
									{hlsPreviewMode ? "📺" : "👁️"}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{hlsPreviewMode ? "Switch to comfortable view" : "Preview HLS layout"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button 
									variant="ghost" 
									size="sm" 
									onClick={copyMeetingLink}
									className="text-white hover:bg-white/20"
								>
									<Copy className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy meeting link</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button 
									variant="ghost" 
									size="sm"
									className="text-white hover:bg-white/20"
								>
									<Settings className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Settings</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>

			{/* HLS Preview Banner */}
			{hlsPreviewMode && (
				<div className="absolute top-16 left-4 right-4 z-20 bg-blue-600/90 backdrop-blur-sm border border-blue-400 rounded-lg p-3 text-white text-sm">
					<div className="flex items-center gap-2">
						<span className="font-medium">📺 HLS Preview Mode:</span>
						<span>This is exactly how you'll appear in the final stream recording</span>
					</div>
				</div>
			)}

			{/* Main Video Grid - Full Screen */}
			<div
				className={`h-full w-full grid gap-1 ${
					hlsPreviewMode 
						? getHlsGridLayout(participantCount).gridClass 
						: getGridLayout(participantCount)
				} p-2`}
			>
				{/* Local Video */}
				<div className="relative bg-gray-900 rounded-lg overflow-hidden">
					<video
						ref={localVideoRef}
						autoPlay
						muted
						className={
							hlsPreviewMode 
								? "w-full h-full object-cover"
								: "w-full h-full object-cover"
						}
						style={
							hlsPreviewMode 
								? { aspectRatio: getHlsGridLayout(participantCount).aspectRatio }
								: undefined
						}
						aria-label="Your video"
					>
						<track kind="captions" srcLang="en" label="English" />
					</video>
					{/* Video overlay indicators */}
					<div className="absolute bottom-2 left-2 flex items-center gap-2">
						<div className="rounded bg-black/70 px-2 py-1 text-white text-xs font-medium">
							You
						</div>
						{isMuted && (
							<div className="rounded-full bg-red-600 p-1">
								<MicOff className="h-3 w-3 text-white" />
							</div>
						)}
					</div>
					{isVideoOff && (
						<div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
							<div className="text-center text-white">
								<VideoOff className="h-8 w-8 mx-auto mb-2" />
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
						<div key={participantSocketId} className="relative bg-gray-900 rounded-lg overflow-hidden">
							<video
								ref={(videoElement) => {
									if (videoElement) {
										const _element = videoElement;
										_element.srcObject = _participantStream;
										_remoteVideoRefs.current[participantSocketId] = _element;
									}
								}}
								autoPlay
								className="w-full h-full object-cover"
								style={
									hlsPreviewMode 
										? { aspectRatio: getHlsGridLayout(participantCount).aspectRatio }
										: undefined
								}
								aria-label={`Participant ${participantSocketId}`}
							>
								<track kind="captions" srcLang="en" label="English" />
							</video>
							<div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-white text-xs font-medium">
								{participantSocketId.slice(-6)}
							</div>
						</div>
					);
				})}

				{/* Empty slots for better visual balance - only show when not many participants */}
				{participantCount <= 2 &&
					Array.from({ length: Math.max(0, 2 - participantCount) }, (_, index) => index).map(
						(emptySlot) => (
							<div
								key={`empty-slot-${participantCount}-${emptySlot}`}
								className="bg-gray-800/30 rounded-lg flex items-center justify-center"
							>
								<div className="text-center text-gray-400">
									<Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
									<p className="text-sm">Waiting for participants...</p>
								</div>
							</div>
						),
					)}
			</div>

			{/* Bottom Control Bar - Google Meet Style */}
			<div className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/50 to-transparent p-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
				<div className="flex items-center justify-center gap-4">
					{/* Mic Control */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={toggleMute}
								size="lg"
								variant={isMuted ? "destructive" : "secondary"}
								className={`h-12 w-12 rounded-full ${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
							>
								{isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
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
								className={`h-12 w-12 rounded-full ${isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
							>
								{isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{isVideoOff ? "Turn on camera" : "Turn off camera"}</TooltipContent>
					</Tooltip>

					{/* Join/Leave Call Button */}
					{!isProducing ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={startProducing}
									disabled={!deviceRef.current}
									size="lg"
									className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white rounded-full"
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

					{/* Screen Share */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="lg"
								variant="secondary"
								className="h-12 w-12 rounded-full bg-gray-700 hover:bg-gray-600"
							>
								<ScreenShare className="h-5 w-5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Share screen</TooltipContent>
					</Tooltip>

					{/* More Options */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="lg"
								variant="secondary"
								className="h-12 w-12 rounded-full bg-gray-700 hover:bg-gray-600"
							>
								<MoreVertical className="h-5 w-5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>More options</TooltipContent>
					</Tooltip>
				</div>
				
				{/* Status indicator - only shown when not connected/producing */}
				{(!isConnected || !isProducing) && (
					<div className="text-center mt-2">
						<p className="text-white text-sm">{status}</p>
					</div>
				)}
			</div>

			{/* Hidden HLS Controls - can be toggled via settings */}
			<div className="hidden">
				<HLSControls
					socket={socketRef.current}
					isConnected={isConnected}
					roomId={meetingId}
				/>
			</div>
		</div>
	);
}
