export type ChassisId =
  | 'apex-gtr'
  | 'drift-s15'
  | 'vanguard-v8'
  | 'veloce-v12'
  | 'stratos-gt3'
  | 'hyperion-proto';
export type PaintFinish = 'gloss' | 'metallic' | 'matte';
export type WingStyle = 'stock' | 'gt-carbon' | 'swan-neck' | 'delete';
export type RimStyle = 'five-spoke' | 'turbine' | 'aero-disc';
export type LiveryStyle = 'clean' | 'center-stripe' | 'dual-stripe' | 'side-blade';
export type TireCompound = 'street' | 'semi-slick' | 'racing-slick';
export type SuspensionSetup = 'soft' | 'balanced' | 'stiff';
export type AeroSetup = 'low-drag' | 'balanced' | 'high-downforce';
export type TrackId =
  | 'offroad-track'
  | 'hill-track'
  | 'city-track'
  | 'riverside-track'
  | 'stadium-track'
  | 'racing-track'
  | 'gokart-track';
export type TimeOfDay = 'morning' | 'evening' | 'night';
export type ClimateMode = 'dynamic' | 'clear' | 'rain' | 'snow' | 'mist';
export type ActiveWeather = 'clear' | 'rain' | 'snow' | 'mist';
export type GameMode = 'quick-race' | 'last-man-standing' | 'multiplayer' | 'time-trial';
export type PlatformType = 'Mobile iOS' | 'Mobile Android' | 'Tablet' | 'Desktop';
export type CameraMode = 'chase' | 'far-chase' | 'hood' | 'bumper';
export type TransmissionMode = 'auto' | 'manual';
export type SteeringMode = 'buttons' | 'joystick' | 'gyro' | 'wheel';
export type PerformanceMode = 'eco' | 'balanced' | 'high';

export interface VehicleConfig {
  chassisId: ChassisId;
  primaryColor: string;
  accentColor: string;
  caliperColor: string;
  rimColor: string;
  paintFinish: PaintFinish;
  wingStyle: WingStyle;
  rimStyle: RimStyle;
  liveryStyle: LiveryStyle;
  engineLevel: number; // 1..5
  nitroLevel: number; // 1..5
  tireCompound: TireCompound;
  suspension: SuspensionSetup;
  aero: AeroSetup;
}

export interface ChassisSpec {
  id: ChassisId;
  name: string;
  category: string;
  description: string;
  basePowerKw: number;
  massKg: number;
  dragCoeff: number;
  baseGrip: number;
  wheelbase: number;
  trackWidth: number;
  maxSteerRad: number;
  defaultColor: string;
  defaultAccent: string;
  unlockCost: number;
}

export interface TrackSpec {
  id: TrackId;
  name: string;
  location: string;
  lengthMeters: number;
  laps: number;
  difficulty: 'Club' | 'Pro' | 'GT Master';
  timeOfDay: 'Daylight' | 'Golden Hour' | 'Twilight' | 'Night';
  description: string;
}

export interface RemoteCarState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number; // m/s
  steer: number;
  pitch: number;
  roll: number;
  drift: number; // 0..1
  nitro: boolean;
  braking: boolean;
  lap: number;
  progress: number; // 0..1 along spline
  totalProgress: number; // lap + progress
  finished: boolean;
  finishTimeMs: number;
  bestLapMs: number;
  topSpeedKmh: number;
}

export interface MultiplayerPlayer {
  id: string;
  name: string;
  platform: PlatformType;
  ready: boolean;
  isHost: boolean;
  vehicle: VehicleConfig;
  gridSlot: number;
  state?: RemoteCarState;
}

export interface RoomState {
  code: string;
  trackId: TrackId;
  laps: number;
  fillWithAi: boolean;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  countdown: number;
  raceStartTime: number;
  players: MultiplayerPlayer[];
}

export interface LeaderboardEntry {
  id: string;
  driverName: string;
  platform: PlatformType;
  trackId: TrackId;
  mode: GameMode;
  chassisId: ChassisId;
  bestLapMs: number;
  totalTimeMs: number;
  topSpeedKmh: number;
  createdAt: string;
}

