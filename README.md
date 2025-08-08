# Fermion Assignment - WebRTC Video Conferencing with HLS Streaming

A full-stack WebRTC video conferencing application with live HLS streaming capabilities, built for the Fermion assignment.

## Demo & Links

- **GitHub**: https://github.com/RutamBhagat/fermion-task
- **Video Demo**: https://drive.google.com/file/d/1eB_D3mIyDQxyEp4gjj7IhXkRNfF77hIW/view?usp=sharing
- **Frontend**: https://fermion-task-web.vercel.app/stream
- **Backend**: https://ec2-3-110-48-224.ap-south-1.compute.amazonaws.com

## Assignment Requirements Fulfilled

✅ **Page 1: `stream`** - Multi-user WebRTC video conferencing  
✅ **Page 2: `watch`** - Live HLS streaming with DVR functionality  
✅ **User Journey**: Users can video conference on `/stream`, viewers can watch live on `/watch`  
✅ **No Blackbox Solutions**: Uses Mediasoup SFU (not LiveKit)  
✅ **Functional Locally**: Complete local development setup

## Key Technical Features

### WebRTC Video Conferencing
- **Mediasoup SFU**: Scalable video conferencing architecture
- **Multi-user Support**: Real-time video/audio with multiple participants
- **Socket.IO Signaling**: WebRTC connection management and room coordination

### HLS Live Streaming with DVR
- **WebRTC to HLS Conversion**: FFmpeg transcoding with composite video streams
- **DVR Functionality**: Time-shifting, backward seeking during live streams
- **Advanced Buffer Management**: Solved HLS live-edge jumping issues
- **React Player Integration**: Custom HLS configuration for optimal DVR experience

### Production Considerations
- **Docker Compose Ready**: Container orchestration for deployment
- **Resource Cleanup**: Automatic HLS segment cleanup and memory management  
- **Error Handling**: Comprehensive error recovery for WebRTC and HLS streams
- **Monitoring**: Performance tracking and health checks

## Common Development Commands

### Development Server
- `npm install` - Install dependencies for all workspaces
- `npm run dev` - Start both web and server in development mode (web on :3001, server on :3000)
- `npm run dev:web` - Start only the Next.js web app (port 3001)
- `npm run dev:server` - Start only the Hono server (port 3000)

### Build & Type Checking
- `npm run build` - Build all apps using Turbo
- `npm run check-types` - TypeScript type checking across all workspaces
- `npm run check` - Run Biome formatting and linting with auto-fix

### Individual App Commands
**Web App** (`apps/web/`):
- `npm run dev` - Next.js dev server with Turbopack
- `npm run build` - Production build
- `npm run start` - Start production build
- `npm run lint` - ESLint checking

**Server** (`apps/server/`):
- `npm run dev` - Development with tsx watch
- `npm run build` - Build with tsdown
- `npm run start` - Start built server
- `npm run compile` - Compile to binary with Bun
- `npm run check-types` - TypeScript checking

## Architecture Overview

### Project Structure
This is a **Turborepo monorepo** with two main applications:

- **`apps/web/`** - Next.js 15 frontend with React 19
- **`apps/server/`** - Hono server with Socket.IO and Mediasoup

### Technology Stack

#### Frontend (`apps/web/`)
- **Framework**: Next.js 15 with React 19 and TypeScript
- **Styling**: TailwindCSS 4.x with shadcn/ui components
- **WebRTC**: mediasoup-client for SFU
- **State Management**: React Query (TanStack Query)
- **Real-time**: Socket.IO client
- **Build**: Turbopack for development

#### Backend (`apps/server/`)
- **Framework**: Hono (lightweight Node.js framework)
- **WebRTC**: Mediasoup SFU for scalable video conferencing
- **Real-time**: Socket.IO for signaling
- **Streaming**: HLS stream generation and serving
- **Runtime**: Node.js with TypeScript

### Key Application Features

#### WebRTC Video Conferencing
- **P2P Mode**: Direct peer-to-peer connections
- **SFU Mode**: Scalable video conferencing using Mediasoup
- **Room System**: Meeting rooms with generated IDs (format: `abc-def-ghi`)
- **Media Controls**: Camera, microphone, screen sharing controls

