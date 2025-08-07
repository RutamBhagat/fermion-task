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

  setTimeout(async () => {
    try {
      for (const consumer of audioConsumers) {
        if (consumer.paused) await consumer.resume();
      }

      for (const consumer of videoConsumers) {
        if (consumer.paused) await consumer.resume();
        await consumer.requestKeyFrame();
        console.log(`Keyframe requested for consumer ${consumer.id}`);
      }
    } catch (error) {
      console.error(`Error resuming consumers for stream ${streamId}:`, error);
    }
  }, 2000);

  return { streamId, hlsUrl: `/hls/${streamId}/stream.m3u8` };
}

function buildFFmpegArgs(
  sdpPath: string,
  audioConsumers: Consumer[],
  videoConsumers: Consumer[],
  streamDir: string
): string[] {
  const ffmpegArgs = [
    "-y",
    "-loglevel",
    "debug",
    "-protocol_whitelist",
    "file,rtp,udp",
    "-f",
    "sdp",
    "-i",
    sdpPath,
  ];

  const videoStartIndex = audioConsumers.length;
  let filterComplex = "";

  if (videoConsumers.length > 1) {
    const numVideos = videoConsumers.length;
    let cols, rows;
    if (numVideos <= 2) {
      cols = 2;
      rows = 1;
    } else if (numVideos <= 4) {
      cols = 2;
      rows = 2;
    } else if (numVideos <= 9) {
      cols = 3;
      rows = 3;
    } else {
      cols = 4;
      rows = Math.ceil(numVideos / 4);
    }

    const gridWidth = 1920,
      gridHeight = 1080;
    const videoWidth = Math.floor(gridWidth / cols);
    const videoHeight = Math.floor(gridHeight / rows);

    const scaledInputs = videoConsumers.map(
      (_, i) =>
        `[0:${
          videoStartIndex + i
        }]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight}[scaled${i}]`
    );
    const xstackInputs = videoConsumers.map((_, i) => `[scaled${i}]`);
    const positions = Array.from(
      { length: numVideos },
      (_, i) =>
        `${(i % cols) * videoWidth}_${Math.floor(i / cols) * videoHeight}`
    );

    filterComplex = `${scaledInputs.join(";")};${xstackInputs.join(
      ""
    )}xstack=inputs=${numVideos}:layout=${positions.join("|")}:fill=black[v]`;
  }

  if (audioConsumers.length > 1) {
    const audioInputs = audioConsumers.map((_, i) => `[0:${i}]`).join("");
    const audioFilter = `${audioInputs}amix=inputs=${audioConsumers.length}[a]`;
    filterComplex = filterComplex
      ? `${filterComplex};${audioFilter}`
      : audioFilter;
  }

  if (filterComplex) ffmpegArgs.push("-filter_complex", filterComplex);

  if (videoConsumers.length > 1) ffmpegArgs.push("-map", "[v]");
  else if (videoConsumers.length === 1)
    ffmpegArgs.push("-map", `0:${videoStartIndex}`);
  if (audioConsumers.length > 1) ffmpegArgs.push("-map", "[a]");
  else if (audioConsumers.length === 1) ffmpegArgs.push("-map", "0:0");

  if (videoConsumers.length > 0) {
    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-g",
      "30",
      "-bf",
      "0",
      "-max_delay",
      "0"
    );
  }

  if (audioConsumers.length > 0) {
    ffmpegArgs.push("-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2");
  }

  ffmpegArgs.push(
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "6",
    "-hls_flags",
    "delete_segments+program_date_time+independent_segments",
    "-hls_segment_type",
    "mpegts",
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
