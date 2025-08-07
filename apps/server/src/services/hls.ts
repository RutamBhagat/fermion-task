import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import type { Consumer, PlainTransport, Producer, Router } from "mediasoup/types";
import type { Server } from "socket.io";
import type { HLSStreamResult, PlainTransports } from "@/types/index.js";
import { plainTransportOptions } from "../config/mediasoup.js";
import { generateCompositeSDP } from "../utils/sdp.js";
import { monitorHLSStream } from "./monitoring.js";

const HLS_DIR = "./hls";
const plainTransports = new Map<string, PlainTransports>();
const hlsProcesses = new Map<string, ChildProcess>();
const streamSocketMap = new Map<string, string>();

if (!existsSync(HLS_DIR)) {
  mkdirSync(HLS_DIR, { recursive: true });
}

export async function createCompositeHLSStream(
  streamId: string,
  audioProducers: Producer[],
  videoProducers: Producer[],
  socketId: string,
  router: Router,
  io: Server
): Promise<HLSStreamResult> {
  if (audioProducers.length === 0 && videoProducers.length === 0) {
    throw new Error("At least one producer (audio or video) is required");
  }

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

  for (let i = 0; i < audioProducers.length; i++) {
    const audioProducer = audioProducers[i];

    if (audioProducer.closed) {
      console.warn(`Skipping closed audio producer ${audioProducer.id}`);
      continue;
    }

    const audioRtpPort = currentPort++;
    const audioRtcpPort = currentPort++;

    const audioTransport = await router.createPlainTransport(
      plainTransportOptions
    );

    const audioConsumer = await audioTransport.consume({
      producerId: audioProducer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: true,
    });

    await audioTransport.connect({
      ip: "127.0.0.1",
      port: audioRtpPort,
      rtcpPort: audioRtcpPort,
    });

    audioTransports.push(audioTransport);
    audioConsumers.push(audioConsumer);

    console.log(
      `Audio ${i} PlainTransport connected on ports ${audioRtpPort}/${audioRtcpPort}`
    );
  }

  for (let i = 0; i < videoProducers.length; i++) {
    const videoProducer = videoProducers[i];

    if (videoProducer.closed) {
      console.warn(`Skipping closed video producer ${videoProducer.id}`);
      continue;
    }

    const videoRtpPort = currentPort++;
    const videoRtcpPort = currentPort++;

    const videoTransport = await router.createPlainTransport(
      plainTransportOptions
    );

    const videoConsumer = await videoTransport.consume({
      producerId: videoProducer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: true,
    });

    await videoTransport.connect({
      ip: "127.0.0.1",
      port: videoRtpPort,
      rtcpPort: videoRtcpPort,
    });

    videoTransports.push(videoTransport);
    videoConsumers.push(videoConsumer);

    console.log(
      `Video ${i} PlainTransport connected on ports ${videoRtpPort}/${videoRtcpPort}`
    );
  }

  if (audioConsumers.length === 0 && videoConsumers.length === 0) {
    audioTransports.forEach((transport) => transport.close());
    videoTransports.forEach((transport) => transport.close());
    throw new Error("No valid producers available - all producers were closed");
  }

  const fs = await import("node:fs/promises");
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
  console.log(`Starting composite FFmpeg: ${ffmpegArgs.join(" ")}`);

  const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  ffmpegProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`FFmpeg stdout [${streamId}]: ${data}`);
  });

  ffmpegProcess.stderr?.on("data", (data: Buffer) => {
    console.log(`FFmpeg stderr [${streamId}]: ${data}`);
  });

  ffmpegProcess.on("error", (error: Error) => {
    console.error(`FFmpeg process error [${streamId}]:`, error);
    hlsProcesses.delete(streamId);
  });

  ffmpegProcess.on("close", (code: number | null) => {
    console.log(
      `FFmpeg process for stream ${streamId} exited with code ${code}`
    );
    hlsProcesses.delete(streamId);
  });

  setTimeout(async () => {
    try {
      for (const consumer of [...audioConsumers, ...videoConsumers]) {
        if (consumer.paused) {
          await consumer.resume();
          console.log(
            `Consumer resumed for stream ${streamId}: ${consumer.kind}`
          );
        }
      }
    } catch (error) {
      console.error(`Error resuming consumers for stream ${streamId}:`, error);
    }
  }, 2000);

  plainTransports.set(streamId, {
    audioTransport: audioTransports[0],
    videoTransport: videoTransports[0],
  });
  hlsProcesses.set(streamId, ffmpegProcess);
  streamSocketMap.set(streamId, socketId);

  setTimeout(() => {
    monitorHLSStream(streamId, socketId, io);
  }, 3000);

  console.log(`Composite HLS stream created for ${streamId}`);
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

    let cols: number;
    let rows: number;
    if (numVideos <= 2) {
      cols = 2;
      rows = 1;
    } else if (numVideos <= 4) {
      cols = 2;
      rows = 2;
    } else if (numVideos <= 6) {
      cols = 3;
      rows = 2;
    } else if (numVideos <= 9) {
      cols = 3;
      rows = 3;
    } else {
      cols = 4;
      rows = Math.ceil(numVideos / 4);
    }

    const gridWidth = 1920;
    const gridHeight = 1080;
    const videoWidth = Math.floor(gridWidth / cols);
    const videoHeight = Math.floor(gridHeight / rows);

    console.log(
      `Grid layout: ${numVideos} videos, ${cols}x${rows} grid, cell size: ${videoWidth}x${videoHeight}`
    );

    const scaledInputs: string[] = [];
    for (let i = 0; i < numVideos; i++) {
      const inputLabel = `scaled${i}`;
      scaledInputs.push(
        `[0:${
          videoStartIndex + i
        }]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight}[${inputLabel}]`
      );
    }

    const positions: string[] = [];
    const xstackInputs: string[] = [];

    for (let i = 0; i < numVideos; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = col * videoWidth;
      const y = row * videoHeight;
      positions.push(`${x}_${y}`);
      xstackInputs.push(`[scaled${i}]`);
    }

    const scaleFilters = scaledInputs.join(";");
    const xstackFilter = `${xstackInputs.join(
      ""
    )}xstack=inputs=${numVideos}:layout=${positions.join("|")}:fill=black[v]`;
    filterComplex = `${scaleFilters};${xstackFilter}`;
  }

  if (audioConsumers.length > 1) {
    const audioInputs = audioConsumers.map((_, i) => `[0:${i}]`).join("");
    const audioFilter = `${audioInputs}amix=inputs=${audioConsumers.length}[a]`;

    if (filterComplex) {
      filterComplex += `;${audioFilter}`;
    } else {
      filterComplex = audioFilter;
    }
  }

  if (filterComplex) {
    ffmpegArgs.push("-filter_complex", filterComplex);
  }

  if (videoConsumers.length > 1) {
    ffmpegArgs.push("-map", "[v]");
  } else if (videoConsumers.length === 1) {
    ffmpegArgs.push("-map", `0:${videoStartIndex}`);
  }

  if (audioConsumers.length > 1) {
    ffmpegArgs.push("-map", "[a]");
  } else if (audioConsumers.length === 1) {
    ffmpegArgs.push("-map", "0:0");
  }

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
      "-bf",
      "0",
      "-g",
      "30",
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
    "0",
    "-hls_flags",
    "independent_segments+program_date_time",
    "-hls_segment_type",
    "mpegts",
    "-hls_allow_cache",
    "1",
    "-hls_init_time",
    "1",
    "-start_number",
    "0",
    "-hls_playlist_type",
    "event",
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
    if (transports.audioTransport) transports.audioTransport.close();
    if (transports.videoTransport) transports.videoTransport.close();
    plainTransports.delete(streamId);
  }

  streamSocketMap.delete(streamId);
  console.log(`HLS stream stopped for ${streamId}`);

  cleanupOldStreams(streamId);
}

export async function cleanupOldStreams(currentStreamId: string) {
  try {
    if (!existsSync(HLS_DIR)) {
      return;
    }

    const streamDirs = await readdir(HLS_DIR, { withFileTypes: true });
    const dirsToDelete = streamDirs
      .filter(
        (dirent) => dirent.isDirectory() && dirent.name !== currentStreamId
      )
      .map((dirent) => dirent.name);

    if (dirsToDelete.length === 0) {
      console.log("No old streams to clean up");
      return;
    }

    console.log(
      `Cleaning up ${dirsToDelete.length} old stream directories:`,
      dirsToDelete
    );

    for (const dirName of dirsToDelete) {
      const dirPath = `${HLS_DIR}/${dirName}`;
      try {
        await rm(dirPath, { recursive: true, force: true });
        console.log(`Deleted old stream directory: ${dirPath}`);
      } catch (error) {
        console.error(`Failed to delete stream directory ${dirPath}:`, error);
      }
    }

    console.log(
      `Stream cleanup completed. Kept current stream: ${currentStreamId}`
    );
  } catch (error) {
    console.error("Error during stream cleanup:", error);
  }
}

export function getHLSProcesses(): Map<string, ChildProcess> {
  return hlsProcesses;
}
