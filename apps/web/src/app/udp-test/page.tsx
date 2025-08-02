"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ICECandidate {
  ip: string;
  port: number;
  type: string;
}

interface MediasoupHealthResponse {
  success: boolean;
  error?: string;
  router: {
    id: string;
  };
  rtpCapabilitiesCount: number;
  transport: {
    iceCandidates: ICECandidate[];
  };
  config: {
    WEBRTC_LISTEN_IP: string;
    ANNOUNCED_IP: string;
  };
}

interface WebRTCConnectionTestResponse {
  error?: string;
  transportId: string;
  iceCandidates: ICECandidate[];
}

export default function UDPTestPage() {
  const [message, setMessage] = useState("hello from browser");
  const [responses, setResponses] = useState<
    Array<{ id: string; text: string }>
  >([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  const connectSocket = () => {
    try {
      const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL, {
        transports: ["websocket"],
      });

      newSocket.on("connect", () => {
        setIsConnected(true);
        setSocket(newSocket);
        addResponse("✅ Socket.IO connected to server");
      });

      newSocket.on("udp-test-response", (data) => {
        if (data.success) {
          addResponse(`📨 UDP Success: ${data.message}`);
        } else {
          addResponse(`❌ UDP Failed: ${data.error}`);
        }
      });

      newSocket.on("disconnect", () => {
        setIsConnected(false);
        setSocket(null);
        addResponse("❌ Socket.IO disconnected");
      });

      newSocket.on("connect_error", (error) => {
        addResponse(`❌ Connection error: ${error.message}`);
      });
    } catch (error) {
      addResponse(`❌ Failed to connect: ${error}`);
    }
  };

  const testUDPViaSocket = () => {
    if (!socket || !socket.connected) {
      addResponse("❌ Socket.IO not connected");
      return;
    }

    // Send a test message via Socket.IO that the server will forward to UDP
    const testData = {
      message: message,
      timestamp: new Date().toISOString(),
    };

    socket.emit("udp-test", testData);
    addResponse(`📤 Sent UDP test via Socket.IO: "${message}"`);
  };

  const testHTTPEndpoint = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/udp-test`);
      const data = await response.json();
      addResponse(`📡 HTTP Response: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      addResponse(`❌ HTTP request failed: ${error}`);
    }
  };

  const testWebRTCCapabilities = async () => {
    try {
      // Test if WebRTC is available
      const pc = new RTCPeerConnection();
      addResponse("✅ WebRTC RTCPeerConnection available");

      // Test getUserMedia
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      addResponse("✅ Media devices accessible");
      stream.getTracks().forEach((track) => track.stop());

      pc.close();
    } catch (error) {
      addResponse(`❌ WebRTC test failed: ${error}`);
    }
  };

  const testMediasoupHealth = () => {
    if (!socket || !socket.connected) {
      addResponse("❌ Socket.IO not connected");
      return;
    }

    addResponse("🔍 Testing Mediasoup health...");

    socket.emit(
      "mediasoup-health-check",
      {},
      (response: MediasoupHealthResponse) => {
        if (response.success) {
          addResponse("✅ Mediasoup router healthy");
          addResponse(`📊 Router ID: ${response.router.id}`);
          addResponse(`📊 RTP Codecs: ${response.rtpCapabilitiesCount}`);
          addResponse("🚀 Transport created successfully");
          addResponse(
            `📡 ICE Candidates: ${response.transport.iceCandidates.length}`,
          );

          // Show ICE candidates details
          response.transport.iceCandidates.forEach(
            (candidate: ICECandidate, index: number) => {
              addResponse(
                `🧊 ICE[${index}]: ${candidate.ip}:${candidate.port} (${candidate.type})`,
              );
            },
          );

          addResponse(
            `⚙️ WEBRTC_LISTEN_IP: ${response.config.WEBRTC_LISTEN_IP}`,
          );
          addResponse(`🌐 ANNOUNCED_IP: ${response.config.ANNOUNCED_IP}`);

          // Show potential issues
          if (
            response.config.ANNOUNCED_IP !== "127.0.0.1" &&
            response.config.ANNOUNCED_IP !== "localhost"
          ) {
            addResponse(
              "⚠️ WARNING: ANNOUNCED_IP is public IP but testing locally",
            );
            addResponse("💡 For local testing, try ANNOUNCED_IP=127.0.0.1");
          }
        } else {
          addResponse(`❌ Mediasoup health check failed: ${response.error}`);
          addResponse(
            `⚙️ WEBRTC_LISTEN_IP: ${response.config.WEBRTC_LISTEN_IP}`,
          );
          addResponse(`🌐 ANNOUNCED_IP: ${response.config.ANNOUNCED_IP}`);
        }
      },
    );
  };

  const testWebRTCConnection = () => {
    if (!socket || !socket.connected) {
      addResponse("❌ Socket.IO not connected");
      return;
    }

    addResponse("🔗 Testing real WebRTC connection...");

    socket.emit(
      "webrtc-connection-test",
      {},
      async (response: WebRTCConnectionTestResponse) => {
        if (response.error) {
          addResponse(
            `❌ Server failed to create transport: ${response.error}`,
          );
          return;
        }

        addResponse("✅ Server created WebRTC transport");
        addResponse(`🆔 Transport ID: ${response.transportId}`);

        // Show ICE candidates
        response.iceCandidates.forEach(
          (candidate: ICECandidate, index: number) => {
            addResponse(
              `🧊 ICE[${index}]: ${candidate.ip}:${candidate.port} (${candidate.type})`,
            );
          },
        );

        // Create RTCPeerConnection and attempt actual connection
        const pc = new RTCPeerConnection({
          iceServers: [],
        });

        let _iceConnectionComplete = false;

        pc.oniceconnectionstatechange = () => {
          addResponse(`🧊 Browser ICE State: ${pc.iceConnectionState}`);
          if (
            pc.iceConnectionState === "connected" ||
            pc.iceConnectionState === "completed"
          ) {
            _iceConnectionComplete = true;
            addResponse("✅ ICE connection successful!");
          } else if (pc.iceConnectionState === "failed") {
            addResponse("❌ ICE connection failed - IP/port not reachable");
          }
        };

        pc.onicegatheringstatechange = () => {
          addResponse(`🧊 ICE Gathering: ${pc.iceGatheringState}`);
        };

        pc.onconnectionstatechange = () => {
          addResponse(`🔗 Connection State: ${pc.connectionState}`);
        };

        try {
          // Try to connect using the server's transport parameters
          addResponse("🔄 Creating offer...");

          // Add a fake data channel to trigger connection
          pc.createDataChannel("test");

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          addResponse("✅ Created offer, gathering ICE candidates...");

          // Wait for ICE gathering to complete
          await new Promise<void>((resolve) => {
            if (pc.iceGatheringState === "complete") {
              resolve();
            } else {
              pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === "complete") {
                  resolve();
                }
              };
            }
          });

          addResponse("✅ ICE gathering complete");
          const candidateCount =
            pc.localDescription?.sdp?.split("a=candidate:")?.length ?? 1;
          addResponse(`📊 Browser gathered ${candidateCount - 1} candidates`);

          // Check if any browser candidates match server candidates
          const browserCandidates =
            pc.localDescription?.sdp.match(/a=candidate:[^\r\n]+/g) || [];
          const serverIPs = response.iceCandidates.map(
            (c: ICECandidate) => c.ip,
          );

          // Show browser IPs
          const browserIPs = new Set<string>();
          browserCandidates.forEach((candidate: string) => {
            const ip = candidate.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1];
            if (ip) browserIPs.add(ip);
          });

          addResponse(`🖥️ Browser IPs: ${Array.from(browserIPs).join(", ")}`);
          addResponse(`🐳 Server IPs: ${serverIPs.join(", ")}`);

          let hasMatchingNetwork = false;
          browserIPs.forEach((browserIP) => {
            if (serverIPs.includes(browserIP)) {
              hasMatchingNetwork = true;
              addResponse(`✅ Found matching network: ${browserIP}`);
            }
          });

          if (!hasMatchingNetwork) {
            addResponse("❌ No matching networks between browser and server");
            addResponse(
              "💡 Browser and server are on different networks - this is the issue!",
            );
          }

          setTimeout(() => {
            addResponse(
              `🔍 Final result: ICE=${pc.iceConnectionState}, Connection=${pc.connectionState}`,
            );
            pc.close();
          }, 3000);
        } catch (error) {
          addResponse(`❌ WebRTC connection failed: ${error}`);
          pc.close();
        }
      },
    );
  };

  const addResponse = (response: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setResponses((prev) => [
      ...prev,
      {
        id,
        text: `${new Date().toLocaleTimeString()}: ${response}`,
      },
    ]);
  };

  const clearResponses = () => {
    setResponses([]);
  };

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>UDP & WebRTC Connectivity Test</CardTitle>
          <CardDescription>
            Test UDP connectivity and WebRTC capabilities from the browser
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
            <Button onClick={connectSocket} disabled={isConnected}>
              Connect Socket.IO
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Test message"
              className="flex-1"
            />
            <Button onClick={testUDPViaSocket} disabled={!isConnected}>
              Test UDP Echo
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={testHTTPEndpoint} variant="outline">
              Test HTTP Endpoint
            </Button>
            <Button onClick={testWebRTCCapabilities} variant="outline">
              Test WebRTC
            </Button>
            <Button
              onClick={testMediasoupHealth}
              variant="outline"
              disabled={!isConnected}
            >
              Test Mediasoup
            </Button>
            <Button
              onClick={testWebRTCConnection}
              variant="outline"
              disabled={!isConnected}
            >
              Test WebRTC Connection
            </Button>
            <Button onClick={clearResponses} variant="outline">
              Clear
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto rounded border border-gray-600 bg-black p-4 text-green-400">
                {responses.length === 0 ? (
                  <p className="text-gray-400">No responses yet...</p>
                ) : (
                  responses.map((response) => (
                    <div key={response.id} className="mb-2 font-mono text-sm">
                      {response.text}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                <li>Click "Connect Socket.IO" to establish connection</li>
                <li>Use "Test HTTP Endpoint" to verify server is responding</li>
                <li>Use "Test WebRTC" to check browser WebRTC capabilities</li>
                <li>
                  Use "Test UDP Echo" to send messages via Socket.IO for UDP
                  testing
                </li>
                <li>
                  <strong>
                    Use "Test Mediasoup" to check Mediasoup configuration and
                    health
                  </strong>
                </li>
                <li>
                  Watch the server logs with:{" "}
                  <code className="rounded bg-gray-800 px-2 py-1 text-green-400">
                    docker-compose logs -f fermion-server
                  </code>
                </li>
              </ol>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