export interface RaceTelemetry {
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  gear: number; // -1 = R, 1..6
  transmission: TransmissionMode;
  shiftPrompt: 'up' | 'down' | null;
  nitroPct: number; // 0..100
  driftIntensity: number; // 0..1
  driftPoints: number;
  currentDriftChain: number;
  driftMultiplier: number;
  driftBoostActive?: boolean;
  airborne?: boolean;
  airTime?: number;
  lastJumpBonus?: number;
  surface: 'asphalt' | 'kerb' | 'offtrack';
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  currentLapMs: number;
  bestLapMs: number;
  totalRaceMs: number;
  wrongWay: boolean;
  countdown: number; // 3,2,1,0,-1 (racing)
  finished: boolean;
  leaderFinished?: boolean;
  aliveRacers?: number;
  eliminatedCount?: number;
  playerEliminated?: boolean;
  lastEliminated?: {
    name: string;
    lap: number;
    rank: number;
    isPlayer: boolean;
    timestamp: number;
  } | null;
  activeWeather?: ActiveWeather;
  climateMode?: ClimateMode;
  cameraMode: CameraMode;
  minimapCars: Array<{
    id: string;
    x: number;
    z: number;
    color: string;
    isPlayer: boolean;
    eliminated?: boolean;
  }>;
  standings: Array<{
    id: string;
    name: string;
    platform: PlatformType | 'AI';
    chassisId: ChassisId;
    position: number;
    lap: number;
    totalProgress: number;
    finished: boolean;
    finishTimeMs: number;
    bestLapMs: number;
    topSpeedKmh: number;
    isPlayer: boolean;
    color: string;
    eliminated?: boolean;
    eliminatedLap?: number;
  }>;
}

export const RACE_PRIZE_COINS: Record<1 | 2 | 3, number> = {
  1: 500,
  2: 300,
  3: 150,
};

export function getRacePrizeCoins(position: number, mode: GameMode): number {
  if (mode === 'time-trial') return 0;
  if (mode === 'last-man-standing') {
    if (position === 1) return 1000;
    if (position === 2) return 500;
    if (position === 3) return 250;
    return 0;
  }
  if (position === 1) return RACE_PRIZE_COINS[1];
  if (position === 2) return RACE_PRIZE_COINS[2];
  if (position === 3) return RACE_PRIZE_COINS[3];
  return 0;
}

export const CHASSIS_ORDER: ChassisId[] = [
  'apex-gtr',
  'drift-s15',
  'vanguard-v8',
  'veloce-v12',
  'stratos-gt3',
  'hyperion-proto',
];

export const CHASSIS_SPECS: Record<ChassisId, ChassisSpec> = {
  'apex-gtr': {
    id: 'apex-gtr',
    name: 'Apex GT-R',
    category: 'AWD Grand Tourer',
    description: 'Balanced twin-turbo AWD platform with composed traction out of hairpins.',
    basePowerKw: 485,
    massKg: 1460,
    dragCoeff: 0.30,
    baseGrip: 1.06,
    wheelbase: 2.78,
    trackWidth: 1.88,
    maxSteerRad: 0.48,
    defaultColor: '#DC2626',
    defaultAccent: '#F8FAFC',
    unlockCost: 0,
  },
  'drift-s15': {
    id: 'drift-s15',
    name: 'Kuro S15 Spec',
    category: 'Lightweight Track Coupe',
    description: 'Featherweight chassis with rapid yaw response and controllable high-angle drifts.',
    basePowerKw: 460,
    massKg: 1210,
    dragCoeff: 0.31,
    baseGrip: 1.03,
    wheelbase: 2.58,
    trackWidth: 1.82,
    maxSteerRad: 0.54,
    defaultColor: '#0EA5E9',
    defaultAccent: '#F8FAFC',
    unlockCost: 300,
  },
  'vanguard-v8': {
    id: 'vanguard-v8',
    name: 'Vanguard GT V8',
    category: 'Widebody Muscle GT',
    description: 'Supercharged front-engine V8 delivering brutal straight-line torque and heavy stance.',
    basePowerKw: 540,
    massKg: 1510,
    dragCoeff: 0.30,
    baseGrip: 1.05,
    wheelbase: 2.82,
    trackWidth: 1.96,
    maxSteerRad: 0.46,
    defaultColor: '#15803D',
    defaultAccent: '#F8FAFC',
    unlockCost: 600,
  },
  'veloce-v12': {
    id: 'veloce-v12',
    name: 'Veloce V12',
    category: 'Mid-Engine Supercar',
    description: 'Naturally aspirated screamer built for top-end velocity on long coastal straights.',
    basePowerKw: 575,
    massKg: 1380,
    dragCoeff: 0.27,
    baseGrip: 1.07,
    wheelbase: 2.70,
    trackWidth: 1.96,
    maxSteerRad: 0.45,
    defaultColor: '#F59E0B',
    defaultAccent: '#0F172A',
    unlockCost: 1000,
  },
  'stratos-gt3': {
    id: 'stratos-gt3',
    name: 'Stratos GT3 RS',
    category: 'Endurance GT3 Racer',
    description: 'Homologated circuit weapon with roof intake, wide aero track, and razor apex bite.',
    basePowerKw: 605,
    massKg: 1310,
    dragCoeff: 0.28,
    baseGrip: 1.13,
    wheelbase: 2.76,
    trackWidth: 2.00,
    maxSteerRad: 0.46,
    defaultColor: '#2563EB',
    defaultAccent: '#F59E0B',
    unlockCost: 1500,
  },
  'hyperion-proto': {
    id: 'hyperion-proto',
    name: 'Hyperion LM-9',
    category: 'Endurance Hypercar',
    description: 'Ground-effect endurance prototype delivering immense high-speed cornering downforce.',
    basePowerKw: 650,
    massKg: 1270,
    dragCoeff: 0.26,
    baseGrip: 1.16,
    wheelbase: 2.86,
    trackWidth: 2.04,
    maxSteerRad: 0.44,
    defaultColor: '#E2E8F0',
    defaultAccent: '#EF4444',
    unlockCost: 2200,
  },
};

