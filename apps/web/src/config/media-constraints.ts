/**
 * Optimized media constraints for high-quality WebRTC streams
 * Based on 2024 best practices for video conferencing applications
 */

// High-quality video constraints for different scenarios
export const videoConstraints = {
  // HD quality for desktop/good network conditions
  hd: {
    width: { ideal: 1280, max: 1920, min: 640 },
    height: { ideal: 720, max: 1080, min: 480 },
    frameRate: { ideal: 30, max: 30, min: 15 },
    aspectRatio: { ideal: 16 / 9 },
    // Request specific codec preferences
    facingMode: "user",
  },

  // Standard quality for mobile/moderate network
  standard: {
    width: { ideal: 960, max: 1280, min: 480 },
    height: { ideal: 540, max: 720, min: 360 },
    frameRate: { ideal: 24, max: 30, min: 15 },
    aspectRatio: { ideal: 16 / 9 },
    facingMode: "user",
  },

  // Low quality for poor network conditions
  low: {
    width: { ideal: 640, max: 960, min: 320 },
    height: { ideal: 360, max: 540, min: 240 },
    frameRate: { ideal: 15, max: 24, min: 10 },
    aspectRatio: { ideal: 16 / 9 },
    facingMode: "user",
  },
} as const;

// Optimized audio constraints with noise processing
export const audioConstraints = {
  // High-quality audio with full processing
  highQuality: {
    // Audio quality settings
    sampleRate: { ideal: 48000, min: 16000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 2, min: 1 },

    // Audio processing for better quality
    echoCancellation: true, // Remove echo from speakers
    noiseSuppression: true, // Remove background noise
    autoGainControl: true, // Automatic volume control

    // Advanced processing (browser support varies)
    googEchoCancellation: true,
    googNoiseSuppression: true,
    googAutoGainControl: true,
    googHighpassFilter: true, // Remove low-frequency noise
    googNoiseReduction: true,
    googEchoCancellation2: true, // Enhanced echo cancellation
    googDAEchoCancellation: true, // Domain adaptation echo cancellation

    // Latency optimization
    latency: { ideal: 0.01, max: 0.02 }, // 10-20ms target latency
  },

  // Standard audio with basic processing
  standard: {
    sampleRate: { ideal: 48000, min: 16000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 1 },

    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,

    latency: { ideal: 0.02, max: 0.05 },
  },

  // Minimal processing for performance
  minimal: {
    sampleRate: { ideal: 16000 },
    channelCount: { ideal: 1 },

    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
  },
} as const;

// Combined constraints for different quality levels
export const mediaConstraints = {
  hd: {
    video: videoConstraints.hd,
    audio: audioConstraints.highQuality,
  },

  standard: {
    video: videoConstraints.standard,
    audio: audioConstraints.standard,
  },

  low: {
    video: videoConstraints.low,
    audio: audioConstraints.minimal,
  },

  // Audio-only mode with high quality
  audioOnly: {
    video: false,
    audio: audioConstraints.highQuality,
  },

  // Screen sharing optimized for presentations
  screenShare: {
    video: {
      width: { ideal: 1920, max: 3840 },
      height: { ideal: 1080, max: 2160 },
      frameRate: { ideal: 15, max: 30, min: 5 }, // Lower framerate for screen content
      aspectRatio: { ideal: 16 / 9 },
    },
    audio: audioConstraints.standard,
  },
} as const;

// Adaptive quality selection based on network conditions
export type QualityLevel = keyof typeof mediaConstraints;

// Network Connection API types (not fully standardized)
interface NetworkInformation {
  effectiveType?: "2g" | "3g" | "4g" | "slow-2g";
  downlink?: number;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

export function getOptimalQualityLevel(): QualityLevel {
  // Check network connection if available
  const nav = navigator as NavigatorWithConnection;
  const connection =
    nav.connection || nav.mozConnection || nav.webkitConnection;

  if (connection) {
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink; // Mbps

    // High quality for good connections
    if (effectiveType === "4g" && downlink && downlink > 10) {
      return "hd";
    }

    // Standard quality for moderate connections
    if (
      (effectiveType === "4g" && downlink && downlink > 2) ||
      effectiveType === "3g"
    ) {
      return "standard";
    }

    // Low quality for poor connections
    return "low";
  }

  // Default to standard quality if network info unavailable
  return "standard";
}

// Function to get constraints with fallback strategy
export function getMediaConstraintsWithFallback(
  preferredQuality?: QualityLevel,
) {
  const quality = preferredQuality || getOptimalQualityLevel();
  return mediaConstraints[quality];
}
