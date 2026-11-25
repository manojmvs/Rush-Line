import * as THREE from 'three';
import { CHASSIS_SPECS } from '../types/game.ts';
import {
  evaluateTrackRampAt,
  getCityStreetTightness,
  impactNearbyTyres,
  knockBreakableProp,
  type BreakableProp,
  type SplineSample,
  type TrackBoxCollider,
  type TrackDiversion,
  type TrackPoleCollider,
  type TrackRamp,
} from './tracks.ts';
import type { TrackId, TransmissionMode, VehicleConfig } from '../types/game.ts';

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  reverse?: boolean; // Dedicated reverse gear pedal (mobile & desktop)
  touchBrake?: boolean; // Dedicated mobile BRAKE pedal (strictly brakes to 0, never reverses)
  steer: number; // -1 (left) .. +1 (right)
  handbrake: boolean;
  nitro: boolean;
  shiftUp?: boolean;
  shiftDown?: boolean;
}

export interface PhysicsCar {
  id: string;
  name: string;
  config: VehicleConfig;
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  prevHeading: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number; // radians, 0 = +Z
  yawRate: number;
  steerAngle: number;
  speed: number; // m/s signed forward
  rpm: number;
  gear: number; // -1, 1..6
  shiftCooldown: number;
  shiftBoostTimer: number;
  shiftPrompt: 'up' | 'down' | null;
  pitch: number; // suspension dive/squat
  roadPitch: number; // terrain incline/decline pitch along hills & ramps
  roll: number; // suspension body roll
  wheelSpin: number;
  airborne: boolean;
  airTime: number;
  onRamp: boolean;
  lastRampSlope: number;
  lastJumpBonus: number;
  jumpBonusTimer: number;
  nitroEnergy: number; // 0..100
  nitroActive: boolean;
  nitroDepletedLock: boolean;
  driftIntensity: number; // 0..1
  driftAngle: number; // visual slip yaw angle (radians)
  driftState: number; // 0..1 automatic corner-drift engagement
  steerHoldTime: number; // seconds holding active turn input
  driftBoostTimer: number; // short turbo surge rewarded on clean drift exit
  driftPoints: number;
  currentDriftChain: number;
  driftMultiplier: number;
  driftComboTimer: number;
  surface: 'asphalt' | 'kerb' | 'offtrack';
  braking: boolean;
  // Track progress state
  sampleIndex: number;
  lateralOffset: number;
  lap: number;
  checkpointMask: number; // bitmask of sectors 0,1,2,3
  progress: number; // 0..1
  totalProgress: number;
  lapStartTimeMs: number;
  currentLapMs: number;
  bestLapMs: number;
  finished: boolean;
  finishTimeMs: number;
  topSpeedKmh: number;
  wrongWay: boolean;
  eliminated?: boolean;
}

export interface ComputedStats {
  speedRating: number; // 0..100
  accelRating: number; // 0..100
  handlingRating: number; // 0..100
  nitroRating: number; // 0..100
  peakPowerKw: number;
  topSpeedKmh: number;
  gripCoeff: number;
}

// Speed-matched 6-speed gearbox ratios (fractions of the car's 6th-gear top speed):
// For the default Apex GT-R (180 km/h max in 6th):
// 1st: 0–36 km/h | 2nd: 36–65 km/h | 3rd: 65–95 km/h | 4th: 95–126 km/h | 5th: 126–155 km/h | 6th: 155–180 km/h
const GEAR_MAX_SPEED_FRAC = [0, 0.20, 0.36, 0.53, 0.70, 0.86, 1.00];
// Clean hysteresis downshift thresholds so Automatic mode always matches speed and never sticks in high gear
const GEAR_DOWNSHIFT_FRAC = [0, 0.00, 0.15, 0.31, 0.47, 0.64, 0.80];
// Mechanical torque multiplication per gear (strong launch in 1-3, steady pull through 4-6)
const GEAR_TORQUE_MULT = [0, 1.85, 1.52, 1.28, 1.12, 1.02, 0.96];

const IDLE_RPM = 1150;
const REDLINE_RPM = 8600;
const MAX_REVERSE_SPEED_MS = 10.6; // ~38 km/h in reverse

export function computeVehicleStats(config: VehicleConfig): ComputedStats {
  const base = CHASSIS_SPECS[config.chassisId];
  const engineMult = 1 + (config.engineLevel - 1) * 0.09;
  const tireGripBonus =
    config.tireCompound === 'racing-slick' ? 0.16 : config.tireCompound === 'semi-slick' ? 0.08 : 0;
  const aeroGripBonus =
    config.aero === 'high-downforce' ? 0.12 : config.aero === 'balanced' ? 0.06 : 0.0;
  const aeroDragBonus =
    config.aero === 'high-downforce' ? 0.045 : config.aero === 'balanced' ? 0.015 : -0.02;
  const suspHandlingBonus =
    config.suspension === 'stiff' ? 0.05 : config.suspension === 'balanced' ? 0.025 : 0;

  const peakPowerKw = Math.round(base.basePowerKw * engineMult);
  const drag = Math.max(0.21, base.dragCoeff + aeroDragBonus);
  // Calibrated so default Apex GT-R (Stage 3, Balanced Aero) hits exactly 180 km/h in 6th gear,
  // while higher-tier unlockable cars scale cleanly up to ~232 km/h.
  const topSpeedKmh = Math.round(136 + (peakPowerKw / base.massKg) * 160 - drag * 60);
  const gripCoeff = base.baseGrip + tireGripBonus + aeroGripBonus;

  return {
    speedRating: THREE.MathUtils.clamp(Math.round(((topSpeedKmh - 135) / 100) * 100), 15, 100),
    accelRating: THREE.MathUtils.clamp(Math.round(((peakPowerKw / base.massKg - 0.28) / 0.36) * 100), 15, 100),
    handlingRating: THREE.MathUtils.clamp(Math.round(((gripCoeff + suspHandlingBonus - 0.95) / 0.52) * 100), 15, 100),
    nitroRating: Math.min(100, 38 + config.nitroLevel * 12),
    peakPowerKw,
    topSpeedKmh,
    gripCoeff,
  };
}

export function createPhysicsCar(
  id: string,
  name: string,
  config: VehicleConfig,
  samples: SplineSample[],
  gridSlot: number,
  options?: {
    isGoKart?: boolean;
    getGroundY?: (x: number, z: number) => number;
  }
): PhysicsCar {
  const backSteps = 4 + gridSlot * 3;
  const sampleIndex = ((samples.length - backSteps) % samples.length + samples.length) % samples.length;
  const s = samples[sampleIndex];
  const laneSign = gridSlot % 2 === 0 ? -1 : 1;
  const lateralOffset = laneSign * (options?.isGoKart ? 2.4 : 2.9);
  const x = s.pos.x + s.right.x * lateralOffset;
  const z = s.pos.z + s.right.z * lateralOffset;
  const heading = Math.atan2(s.tangent.x, s.tangent.z);
  const groundFloor = options?.getGroundY ? options.getGroundY(x, z) + 0.05 : -Infinity;
  const spawnY = Math.max(s.pos.y + 0.128, groundFloor);

  return {
    id,
    name,
    config,
    x,
    y: spawnY,
    z,
    prevX: x,
    prevY: spawnY,
    prevZ: z,
    prevHeading: heading,
    vx: 0,
    vy: 0,
    vz: 0,
    heading,
    yawRate: 0,
    steerAngle: 0,
    speed: 0,
    rpm: IDLE_RPM,
    gear: 1,
    shiftCooldown: 0,
    shiftBoostTimer: 0,
    shiftPrompt: null,
    pitch: 0,
    roadPitch: 0,
    roll: 0,
    wheelSpin: 0,
    airborne: false,
    airTime: 0,
    onRamp: false,
    lastRampSlope: 0,
    lastJumpBonus: 0,
    jumpBonusTimer: 0,
    nitroEnergy: 100,
    nitroActive: false,
    nitroDepletedLock: false,
    driftIntensity: 0,
    driftAngle: 0,
    driftState: 0,
    steerHoldTime: 0,
    driftBoostTimer: 0,
    driftPoints: 0,
    currentDriftChain: 0,
    driftMultiplier: 1,
    driftComboTimer: 0,
    surface: 'asphalt',
    braking: false,
    sampleIndex,
    lateralOffset,
    lap: 1,
    checkpointMask: 0,
    progress: 0,
    totalProgress: -gridSlot * 0.002,
    lapStartTimeMs: 0,
    currentLapMs: 0,
    bestLapMs: 0,
    finished: false,
    finishTimeMs: 0,
    topSpeedKmh: 0,
    wrongWay: false,
  };
}

export function findClosestSample(
  x: number,
  z: number,
  samples: SplineSample[],
  hintIndex: number
): { index: number; distSq: number; lateral: number } {
  const n = samples.length;
  let bestIdx = hintIndex;
  let bestDistSq = Infinity;

  const windowSize = 35;
  for (let offset = -windowSize; offset <= windowSize; offset++) {
    const idx = (hintIndex + offset + n) % n;
    const sp = samples[idx].pos;
    const dx = x - sp.x;
    const dz = z - sp.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = idx;
    }
  }

  if (bestDistSq > 1200) {
    for (let i = 0; i < n; i += 2) {
      const sp = samples[i].pos;
      const dx = x - sp.x;
      const dz = z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
  }

  const s = samples[bestIdx];
  const lateral = (x - s.pos.x) * s.right.x + (z - s.pos.z) * s.right.z;
  return { index: bestIdx, distSq: bestDistSq, lateral };
}

/**
 * Computes C1-continuous track height by projecting onto either [prev, curr] or [curr, next],
 * eliminating step kinks when crossing spline sample boundaries at high speed.
 */
function sampleSmoothRoadY(
  x: number,
  z: number,
  samples: SplineSample[],
  idx: number
): { y: number; slopeY: number; floatIdx: number } {
  const n = samples.length;
  const curr = samples[idx];
  const prev = samples[(idx - 1 + n) % n];
  const next = samples[(idx + 1) % n];

  const dxNext = next.pos.x - curr.pos.x;
  const dzNext = next.pos.z - curr.pos.z;
  const lenNextSq = Math.max(0.0001, dxNext * dxNext + dzNext * dzNext);
  const tNext = ((x - curr.pos.x) * dxNext + (z - curr.pos.z) * dzNext) / lenNextSq;

  // Smooth multi-sample slope tangent for natural crest & valley pitching
  const ahead = samples[(idx + 3) % n];
  const behind = samples[(idx - 3 + n) % n];
  const spanHoriz = Math.max(0.5, Math.hypot(ahead.pos.x - behind.pos.x, ahead.pos.z - behind.pos.z));
  const slopeY = THREE.MathUtils.clamp((ahead.pos.y - behind.pos.y) / spanHoriz, -0.35, 0.35);

  if (tNext >= 0) {
    const t = Math.min(1, tNext);
    return {
      y: curr.pos.y + (next.pos.y - curr.pos.y) * t,
      slopeY,
      floatIdx: (idx + t) % n,
    };
  }

  const dxPrev = prev.pos.x - curr.pos.x;
  const dzPrev = prev.pos.z - curr.pos.z;
  const lenPrevSq = Math.max(0.0001, dxPrev * dxPrev + dzPrev * dzPrev);
  const tPrev = THREE.MathUtils.clamp(((x - curr.pos.x) * dxPrev + (z - curr.pos.z) * dzPrev) / lenPrevSq, 0, 1);
  return {
    y: curr.pos.y + (prev.pos.y - curr.pos.y) * tPrev,
    slopeY,
    floatIdx: (idx - tPrev + n) % n,
  };
}

