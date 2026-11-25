import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Crosshair,
  Disc,
  Flag,
  Gamepad2,
  Home,
  Play,
  Repeat,
  RotateCcw,
  Settings,
  Smartphone,
  Star,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { getTrackSamples } from '../game/tracks.ts';
import { useGyroSteering } from '../hooks/useGyroSteering.ts';
import {
  TRACK_SPECS,
  formatLapTime,
  type CameraMode,
  type GameMode,
  type PerformanceMode,
  type RaceTelemetry,
  type SteeringMode,
  type TrackId,
  type TransmissionMode,
} from '../types/game.ts';
import { ApexLogo } from './GameArtWidgets.tsx';
import type { TouchInputState } from './RaceCanvas.tsx';

type HoldControlKey = 'left' | 'right' | 'gas' | 'brake' | 'reverse' | 'nitro';

interface RaceHudProps {
  trackId: TrackId;
  mode: GameMode;
  telemetry: RaceTelemetry;
  paused: boolean;
  showObjective: boolean;
  onStartFromObjective: () => void;
  muted: boolean;
  showTouchControls: boolean;
  transmissionMode: TransmissionMode;
  steeringMode: SteeringMode;
  performanceMode: PerformanceMode;
  submittedRank: number | null;
  earnedCoins: number;
  totalCoins: number;
  isNewBest: boolean;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  onCycleCamera: () => void;
  onToggleTransmission: () => void;
  onSelectSteeringMode: (mode: SteeringMode) => void;
  onSelectPerformanceMode: (mode: PerformanceMode) => void;
  onToggleMute: () => void;
  onToggleTouchControls: () => void;
  onResetCar: () => void;
  onTogglePause: () => void;
  onRestartRace: () => void;
  onNextLevel: () => void;
  onExitToMenu: () => void;
  onOpenGarage: () => void;
  onOpenLeaderboard: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  'far-chase': 'Wide',
  hood: 'Hood',
  bumper: 'Bumper',
};

const TRACK_OBJECTIVES: Record<TrackId, { challenge: string; tip: string }> = {
  'offroad-track': {
    challenge: 'Launch off 8 road-blended off-road jumps, take split diversions & rally-drift the dirt bends.',
    tip: 'Steer hard into corners to auto-drift and hit JUMP lanes for massive airtime + Nitro!',
  },
  'hill-track': {
    challenge: 'Master steep alpine climbs, split pass diversions & tight downhill drift switchbacks.',
    tip: 'Tap brake while turning into hairpins to kick out a fast automatic apex drift.',
  },
  'city-track': {
    challenge: 'Thread downtown split-boulevard diversions & drift 90° street corners at full attack.',
    tip: 'Exit every corner drift cleanly to trigger an automatic Drift Boost surge!',
  },
  'riverside-track': {
    challenge: 'Choose the fastest river split lane & chain sweeping powerslides along the bend.',
    tip: 'Auto-drift around high-speed sweepers to charge Nitro and pull away on straights.',
  },
  'stadium-track': {
    challenge: 'Dominate the floodlit Rush Arena Bowl, split forks & razor infield chicanes.',
    tip: 'Pitch hard left-right through the infield to trigger high-multiplier corner drifts.',
  },
  'racing-track': {
    challenge: 'Attack split-route GP diversions, clip red-white apexes & unleash Nitro on straights.',
    tip: 'Hold smooth automatic drifts through hairpins for instant exit speed boost.',
  },
  'gokart-track': {
    challenge: 'Chain rapid hairpin auto-drifts & split-lane overtakes across the tight kart arena.',
    tip: 'Link consecutive turns smoothly to stack 4× drift multipliers and Nitro energy.',
  },
};

const EMPTY_PRESSED: Record<HoldControlKey, boolean> = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  reverse: false,
  nitro: false,
};

