import type { WebRtcTransport } from "mediasoup/types";

export interface SocketTransports {
  producer?: WebRtcTransport;
  consumer?: WebRtcTransport;
}
