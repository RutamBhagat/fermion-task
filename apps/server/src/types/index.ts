import type {
  ActiveSpeakerObserver,
  Consumer,
  PlainTransport,
  Producer,
  Router,
  WebRtcTransport,
} from "mediasoup/types";

export interface SocketTransports {
  producer?: WebRtcTransport;
  consumer?: WebRtcTransport;
}

export interface RoomState {
  router: Router;
  participants: Set<string>;
  transports: Map<string, SocketTransports>;
  producers: Map<string, Producer[]>;
  consumers: Map<string, Consumer>;
  activeSpeakerObserver?: ActiveSpeakerObserver;
  dominantSpeaker?: string;
}

export interface PlainTransports {
  audioTransport?: PlainTransport;
  videoTransport?: PlainTransport;
}

export interface HLSStreamResult {
  streamId: string;
  hlsUrl: string;
}