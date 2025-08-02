"use client";

import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function UDPTestPage() {
	const [message, setMessage] = useState("hello from browser");
	const [responses, setResponses] = useState<string[]>([]);
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
			const newSocket = io("http://localhost:3000", {
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
			timestamp: new Date().toISOString()
		};

		socket.emit("udp-test", testData);
		addResponse(`📤 Sent UDP test via Socket.IO: "${message}"`);
	};

	const testHTTPEndpoint = async () => {
		try {
			const response = await fetch("http://localhost:3000/udp-test");
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
			const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
			addResponse("✅ Media devices accessible");
			stream.getTracks().forEach(track => track.stop());
			
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
		
		socket.emit("mediasoup-health-check", {}, (response: any) => {
			if (response.success) {
				addResponse("✅ Mediasoup router healthy");
				addResponse(`📊 Router ID: ${response.router.id}`);
				addResponse(`📊 RTP Codecs: ${response.router.rtpCapabilitiesCount}`);
				addResponse(`🚀 Transport created successfully`);
				addResponse(`📡 ICE Candidates: ${response.transport.iceCandidates.length}`);
				
				// Show ICE candidates details
				response.transport.iceCandidates.forEach((candidate: any, index: number) => {
					addResponse(`🧊 ICE[${index}]: ${candidate.ip}:${candidate.port} (${candidate.type})`);
				});
				
				addResponse(`⚙️ WEBRTC_LISTEN_IP: ${response.config.WEBRTC_LISTEN_IP}`);
				addResponse(`🌐 ANNOUNCED_IP: ${response.config.ANNOUNCED_IP}`);
				
				// Show potential issues
				if (response.config.ANNOUNCED_IP !== '127.0.0.1' && response.config.ANNOUNCED_IP !== 'localhost') {
					addResponse(`⚠️ WARNING: ANNOUNCED_IP is public IP but testing locally`);
					addResponse(`💡 For local testing, try ANNOUNCED_IP=127.0.0.1`);
				}
			} else {
				addResponse(`❌ Mediasoup health check failed: ${response.error}`);
				addResponse(`⚙️ WEBRTC_LISTEN_IP: ${response.config.WEBRTC_LISTEN_IP}`);
				addResponse(`🌐 ANNOUNCED_IP: ${response.config.ANNOUNCED_IP}`);
			}
		});
	};

	const testWebRTCConnection = () => {
		if (!socket || !socket.connected) {
			addResponse("❌ Socket.IO not connected");
			return;
		}

		addResponse("🔗 Testing real WebRTC connection...");
		
		socket.emit("webrtc-connection-test", {}, async (response: any) => {
			if (response.error) {
				addResponse(`❌ Server failed to create transport: ${response.error}`);
				return;
			}
			
			addResponse("✅ Server created WebRTC transport");
			addResponse(`🆔 Transport ID: ${response.transportId}`);
			
			// Show ICE candidates
			response.iceCandidates.forEach((candidate: any, index: number) => {
				addResponse(`🧊 ICE[${index}]: ${candidate.ip}:${candidate.port} (${candidate.type})`);
			});
			
			// Create RTCPeerConnection and attempt actual connection
			const pc = new RTCPeerConnection({
				iceServers: []
			});
			
			let iceConnectionComplete = false;
			
			pc.oniceconnectionstatechange = () => {
				addResponse(`🧊 Browser ICE State: ${pc.iceConnectionState}`);
				if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
					iceConnectionComplete = true;
					addResponse("✅ ICE connection successful!");
				} else if (pc.iceConnectionState === 'failed') {
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
					if (pc.iceGatheringState === 'complete') {
						resolve();
					} else {
						pc.onicegatheringstatechange = () => {
							if (pc.iceGatheringState === 'complete') {
								resolve();
							}
						};
					}
				});
				
				addResponse("✅ ICE gathering complete");
				addResponse(`📊 Browser gathered ${pc.localDescription?.sdp.split('a=candidate:').length - 1} candidates`);
				
				// Check if any browser candidates match server candidates
				const browserCandidates = pc.localDescription?.sdp.match(/a=candidate:[^\r\n]+/g) || [];
				const serverIPs = response.iceCandidates.map((c: any) => c.ip);
				
				// Show browser IPs
				const browserIPs = new Set<string>();
				browserCandidates.forEach((candidate: string) => {
					const ip = candidate.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1];
					if (ip) browserIPs.add(ip);
				});
				
				addResponse(`🖥️ Browser IPs: ${Array.from(browserIPs).join(', ')}`);
				addResponse(`🐳 Server IPs: ${serverIPs.join(', ')}`);
				
				let hasMatchingNetwork = false;
				browserIPs.forEach((browserIP) => {
					if (serverIPs.includes(browserIP)) {
						hasMatchingNetwork = true;
						addResponse(`✅ Found matching network: ${browserIP}`);
					}
				});
				
				if (!hasMatchingNetwork) {
					addResponse("❌ No matching networks between browser and server");
					addResponse("💡 Browser and server are on different networks - this is the issue!");
				}
				
				setTimeout(() => {
					addResponse(`🔍 Final result: ICE=${pc.iceConnectionState}, Connection=${pc.connectionState}`);
					pc.close();
				}, 3000);
				
			} catch (error) {
				addResponse(`❌ WebRTC connection failed: ${error}`);
				pc.close();
			}
		});
	};

	const addResponse = (response: string) => {
		setResponses(prev => [...prev, `${new Date().toLocaleTimeString()}: ${response}`]);
	};

	const clearResponses = () => {
		setResponses([]);
	};

	return (
		<div className="container mx-auto p-4 max-w-4xl">
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

					<div className="flex gap-2 flex-wrap">
						<Button onClick={testHTTPEndpoint} variant="outline">
							Test HTTP Endpoint
						</Button>
						<Button onClick={testWebRTCCapabilities} variant="outline">
							Test WebRTC
						</Button>
						<Button onClick={testMediasoupHealth} variant="outline" disabled={!isConnected}>
							Test Mediasoup
						</Button>
						<Button onClick={testWebRTCConnection} variant="outline" disabled={!isConnected}>
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
							<div className="bg-black text-green-400 p-4 rounded max-h-96 overflow-y-auto border border-gray-600">
								{responses.length === 0 ? (
									<p className="text-gray-400">No responses yet...</p>
								) : (
									responses.map((response, index) => (
										<div key={index} className="mb-2 font-mono text-sm">
											{response}
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
							<ol className="list-decimal list-inside space-y-2 text-sm">
								<li>Click "Connect Socket.IO" to establish connection</li>
								<li>Use "Test HTTP Endpoint" to verify server is responding</li>
								<li>Use "Test WebRTC" to check browser WebRTC capabilities</li>
								<li>Use "Test UDP Echo" to send messages via Socket.IO for UDP testing</li>
								<li><strong>Use "Test Mediasoup" to check Mediasoup configuration and health</strong></li>
								<li>Watch the server logs with: <code className="bg-gray-800 text-green-400 px-2 py-1 rounded">docker-compose logs -f fermion-server</code></li>
							</ol>
						</CardContent>
					</Card>
				</CardContent>
			</Card>
		</div>
	);
}