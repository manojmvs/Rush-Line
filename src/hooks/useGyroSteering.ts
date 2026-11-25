import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchInputState } from '../components/RaceCanvas.tsx';

export type GyroPermissionResult = 'granted' | 'denied' | 'unsupported';

interface DeviceOrientationEventWithPermission extends DeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Requests DeviceOrientation permission where required (iOS 13+ Safari).
 * Must be called directly inside a user click/tap handler.
 */
export async function requestGyroPermission(): Promise<GyroPermissionResult> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return 'unsupported';
  }

  const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
  if (typeof ctor.requestPermission === 'function') {
    try {
      const res = await ctor.requestPermission();
      return res === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  // Android Chrome / Edge / Firefox / PWA do not require explicit permission prompt
  return 'granted';
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 90;
  const so = window.screen?.orientation;
  if (so && typeof so.angle === 'number') {
    return ((so.angle % 360) + 360) % 360;
  }
  const legacyAngle = (window as unknown as { orientation?: number }).orientation;
  if (typeof legacyAngle === 'number') {
    return ((legacyAngle % 360) + 360) % 360;
  }
  return window.innerWidth >= window.innerHeight ? 90 : 0;
}

/**
 * Computes steering wheel tilt angle in degrees (+ right, - left)
 * across landscape-primary (90°), landscape-secondary (270°), and portrait (0° / 180°).
 */
function extractSteeringTiltDeg(beta: number, gamma: number): number {
  const angle = getScreenOrientationAngle();

  // Fold beta smoothly past ±90° so holding phone upright never jumps sign
  const safeBeta =
    beta > 90 ? 180 - beta : beta < -90 ? -180 - beta : beta;

  if (angle === 90) {
    // Landscape-primary (top/earpiece on LEFT): clockwise wheel turn tilts top UP (+beta)
    return safeBeta;
  }
  if (angle === 270) {
    // Landscape-secondary (top/earpiece on RIGHT): clockwise wheel turn tilts top DOWN (-beta)
    return -safeBeta;
  }
  if (angle === 180) {
    return -gamma;
  }
  // Portrait (0°): clockwise wheel turn tilts right edge DOWN (+gamma)
  return gamma;
}

interface UseGyroSteeringOptions {
  enabled: boolean;
  paused: boolean;
  touchInputRef: React.MutableRefObject<TouchInputState>;
}

const DEADZONE_DEG = 3.2;
const FULL_LOCK_DEG = 25.0;

export function useGyroSteering({ enabled, paused, touchInputRef }: UseGyroSteeringOptions) {
  const [visualSteer, setVisualSteer] = useState(0);
  const [sensorActive, setSensorActive] = useState(false);

  const rawTiltRef = useRef(0);
  const calibrationOffsetRef = useRef(0);
  const smoothedSteerRef = useRef(0);
  const lastUiSyncRef = useRef(0);

  const recenter = useCallback(() => {
    calibrationOffsetRef.current = rawTiltRef.current;
    smoothedSteerRef.current = 0;
    touchInputRef.current.gyroSteer = 0;
    setVisualSteer(0);
  }, [touchInputRef]);

  useEffect(() => {
    if (!enabled || paused) {
      smoothedSteerRef.current = 0;
      touchInputRef.current.gyroSteer = 0;
      setVisualSteer(0);
      if (!enabled) {
        setSensorActive(false);
        calibrationOffsetRef.current = 0;
      }
      return;
    }

    let gotFirstReading = false;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;

      const rawDeg = extractSteeringTiltDeg(e.beta, e.gamma);
      rawTiltRef.current = rawDeg;

      if (!gotFirstReading) {
        gotFirstReading = true;
        setSensorActive(true);
      }

      const relDeg = rawDeg - calibrationOffsetRef.current;
      const absDeg = Math.abs(relDeg);

      let targetSteer = 0;
      if (absDeg > DEADZONE_DEG) {
        const norm = Math.min(1, (absDeg - DEADZONE_DEG) / (FULL_LOCK_DEG - DEADZONE_DEG));
        // Gentle progressive response curve for fine center precision + responsive hairpins
        targetSteer = Math.sign(relDeg) * Math.pow(norm, 1.15);
      }

      // Low-pass filter to eliminate MEMS sensor jitter while staying crisp
      smoothedSteerRef.current = smoothedSteerRef.current * 0.62 + targetSteer * 0.38;
      if (Math.abs(smoothedSteerRef.current) < 0.015) {
        smoothedSteerRef.current = 0;
      }

      touchInputRef.current.gyroSteer = smoothedSteerRef.current;

      const now = performance.now();
      if (now - lastUiSyncRef.current > 100) {
        lastUiSyncRef.current = now;
        const nextVis = Math.round(smoothedSteerRef.current * 40) / 40;
        setVisualSteer((prev) => (Math.abs(prev - nextVis) >= 0.02 ? nextVis : prev));
      }
    };

    const onOrientationChange = () => {
      // Reset calibration when user flips phone orientation
      calibrationOffsetRef.current = 0;
      smoothedSteerRef.current = 0;
      touchInputRef.current.gyroSteer = 0;
    };

    window.addEventListener('deviceorientation', onOrientation, true);
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      window.removeEventListener('orientationchange', onOrientationChange);
      touchInputRef.current.gyroSteer = 0;
    };
  }, [enabled, paused, touchInputRef]);

  return {
    visualSteer,
    sensorActive,
    recenter,
  };
}
