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
				addResponse(`⚙️ WEBRTC_LISTEN_IP: ${response.config.WEBRTC_LISTEN_IP}`);
				addResponse(`🌐 ANNOUNCED_IP: ${response.config.ANNOUNCED_IP}`);
			} else {
				addResponse(`❌ Mediasoup health check failed: ${response.error}`);
				addResponse(`⚙️ WEBRTC_LISTEN_IP: ${response.config.WEBRTC_LISTEN_IP}`);
				addResponse(`🌐 ANNOUNCED_IP: ${response.config.ANNOUNCED_IP}`);
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