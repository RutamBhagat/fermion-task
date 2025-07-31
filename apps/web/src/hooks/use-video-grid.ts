"use client";

import { useMemo } from "react";

export function useVideoGrid(participantCount: number, hlsPreviewMode = false) {
	const gridLayout = useMemo(() => {
		if (participantCount <= 1) return "grid-cols-1";
		if (participantCount <= 4) return "grid-cols-2";
		if (participantCount <= 9) return "grid-cols-3";
		return "grid-cols-4";
	}, [participantCount]);

	const hlsGridLayout = useMemo(() => {
		let cols: number;
		let rows: number;

		if (participantCount <= 2) {
			cols = 2;
			rows = 1;
		} else if (participantCount <= 4) {
			cols = 2;
			rows = 2;
		} else if (participantCount <= 6) {
			cols = 3;
			rows = 2;
		} else if (participantCount <= 9) {
			cols = 3;
			rows = 3;
		} else {
			cols = 4;
			rows = Math.ceil(participantCount / 4);
		}

		const gridWidth = 1920;
		const gridHeight = 1080;
		const videoWidth = Math.floor(gridWidth / cols);
		const videoHeight = Math.floor(gridHeight / rows);

		return {
			cols,
			rows,
			totalSlots: cols * rows,
			videoWidth,
			videoHeight,
			aspectRatio: videoWidth / videoHeight,
			gridClass: `grid-cols-${cols}`,
		};
	}, [participantCount]);

	return {
		gridClass: hlsPreviewMode ? hlsGridLayout.gridClass : gridLayout,
		hlsLayout: hlsGridLayout,
		showEmptySlots: participantCount <= 2,
		emptySlotCount: Math.max(0, 2 - participantCount),
	};
}
