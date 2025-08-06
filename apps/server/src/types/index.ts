import type {
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
}

export interface PlainTransports {
  audioTransport?: PlainTransport;
  videoTransport?: PlainTransport;
}