function sampleDiversionAt(
  sampleIdx: number,
  diversions: TrackDiversion[]
): { active: boolean; extraOuter: number; islandHalfWidth: number; centerOffset: number } {
  const pad = 8;
  for (let i = 0; i < diversions.length; i++) {
    const d = diversions[i];
    if (sampleIdx < d.startIdx - pad || sampleIdx > d.endIdx + pad) continue;

    let flare = 1.0;
    if (sampleIdx < d.startIdx) {
      const u = (sampleIdx - (d.startIdx - pad)) / pad;
      flare = u * u * (3 - 2 * u);
    } else if (sampleIdx > d.endIdx) {
      const u = (d.endIdx + pad - sampleIdx) / pad;
      flare = u * u * (3 - 2 * u);
    }

    let islandHalf = 0;
    if (sampleIdx >= d.startIdx && sampleIdx <= d.endIdx) {
      const tNorm = (sampleIdx - d.startIdx) / Math.max(1, d.endIdx - d.startIdx);
      const taper = Math.sin(THREE.MathUtils.clamp(tNorm, 0.04, 0.96) * Math.PI);
      islandHalf = d.islandHalfWidth * (0.48 + 0.52 * Math.pow(taper, 0.5));
    }

    return {
      active: true,
      extraOuter: d.extraOuterWidth * flare,
      islandHalfWidth: islandHalf,
      centerOffset: d.centerOffset,
    };
  }
  return { active: false, extraOuter: 0, islandHalfWidth: 0, centerOffset: 0 };
}

