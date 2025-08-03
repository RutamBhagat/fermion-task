import type * as mediasoup from "mediasoup";

export const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
    parameters: {
      // Optimize Opus for speech quality
      "sprop-stereo": 1,
      "sprop-maxcapturerate": 48000,
      maxaveragebitrate: 64000, // 64 kbps for high quality audio
      maxplaybackrate: 48000,
      cbr: 0, // Use variable bitrate
      useinbandfec: 1, // Enable forward error correction
      usedtx: 1, // Enable discontinuous transmission
    },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    preferredPayloadType: 102,
    parameters: {
      "packetization-mode": 1,
      // Use H.264 High profile for better quality
      "profile-level-id": "64001f", // High profile, level 3.1
      "level-asymmetry-allowed": 1,
      // Increased bitrate for better quality (2.5 Mbps start, can adapt up to 4 Mbps)
      "x-google-start-bitrate": 2500,
      "x-google-max-bitrate": 4000,
      "x-google-min-bitrate": 500,
    },
  },
  // Add VP8 as fallback codec with optimized settings
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    preferredPayloadType: 103,
    parameters: {
      "x-google-start-bitrate": 2500,
      "x-google-max-bitrate": 4000,
      "x-google-min-bitrate": 500,
    },
  },
];

export const workerSettings: mediasoup.types.WorkerSettings = {
  logLevel: "debug",
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
};

export const webRtcTransportOptions: mediasoup.types.WebRtcTransportOptions = {
  listenIps: [
    {
      ip: process.env.WEBRTC_LISTEN_IP || "127.0.0.1",
      announcedIp: process.env.ANNOUNCED_IP || undefined,
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
};

export const plainTransportOptions: mediasoup.types.PlainTransportOptions = {
  listenIp: {
    ip: process.env.WEBRTC_LISTEN_IP || "127.0.0.1",
    announcedIp: process.env.ANNOUNCED_IP || undefined,
  },
  rtcpMux: false,
  comedia: false,
};
