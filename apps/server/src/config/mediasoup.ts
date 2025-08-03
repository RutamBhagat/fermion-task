import type { PlainTransportOptions, RtpCodecCapability, WebRtcTransportOptions, WorkerSettings } from "mediasoup/types";

export const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
    parameters: {
      "sprop-stereo": 1,
      "sprop-maxcapturerate": 48000,
      maxaveragebitrate: 64000,
      maxplaybackrate: 48000,
      cbr: 0,
      useinbandfec: 1,
      usedtx: 1,
    },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    preferredPayloadType: 102,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "64001f",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 2500,
      "x-google-max-bitrate": 4000,
      "x-google-min-bitrate": 500,
    },
  },
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

export const workerSettings: WorkerSettings = {
  logLevel: "debug",
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
};

export const webRtcTransportOptions: WebRtcTransportOptions = {
  listenIps: [
    {
      ip: process.env.WEBRTC_LISTEN_IP || "127.0.0.1",
      announcedIp: process.env.ANNOUNCED_IP,
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
};

export const plainTransportOptions: PlainTransportOptions = {
  listenIp: {
    ip: process.env.WEBRTC_LISTEN_IP || "127.0.0.1",
    announcedIp: process.env.ANNOUNCED_IP || undefined,
  },
  rtcpMux: false,
  comedia: false,
};