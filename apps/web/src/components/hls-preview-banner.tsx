"use client";

interface HlsPreviewBannerProps {
	show: boolean;
}

export function HlsPreviewBanner({ show }: HlsPreviewBannerProps) {
	if (!show) return null;

	return (
		<div className="absolute top-16 right-4 left-4 z-20 rounded-lg border border-blue-400 bg-blue-600/90 p-3 text-sm text-white backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<span className="font-medium">📺 HLS Preview Mode:</span>
				<span>
					This is exactly how you'll appear in the final stream recording
				</span>
			</div>
		</div>
	);
}