export function stepCarPhysics(
  car: PhysicsCar,
  input: CarInput,
  dt: number,
  samples: SplineSample[],
  roadWidth: number,
  kerbWidth: number,
  barrierOffset: number,
  raceElapsedMs: number,
  totalLaps: number,
  allowMovement: boolean,
  transmission: TransmissionMode = 'auto',
  ramps: TrackRamp[] = [],
  diversions: TrackDiversion[] = [],
  trackId: TrackId = 'racing-track',
  poleColliders: TrackPoleCollider[] = [],
  boxColliders: TrackBoxCollider[] = [],
  breakables: BreakableProp[] = [],
  getGroundY?: (x: number, z: number) => number,
  weatherGripMult = 1.0,
  paceMultiplier = 1.0
): {
  barrierImpact: number;
  completedLap: boolean;
  shiftedGear: -1 | 0 | 1;
  landedImpact: number;
  launchedJump: boolean;
} {
  const spec = CHASSIS_SPECS[car.config.chassisId];
  const stats = computeVehicleStats(car.config);
  const engineMult = 1 + (car.config.engineLevel - 1) * 0.09;
  const tireGripMult =
    car.config.tireCompound === 'racing-slick' ? 1.18 : car.config.tireCompound === 'semi-slick' ? 1.09 : 1.0;
  const aeroDownforce =
    car.config.aero === 'high-downforce' ? 1.35 : car.config.aero === 'balanced' ? 1.0 : 0.65;
  const aeroDragDelta =
    car.config.aero === 'high-downforce' ? 0.045 : car.config.aero === 'balanced' ? 0.015 : -0.02;
  const suspRollFactor =
    car.config.suspension === 'stiff' ? 0.62 : car.config.suspension === 'balanced' ? 0.92 : 1.22;

  const safePace = THREE.MathUtils.clamp(paceMultiplier, 0.85, 1.28);
  const baseTopSpeedMs = (stats.topSpeedKmh / 3.6) * safePace;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);

  // Transform world velocity to car local frame (+Z forward, +X right)
  let vForward = car.vx * sinH + car.vz * cosH;
  let vLateral = car.vx * cosH - car.vz * sinH;

  if (!allowMovement) {
    const targetRpm = IDLE_RPM + input.throttle * 5800;
    car.rpm = THREE.MathUtils.damp(car.rpm, targetRpm, 9, dt);
    car.steerAngle = THREE.MathUtils.damp(car.steerAngle, -input.steer * spec.maxSteerRad * 0.65, 10, dt);
    car.braking = input.brake > 0.1;
    car.nitroActive = false;
    car.shiftPrompt = null;
    return { barrierImpact: 0, completedLap: false, shiftedGear: 0, landedImpact: 0, launchedJump: false };
  }

  // Save previous transform for smooth sub-step render interpolation
  car.prevX = car.x;
  car.prevY = car.y;
  car.prevZ = car.z;
  car.prevHeading = car.heading;

  car.shiftCooldown = Math.max(0, car.shiftCooldown - dt);
  car.shiftBoostTimer = Math.max(0, car.shiftBoostTimer - dt);
  car.driftBoostTimer = Math.max(0, car.driftBoostTimer - dt);
  if (car.jumpBonusTimer > 0) {
    car.jumpBonusTimer = Math.max(0, car.jumpBonusTimer - dt);
    if (car.jumpBonusTimer <= 0) car.lastJumpBonus = 0;
  }

  // Locate car on track spline for surface, diversion widening & C1-smooth continuous elevation
  const closest = findClosestSample(car.x, car.z, samples, car.sampleIndex);
  const prevSampleIdx = car.sampleIndex;
  car.sampleIndex = closest.index;
  car.lateralOffset = closest.lateral;
  const sample = samples[closest.index];
  const roadSample = sampleSmoothRoadY(car.x, car.z, samples, closest.index);
  // Project track slope along the car's actual travel direction (uphill positive -> nose pitches up!)
  const headingAlongTrack = sinH * sample.tangent.x + cosH * sample.tangent.z;
  const directionalSlope = roadSample.slopeY * headingAlongTrack;

  const divInfo = diversions.length > 0 ? sampleDiversionAt(closest.index, diversions) : { active: false, extraOuter: 0, islandHalfWidth: 0, centerOffset: 0 };
  const cityTight = trackId === 'city-track' ? getCityStreetTightness(closest.index, samples.length) : 0;
  const halfRoad = roadWidth * 0.5 - cityTight * 2.85 + divInfo.extraOuter;
  const effectiveBarrierOffset = barrierOffset - cityTight * 5.85 + divInfo.extraOuter * 0.72;
  const absLat = Math.abs(closest.lateral);
  let surfaceGrip = 1.0;
  let surfaceDrag = 0.012;
  let surfaceSpeedFactor = 1.0;
  let surfaceBrakeDrag = 0;

  if (absLat <= halfRoad) {
    car.surface = 'asphalt';
  } else if (trackId === 'city-track') {
    // Italian travertine side road / piazza sidewalk — fully drivable! (Buildings, poles, planters & Vespas block!)
    car.surface = 'kerb';
    surfaceGrip = 0.88;
    surfaceDrag = 0.022;
    surfaceSpeedFactor = 0.86;
    surfaceBrakeDrag = 1.6;
  } else if (absLat <= halfRoad + kerbWidth) {
    // Road border / kerb path: slight rumble resistance
    car.surface = 'kerb';
    surfaceGrip = 0.86;
    surfaceDrag = 0.028;
    surfaceSpeedFactor = trackId === 'offroad-track' || trackId === 'riverside-track' ? 0.84 : 0.76;
    surfaceBrakeDrag = trackId === 'offroad-track' || trackId === 'riverside-track' ? 2.2 : 3.8;
  } else if (trackId === 'offroad-track' || trackId === 'riverside-track') {
    // Open side road & grassy shoulder — drivable between wooden fences, trees, poles, boulders & logs!
    car.surface = 'offtrack';
    surfaceGrip = 0.72;
    surfaceDrag = 0.045;
    surfaceSpeedFactor = 0.68;
    surfaceBrakeDrag = 4.2;
  } else {
    // Circuit runoff shoulder before visible Armco/tire barrier
    car.surface = 'offtrack';
    surfaceGrip = 0.68;
    surfaceDrag = 0.052;
    surfaceSpeedFactor = 0.62;
    surfaceBrakeDrag = 6.2;
  }

  // Apply dynamic climate grip modulation (Clear 1.0, Mist 0.95, Rain 0.88, Snow 0.81)
  surfaceGrip *= THREE.MathUtils.clamp(weatherGripMult, 0.72, 1.05);

  const absSpeed = Math.abs(vForward);

  // =========================================================================
  // 1. SPEED-MATCHED 6-SPEED TRANSMISSION (Automatic, Manual & Dedicated Reverse)
  // =========================================================================
  let shiftedGear: -1 | 0 | 1 = 0;

  const computeGearRpm = (g: number, fwdSpeed: number): number => {
    if (g === -1) {
      return Math.min(6200, IDLE_RPM + (Math.abs(Math.min(0, fwdSpeed)) / MAX_REVERSE_SPEED_MS) * 4800);
    }
    const maxGSpeed = Math.max(6, baseTopSpeedMs * GEAR_MAX_SPEED_FRAC[g]);
    const minGSpeed = g === 1 ? 0 : baseTopSpeedMs * GEAR_MAX_SPEED_FRAC[g - 1] * 0.55;
    const span = Math.max(2, maxGSpeed - minGSpeed);
    const ratio = (Math.max(0, fwdSpeed) - minGSpeed) / span;
    const baseIdleForGear = g === 1 ? IDLE_RPM : 2600;
    let rawRpm = baseIdleForGear + THREE.MathUtils.clamp(ratio, -0.35, 1.15) * (REDLINE_RPM - baseIdleForGear);
    if (g === 1 && fwdSpeed < 4) {
      rawRpm = Math.max(rawRpm, IDLE_RPM + input.throttle * 2600);
    }
    return Math.max(IDLE_RPM, rawRpm);
  };

  const isPureBrake = Boolean(input.touchBrake && input.brake > 0.02);

  // Dedicated Reverse button works seamlessly in both Automatic and Manual modes (unless BRAKE is pressed)
  if (input.reverse && !isPureBrake && input.throttle < 0.1) {
    if (vForward <= 1.2 && car.gear !== -1) {
      car.gear = -1;
      car.shiftCooldown = 0.14;
      shiftedGear = -1;
    }
  } else if (transmission === 'manual') {
    if (input.shiftUp) {
      if (car.gear === -1) {
        car.gear = 1;
        car.shiftCooldown = 0.10;
        shiftedGear = 1;
      } else if (car.gear < 6) {
        const preRpm = computeGearRpm(car.gear, vForward);
        if (preRpm >= 7000 && input.throttle > 0.4) {
          car.shiftBoostTimer = 0.35;
        }
        car.gear += 1;
        car.shiftCooldown = 0.08;
        shiftedGear = 1;
      }
    } else if (input.shiftDown) {
      if (car.gear > 1) {
        car.gear -= 1;
        car.shiftCooldown = 0.08;
        shiftedGear = -1;
      } else if (car.gear === 1 && vForward < 3.5) {
        car.gear = -1;
        car.shiftCooldown = 0.12;
        shiftedGear = -1;
      }
    }

    // Pressing gas from reverse (after releasing reverse button) returns cleanly to 1st gear
    if (car.gear === -1 && input.throttle > 0.4 && vForward >= -0.6 && !input.reverse) {
      car.gear = 1;
      shiftedGear = 1;
    } else if (car.gear > 1 && absSpeed < 0.6 && input.throttle > 0.2) {
      car.gear = 1;
    }

    // Even in Manual mode, entering the red-and-white border or mud automatically shifts gears down
    // as the car's speed decreases so gear always matches reduced speed!
    if (car.surface !== 'asphalt' && car.gear > 1 && car.shiftCooldown <= 0) {
      const speedFrac = Math.max(0, vForward) / Math.max(10, baseTopSpeedMs);
      if (speedFrac <= GEAR_DOWNSHIFT_FRAC[car.gear]) {
        let targetGear = car.gear - 1;
        while (targetGear > 1 && speedFrac <= GEAR_DOWNSHIFT_FRAC[targetGear]) {
          targetGear -= 1;
        }
        car.gear = targetGear;
        car.shiftCooldown = 0.12;
        shiftedGear = -1;
      }
    }
  } else {
    // AUTOMATIC 6-SPEED TRANSMISSION: Speed-matched with crisp hysteresis
    // NEVER auto-shift into Reverse simply because a wall/obstacle bounce pushed vForward negative!
    // Only engage Reverse when the player explicitly holds Brake/S while stopped (not pressing Gas).
    const desktopReverseIntent =
      !input.touchBrake && input.brake > 0.25 && vForward <= 0.8 && input.throttle < 0.1;
    if (desktopReverseIntent) {
      if (car.gear !== -1) {
        car.gear = -1;
        car.shiftCooldown = 0.16;
        shiftedGear = -1;
      }
    } else {
      // Pressing throttle (or rolling forward without reverse intent) ALWAYS exits Reverse into 1st immediately!
      if (car.gear === -1 && (input.throttle > 0.08 || (!input.reverse && vForward > -0.2))) {
        car.gear = 1;
        car.shiftCooldown = 0.12;
        shiftedGear = 1;
      }

      if (car.gear >= 1 && car.shiftCooldown <= 0) {
        const speedFrac = Math.max(0, vForward) / Math.max(10, baseTopSpeedMs);
        const upshiftThreshold = GEAR_MAX_SPEED_FRAC[car.gear] * 0.965;
        const downshiftThreshold = GEAR_DOWNSHIFT_FRAC[car.gear];

        if (car.gear < 6 && speedFrac >= upshiftThreshold && input.throttle > 0.15) {
          car.gear += 1;
          car.shiftCooldown = 0.14;
          car.shiftBoostTimer = 0.22;
          shiftedGear = 1;
        } else if (car.gear > 1 && speedFrac <= downshiftThreshold) {
          // Immediately drop into the gear that matches current speed (never stuck in 6th!)
          let targetGear = car.gear - 1;
          while (targetGear > 1 && speedFrac <= GEAR_DOWNSHIFT_FRAC[targetGear]) {
            targetGear -= 1;
          }
          car.gear = targetGear;
          car.shiftCooldown = 0.10;
          shiftedGear = -1;
        }
      }
    }
  }

  // Update RPM smoothly based on current gear & speed
  const rawGearRpm = computeGearRpm(car.gear, vForward);
  const maxAllowedRpm = car.gear === 6 && car.nitroActive ? 9000 : REDLINE_RPM;
  const clampedTargetRpm = THREE.MathUtils.clamp(rawGearRpm, IDLE_RPM, maxAllowedRpm);
  car.rpm = THREE.MathUtils.damp(car.rpm, clampedTargetRpm, 18, dt);

  // Shift prompt indicator for Manual drivers
  if (transmission === 'manual' && car.gear >= 1) {
    const speedFrac = Math.max(0, vForward) / Math.max(10, baseTopSpeedMs);
    if (car.gear < 6 && speedFrac >= GEAR_MAX_SPEED_FRAC[car.gear] * 0.90) {
      car.shiftPrompt = 'up';
    } else if (car.gear > 1 && speedFrac <= GEAR_DOWNSHIFT_FRAC[car.gear] && vForward > 4) {
      car.shiftPrompt = 'down';
    } else {
      car.shiftPrompt = null;
    }
  } else {
    car.shiftPrompt = null;
  }

  // =========================================================================
  // 2. NITRO WITH HYSTERESIS (Prevents empty-tank ON/OFF strobing & shake!)
  // =========================================================================
  const nitroDrainRate = 24 - car.config.nitroLevel * 2.0;
  if (car.nitroDepletedLock && car.nitroEnergy >= 14) {
    car.nitroDepletedLock = false;
  }
  const wantsNitro =
    input.nitro &&
    !input.reverse &&
    !car.nitroDepletedLock &&
    car.nitroEnergy > 0.5 &&
    vForward > 4 &&
    car.gear >= 1;
  car.nitroActive = wantsNitro;
  if (wantsNitro) {
    car.nitroEnergy = Math.max(0, car.nitroEnergy - nitroDrainRate * dt);
    if (car.nitroEnergy <= 0.5) {
      car.nitroDepletedLock = true;
      car.nitroActive = false;
    }
  } else {
    const driftCharge = car.driftIntensity * 14;
    car.nitroEnergy = Math.min(100, car.nitroEnergy + (2.8 + driftCharge) * dt);
  }

  // =========================================================================
  // 3. GEAR-DRIVEN PROPULSION & SMOOTH POST-NITRO SPEED RETENTION
  // =========================================================================
  const dragCoeff = Math.max(0.21, spec.dragCoeff + aeroDragDelta);
  const aeroDrag = 0.0020 * dragCoeff * vForward * absSpeed;
  const rollingRes = vForward * surfaceDrag * 3.8;
  const naturalResist = aeroDrag + rollingRes;

  const baseDriveAccel = ((spec.basePowerKw * engineMult * 15.5) / spec.massKg) * (0.45 + 0.55 * safePace);
  let longAccel = 0;

  const absSteerIn = Math.abs(input.steer);
  // Intentional Brake + Steer Drift: tapping/holding Brake while turning at speed initiates a real trail-brake powerslide!
  const isBrakeDrifting =
    !car.airborne &&
    !input.reverse &&
    car.gear >= 1 &&
    input.brake > 0.08 &&
    absSteerIn > 0.16 &&
    vForward > 5.8;

  car.braking = false;

  if (isPureBrake && !isBrakeDrifting) {
    // Straight-line mobile BRAKE pedal slows both forward and reverse speed cleanly to 0 — NEVER reverses!
    car.braking = true;
    const brakePower = input.brake * 28.5 * surfaceGrip;
    if (vForward > 0.08) {
      longAccel -= Math.min(brakePower, vForward / dt);
    } else if (vForward < -0.08) {
      longAccel += Math.min(brakePower, -vForward / dt);
    } else {
      vForward = 0;
      longAccel = 0;
    }
  } else if (input.reverse && vForward > 1.2) {
    // Holding Reverse while still moving forward smoothly brakes to a stop before reversing
    car.braking = true;
    longAccel -= 26.0 * surfaceGrip;
  } else if (car.gear === -1) {
    // In Reverse gear: pressing Brake in Manual mode or alongside REV decelerates to 0 instead of accelerating
    if (input.brake > 0.02 && (transmission === 'manual' || input.reverse)) {
      car.braking = true;
      const brakePower = input.brake * 28.5 * surfaceGrip;
      if (vForward < -0.08) {
        longAccel += Math.min(brakePower, -vForward / dt);
      } else if (vForward > 0.08) {
        longAccel -= Math.min(brakePower, vForward / dt);
      } else {
        vForward = 0;
        longAccel = 0;
      }
    } else {
      const revInput = input.reverse
        ? 1
        : transmission === 'manual'
        ? input.throttle
        : input.brake;
      if (revInput > 0.02) {
        if (vForward > 0.8) {
          car.braking = true;
          longAccel -= revInput * 26.0 * surfaceGrip;
        } else if (vForward > -MAX_REVERSE_SPEED_MS) {
          longAccel -= revInput * 10.5 * surfaceGrip;
        }
      }
    }
  } else {
    const gearMaxSpeed = baseTopSpeedMs * GEAR_MAX_SPEED_FRAC[car.gear];
    const gearTorque = GEAR_TORQUE_MULT[car.gear];

    // Powerband efficiency: gentle lugging if way below gear band (encourages downshifting in Manual)
    let rpmEfficiency = 1.0;
    if (car.gear > 1 && rawGearRpm < 3800) {
      rpmEfficiency = THREE.MathUtils.clamp(0.64 + ((rawGearRpm - IDLE_RPM) / (3800 - IDLE_RPM)) * 0.36, 0.64, 1.0);
    }

    const shiftBonus = (car.shiftBoostTimer > 0 ? 1.12 : 1.0) * (car.driftBoostTimer > 0 ? 1.14 : 1.0);
    const rawDriveForce =
      input.throttle *
      baseDriveAccel *
      gearTorque *
      rpmEfficiency *
      shiftBonus *
      (0.80 + 0.20 * surfaceGrip);

    // Effective top speed ceiling for current gear (reduced automatically on red/white border and mud)
    const driftBoostCap = car.driftBoostTimer > 0 ? 1.06 : 1.0;
    const rawCeiling =
      car.gear === 6 && car.nitroActive
        ? gearMaxSpeed * 1.16
        : gearMaxSpeed * driftBoostCap;
    const activeCeiling = Math.min(rawCeiling, baseTopSpeedMs * surfaceSpeedFactor * driftBoostCap);

    if (input.throttle > 0.02) {
      if (vForward < 0) {
        // Recovering immediately after an obstacle rebound: strong arrest + forward launch!
        longAccel += rawDriveForce * 1.45 + 14.0 * surfaceGrip;
      } else if (isBrakeDrifting) {
        // Holding Throttle + Brake + Steer together sustains a high-momentum powerslide through hairpins!
        longAccel += rawDriveForce * 0.56;
      } else if (vForward <= activeCeiling * 0.975) {
        // Full gear-multiplied acceleration up to 97.5% of the active surface/gear speed band
        longAccel += rawDriveForce;
      } else if (vForward <= activeCeiling * 1.01) {
        // Smooth governor blends cleanly into steady top speed (holds exactly 180 km/h in 6th on default car)
        const t = THREE.MathUtils.clamp((vForward - activeCeiling * 0.975) / Math.max(0.5, activeCeiling * 0.035), 0, 1);
        const holdForce = Math.max(0, naturalResist);
        longAccel += THREE.MathUtils.lerp(rawDriveForce, holdForce, t);
      } else if (car.surface === 'asphalt') {
        // Above gear's natural ceiling on clean tarmac (e.g. just finished Nitro in 6th gear):
        // Keep partial sustaining throttle so speed bleeds down GRADUALLY (~4-5 km/h/s), NEVER a sudden drop!
        longAccel += Math.max(0, naturalResist * 0.65);
      }
    } else if (vForward > 1.5 && !isBrakeDrifting) {
      // Gentle natural engine braking when coasting off-throttle
      longAccel -= 0.45 * gearTorque;
    }

    // Automatic slowdown force when entering the red-and-white border kerb or mud shoulder
    if (car.surface !== 'asphalt' && vForward > activeCeiling) {
      longAccel -= surfaceBrakeDrag + (vForward - activeCeiling) * 0.35;
    }

    // If traveling far above a low gear's top speed (e.g., manual downshift from 6th to 3rd), apply smooth engine braking
    if (car.gear < 6 && vForward > gearMaxSpeed * 1.08) {
      longAccel -= Math.min(4.2, (vForward - gearMaxSpeed * 1.08) * 0.42);
    }

    if (car.nitroActive) {
      const nitroCap = car.gear === 6 ? baseTopSpeedMs * 1.17 : gearMaxSpeed * 1.04;
      if (vForward < nitroCap) {
        const nitroPull = 8.4 + car.config.nitroLevel * 1.15;
        longAccel += nitroPull;
      }
    }

    if (input.brake > 0.02) {
      if (isBrakeDrifting) {
        // Modulated trail-braking during Brake + Steer drift: carries speed sideways instead of dead-stopping!
        car.braking = true;
        const driftBrakeDecel = input.throttle > 0.15 ? 6.8 : 11.8;
        longAccel -= input.brake * driftBrakeDecel * surfaceGrip;
      } else if (vForward > 1.0) {
        car.braking = true;
        longAccel -= input.brake * 27.5 * surfaceGrip;
      } else if (transmission === 'auto' && !input.reverse && !input.touchBrake && input.throttle < 0.1) {
        longAccel -= input.brake * 10.0;
      }
    }
  }

  if (input.handbrake) {
    // Only used internally for post-finish parking stop (player never needs a drift button!)
    car.braking = true;
    longAccel -= Math.sign(vForward) * 10.5;
  }

  // Hill gravity effect: exciting downhill speed surge & realistic uphill climb load
  const hillGravityAccel = -directionalSlope * 9.81 * 0.72;
  longAccel += hillGravityAccel;
  longAccel -= naturalResist;

  // =========================================================================
  // 4. RESPONSIVE RACING STEERING & CONTROLLED CORNER / BRAKE DRIFTING
  //    (Predictable apex-holding powerslides: steer into corner to tighten,
  //     counter-steer to widen/recover, release steer to snap straight!)
  // =========================================================================
  const isDirtTrack = trackId === 'offroad-track';
  const trackDriftEase = isDirtTrack
    ? 1.24
    : trackId === 'gokart-track'
    ? 1.18
    : trackId === 'city-track' || trackId === 'hill-track'
    ? 1.12
    : 1.05;

  if (absSteerIn > 0.24 && absSpeed > 7.5 && !car.airborne) {
    car.steerHoldTime = Math.min(1.4, car.steerHoldTime + dt * (0.85 + absSteerIn * 0.95));
  } else {
    car.steerHoldTime = Math.max(0, car.steerHoldTime - dt * 4.2);
  }

  // Crisp, progressive speed-sensitive steering: nimble in hairpins, steady at high speed
  const speedSteerScale = 1 / (1 + absSpeed * 0.044 + absSpeed * absSpeed * 0.00056);
  const targetSteer = -input.steer * spec.maxSteerRad * speedSteerScale;
  const highSpeedFactor = THREE.MathUtils.clamp(absSpeed / 52, 0, 1);
  const steerLambda = absSteerIn > 0.01 ? THREE.MathUtils.lerp(10.5, 6.4, highSpeedFactor) : 16.0;
  car.steerAngle = THREE.MathUtils.damp(car.steerAngle, targetSteer, steerLambda, dt);
  if (absSteerIn < 0.01 && Math.abs(car.steerAngle) < 0.0008) {
    car.steerAngle = 0;
  }

  // Dynamic downforce grip scales with speed^2 (plants the chassis on straightaways)
  const downforceBonus = 1 + 0.00028 * aeroDownforce * vForward * vForward;
  const paceGripBonus = safePace > 1.0 ? 1 + Math.min(0.14, (safePace - 1.0) * 0.65) : 1.0;
  const totalGrip = spec.baseGrip * tireGripMult * surfaceGrip * downforceBonus * paceGripBonus;

  // Correct counter-steer detection:
  // Right turn (steer > 0) -> yawRate < 0 -> vLateral > 0 (sliding outward left).
  // Counter-steering LEFT (steer < 0) while vLateral > 0 gives (steer * vLateral < 0)!
  const isCounterSteering =
    absSteerIn > 0.14 && Math.abs(vLateral) > 1.35 && input.steer * vLateral < 0;

  // Controlled Drift Engagement:
  // 1) Brake + Steer cleanly kicks the tail out into a controlled trail-brake powerslide
  // 2) Holding throttle + steering through a corner sustains the slide smoothly around the apex
  // 3) Releasing steer OR counter-steering smoothly recovers straight grip with zero snap-spin!
  const minCornerDriftSpeed = isDirtTrack ? 10.5 : 13.5;
  const speedDriftFactor = THREE.MathUtils.clamp((absSpeed - minCornerDriftSpeed) / 20, 0, 1.15);
  const brakeDriftSpeedFactor = THREE.MathUtils.clamp((vForward - 5.5) / 11.5, 0.35, 1.0);
  const brakeWeightTransfer = isBrakeDrifting
    ? (0.62 + absSteerIn * 0.48) * brakeDriftSpeedFactor
    : 0;
  const holdBuild = Math.min(0.42, car.steerHoldTime * 0.65);
  const cornerDemand =
    !car.airborne && vForward > 5.8 && !isCounterSteering
      ? (absSteerIn * (0.56 + holdBuild) * speedDriftFactor + brakeWeightTransfer) * trackDriftEase
      : 0;

  const sustainThrottleSlide =
    !car.airborne &&
    !isCounterSteering &&
    car.driftState > 0.25 &&
    absSteerIn > 0.20 &&
    vForward > 7.5 &&
    input.throttle > 0.2;

  const rawDriftEngage = isCounterSteering
    ? Math.max(0, car.driftState * 0.35)
    : isBrakeDrifting
    ? THREE.MathUtils.clamp(0.54 + absSteerIn * 0.38 * brakeDriftSpeedFactor, 0.48, 0.92)
    : cornerDemand > 0.44
    ? THREE.MathUtils.clamp((cornerDemand - 0.38) * 1.05, 0, 0.88)
    : sustainThrottleSlide
    ? THREE.MathUtils.clamp(Math.max(car.driftState * 0.92, 0.42 + absSteerIn * 0.34), 0.40, 0.84)
    : 0;

  const prevDriftState = car.driftState;
  car.driftState = THREE.MathUtils.damp(
    car.driftState,
    rawDriftEngage,
    rawDriftEngage > car.driftState ? (isBrakeDrifting ? 10.5 : 7.5) : isCounterSteering ? 9.5 : 6.8,
    dt
  );

  // Reward clean Drift Exit Mini-Boost when straightening out after holding a real corner slide!
  if (
    prevDriftState >= 0.26 &&
    car.driftState < 0.26 &&
    car.currentDriftChain >= 120 &&
    input.throttle > 0.35 &&
    !car.airborne
  ) {
    car.driftBoostTimer = 0.62;
    car.nitroEnergy = Math.min(100, car.nitroEnergy + 8);
  }

  // Planted, progressive lateral grip during drift (keeps front/rear bite so car NEVER slides on ice!)
  const driftGripFloor = isDirtTrack ? 0.50 : isBrakeDrifting ? 0.54 : 0.60;
  const effectiveLatGrip = totalGrip * THREE.MathUtils.lerp(1.0, driftGripFloor, car.driftState);

  // Subtle cornering scrub while drifting + gentle apex drive-out boost on throttle
  if (car.driftState > 0.18 && !isBrakeDrifting && !car.airborne) {
    longAccel -= car.driftState * (isDirtTrack ? 1.15 : 0.85) * (0.35 + 0.65 * highSpeedFactor);
    if (input.throttle > 0.25 && !isCounterSteering) {
      // Converts part of lateral cornering energy into forward pull so drifting carries exit speed!
      longAccel += Math.min(2.6, Math.abs(vLateral) * 0.22 * car.driftState);
    }
  }

  // Controlled Yaw Dynamics + Active Self-Centering Drift Gyro (eliminates spin-outs!)
  const airControlMult = car.airborne ? 0.18 : 1.0;
  const kinematicYaw = absSpeed > 0.35 ? (vForward / spec.wheelbase) * Math.tan(car.steerAngle) * airControlMult : 0;

  // Modest, smooth oversteer assist ONLY when steering into the drift (never during counter-steer!)
  const driftOversteer =
    !car.airborne && !isCounterSteering && car.driftState > 0.1 && vForward > 5.8
      ? -input.steer * (isBrakeDrifting ? 0.34 : isDirtTrack ? 0.32 : 0.26) * car.driftState * Math.min(1, absSpeed / 15)
      : 0;

  // Active Slip-Angle Stabilizer (natural front-caster self-alignment prevents over-rotation & 180 spin-outs!)
  const currentSlipAngle = Math.atan2(vLateral, Math.max(6.5, absSpeed));
  // Note: turning right -> yawRate < 0 -> vLateral > 0 -> currentSlipAngle > 0.
  // Adding +currentSlipAngle pulls yawRate back toward 0 (straightening the nose toward velocity!).
  const slipSelfAlign = !car.airborne && absSpeed > 5.5
    ? THREE.MathUtils.clamp(currentSlipAngle * (isCounterSteering ? 1.65 : 0.95), -0.85, 0.85)
    : 0;

  const maxYawCap = THREE.MathUtils.lerp(1.62, 1.84, car.driftState);
  const maxYawForSpeed = Math.min(maxYawCap, (40 * totalGrip) / Math.max(9.5, absSpeed));
  const rawYaw = (kinematicYaw + driftOversteer + slipSelfAlign) * (0.82 + 0.18 * surfaceGrip);
  const targetYawRate = THREE.MathUtils.clamp(rawYaw, -maxYawForSpeed, maxYawForSpeed);
  const yawResponse = car.airborne
    ? 2.4
    : isCounterSteering
    ? 11.5
    : isBrakeDrifting
    ? 8.5
    : THREE.MathUtils.lerp(THREE.MathUtils.lerp(10.5, 7.8, highSpeedFactor), 7.6, car.driftState);
  car.yawRate = THREE.MathUtils.damp(car.yawRate, targetYawRate, yawResponse, dt);
  if (absSteerIn < 0.01 && Math.abs(vLateral) < 0.25 && Math.abs(car.yawRate) < 0.002) {
    car.yawRate = 0;
  }

  // Integrate forward speed cleanly (prevent straight-line mobile brake from crossing 0 into reverse creep)
  const hardTopSpeedMs = baseTopSpeedMs * 1.19;
  const prevVForward = vForward;
  vForward += longAccel * dt;
  if (isPureBrake && !isBrakeDrifting && (prevVForward * vForward <= 0 || Math.abs(vForward) < 0.08)) {
    vForward = 0;
  }
  vForward = THREE.MathUtils.clamp(vForward, -MAX_REVERSE_SPEED_MS, hardTopSpeedMs);

  // Controlled centrifugal lateral slip: kicks out smoothly into a crisp drift arc without washing wide!
  const baseSlipGain = THREE.MathUtils.lerp(0.18, 0.11, highSpeedFactor);
  const driftSlipGain = isBrakeDrifting ? 0.68 : isDirtTrack ? 0.62 : 0.56;
  const lateralSlipGain = isCounterSteering
    ? baseSlipGain
    : THREE.MathUtils.lerp(baseSlipGain, driftSlipGain, car.driftState);
  vLateral -= vForward * car.yawRate * dt * lateralSlipGain;

  // Anti-overshoot Pacejka lateral tire grip (strong progressive bite keeps the drift tight & controllable!)
  const slipRatio = vLateral / Math.max(7, absSpeed);
  const pacejka = Math.sin(1.4 * Math.atan(4.2 * slipRatio));
  const maxLatAccel = THREE.MathUtils.lerp(23.5, 14.8, car.driftState) * effectiveLatGrip;
  const latDelta = -pacejka * maxLatAccel * dt;
  if (Math.abs(latDelta) >= Math.abs(vLateral)) {
    vLateral = 0;
  } else {
    vLateral += latDelta;
  }

  // Crisp lateral settling: holds a smooth controlled arc while steering, snaps straight on exit or counter-steer!
  const straightDamp = (7.2 + highSpeedFactor * 2.4) * effectiveLatGrip;
  const driftDamp = (isCounterSteering ? 5.6 : isBrakeDrifting ? 2.15 : isDirtTrack ? 2.35 : 2.65) * effectiveLatGrip;
  const latDamp =
    absSpeed < 3.5
      ? 15
      : absSteerIn < 0.08
      ? Math.max(straightDamp * 0.85, driftDamp)
      : THREE.MathUtils.lerp(straightDamp, driftDamp, car.driftState);
  vLateral *= Math.exp(-latDamp * dt);

  // Soft slip-angle envelope (~26° max physics slip): guarantees the car ALWAYS stays in control and never skates sideways off track!
  const maxAllowedLat = Math.max(1.8, absSpeed * (isDirtTrack ? 0.52 : 0.46));
  if (Math.abs(vLateral) > maxAllowedLat) {
    vLateral = THREE.MathUtils.damp(vLateral, Math.sign(vLateral) * maxAllowedLat, 18, dt);
  }
  if (Math.abs(vLateral) < 0.03) vLateral = 0;

  // Drift intensity telemetry, expressive visual slip yaw angle & live Drift Points scoring!
  const slipMag = Math.abs(vLateral) / Math.max(6.2, absSpeed);
  const slipDrift = absSpeed > 5.8 && !car.airborne ? THREE.MathUtils.clamp((slipMag - 0.04) * 4.8, 0, 1) : 0;
  const rawDrift = !car.airborne
    ? Math.max(slipDrift, car.driftState * (isBrakeDrifting ? 0.92 : absSteerIn > 0.16 ? 0.80 : 0.35))
    : 0;
  car.driftIntensity = THREE.MathUtils.damp(car.driftIntensity, rawDrift, 11.5, dt);

  const visualLatSlip = Math.atan2(vLateral, Math.max(7.2, absSpeed));
  const brakeVisualBias = isBrakeDrifting && !isCounterSteering ? -input.steer * 0.11 * car.driftState : 0;
  const targetDriftAngle =
    !car.airborne && absSpeed > 5.5
      ? THREE.MathUtils.clamp(-visualLatSlip * 1.45 + brakeVisualBias, -0.48, 0.48)
      : 0;
  car.driftAngle = THREE.MathUtils.damp(car.driftAngle, targetDriftAngle, 11.0, dt);

  // Accumulate drift points automatically while powersliding around corners on ANY track!
  const isActivelyDrifting =
    !car.airborne &&
    car.driftIntensity > 0.18 &&
    absSpeed > 6.5 &&
    car.surface !== 'offtrack';

  if (isActivelyDrifting) {
    const speedFactor = THREE.MathUtils.clamp(absSpeed / 22, 0.55, 2.5);
    const angleFactor = Math.max(0.35, car.driftIntensity);
    const ptsDelta = angleFactor * speedFactor * 205 * dt;
    car.currentDriftChain += ptsDelta;
    car.driftComboTimer = 1.75;
    if (car.currentDriftChain >= 1400) car.driftMultiplier = 4;
    else if (car.currentDriftChain >= 700) car.driftMultiplier = 3;
    else if (car.currentDriftChain >= 250) car.driftMultiplier = 2;
    else car.driftMultiplier = 1;
  } else if (car.currentDriftChain > 0) {
    car.driftComboTimer -= dt;
    if (car.driftComboTimer <= 0 || car.finished) {
      car.driftPoints += Math.round(car.currentDriftChain * car.driftMultiplier);
      car.currentDriftChain = 0;
      car.driftMultiplier = 1;
      car.driftComboTimer = 0;
    }
  }

  // Update heading & world velocity
  car.heading += car.yawRate * dt;
  const nSin = Math.sin(car.heading);
  const nCos = Math.cos(car.heading);
  car.vx = vForward * nSin + vLateral * nCos;
  car.vz = vForward * nCos - vLateral * nSin;

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = vForward;

  // Solid Road-Border, Split-Diversion Island & Street-Pole Collision Resolution!
  let barrierImpact = 0;
  const updatedClosest = findClosestSample(car.x, car.z, samples, car.sampleIndex);
  const postDivInfo =
    diversions.length > 0
      ? sampleDiversionAt(updatedClosest.index, diversions)
      : { active: false, extraOuter: 0, islandHalfWidth: 0, centerOffset: 0 };
  const postCityTight = trackId === 'city-track' ? getCityStreetTightness(updatedClosest.index, samples.length) : 0;
  const postBarrierOffset = barrierOffset - postCityTight * 5.85 + postDivInfo.extraOuter * 0.72;
  // Side roads are freely drivable!
  // - City Track: cars can enter the Italian travertine side road/sidewalk; buildings, poles, trees & Vespas block!
  // - Off-Road & Riverside: cars can enter the side road & meadow gaps; wooden fences, trees, poles, rocks & logs block!
  // - Closed Circuits (Racing / Hill / Stadium / Go-Kart): cars can run onto the shoulder up to the visible Armco/tire barrier!
  const maxLat =
    trackId === 'city-track'
      ? postBarrierOffset + 14.0
      : trackId === 'offroad-track' || trackId === 'riverside-track'
      ? postBarrierOffset + 24.0
      : postBarrierOffset - 1.02;

  const applySolidBorderCollision = (
    s: SplineSample,
    pushDir: number, // +1 pushes along +s.right, -1 pushes along -s.right
    penetration: number
  ) => {
    car.x += s.right.x * pushDir * penetration;
    car.z += s.right.z * pushDir * penetration;

    const intoWallVel = -(car.vx * s.right.x + car.vz * s.right.z) * pushDir;
    const tanVel = car.vx * s.tangent.x + car.vz * s.tangent.z;
    const preSpeed = Math.hypot(car.vx, car.vz);
    const slideDir = tanVel >= -0.6 ? 1 : -1;
    const isGoKartTyreWall = trackId === 'gokart-track';

    // Go-Kart Track: realistic reactive tyre-stack movement on impact OR high-speed grazing!
    if (isGoKartTyreWall && (intoWallVel > 0.22 || preSpeed > 4.2)) {
      const directHit = Math.max(0, intoWallVel) / 13.5;
      const grazeHit = preSpeed > 4.2 ? Math.min(0.42, (preSpeed - 3.5) / 34) : 0;
      const tyreHitStrength = Math.min(1, 0.14 + Math.max(directHit, grazeHit));
      // Outward wall normal points opposite to pushDir (into the tyre stacks!)
      impactNearbyTyres(
        breakables,
        updatedClosest.index,
        samples.length,
        car.x,
        car.z,
        car.vx,
        car.vz,
        -s.right.x * pushDir,
        -s.right.z * pushDir,
        tyreHitStrength
      );
    }

    if (intoWallVel > 0.04) {
      if (intoWallVel > 0.75) {
        const hitStrength = Math.min(1, 0.24 + (intoWallVel - 0.6) / 12.5);
        barrierImpact = Math.max(barrierImpact, hitStrength);
        car.roll = THREE.MathUtils.clamp(car.roll - pushDir * hitStrength * 0.1, -0.13, 0.13);
        car.pitch = THREE.MathUtils.clamp(car.pitch - hitStrength * 0.045, -0.07, 0.07);
      }

      // Noticeable solid collision speed scrub + crisp lateral rebound (rubbery cushion feel on Go-Kart tyres!)
      const impactScrub = isGoKartTyreWall
        ? 1 - THREE.MathUtils.clamp(intoWallVel / 34, 0.04, 0.26)
        : 1 - THREE.MathUtils.clamp(intoWallVel / 28, 0.05, 0.34);
      const railDrag = Math.exp((isGoKartTyreWall ? -0.95 : -1.15) * dt);
      const redirectedSpeed = Math.max(Math.abs(tanVel) * impactScrub, preSpeed * 0.62) * railDrag;
      const bounceOutVel = isGoKartTyreWall
        ? Math.min(8.2, intoWallVel * 0.44 + 1.25)
        : Math.min(7.2, intoWallVel * 0.36 + 0.95);

      car.vx = s.tangent.x * slideDir * redirectedSpeed + s.right.x * pushDir * bounceOutVel;
      car.vz = s.tangent.z * slideDir * redirectedSpeed + s.right.z * pushDir * bounceOutVel;

      const noseIntoWall = -(Math.sin(car.heading) * s.right.x + Math.cos(car.heading) * s.right.z) * pushDir;
      if (noseIntoWall > 0.01) {
        const railHeading = Math.atan2(s.tangent.x * slideDir, s.tangent.z * slideDir);
        let diff = railHeading - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.heading += diff * Math.min(1, 11.5 * dt);
        car.yawRate = THREE.MathUtils.clamp(
          car.yawRate * 0.45 + Math.sign(diff || pushDir) * Math.min(0.75, intoWallVel * 0.05),
          -1.8,
          1.8
        );
      }

      const alignedSin = Math.sin(car.heading);
      const alignedCos = Math.cos(car.heading);
      car.speed = car.vx * alignedSin + car.vz * alignedCos;
    }
  };

  const applyObstacleImpulse = (
    nx: number,
    nz: number,
    overlap: number,
    restitution: number,
    isFlatWall: boolean
  ) => {
    // Hard non-penetration separation so the car NEVER passes through buildings, trees, fences or poles!
    car.x += nx * (overlap + 0.025);
    car.z += nz * (overlap + 0.025);

    const vDotN = car.vx * nx + car.vz * nz;
    if (vDotN < 0) {
      const closing = -vDotN;
      const impulse = (1 + restitution) * closing;
      car.vx += nx * impulse;
      car.vz += nz * impulse;

      const speedRetention = isFlatWall
        ? THREE.MathUtils.clamp(0.88 - closing * 0.01, 0.56, 0.88)
        : THREE.MathUtils.clamp(0.82 - closing * 0.013, 0.5, 0.82);
      car.vx *= speedRetention;
      car.vz *= speedRetention;

      const hSin = Math.sin(car.heading);
      const hCos = Math.cos(car.heading);
      // Cap excessive backward recoil so frontal solid hits don't fling the car uncontrollably backward
      const postFwd = car.vx * hSin + car.vz * hCos;
      if (postFwd < -3.2 && car.gear >= 1) {
        const postLat = car.vx * hCos - car.vz * hSin;
        const clampedFwd = -3.2;
        car.vx = clampedFwd * hSin + postLat * hCos;
        car.vz = clampedFwd * hCos - postLat * hSin;
      }

      const sideLever = nx * hCos - nz * hSin;
      const hitNorm = Math.min(1, 0.3 + closing / 13.5);
      if (closing > 0.5) {
        barrierImpact = Math.max(barrierImpact, hitNorm);
        car.yawRate = THREE.MathUtils.clamp(
          car.yawRate + Math.sign(sideLever || 1) * hitNorm * (isFlatWall ? 0.85 : 1.15),
          -2.1,
          2.1
        );
        car.roll = THREE.MathUtils.clamp(car.roll + sideLever * hitNorm * 0.11, -0.14, 0.14);
        car.pitch = THREE.MathUtils.clamp(car.pitch - hitNorm * 0.06, -0.08, 0.08);
      }
      car.speed = car.vx * hSin + car.vz * hCos;
    }
  };

  const applyBreakableSmash = (prop: BreakableProp, nx: number, nz: number) => {
    const hitSpeed = Math.hypot(car.vx, car.vz);
    knockBreakableProp(prop, car.vx, car.vz, car.x, car.z);

    const isTree = prop.kind === 'tree';
    const isHeavy = prop.kind === 'pole' || prop.kind === 'fence';
    const isMedium = prop.kind === 'bench';
    const speedKeep = isTree
      ? THREE.MathUtils.clamp(0.88 - hitSpeed * 0.0014, 0.80, 0.88)
      : isHeavy
      ? THREE.MathUtils.clamp(0.95 - hitSpeed * 0.0009, 0.89, 0.95)
      : isMedium
      ? 0.945
      : 0.972;
    car.vx *= speedKeep;
    car.vz *= speedKeep;

    const hSin = Math.sin(car.heading);
    const hCos = Math.cos(car.heading);
    const sideLever = nx * hCos - nz * hSin;
    const hitNorm = Math.min(
      0.88,
      (isTree ? 0.52 : isHeavy ? 0.34 : isMedium ? 0.3 : 0.22) + hitSpeed / 46
    );
    barrierImpact = Math.max(barrierImpact, hitNorm);
    car.roll = THREE.MathUtils.clamp(car.roll + sideLever * hitNorm * 0.08, -0.13, 0.13);
    car.pitch = THREE.MathUtils.clamp(car.pitch - hitNorm * 0.05, -0.08, 0.08);
    car.speed = car.vx * hSin + car.vz * hCos;
  };

  // A. Solid Buildings, Trees, Boulders & Logs + Speed-Based Knock-Down Poles & Fences (2-pass O(1) window!)
  if (!car.airborne && (poleColliders.length > 0 || boxColliders.length > 0)) {
    const nSamples = samples.length;
    const carHitRadius = 0.96;
    const cIdx = updatedClosest.index;

    for (let pass = 0; pass < 2; pass++) {
      let hitAny = false;

      // A1. Buildings, Grandstands, Vespas & Fallen Logs (solid) + Wooden Fences (knock-down!)
      for (let i = 0; i < boxColliders.length; i++) {
        const box = boxColliders[i];
        const breakProp = box.breakableId !== undefined ? breakables[box.breakableId] : undefined;
        if (breakProp && breakProp.knocked) continue;

        let idxDiff = Math.abs(box.sampleIdx - cIdx);
        if (idxDiff > nSamples * 0.5) idxDiff = nSamples - idxDiff;
        const maxWindow = box.halfD > 12 ? 42 : 28;
        if (idxDiff > maxWindow) continue;

        const dx = car.x - box.x;
        const dz = car.z - box.z;
        const maxR = box.halfW + box.halfD + carHitRadius;
        if (dx * dx + dz * dz > maxR * maxR) continue;

        // Transform world delta into box-local space (matches Three.js rotation.y = yaw)
        const lx = dx * box.cosYaw - dz * box.sinYaw;
        const lz = dx * box.sinYaw + dz * box.cosYaw;

        const clampedX = THREE.MathUtils.clamp(lx, -box.halfW, box.halfW);
        const clampedZ = THREE.MathUtils.clamp(lz, -box.halfD, box.halfD);
        const dlx = lx - clampedX;
        const dlz = lz - clampedZ;
        const distSq = dlx * dlx + dlz * dlz;

        if (distSq < carHitRadius * carHitRadius) {
          let lnx = 0;
          let lnz = 0;
          let overlap = 0;

          if (distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            lnx = dlx / dist;
            lnz = dlz / dist;
            overlap = carHitRadius - dist;
          } else {
            // Deep interior overlap fallback: eject along shortest face axis
            const penX = box.halfW - Math.abs(lx);
            const penZ = box.halfD - Math.abs(lz);
            if (penX < penZ) {
              lnx = lx >= 0 ? 1 : -1;
              overlap = penX + carHitRadius;
            } else {
              lnz = lz >= 0 ? 1 : -1;
              overlap = penZ + carHitRadius;
            }
          }

          // Transform outward normal back into world XZ
          const nx = lnx * box.cosYaw + lnz * box.sinYaw;
          const nz = -lnx * box.sinYaw + lnz * box.cosYaw;

          if (breakProp && Math.hypot(car.vx, car.vz) >= 2.2) {
            applyBreakableSmash(breakProp, nx, nz);
            continue;
          }

          applyObstacleImpulse(nx, nz, overlap, 0.34, true);
          hitAny = true;
        }
      }

      // A2. Trees, Planter Pots, Gantry Pillars & Boulders (solid) + Street Poles, Bollards, Signs & Umbrellas (knock-down!)
      for (let i = 0; i < poleColliders.length; i++) {
        const pole = poleColliders[i];
        const breakProp = pole.breakableId !== undefined ? breakables[pole.breakableId] : undefined;
        if (breakProp && breakProp.knocked) continue;

        let idxDiff = Math.abs(pole.sampleIdx - cIdx);
        if (idxDiff > nSamples * 0.5) idxDiff = nSamples - idxDiff;
        if (idxDiff > 24) continue;

        const dx = car.x - pole.x;
        const dz = car.z - pole.z;
        const minDist = carHitRadius + pole.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;

          if (breakProp && Math.hypot(car.vx, car.vz) >= 2.2) {
            applyBreakableSmash(breakProp, nx, nz);
            continue;
          }

          applyObstacleImpulse(nx, nz, overlap, 0.42, false);
          hitAny = true;
        }
      }

      if (!hitAny) break;
    }
  }

  // B. Outer track barrier / world safety boundary collision
  if (Math.abs(updatedClosest.lateral) > maxLat) {
    const s = samples[updatedClosest.index];
    const sign = Math.sign(updatedClosest.lateral);
    applySolidBorderCollision(s, -sign, Math.abs(updatedClosest.lateral) - maxLat);
  }

  // C. Central Split-Diversion Island solid barrier collision (cleanly deflects car into Left or Right lane!)
  if (postDivInfo.islandHalfWidth > 0.2 && !car.airborne) {
    const relLat = updatedClosest.lateral - postDivInfo.centerOffset;
    const minIslandDist = postDivInfo.islandHalfWidth + 1.05;
    if (Math.abs(relLat) < minIslandDist) {
      const s = samples[updatedClosest.index];
      // Deflect outward toward whichever lane the car is biased toward (or its steer direction if dead-center)
      const laneSign =
        Math.abs(relLat) > 0.12
          ? Math.sign(relLat)
          : input.steer !== 0
          ? Math.sign(input.steer)
          : 1;
      applySolidBorderCollision(s, laneSign, minIslandDist - Math.abs(relLat));
    }
  }

  // =========================================================================
  // 5. EXACT POST-STEP VERTICAL GROUNDING & ROAD-BLENDED SCULPTED JUMP AIRTIME
  //    Guarantees cars NEVER sink below road, kerb, apron, sidewalk, embankment,
  //    or off-road terrain mesh on ANY track from ANY camera angle!
  // =========================================================================
  const postRoad = sampleSmoothRoadY(car.x, car.z, samples, updatedClosest.index);
  const absPostLat = Math.abs(updatedClosest.lateral);
  const cityRoadHalf = roadWidth * 0.5 - postCityTight * 2.85 + postDivInfo.extraOuter;
  const citySidewalkLift =
    trackId === 'city-track'
      ? THREE.MathUtils.smoothstep(absPostLat, cityRoadHalf - 0.1, cityRoadHalf + 0.45) * 0.135
      : 0;
  // Road deck sits cleanly above asphalt (+0.08), kerbs (+0.11), and flared diversion aprons (+0.124)
  const roadDeckY = postRoad.y + 0.128 + citySidewalkLift;

  let meshGroundCenter = postRoad.y - 0.35;
  let terrainSlopeAlongCar = 0;
  let terrainFloorY = -Infinity;
  if (getGroundY) {
    meshGroundCenter = getGroundY(car.x, car.z);
    const frontY = getGroundY(car.x + nSin * 1.45, car.z + nCos * 1.45);
    const rearY = getGroundY(car.x - nSin * 1.45, car.z - nCos * 1.45);
    terrainSlopeAlongCar = THREE.MathUtils.clamp((frontY - rearY) / 2.9, -0.45, 0.45);
    terrainFloorY = Math.max(meshGroundCenter, (frontY + rearY) * 0.5) + 0.06;
  }

  let baseRoadSurfaceY = roadDeckY;
  const skirtOuterEdge = postBarrierOffset + 0.72;
  const embOuterEdge = postBarrierOffset + 7.5;
  if (trackId !== 'city-track' && getGroundY) {
    if (absPostLat <= skirtOuterEdge) {
      baseRoadSurfaceY = Math.max(roadDeckY, terrainFloorY);
    } else if (absPostLat < embOuterEdge) {
      const tEmb = (absPostLat - skirtOuterEdge) / (embOuterEdge - skirtOuterEdge);
      const embY = THREE.MathUtils.lerp(roadDeckY, terrainFloorY, tEmb);
      baseRoadSurfaceY = Math.max(embY, terrainFloorY);
    } else {
      baseRoadSurfaceY = terrainFloorY;
    }
  } else if (getGroundY) {
    baseRoadSurfaceY = Math.max(roadDeckY, terrainFloorY);
  }

  const rampInfo =
    ramps.length > 0
      ? evaluateTrackRampAt(
          postRoad.floatIdx,
          updatedClosest.lateral,
          samples.length,
          ramps,
          roadWidth * 0.5,
          kerbWidth,
          barrierOffset
        )
      : { onRamp: false, onLaunchFace: false, extraY: 0, slopeY: 0, progress: 0, crestU: 0.72 };
  const surfaceY = Math.max(baseRoadSurfaceY + rampInfo.extraY, terrainFloorY);
  const postSample = samples[updatedClosest.index];
  const postHeadingAlong = nSin * postSample.tangent.x + nCos * postSample.tangent.z;
  const offRoadTerrainBlend =
    trackId !== 'city-track' && getGroundY
      ? THREE.MathUtils.smoothstep(absPostLat, skirtOuterEdge, embOuterEdge)
      : 0;
  const postDirectionalSlope = THREE.MathUtils.lerp(
    (postRoad.slopeY + rampInfo.slopeY) * postHeadingAlong,
    terrainSlopeAlongCar,
    offRoadTerrainBlend
  );

  let landedImpact = 0;
  let launchedJump = false;
  const GRAVITY = 17.6;

  if (!car.airborne) {
    // Launch high off the crest lip of a road-blended sculpted jump mound at racing speed!
    const atRampCrest =
      car.onRamp && (!rampInfo.onLaunchFace || rampInfo.progress >= rampInfo.crestU - 0.03);
    if (atRampCrest && vForward > 9.5 && postHeadingAlong > 0.35) {
      car.airborne = true;
      car.airTime = 0;
      const launchSlope = Math.max(0.21, car.lastRampSlope);
      car.vy = THREE.MathUtils.clamp(Math.max(8.6, vForward * launchSlope * 1.56), 8.6, 17.8);
      car.y = Math.max(car.y + car.vy * dt, surfaceY + 0.12);
      launchedJump = true;
    } else {
      // Check for high-speed natural hill crest hop (if road drops away faster than gravity)
      const prevSurfaceVy = (surfaceY - car.prevY) / Math.max(0.001, dt);
      if (car.vy > 2.6 && prevSurfaceVy < car.vy - GRAVITY * dt * 2.2 && vForward > 31) {
        car.airborne = true;
        car.airTime = 0;
        car.vy -= GRAVITY * dt;
        car.y = Math.max(surfaceY + 0.04, car.prevY + car.vy * dt);
        launchedJump = true;
      } else {
        // Stay 100% flush ON TOP of the sculpted road surface — zero floating & zero underground penetration!
        car.vy = THREE.MathUtils.clamp((surfaceY - car.prevY) / Math.max(0.001, dt), -22, 22);
        car.y = surfaceY;
      }
    }
  } else {
    // True parabolic 3D airtime flight above the sculpted road & back-slope
    car.vy -= GRAVITY * dt;
    car.y += car.vy * dt;
    car.airTime += dt;

    if (car.y <= surfaceY) {
      landedImpact = THREE.MathUtils.clamp(Math.abs(car.vy) / 14, 0.16, 1.0);
      car.y = surfaceY;
      // Award Big Stunt Jump bonus points + Nitro boost refill on clean landing!
      if (car.airTime > 0.25 && !car.finished) {
        const bonus = Math.round(car.airTime * 480);
        car.driftPoints += bonus;
        car.lastJumpBonus = bonus;
        car.jumpBonusTimer = 2.0;
        car.nitroEnergy = Math.min(100, car.nitroEnergy + Math.min(24, car.airTime * 22));
      }
      car.pitch = Math.min(0.095, car.pitch + landedImpact * 0.085);
      car.vy = 0;
      car.airborne = false;
      car.airTime = 0;
      car.lastRampSlope = 0;
    }
  }

  const climbingLaunchFace =
    rampInfo.onLaunchFace && !car.airborne && rampInfo.progress < rampInfo.crestU - 0.03;
  car.onRamp = climbingLaunchFace;
  if (climbingLaunchFace) {
    car.lastRampSlope = Math.max(car.lastRampSlope, rampInfo.slopeY);
  } else if (!car.airborne) {
    car.lastRampSlope = 0;
  }

  // Responsive road & airborne pitch so front/rear bumpers hug hills & sculpted road jumps seamlessly
  const targetRoadPitch = car.airborne
    ? THREE.MathUtils.clamp(-Math.atan2(car.vy, Math.max(14, absSpeed)) * 0.68, -0.38, 0.26)
    : -Math.atan(THREE.MathUtils.clamp(postDirectionalSlope, -0.42, 0.42));
  car.roadPitch = THREE.MathUtils.damp(car.roadPitch, targetRoadPitch, car.airborne ? 6.5 : 22, dt);

  // Suspension pitch & roll (aerodynamically stiffened at high speed so chassis stays rock-steady)
  const aeroStiffScale = THREE.MathUtils.lerp(1.0, 0.55, highSpeedFactor);
  const targetPitch = car.airborne
    ? 0
    : THREE.MathUtils.clamp(-longAccel * 0.0017 * suspRollFactor * aeroStiffScale, -0.04, 0.04);
  const latG = vForward * car.yawRate;
  const targetRoll = car.airborne
    ? 0
    : THREE.MathUtils.clamp(-latG * 0.0024 * suspRollFactor * aeroStiffScale, -0.06, 0.06);
  car.pitch = THREE.MathUtils.damp(car.pitch, targetPitch, 6.5, dt);
  car.roll = THREE.MathUtils.damp(car.roll, targetRoll, 6.5, dt);
  car.wheelSpin += (vForward / 0.35) * dt;

  const speedKmh = Math.abs(vForward) * 3.6;
  if (speedKmh > car.topSpeedKmh) {
    car.topSpeedKmh = Math.round(speedKmh);
  }

  // Wrong-way check
  const forwardDot = nSin * sample.tangent.x + nCos * sample.tangent.z;
  car.wrongWay = absSpeed > 4 && forwardDot < -0.35;

  // Ordered sector checkpoint & lap counting
  const progress = updatedClosest.index / samples.length;
  const sector = Math.min(3, Math.floor(progress * 4));
  if (sector === 0) car.checkpointMask |= 1;
  if (sector === 1 && (car.checkpointMask & 1)) car.checkpointMask |= 2;
  if (sector === 2 && (car.checkpointMask & 2)) car.checkpointMask |= 4;
  if (sector === 3 && (car.checkpointMask & 4)) car.checkpointMask |= 8;

  let completedLap = false;
  const crossedForward =
    prevSampleIdx > samples.length * 0.85 && updatedClosest.index < samples.length * 0.15;

  if (crossedForward && (car.checkpointMask & 14) === 14 && !car.finished) {
    const lapTime = raceElapsedMs - car.lapStartTimeMs;
    if (lapTime > 12000) {
      if (car.bestLapMs === 0 || lapTime < car.bestLapMs) {
        car.bestLapMs = Math.round(lapTime);
      }
      car.lapStartTimeMs = raceElapsedMs;
      car.checkpointMask = 1;
      completedLap = true;
      if (car.lap >= totalLaps) {
        car.finished = true;
        car.finishTimeMs = Math.round(raceElapsedMs);
      } else {
        car.lap += 1;
      }
    }
  }

  car.progress = progress;
  car.currentLapMs = car.finished ? 0 : Math.max(0, raceElapsedMs - car.lapStartTimeMs);

  const effectiveProgress =
    car.lap === 1 && (car.checkpointMask & 2) === 0 && progress > 0.82 ? progress - 1 : progress;
  car.totalProgress = car.finished
    ? totalLaps + 1 + 1 / Math.max(1, car.finishTimeMs)
    : car.lap - 1 + effectiveProgress;

  return { barrierImpact, completedLap, shiftedGear, landedImpact, launchedJump };
}

