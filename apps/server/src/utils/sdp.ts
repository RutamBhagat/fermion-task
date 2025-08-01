import type * as mediasoup from "mediasoup";

export function generateCompositeSDP(
  audioConsumers: mediasoup.types.Consumer[],
  videoConsumers: mediasoup.types.Consumer[],
  basePort: number,
): string {
  let sdp = "v=0\r\n";
  sdp += "o=- 0 0 IN IP4 127.0.0.1\r\n";
  sdp += "s=FFmpeg\r\n";
  sdp += "c=IN IP4 127.0.0.1\r\n";
  sdp += "t=0 0\r\n";

  let currentPort = basePort;

  audioConsumers.forEach((consumer, _i) => {
    const audioCodec = consumer.rtpParameters.codecs[0];
    const audioPayloadType = audioCodec.payloadType;
    const audioPort = currentPort;
    currentPort += 2;

    sdp += `m=audio ${audioPort} RTP/AVP ${audioPayloadType}\r\n`;
    sdp += `a=rtpmap:${audioPayloadType} ${audioCodec.mimeType.split("/")[1]}/${audioCodec.clockRate}`;

    if (audioCodec.channels && audioCodec.channels > 1) {
      sdp += `/${audioCodec.channels}`;
    }
    sdp += "\r\n";
    sdp += "a=sendonly\r\n";

    if (consumer.rtpParameters.encodings?.[0]?.ssrc) {
      sdp += `a=ssrc:${consumer.rtpParameters.encodings[0].ssrc} cname:mediasoup\r\n`;
    }
  });

  videoConsumers.forEach((consumer, _i) => {
    const videoCodec = consumer.rtpParameters.codecs[0];
    const videoPayloadType = videoCodec.payloadType;
    const videoPort = currentPort;
    currentPort += 2;

    sdp += `m=video ${videoPort} RTP/AVP ${videoPayloadType}\r\n`;
    sdp += `a=rtpmap:${videoPayloadType} ${videoCodec.mimeType.split("/")[1]}/${videoCodec.clockRate}\r\n`;
    sdp += "a=sendonly\r\n";

    if (consumer.rtpParameters.encodings?.[0]?.ssrc) {
      sdp += `a=ssrc:${consumer.rtpParameters.encodings[0].ssrc} cname:mediasoup\r\n`;
    }
  });

  return sdp;
}
