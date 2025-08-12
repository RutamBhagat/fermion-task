# Multi-Worker MediaSoup Implementation

## Overview

This implementation creates multiple MediaSoup workers to distribute room load across CPU cores, improving performance and scalability.

## Key Features

### 1. **Multiple Workers**
- Configurable worker count via `MEDIASOUP_WORKER_COUNT` (default: 4)
- Each worker gets isolated RTC port ranges (1000 ports per worker)
- Worker 0: 10000-10999, Worker 1: 11000-11999, etc.

### 2. **Intelligent Load Balancing**
- **Room Count Priority**: Distributes rooms evenly across workers
- **CPU Usage Monitoring**: Considers worker CPU usage when selecting
- **Last Used Time**: Round-robin for workers with similar load

### 3. **Resource Monitoring**
- Real-time CPU usage tracking per worker
- Room count tracking per worker
- Worker health monitoring

### 4. **API Endpoints**
- `GET /stats` - Complete system overview with room distribution
- `GET /workers` - Worker-specific statistics

## Configuration

### Environment Variables

```bash
# Number of MediaSoup workers (default: 4)
MEDIASOUP_WORKER_COUNT=4

# Base IP for WebRTC (default: 127.0.0.1)
WEBRTC_LISTEN_IP=127.0.0.1

# Announced IP for external connections
ANNOUNCED_IP=your.public.ip
```

### Port Allocation

Each worker gets a dedicated port range:
- **Worker 0**: 10000-10999
- **Worker 1**: 11000-11999  
- **Worker 2**: 12000-12999
- **Worker 3**: 13000-13999

## Load Balancing Algorithm

When creating a new room, the system:

1. **Checks room count** - Selects worker with fewest rooms
2. **Evaluates CPU usage** - If room counts are equal, chooses worker with lower CPU
3. **Uses round-robin** - If CPU usage is similar, uses least recently used worker

## Benefits

### Performance
- **CPU Distribution**: Spreads load across multiple cores
- **Memory Isolation**: Each worker has isolated memory space
- **Better Fault Tolerance**: One worker failure doesn't affect others

### Scalability
- **Horizontal Scaling**: Can easily increase worker count
- **Resource Monitoring**: Real-time visibility into system load
- **Dynamic Load Balancing**: Automatically adapts to changing conditions

## Monitoring

### Real-time Statistics

```bash
# Get complete system overview
curl http://localhost:3000/stats

# Get worker-specific information
curl http://localhost:3000/workers
```

### Example Response

```json
{
  "workers": [
    {
      "workerId": 0,
      "roomCount": 3,
      "cpuUsage": 0.25,
      "pid": 12345,
      "closed": false
    }
  ],
  "distribution": {
    "0": ["room1", "room2", "room3"],
    "1": ["room4", "room5"]
  },
  "totalRooms": 5
}
```

## Implementation Details

### Files Modified

1. **`services/mediasoup.ts`**
   - Multi-worker initialization
   - Load balancing logic
   - Resource monitoring

2. **`services/room.ts`**
   - Worker-aware room creation
   - Room-to-worker mapping
   - Cleanup handling

3. **`index.ts`**
   - Monitoring endpoints
   - Statistics API

### Key Functions

- `initMediasoup()` - Initializes all workers
- `getLeastLoadedWorker()` - Selects optimal worker
- `getWorkerStats()` - Returns worker statistics
- `getRoomDistribution()` - Shows room distribution across workers

## Best Practices

### Production Deployment

1. **Set worker count** to match CPU cores: `MEDIASOUP_WORKER_COUNT=8`
2. **Configure firewall** for port ranges: 10000-18000
3. **Monitor worker health** using `/stats` endpoint
4. **Use process manager** (PM2) for automatic restarts

### Scaling Recommendations

- **Small servers (2-4 cores)**: 2-4 workers
- **Medium servers (8-16 cores)**: 4-8 workers  
- **Large servers (32+ cores)**: 8-16 workers

### Network Configuration

Ensure firewall allows:
- TCP ports: Base port range (10000 + worker_count * 1000)
- UDP ports: Same range as TCP
- HTTP/WebSocket: 3000 (or configured PORT)

This implementation provides a robust foundation for scaling MediaSoup applications across multiple CPU cores while maintaining optimal performance and reliability.