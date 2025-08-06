import type { Consumer } from "mediasoup/types";

export function generateCompositeSDP(
  audioConsumers: Consumer[],
  videoConsumers: Consumer[],
  basePort: number
): string {
  const sdpParts = [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=FFmpeg",
    "c=IN IP4 127.0.0.1",
    "t=0 0",
  ];

  let currentPort = basePort;

  audioConsumers.forEach((consumer) => {
    const codec = consumer.rtpParameters.codecs[0];
    sdpParts.push(
      `m=audio ${currentPort} RTP/AVP ${codec.payloadType}`,
      `a=rtpmap:${codec.payloadType} ${codec.mimeType.split("/")[1]}/${
        codec.clockRate
      }/${codec.channels}`,
      "a=sendonly"
    );
    currentPort += 2;
  });

  videoConsumers.forEach((consumer) => {
    const codec = consumer.rtpParameters.codecs[0];
    sdpParts.push(
      `m=video ${currentPort} RTP/AVP ${codec.payloadType}`,
      `a=rtpmap:${codec.payloadType} ${codec.mimeType.split("/")[1]}/${
        codec.clockRate
      }`,
      "a=sendonly"
    );
    currentPort += 2;
  });

  return sdpParts.join("\r\n") + "\r\n";
}
