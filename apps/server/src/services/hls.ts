import { existsSync, mkdirSync } from "node:fs";

import type { ChildProcess } from "node:child_process";
import type { PlainTransports } from "@/types/index.js";

const HLS_DIR = "./hls";
const hlsProcesses = new Map<string, ChildProcess>();
const plainTransports = new Map<string, PlainTransports>();

if (!existsSync(HLS_DIR)) {
  mkdirSync(HLS_DIR, { recursive: true });
}
