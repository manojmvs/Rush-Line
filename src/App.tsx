import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CarFront,
  ChevronDown,
  Coins,
  Compass,
  Disc,
  Download,
  Gamepad2,
  Play,
  QrCode,
  RefreshCw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { ShowroomCanvas } from './components/ShowroomCanvas.tsx';
import { RaceCanvas, type TouchInputState } from './components/RaceCanvas.tsx';
import { GarageDock } from './components/GarageDock.tsx';
import { SelectRaceScreen } from './components/SelectRaceScreen.tsx';
import { MultiplayerOverlay } from './components/MultiplayerOverlay.tsx';
import { LeaderboardOverlay } from './components/LeaderboardOverlay.tsx';
import { RaceHud } from './components/RaceHud.tsx';
import { OfflineIndicator, PWAInstallModal } from './components/PWAInstallModal.tsx';
import { ApexLogo, CheckeredAccent } from './components/GameArtWidgets.tsx';
import { usePWAInstall } from './hooks/usePWAInstall.ts';
import { useAppUpdater } from './hooks/useAppUpdater.ts';
import { requestGyroPermission } from './hooks/useGyroSteering.ts';
import { gameMusic } from './game/audio.ts';
import {
  MultiplayerClient,
  isStaticHosting,
  submitLeaderboardRecord,
  type MultiplayerTransport,
} from './services/multiplayer.ts';
import {
  CHASSIS_SPECS,
  DEFAULT_VEHICLE_CONFIG,
  TRACK_ORDER,
  TRACK_SPECS,
  detectPlatform,
  getDefaultPerformanceMode,
  getRacePrizeCoins,
  type CameraMode,
  type ChassisId,
  type GameMode,
  type PerformanceMode,
  type RaceTelemetry,
  type RemoteCarState,
  type RoomState,
  type SteeringMode,
  type TimeOfDay,
  type TrackId,
  type TransmissionMode,
  type VehicleConfig,
} from './types/game.ts';

type MenuScreen = 'intro' | 'select' | 'garage' | 'multiplayer' | 'leaderboard';

const STORAGE_VEHICLE_KEY = 'apex-circuit-vehicle-v1';
const STORAGE_DRIVER_KEY = 'apex-circuit-driver-v1';
const STORAGE_COINS_KEY = 'apex-circuit-coins-v1';
const STORAGE_UNLOCKED_KEY = 'apex-circuit-unlocked-v1';
const STORAGE_TRANSMISSION_KEY = 'apex-circuit-transmission-v1';
const STORAGE_STEERING_KEY = 'apex-circuit-steering-v1';
const STORAGE_TIME_KEY = 'apex-circuit-time-v1';
const STORAGE_BEST_TIMES_KEY = 'apex-circuit-best-times-v1';
const STORAGE_PERF_KEY = 'apex-circuit-perf-v1';

const CAMERA_ORDER: CameraMode[] = ['chase', 'far-chase', 'hood', 'bumper'];

function loadBestTimes(): Partial<Record<TrackId, number>> {
  try {
    const raw = localStorage.getItem(STORAGE_BEST_TIMES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Partial<Record<TrackId, number>>;
    }
  } catch {
    // ignore
  }
  return {};
}

function loadTransmissionMode(): TransmissionMode {
  try {
    const saved = localStorage.getItem(STORAGE_TRANSMISSION_KEY);
    if (saved === 'manual' || saved === 'auto') return saved;
  } catch {
    // ignore
  }
  return 'auto';
}

function loadSteeringMode(): SteeringMode {
  try {
    const saved = localStorage.getItem(STORAGE_STEERING_KEY);
    if (saved === 'gyro' || saved === 'buttons' || saved === 'wheel' || saved === 'joystick') return saved;
  } catch {
    // ignore
  }
  return 'buttons';
}

function loadPerformanceMode(platform: ReturnType<typeof detectPlatform>): PerformanceMode {
  try {
    const saved = localStorage.getItem(STORAGE_PERF_KEY);
    if (saved === 'eco' || saved === 'balanced' || saved === 'high') return saved;
  } catch {
    // ignore
  }
  return getDefaultPerformanceMode(platform);
}

function loadTimeOfDay(): TimeOfDay {
  try {
    const saved = localStorage.getItem(STORAGE_TIME_KEY);
    if (saved === 'morning' || saved === 'evening' || saved === 'night') return saved;
  } catch {
    // ignore
  }
  return 'morning';
}

function loadUnlockedChassis(): ChassisId[] {
  try {
    const raw = localStorage.getItem(STORAGE_UNLOCKED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (id): id is ChassisId => typeof id === 'string' && id in CHASSIS_SPECS
        );
        if (!valid.includes('apex-gtr')) valid.unshift('apex-gtr');
        return Array.from(new Set(valid));
      }
    }
  } catch {
    // fallback
  }
  return ['apex-gtr'];
}

function loadCoins(): number {
  try {
    const raw = localStorage.getItem(STORAGE_COINS_KEY);
    if (raw !== null) {
      const val = Number(raw);
      if (Number.isFinite(val) && val >= 0) return Math.floor(val);
    }
  } catch {
    // fallback
  }
  return 0;
}

function loadSavedVehicle(unlocked: ChassisId[]): VehicleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_VEHICLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.chassisId &&
        CHASSIS_SPECS[parsed.chassisId as keyof typeof CHASSIS_SPECS] &&
        unlocked.includes(parsed.chassisId as ChassisId)
      ) {
        return { ...DEFAULT_VEHICLE_CONFIG, ...parsed };
      }
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_VEHICLE_CONFIG;
}

function loadDriverName(): string {
  try {
    const saved = localStorage.getItem(STORAGE_DRIVER_KEY);
    if (saved && saved.trim()) return saved.trim().slice(0, 20);
  } catch {
    // ignore
  }
  return 'RACER_01';
}

const INITIAL_TELEMETRY: RaceTelemetry = {
  speedKmh: 0,
  rpm: 1150,
  maxRpm: 8600,
  gear: 1,
  transmission: 'auto',
  shiftPrompt: null,
  nitroPct: 100,
  driftIntensity: 0,
  driftPoints: 0,
  currentDriftChain: 0,
  driftMultiplier: 1,
  surface: 'asphalt',
  lap: 1,
  totalLaps: 3,
  position: 1,
  totalRacers: 6,
  currentLapMs: 0,
  bestLapMs: 0,
  totalRaceMs: 0,
  wrongWay: false,
  countdown: 3,
  finished: false,
  cameraMode: 'chase',
  minimapCars: [],
  standings: [],
};

