import type * as mediasoup from "mediasoup";

export const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
	{
		kind: "audio",
		mimeType: "audio/opus",
		clockRate: 48000,
		channels: 2,
	},
	{
		kind: "video",
		mimeType: "video/H264",
		clockRate: 90000,
		parameters: {
			"packetization-mode": 1,
			"profile-level-id": "42001f",
			"level-asymmetry-allowed": 1,
			"x-google-start-bitrate": 1000,
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
			ip: "127.0.0.1",
			announcedIp: undefined,
		},
	],
	enableUdp: true,
	enableTcp: true,
	preferUdp: true,
};

export const plainTransportOptions: mediasoup.types.PlainTransportOptions = {
	listenIp: { ip: "127.0.0.1" },
	rtcpMux: false,
	comedia: false,
};
