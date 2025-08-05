"use client";

import { useMemo } from "react";

export function useVideoGrid(participantCount: number) {
  const gridClass = useMemo(() => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(participantCount)));
    return `grid-cols-${cols}`;
  }, [participantCount]);

  return {
    gridClass,
  };
}