export default function App() {
  const platform = useMemo(() => detectPlatform(), []);
  const isTouchDevice = platform !== 'Desktop';
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const [unlockedChassis, setUnlockedChassis] = useState<ChassisId[]>(loadUnlockedChassis);
  const [coins, setCoins] = useState<number>(loadCoins);
  const [driverName, setDriverName] = useState<string>(loadDriverName);
  const [vehicle, setVehicle] = useState<VehicleConfig>(() => loadSavedVehicle(loadUnlockedChassis()));
  const [previewVehicle, setPreviewVehicle] = useState<VehicleConfig | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackId>('offroad-track');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(loadTimeOfDay);
  const [selectedMode, setSelectedMode] = useState<GameMode>('quick-race');
  const [selectedLaps, setSelectedLaps] = useState<number>(3);
  const [activeScreen, setActiveScreen] = useState<MenuScreen>('intro');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pendingRaceMode, setPendingRaceMode] = useState<GameMode | null>(null);

  // Landscape orientation helper for narrow mobile portrait
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);

  // Active race state
  const [inRace, setInRace] = useState(false);
  const [raceKey, setRaceKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showRaceObjective, setShowRaceObjective] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [transmissionMode, setTransmissionMode] = useState<TransmissionMode>(loadTransmissionMode);
  const [steeringMode, setSteeringMode] = useState<SteeringMode>(loadSteeringMode);
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() =>
    loadPerformanceMode(platform)
  );
  const [gyroNote, setGyroNote] = useState<string | null>(null);
  const [resetCounter, setResetCounter] = useState(0);
  const [showTouchControls, setShowTouchControls] = useState(isTouchDevice);
  const [telemetry, setTelemetry] = useState<RaceTelemetry>(INITIAL_TELEMETRY);
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [lastRecordId, setLastRecordId] = useState<string | null>(null);
  const [lastEarnedCoins, setLastEarnedCoins] = useState<number>(0);
  const [bestTimes, setBestTimes] = useState<Partial<Record<TrackId, number>>>(loadBestTimes);
  const [isNewBest, setIsNewBest] = useState(false);
  const [showPostRaceLeaderboard, setShowPostRaceLeaderboard] = useState(false);

  // Multiplayer WebSocket / WebRTC P2P state & Live OTA App Version sync
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  const [mpConnected, setMpConnected] = useState(false);
  const [mpTransport, setMpTransport] = useState<MultiplayerTransport>('ws');
  const [playerId, setPlayerId] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const code = new URLSearchParams(window.location.search).get('room') || '';
    return code.trim().toUpperCase().slice(0, 4);
  });
  const inviteAutoJoinedRef = useRef(false);

  const { updateStatus, checkForUpdate, applyUpdate } = useAppUpdater({
    deferReload: inRace && !telemetry.finished,
    serverVersion,
  });

  const peerStatesRef = useRef<Map<string, RemoteCarState>>(new Map());
  const touchInputRef = useRef<TouchInputState>({
    left: false,
    right: false,
    gyroSteer: 0,
    wheelSteer: 0,
    joystickSteer: 0,
    gas: false,
    brake: false,
    reverse: false,
    handbrake: false,
    nitro: false,
    shiftUpPending: false,
    shiftDownPending: false,
  });

  // Persist customization, progression, and driver callsign
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PERF_KEY, performanceMode);
    } catch {
      // ignore storage quota errors
    }
  }, [performanceMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_VEHICLE_KEY, JSON.stringify(vehicle));
    } catch {
      // ignore
    }
    mpClientRef.current?.updateVehicle(vehicle);
  }, [vehicle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COINS_KEY, String(coins));
    } catch {
      // ignore
    }
  }, [coins]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_UNLOCKED_KEY, JSON.stringify(unlockedChassis));
    } catch {
      // ignore
    }
  }, [unlockedChassis]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DRIVER_KEY, driverName);
    } catch {
      // ignore
    }
  }, [driverName]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TRANSMISSION_KEY, transmissionMode);
    } catch {
      // ignore
    }
  }, [transmissionMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STEERING_KEY, steeringMode);
    } catch {
      // ignore
    }
  }, [steeringMode]);

  const handleSelectSteeringMode = useCallback(async (nextMode: SteeringMode) => {
    touchInputRef.current.gyroSteer = 0;
    touchInputRef.current.wheelSteer = 0;
    touchInputRef.current.joystickSteer = 0;

    if (nextMode === 'gyro') {
      const perm = await requestGyroPermission();
      if (perm === 'denied') {
        setGyroNote('Motion sensor permission denied — keeping Controls.');
        setSteeringMode('buttons');
        return;
      }
      setGyroNote(
        perm === 'unsupported'
          ? 'Tilt sensor unavailable on this device — keyboard A/D still works.'
          : null
      );
      setSteeringMode('gyro');
      return;
    }

    setGyroNote(null);
    if (nextMode === 'wheel' || nextMode === 'joystick') {
      setShowTouchControls(true);
    }
    setSteeringMode(nextMode);
  }, []);

  // Allow Hardware USB/Bluetooth Gamepad Start/A buttons to resume Pause, dismiss Objective, or Replay!
  useEffect(() => {
    if (!inRace || (!paused && !showRaceObjective && !telemetry.finished)) return;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    let rafId = 0;
    let prevStart = true;
    let prevConfirm = true;

    const pollOverlayGamepad = () => {
      const pads = navigator.getGamepads();
      let gp: Gamepad | null = null;
      if (pads) {
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]?.connected) {
            gp = pads[i];
            break;
          }
        }
      }
      if (gp) {
        const startDown = Boolean(gp.buttons[9]?.pressed);
        const confirmDown = Boolean(gp.buttons[0]?.pressed);
        if (showRaceObjective && ((confirmDown && !prevConfirm) || (startDown && !prevStart))) {
          setShowRaceObjective(false);
        } else if (paused && !telemetry.finished && ((startDown && !prevStart) || (confirmDown && !prevConfirm))) {
          setPaused(false);
        }
        prevStart = startDown;
        prevConfirm = confirmDown;
      } else {
        prevStart = false;
        prevConfirm = false;
      }
      rafId = requestAnimationFrame(pollOverlayGamepad);
    };

    rafId = requestAnimationFrame(pollOverlayGamepad);
    return () => cancelAnimationFrame(rafId);
  }, [inRace, paused, showRaceObjective, telemetry.finished]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TIME_KEY, timeOfDay);
    } catch {
      // ignore
    }
  }, [timeOfDay]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_BEST_TIMES_KEY, JSON.stringify(bestTimes));
    } catch {
      // ignore
    }
  }, [bestTimes]);

  // Unlock background Web Audio music on first user gesture
  useEffect(() => {
    const unlockMusic = () => {
      gameMusic.unlock();
    };
    window.addEventListener('pointerdown', unlockMusic, { passive: true });
    window.addEventListener('keydown', unlockMusic, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockMusic);
      window.removeEventListener('keydown', unlockMusic);
    };
  }, []);

  // Sync game music: upbeat Intro theme in menus, Victory fanfare for 1st/2nd win, Defeat sting when lost, off while driving
  useEffect(() => {
    gameMusic.setMuted(muted);
    if (inRace && telemetry.finished) {
      const wonRace = selectedMode === 'time-trial' || telemetry.position <= 3;
      gameMusic.setMode(wonRace ? 'victory' : 'defeat');
    } else if (!inRace) {
      gameMusic.setMode('intro');
    } else {
      gameMusic.setMode('off');
    }
  }, [inRace, telemetry.finished, telemetry.position, selectedMode, muted]);

  // Clear locked car preview when returning to intro
  useEffect(() => {
    if (activeScreen === 'intro') {
      setPreviewVehicle(null);
    }
  }, [activeScreen]);

  // Orientation detection for mobile portrait warning
  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 640;
      setIsPortraitMobile(portrait);
      if (!portrait) setPortraitDismissed(false);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Connect live multiplayer WebSocket client
  useEffect(() => {
    const client = new MultiplayerClient();
    mpClientRef.current = client;

    client.setCallbacks({
      onConnectionChange: (conn) => setMpConnected(conn),
      onTransportChange: (t) => setMpTransport(t),
      onSessionInit: (id) => setPlayerId(id),
      onAppVersion: (ver) => setServerVersion(ver),
      onRoomState: (nextRoom) => {
        setRoom(nextRoom);
        setMpError(null);
        if (nextRoom) {
          setSelectedTrack(nextRoom.trackId);
          if (nextRoom.status === 'racing') {
            peerStatesRef.current.clear();
            setSelectedMode('multiplayer');
            setPaused(false);
            setShowRaceObjective(false);
            setSubmittedRank(null);
            setLastEarnedCoins(0);
            setTelemetry(INITIAL_TELEMETRY);
            setInRace(true);
            setRaceKey((k) => k + 1);
          }
        }
      },
      onCountdown: (c) => {
        setRoom((prev) => (prev ? { ...prev, countdown: c } : prev));
      },
      onRaceStart: () => {
        peerStatesRef.current.clear();
        setSelectedMode('multiplayer');
        setPaused(false);
        setShowRaceObjective(false);
        setSubmittedRank(null);
        setLastEarnedCoins(0);
        setTelemetry(INITIAL_TELEMETRY);
        setInRace(true);
        setRaceKey((k) => k + 1);
      },
      onPeerState: (pid, state) => {
        peerStatesRef.current.set(pid, state);
      },
      onError: (msg) => {
        setMpError(msg);
      },
    });

    // On full-stack servers, connect WebSocket immediately for live rooms & OTA version sync.
    // On static hosts (GitHub Pages), connect Direct P2P lazily when opening Multiplayer or an invite link
    // so initial game launch never depends on external WebRTC signaling.
    if (!isStaticHosting() || pendingInviteCode) {
      client.connect();
    } else {
      setMpTransport('p2p');
    }
    return () => {
      client.disconnect();
    };
  }, []);

  // Connect Direct P2P automatically whenever the player opens the Multiplayer lobby on GitHub Pages
  useEffect(() => {
    if ((activeScreen === 'multiplayer' || pendingInviteCode) && mpClientRef.current && !mpConnected) {
      mpClientRef.current.connect();
    }
  }, [activeScreen, pendingInviteCode, mpConnected]);

  // If opened via a shared ?room=XXXX invite link, open Multiplayer lobby & auto-join once connected!
  useEffect(() => {
    if (!pendingInviteCode || inviteAutoJoinedRef.current) return;
    setActiveScreen('multiplayer');
    if (mpConnected && mpClientRef.current) {
      inviteAutoJoinedRef.current = true;
      mpClientRef.current.joinRoom(pendingInviteCode, driverName, platform, vehicle);
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('room');
        window.history.replaceState({}, '', cleanUrl.toString());
      } catch {
        // ignore history errors
      }
      setPendingInviteCode('');
    }
  }, [pendingInviteCode, mpConnected, driverName, platform, vehicle]);

  // Keyboard shortcuts during race
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement
      ) {
        return;
      }
      if (inRace) {
        if (showRaceObjective) {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            setShowRaceObjective(false);
          }
          return;
        }
        if (e.code === 'KeyC') {
          setCameraMode((prev) => CAMERA_ORDER[(CAMERA_ORDER.indexOf(prev) + 1) % CAMERA_ORDER.length]);
        } else if (e.code === 'KeyT') {
          setTransmissionMode((prev) => (prev === 'auto' ? 'manual' : 'auto'));
        } else if (e.code === 'Escape' || e.code === 'KeyP') {
          setPaused((p) => !p);
        } else if (e.code === 'KeyM') {
          setMuted((m) => !m);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inRace, showRaceObjective]);

  const handleSelectChassis = useCallback(
    (chassisId: ChassisId) => {
      const spec = CHASSIS_SPECS[chassisId];
      if (unlockedChassis.includes(chassisId)) {
        setPreviewVehicle(null);
        setVehicle((prev) => ({
          ...prev,
          chassisId,
          primaryColor: spec.defaultColor,
          accentColor: spec.defaultAccent,
        }));
      } else {
        setPreviewVehicle({
          ...vehicle,
          chassisId,
          primaryColor: spec.defaultColor,
          accentColor: spec.defaultAccent,
        });
      }
    },
    [unlockedChassis, vehicle]
  );

  const handleUnlockChassis = useCallback(
    (chassisId: ChassisId) => {
      const spec = CHASSIS_SPECS[chassisId];
      if (unlockedChassis.includes(chassisId)) return;
      if (coins < spec.unlockCost) return;

      setCoins((prev) => Math.max(0, prev - spec.unlockCost));
      setUnlockedChassis((prev) => (prev.includes(chassisId) ? prev : [...prev, chassisId]));

      const equippedConfig: VehicleConfig =
        previewVehicle && previewVehicle.chassisId === chassisId
          ? previewVehicle
          : {
              ...vehicle,
              chassisId,
              primaryColor: spec.defaultColor,
              accentColor: spec.defaultAccent,
            };

      setVehicle(equippedConfig);
      setPreviewVehicle(null);
    },
    [coins, unlockedChassis, previewVehicle, vehicle]
  );

  const handleGarageVehicleChange = useCallback(
    (next: VehicleConfig) => {
      if (unlockedChassis.includes(next.chassisId)) {
        setVehicle(next);
        setPreviewVehicle(null);
      } else {
        setPreviewVehicle(next);
      }
    },
    [unlockedChassis]
  );

  const handleResetGarageVehicle = useCallback(() => {
    const activeCid = previewVehicle?.chassisId ?? vehicle.chassisId;
    const spec = CHASSIS_SPECS[activeCid];
    const resetConfig: VehicleConfig = {
      ...DEFAULT_VEHICLE_CONFIG,
      chassisId: activeCid,
      primaryColor: spec.defaultColor,
      accentColor: spec.defaultAccent,
    };
    if (unlockedChassis.includes(activeCid)) {
      setVehicle(resetConfig);
      setPreviewVehicle(null);
    } else {
      setPreviewVehicle(resetConfig);
    }
  }, [previewVehicle, vehicle.chassisId, unlockedChassis]);

  const openPreRaceModal = useCallback(
    (modeToRun?: GameMode) => {
      const targetMode = modeToRun ?? selectedMode;
      if (targetMode === 'multiplayer') {
        setActiveScreen('multiplayer');
        return;
      }
      setPendingRaceMode(targetMode);
    },
    [selectedMode]
  );

  const launchLocalRace = useCallback(
    (modeToRun: GameMode, chosenTransmission: TransmissionMode) => {
      if (steeringMode === 'gyro') {
        void requestGyroPermission();
      }
      setPendingRaceMode(null);
      setTransmissionMode(chosenTransmission);
      setPreviewVehicle(null);
      setSelectedMode(modeToRun);
      setPaused(false);
      setShowRaceObjective(true);
      setSubmittedRank(null);
      setLastEarnedCoins(0);
      setIsNewBest(false);
      setShowPostRaceLeaderboard(false);
      setTelemetry({ ...INITIAL_TELEMETRY, transmission: chosenTransmission, totalLaps: selectedLaps });
      setInRace(true);
      setRaceKey((k) => k + 1);
    },
    [selectedLaps, steeringMode]
  );

  const handleRestartRace = useCallback(() => {
    if (selectedMode === 'multiplayer' && room) {
      mpClientRef.current?.returnLobby();
      setInRace(false);
      setShowRaceObjective(false);
      setActiveScreen('multiplayer');
      return;
    }
    setPaused(false);
    setShowRaceObjective(true);
    setSubmittedRank(null);
    setLastEarnedCoins(0);
    setIsNewBest(false);
    setTelemetry({ ...INITIAL_TELEMETRY, transmission: transmissionMode, totalLaps: selectedLaps });
    setRaceKey((k) => k + 1);
  }, [selectedMode, room, transmissionMode, selectedLaps]);

  const handleNextLevel = useCallback(() => {
    if (selectedMode === 'multiplayer' && room) {
      mpClientRef.current?.returnLobby();
      setInRace(false);
      setShowRaceObjective(false);
      setActiveScreen('multiplayer');
      return;
    }
    const curIdx = TRACK_ORDER.indexOf(selectedTrack);
    const nextTrack = TRACK_ORDER[(curIdx + 1) % TRACK_ORDER.length];
    setSelectedTrack(nextTrack);
    setPaused(false);
    setShowRaceObjective(true);
    setSubmittedRank(null);
    setLastEarnedCoins(0);
    setIsNewBest(false);
    setShowPostRaceLeaderboard(false);
    setTelemetry({ ...INITIAL_TELEMETRY, transmission: transmissionMode, totalLaps: selectedLaps });
    setRaceKey((k) => k + 1);
  }, [selectedMode, room, selectedTrack, transmissionMode, selectedLaps]);

  const handleExitToMenu = useCallback(
    (destination: MenuScreen = 'intro') => {
      setInRace(false);
      setPaused(false);
      setShowRaceObjective(false);
      setIsNewBest(false);
      setShowPostRaceLeaderboard(false);
      if (selectedMode === 'multiplayer' && room) {
        mpClientRef.current?.leaveRoom();
        setRoom(null);
      }
      setActiveScreen(destination);
    },
    [selectedMode, room]
  );

  const handleBroadcastState = useCallback((state: RemoteCarState) => {
    mpClientRef.current?.sendTelemetry(state);
  }, []);

  const handleRaceFinish = useCallback(
    async (result: {
      position: number;
      completedAllLaps: boolean;
      bestLapMs: number;
      totalTimeMs: number;
      topSpeedKmh: number;
    }) => {
      const finishedTrackId = room?.trackId ?? selectedTrack;
      const prevBest = bestTimes[finishedTrackId];
      const beatBest =
        result.completedAllLaps &&
        result.totalTimeMs > 0 &&
        (!prevBest || result.totalTimeMs < prevBest);
      setIsNewBest(beatBest);
      if (beatBest) {
        setBestTimes((prev) => ({ ...prev, [finishedTrackId]: result.totalTimeMs }));
      }

      const prizeCoins = getRacePrizeCoins(result.position, selectedMode);
      setLastEarnedCoins(prizeCoins);
      if (prizeCoins > 0) {
        setCoins((prev) => prev + prizeCoins);
      }

      if (result.completedAllLaps || result.position <= 3 || selectedMode === 'time-trial') {
        const res = await submitLeaderboardRecord({
          driverName: driverName.trim() || 'RACER_01',
          platform,
          trackId: finishedTrackId,
          mode: selectedMode,
          chassisId: vehicle.chassisId,
          bestLapMs: result.bestLapMs,
          totalTimeMs: result.totalTimeMs,
          topSpeedKmh: result.topSpeedKmh,
        });
        if (res) {
          setSubmittedRank(res.trackRank);
          setLastRecordId(res.entry.id);
        }
      }
    },
    [driverName, platform, room, selectedTrack, selectedMode, vehicle.chassisId, bestTimes]
  );

  const activeTrackId = selectedMode === 'multiplayer' && room ? room.trackId : selectedTrack;
  const displayVehicle = previewVehicle ?? vehicle;
  const driverLevel = Math.max(1, unlockedChassis.length + Math.floor(coins / 500));
  const xpPercent = Math.min(100, Math.round(((coins % 500) / 500) * 100) || 45);

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#0B1220]">
      <OfflineIndicator />

      {/* Live OTA Update Notification (only shown while syncing a new update or ready after a race) */}
      {(updateStatus === 'updating' || updateStatus === 'ready') && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 -skew-x-10 bg-[#0D1626]/95 border-2 border-[#FFD014] px-4 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.65)] flex items-center gap-3">
          <div className="skew-x-10 flex items-center gap-2.5 text-xs font-display italic font-bold text-white whitespace-nowrap">
            <RefreshCw
              className={`w-4 h-4 text-[#FFD014] shrink-0 ${
                updateStatus === 'updating' ? 'animate-spin' : ''
              }`}
            />
            <span>
              {updateStatus === 'updating'
                ? 'SYNCING LATEST UPDATE...'
                : 'NEW GAME UPDATE READY'}
            </span>
            {updateStatus === 'ready' && (
              <button
                type="button"
                onClick={() => void applyUpdate()}
                className="ml-1 px-2.5 py-1 rounded bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] text-[11px] font-black transition-colors"
              >
                UPDATE NOW
              </button>
            )}
          </div>
        </div>
      )}

      {/* Portrait Orientation Prompt for Mobile Devices */}
      {isPortraitMobile && !portraitDismissed && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B1220]/96 p-6 text-center">
          <RotateCw className="w-10 h-10 text-[#FFD014] mb-4" />
          <h1 className="font-display italic font-black text-xl text-white">
            ROTATE TO LANDSCAPE
          </h1>
          <p className="text-xs text-slate-300 max-w-xs mt-2 leading-relaxed">
            RUSH LINE is built for wide horizontal racing with dual-thumb steering and pedal ergonomics.
          </p>
          <button
            type="button"
            onClick={() => setPortraitDismissed(true)}
            className="mt-5 h-11 px-6 -skew-x-10 bg-[#FFD014] text-[#0B1220] text-xs font-display italic font-black transition-colors"
          >
            <span className="block skew-x-10">CONTINUE ANYWAY</span>
          </button>
        </div>
      )}

      {!inRace ? (
        <>
          {/* Full-Bleed 3D Backdrop for Intro (Alpine Circuit) & Garage / Overlays (Dark LED Turntable Bay) */}
          {activeScreen !== 'select' && (
            <ShowroomCanvas
              vehicle={displayVehicle}
              sceneMode={activeScreen === 'intro' ? 'intro' : 'garage'}
              interactive={false}
            />
          )}

          {/* ===============================================================
              SCREEN 1: INTRO SCREEN (matching Intro_screen reference!)
             =============================================================== */}
          {activeScreen === 'intro' && (
            <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2 sm:px-3 sm:py-2 lg:p-5 select-none overflow-hidden">
              {/* Top Row: Driver Profile Plate (Left) + Coins & Install Android (Right) */}
              <div className="relative z-20 flex items-start justify-between gap-2 shrink-0">
                {/* Top-Left Driver Level Badge */}
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="pointer-events-auto -skew-x-14 bg-[#101929]/90 hover:bg-[#18263D] border border-white/18 px-2.5 lg:px-4 py-1 lg:py-1.5 flex items-center gap-2 lg:gap-2.5 shadow-xl transition-colors"
                >
                  <div className="skew-x-14 w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-white/12 border border-white/30 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />
                  </div>
                  <div className="skew-x-14 text-left">
                    <div className="font-display italic font-black text-[11px] lg:text-sm text-white leading-none">
                      {driverName}
                    </div>
                    <div className="flex items-center gap-1.5 lg:gap-2 mt-0.5 lg:mt-1">
                      <span className="text-[9px] lg:text-[10px] font-display italic font-bold text-slate-300">
                        Lv. {driverLevel}
                      </span>
                      <div className="w-12 lg:w-16 h-1 lg:h-1.5 bg-white/15 overflow-hidden">
                        <div className="h-full bg-[#FFD014]" style={{ width: `${xpPercent}%` }} />
                      </div>
                    </div>
                  </div>
                </button>

                {/* Top-Right Music Toggle + Currency + Install Android */}
                <div className="pointer-events-auto flex items-center gap-1.5 lg:gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      gameMusic.unlock();
                      setMuted((m) => !m);
                    }}
                    title={muted ? 'Unmute Game Music' : 'Mute Game Music'}
                    className="-skew-x-14 w-7 h-7 lg:w-9 lg:h-9 bg-[#101929]/92 hover:bg-[#192842] border border-white/18 text-white flex items-center justify-center shadow-xl transition-colors"
                  >
                    {muted ? (
                      <VolumeX className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-400 skew-x-14" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#FFD014] skew-x-14" />
                    )}
                  </button>

                  <div className="-skew-x-14 bg-[#101929]/92 border border-white/18 pl-2.5 pr-1 py-0.5 lg:pl-3 lg:pr-1.5 lg:py-1 flex items-center gap-2 shadow-xl">
                    <div className="skew-x-14 flex items-center gap-1 lg:gap-1.5">
                      <Coins className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#FFD014]" />
                      <span className="font-display italic font-black text-xs lg:text-base text-white font-mono-tabular">
                        {coins.toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveScreen('select')}
                      title="Win races to earn 500 / 300 / 100 Coins"
                      className="w-5 h-5 lg:w-7 lg:h-7 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] flex items-center justify-center font-black text-xs lg:text-sm transition-colors"
                    >
                      <span className="skew-x-14 leading-none">+</span>
                    </button>
                  </div>

                  {!isInstalled && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (isInstallable) {
                          const accepted = await install();
                          if (!accepted) setShowInstallModal(true);
                        } else {
                          setShowInstallModal(true);
                        }
                      }}
                      className="-skew-x-14 bg-[#FFD014] hover:bg-[#ffe04d] border border-[#FFD014] pl-1 pr-2.5 lg:pl-1.5 lg:pr-3.5 py-0.5 lg:py-1 flex items-center gap-1.5 lg:gap-2 text-[#0B1220] shadow-[0_4px_18px_rgba(255,208,20,0.45)] transition-colors"
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}assets/aistudio/ICON_49f818b7.jpeg`}
                        alt="RUSH LINE Icon"
                        className="skew-x-14 w-5 h-5 lg:w-6 lg:h-6 rounded-md object-cover border border-[#0B1220]/30 shrink-0"
                      />
                      <span className="skew-x-14 font-display italic font-black text-[10px] lg:text-xs whitespace-nowrap flex items-center gap-1">
                        {isInstallable ? (
                          <Download className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                        ) : (
                          <Smartphone className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                        )}
                        INSTALL ANDROID
                      </span>
                    </button>
                  )}

                  {isInstalled && (
                    <button
                      type="button"
                      onClick={() => setShowInstallModal(true)}
                      className="-skew-x-14 bg-[#101929]/92 hover:bg-[#192842] border border-white/18 px-2.5 lg:px-3 py-1 lg:py-1.5 flex items-center gap-1.5 text-white shadow-xl transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#FFD014] skew-x-14" />
                      <span className="skew-x-14 font-display italic font-bold text-[10px] lg:text-xs whitespace-nowrap">
                        SHARE QR
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Center-Top Hero APEX CIRCUIT Logo (absolute so it NEVER pushes left menu off-screen!) */}
              <div className="pointer-events-none absolute top-2 lg:top-6 left-1/2 -translate-x-1/2 z-10 scale-[0.62] sm:scale-[0.72] lg:scale-100 origin-top">
                <ApexLogo size="lg" />
              </div>

              {/* Bottom-Left Skewed Vertical Navigation Stack (all 5 buttons cleanly visible on mobile!) */}
              <div className="relative z-20 flex items-end justify-between gap-2 min-h-0">
                <nav className="pointer-events-auto flex flex-col gap-1.5 lg:gap-2 w-[178px] sm:w-[196px] lg:w-[250px] ml-1 lg:ml-3 mb-0.5 lg:mb-1">
                  {/* Primary Yellow PLAY Button -> Opens SELECT RACE */}
                  <button
                    type="button"
                    onClick={() => setActiveScreen('select')}
                    className="-skew-x-14 h-10 lg:h-14 px-4 lg:px-5 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] shadow-[0_8px_24px_rgba(255,208,20,0.45)] flex items-center gap-2.5 lg:gap-3 transition-transform active:scale-95"
                  >
                    <Play className="w-4 h-4 lg:w-5 lg:h-5 fill-current skew-x-14 shrink-0" />
                    <span className="skew-x-14 font-display italic font-black text-lg lg:text-2xl tracking-wide leading-none">
                      PLAY
                    </span>
                  </button>

                  {/* GARAGE */}
                  <button
                    type="button"
                    onClick={() => setActiveScreen('garage')}
                    className="-skew-x-14 h-8 lg:h-11 px-4 lg:px-5 bg-[#101929]/92 hover:bg-[#1B2B45] border border-white/18 text-white shadow-lg flex items-center gap-2.5 lg:gap-3 transition-colors"
                  >
                    <CarFront className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white skew-x-14 shrink-0" />
                    <span className="skew-x-14 font-display italic font-bold text-xs lg:text-base tracking-wide leading-none">
                      GARAGE
                    </span>
                  </button>

                  {/* MULTIPLAYER */}
                  <button
                    type="button"
                    onClick={() => setActiveScreen('multiplayer')}
                    className="-skew-x-14 h-8 lg:h-11 px-4 lg:px-5 bg-[#101929]/92 hover:bg-[#1B2B45] border border-white/18 text-white shadow-lg flex items-center gap-2.5 lg:gap-3 transition-colors"
                  >
                    <Trophy className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white skew-x-14 shrink-0" />
                    <span className="skew-x-14 font-display italic font-bold text-xs lg:text-base tracking-wide leading-none">
                      MULTIPLAYER
                    </span>
                  </button>

                  {/* LEADERBOARD */}
                  <button
                    type="button"
                    onClick={() => setActiveScreen('leaderboard')}
                    className="-skew-x-14 h-8 lg:h-11 px-4 lg:px-5 bg-[#101929]/92 hover:bg-[#1B2B45] border border-white/18 text-white shadow-lg flex items-center gap-2.5 lg:gap-3 transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white skew-x-14 shrink-0" />
                    <span className="skew-x-14 font-display italic font-bold text-xs lg:text-base tracking-wide leading-none">
                      LEADERBOARD
                    </span>
                  </button>

                  {/* SETTINGS */}
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="-skew-x-14 h-8 lg:h-11 px-4 lg:px-5 bg-[#101929]/92 hover:bg-[#1B2B45] border border-white/18 text-white shadow-lg flex items-center gap-2.5 lg:gap-3 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white skew-x-14 shrink-0" />
                    <span className="skew-x-14 font-display italic font-bold text-xs lg:text-base tracking-wide leading-none">
                      SETTINGS
                    </span>
                  </button>
                </nav>
              </div>
            </div>
          )}

          {/* ===============================================================
              SCREEN 2: RACE SELECTION SCREEN (matching race_selection_screen!)
             =============================================================== */}
          {activeScreen === 'select' && (
            <SelectRaceScreen
              vehicle={displayVehicle}
              coins={coins}
              unlockedChassis={unlockedChassis}
              selectedTrack={selectedTrack}
              selectedMode={selectedMode}
              timeOfDay={timeOfDay}
              laps={selectedLaps}
              onSelectChassis={handleSelectChassis}
              onUnlockChassis={handleUnlockChassis}
              onSelectTrack={(trackId) => {
                setSelectedTrack(trackId);
                if (trackId === 'city-track') setTimeOfDay('evening');
              }}
              onSelectMode={setSelectedMode}
              onSelectTimeOfDay={setTimeOfDay}
              onSelectLaps={setSelectedLaps}
              onBack={() => setActiveScreen('intro')}
              onOpenGarage={() => setActiveScreen('garage')}
              onOpenInstall={() => setShowInstallModal(true)}
              onStartRace={() => openPreRaceModal(selectedMode)}
            />
          )}

          {/* ===============================================================
              SCREEN 3: GARAGE SCREEN (matching garage_screen reference!)
             =============================================================== */}
          {activeScreen === 'garage' && (
            <GarageDock
              vehicle={displayVehicle}
              equippedChassisId={vehicle.chassisId}
              coins={coins}
              unlockedChassis={unlockedChassis}
              transmissionMode={transmissionMode}
              onToggleTransmission={() =>
                setTransmissionMode((prev) => (prev === 'auto' ? 'manual' : 'auto'))
              }
              onSelectChassis={handleSelectChassis}
              onUnlockChassis={handleUnlockChassis}
              onChange={handleGarageVehicleChange}
              onResetVehicle={handleResetGarageVehicle}
              onBack={() => setActiveScreen('intro')}
              onGoToSelectRace={() => setActiveScreen('select')}
            />
          )}

          {activeScreen === 'multiplayer' && (
            <MultiplayerOverlay
              connected={mpConnected}
              transport={mpTransport}
              playerId={playerId}
              initialJoinCode={pendingInviteCode}
              driverName={driverName}
              platform={platform}
              selectedTrack={selectedTrack}
              room={room}
              errorMessage={mpError}
              onDriverNameChange={setDriverName}
              onQuickMatch={() => mpClientRef.current?.quickMatch(driverName, platform, selectedTrack, vehicle)}
              onCreateRoom={() => mpClientRef.current?.createRoom(driverName, platform, selectedTrack, vehicle)}
              onJoinRoom={(code) => mpClientRef.current?.joinRoom(code, driverName, platform, vehicle)}
              onLeaveRoom={() => {
                mpClientRef.current?.leaveRoom();
                setRoom(null);
              }}
              onToggleReady={(ready) => mpClientRef.current?.setReady(ready)}
              onUpdateSettings={(s) => mpClientRef.current?.updateSettings(s)}
              onStartRace={() => mpClientRef.current?.startRace()}
              onClose={() => setActiveScreen('intro')}
            />
          )}

          {activeScreen === 'leaderboard' && (
            <LeaderboardOverlay
              initialTrack={selectedTrack}
              highlightId={lastRecordId}
              onClose={() => setActiveScreen('intro')}
            />
          )}

          <PWAInstallModal
            open={showInstallModal}
            onClose={() => setShowInstallModal(false)}
          />

          {/* SETTINGS MODAL (Aligned to Apex Circuit Motorsport Theme) */}
          {showSettingsModal && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#050A14]/82 p-3 sm:p-4">
              <div className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-lg bg-[#0B1424] border border-white/18 shadow-2xl overflow-hidden">
                <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 bg-[#08101E] border-b-2 border-[#FFD014]">
                  <div className="flex items-center gap-2.5">
                    <div className="-skew-x-12 px-2.5 py-0.5 bg-[#FFD014] text-[#0B1220] font-display italic font-black text-xs">
                      <span className="block skew-x-12">RUSH</span>
                    </div>
                    <h2 className="font-display italic font-black text-lg sm:text-xl text-white tracking-wide">
                      SETTINGS
                    </h2>
                    <CheckeredAccent color="#FFD014" className="w-8 h-3.5 opacity-95" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    aria-label="Close Settings"
                    className="-skew-x-10 w-8 h-8 bg-[#14223A] hover:bg-[#E5252B] border border-white/18 flex items-center justify-center text-white transition-colors"
                  >
                    <X className="w-4 h-4 skew-x-10" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 overflow-y-auto custom-scroll space-y-3.5">
                  <div>
                    <label
                      htmlFor="settings-driver-name"
                      className="block text-[11px] font-display italic font-black text-[#FFD014] tracking-wider mb-1"
                    >
                      DRIVER CALLSIGN
                    </label>
                    <input
                      id="settings-driver-name"
                      type="text"
                      maxLength={20}
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="w-full h-10 px-3 rounded bg-[#122038] border border-white/20 text-sm font-display italic font-bold text-white focus:outline-none focus:border-[#FFD014]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      className={`h-10 px-3 -skew-x-10 border text-xs font-display italic font-black flex items-center justify-center gap-2 transition-colors ${
                        muted
                          ? 'bg-[#E5252B]/20 border-[#E5252B]/70 text-white'
                          : 'bg-[#122038] border-white/18 text-white hover:border-[#FFD014]'
                      }`}
                    >
                      <span className="skew-x-10 flex items-center gap-1.5">
                        {muted ? <VolumeX className="w-4 h-4 text-[#E5252B]" /> : <Volume2 className="w-4 h-4 text-[#FFD014]" />}
                        <span>{muted ? 'AUDIO MUTED' : 'AUDIO ON'}</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowTouchControls((t) => !t)}
                      className={`h-10 px-3 -skew-x-10 border text-xs font-display italic font-black flex items-center justify-center gap-2 transition-colors ${
                        showTouchControls
                          ? 'bg-[#FFD014]/15 border-[#FFD014]/75 text-white'
                          : 'bg-[#122038] border-white/18 text-white hover:border-[#FFD014]'
                      }`}
                    >
                      <span className="skew-x-10 flex items-center gap-1.5">
                        <Gamepad2 className="w-4 h-4 text-[#FFD014]" />
                        <span>{showTouchControls ? 'TOUCH UI: ON' : 'TOUCH UI: OFF'}</span>
                      </span>
                    </button>
                  </div>

                  {/* 4 Control Options: Controls | Joystick | Gyroscope | Steering (+ auto USB/Bluetooth Gamepad!) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-display italic font-black text-[#FFD014] tracking-wider">
                        CONTROL OPTION
                      </span>
                      <span className="text-[10px] font-display italic font-bold text-slate-300">
                        USB / BT Gamepad Ready
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
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
                          onClick={() => void handleSelectSteeringMode(id)}
                          className={`h-10 px-2 -skew-x-10 border text-[11px] font-display italic font-black flex items-center justify-center transition-colors ${
                            steeringMode === id
                              ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220] shadow-[0_4px_14px_rgba(255,208,20,0.3)]'
                              : 'bg-[#122038] border-white/18 text-white hover:border-[#FFD014]'
                          }`}
                        >
                          <span className="skew-x-10 flex items-center gap-1">
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{label}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {gyroNote && (
                      <p className="mt-1.5 text-[11px] font-display italic font-bold text-amber-300">
                        {gyroNote}
                      </p>
                    )}
                  </div>

                  {/* Mobile Cooling / Performance Mode */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-display italic font-black text-[#FFD014] tracking-wider">
                        MOBILE COOLING / GRAPHICS
                      </span>
                      <span className="text-[10px] font-display italic font-bold text-slate-300">
                        {performanceMode === 'eco'
                          ? '30 FPS · Ultra Cool'
                          : performanceMode === 'balanced'
                          ? '60 FPS · Mobile Optimized'
                          : 'Max Quality'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
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
                          onClick={() => setPerformanceMode(id)}
                          className={`h-9 px-2 -skew-x-10 border text-[11px] font-display italic font-black flex items-center justify-center transition-colors ${
                            performanceMode === id
                              ? 'bg-emerald-400 border-emerald-300 text-[#052E16]'
                              : 'bg-[#122038] border-white/18 text-white hover:border-emerald-400'
                          }`}
                        >
                          <span className="block skew-x-10">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void checkForUpdate(true)}
                    disabled={updateStatus === 'checking' || updateStatus === 'updating'}
                    className="w-full h-10 px-3 -skew-x-10 bg-[#122038] hover:bg-[#1B2E4E] disabled:opacity-60 border border-white/18 text-xs font-display italic font-black text-white flex items-center justify-center gap-2 transition-colors"
                  >
                    <span className="skew-x-10 flex items-center gap-2">
                      <RefreshCw
                        className={`w-4 h-4 text-[#FFD014] ${
                          updateStatus === 'checking' || updateStatus === 'updating' ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {updateStatus === 'checking'
                          ? 'CHECKING FOR UPDATES...'
                          : updateStatus === 'updating'
                          ? 'SYNCING LATEST UPDATE...'
                          : updateStatus === 'up-to-date'
                          ? 'UP TO DATE (LATEST VERSION)'
                          : 'CHECK FOR UPDATES NOW'}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsModal(false);
                      setShowInstallModal(true);
                    }}
                    className="w-full h-11 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] font-display italic font-black text-xs flex items-center justify-center gap-2 shadow-[0_6px_18px_rgba(255,208,20,0.3)] transition-colors"
                  >
                    <span className="skew-x-10 flex items-center gap-2">
                      <img
                        src={`${import.meta.env.BASE_URL}assets/aistudio/ICON_49f818b7.jpeg`}
                        alt="RUSH LINE Icon"
                        className="w-5 h-5 rounded object-cover"
                      />
                      INSTALL ON ANDROID MOBILE (QR &amp; APP)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PRE-RACE DRIVE SELECTION SCREEN (100% Unified Apex Circuit Motorsport Theme!) */}
          {pendingRaceMode && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#060C18]/84 p-2.5 sm:p-4">
              <div className="w-full max-w-2xl max-h-[94dvh] flex flex-col rounded-lg bg-[#0B1424] border border-white/20 shadow-[0_24px_60px_rgba(0,0,0,0.75)] overflow-hidden">
                {/* Bold Skewed Apex Circuit Header Bar */}
                <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-[#08101E] border-b-2 border-[#FFD014]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className="-skew-x-14 px-2.5 py-0.5 bg-[#E5252B] text-white font-display italic font-black text-[11px] sm:text-xs shrink-0">
                        <span className="block skew-x-14">RACE PREP</span>
                      </div>
                      <h2 className="font-display italic font-black text-base sm:text-2xl text-white tracking-wide truncate">
                        SELECT DRIVE MODE
                      </h2>
                      <CheckeredAccent color="#FFD014" className="hidden sm:block w-10 h-4 shrink-0" />
                    </div>
                    <div className="text-[11px] sm:text-xs font-display italic font-bold text-slate-300 mt-0.5 flex items-center gap-2 truncate">
                      <span className="text-[#FFD014]">{TRACK_SPECS[selectedTrack].name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{timeOfDay === 'morning' ? 'Morning' : timeOfDay === 'evening' ? 'Evening' : 'Night'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{CHASSIS_SPECS[vehicle.chassisId].name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedLaps} Laps</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingRaceMode(null)}
                    aria-label="Cancel race start"
                    className="-skew-x-10 w-8 h-8 sm:w-9 sm:h-9 bg-[#14223A] hover:bg-[#E5252B] border border-white/18 flex items-center justify-center text-white transition-colors shrink-0"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 skew-x-10" />
                  </button>
                </div>

                {/* 3 Control Options + Laps Dropdown + Two Side-by-Side Skewed Motorsport Drive Mode Cards */}
                <div className="p-3 sm:p-5 overflow-y-auto custom-scroll space-y-2.5 sm:space-y-3.5">
                  {/* Compact Race Prep Bar: 3 Control Options (Controls / Gyroscope / Steering) + Laps Dropdown */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0E192D] border border-white/14">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-[10px] sm:text-xs font-display italic font-black text-[#FFD014] tracking-wider mr-0.5">
                        CONTROL:
                      </span>
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
                          onClick={() => void handleSelectSteeringMode(id)}
                          className={`h-8 px-2.5 sm:px-3 -skew-x-10 border text-[10px] sm:text-xs font-display italic font-black transition-colors ${
                            steeringMode === id
                              ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                              : 'bg-[#14223A] border-white/18 text-slate-200 hover:border-[#FFD014]/70'
                          }`}
                        >
                          <span className="skew-x-10 flex items-center gap-1">
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{label}</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Laps Dropdown Option */}
                    <div className="flex items-center gap-1.5">
                      <label
                        htmlFor="prep-laps-select"
                        className="text-[10px] sm:text-xs font-display italic font-black text-[#FFD014] tracking-wider"
                      >
                        LAPS:
                      </label>
                      <div className="relative">
                        <select
                          id="prep-laps-select"
                          aria-label="Select Race Laps"
                          value={selectedLaps}
                          onChange={(e) => setSelectedLaps(Number(e.target.value))}
                          className="appearance-none h-8 pl-2.5 pr-7 rounded bg-[#14223A] border border-[#FFD014]/55 text-xs font-display italic font-black text-white focus:outline-none focus:border-[#FFD014] cursor-pointer"
                        >
                          {[1, 2, 3, 4, 5, 7, 10].map((n) => (
                            <option key={n} value={n} className="bg-[#0B1424] text-white">
                              {n} {n === 1 ? 'Lap' : 'Laps'}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#FFD014]" />
                      </div>
                    </div>
                  </div>
                  {gyroNote && (
                    <div className="text-[11px] font-display italic font-bold text-amber-300 px-1">
                      {gyroNote}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                    {/* AUTOMATIC DRIVE CARD */}
                    <button
                      type="button"
                      onClick={() => launchLocalRace(pendingRaceMode, 'auto')}
                      className={`group text-left flex flex-col justify-between p-3 sm:p-4 rounded-lg border-2 transition-all ${
                        transmissionMode === 'auto'
                          ? 'bg-gradient-to-b from-[#172846] to-[#0D182C] border-[#FFD014] shadow-[0_0_24px_rgba(255,208,20,0.25)]'
                          : 'bg-[#101C30] border-white/15 hover:border-[#FFD014]/75 hover:bg-[#15243E]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="-skew-x-12 px-2 sm:px-2.5 py-0.5 bg-[#FFD014] text-[#0B1220] font-display italic font-black text-[10px] sm:text-xs flex items-center gap-1">
                            <span className="skew-x-12 flex items-center gap-1">
                              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
                              AUTO 6-SPD
                            </span>
                          </div>
                          <span className="text-[10px] sm:text-[11px] font-display italic font-bold text-slate-300">
                            RECOMMENDED
                          </span>
                        </div>

                        <div className="font-display italic font-black text-base sm:text-xl text-white mt-2 sm:mt-3 tracking-wide">
                          AUTOMATIC DRIVE
                        </div>
                        <p className="text-[11px] sm:text-xs text-slate-300 mt-1 leading-snug sm:leading-relaxed">
                          Shifts gears 1–6 smoothly across hills, corners, jump landings, and border slowdowns.
                        </p>
                      </div>

                      <div className="mt-3 sm:mt-4 -skew-x-10 h-9 sm:h-10 bg-[#FFD014] group-hover:bg-[#ffe04d] text-[#0B1220] font-display italic font-black text-xs sm:text-sm flex items-center justify-center shadow-md transition-colors">
                        <span className="skew-x-10">START AUTOMATIC »</span>
                      </div>
                    </button>

                    {/* MANUAL DRIVE CARD */}
                    <button
                      type="button"
                      onClick={() => launchLocalRace(pendingRaceMode, 'manual')}
                      className={`group text-left flex flex-col justify-between p-3 sm:p-4 rounded-lg border-2 transition-all ${
                        transmissionMode === 'manual'
                          ? 'bg-gradient-to-b from-[#2A1624] to-[#121628] border-[#E5252B] shadow-[0_0_24px_rgba(229,37,43,0.28)]'
                          : 'bg-[#101C30] border-white/15 hover:border-[#E5252B]/80 hover:bg-[#1C1B30]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="-skew-x-12 px-2 sm:px-2.5 py-0.5 bg-[#E5252B] text-white font-display italic font-black text-[10px] sm:text-xs flex items-center gap-1">
                            <span className="skew-x-12 flex items-center gap-1">
                              <SlidersHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              PRO 6-SPD
                            </span>
                          </div>
                          <span className="text-[10px] sm:text-[11px] font-display italic font-bold text-[#FFD014]">
                            +12% SHIFT BOOST
                          </span>
                        </div>

                        <div className="font-display italic font-black text-base sm:text-xl text-white mt-2 sm:mt-3 tracking-wide">
                          MANUAL DRIVE
                        </div>
                        <p className="text-[11px] sm:text-xs text-slate-300 mt-1 leading-snug sm:leading-relaxed">
                          Control gears 1–6 with Q / E or on-screen − / + paddles for perfect redline boost shifts.
                        </p>
                      </div>

                      <div className="mt-3 sm:mt-4 -skew-x-10 h-9 sm:h-10 bg-[#E5252B] group-hover:bg-[#f4383f] text-white font-display italic font-black text-xs sm:text-sm flex items-center justify-center shadow-md transition-colors">
                        <span className="skew-x-10">START MANUAL »</span>
                      </div>
                    </button>
                  </div>

                  {/* Unified Bottom Tip Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/12 text-[10px] sm:text-[11px] font-display italic font-bold text-slate-300">
                    <span>DRIFT CORNERS &amp; HIT OFF-ROAD RAMPS FOR BONUS POINTS</span>
                    <span className="text-[#FFD014]">SWITCH AUTO / MANUAL ANYTIME IN RACE</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ===============================================================
              SCREEN 4: LIVE 3D RACE + GAME UI HUD (matching Game_UI_Screen!)
             =============================================================== */}
          <RaceCanvas
            key={raceKey}
            trackId={activeTrackId}
            timeOfDay={timeOfDay}
            mode={selectedMode}
            playerName={driverName}
            playerPlatform={platform}
            playerVehicle={vehicle}
            playerId={playerId || 'local-player'}
            multiplayerPlayers={selectedMode === 'multiplayer' ? room?.players : undefined}
            fillWithAi={selectedMode === 'multiplayer' ? (room?.fillWithAi ?? true) : true}
            lapsOverride={selectedMode === 'multiplayer' ? room?.laps : selectedLaps}
            paused={paused || showRaceObjective}
            muted={muted}
            cameraMode={cameraMode}
            transmissionMode={transmissionMode}
            performanceMode={performanceMode}
            resetCounter={resetCounter}
            touchInputRef={touchInputRef}
            peerStatesRef={peerStatesRef}
            onTelemetry={setTelemetry}
            onBroadcastState={handleBroadcastState}
            onRaceFinish={handleRaceFinish}
            onTogglePause={() => setPaused((p) => !p)}
            onCycleCamera={() =>
              setCameraMode((prev) => CAMERA_ORDER[(CAMERA_ORDER.indexOf(prev) + 1) % CAMERA_ORDER.length])
            }
          />

          <RaceHud
            trackId={activeTrackId}
            mode={selectedMode}
            telemetry={telemetry}
            paused={paused}
            showObjective={showRaceObjective}
            onStartFromObjective={() => setShowRaceObjective(false)}
            muted={muted}
            showTouchControls={showTouchControls}
            transmissionMode={transmissionMode}
            steeringMode={steeringMode}
            performanceMode={performanceMode}
            submittedRank={submittedRank}
            earnedCoins={lastEarnedCoins}
            totalCoins={coins}
            isNewBest={isNewBest}
            touchInputRef={touchInputRef}
            onCycleCamera={() =>
              setCameraMode((prev) => CAMERA_ORDER[(CAMERA_ORDER.indexOf(prev) + 1) % CAMERA_ORDER.length])
            }
            onToggleTransmission={() =>
              setTransmissionMode((prev) => (prev === 'auto' ? 'manual' : 'auto'))
            }
            onSelectSteeringMode={(m) => void handleSelectSteeringMode(m)}
            onSelectPerformanceMode={setPerformanceMode}
            onToggleMute={() => setMuted((m) => !m)}
            onToggleTouchControls={() => setShowTouchControls((s) => !s)}
            onResetCar={() => setResetCounter((c) => c + 1)}
            onTogglePause={() => setPaused((p) => !p)}
            onRestartRace={handleRestartRace}
            onNextLevel={handleNextLevel}
            onExitToMenu={() => handleExitToMenu('intro')}
            onOpenGarage={() => handleExitToMenu('garage')}
            onOpenLeaderboard={() => setShowPostRaceLeaderboard(true)}
          />

          {showPostRaceLeaderboard && (
            <LeaderboardOverlay
              initialTrack={activeTrackId}
              highlightId={lastRecordId}
              onClose={() => setShowPostRaceLeaderboard(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