export interface CarCollisionResult {
  maxImpact: number;
  playerImpact: number;
  impactX: number;
  impactY: number;
  impactZ: number;
}

/**
 * Dual-bumper (front & rear axle sphere pair) car-to-car collision physics:
 * - Accurately models the full ~4.4m x 2.0m car footprint (no nose/tail ghosting!)
 * - Mass-weighted elastic-inelastic impulse transfer with realistic speed bleed
 * - Off-center corner impacts impart realistic yaw spin torque & chassis body roll/pitch jolt
 * - Separately reports player-involved impact strength & world contact point for SFX & sparks
 */
export function resolveCarCollisions(
  cars: PhysicsCar[],
  playerId?: string,
  getGroundY?: (x: number, z: number) => number
): CarCollisionResult {
  let maxImpact = 0;
  let playerImpact = 0;
  let impactX = 0;
  let impactY = 0;
  let impactZ = 0;

  const sphereRadius = 1.06;
  const minDist = sphereRadius * 2; // 2.12m combined width
  const minDistSq = minDist * minDist;
  const axleOffsets = [-1.22, 1.22]; // rear & front bumper spheres along car heading

  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.eliminated) continue;
    const sinA = Math.sin(a.heading);
    const cosA = Math.cos(a.heading);
    const massA = CHASSIS_SPECS[a.config.chassisId].massKg;

    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.eliminated) continue;
      // Fast broad-phase reject (~5.6m center-to-center)
      const cdx = b.x - a.x;
      const cdz = b.z - a.z;
      if (cdx * cdx + cdz * cdz > 31.5) continue;

      const sinB = Math.sin(b.heading);
      const cosB = Math.cos(b.heading);
      const massB = CHASSIS_SPECS[b.config.chassisId].massKg;

      // Find deepest overlapping pair among front/rear body spheres
      let bestOverlap = 0;
      let bestNx = 0;
      let bestNz = 0;
      let bestOffA = 0;
      let bestOffB = 0;
      let contactX = (a.x + b.x) * 0.5;
      let contactZ = (a.z + b.z) * 0.5;

      for (let oi = 0; oi < 2; oi++) {
        const offA = axleOffsets[oi];
        const ax = a.x + sinA * offA;
        const az = a.z + cosA * offA;

        for (let oj = 0; oj < 2; oj++) {
          const offB = axleOffsets[oj];
          const bx = b.x + sinB * offB;
          const bz = b.z + cosB * offB;

          const dx = bx - ax;
          const dz = bz - az;
          const dSq = dx * dx + dz * dz;
          if (dSq > 0.0004 && dSq < minDistSq) {
            const dist = Math.sqrt(dSq);
            const ov = minDist - dist;
            if (ov > bestOverlap) {
              bestOverlap = ov;
              bestNx = dx / dist;
              bestNz = dz / dist;
              bestOffA = offA;
              bestOffB = offB;
              contactX = (ax + bx) * 0.5;
              contactZ = (az + bz) * 0.5;
            }
          }
        }
      }

      if (bestOverlap > 0) {
        const invMassA = 1 / massA;
        const invMassB = 1 / massB;
        const invMassSum = invMassA + invMassB;

        // 1. Positional separation weighted by inverse mass (heavier cars push lighter cars further)
        const pushFactor = bestOverlap * 0.62;
        a.x -= bestNx * pushFactor * (invMassA / invMassSum);
        a.z -= bestNz * pushFactor * (invMassA / invMassSum);
        b.x += bestNx * pushFactor * (invMassB / invMassSum);
        b.z += bestNz * pushFactor * (invMassB / invMassSum);
        if (getGroundY) {
          a.y = Math.max(a.y, getGroundY(a.x, a.z) + 0.06);
          b.y = Math.max(b.y, getGroundY(b.x, b.z) + 0.06);
        }

        // 2. Relative velocity along collision normal
        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const sepVel = rvx * bestNx + rvz * bestNz;

        if (sepVel < 0.35) {
          const closingSpeed = Math.max(0.8, -sepVel);
          const restitution = 0.34;
          const jImpulse = ((1 + restitution) * closingSpeed) / invMassSum;

          // Linear momentum transfer
          a.vx -= bestNx * jImpulse * invMassA;
          a.vz -= bestNz * jImpulse * invMassA;
          b.vx += bestNx * jImpulse * invMassB;
          b.vz += bestNz * jImpulse * invMassB;

          // Tangential bodywork friction (slight speed loss on side-swipe scraping)
          const tx = -bestNz;
          const tz = bestNx;
          const tanVel = rvx * tx + rvz * tz;
          const frictionImpulse = THREE.MathUtils.clamp(tanVel * 0.14, -4.5, 4.5);
          a.vx += tx * frictionImpulse * (invMassA / invMassSum);
          a.vz += tz * frictionImpulse * (invMassA / invMassSum);
          b.vx -= tx * frictionImpulse * (invMassB / invMassSum);
          b.vz -= tz * frictionImpulse * (invMassB / invMassSum);

          // Update signed forward speed immediately so gearbox & HUD respond instantaneously
          a.speed = a.vx * sinA + a.vz * cosA;
          b.speed = b.vx * sinB + b.vz * cosB;

          // 3. Realistic rotational yaw torque on off-center bumper hits (side-swipe / PIT nudge)
          const leverA = bestOffA * (sinA * bestNz - cosA * bestNx);
          const leverB = bestOffB * (sinB * bestNz - cosB * bestNx);
          const yawKick = Math.min(0.85, closingSpeed * 0.048);
          a.yawRate = THREE.MathUtils.clamp(a.yawRate - Math.sign(leverA || 1) * Math.abs(leverA) * yawKick * 0.45, -1.65, 1.65);
          b.yawRate = THREE.MathUtils.clamp(b.yawRate + Math.sign(leverB || 1) * Math.abs(leverB) * yawKick * 0.45, -1.65, 1.65);

          // 4. Visual chassis jolt (suspension roll & pitch shock)
          const impactNorm = Math.min(1, closingSpeed / 14);
          a.roll = THREE.MathUtils.clamp(a.roll + (bestNx * cosA - bestNz * sinA) * impactNorm * 0.085, -0.11, 0.11);
          b.roll = THREE.MathUtils.clamp(b.roll - (bestNx * cosB - bestNz * sinB) * impactNorm * 0.085, -0.11, 0.11);
          a.pitch = THREE.MathUtils.clamp(a.pitch - (bestNx * sinA + bestNz * cosA) * impactNorm * 0.05, -0.07, 0.07);
          b.pitch = THREE.MathUtils.clamp(b.pitch + (bestNx * sinB + bestNz * cosB) * impactNorm * 0.05, -0.07, 0.07);

          maxImpact = Math.max(maxImpact, impactNorm);
          if (!playerId || a.id === playerId || b.id === playerId) {
            if (impactNorm > playerImpact) {
              playerImpact = impactNorm;
              impactX = contactX;
              impactY = (a.y + b.y) * 0.5 + 0.55;
              impactZ = contactZ;
            }
          }
        }
      }
    }
  }

  return { maxImpact, playerImpact, impactX, impactY, impactZ };
}

