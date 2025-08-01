"use client";

import { useCallback, useEffect, useState } from "react";

export function useControlsVisibility(hideDelay = 3000) {
  const [showControls, setShowControls] = useState(true);

  const showControlsTemporary = useCallback(() => {
    setShowControls(true);
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const hideControls = () => {
      setShowControls(false);
    };

    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(hideControls, hideDelay);
    };

    const handleMouseMove = () => {
      showControlsTemporary();
      resetTimeout();
    };

    document.addEventListener("mousemove", handleMouseMove);
    resetTimeout();

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(timeout);
    };
  }, [hideDelay, showControlsTemporary]);

  return {
    showControls,
    showControlsTemporary,
  };
}
