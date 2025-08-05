"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StreamPage() {
  const router = useRouter();

  const handleCreateMeeting = () => {
    const meetingId = crypto.randomUUID();
    router.push(`/room/${meetingId}`);
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">WebRTC Video & HLS Streaming</h1>
        <p className="text-muted-foreground">
          Create a new meeting or join one with a code.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>New Meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Start an instant meeting.
            </p>
            <Button onClick={handleCreateMeeting} className="w-full" size="lg">
              Create Meeting
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
