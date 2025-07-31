"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function generateMeetingId(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	const segments = [];
	for (let i = 0; i < 3; i++) {
		let segment = "";
		for (let j = 0; j < 3; j++) {
			segment += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		segments.push(segment);
	}
	return segments.join("-");
}

export default function Home() {
	const router = useRouter();
	const [joinCode, setJoinCode] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [isJoining, setIsJoining] = useState(false);

	const handleCreateMeeting = async () => {
		setIsCreating(true);
		const meetingId = generateMeetingId();

		// Navigate to the meeting room
		router.push(`/room/${meetingId}`);
	};

	const handleJoinMeeting = () => {
		if (!joinCode.trim()) return;

		setIsJoining(true);
		// Clean up the join code (remove spaces, convert to lowercase)
		const cleanCode = joinCode.trim().toLowerCase();
		router.push(`/room/${cleanCode}`);
	};

	const handleJoinCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		// Allow only letters, numbers, and hyphens
		const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
		setJoinCode(value);
	};

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="mb-8 text-center">
				<h1 className="mb-2 font-bold text-2xl md:text-3xl">
					WebRTC Video Conferencing
				</h1>
				<p className="text-muted-foreground">
					Create a new meeting or join an existing one with a meeting code
				</p>
			</div>

			<div className="mx-auto grid max-w-2xl gap-6">
				{/* Create New Meeting */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span className="text-2xl">📹</span>
							New Meeting
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-sm">
							Start an instant meeting with camera and microphone
						</p>
						<Button
							onClick={handleCreateMeeting}
							disabled={isCreating}
							className="w-full"
							size="lg"
						>
							{isCreating ? "Creating..." : "Create Meeting"}
						</Button>
					</CardContent>
				</Card>

				{/* Join Meeting */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span className="text-2xl">🔗</span>
							Join Meeting
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="meeting-code">Meeting Code</Label>
							<Input
								id="meeting-code"
								type="text"
								placeholder="abc-def-ghi"
								value={joinCode}
								onChange={handleJoinCodeChange}
								onKeyDown={(e) => {
									if (e.key === "Enter" && joinCode.trim()) {
										handleJoinMeeting();
									}
								}}
							/>
							<p className="text-muted-foreground text-xs">
								Enter the meeting code (e.g., abc-def-ghi)
							</p>
						</div>
						<Button
							onClick={handleJoinMeeting}
							disabled={!joinCode.trim() || isJoining}
							className="w-full"
							size="lg"
							variant="outline"
						>
							{isJoining ? "Joining..." : "Join Meeting"}
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
