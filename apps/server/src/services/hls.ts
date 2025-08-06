import type { Consumer, PlainTransport, Producer, Router } from "mediasoup/types";
import { existsSync, mkdirSync } from "node:fs";

import type { ChildProcess } from "node:child_process";
import type { HLSStreamResult } from "@/types/index";
import type { PlainTransports } from "@/types/index";
import { plainTransportOptions } from "@/config/mediasoup";
import { spawn } from "node:child_process";

// We'll create these helpers soon
// import { generateCompositeSDP } from "../utils/sdp.js";
// import { monitorHLSStream } from "./monitoring.js";

const HLS_DIR = "./hls";
const hlsProcesses = new Map<string, ChildProcess>();
const plainTransports = new Map<string, PlainTransports>();

if (!existsSync(HLS_DIR)) {
  mkdirSync(HLS_DIR, { recursive: true });
}

export async function createCompositeHLSStream(
  streamId: string,
  audioProducers: Producer[],
  videoProducers: Producer[],
  router: Router
): Promise<HLSStreamResult> {
  const streamDir = `${HLS_DIR}/${streamId}`;
  if (!existsSync(streamDir)) {
    mkdirSync(streamDir, { recursive: true });
  }

  const audioTransports: PlainTransport[] = [];
  const videoTransports: PlainTransport[] = [];
  const audioConsumers: Consumer[] = [];
  const videoConsumers: Consumer[] = [];

  const basePort = 20000;
  let currentPort = basePort;

  for (const producer of audioProducers) {
    const transport = await router.createPlainTransport(plainTransportOptions);
    await transport.connect({ ip: "127.0.0.1", port: currentPort });
    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: true,
    });
    audioTransports.push(transport);
    audioConsumers.push(consumer);
    currentPort += 2;
  }

  for (const producer of videoProducers) {
    const transport = await router.createPlainTransport(plainTransportOptions);
    await transport.connect({ ip: "127.0.0.1", port: currentPort });
    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: true,
    });
    videoTransports.push(transport);
    videoConsumers.push(consumer);
    currentPort += 2;
  }

  // Generate SDP file (we'll build this helper next)
  // const compositeSdp = generateCompositeSDP(audioConsumers, videoConsumers, basePort);
  // const sdpPath = `${streamDir}/composite.sdp`;
  // await fs.writeFile(sdpPath, compositeSdp);

  // Build FFmpeg args (we'll build this helper next)
  // const ffmpegArgs = buildFFmpegArgs(sdpPath, audioConsumers, videoConsumers, streamDir);

  // For now, let's log what we've created
  console.log(
    `Created ${audioConsumers.length} audio consumers and ${videoConsumers.length} video consumers.`
  );
  console.log("Next steps: Generate SDP and spawn FFmpeg.");

  // This is a placeholder return
  return { streamId, hlsUrl: `/hls/${streamId}/stream.m3u8` };
}