"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useHLSPlayer } from "@/hooks/use-hls-player";

export default function WatchStreamPage() {
	const params = useParams();
	const streamId = params.streamId as string;
	const videoRef = useRef<HTMLVideoElement>(null);

	const { isHlsLoaded, loadStream } = useHLSPlayer(streamId);

	useEffect(() => {
		if (isHlsLoaded && streamId && videoRef.current) {
			loadStream(videoRef.current);
		}
	}, [isHlsLoaded, streamId, loadStream]);

	return (
		<div className="h-screen w-screen bg-black">
			<video
				ref={videoRef}
				autoPlay
				controls
				muted
				className="h-full w-full object-contain"
				style={{ backgroundColor: "black" }}
			>
				Your browser does not support the video tag.
			</video>
		</div>
	);
}