export const TRACK_ORDER: TrackId[] = [
  'offroad-track',
  'hill-track',
  'city-track',
  'riverside-track',
  'stadium-track',
  'racing-track',
  'gokart-track',
];

export const TRACK_SPECS: Record<TrackId, TrackSpec> = {
  'offroad-track': {
    id: 'offroad-track',
    name: 'Off-Road Track',
    location: 'Rolling Dirt Ridge',
    lengthMeters: 2280,
    laps: 3,
    difficulty: 'Pro',
    timeOfDay: 'Daylight',
    description: 'Exciting packed-dirt rally loop packed with roller-coaster ups and downs, crests, and mud borders.',
  },
  'hill-track': {
    id: 'hill-track',
    name: 'Hill Track',
    location: 'Alpine Mountain Pass',
    lengthMeters: 2420,
    laps: 3,
    difficulty: 'GT Master',
    timeOfDay: 'Golden Hour',
    description: 'Steep mountain climb and thrilling downhill switchbacks carving across high alpine cliffs.',
  },
  'city-track': {
    id: 'city-track',
    name: 'City Track',
    location: 'Italian Piazza & Vicoli',
    lengthMeters: 2080,
    laps: 3,
    difficulty: 'Pro',
    timeOfDay: 'Golden Hour',
    description: 'Cobblestone Italian piazzas and tight historic vicoli lined with terracotta palazzos, wrought-iron streetlamps, and solid stone borders.',
  },
  'riverside-track': {
    id: 'riverside-track',
    name: 'Riverside Track',
    location: 'Emerald River Bend',
    lengthMeters: 2180,
    laps: 3,
    difficulty: 'Club',
    timeOfDay: 'Daylight',
    description: 'Flowing valley circuit winding right beside a wide sparkling turquoise river and wooded pebble banks.',
  },
  'stadium-track': {
    id: 'stadium-track',
    name: 'Stadium Track',
    location: 'Rush Arena Bowl',
    lengthMeters: 1640,
    laps: 3,
    difficulty: 'Club',
    timeOfDay: 'Twilight',
    description: 'Floodlit motorsport arena ringed by towering grandstands, high-speed sweepers, and crisp infield chicanes.',
  },
  'racing-track': {
    id: 'racing-track',
    name: 'Racing Track',
    location: 'Grand Prix Circuit',
    lengthMeters: 2150,
    laps: 3,
    difficulty: 'Club',
    timeOfDay: 'Daylight',
    description: 'Classic Grand Prix tarmac with red-white apex kerbs, mud shoulders, and wide overtaking straights.',
  },
  'gokart-track': {
    id: 'gokart-track',
    name: 'Go-Kart Track',
    location: 'Technical Kart Arena',
    lengthMeters: 1588,
    laps: 3,
    difficulty: 'GT Master',
    timeOfDay: 'Daylight',
    description: 'Tire-walled karting arena packed with 12+ tight hairpins, flowing S-curves, and chained drift zones.',
  },
};

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassisId: 'apex-gtr',
  primaryColor: '#DC2626',
  accentColor: '#F8FAFC',
  caliperColor: '#F59E0B',
  rimColor: '#CBD5E1',
  paintFinish: 'metallic',
  wingStyle: 'gt-carbon',
  rimStyle: 'five-spoke',
  liveryStyle: 'dual-stripe',
  engineLevel: 3,
  nitroLevel: 3,
  tireCompound: 'semi-slick',
  suspension: 'balanced',
  aero: 'balanced',
};

export function detectPlatform(): PlatformType {
  if (typeof navigator === 'undefined') return 'Desktop';
  const ua = navigator.userAgent || '';
  const hasTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  if (/iPad|Tablet|PlayBook/i.test(ua) || (hasTouch && Math.min(window.innerWidth, window.innerHeight) >= 640 && /Macintosh/i.test(ua))) {
    return 'Tablet';
  }
  if (/iPhone|iPod/i.test(ua)) return 'Mobile iOS';
  if (/Android/i.test(ua)) {
    return /Mobile/i.test(ua) ? 'Mobile Android' : 'Tablet';
  }
  return 'Desktop';
}

export function getDefaultPerformanceMode(platform: PlatformType): PerformanceMode {
  return platform === 'Desktop' ? 'high' : 'balanced';
}

export function formatLapTime(ms: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '--:--.---';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const millis = Math.floor(ms % 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
