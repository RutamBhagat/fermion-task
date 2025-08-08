"use client";

import {
  Copy,
  Loader2,
  Mic,
  MicOff,
  Phone,
  Share,
  Video,
  VideoOff,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ControlBarProps {
  isProducing: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isHlsStreaming: boolean;
  isStartingHls: boolean;
  status?: string;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onJoinCall: () => void;
  onLeaveCall: () => void;
  onStartHls: () => void;
  onStopHls: () => void;
}

export function ControlBar({
  isProducing,
  isMuted,
  isVideoOff,
  isHlsStreaming,
  isStartingHls,
  onToggleMute,
  onToggleVideo,
  onJoinCall,
  onLeaveCall,
  onStartHls,
  onStopHls,
}: ControlBarProps) {
  return (
    <div className="absolute right-0 bottom-0 left-0 z-20 bg-gradient-to-t from-black/50 to-transparent p-6 transition-opacity duration-300">
      <div className="flex items-center justify-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onToggleMute}
              size="lg"
              variant={isMuted ? "destructive" : "secondary"}
              className={cn(
                "h-12 w-12 rounded-full",
                isMuted
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-700 hover:bg-gray-600"
              )}
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onToggleVideo}
              size="lg"
              variant={isVideoOff ? "destructive" : "secondary"}
              className={cn(
                "h-12 w-12 rounded-full",
                isVideoOff
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-700 hover:bg-gray-600"
              )}
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

        {!isProducing ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onJoinCall}
                disabled={false}
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
                onClick={onLeaveCall}
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={isHlsStreaming ? onStopHls : onStartHls}
              disabled={isStartingHls}
              size="lg"
              variant={isHlsStreaming ? "destructive" : "secondary"}
              className={cn(
                "h-12 w-12 rounded-full",
                isHlsStreaming
                  ? "bg-red-600 hover:bg-red-700"
                  : isStartingHls
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-700 hover:bg-gray-600"
              )}
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
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Meeting link copied to clipboard!");
              }}
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
    </div>
  );
}
