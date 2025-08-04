"use client";

import { Device } from "mediasoup-client";
import type {
  RtpCapabilities,
  Transport,
  DtlsParameters,
  IceCandidate,
  IceParameters,
} from "mediasoup-client/types";
import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

interface TransportParams {
  params: {
    id: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
  };
}

export function useWebRTC() {
  const [isProducing, setIsProducing] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);

  const initializeDevice = useCallback(async (socket: Socket) => {
    const { rtpCapabilities } = await new Promise<{
      rtpCapabilities: RtpCapabilities;
    }>((resolve) => {
      socket.emit("getRtpCapabilities", {}, resolve);
    });

    const device = new Device();

    await device.load({ routerRtpCapabilities: rtpCapabilities });

    deviceRef.current = device;

    console.log("Mediasoup device initialized.");
    return device;
  }, []);

  const createConsumerTransport = useCallback(async (socket: Socket) => {
    if (!deviceRef.current) return;

    const { params } = await new Promise<TransportParams>((resolve) => {
      socket.emit("createWebRtcTransport", { type: "consumer" }, resolve);
    });

    const consumerTransport = deviceRef.current.createRecvTransport(params);
    consumerTransportRef.current = consumerTransport;

    consumerTransport.on("connect", async ({ dtlsParameters }, callback) => {
      socket.emit(
        "connectTransport",
        {
          transportId: consumerTransport.id,
          dtlsParameters,
        },
        callback
      );
    });

    return consumerTransport;
  }, []);

  return {
    isProducing,
    initializeDevice,
    createConsumerTransport,
  };
}
