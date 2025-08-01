export const hlsConfig = {
  liveDurationInfinity: true,
  autoStartLoad: false,
  backBufferLength: Number.POSITIVE_INFINITY,
  liveBackBufferLength: 0,
  maxBufferLength: 30,
  maxBufferSize: 100 * 1000 * 1000,
  enableWorker: true,
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 8000,
      maxLoadTimeMs: 20000,
      errorRetry: {
        maxNumRetry: 6,
        retryDelayMs: 500,
        maxRetryDelayMs: 4000,
      },
      timeoutRetry: {
        maxNumRetry: 4,
        retryDelayMs: 0,
        maxRetryDelayMs: 0,
      },
    },
  },
  startFragPrefetch: true,
  appendErrorMaxRetry: 3,
  nudgeMaxRetry: 5,
};
