# HLS Streaming Implementation

## Overview

I've successfully implemented HLS (HTTP Live Streaming) functionality for the WebRTC P2P application. This allows users to watch WebRTC streams as live HLS playback.

## Architecture

```
WebRTC Streams → mediasoup Router → PlainRtpTransport → FFmpeg → HLS Files → Static Server → /watch page
```

## Implementation Details

### Server-Side (Node.js + mediasoup)

**Key Components:**
1. **PlainRtpTransport**: Consumes WebRTC streams as plain RTP
2. **FFmpeg Integration**: Converts RTP streams to HLS segments
3. **Static File Serving**: Serves .m3u8 and .ts files
4. **Watch Page Endpoint**: Provides HLS player interface

**Core Functions:**
- `createHLSStream()`: Creates PlainTransports, spawns FFmpeg process
- `stopHLSStream()`: Cleanly stops FFmpeg and closes transports
- Socket events: `startHLS`, `stopHLS` for client control

**FFmpeg Command:**
```bash
ffmpeg -y -loglevel info \
  -f rtp -i rtp://127.0.0.1:${audioPort} \
  -f rtp -i rtp://127.0.0.1:${videoPort} \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -c:a aac -b:a 128k \
  -f hls -hls_time 2 -hls_list_size 5 \
  -hls_flags delete_segments+append_list \
  -hls_allow_cache 0 \
  ${streamDir}/stream.m3u8
```

### Client-Side (React + HLS.js)

**Components:**
1. **HLSControls**: Start/stop HLS streaming controls
2. **Watch Page**: HLS player with URL parameter support
3. **Stream Page Integration**: Added HLS controls to existing stream page

**Features:**
- One-click HLS stream creation
- Copy HLS URL to clipboard
- Direct watch page opening
- URL parameter support for stream sharing

## Usage Instructions

### 1. Start WebRTC Stream
1. Go to `/stream` page
2. Click "Start Stream" to begin WebRTC streaming
3. Allow camera/microphone permissions

### 2. Start HLS Streaming
1. In the HLS Controls section, click "Start HLS Stream"
2. Copy the generated HLS URL
3. Click "Watch" to open the stream in a new tab

### 3. Watch HLS Stream
1. Go to `/watch` page
2. Paste the HLS URL or use the direct link
3. Click "Load Stream" to start watching

## Technical Implementation

### Server Configuration
```typescript
// PlainTransport creation
const audioTransport = await router.createPlainTransport({
  listenIp: { ip: '127.0.0.1' },
  rtcpMux: false,
  comedia: false,
});

// Consumer creation
await audioTransport.consume({
  producerId: audioProducer.id,
  rtpCapabilities: router.rtpCapabilities,
});
```

### HLS File Structure
```
hls/
├── stream_${socketId}_${timestamp}/
│   ├── stream.m3u8 (playlist)
│   ├── stream0.ts (segment)
│   ├── stream1.ts (segment)
│   └── ...
```

### API Endpoints
- `GET /hls/*` - Serves HLS files (.m3u8, .ts)
- `GET /watch/:streamId` - HLS player page
- Socket events: `startHLS`, `stopHLS`

## Requirements

**Server Dependencies:**
- FFmpeg (must be installed and accessible in PATH)
- mediasoup
- socket.io

**Client Dependencies:**
- HLS.js (loaded via CDN)
- React components

## Key Features

✅ **Minimal Implementation**: ~200 lines of additional server code
✅ **Maximum Abstraction**: Uses mediasoup PlainTransport API
✅ **Real-time Streaming**: 2-second HLS segments for low latency
✅ **Auto Cleanup**: Automatic resource cleanup on disconnect
✅ **Multi-stream Support**: Handles both audio and video tracks
✅ **Browser Compatibility**: Works with HLS.js and native HLS support

## Testing

1. **Start Server**: `cd apps/server && npm run dev`
2. **Start Web Client**: `cd apps/web && npm run dev`
3. **Open Browser**: Navigate to `http://localhost:3001/stream`
4. **Test WebRTC**: Start camera/microphone stream
5. **Test HLS**: Click "Start HLS Stream" and watch via generated URL

## Architecture Benefits

- **Separation of Concerns**: WebRTC P2P remains independent
- **Scalable**: FFmpeg handles the heavy lifting
- **Standards-Based**: Uses standard HLS protocol
- **Low Latency**: 2-second segments minimize delay
- **Resource Efficient**: Automatic cleanup prevents memory leaks

This implementation provides a production-ready foundation for WebRTC to HLS streaming with minimal complexity and maximum reliability.