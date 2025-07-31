"use client";

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface TopBarProps {
	meetingId: string;
	participantCount: number;
	showControls: boolean;
	isHlsStreaming: boolean;
	hlsStartedByMe: boolean;
	onStopHls: () => void;
}

export function TopBar({
	meetingId,
	participantCount,
	showControls,
	isHlsStreaming,
	hlsStartedByMe,
	onStopHls,
}: TopBarProps) {
	return (
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
					{isHlsStreaming && hlsStartedByMe && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="destructive"
									size="sm"
									onClick={onStopHls}
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
	);
}
