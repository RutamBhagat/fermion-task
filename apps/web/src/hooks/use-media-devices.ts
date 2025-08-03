"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type MediaAccessLevel = "full" | "audio-only" | "none";

export function useMediaDevices() {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [mediaAccessLevel, setMediaAccessLevel] =
    useState<MediaAccessLevel>("none");
  const [canEnableVideo, setCanEnableVideo] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const getMedia = useCallback(async () => {
    try {
      // First, try to get both audio and video
      console.log("Attempting to get full media access (audio + video)...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = stream;
      setHasPermissions(true);
      setMediaAccessLevel("full");
      setCanEnableVideo(true);

      // Check if video track is actually working
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || !videoTrack.enabled) {
        setIsVideoOff(true);
      }

      toast.success("Camera and microphone ready");
      return stream;
    } catch (error) {
      console.log(
        "Full media access failed, trying audio-only fallback...",
        error,
      );

      try {
        // Fallback to audio-only
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });

        localStreamRef.current = audioStream;
        setHasPermissions(true);
        setMediaAccessLevel("audio-only");
        setIsVideoOff(true);
        setCanEnableVideo(false);

        toast.info("Joined with microphone only - camera not available");
        return audioStream;
      } catch (audioError) {
        console.log(
          "Audio-only access failed, allowing no-media join...",
          audioError,
        );

        // Allow joining without any media
        setHasPermissions(true);
        setMediaAccessLevel("none");
        setIsMuted(true);
        setIsVideoOff(true);
        setCanEnableVideo(false);

        toast.warning(
          "Joined without camera or microphone - you can enable them later",
        );
        return null;
      }
    }
  }, []);

  const enableAudio = useCallback(async () => {
    try {
      console.log("Attempting to enable audio...");

      if (mediaAccessLevel === "none") {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });

        localStreamRef.current = audioStream;
        setMediaAccessLevel("audio-only");
        setIsMuted(false);
        toast.success("Microphone enabled!");
        return true;
      }
      if (
        localStreamRef.current &&
        !localStreamRef.current.getAudioTracks().length
      ) {
        // Add audio to existing video stream
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });

        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          localStreamRef.current.addTrack(audioTrack);
          setIsMuted(false);
          if (mediaAccessLevel !== "full") {
            setMediaAccessLevel("full");
          }
          toast.success("Microphone enabled!");
          return true;
        }
      }
    } catch (error) {
      console.error("Failed to enable audio:", error);
      toast.error(
        "Unable to access microphone. Please check permissions and try again.",
      );
      return false;
    }
    return false;
  }, [mediaAccessLevel]);

  const toggleMute = useCallback(async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        toast.success(audioTrack.enabled ? "Microphone on" : "Microphone off");
      } else if (mediaAccessLevel === "none") {
        // No audio track, try to enable audio
        await enableAudio();
      }
    } else if (mediaAccessLevel === "none") {
      // No stream at all, try to get audio
      await enableAudio();
    }
  }, [mediaAccessLevel, enableAudio]);

  const enableVideo = useCallback(async () => {
    try {
      console.log("Attempting to enable video...");

      if (mediaAccessLevel === "audio-only" && localStreamRef.current) {
        // We have audio, try to add video to existing stream
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          // Add video track to existing stream
          localStreamRef.current.addTrack(videoTrack);
          setIsVideoOff(false);
          setMediaAccessLevel("full");
          setCanEnableVideo(true);
          toast.success("Camera enabled!");
          return true;
        }
      } else if (mediaAccessLevel === "none") {
        // No media at all, try to get video + audio
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

          localStreamRef.current = stream;
          setMediaAccessLevel("full");
          setCanEnableVideo(true);
          setIsVideoOff(false);
          setIsMuted(false);
          toast.success("Camera and microphone enabled!");
          return true;
        } catch {
          // Fallback to video only
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });

          localStreamRef.current = videoStream;
          setMediaAccessLevel("audio-only"); // We only have video, but keep as audio-only state
          setCanEnableVideo(true);
          setIsVideoOff(false);
          toast.success("Camera enabled!");
          return true;
        }
      }
    } catch (error) {
      console.error("Failed to enable video:", error);
      toast.error(
        "Unable to access camera. Please check permissions and try again.",
      );
      return false;
    }
    return false;
  }, [mediaAccessLevel]);

  const toggleVideo = useCallback(async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        // Toggle existing video track
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        toast.success(videoTrack.enabled ? "Camera on" : "Camera off");
      } else if (
        mediaAccessLevel === "audio-only" ||
        mediaAccessLevel === "none"
      ) {
        // Try to add video to existing stream or create new stream
        await enableVideo();
      }
    } else if (mediaAccessLevel === "none") {
      // No stream at all, try to get one with video
      await enableVideo();
    }
  }, [mediaAccessLevel, enableVideo]);

  const stopMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setHasPermissions(false);
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
    hasPermissions,
    mediaAccessLevel,
    canEnableVideo,
    getMedia,
    toggleMute,
    toggleVideo,
    enableVideo,
    enableAudio,
    stopMedia,
  };
}
