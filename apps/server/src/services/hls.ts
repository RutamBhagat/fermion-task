import type {
  Consumer,
  PlainTransport,
  Producer,
  Router,
} from "mediasoup/types";
import { existsSync, mkdirSync } from "node:fs";

import type { ChildProcess } from "node:child_process";
import type { HLSStreamResult } from "@/types/index";
import type { PlainTransports } from "@/types/index";
import { promises as fs } from "node:fs";
import { generateCompositeSDP } from "@/utils/sdp";
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
    const rtpPort = currentPort++;
    const rtcpPort = currentPort++;

    const transport = await router.createPlainTransport(plainTransportOptions);
    await transport.connect({ ip: "127.0.0.1", port: rtpPort, rtcpPort });
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
    const rtpPort = currentPort++;
    const rtcpPort = currentPort++;

    const transport = await router.createPlainTransport(plainTransportOptions);
    await transport.connect({ ip: "127.0.0.1", port: rtpPort, rtcpPort });
    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: true,
    });
    videoTransports.push(transport);
    videoConsumers.push(consumer);
    currentPort += 2;
  }

  const compositeSdp = generateCompositeSDP(
    audioConsumers,
    videoConsumers,
    basePort
  );
  const sdpPath = `${streamDir}/composite.sdp`;
  await fs.writeFile(sdpPath, compositeSdp);
  console.log(`Composite SDP created: ${sdpPath}`);

  const ffmpegArgs = buildFFmpegArgs(
    sdpPath,
    audioConsumers,
    videoConsumers,
    streamDir
  );
  console.log(`Starting FFmpeg with args: ffmpeg ${ffmpegArgs.join(" ")}`);

  const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  hlsProcesses.set(streamId, ffmpegProcess);

  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    ffmpegProcess.stdout.on("data", (data) => {
      console.log(`FFmpeg stdout [${streamId}]: ${data.toString()}`);
    });
    ffmpegProcess.stderr.on("data", (data) => {
      console.error(`FFmpeg stderr [${streamId}]: ${data.toString()}`);
    });
  }

  ffmpegProcess.on("close", (code) => {
    console.log(
      `FFmpeg process for stream ${streamId} exited with code ${code}`
    );
    hlsProcesses.delete(streamId);
  });

  setTimeout(() => {
    for (const consumer of [...audioConsumers, ...videoConsumers]) {
      consumer.resume();
    }
  }, 1000);

  return { streamId, hlsUrl: `/hls/${streamId}/stream.m3u8` };
}
function buildFFmpegArgs(
  sdpPath: string,
  audioConsumers: Consumer[],
  videoConsumers: Consumer[],
  streamDir: string
): string[] {
  const ffmpegArgs = [
    "-protocol_whitelist",
    "file,rtp,udp",
    "-f",
    "sdp",
    "-i",
    sdpPath,
  ];

  let filterComplex = "";

  if (videoConsumers.length > 1) {
    const numVideos = videoConsumers.length;
    const layout = numVideos <= 2 ? "2x1" : numVideos <= 4 ? "2x2" : "3x3";
    const [cols, rows] = layout.split("x").map(Number);
    const gridWidth = 1280;
    const gridHeight = 720;
    const videoWidth = Math.floor(gridWidth / cols);
    const videoHeight = Math.floor(gridHeight / rows);

    const videoInputs = videoConsumers
      .map((_, i) => `[${i + audioConsumers.length}:v]`)
      .join("");
    const scaleFilters = videoConsumers
      .map(
        (_, i) =>
          `[${
            i + audioConsumers.length
          }:v]scale=${videoWidth}:${videoHeight}[v${i}]`
      )
      .join(";");
    const xstackInputs = Array.from(
      { length: numVideos },
      (_, i) => `[v${i}]`
    ).join("");

    const positions = Array.from(
      { length: numVideos },
      (_, i) =>
        `${(i % cols) * videoWidth}_${Math.floor(i / cols) * videoHeight}`
    ).join("|");
    const xstackFilter = `${xstackInputs}xstack=inputs=${numVideos}:layout=${positions}[v]`;

    filterComplex = `${scaleFilters};${xstackFilter}`;
  }

  if (audioConsumers.length > 1) {
    const audioInputs = audioConsumers.map((_, i) => `[${i}:a]`).join("");
    const amixFilter = `${audioInputs}amix=inputs=${audioConsumers.length}[a]`;
    filterComplex = filterComplex
      ? `${filterComplex};${amixFilter}`
      : amixFilter;
  }

  if (filterComplex) {
    ffmpegArgs.push("-filter_complex", filterComplex);
  }

  ffmpegArgs.push(
    "-map",
    videoConsumers.length > 1 ? "[v]" : `${audioConsumers.length}:v`
  );
  ffmpegArgs.push("-map", audioConsumers.length > 1 ? "[a]" : "0:a");

  ffmpegArgs.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency"
  );

  ffmpegArgs.push("-c:a", "aac", "-b:a", "128k");

  ffmpegArgs.push(
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "6",
    "-hls_flags",
    "delete_segments",
    `${streamDir}/stream.m3u8`
  );

  return ffmpegArgs;
}

export function stopHLSStream(streamId: string) {
  const process = hlsProcesses.get(streamId);
  if (process) {
    process.kill("SIGTERM");
    hlsProcesses.delete(streamId);
  }

  const transports = plainTransports.get(streamId);
  if (transports) {
    transports.audioTransport?.close();
    transports.videoTransport?.close();
    plainTransports.delete(streamId);
  }

  console.log(`HLS stream stopped for ${streamId}`);
  // We will add logic here later to delete the old files
}