/**
 * Real aerodynamic slipstream / drafting multiplier (works for BOTH player and AI cars!).
 * Trailing closely behind a rival at racing speed cuts air resistance and builds a slingshot pass surge.
 */
export function computeSlipstreamFactor(car: PhysicsCar, allCars: PhysicsCar[]): number {
  if (car.eliminated || car.airborne || car.speed < 20) return 1.0;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  let bestDraft = 0;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.eliminated) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 12 || distSq > 784) continue; // 3.5m .. 28m ahead

    const fwd = dx * sinH + dz * cosH;
    if (fwd < 3.5 || fwd > 28) continue;
    const lat = Math.abs(dx * cosH - dz * sinH);
    if (lat > 2.65) continue;

    const fwdFactor = 1 - Math.abs(fwd - 11.5) / 17.5;
    const latFactor = 1 - lat / 2.65;
    const draft = Math.max(0, fwdFactor) * latFactor;
    if (draft > bestDraft) bestDraft = draft;
  }

  return 1.0 + bestDraft * 0.072;
}

export interface AiDriveDecision {
  input: CarInput;
  paceMultiplier: number;
  targetLane: number;
}

export function computeAiInput(
  car: PhysicsCar,
  samples: SplineSample[],
  skill: number, // 0.93 .. 1.08
  preferredLane: number,
  currentLane: number,
  diversions: TrackDiversion[] = [],
  playerCar?: PhysicsCar,
  allCars: PhysicsCar[] = [],
  trackId?: TrackId,
  roadWidth = 16,
  totalLaps = 3,
  isLastManStanding = false,
  raceElapsedMs = 0
): AiDriveDecision {
  const n = samples.length;
  const absSpeed = Math.abs(car.speed);
  const carStats = computeVehicleStats(car.config);
  const carTopMs = carStats.topSpeedKmh / 3.6;

  // Dynamic speed-matched lookahead: tighter in hairpins so AI hugs apexes cleanly, longer on fast straights
  const isTightTrack = trackId === 'gokart-track' || trackId === 'city-track';
  const lookAhead = Math.round(
    (isTightTrack ? 7 : 9) + Math.min(isTightTrack ? 12 : 16, absSpeed * (isTightTrack ? 0.21 : 0.25))
  );
  const targetIdx = (car.sampleIndex + lookAhead) % n;
  const targetSample = samples[targetIdx];
  const nearAheadSample = samples[(car.sampleIndex + Math.max(5, Math.round(lookAhead * 0.65))) % n];
  const midAheadSample = samples[(car.sampleIndex + lookAhead + 7) % n];
  const farAheadSample = samples[(car.sampleIndex + lookAhead + 14) % n];

  const nearCurv = Math.max(samples[car.sampleIndex].curvature, nearAheadSample.curvature, targetSample.curvature);
  const farCurv = Math.max(midAheadSample.curvature, farAheadSample.curvature);
  const effectiveCurv = Math.max(nearCurv, farCurv * 0.86);

  // Safe drivable road half-width (respects City narrow alleys & Go-Kart tire fences)
  let safeHalfWidth = roadWidth * 0.5 - 1.55;
  if (trackId === 'city-track') {
    const cityTight = getCityStreetTightness(targetIdx, n);
    safeHalfWidth = Math.max(2.35, roadWidth * 0.5 - cityTight * 2.85 - 1.35);
  }

  // 1. Dynamic Apex-Seeking Racing Line (dives smoothly to the inside kerb on corners!)
  const sCurr = samples[car.sampleIndex];
  const sCorner = samples[(car.sampleIndex + Math.min(18, lookAhead + 4)) % n];
  // Positive dot with sCurr.right => track bends RIGHT (+s.right); negative => track bends LEFT (-s.right)
  const turnDotRight = sCurr.right.x * sCorner.tangent.x + sCurr.right.z * sCorner.tangent.z;
  let desiredLane = THREE.MathUtils.clamp(preferredLane, -safeHalfWidth, safeHalfWidth);

  if (effectiveCurv > 0.14 && Math.abs(turnDotRight) > 0.04) {
    const insideSign = turnDotRight > 0 ? 1 : -1;
    const apexIntensity = THREE.MathUtils.clamp((effectiveCurv - 0.12) / 0.45, 0, 1);
    const apexLane = insideSign * (safeHalfWidth * 0.82);
    desiredLane = THREE.MathUtils.lerp(desiredLane, apexLane, apexIntensity * 0.82);
  }

  // 2. Active Wheel-to-Wheel Overtaking & Traffic Avoidance
  if (allCars.length > 1) {
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    let nearestBlockerFwd = Infinity;
    let blockerLatOffset = 0;
    let sidePressure = 0;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other.id === car.id || other.eliminated) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 784) continue; // > 28m

      const fwd = dx * sinH + dz * cosH;
      const relLat = dx * cosH - dz * sinH; // + = other car is to our left in car frame

      // Car blocking ahead in our path: actively duck out to overtake!
      if (fwd > 2.2 && fwd < 26 && Math.abs(relLat) < 2.65) {
        if (fwd < nearestBlockerFwd) {
          nearestBlockerFwd = fwd;
          blockerLatOffset = other.lateralOffset;
        }
      } else if (fwd >= -3.5 && fwd <= 4.2 && Math.abs(relLat) < 2.75) {
        // Door-to-door side-by-side battle: hold tight competitive spacing without tangling
        const pushAway = car.lateralOffset >= other.lateralOffset ? 1 : -1;
        sidePressure += pushAway * (2.75 - Math.abs(relLat)) * 0.72;
      }
    }

    if (nearestBlockerFwd < Infinity) {
      // Pick whichever passing lane (left or right of blocker) has more clean asphalt room!
      const spaceRight = safeHalfWidth - blockerLatOffset;
      const spaceLeft = blockerLatOffset + safeHalfWidth;
      const passSign = spaceRight >= spaceLeft ? 1 : -1;
      const passLane = THREE.MathUtils.clamp(
        blockerLatOffset + passSign * 3.15,
        -safeHalfWidth,
        safeHalfWidth
      );
      const urgency = THREE.MathUtils.clamp(1.2 - nearestBlockerFwd / 26, 0.45, 1.0);
      desiredLane = THREE.MathUtils.lerp(desiredLane, passLane, urgency);
    }

    if (Math.abs(sidePressure) > 0.05) {
      desiredLane = THREE.MathUtils.clamp(desiredLane + sidePressure, -safeHalfWidth, safeHalfWidth);
    }
  }

  // 3. Respect Split-Route Diversions (cleanly pick Left or Right bypass branch around center island)
  for (let i = 0; i < diversions.length; i++) {
    const d = diversions[i];
    const inApproach = targetIdx >= d.startIdx - 14 && targetIdx <= d.endIdx + 4;
    if (inApproach) {
      const branchSign = currentLane < d.centerOffset ? -1 : 1;
      const safeLane = d.islandHalfWidth + 3.45;
      desiredLane = d.centerOffset + branchSign * safeLane;
      break;
    }
  }

  // Off-track recovery: pull straight back onto clean asphalt immediately if bumped wide
  if (Math.abs(car.lateralOffset) > safeHalfWidth + 1.4 || (raceElapsedMs > 2400 && absSpeed < 7.5)) {
    desiredLane = THREE.MathUtils.clamp(desiredLane, -safeHalfWidth * 0.55, safeHalfWidth * 0.55);
  }

  // Use smoothly damped lane so overtakes and apex cuts look silky and realistic
  const activeLane = THREE.MathUtils.lerp(currentLane, desiredLane, 0.35);

  const tx = targetSample.pos.x + targetSample.right.x * activeLane;
  const tz = targetSample.pos.z + targetSample.right.z * activeLane;

  const dx = tx - car.x;
  const dz = tz - car.z;
  const desiredHeading = Math.atan2(dx, dz);
  let angleDiff = desiredHeading - car.heading;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const steerGain = isTightTrack ? 3.25 : 2.95;
  const steer = THREE.MathUtils.clamp(-angleDiff * steerGain, -1, 1);

  // 4. Dynamic Competitive Pace & Anti-Blowout Tension (keeps battles thrilling start-to-finish!)
  let paceMultiplier = THREE.MathUtils.clamp(0.95 + (skill - 0.94) * 0.9, 0.94, 1.09);
  let gap = 0;

  if (playerCar) {
    const playerStats = computeVehicleStats(playerCar.config);
    const playerTopMs = playerStats.topSpeedKmh / 3.6;
    // Ensure AI rivals match player's garage upgrades so fast player cars still face fierce competition!
    const speedParity = THREE.MathUtils.clamp(playerTopMs / Math.max(36, carTopMs), 0.96, 1.15);
    paceMultiplier *= speedParity;

    gap = car.totalProgress - playerCar.totalProgress;
    const isFinalLap = car.lap >= totalLaps || playerCar.lap >= totalLaps;
    const contenderWeight = THREE.MathUtils.clamp((skill - 0.91) / 0.14, 0.35, 1.15);

    if (gap < -0.008) {
      // Behind player: relentlessly hunt down the player's bumper & close gaps so every mistake hurts!
      const deficit = Math.min(0.22, -gap);
      const catchBoost = (0.045 + deficit * 0.72) * contenderWeight;
      const finalLapSurge = isFinalLap ? 0.04 : 0;
      paceMultiplier *= 1.0 + Math.min(0.20, catchBoost + finalLapSurge);
    } else if (gap <= 0.045) {
      // Neck-and-neck / battling right ahead of player: stay fiercely competitive so overtaking feels earned!
      const duelBoost = (0.018 + (isFinalLap ? 0.025 : 0)) * contenderWeight;
      paceMultiplier *= 1.0 + duelBoost;
    } else if (gap > 0.065) {
      // Gently cap runaway leads so a single player mistake still allows a dramatic, sweaty comeback!
      const excess = Math.min(0.16, gap - 0.065);
      const easeFactor = isLastManStanding ? 0.38 : 0.48;
      paceMultiplier *= Math.max(0.92, 1.0 - excess * easeFactor);
    }
  }

  paceMultiplier = THREE.MathUtils.clamp(paceMultiplier, 0.90, 1.24);

  // 5. Realistic High-Speed Cornering Curve (NO MORE 72 km/h braking on medium bends!)
  const effectiveTopMs = carTopMs * paceMultiplier;
  let cornerSpeedRatio = 1.16; // Flat-out on straights & gentle sweepers (effectiveCurv <= 0.22)
  if (effectiveCurv > 0.22) {
    // Smooth high-speed curve:
    // curv 0.35 -> ~96% top speed | curv 0.55 -> ~82% top speed | curv 0.85 -> ~67% top speed | curv 1.20 -> ~56%
    const t = THREE.MathUtils.clamp((effectiveCurv - 0.22) / 0.98, 0, 1);
    const minCornerFrac = isTightTrack ? 0.54 : 0.60;
    cornerSpeedRatio = THREE.MathUtils.lerp(1.04, minCornerFrac, Math.pow(t, 0.85));
  }
  const desiredSpeed = Math.max(25, effectiveTopMs * cornerSpeedRatio);

  let throttle = 1.0;
  let brake = 0;
  if (car.speed < desiredSpeed) {
    // Stay flat-out all the way up to desired corner speed — zero lazy coasting!
    throttle = 1.0;
  } else if (car.speed > desiredSpeed + 3.2) {
    // Crisp trail-braking ONLY when genuinely entering a sharp hairpin too hot
    const overSpeed = car.speed - desiredSpeed;
    brake = THREE.MathUtils.clamp(overSpeed * 0.085, 0.16, 0.78);
    // Keep partial throttle if trail-braking through a drift corner so exit launch is instant!
    throttle = Math.abs(steer) > 0.32 ? 0.35 : 0.0;
  } else {
    throttle = 0.88;
  }

  // 6. Aggressive Tactical Nitro (straights, corner-exit launches, overtakes & final-lap sprints!)
  const alignedForBoost = nearCurv < 0.24 && Math.abs(angleDiff) < 0.20 && car.speed > 18;
  const inCloseDuel = playerCar ? Math.abs(gap) < 0.05 : false;
  const chasingPlayer = playerCar ? gap < 0.008 : false;
  const isFinalLapSprint = car.lap >= totalLaps;
  const wantsExitBurst = car.speed < effectiveTopMs * 0.84 && car.nitroEnergy > 36;
  const wantsDuelBurst = (chasingPlayer || inCloseDuel || isFinalLapSprint) && car.nitroEnergy > 22;
  const wantsStraightBurst = effectiveCurv < 0.12 && car.nitroEnergy > 45;

  const nitro = alignedForBoost && (wantsDuelBurst || wantsExitBurst || wantsStraightBurst);

  return {
    input: { throttle, brake, steer, handbrake: false, nitro },
    paceMultiplier,
    targetLane: desiredLane,
  };
}
