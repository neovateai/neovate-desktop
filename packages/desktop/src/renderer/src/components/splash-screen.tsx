import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useCallback, useEffect } from "react";

const SPLASH_VIDEO_URL =
  "https://gw.alipayobjects.com/v/huamei_9rin5s/afts/video/F_1-S6zV_x4AAAAAgBAAAAgAfoeUAQBr";

// Session storage key to track if splash has been shown
const SPLASH_SHOWN_KEY = "neovate:splash-shown";

interface SplashScreenProps {
  children: React.ReactNode;
}

export function SplashScreen({ children }: SplashScreenProps) {
  // Check if splash was already shown in this session
  const hasShown = typeof window !== "undefined" && sessionStorage.getItem(SPLASH_SHOWN_KEY);
  const [showSplash, setShowSplash] = useState(!hasShown);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoEnd = useCallback(() => {
    // Mark splash as shown for this session
    sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
    setShowSplash(false);
  }, []);

  const handleVideoError = useCallback(() => {
    // If video fails to load, skip splash
    sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
    setShowSplash(false);
  }, []);

  const handleVideoLoaded = useCallback(() => {
    setVideoLoaded(true);
  }, []);

  // Skip splash if video doesn't load within 5 seconds
  useEffect(() => {
    if (!showSplash) return;

    const timeout = setTimeout(() => {
      if (!videoLoaded) {
        handleVideoError();
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [showSplash, videoLoaded, handleVideoError]);

  // If splash was already shown, render children directly
  if (hasShown) {
    return <>{children}</>;
  }

  return (
    <div className="relative h-dvh w-full">
      {/* Main app content - always rendered but hidden during splash */}
      <div
        className="h-full w-full transition-opacity duration-300"
        style={{ opacity: showSplash ? 0 : 1 }}
      >
        {children}
      </div>

      {/* Splash overlay */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-sidebar"
          >
            <video
              ref={videoRef}
              src={SPLASH_VIDEO_URL}
              autoPlay
              muted
              playsInline
              onEnded={handleVideoEnd}
              onError={handleVideoError}
              onLoadedData={handleVideoLoaded}
              className="h-full w-full object-cover"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
