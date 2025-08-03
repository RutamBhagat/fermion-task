export const videoConstraints = {
  hd: {
    width: { ideal: 1280, max: 1920, min: 640 },
    height: { ideal: 720, max: 1080, min: 480 },
    frameRate: { ideal: 30, max: 30, min: 15 },
    aspectRatio: { ideal: 16 / 9 },
    facingMode: "user",
  },

  standard: {
    width: { ideal: 960, max: 1280, min: 480 },
    height: { ideal: 540, max: 720, min: 360 },
    frameRate: { ideal: 24, max: 30, min: 15 },
    aspectRatio: { ideal: 16 / 9 },
    facingMode: "user",
  },

  low: {
    width: { ideal: 640, max: 960, min: 320 },
    height: { ideal: 360, max: 540, min: 240 },
    frameRate: { ideal: 15, max: 24, min: 10 },
    aspectRatio: { ideal: 16 / 9 },
    facingMode: "user",
  },
} as const;

export const audioConstraints = {
  highQuality: {
    sampleRate: { ideal: 48000, min: 16000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 2, min: 1 },

    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,

    googEchoCancellation: true,
    googNoiseSuppression: true,
    googAutoGainControl: true,
    googHighpassFilter: true,
    googNoiseReduction: true,
    googEchoCancellation2: true,
    googDAEchoCancellation: true,

    latency: { ideal: 0.01, max: 0.02 },
  },

  standard: {
    sampleRate: { ideal: 48000, min: 16000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 1 },

    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,

    latency: { ideal: 0.02, max: 0.05 },
  },

  minimal: {
    sampleRate: { ideal: 16000 },
    channelCount: { ideal: 1 },

    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
  },
} as const;

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

  audioOnly: {
    video: false,
    audio: audioConstraints.highQuality,
  },

  screenShare: {
    video: {
      width: { ideal: 1920, max: 3840 },
      height: { ideal: 1080, max: 2160 },
      frameRate: { ideal: 15, max: 30, min: 5 },
      aspectRatio: { ideal: 16 / 9 },
    },
    audio: audioConstraints.standard,
  },
} as const;

export type QualityLevel = keyof typeof mediaConstraints;

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
  const nav = navigator as NavigatorWithConnection;
  const connection =
    nav.connection || nav.mozConnection || nav.webkitConnection;

  if (connection) {
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink;

    if (effectiveType === "4g" && downlink && downlink > 10) {
      return "hd";
    }

    if (
      (effectiveType === "4g" && downlink && downlink > 2) ||
      effectiveType === "3g"
    ) {
      return "standard";
    }

    return "low";
  }

  return "standard";
}

export function getMediaConstraintsWithFallback(
  preferredQuality?: QualityLevel,
) {
  const quality = preferredQuality || getOptimalQualityLevel();
  return mediaConstraints[quality];
}
