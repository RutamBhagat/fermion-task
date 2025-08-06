"use client";

import { useMemo } from "react";

export function useVideoGrid(participantCount: number) {
  const gridClass = useMemo(() => {
    if (participantCount <= 1) return "grid-cols-1";
    if (participantCount <= 4) return "grid-cols-2";
    if (participantCount <= 9) return "grid-cols-3";
    if (participantCount <= 16) return "grid-cols-4";
    if (participantCount <= 25) return "grid-cols-5";
    if (participantCount <= 36) return "grid-cols-6";
    if (participantCount <= 49) return "grid-cols-7";
    return "grid-cols-8"; // For 50+
  }, [participantCount]);

  return {
    gridClass,
  };
}
