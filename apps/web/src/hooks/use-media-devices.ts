"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaDevicesProps {
  onProducerPause?: (kind: 'audio' | 'video') => void;
  onProducerResume?: (kind: 'audio' | 'video') => void;
}

export function useMediaDevices({ onProducerPause, onProducerResume }: UseMediaDevicesProps = {}) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const getMedia = useCallback(async (retryCount = 0) => {
    if (retryCount === 0) {
      setIsLoading(true);
      setMediaError(null);
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
      } catch (bothError) {
        console.warn('Failed to get both video and audio, trying video only:', bothError);
        
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          console.warn('Audio not available, continuing with video only');
        } catch (videoError) {
          console.warn('Failed to get video, trying audio only:', videoError);
          
          // Final fallback: audio only
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.warn('Video not available, continuing with audio only');
        }
      }

      localStreamRef.current = stream;
      setMediaError(null);
      setIsLoading(false);
      console.log('Media stream obtained:', {
        video: stream.getVideoTracks().length,
        audio: stream.getAudioTracks().length
      });
      return stream;
    } catch (error) {
      console.error('Failed to get media stream:', error);
      
      let errorMessage = 'Failed to access camera/microphone';
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Camera/microphone access denied. Please allow permissions and refresh.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No camera or microphone found on this device.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Camera/microphone is already in use by another application.';
        } else if (error.name === 'OverconstrainedError') {
          errorMessage = 'Camera/microphone constraints cannot be satisfied.';
        } else if (error.name === 'SecurityError') {
          errorMessage = 'Media access blocked due to security restrictions.';
        } else {
          errorMessage = error.message || 'Unknown media access error';
        }
      }

      setMediaError(errorMessage);
      setIsLoading(false);

      if (retryCount < 2 && (error instanceof Error && 
          ['NotReadableError', 'AbortError'].includes(error.name))) {
        console.log(`Retrying media access (attempt ${retryCount + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getMedia(retryCount + 1);
      }

      return null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMutedState = !audioTrack.enabled;
        setIsMuted(newMutedState);
        
        if (newMutedState) {
          onProducerPause?.('audio');
        } else {
          onProducerResume?.('audio');
        }
      } else {
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted, onProducerPause, onProducerResume]);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newVideoOffState = !videoTrack.enabled;
        setIsVideoOff(newVideoOffState);
        
        if (newVideoOffState) {
          onProducerPause?.('video');
        } else {
          onProducerResume?.('video');
        }
      } else {
        setIsVideoOff(!isVideoOff);
      }
    }
  }, [isVideoOff, onProducerPause, onProducerResume]);

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
    mediaError,
    isLoading,
    getMedia,
    toggleMute,
    toggleVideo,
  };
}