#### HLS Live Streaming
- **WebRTC to HLS**: Convert real-time WebRTC streams to HLS format
- **Watch Pages**: `/watch/[streamId]` for HLS playback
- **Stream Management**: Automatic cleanup of old HLS segments

### Core Hooks and Services

#### Custom Hooks (`apps/web/src/hooks/`)
- `use-webrtc.ts` - WebRTC connection management
- `use-socket.ts` - Socket.IO communication
- `use-media-devices.ts` - Camera/microphone access
- `use-hls-player.ts` - HLS video player with error recovery
- `use-hls-stream.ts` - HLS stream management
- `use-video-grid.ts` - Video layout management

#### Server Services (`apps/server/src/services/`)
- `mediasoup.ts` - Mediasoup SFU initialization and management
- `room.ts` - Room state and participant management
- `hls.ts` - HLS stream generation and cleanup
- `monitoring.ts` - Performance monitoring

### Important Implementation Details

#### WebRTC Configuration
- Uses **Mediasoup SFU** for scalable conferencing (not blackbox solutions like LiveKit)
- **PeerJS fallback** for simple P2P connections
- HTTPS required for WebRTC (browsers enforce this)

#### HLS Streaming
- Server generates HLS segments at `/hls/{streamId}/`
- Automatic stream availability checking with retry logic
- Clean-up of old HLS directories when streams stop

#### Room Management
- Meeting IDs generated as 3 segments of 3 lowercase letters (e.g., "abc-def-ghi")
- Rooms support multiple participants via Mediasoup SFU
- Socket.IO handles signaling between peers

## Development Workflow

1. **Start Development**: `npm run dev` (starts both web and server)
2. **Type Checking**: `npm run check-types` before committing
3. **Code Quality**: `npm run check` for formatting/linting
4. **Testing WebRTC**: Open multiple browser tabs to simulate multiple users
5. **HLS Testing**: Create stream, then visit `/watch/[streamId]` to test HLS playback

## Configuration Files

- **`turbo.json`** - Turborepo build pipeline configuration
- **`biome.json`** - Code formatting and linting rules (tabs, double quotes)
- **`apps/web/components.json`** - shadcn/ui component configuration
- **`apps/server/src/config/mediasoup.ts`** - Mediasoup SFU configuration

## Environment Setup

- **Node.js**: Uses npm package manager (v10.9.2)
- **HTTPS**: Required for WebRTC - use `localhost` with HTTPS in production
- **Ports**: Web (3001), Server (3000)
- **CORS**: Server configured for cross-origin requests

## Infrastructure Notes

### Current Deployment Limitations
- **AWS t2.micro**: Free tier instance gets resource-exhausted during HLS transcoding
- **Self-signed SSL**: Backend uses self-signed certificate (visit backend URL to trust)
- **HLS Storage**: Local disk storage (production would use CloudFlare R2 + CDN)

### Production Recommendations
- **Instance Type**: c7g.large or better for FFmpeg processing (63% better performance)
- **SSL Certificate**: Domain + Let's Encrypt for proper HTTPS
- **Storage**: CloudFlare R2 with CDN for HLS segment distribution
- **Scaling**: Redis state sharing for multi-instance deployment

## Technical Challenges Solved

### DVR Implementation
The most complex technical challenge was implementing true DVR functionality for HLS streams:

- **Live Edge Jumping**: Solved with `liveDurationInfinity: true` configuration
- **Infinite Back Buffer**: Allows unlimited backward seeking during live streams  
- **Memory Management**: Balanced infinite history with controlled forward buffering
- **React Player Integration**: Optimized HLS.js configuration within React Player

### WebRTC to HLS Pipeline
- **Multi-stream Composition**: FFmpeg xstack filter for grid layout
- **Format Conversion**: Mediasoup PlainTransport to stable RTP streams
- **Resource Management**: Automatic process cleanup and port allocation

## Known Limitations (Scope Decisions)

- **Single Composite Stream**: One HLS stream per room (expandable with worker pools)
- **Late Join Handling**: Participants must join before HLS starts
- **Horizontal Scaling**: Single-server implementation (designed for Redis scaling)
- **Storage Strategy**: Local disk vs production CDN distribution

These limitations represent intentional scope decisions demonstrating production awareness rather than technical constraints.