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
import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

interface TransportParams {
	params: {
		id: string;
		iceParameters: IceParameters;
		iceCandidates: IceCandidate[];
		dtlsParameters: DtlsParameters;
	};
}

interface RemoteParticipant {
	socketId: string;
	stream: MediaStream;
	consumers: Consumer[];
}

export function useWebRTC(roomId: string) {
	const [isProducing, setIsProducing] = useState(false);
	const [remoteParticipants, setRemoteParticipants] = useState<
		RemoteParticipant[]
	>([]);
	const [participantCount, setParticipantCount] = useState(1);

	const deviceRef = useRef<Device | null>(null);
	const producerTransportRef = useRef<Transport | null>(null);
	const consumerTransportRef = useRef<Transport | null>(null);
	const producersRef = useRef<Producer[]>([]);
	const consumersRef = useRef<Consumer[]>([]);

	const createRemoteParticipant = useCallback(
		(socketId: string, consumers: Consumer[]): RemoteParticipant => {
			const tracks = consumers.map((consumer) => consumer.track);
			const stream = new MediaStream(tracks);
			return { socketId, stream, consumers };
		},
		[],
	);

	const updateRemoteParticipants = useCallback(() => {
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
		setParticipantCount(participants.length + 1);
	}, [createRemoteParticipant]);

	const initializeDevice = useCallback(
		async (socket: Socket) => {
			const { rtpCapabilities } = await new Promise<{
				rtpCapabilities: RtpCapabilities;
			}>((resolve) => {
				socket.emit("getRtpCapabilities", { roomId }, resolve);
			});

			const device = new Device();
			await device.load({ routerRtpCapabilities: rtpCapabilities });
			deviceRef.current = device;

			return device;
		},
		[roomId],
	);

	const createConsumerTransport = useCallback(
		async (socket: Socket) => {
			if (!deviceRef.current || consumerTransportRef.current) return;

			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit(
					"createWebRtcTransport",
					{ type: "consumer", roomId },
					resolve,
				);
			});

			const consumerTransport = deviceRef.current.createRecvTransport(params);
			consumerTransportRef.current = consumerTransport;

			consumerTransport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit(
					"connectTransport",
					{
						transportId: consumerTransport.id,
						dtlsParameters,
						roomId,
					},
					callback,
				);
			});

			return consumerTransport;
		},
		[roomId],
	);

	const createConsumer = useCallback(
		async (socket: Socket, socketId: string) => {
			if (!deviceRef.current || !consumerTransportRef.current) return;

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
						rtpCapabilities: deviceRef.current?.rtpCapabilities,
						roomId,
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

				consumer.appData = {
					...consumer.appData,
					producerSocketId: socketId,
					roomId,
				};

				await new Promise<void>((resolve) => {
					socket.emit("resume", { consumerId: consumer.id, roomId }, resolve);
				});

				consumersRef.current.push(consumer);
			}

			updateRemoteParticipants();
		},
		[roomId, updateRemoteParticipants],
	);

	const startProducing = useCallback(
		async (socket: Socket, localStream: MediaStream) => {
			if (!deviceRef.current || !localStream) return;

			const { params } = await new Promise<TransportParams>((resolve) => {
				socket.emit(
					"createWebRtcTransport",
					{ type: "producer", roomId },
					resolve,
				);
			});

			const transport = deviceRef.current.createSendTransport(params);
			producerTransportRef.current = transport;

			transport.on("connect", async ({ dtlsParameters }, callback) => {
				socket.emit(
					"connectTransport",
					{
						transportId: transport.id,
						dtlsParameters,
						roomId,
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
							roomId,
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
			}
		},
		[roomId],
	);

	const handleNewProducer = useCallback(
		async (
			socket: Socket,
			{ socketId }: { producerId: string; socketId: string },
		) => {
			await createConsumer(socket, socketId);
		},
		[createConsumer],
	);

	const handleProducerClosed = useCallback(
		({ socketId }: { socketId: string }) => {
			const remainingConsumers = consumersRef.current.filter((consumer) => {
				if (consumer.appData?.producerSocketId === socketId) {
					consumer.close();
					return false;
				}
				return true;
			});
			consumersRef.current = remainingConsumers;
			updateRemoteParticipants();
		},
		[updateRemoteParticipants],
	);

	const cleanup = useCallback(() => {
		producersRef.current.forEach((producer) => producer.close());
		consumersRef.current.forEach((consumer) => consumer.close());

		if (producerTransportRef.current) {
			producerTransportRef.current.close();
			producerTransportRef.current = null;
		}

		if (consumerTransportRef.current) {
			consumerTransportRef.current.close();
			consumerTransportRef.current = null;
		}

		producersRef.current = [];
		consumersRef.current = [];
		setIsProducing(false);
		setRemoteParticipants([]);
		setParticipantCount(1);
	}, []);

	return {
		isProducing,
		remoteParticipants,
		participantCount,
		setParticipantCount,
		initializeDevice,
		createConsumerTransport,
		createConsumer,
		startProducing,
		handleNewProducer,
		handleProducerClosed,
		cleanup,
	};
}
