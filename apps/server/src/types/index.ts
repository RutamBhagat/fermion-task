import type * as mediasoup from "mediasoup";

export interface SocketTransports {
  producer?: mediasoup.types.WebRtcTransport;
  consumer?: mediasoup.types.WebRtcTransport;
}

export interface PlainTransports {
  audioTransport?: mediasoup.types.PlainTransport;
  videoTransport?: mediasoup.types.PlainTransport;
}

export interface RoomState {
  router: mediasoup.types.Router;
  participants: Set<string>;
  transports: Map<string, SocketTransports>;
  producers: Map<string, mediasoup.types.Producer[]>;
  consumers: Map<string, mediasoup.types.Consumer>;
}

export interface HLSStreamResult {
  streamId: string;
  hlsUrl: string;
}
