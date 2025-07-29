'use client';

import { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StreamPage() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [myId, setMyId] = useState<string>('');
  const [remoteId, setRemoteId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Not connected');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Initialize PeerJS
    const peerInstance = new Peer();
    setPeer(peerInstance);

    // Get my ID when peer opens
    peerInstance.on('open', (id) => {
      setMyId(id);
      setStatus(`Ready - Your ID: ${id}`);
    });

    // Handle incoming calls
    peerInstance.on('call', (call) => {
      // Get user media and answer the call
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          
          call.answer(stream);
          
          call.on('stream', (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            setIsConnected(true);
            setStatus('Connected - In call');
          });
        })
        .catch((err) => {
          console.error('Failed to get user media:', err);
          setStatus('Error: Camera/microphone access denied');
        });
    });

    // Get user media on component mount
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Failed to get user media:', err);
        setStatus('Error: Camera/microphone access denied');
      });

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peerInstance.destroy();
    };
  }, []);

  const startCall = () => {
    if (!peer || !remoteId || !localStreamRef.current) return;

    const call = peer.call(remoteId, localStreamRef.current);
    
    call.on('stream', (remoteStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setIsConnected(true);
      setStatus('Connected - In call');
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">WebRTC P2P Stream</h1>
        <p className="text-muted-foreground mt-2">{status}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Stream</CardTitle>
          </CardHeader>
          <CardContent>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              className="w-full aspect-video bg-gray-900 rounded-lg"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Remote Stream</CardTitle>
          </CardHeader>
          <CardContent>
            <video
              ref={remoteVideoRef}
              autoPlay
              className="w-full aspect-video bg-gray-900 rounded-lg"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connect to Peer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Your ID (share this):</label>
            <Input value={myId} readOnly className="font-mono" />
          </div>
          
          <div>
            <label className="text-sm font-medium">Remote Peer ID:</label>
            <Input
              value={remoteId}
              onChange={(e) => setRemoteId(e.target.value)}
              placeholder="Enter peer ID to connect"
            />
          </div>
          
          <Button
            onClick={startCall}
            disabled={!remoteId || !peer}
            className="w-full"
          >
            {isConnected ? 'Connected' : 'Start Call'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}