export function RaceHud({
  trackId,
  mode,
  telemetry,
  paused,
  showObjective,
  onStartFromObjective,
  muted,
  showTouchControls,
  transmissionMode,
  steeringMode,
  performanceMode,
  submittedRank,
  earnedCoins,
  totalCoins,
  isNewBest,
  touchInputRef,
  onCycleCamera,
  onToggleTransmission,
  onSelectSteeringMode,
  onSelectPerformanceMode,
  onToggleMute,
  onToggleTouchControls,
  onResetCar,
  onTogglePause,
  onRestartRace,
  onNextLevel,
  onExitToMenu,
  onOpenLeaderboard,
}: RaceHudProps) {
  // Multi-touch pointer registry: tracks every active finger independently by pointerId
  // so holding GAS with the right thumb NEVER blocks LEFT/RIGHT arrows or the Steering Wheel.
  const activePointersRef = useRef<Map<number, HoldControlKey>>(new Map());
  const [pressed, setPressed] = useState<Record<HoldControlKey, boolean>>(EMPTY_PRESSED);

  // Interactive rotary on-screen Steering Wheel state (direct DOM transform ref = zero React re-renders while steering!)
  const wheelElRef = useRef<HTMLDivElement | null>(null);
  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const wheelPointerIdRef = useRef<number | null>(null);
  const wheelLastAngleRef = useRef(0);
  const wheelLastXRef = useRef(0);
  const wheelDegRef = useRef(0);
  const wheelReturnRafRef = useRef(0);
  const [wheelActive, setWheelActive] = useState(false);

  // Interactive on-screen Virtual Analog Joystick state (direct DOM transform ref = zero React re-renders!)
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyKnobRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const [joyActive, setJoyActive] = useState(false);

  const {
    visualSteer: gyroVisualSteer,
    sensorActive: gyroSensorActive,
    recenter: recenterGyro,
  } = useGyroSteering({
    enabled: steeringMode === 'gyro' && !telemetry.finished,
    paused,
    touchInputRef,
  });

  const cycleSteeringMode = useCallback(() => {
    const order: SteeringMode[] = ['buttons', 'joystick', 'gyro', 'wheel'];
    const next = order[(order.indexOf(steeringMode) + 1) % order.length];
    onSelectSteeringMode(next);
  }, [steeringMode, onSelectSteeringMode]);

  const setWheelAngleDeg = useCallback(
    (deg: number) => {
      const clamped = Math.max(-115, Math.min(115, deg));
      wheelDegRef.current = clamped;
      // Full steering lock reached smoothly at ±95 degrees of wheel rotation
      const norm = Math.max(-1, Math.min(1, clamped / 95));
      touchInputRef.current.wheelSteer = Math.abs(norm) < 0.03 ? 0 : norm;
      if (wheelSvgRef.current) {
        wheelSvgRef.current.style.transform = `rotate(${clamped.toFixed(1)}deg)`;
      }
    },
    [touchInputRef]
  );

  const startWheelSelfCenter = useCallback(() => {
    cancelAnimationFrame(wheelReturnRafRef.current);
    const stepReturn = () => {
      if (wheelPointerIdRef.current !== null) return;
      const curr = wheelDegRef.current;
      if (Math.abs(curr) < 1.2) {
        setWheelAngleDeg(0);
        return;
      }
      setWheelAngleDeg(curr * 0.72);
      wheelReturnRafRef.current = requestAnimationFrame(stepReturn);
    };
    wheelReturnRafRef.current = requestAnimationFrame(stepReturn);
  }, [setWheelAngleDeg]);

  const syncTouchInput = useCallback(() => {
    const next: Record<HoldControlKey, boolean> = {
      left: false,
      right: false,
      gas: false,
      brake: false,
      reverse: false,
      nitro: false,
    };
    activePointersRef.current.forEach((control) => {
      next[control] = true;
    });

    const ref = touchInputRef.current;
    ref.left = next.left;
    ref.right = next.right;
    ref.gas = next.gas;
    ref.brake = next.brake;
    ref.reverse = next.reverse;
    ref.handbrake = false;
    ref.nitro = next.nitro;

    setPressed((prev) => {
      if (
        prev.left === next.left &&
        prev.right === next.right &&
        prev.gas === next.gas &&
        prev.brake === next.brake &&
        prev.reverse === next.reverse &&
        prev.nitro === next.nitro
      ) {
        return prev;
      }
      return next;
    });
  }, [touchInputRef]);

  const updateJoystickFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const base = joyBaseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = rect.width * 0.34;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR && dist > 0.001) {
        const s = maxR / dist;
        dx *= s;
        dy *= s;
      }
      if (joyKnobRef.current) {
        joyKnobRef.current.style.transform = `translate3d(${dx.toFixed(1)}px, ${(dy * 0.45).toFixed(1)}px, 0)`;
      }
      const normX = Math.max(-1, Math.min(1, dx / Math.max(1, maxR)));
      touchInputRef.current.joystickSteer = Math.abs(normX) < 0.06 ? 0 : normX;
    },
    [touchInputRef]
  );

  const resetJoystick = useCallback(() => {
    joyPointerIdRef.current = null;
    touchInputRef.current.joystickSteer = 0;
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    setJoyActive(false);
  }, [touchInputRef]);

  const clearAllPointers = useCallback(() => {
    activePointersRef.current.clear();
    wheelPointerIdRef.current = null;
    cancelAnimationFrame(wheelReturnRafRef.current);
    wheelDegRef.current = 0;
    touchInputRef.current.wheelSteer = 0;
    if (wheelSvgRef.current) {
      wheelSvgRef.current.style.transform = 'rotate(0deg)';
    }
    setWheelActive(false);
    resetJoystick();
    syncTouchInput();
  }, [syncTouchInput, touchInputRef, resetJoystick]);

  useEffect(() => {
    if (
      paused ||
      showObjective ||
      telemetry.finished ||
      (!showTouchControls && steeringMode !== 'wheel' && steeringMode !== 'joystick')
    ) {
      clearAllPointers();
    }
  }, [paused, showObjective, telemetry.finished, showTouchControls, steeringMode, clearAllPointers]);

  useEffect(() => {
    if (steeringMode !== 'wheel') {
      wheelPointerIdRef.current = null;
      cancelAnimationFrame(wheelReturnRafRef.current);
      wheelDegRef.current = 0;
      touchInputRef.current.wheelSteer = 0;
      if (wheelSvgRef.current) {
        wheelSvgRef.current.style.transform = 'rotate(0deg)';
      }
      setWheelActive(false);
    }
    if (steeringMode !== 'joystick') {
      resetJoystick();
    }
  }, [steeringMode, touchInputRef, resetJoystick]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (joyPointerIdRef.current === e.pointerId) {
        updateJoystickFromClientPoint(e.clientX, e.clientY);
        return;
      }
      if (wheelPointerIdRef.current !== e.pointerId) return;
      const el = wheelElRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist >= 16) {
        const currAngle = Math.atan2(dy, dx);
        let deltaRad = currAngle - wheelLastAngleRef.current;
        while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
        while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;
        wheelLastAngleRef.current = currAngle;
        wheelLastXRef.current = e.clientX;
        setWheelAngleDeg(wheelDegRef.current + (deltaRad * 180) / Math.PI * 1.12);
      } else {
        // Near hub center: allow smooth left/right horizontal slide fallback
        const deltaX = e.clientX - wheelLastXRef.current;
        wheelLastXRef.current = e.clientX;
        setWheelAngleDeg(wheelDegRef.current + deltaX * 1.6);
      }
    };

    const onPointerRelease = (e: PointerEvent) => {
      if (joyPointerIdRef.current === e.pointerId) {
        resetJoystick();
      }
      if (wheelPointerIdRef.current === e.pointerId) {
        wheelPointerIdRef.current = null;
        setWheelActive(false);
        startWheelSelfCenter();
      }
      if (activePointersRef.current.delete(e.pointerId)) {
        syncTouchInput();
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerRelease);
    window.addEventListener('pointercancel', onPointerRelease);
    window.addEventListener('blur', clearAllPointers);
    return () => {
      cancelAnimationFrame(wheelReturnRafRef.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      window.removeEventListener('blur', clearAllPointers);
    };
  }, [syncTouchInput, clearAllPointers, setWheelAngleDeg, startWheelSelfCenter, updateJoystickFromClientPoint, resetJoystick]);

  const handleJoystickPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    joyPointerIdRef.current = e.pointerId;
    setJoyActive(true);
    updateJoystickFromClientPoint(e.clientX, e.clientY);
  };

  const handleWheelPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = wheelElRef.current;
    if (!el) return;
    cancelAnimationFrame(wheelReturnRafRef.current);
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    wheelPointerIdRef.current = e.pointerId;
    wheelLastAngleRef.current = Math.atan2(e.clientY - cy, e.clientX - cx);
    wheelLastXRef.current = e.clientX;
    setWheelActive(true);
  };

  // Precompute vector SVG circular minimap coordinates (matching Game_UI_Screen reference!)
  const minimap = useMemo(() => {
    const { minimapPoints, bounds } = getTrackSamples(trackId);
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    const scale = 68 / Math.max(spanX, spanZ);
    const offX = (100 - spanX * scale) * 0.5;
    const offZ = (100 - spanZ * scale) * 0.5;

    const toSvg = (x: number, z: number) => ({
      sx: offX + (x - bounds.minX) * scale,
      sy: offZ + (z - bounds.minZ) * scale,
    });

    const d =
      minimapPoints
        .map((p, idx) => {
          const { sx, sy } = toSvg(p.x, p.z);
          return `${idx === 0 ? 'M' : 'L'} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        })
        .join(' ') + ' Z';

    const startPt = minimapPoints[0] ? toSvg(minimapPoints[0].x, minimapPoints[0].z) : { sx: 50, sy: 50 };
    return { d, toSvg, startPt };
  }, [trackId]);

  const bindHoldControl = (key: HoldControlKey) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      activePointersRef.current.set(e.pointerId, key);
      syncTouchInput();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const triggerShiftUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    touchInputRef.current.shiftUpPending = true;
  };

  const triggerShiftDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    touchInputRef.current.shiftDownPending = true;
  };

  const rpmRatio = Math.min(1, telemetry.rpm / telemetry.maxRpm);
  const isReverse = telemetry.gear === -1;
  const gearDisplay = isReverse ? 'R' : String(Math.max(1, telemetry.gear));
  const playerStanding = telemetry.standings.find((s) => s.isPlayer);
  const playerProgress = playerStanding?.totalProgress ?? 0;

  // Arc gauge math for stylized semicircle speedometer (matching Game_UI_Screen!)
  const arcTotalLen = 198;
  const activeArcLen = Math.max(6, Math.round(rpmRatio * arcTotalLen));

  // Win / Loss rule: 1st or 2nd place (or Time Trial completion) = WIN / LEVEL COMPLETE; 3rd+ = LOSER SCREEN
  const isWinner = mode === 'time-trial' || telemetry.position <= 2;
  const earnedStars =
    mode === 'time-trial' || telemetry.position === 1
      ? 3
      : telemetry.position === 2
      ? 2
      : 0;
  const winnerStanding = telemetry.standings[0];
  const formatOrdinal = (pos: number): string => {
    if (pos === 1) return '1ST';
    if (pos === 2) return '2ND';
    if (pos === 3) return '3RD';
    return `${pos}TH`;
  };

  const confettiPieces = [
    { left: '26%', top: '8%', bg: '#FFD014', rot: '22deg' },
    { left: '34%', top: '17%', bg: '#FFD014', rot: '-26deg' },
    { left: '47%', top: '5%', bg: '#F43F5E', rot: '35deg' },
    { left: '24%', top: '38%', bg: '#FB7185', rot: '-18deg' },
    { left: '51%', top: '39%', bg: '#F97316', rot: '42deg' },
    { left: '84%', top: '31%', bg: '#FFD014', rot: '-30deg' },
    { left: '94%', top: '10%', bg: '#4ADE80', rot: '28deg' },
    { left: '92%', top: '26%', bg: '#38BDF8', rot: '-22deg' },
    { left: '96%', top: '61%', bg: '#FFD014', rot: '18deg' },
    { left: '97%', top: '69%', bg: '#FFD014', rot: '-34deg' },
    { left: '94%', top: '76%', bg: '#FACC15', rot: '48deg' },
  ];

  const trackSpec = TRACK_SPECS[trackId];
  const trackObjective = TRACK_OBJECTIVES[trackId];
  const totalLaps = Math.max(1, telemetry.totalLaps || trackSpec.laps);
  const lapLabel = totalLaps === 1 ? 'Lap' : 'Laps';
  const rivalCount = Math.max(1, (telemetry.totalRacers || 6) - 1);

  const objectiveHeadline =
    mode === 'time-trial'
      ? `SET THE FASTEST ${totalLaps}-LAP TRACK RECORD`
      : mode === 'multiplayer'
      ? `FINISH 1ST OR 2ND OVER ${totalLaps} ${lapLabel.toUpperCase()}`
      : `FINISH 1ST OR 2ND — BEAT ${rivalCount} RIVALS`;

  const objectiveRule =
    mode === 'time-trial'
      ? `Complete ${totalLaps} clean ${lapLabel.toLowerCase()} in the shortest total time to set a new personal best.`
      : `Race ends the instant the leader completes ${totalLaps} ${lapLabel.toLowerCase()}. Finish 1st or 2nd to win — 3rd or lower loses!`;

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-10 pointer-events-none select-none touch-control flex flex-col justify-between p-2.5 sm:p-4"
    >
      {/* TOP ROW: Hide live HUD during pre-race objective briefing & when finished */}
      {!telemetry.finished && !showObjective && (
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        {/* TOP-LEFT: Skewed Pos / Lap Badges + Compact Live Race Leaderboard */}
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex flex-col gap-1">
            {mode !== 'time-trial' && (
              <div className="-skew-x-14 bg-[#0D1626]/90 border border-white/15 px-3.5 py-1 flex items-baseline gap-3 min-w-[116px] sm:min-w-[132px]">
                <span className="skew-x-14 font-display italic font-bold text-sm sm:text-base text-[#FFD014]">
                  Pos
                </span>
                <span className="skew-x-14 font-display italic font-black text-lg sm:text-xl text-white font-mono-tabular leading-none ml-auto">
                  {telemetry.position}
                  <span className="text-xs sm:text-sm text-slate-300 font-bold">/{telemetry.totalRacers}</span>
                </span>
              </div>
            )}

            <div className="-skew-x-14 bg-[#0D1626]/90 border border-white/15 px-3.5 py-1 flex items-baseline gap-3 min-w-[116px] sm:min-w-[132px]">
              <span className="skew-x-14 font-display italic font-bold text-sm sm:text-base text-white">
                Lap
              </span>
              <span className="skew-x-14 font-display italic font-black text-lg sm:text-xl text-white font-mono-tabular leading-none ml-auto">
                {telemetry.lap}
                <span className="text-xs sm:text-sm text-slate-300 font-bold">/{telemetry.totalLaps}</span>
              </span>
            </div>
          </div>

          {/* Live Compact Standings Strip (exact reference highlight for player row!) */}
          {mode !== 'time-trial' && telemetry.standings.length > 1 && (
            <div className="hidden sm:flex flex-col w-[178px] rounded-md bg-[#0C1422]/82 border border-white/12 overflow-hidden divide-y divide-white/[0.07]">
              {telemetry.standings.slice(0, 6).map((row) => {
                const deltaProgress = playerProgress - row.totalProgress;
                const estGapSec = deltaProgress * 46;
                const gapText = row.isPlayer
                  ? ''
                  : `${estGapSec >= 0 ? '+' : ''}${estGapSec.toFixed(2)}s`;
                return (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between px-2 py-0.5 text-[11px] font-display italic ${
                      row.isPlayer
                        ? 'bg-[#FFD014] text-[#0B1220] font-black'
                        : 'text-slate-100 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-3 font-mono-tabular text-[10px] opacity-85">{row.position}</span>
                      <span className="truncate">{row.name}</span>
                    </div>
                    {gapText && (
                      <span className="font-mono-tabular text-[10px] text-slate-300 shrink-0 ml-1">
                        {gapText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* TOP-CENTER: Skewed Yellow Stopwatch Timer + Surface & Drift Alerts */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="-skew-x-14 bg-[#0D1626]/92 border border-white/18 px-4 sm:px-6 py-1.5 shadow-lg">
            <div className="skew-x-14 flex items-center gap-2">
              <Timer className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFD014]" />
              <span className="font-display italic font-black text-base sm:text-xl text-white font-mono-tabular leading-none">
                {formatLapTime(telemetry.currentLapMs)}
              </span>
            </div>
          </div>

          {telemetry.wrongWay && !telemetry.finished && (
            <div className="-skew-x-12 px-4 py-1 bg-[#E5252B] text-white font-display italic font-black text-xs sm:text-sm tracking-wide shadow-md">
              <span className="block skew-x-12">WRONG WAY — TURN AROUND</span>
            </div>
          )}
          {!telemetry.finished && !telemetry.wrongWay && telemetry.surface === 'offtrack' && (
            <div className="-skew-x-12 px-3.5 py-1 bg-[#2A1D12]/92 border border-amber-500/60 text-amber-300 font-display italic font-bold text-xs">
              <span className="block skew-x-12">Mud Border — Slowing Down</span>
            </div>
          )}
          {!telemetry.finished && !telemetry.wrongWay && telemetry.surface === 'kerb' && (
            <div className="-skew-x-12 px-3.5 py-1 bg-[#0D1626]/90 border border-red-500/60 text-red-300 font-display italic font-bold text-xs">
              <span className="block skew-x-12">Border Kerb — Speed Reduced</span>
            </div>
          )}
          {telemetry.airborne && !telemetry.finished && !telemetry.wrongWay && (
            <div className="-skew-x-12 px-4 py-1 bg-gradient-to-r from-[#FF6A00] to-[#FFD014] text-[#0B1220] font-display italic font-black text-xs sm:text-sm font-mono-tabular shadow-[0_0_18px_rgba(255,208,20,0.65)]">
              <span className="block skew-x-12">
                ▲ BIG AIR! {(telemetry.airTime ?? 0).toFixed(1)}s
              </span>
            </div>
          )}
          {!telemetry.airborne && (telemetry.lastJumpBonus ?? 0) > 0 && !telemetry.finished && !telemetry.wrongWay && (
            <div className="-skew-x-12 px-3.5 py-1 bg-emerald-400 text-[#052E16] font-display italic font-black text-xs font-mono-tabular shadow-md">
              <span className="block skew-x-12">
                STUNT JUMP +{(telemetry.lastJumpBonus ?? 0).toLocaleString()} · +NITRO
              </span>
            </div>
          )}
          {telemetry.driftBoostActive && !telemetry.finished && !telemetry.wrongWay && (
            <div className="-skew-x-12 px-3.5 py-1 bg-sky-400 text-[#0B1220] font-display italic font-black text-xs shadow-[0_0_14px_rgba(56,189,248,0.6)]">
              <span className="block skew-x-12">DRIFT EXIT BOOST!</span>
            </div>
          )}
          {telemetry.currentDriftChain > 15 && !telemetry.finished && !telemetry.wrongWay && (
            <div className="-skew-x-12 px-3.5 py-1 bg-[#FFD014] text-[#0B1220] font-display italic font-black text-xs font-mono-tabular shadow-md">
              <span className="block skew-x-12">
                DRIFT +{telemetry.currentDriftChain.toLocaleString()} ×{telemetry.driftMultiplier}
              </span>
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Circular Track Minimap + Settings Gear & Compact Utilities */}
        <div className="flex items-start gap-2">
          {/* Circular Minimap (matches Game_UI_Screen reference!) */}
          <div className="hidden md:flex items-center justify-center w-[98px] h-[98px] rounded-full bg-[#0C1422]/68 border border-white/18 p-1.5 shadow-lg">
            <svg width="86" height="86" viewBox="0 0 100 100" aria-label="Track Minimap">
              <path
                d={minimap.d}
                fill="none"
                stroke="#0B1220"
                strokeWidth="7.5"
                strokeLinejoin="round"
              />
              <path
                d={minimap.d}
                fill="none"
                stroke="#F8FAFC"
                strokeWidth="4.2"
                strokeLinejoin="round"
              />
              {/* Start/Finish Marker */}
              <rect
                x={minimap.startPt.sx - 3.5}
                y={minimap.startPt.sy - 3.5}
                width="7"
                height="7"
                fill="#FFD014"
                stroke="#0B1220"
                strokeWidth="1.2"
              />
              {telemetry.minimapCars.map((mc) => {
                const { sx, sy } = minimap.toSvg(mc.x, mc.z);
                return mc.isPlayer ? (
                  <polygon
                    key={mc.id}
                    points={`${sx},${sy - 5.5} ${sx + 4.5},${sy + 4.5} ${sx},${sy + 2} ${sx - 4.5},${sy + 4.5}`}
                    fill="#E5252B"
                    stroke="#FFFFFF"
                    strokeWidth="1"
                  />
                ) : (
                  <circle
                    key={mc.id}
                    cx={sx}
                    cy={sy}
                    r={2.8}
                    fill="#FFD014"
                    stroke="#0B1220"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>
          </div>

          {/* Compact Utility Stack + Circular Settings/Pause Gear */}
          <div className="pointer-events-auto flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cycleSteeringMode}
                title="Switch Control Mode: Controls / Gyroscope / Steering"
                className={`h-9 px-2.5 -skew-x-10 border text-[11px] font-display italic font-black transition-colors ${
                  steeringMode !== 'buttons'
                    ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                    : 'bg-[#0D1626]/90 border-white/18 text-white hover:bg-[#192842]'
                }`}
              >
                <span className="skew-x-10 flex items-center gap-1">
                  {steeringMode === 'gyro' ? (
                    <Smartphone className="w-3.5 h-3.5" />
                  ) : steeringMode === 'wheel' ? (
                    <Disc className="w-3.5 h-3.5" />
                  ) : (
                    <Compass className="w-3.5 h-3.5 text-[#FFD014]" />
                  )}
                  <span>
                    {steeringMode === 'gyro'
                      ? 'GYRO'
                      : steeringMode === 'wheel'
                      ? 'STEERING'
                      : 'CONTROLS'}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleTransmission}
                title="Toggle Automatic / Manual 6-Speed (T)"
                className={`h-9 px-2.5 -skew-x-10 border text-[11px] font-display italic font-black transition-colors ${
                  transmissionMode === 'manual'
                    ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                    : 'bg-[#0D1626]/90 border-white/18 text-white hover:bg-[#192842]'
                }`}
              >
                <span className="block skew-x-10">{transmissionMode === 'manual' ? 'MAN 6' : 'AUTO 6'}</span>
              </button>

              <button
                type="button"
                onClick={onTogglePause}
                title="Pause / Settings (Esc)"
                className="w-9 h-9 rounded-full bg-[#0D1626]/90 hover:bg-[#192842] border border-white/20 text-white flex items-center justify-center transition-colors"
              >
                {paused ? <Play className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onCycleCamera}
                title={`Switch Camera (${CAMERA_LABELS[telemetry.cameraMode]})`}
                className="w-8 h-8 rounded-full bg-[#0D1626]/84 border border-white/15 text-slate-200 hover:text-white flex items-center justify-center transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleTouchControls}
                title="Toggle On-Screen Mobile Controls"
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                  showTouchControls
                    ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                    : 'bg-[#0D1626]/84 border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onResetCar}
                title="Reset Car to Track (R)"
                className="w-8 h-8 rounded-full bg-[#0D1626]/84 border border-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                title={muted ? 'Unmute Audio' : 'Mute Audio'}
                className="w-8 h-8 rounded-full bg-[#0D1626]/84 border border-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* PRE-RACE OBJECTIVE BRIEFING (Shown on the starting grid before every race!) */}
      {showObjective && !telemetry.finished && (
        <div className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center bg-[#060C18]/74 p-2.5 sm:p-4">
          <div className="w-full max-w-xl max-h-[94dvh] flex flex-col rounded-lg bg-[#0B1424]/96 border-2 border-[#FFD014]/85 shadow-[0_24px_64px_rgba(0,0,0,0.82)] overflow-hidden">
            {/* Skewed RUSH LINE Header Strip */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 sm:px-5 py-2 sm:py-3 bg-[#08101E] border-b-2 border-[#FFD014]">
              <div className="flex items-center gap-2 min-w-0">
                <div className="-skew-x-14 px-2.5 py-0.5 bg-[#E5252B] text-white font-display italic font-black text-[10px] sm:text-xs shrink-0">
                  <span className="block skew-x-14">RACE OBJECTIVE</span>
                </div>
                <span className="font-display italic font-black text-sm sm:text-lg text-white tracking-wide truncate">
                  {trackSpec.name.toUpperCase()}
                </span>
              </div>
              <div className="-skew-x-12 px-2.5 py-0.5 bg-[#15243E] border border-[#FFD014]/50 text-[#FFD014] font-display italic font-black text-[10px] sm:text-xs shrink-0">
                <span className="block skew-x-12">
                  {totalLaps} {lapLabel.toUpperCase()} · {mode === 'time-trial' ? 'TIME TRIAL' : mode === 'multiplayer' ? 'ONLINE' : 'QUICK RACE'}
                </span>
              </div>
            </div>

            {/* Objective Body */}
            <div className="p-3 sm:p-5 overflow-y-auto space-y-2.5 sm:space-y-3.5">
              {/* Primary Goal Box */}
              <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-r from-[#172846] to-[#101C30] border border-[#FFD014]/55 flex items-start gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg bg-[#FFD014] text-[#0B1220] flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(255,208,20,0.4)]">
                  {mode === 'time-trial' ? (
                    <Timer className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-display italic font-black text-[#FFD014] tracking-wider">
                    PRIMARY GOAL
                  </div>
                  <h2 className="font-display italic font-black text-base sm:text-xl text-white leading-tight mt-0.5">
                    {objectiveHeadline}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-200 mt-1 leading-snug">
                    {objectiveRule}
                  </p>
                </div>
              </div>

              {/* Track Challenge & Rewards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3 rounded-lg bg-[#0F1B2F] border border-white/14">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-display italic font-black text-[#FFD014]">
                    <Flag className="w-3.5 h-3.5 shrink-0" />
                    <span>TRACK CHALLENGE</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-200 mt-1 leading-snug">
                    {trackObjective.challenge}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3 rounded-lg bg-[#0F1B2F] border border-white/14">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-display italic font-black text-[#FFD014]">
                    <Coins className="w-3.5 h-3.5 shrink-0" />
                    <span>{mode === 'time-trial' ? 'REWARD TARGET' : 'PODIUM REWARDS'}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-200 mt-1 leading-snug font-medium">
                    {mode === 'time-trial'
                      ? 'Beat your best time to post a top rank on the Global Leaderboard.'
                      : '1st: 500 Coins · 2nd: 300 Coins (Top 2 win the level)'}
                  </p>
                </div>
              </div>

              {/* Start Action Row */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[10px] sm:text-xs text-slate-300 font-display italic font-bold truncate">
                  <span className="text-[#FFD014]">TIP:</span> {trackObjective.tip}
                </div>
                <button
                  type="button"
                  onClick={onStartFromObjective}
                  className="shrink-0 h-10 sm:h-11 px-5 sm:px-7 -skew-x-12 bg-[#FFD014] hover:bg-[#ffe04d] active:scale-95 text-[#0B1220] font-display italic font-black text-sm sm:text-base shadow-[0_0_24px_rgba(255,208,20,0.45)] transition-all"
                >
                  <span className="skew-x-12 flex items-center gap-1.5 whitespace-nowrap">
                    <Play className="w-4 h-4 fill-current" />
                    START RACE »
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CENTER START LIGHTS COUNTDOWN (with Compact Race Objective Ribbon) */}
      {telemetry.countdown > 0 && !paused && !showObjective && (
        <div className="self-center flex flex-col items-center gap-2.5">
          <div className="-skew-x-12 px-4 py-1.5 bg-[#0B1424]/92 border border-[#FFD014]/70 shadow-xl">
            <div className="skew-x-12 flex items-center gap-2 text-[11px] sm:text-xs font-display italic font-black text-white whitespace-nowrap">
              <span className="px-1.5 py-0.5 bg-[#E5252B] text-[10px] text-white">OBJECTIVE</span>
              <span className="text-[#FFD014]">{objectiveHeadline}</span>
            </div>
          </div>
          <div className="-skew-x-12 flex items-center gap-3 px-6 py-3 rounded-lg bg-[#0D1626]/92 border border-white/18 shadow-2xl">
            {[3, 2, 1].map((n) => (
              <div
                key={n}
                className={`skew-x-12 w-7 h-7 rounded-full border-2 transition-colors ${
                  telemetry.countdown <= n
                    ? 'bg-[#E5252B] border-red-300 shadow-[0_0_12px_rgba(229,37,43,0.8)]'
                    : 'bg-slate-900 border-white/15'
                }`}
              />
            ))}
          </div>
          <div className="font-display italic font-black text-7xl text-[#FFD014] drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)] font-mono-tabular">
            {telemetry.countdown}
          </div>
        </div>
      )}

      {/* BOTTOM ROW: Hide live driving HUD during objective briefing & once finished */}
      {!telemetry.finished && !showObjective && (
      <div className="flex items-end justify-between gap-2 sm:gap-3">
        {/* LEFT THUMB ZONE: Arrows OR Virtual Joystick OR Gyroscope OR Steering Wheel */}
        <div className="flex flex-col items-start gap-3 mb-6 sm:mb-8 ml-1 sm:ml-2">
          {(showTouchControls ||
            steeringMode === 'gyro' ||
            steeringMode === 'wheel' ||
            steeringMode === 'joystick') &&
          !telemetry.finished &&
          !paused ? (
            <>
              {transmissionMode === 'manual' && showTouchControls && (
                <div className="pointer-events-auto flex items-center gap-3">
                  <button
                    type="button"
                    onPointerDown={triggerShiftDown}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label="Shift Gear Down"
                    className="touch-control -skew-x-10 w-[70px] sm:w-[80px] h-9 bg-[#0D1626]/88 active:bg-[#FFD014] active:text-[#0B1220] border border-white/25 text-white text-xs font-display italic font-black"
                  >
                    <span className="block skew-x-10">− GEAR</span>
                  </button>
                  <button
                    type="button"
                    onPointerDown={triggerShiftUp}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label="Shift Gear Up"
                    className={`touch-control -skew-x-10 w-[70px] sm:w-[80px] h-9 border text-xs font-display italic font-black ${
                      telemetry.shiftPrompt === 'up'
                        ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                        : 'bg-[#0D1626]/88 active:bg-[#FFD014] active:text-[#0B1220] border-white/25 text-white'
                    }`}
                  >
                    <span className="block skew-x-10">+ GEAR</span>
                  </button>
                </div>
              )}

              {steeringMode === 'gyro' ? (
                /* MODE 2: Live Gyroscope Steering Indicator + 1-Tap Recenter */
                <div className="pointer-events-auto flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0B1424]/86 border border-[#FFD014]/55 shadow-lg">
                  {/* Rotating Steering Wheel Indicator */}
                  <div className="relative w-12 h-12 rounded-full bg-[#112038] border-2 border-[#FFD014] flex items-center justify-center shrink-0">
                    <svg
                      viewBox="0 0 40 40"
                      className="w-9 h-9 transition-transform duration-75"
                      style={{ transform: `rotate(${Math.round(gyroVisualSteer * 65)}deg)` }}
                      aria-hidden="true"
                    >
                      <circle cx="20" cy="20" r="15" fill="none" stroke="#F8FAFC" strokeWidth="3.2" />
                      <line x1="20" y1="5" x2="20" y2="11" stroke="#FFD014" strokeWidth="3.5" strokeLinecap="round" />
                      <line x1="7" y1="20" x2="33" y2="20" stroke="#94A3B8" strokeWidth="2.8" strokeLinecap="round" />
                      <line x1="20" y1="20" x2="20" y2="33" stroke="#94A3B8" strokeWidth="2.8" strokeLinecap="round" />
                      <circle cx="20" cy="20" r="4" fill="#E5252B" />
                    </svg>
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-[106px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display italic font-black text-[11px] text-[#FFD014] leading-none">
                        GYROSCOPE
                      </span>
                      <span className="text-[9px] font-mono-tabular font-bold text-slate-300 leading-none">
                        {gyroSensorActive ? 'ACTIVE' : 'TILT PHONE'}
                      </span>
                    </div>

                    {/* Live Tilt Meter Bar */}
                    <div className="relative h-2 w-full rounded-full bg-white/12 overflow-hidden">
                      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/40 -translate-x-1/2" />
                      <div
                        className="absolute top-0 bottom-0 bg-[#FFD014] rounded-full transition-all duration-75"
                        style={{
                          left: gyroVisualSteer >= 0 ? '50%' : `${50 + gyroVisualSteer * 50}%`,
                          width: `${Math.max(4, Math.abs(gyroVisualSteer) * 50)}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={recenterGyro}
                        className="flex-1 h-6 px-2 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] text-[10px] font-display italic font-black flex items-center justify-center gap-1"
                      >
                        <span className="skew-x-10 flex items-center gap-1">
                          <Crosshair className="w-3 h-3" />
                          CENTER
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={cycleSteeringMode}
                        className="h-6 px-2 -skew-x-10 bg-[#14223A] hover:bg-[#1E3254] border border-white/20 text-white text-[10px] font-display italic font-bold"
                      >
                        <span className="block skew-x-10">STEER</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : steeringMode === 'wheel' ? (
                /* MODE 3: Interactive Rotary Touch Steering Wheel */
                <div className="pointer-events-auto touch-control flex flex-col items-center gap-1">
                  <div
                    ref={wheelElRef}
                    role="slider"
                    aria-label="Steering Wheel"
                    aria-valuemin={-100}
                    aria-valuemax={100}
                    aria-valuenow={0}
                    onPointerDown={handleWheelPointerDown}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`touch-control relative w-[124px] h-[124px] sm:w-[144px] sm:h-[144px] rounded-full flex items-center justify-center select-none cursor-grab active:cursor-grabbing ${
                      wheelActive
                        ? 'shadow-[0_0_16px_rgba(255,208,20,0.45)]'
                        : 'shadow-[0_6px_14px_rgba(0,0,0,0.55)]'
                    }`}
                  >
                    {/* Static outer ring guides (L / R indicators) */}
                    <span className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 text-[9px] font-display italic font-black text-white/65">
                      L
                    </span>
                    <span className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 text-[9px] font-display italic font-black text-white/65">
                      R
                    </span>

                    {/* Rotating Motorsport Steering Wheel SVG (GPU transform updated directly via ref) */}
                    <svg
                      ref={wheelSvgRef}
                      viewBox="0 0 120 120"
                      className="w-full h-full pointer-events-none will-change-transform"
                      style={{ transform: 'rotate(0deg)' }}
                      aria-hidden="true"
                    >
                      {/* Outer Dark Translucent Halo Backing */}
                      <circle cx="60" cy="60" r="56" fill="rgba(11, 20, 36, 0.42)" />
                      {/* Grip Rim Outer Ring */}
                      <circle
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke={wheelActive ? '#F8FAFC' : '#CBD5E1'}
                        strokeWidth="12"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke="#1E293B"
                        strokeWidth="8.5"
                      />
                      {/* Championship Yellow 12-o'clock Center Reference Band */}
                      <path
                        d="M 52 12.6 A 48 48 0 0 1 68 12.6"
                        fill="none"
                        stroke="#FFD014"
                        strokeWidth="11"
                        strokeLinecap="butt"
                      />
                      {/* Brushed Metallic 3-Spoke Steering Arms */}
                      <path
                        d="M 16 60 L 45 55 L 45 65 L 16 60 Z"
                        fill="#94A3B8"
                        stroke="#0F172A"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M 104 60 L 75 55 L 75 65 L 104 60 Z"
                        fill="#94A3B8"
                        stroke="#0F172A"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M 54 74 L 66 74 L 64 103 L 56 103 Z"
                        fill="#94A3B8"
                        stroke="#0F172A"
                        strokeWidth="1.5"
                      />
                      {/* Center Hub Cap */}
                      <circle cx="60" cy="60" r="16" fill="#0B1424" stroke="#FFD014" strokeWidth="2.5" />
                      <circle cx="60" cy="60" r="9" fill="#E5252B" />
                      <circle cx="60" cy="60" r="3" fill="#FFD014" />
                    </svg>
                  </div>
                </div>
              ) : steeringMode === 'joystick' ? (
                /* MODE 4: Smooth Analog Virtual Thumbstick Joystick */
                <div className="pointer-events-auto touch-control flex flex-col items-center gap-1">
                  <div
                    ref={joyBaseRef}
                    role="slider"
                    aria-label="Analog Steering Joystick"
                    aria-valuemin={-100}
                    aria-valuemax={100}
                    aria-valuenow={0}
                    onPointerDown={handleJoystickPointerDown}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`touch-control relative w-[126px] h-[126px] sm:w-[144px] sm:h-[144px] rounded-full flex items-center justify-center select-none cursor-grab active:cursor-grabbing border-2 bg-[#0B1424]/62 ${
                      joyActive
                        ? 'border-[#FFD014] shadow-[0_0_18px_rgba(255,208,20,0.45)]'
                        : 'border-white/45 shadow-[0_6px_14px_rgba(0,0,0,0.55)]'
                    }`}
                  >
                    {/* Subtle directional crosshair tracks */}
                    <div className="pointer-events-none absolute inset-4 rounded-full border border-white/14" />
                    <div className="pointer-events-none absolute left-3 right-3 h-px bg-white/18" />
                    <div className="pointer-events-none absolute top-3 bottom-3 w-px bg-white/12" />
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-display italic font-black text-white/65">
                      L
                    </span>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-display italic font-black text-white/65">
                      R
                    </span>

                    {/* Draggable Thumbstick Knob (GPU transform updated directly via ref) */}
                    <div
                      ref={joyKnobRef}
                      className={`pointer-events-none will-change-transform w-[54px] h-[54px] sm:w-[60px] sm:h-[60px] rounded-full border-2 flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.65)] ${
                        joyActive
                          ? 'bg-gradient-to-b from-[#FFD014] to-[#d9a600] border-white'
                          : 'bg-gradient-to-b from-[#233452] to-[#0E182B] border-[#FFD014]/85'
                      }`}
                      style={{ transform: 'translate3d(0px, 0px, 0)' }}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border ${
                          joyActive
                            ? 'bg-[#0B1424]/85 border-white/70'
                            : 'bg-[#E5252B] border-[#FFD014]/75'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* MODE 1: Individually Bound Circular Arrow Controls with Wide Gap to Prevent Misclicks */
                <div className="pointer-events-auto touch-control flex items-center gap-7 sm:gap-9">
                  <button
                    type="button"
                    {...bindHoldControl('left')}
                    aria-label="Steer Left"
                    className={`touch-control w-[66px] h-[66px] sm:w-[76px] sm:h-[76px] rounded-full border-2 flex items-center justify-center transition-colors shadow-lg ${
                      pressed.left
                        ? 'bg-[#FFD014]/95 border-white text-[#0B1220] scale-95'
                        : 'bg-[#0B1220]/55 border-white/80 text-white'
                    }`}
                  >
                    <ChevronLeft className="w-10 h-10 stroke-[2.6] pointer-events-none" />
                  </button>
                  <button
                    type="button"
                    {...bindHoldControl('right')}
                    aria-label="Steer Right"
                    className={`touch-control w-[66px] h-[66px] sm:w-[76px] sm:h-[76px] rounded-full border-2 flex items-center justify-center transition-colors shadow-lg ${
                      pressed.right
                        ? 'bg-[#FFD014]/95 border-white text-[#0B1220] scale-95'
                        : 'bg-[#0B1220]/55 border-white/80 text-white'
                    }`}
                  >
                    <ChevronRight className="w-10 h-10 stroke-[2.6] pointer-events-none" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 -skew-x-10 bg-[#0D1626]/82 border border-white/12 text-[11px] text-slate-300">
              <div className="skew-x-10 flex items-center gap-2">
                <span>WASD / Arrows / Joystick</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#FFD014] font-bold">Auto-Drift on Turns</span>
                <span aria-hidden="true">·</span>
                <span>Shift / B: Nitro</span>
                <span aria-hidden="true">·</span>
                {transmissionMode === 'manual' ? (
                  <span className="text-[#FFD014] font-bold">Q/E or LB/RB: Gear</span>
                ) : (
                  <span>T: Auto/Man</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM-CENTER: Stylized Semicircle Arc Speedometer + Gear + Drift Points Underneath! */}
        <div className="flex items-end gap-2">
          {!showTouchControls && transmissionMode === 'manual' && !telemetry.finished && !paused && (
            <button
              type="button"
              onPointerDown={triggerShiftDown}
              aria-label="Shift Gear Down"
              title="Shift Down (Q)"
              className="pointer-events-auto touch-control -skew-x-10 w-11 h-14 bg-[#0D1626]/90 active:bg-[#FFD014] active:text-[#0B1220] border border-white/20 text-white flex flex-col items-center justify-center transition-colors mb-2"
            >
              <span className="skew-x-10 font-display italic font-black text-base leading-none">−</span>
              <span className="skew-x-10 text-[9px] font-mono-tabular text-slate-300">GEAR</span>
            </button>
          )}

          <div className="flex flex-col items-center">
            {/* Curved Semicircle Arc Speedometer (matching Game_UI_Screen!) */}
            <div className="relative w-[176px] sm:w-[216px] h-[104px] sm:h-[122px] flex items-end justify-center">
              <svg
                viewBox="0 0 200 112"
                className="w-full h-full"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="speedArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#E2E8F0" />
                    <stop offset="58%" stopColor="#FFD014" />
                    <stop offset="86%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#E5252B" />
                  </linearGradient>
                </defs>
                {/* Dark Semi-Circle Backing */}
                <path
                  d="M 16 106 A 84 84 0 0 1 184 106 Z"
                  fill="rgba(11, 18, 32, 0.84)"
                />
                {/* Outer Track Arc Base */}
                <path
                  d="M 22 104 A 78 78 0 0 1 178 104"
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="12"
                  strokeLinecap="butt"
                />
                {/* Active RPM / Speed Sweep Arc */}
                <path
                  d="M 22 104 A 78 78 0 0 1 178 104"
                  fill="none"
                  stroke="url(#speedArcGrad)"
                  strokeWidth="12"
                  strokeDasharray={`${activeArcLen} ${arcTotalLen + 40}`}
                  strokeLinecap="butt"
                />
                {/* Crisp White Outer Rim */}
                <path
                  d="M 15 104 A 85 85 0 0 1 185 104"
                  fill="none"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="1.5"
                />
              </svg>

              {/* Center Speed Readout + Gear Tag */}
              <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`px-1.5 py-0.5 -skew-x-10 text-[10px] font-display italic font-black leading-none ${
                      isReverse
                        ? 'bg-sky-500 text-slate-950'
                        : telemetry.shiftPrompt === 'up'
                        ? 'bg-[#E5252B] text-white'
                        : 'bg-[#FFD014] text-[#0B1220]'
                    }`}
                  >
                    <span className="block skew-x-10">
                      {isReverse ? 'REV' : `G${gearDisplay}/6`}
                    </span>
                  </span>
                  <span className="text-[9px] font-display italic font-bold text-slate-300">
                    {transmissionMode === 'manual' ? 'MAN' : 'AUTO'}
                  </span>
                </div>

                <div className="font-display italic font-black text-3xl sm:text-4xl leading-none text-white font-mono-tabular drop-shadow">
                  {telemetry.speedKmh}
                </div>
                <div className="text-[10px] sm:text-[11px] font-display italic font-bold text-slate-300 leading-none mt-0.5">
                  km/h
                </div>
              </div>
            </div>

            {/* Drift Points Bar Directly Underneath Speed Readout */}
            <div className="-skew-x-12 bg-[#0D1626]/92 border border-white/15 px-3.5 py-1 -mt-1 flex items-center gap-2 text-[11px] font-mono-tabular shadow-md">
              <div className="skew-x-12 flex items-center gap-1.5">
                <span className="font-display italic font-bold text-slate-300 text-[10px]">DRIFT PTS</span>
                <span className="font-display italic font-black text-[#FFD014] text-xs sm:text-sm">
                  {telemetry.driftPoints.toLocaleString()}
                </span>
                {telemetry.currentDriftChain > 10 && (
                  <span className="text-emerald-400 font-bold text-[10px]">
                    +{telemetry.currentDriftChain}×{telemetry.driftMultiplier}
                  </span>
                )}
              </div>
            </div>
          </div>

          {!showTouchControls && transmissionMode === 'manual' && !telemetry.finished && !paused && (
            <button
              type="button"
              onPointerDown={triggerShiftUp}
              aria-label="Shift Gear Up"
              title="Shift Up (E)"
              className={`pointer-events-auto touch-control -skew-x-10 w-11 h-14 border flex flex-col items-center justify-center transition-colors mb-2 ${
                telemetry.shiftPrompt === 'up'
                  ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                  : 'bg-[#0D1626]/90 active:bg-[#FFD014] active:text-[#0B1220] border-white/20 text-white'
              }`}
            >
              <span className="skew-x-10 font-display italic font-black text-base leading-none">+</span>
              <span className="skew-x-10 text-[9px] font-mono-tabular">GEAR</span>
            </button>
          )}
        </div>

        {/* RIGHT THUMB ZONE: Elevated & Well-Spaced Nitro Bolt + Ribbed Brake/Gas Pedals + REV (Auto-Drift on Turns!) */}
        <div className="flex items-end gap-2 mb-6 sm:mb-8 mr-1 sm:mr-2">
          {showTouchControls && !telemetry.finished && !paused ? (
            <div className="pointer-events-auto flex flex-col items-end gap-3 sm:gap-3.5">
              {/* Upper Row: Dedicated REV + Iconic Glowing Circular Yellow Nitro Bolt (No Drift Button Needed!) */}
              <div className="flex items-center gap-4 sm:gap-5">
                <button
                  type="button"
                  {...bindHoldControl('reverse')}
                  aria-label="Reverse Gear"
                  className={`touch-control -skew-x-10 h-10 px-4 border-2 font-display italic font-black text-xs transition-colors ${
                    pressed.reverse || isReverse
                      ? 'bg-sky-400 border-white text-[#0B1220]'
                      : 'bg-[#0D1626]/82 border-sky-400/70 text-sky-200'
                  }`}
                >
                  <span className="block skew-x-10">REV</span>
                </button>

                {/* Iconic Glowing Yellow Circular Nitro Button (matches Game_UI_Screen!) */}
                <button
                  type="button"
                  {...bindHoldControl('nitro')}
                  aria-label="Nitro Boost"
                  className={`touch-control relative w-[60px] h-[60px] sm:w-[68px] sm:h-[68px] rounded-full border-2 flex items-center justify-center transition-transform ${
                    pressed.nitro
                      ? 'bg-[#FFD014] border-white scale-95 shadow-[0_0_24px_rgba(255,208,20,0.95)]'
                      : 'bg-[#1D1B10]/85 border-[#FFD014] shadow-[0_0_18px_rgba(255,208,20,0.55)]'
                  }`}
                >
                  <Zap
                    className={`w-7 h-7 sm:w-8 sm:h-8 fill-current ${
                      pressed.nitro ? 'text-[#0B1220]' : 'text-[#FFD014]'
                    }`}
                  />
                  <span className="absolute -bottom-1 px-1.5 rounded bg-[#0D1626] border border-[#FFD014]/60 text-[9px] font-mono-tabular font-bold text-[#FFD014]">
                    {telemetry.nitroPct}%
                  </span>
                </button>
              </div>

              {/* Bottom Pedals Row: Stylized Metallic Ribbed BRAKE & Tall Ribbed GAS with extra thumb clearance */}
              <div className="flex items-end gap-4 sm:gap-5">
                {/* Metallic Ribbed Brake Pedal */}
                <button
                  type="button"
                  {...bindHoldControl('brake')}
                  aria-label="Brake"
                  className={`touch-control w-[62px] sm:w-[68px] h-[60px] sm:h-[66px] rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 shadow-lg transition-transform ${
                    pressed.brake
                      ? 'bg-red-500 border-white scale-95'
                      : 'bg-gradient-to-b from-slate-200 to-slate-400 border-slate-600'
                  }`}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`w-9 h-1.5 rounded-full ${
                        pressed.brake ? 'bg-white/90' : 'bg-slate-600/80'
                      }`}
                    />
                  ))}
                  <span
                    className={`text-[9px] font-display italic font-black leading-none mt-0.5 ${
                      pressed.brake ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    BRAKE
                  </span>
                </button>

                {/* Tall Metallic Diagonal-Ribbed Gas Pedal */}
                <button
                  type="button"
                  {...bindHoldControl('gas')}
                  aria-label="Accelerate"
                  className={`touch-control w-[60px] sm:w-[66px] h-[94px] sm:h-[104px] rounded-xl border-2 flex flex-col items-center justify-center gap-2 shadow-lg transition-transform ${
                    pressed.gas
                      ? 'bg-[#FFD014] border-white scale-95'
                      : 'bg-gradient-to-b from-slate-100 to-slate-300 border-slate-500'
                  }`}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`w-9 h-1.5 -rotate-18 rounded-full ${
                        pressed.gas ? 'bg-[#0B1220]/80' : 'bg-slate-600/75'
                      }`}
                    />
                  ))}
                  <span
                    className={`text-[10px] font-display italic font-black leading-none mt-1 ${
                      pressed.gas ? 'text-[#0B1220]' : 'text-slate-900'
                    }`}
                  >
                    GAS
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden md:block text-right -skew-x-10 px-3.5 py-1.5 bg-[#0D1626]/82 border border-white/12">
              <div className="skew-x-10">
                <div className="font-display italic font-bold text-xs text-white">
                  {TRACK_SPECS[trackId].name}
                </div>
                <div className="text-[10px] text-[#FFD014] font-semibold">
                  {telemetry.surface === 'offtrack'
                    ? 'Side Road / Shoulder'
                    : telemetry.surface === 'kerb'
                    ? trackId === 'city-track'
                      ? 'Italian Piazza Side Road'
                      : 'Road Border — Kerb'
                    : trackId === 'offroad-track'
                    ? 'Rolling Hills Dirt Rally'
                    : trackId === 'hill-track'
                    ? 'Alpine Mountain Pass'
                    : trackId === 'city-track'
                    ? 'Italian Cobblestone Street'
                    : trackId === 'riverside-track'
                    ? 'Riverside Circuit Road'
                    : trackId === 'stadium-track'
                    ? 'Arena Motorsport Tarmac'
                    : 'Racing Tarmac'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* PAUSE OVERLAY (Unified Apex Circuit Motorsport Theme) */}
      {paused && !telemetry.finished && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-[#050A14]/78 p-4">
          <div className="w-full max-w-sm rounded-lg bg-[#0B1424] border border-white/20 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 bg-[#08101E] border-b-2 border-[#FFD014]">
              <div className="flex items-center gap-2">
                <div className="-skew-x-12 px-2 py-0.5 bg-[#E5252B] text-white font-display italic font-black text-[10px]">
                  <span className="block skew-x-12">PAUSED</span>
                </div>
                <h2 className="font-display italic font-black text-xl text-white">RACE PAUSED</h2>
              </div>
              <span className="text-[11px] font-display italic font-bold text-[#FFD014]">
                LAP {telemetry.lap}/{telemetry.totalLaps}
              </span>
            </div>
            <div className="p-5 text-center space-y-3">
              <p className="text-xs font-display italic font-bold text-slate-300">
                {TRACK_SPECS[trackId].name} · {transmissionMode === 'manual' ? 'Manual 6-Speed' : 'Automatic 6-Speed'}
              </p>

              {/* 4 Control Options Chooser inside Pause Menu (USB/Bluetooth Gamepad always works too!) */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-display italic font-black text-[#FFD014] tracking-wider">
                  CONTROL OPTION
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'buttons' as SteeringMode, label: 'CONTROLS', Icon: Compass },
                      { id: 'joystick' as SteeringMode, label: 'JOYSTICK', Icon: Gamepad2 },
                      { id: 'gyro' as SteeringMode, label: 'GYROSCOPE', Icon: Smartphone },
                      { id: 'wheel' as SteeringMode, label: 'STEERING', Icon: Disc },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectSteeringMode(id)}
                      className={`h-9 px-1.5 -skew-x-10 border text-[10px] font-display italic font-black flex items-center justify-center transition-colors ${
                        steeringMode === id
                          ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                          : 'bg-[#14223A] border-white/18 text-white hover:border-[#FFD014]'
                      }`}
                    >
                      <span className="skew-x-10 flex items-center gap-1">
                        <Icon className="w-3 h-3 shrink-0" />
                        <span>{label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Battery & Thermal Graphics Mode inside Pause Menu */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-display italic font-black text-[#FFD014] tracking-wider">
                  MOBILE COOLING / GRAPHICS
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'eco' as PerformanceMode, label: 'COOL 30' },
                      { id: 'balanced' as PerformanceMode, label: 'BALANCED' },
                      { id: 'high' as PerformanceMode, label: 'HIGH' },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectPerformanceMode(id)}
                      className={`h-8 px-1.5 -skew-x-10 border text-[10px] font-display italic font-black flex items-center justify-center transition-colors ${
                        performanceMode === id
                          ? 'bg-emerald-400 border-emerald-300 text-[#052E16]'
                          : 'bg-[#14223A] border-white/18 text-white hover:border-emerald-400'
                      }`}
                    >
                      <span className="block skew-x-10">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="h-11 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] text-sm font-display italic font-black shadow-[0_6px_16px_rgba(255,208,20,0.3)] transition-colors"
                >
                  <span className="block skew-x-10">RESUME RACE »</span>
                </button>
                <button
                  type="button"
                  onClick={onRestartRace}
                  className="h-10 -skew-x-10 bg-[#14223A] hover:bg-[#1E3254] text-white text-sm font-display italic font-black border border-white/18 transition-colors"
                >
                  <span className="block skew-x-10">RESTART SESSION</span>
                </button>
                <button
                  type="button"
                  onClick={onExitToMenu}
                  className="h-10 -skew-x-10 bg-[#E5252B]/18 hover:bg-[#E5252B] text-white text-sm font-display italic font-bold border border-[#E5252B]/55 transition-colors"
                >
                  <span className="block skew-x-10">RETURN TO MENU</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RACE RESULT SCREEN: WINNING / LEVEL COMPLETE (1st or 2nd) vs LOSER SCREEN (3rd or worse) */}
      {telemetry.finished && (
        <div
          className={`pointer-events-auto fixed inset-0 z-30 flex flex-col justify-between px-2.5 py-2 lg:p-6 overflow-hidden select-none ${
            isWinner
              ? 'bg-gradient-to-r from-transparent via-[#071120]/25 to-[#071120]/82'
              : 'bg-gradient-to-r from-transparent via-[#18070C]/35 to-[#16060B]/88'
          }`}
        >
          {/* Celebratory fluttering confetti ONLY when winning (1st or 2nd place) */}
          {isWinner && (
            <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
              {confettiPieces.map((c, idx) => (
                <span
                  key={idx}
                  className="absolute w-2.5 h-3.5 lg:w-3.5 lg:h-5 rounded-[2px] opacity-90 shadow-sm"
                  style={{
                    left: c.left,
                    top: c.top,
                    backgroundColor: c.bg,
                    transform: `rotate(${c.rot})`,
                  }}
                />
              ))}
            </div>
          )}

          {/* TOP-LEFT FLOATING BRAND + UTILITIES */}
          <div className="pointer-events-auto absolute top-2 left-2.5 lg:top-5 lg:left-6 z-20 flex flex-col items-start gap-1.5 lg:gap-2">
            <div className="scale-[0.65] lg:scale-100 origin-top-left">
              <ApexLogo size="md" />
            </div>

            <div className="flex items-center gap-1.5 -mt-2 lg:mt-0">
              <button
                type="button"
                onClick={onToggleMute}
                title={muted ? 'Unmute Music' : 'Mute Music'}
                className="w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#0B1424]/90 hover:bg-[#162640] border border-white/20 text-white flex items-center justify-center transition-colors shadow-md"
              >
                {muted ? (
                  <VolumeX className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                ) : (
                  <Volume2
                    className={`w-3.5 h-3.5 lg:w-4 lg:h-4 ${
                      isWinner ? 'text-[#FFD014]' : 'text-[#FF4D55]'
                    }`}
                  />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenLeaderboard}
                title="Track Leaderboard"
                className="-skew-x-12 h-7 lg:h-9 px-2.5 lg:px-3 bg-[#0B1424]/90 hover:bg-[#162640] border border-white/20 text-white flex items-center gap-1.5 text-[10px] lg:text-xs font-display italic font-bold transition-colors shadow-md"
              >
                <Trophy className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-[#FFD014] skew-x-12" />
                <span className="skew-x-12">BOARD</span>
              </button>
              {isWinner && submittedRank && (
                <div className="-skew-x-12 h-7 lg:h-9 px-2 bg-[#0B1424]/90 border border-emerald-400/45 flex items-center text-[10px] lg:text-xs font-display italic font-bold text-emerald-300 shadow-md">
                  <span className="block skew-x-12">RANK #{submittedRank}</span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT-SIDE RESULT CARD: LEVEL COMPLETE (Win) OR YOU LOST (Defeat) */}
          <div className="relative z-10 flex-1 min-h-0 flex items-center justify-end pr-0.5 lg:pr-10">
            <div className="w-[278px] md:w-[330px] lg:w-[456px] flex flex-col items-center">
              {/* Emblem + Banner Ribbon */}
              <div className="relative flex flex-col items-center w-full">
                {isWinner ? (
                  /* WINNING HEADER: Checkered Flags + Gold Trophy */
                  <div className="relative flex items-end justify-center w-full -mb-1.5 lg:-mb-3">
                    <svg
                      viewBox="0 0 64 40"
                      className="w-11 h-7 lg:w-24 lg:h-14 -mr-2 lg:-mr-3 drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
                      aria-hidden="true"
                    >
                      <g transform="rotate(-14 32 20)">
                        <rect x="4" y="6" width="12" height="10" fill="#0F172A" />
                        <rect x="16" y="6" width="12" height="10" fill="#F8FAFC" />
                        <rect x="28" y="6" width="12" height="10" fill="#0F172A" />
                        <rect x="40" y="6" width="12" height="10" fill="#F8FAFC" />
                        <rect x="4" y="16" width="12" height="10" fill="#F8FAFC" />
                        <rect x="16" y="16" width="12" height="10" fill="#0F172A" />
                        <rect x="28" y="16" width="12" height="10" fill="#F8FAFC" />
                        <rect x="40" y="16" width="12" height="10" fill="#0F172A" />
                        <rect x="4" y="26" width="12" height="9" fill="#0F172A" />
                        <rect x="16" y="26" width="12" height="9" fill="#F8FAFC" />
                        <rect x="28" y="26" width="12" height="9" fill="#0F172A" />
                        <rect x="40" y="26" width="12" height="9" fill="#F8FAFC" />
                      </g>
                    </svg>

                    <div className="relative z-10 w-8 h-8 lg:w-16 lg:h-16 rounded-full bg-[#0C1628] border-2 border-[#FFD014] flex items-center justify-center shadow-[0_0_20px_rgba(255,208,20,0.5)]">
                      <Trophy className="w-4 h-4 lg:w-9 lg:h-9 text-[#FFD014] fill-[#FFD014]/35" />
                    </div>

                    <svg
                      viewBox="0 0 64 40"
                      className="w-11 h-7 lg:w-24 lg:h-14 -ml-2 lg:-ml-3 drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
                      aria-hidden="true"
                    >
                      <g transform="rotate(14 32 20)">
                        <rect x="12" y="6" width="12" height="10" fill="#F8FAFC" />
                        <rect x="24" y="6" width="12" height="10" fill="#0F172A" />
                        <rect x="36" y="6" width="12" height="10" fill="#F8FAFC" />
                        <rect x="48" y="6" width="12" height="10" fill="#0F172A" />
                        <rect x="12" y="16" width="12" height="10" fill="#0F172A" />
                        <rect x="24" y="16" width="12" height="10" fill="#F8FAFC" />
                        <rect x="36" y="16" width="12" height="10" fill="#0F172A" />
                        <rect x="48" y="16" width="12" height="10" fill="#F8FAFC" />
                        <rect x="12" y="26" width="12" height="9" fill="#F8FAFC" />
                        <rect x="24" y="26" width="12" height="9" fill="#0F172A" />
                        <rect x="36" y="26" width="12" height="9" fill="#F8FAFC" />
                        <rect x="48" y="26" width="12" height="9" fill="#0F172A" />
                      </g>
                    </svg>
                  </div>
                ) : (
                  /* LOSER HEADER: Crimson Defeat Emblem with Hazard Wings */
                  <div className="relative flex items-center justify-center w-full -mb-1.5 lg:-mb-3">
                    <div className="h-2.5 lg:h-4 w-12 lg:w-24 -skew-x-18 bg-gradient-to-l from-[#E5252B] to-transparent mr-1 opacity-85" />
                    <div className="relative z-10 w-9 h-9 lg:w-16 lg:h-16 rounded-full bg-[#1C080D] border-2 border-[#FF4D55] flex items-center justify-center shadow-[0_0_24px_rgba(229,37,43,0.65)]">
                      <XCircle className="w-5 h-5 lg:w-9 lg:h-9 text-[#FF4D55]" />
                    </div>
                    <div className="h-2.5 lg:h-4 w-12 lg:w-24 skew-x-18 bg-gradient-to-r from-[#E5252B] to-transparent ml-1 opacity-85" />
                  </div>
                )}

                {/* Bold Skewed Main Ribbon: Yellow LEVEL COMPLETE vs Crimson YOU LOST */}
                {isWinner ? (
                  <div className="relative z-20 -skew-x-14 bg-gradient-to-b from-[#FFE142] to-[#F5B800] border-2 border-[#FFF3A1] px-5 lg:px-10 py-0.5 lg:py-2 rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                    <div className="skew-x-14 text-center font-display italic font-black text-[#0B1220] leading-[0.95] tracking-tight">
                      <div className="text-sm lg:text-3xl">LEVEL</div>
                      <div className="text-base lg:text-4xl">COMPLETE</div>
                    </div>
                  </div>
                ) : (
                  <div className="relative z-20 -skew-x-14 bg-gradient-to-b from-[#F43F5E] to-[#B91C1C] border-2 border-[#FDA4AF] px-6 lg:px-12 py-0.5 lg:py-2 rounded-md shadow-[0_8px_28px_rgba(185,28,28,0.65)]">
                    <div className="skew-x-14 text-center font-display italic font-black text-white leading-[0.95] tracking-tight">
                      <div className="text-xs lg:text-2xl text-red-100">RACE FAILED</div>
                      <div className="text-base lg:text-4xl">YOU LOST</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-badge: Podium Victory Status vs Loss Reason */}
              <div
                className={`mt-1 lg:mt-2 -skew-x-12 px-3 py-0.5 text-[10px] lg:text-xs font-display italic font-black tracking-wide border ${
                  isWinner
                    ? 'bg-[#0C1628]/90 border-[#FFD014]/60 text-[#FFD014]'
                    : 'bg-[#21090F]/92 border-[#FF4D55]/60 text-[#FCA5A5]'
                }`}
              >
                <span className="block skew-x-12">
                  {mode === 'time-trial'
                    ? 'TIME TRIAL COMPLETED'
                    : isWinner
                    ? telemetry.position === 1
                      ? '1ST PLACE VICTORY!'
                      : '2ND PLACE — LEVEL CLEARED!'
                    : `FINISHED ${formatOrdinal(telemetry.position)} OF ${telemetry.totalRacers} — TOP 2 REQUIRED`}
                </span>
              </div>

              {/* 3 Stars Row (3 for 1st, 2 for 2nd, 0 lit on Loss) */}
              <div className="flex items-center justify-center gap-2 lg:gap-3 my-1 lg:my-2">
                {[1, 2, 3].map((starIdx) => {
                  const lit = starIdx <= earnedStars;
                  return (
                    <Star
                      key={starIdx}
                      className={`w-4 h-4 lg:w-10 lg:h-10 transition-transform ${
                        starIdx === 2 ? '-translate-y-0.5 scale-110' : ''
                      } ${
                        lit
                          ? 'text-[#FFD014] fill-[#FFD014] drop-shadow-[0_0_12px_rgba(255,208,20,0.8)]'
                          : isWinner
                          ? 'text-slate-600 fill-slate-800/80'
                          : 'text-red-950/90 fill-[#1E0B10]/90 stroke-[#7F1D1D]'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Summary Stats Card (Navy/Gold on Win vs Dark Crimson on Loss) */}
              <div
                className={`w-full -skew-x-6 rounded-xl px-3.5 lg:px-6 py-1 lg:py-3 shadow-[0_14px_34px_rgba(0,0,0,0.65)] border-2 ${
                  isWinner
                    ? 'bg-[#0B1424]/92 border-slate-400/35'
                    : 'bg-[#15090E]/94 border-[#E5252B]/55'
                }`}
              >
                <div className="skew-x-6 divide-y divide-white/10">
                  {/* Show Race Winner row when the player lost */}
                  {!isWinner && winnerStanding && !winnerStanding.isPlayer && (
                    <div className="flex items-center justify-between py-0.5 lg:py-1.5 text-xs lg:text-base">
                      <div className="flex items-center gap-2 lg:gap-3 text-red-200 font-display italic font-bold">
                        <Trophy className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-[#FFD014] shrink-0" />
                        <span>Winner</span>
                      </div>
                      <div className="font-display italic font-black text-[#FFD014] truncate max-w-[145px] lg:max-w-[220px]">
                        1ST · {winnerStanding.name}
                      </div>
                    </div>
                  )}

                  {/* Row 1: Position */}
                  <div className="flex items-center justify-between py-0.5 lg:py-1.5 text-xs lg:text-lg">
                    <div className="flex items-center gap-2 lg:gap-3 text-slate-200 font-display italic font-bold">
                      <Flag
                        className={`w-3.5 h-3.5 lg:w-5 lg:h-5 shrink-0 ${
                          isWinner ? 'text-[#FFD014]' : 'text-[#FF4D55]'
                        }`}
                      />
                      <span>Position</span>
                    </div>
                    <div
                      className={`font-display italic font-black font-mono-tabular ${
                        isWinner ? 'text-[#FFD014]' : 'text-[#FF4D55]'
                      }`}
                    >
                      {mode === 'time-trial'
                        ? 'TIME TRIAL'
                        : `${formatOrdinal(telemetry.position)} / ${telemetry.totalRacers}`}
                    </div>
                  </div>

                  {/* Row 2: Time + NEW BEST! */}
                  <div className="flex items-center justify-between py-0.5 lg:py-1.5 text-xs lg:text-lg">
                    <div className="flex items-center gap-2 lg:gap-3 text-slate-200 font-display italic font-bold">
                      <Timer className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-[#FFD014] shrink-0" />
                      <span>Time</span>
                    </div>
                    <div className="flex items-center gap-1.5 lg:gap-2">
                      <span className="font-display italic font-black text-white font-mono-tabular">
                        {formatLapTime(telemetry.totalRaceMs)}
                      </span>
                      {isWinner && isNewBest && (
                        <span className="-skew-x-12 px-1.5 lg:px-2 py-0.5 bg-[#4ADE80] text-[#052E16] text-[9px] lg:text-xs font-display italic font-black rounded-xs">
                          <span className="block skew-x-12">NEW BEST!</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Laps */}
                  <div className="flex items-center justify-between py-0.5 lg:py-1.5 text-xs lg:text-lg">
                    <div className="flex items-center gap-2 lg:gap-3 text-slate-200 font-display italic font-bold">
                      <Repeat className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-white shrink-0" />
                      <span>Laps</span>
                    </div>
                    <div className="font-display italic font-black text-white font-mono-tabular">
                      {telemetry.lap} / {telemetry.totalLaps}
                    </div>
                  </div>

                  {/* Row 4: Reward Coins (+ Drift Bonus) */}
                  <div className="flex items-center justify-between py-0.5 lg:py-1.5 text-xs lg:text-lg">
                    <div className="flex items-center gap-2 lg:gap-3 text-slate-200 font-display italic font-bold">
                      <Coins className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-[#FFD014] shrink-0" />
                      <span>Reward</span>
                    </div>
                    <div className="flex items-center gap-1.5 lg:gap-2">
                      <Coins
                        className={`w-3.5 h-3.5 lg:w-5 lg:h-5 ${
                          earnedCoins > 0 ? 'text-[#FFD014]' : 'text-slate-500'
                        }`}
                      />
                      <span
                        className={`font-display italic font-black font-mono-tabular ${
                          earnedCoins > 0 ? 'text-[#FFD014]' : 'text-slate-400'
                        }`}
                      >
                        {earnedCoins.toLocaleString()}
                      </span>
                      {telemetry.driftPoints > 0 && (
                        <span className="text-[9px] lg:text-xs font-mono-tabular text-slate-300 font-semibold">
                          · {telemetry.driftPoints.toLocaleString()} Drift
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Accent underline inside card bottom */}
                <div
                  className={`mt-0.5 lg:mt-1.5 h-0.5 lg:h-1 w-full bg-gradient-to-r from-transparent to-transparent opacity-85 ${
                    isWinner ? 'via-[#FFD014]' : 'via-[#E5252B]'
                  }`}
                />
              </div>

              {/* Quiet total coin balance + track name subtitle */}
              <div className="mt-0.5 lg:mt-1.5 flex items-center justify-between w-full px-1 text-[10px] lg:text-xs text-slate-300 font-display italic">
                <span>{TRACK_SPECS[trackId].name}</span>
                <span className="font-mono-tabular text-[#FFD014]">
                  Balance: {totalCoins.toLocaleString()} Coins
                </span>
              </div>
            </div>
          </div>

          {/* BOTTOM ACTION BAR: Replay (primary CTA on loss!), Main Menu, Next Level (primary CTA on win!) */}
          <div className="relative z-20 flex items-center justify-center gap-3 lg:gap-6 pt-1.5 lg:pt-3 shrink-0">
            <button
              type="button"
              onClick={onRestartRace}
              className={`-skew-x-12 h-9 lg:h-14 px-5 lg:px-10 rounded-lg border-2 shadow-xl flex items-center justify-center gap-2 transition-transform active:scale-95 ${
                isWinner
                  ? 'bg-[#121D31]/94 hover:bg-[#1D2D4A] border-slate-400/50 text-white'
                  : 'bg-gradient-to-b from-[#FFE142] to-[#F5B800] hover:from-[#ffea70] hover:to-[#ffd014] border-[#FFF5B8] text-[#0B1220] shadow-[0_6px_26px_rgba(255,208,20,0.5)]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 lg:w-5 lg:h-5 skew-x-12" />
              <span className="skew-x-12 font-display italic font-black text-xs lg:text-xl tracking-wide whitespace-nowrap">
                {isWinner ? 'REPLAY' : 'TRY AGAIN'}
              </span>
            </button>

            <button
              type="button"
              onClick={onExitToMenu}
              className="-skew-x-12 h-9 lg:h-14 px-5 lg:px-10 rounded-lg bg-[#121D31]/94 hover:bg-[#1D2D4A] border-2 border-slate-400/50 text-white shadow-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
            >
              <Home className="w-3.5 h-3.5 lg:w-5 lg:h-5 skew-x-12" />
              <span className="skew-x-12 font-display italic font-black text-xs lg:text-xl tracking-wide whitespace-nowrap">
                MAIN MENU
              </span>
            </button>

            {isWinner && (
              <button
                type="button"
                onClick={onNextLevel}
                className="-skew-x-12 h-9 lg:h-14 px-6 lg:px-12 rounded-lg bg-gradient-to-b from-[#FFE142] to-[#F5B800] hover:from-[#ffea70] hover:to-[#ffd014] border-2 border-[#FFF5B8] text-[#0B1220] shadow-[0_6px_26px_rgba(255,208,20,0.5)] flex items-center justify-center gap-1.5 transition-transform active:scale-95"
              >
                <span className="skew-x-12 font-display italic font-black text-xs lg:text-xl tracking-wide whitespace-nowrap">
                  NEXT LEVEL »
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
