import type { Consumer } from "mediasoup/types";

export function generateCompositeSDP(
  audioConsumers: Consumer[],
  videoConsumers: Consumer[],
  basePort: number
): string {
  let sdp = "v=0\r\n";
  sdp += "o=- 0 0 IN IP4 127.0.0.1\r\n";
  sdp += "s=FFmpeg\r\n";
  sdp += "c=IN IP4 127.0.0.1\r\n";
  sdp += "t=0 0\r\n";

  let currentPort = basePort;

  audioConsumers.forEach((consumer) => {
    const codec = consumer.rtpParameters.codecs[0];
    sdp += `m=audio ${currentPort} RTP/AVP ${codec.payloadType}\r\n`;
    sdp += `a=rtpmap:${codec.payloadType} ${codec.mimeType.split("/")[1]}/${
      codec.clockRate
    }/${codec.channels}\r\n`;
    sdp += "a=sendonly\r\n";
    currentPort += 2;
  });

  videoConsumers.forEach((consumer) => {
    const codec = consumer.rtpParameters.codecs[0];
    sdp += `m=video ${currentPort} RTP/AVP ${codec.payloadType}\r\n`;
    sdp += `a=rtpmap:${codec.payloadType} ${codec.mimeType.split("/")[1]}/${
      codec.clockRate
    }\r\n`;
    sdp += "a=sendonly\r\n";
    currentPort += 2;
  });

  return sdp;
}
