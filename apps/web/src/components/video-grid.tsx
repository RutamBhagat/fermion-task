"use client";

import { MicOff, Users, VideoOff } from "lucide-react";
import { useRef } from "react";

interface RemoteParticipant {
	socketId: string;
	stream: MediaStream;
}

interface VideoGridProps {
	localStream: MediaStream | null;
	remoteParticipants: RemoteParticipant[];
	participantCount: number;
	gridClass: string;
	hlsPreviewMode?: boolean;
	hlsAspectRatio?: number;
	isMuted: boolean;
	isVideoOff: boolean;
	showEmptySlots?: boolean;
	emptySlotCount?: number;
}

export function VideoGrid({
	localStream,
	remoteParticipants,
	participantCount,
	gridClass,
	hlsPreviewMode = false,
	hlsAspectRatio,
	isMuted,
	isVideoOff,
	showEmptySlots = false,
	emptySlotCount = 0,
}: VideoGridProps) {
	const _localVideoRef = useRef<HTMLVideoElement>(null);
	const _remoteVideoRefs = useRef<{
		[socketId: string]: HTMLVideoElement | null;
	}>({});

	return (
		<div className={`grid h-full w-full gap-1 ${gridClass} p-2`}>
			<div className="relative overflow-hidden rounded-lg bg-gray-900">
				<video
					ref={(element) => {
						if (element && localStream) {
							element.srcObject = localStream;
						}
						_localVideoRef.current = element;
					}}
					autoPlay
					muted
					className="h-full w-full object-cover"
					style={
						hlsPreviewMode && hlsAspectRatio
							? { aspectRatio: hlsAspectRatio }
							: undefined
					}
					aria-label="Your video"
				>
					<track kind="captions" srcLang="en" label="English" />
				</video>

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

			{remoteParticipants.map((participant) => (
				<div
					key={participant.socketId}
					className="relative overflow-hidden rounded-lg bg-gray-900"
				>
					<video
						ref={(element) => {
							if (element) {
								element.srcObject = participant.stream;
								_remoteVideoRefs.current[participant.socketId] = element;
							}
						}}
						autoPlay
						className="h-full w-full object-cover"
						style={
							hlsPreviewMode && hlsAspectRatio
								? { aspectRatio: hlsAspectRatio }
								: undefined
						}
						aria-label={`Participant ${participant.socketId}`}
					>
						<track kind="captions" srcLang="en" label="English" />
					</video>
					<div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-medium text-white text-xs">
						{participant.socketId.slice(-6)}
					</div>
				</div>
			))}

			{showEmptySlots &&
				Array.from({ length: emptySlotCount }, (_, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: The empty slots are stateless, identical, and have no unique identifier other than their position. Using the index is safe and appropriate here.
						key={`empty-slot-${participantCount}-${index}`}
						className="flex items-center justify-end rounded-lg bg-gray-800/30"
					>
						<div className="text-center text-gray-400">
							<Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
							<p className="text-sm">Waiting for participants...</p>
						</div>
					</div>
				))}
		</div>
	);
}
