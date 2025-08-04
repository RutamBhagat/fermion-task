"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useMediaDevices() {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      console.log("Media stream obtained.");
      return stream;
    } catch (error) {
      console.error("Failed to get media stream:", error);
      return null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, []);

  const stopMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      console.log("Media stream stopped.");
    }
  }, []);

  useEffect(() => {
    return () => {
      stopMedia();
    };
  }, [stopMedia]);

  return {
    localStream: localStreamRef.current,
    isMuted,
    isVideoOff,
    getMedia,
    toggleMute,
    toggleVideo,
  };
}
