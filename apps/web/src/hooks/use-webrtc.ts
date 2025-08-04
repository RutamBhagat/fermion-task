"use client";

import { Device } from "mediasoup-client";
import type { RtpCapabilities } from "mediasoup-client/types";
import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export function useWebRTC() {
  const [isProducing, setIsProducing] = useState(false);

  const deviceRef = useRef<Device | null>(null);

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


  return {
    isProducing,
    initializeDevice,
  };
}
