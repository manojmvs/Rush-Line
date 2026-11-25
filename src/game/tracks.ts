import * as THREE from 'three';
import type { TimeOfDay, TrackId } from '../types/game.ts';

export interface SplineSample {
  t: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  curvature: number;
}

export interface TrackRamp {
  startIdx: number;
  endIdx: number;
  crestU: number; // normalized 0..1 crest location along [startIdx..endIdx]
  latMin: number; // left/inner lateral bound (m)
  latMax: number; // right/outer lateral bound (m)
  fullWidth: boolean; // true = entire road + kerbs + dirt banks rise seamlessly together
  height: number; // peak vertical rise above base track spline (m)
  lengthMeters: number; // physical arc length of the sculpted jump mound (m)
}

export interface RampEvalResult {
  onRamp: boolean;
  onLaunchFace: boolean;
  extraY: number;
  slopeY: number;
  progress: number;
  crestU: number;
}

/**
 * Shared C1-continuous sculpted rally jump height & slope evaluator.
 * Used by BOTH the 3D road/kerb/shoulder/apron vertex sculptor AND car physics
 * so the visual road-blended jump mound and car wheel contact match 100% identically.
 */
export function evaluateTrackRampAt(
  sampleFloatIdx: number,
  lateral: number,
  sampleCount: number,
  ramps: TrackRamp[],
  halfRoad: number,
  kerbWidth: number,
  barrierOffset: number
): RampEvalResult {
  let idx = sampleFloatIdx % sampleCount;
  if (idx < 0) idx += sampleCount;

  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    const span = r.endIdx - r.startIdx;
    if (span <= 0) continue;
    if (idx < r.startIdx || idx > r.endIdx) continue;

    let latFactor = 0;
    if (r.fullWidth) {
      const absLat = Math.abs(lateral);
      const deckOuter = halfRoad + kerbWidth;
      const bankOuter = Math.max(deckOuter + 0.6, barrierOffset - 0.15);
      if (absLat <= deckOuter) {
        latFactor = 1.0;
      } else if (absLat < bankOuter) {
        const t = 1 - (absLat - deckOuter) / Math.max(0.5, bankOuter - deckOuter);
        latFactor = t * t * (3 - 2 * t);
      }
    } else {
      // Split-diversion single-lane sculpted jump: strictly 0 outside [latMin..latMax]
      // so the central divider island is NEVER penetrated!
      if (lateral <= r.latMin || lateral >= r.latMax) continue;
      const edgeMargin = Math.min(1.25, (r.latMax - r.latMin) * 0.22);
      if (lateral < r.latMin + edgeMargin) {
        const t = (lateral - r.latMin) / edgeMargin;
        latFactor = t * t * (3 - 2 * t);
      } else if (lateral > r.latMax - edgeMargin) {
        const t = (r.latMax - lateral) / edgeMargin;
        latFactor = t * t * (3 - 2 * t);
      } else {
        latFactor = 1.0;
      }
    }

    if (latFactor <= 0.0001) continue;

    const u = (idx - r.startIdx) / span;
    let hNorm = 0;
    let dhDu = 0;
    const onLaunchFace = u <= r.crestU;

    if (onLaunchFace) {
      // Smooth C1 tangent entry (dh/dt=0 at t=0) curving upward into a crisp rally launch lip at t=1!
      const t = u / r.crestU;
      hNorm = t * t * (2.1 - 1.1 * t);
      dhDu = (t * (4.2 - 3.3 * t)) / r.crestU;
    } else {
      // Smooth sculpted earthen back-slope descending flush back into the road surface at u=1
      const d = (u - r.crestU) / Math.max(0.01, 1 - r.crestU);
      const omd = 1 - d;
      hNorm = omd * omd * (1 + 2 * d);
      dhDu = (-6 * d * omd) / Math.max(0.01, 1 - r.crestU);
    }

    const extraY = r.height * hNorm * latFactor;
    const slopeY = (r.height / Math.max(4, r.lengthMeters)) * dhDu * latFactor;

    return {
      onRamp: extraY > 0.01,
      onLaunchFace: onLaunchFace && latFactor > 0.35,
      extraY,
      slopeY,
      progress: u,
      crestU: r.crestU,
    };
  }

  return {
    onRamp: false,
    onLaunchFace: false,
    extraY: 0,
    slopeY: 0,
    progress: 0,
    crestU: 0.72,
  };
}

/**
 * Smooth 0..1 tightness factor for City Track's two thrilling narrow small-street / old-town alley sections.
 * Shared identically by 3D variable-width road/sidewalk geometry and car/AI physics.
 */
export function getCityStreetTightness(sampleIdx: number, totalSamples: number): number {
  const idx = ((sampleIdx % totalSamples) + totalSamples) % totalSamples;
  const zones: Array<[number, number]> = [
    [152, 248], // Market Lane / Midtown Narrow Side-Street S-bend
    [354, 430], // Old Town Back-Alley / Cafe Street
  ];
  const blend = 14;
  let t = 0;
  for (let i = 0; i < zones.length; i++) {
    const start = zones[i][0];
    const end = zones[i][1];
    if (idx >= start - blend && idx <= end + blend) {
      let local = 1;
      if (idx < start) {
        const u = (idx - (start - blend)) / blend;
        local = u * u * (3 - 2 * u);
      } else if (idx > end) {
        const u = (end + blend - idx) / blend;
        local = u * u * (3 - 2 * u);
      }
      if (local > t) t = local;
    }
  }
  return t;
}

export interface TrackDiversion {
  startIdx: number;
  endIdx: number;
  centerOffset: number;
  islandHalfWidth: number;
  extraOuterWidth: number;
  rampSide?: -1 | 1;
  labelLeft: string;
  labelRight: string;
}

export interface TrackPoleCollider {
  x: number;
  z: number;
  radius: number;
  sampleIdx: number;
  breakableId?: number;
}

export interface TrackBoxCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  cosYaw: number;
  sinYaw: number;
  sampleIdx: number;
  breakableId?: number;
}

export interface BreakablePart {
  mesh: THREE.InstancedMesh;
  instanceId: number;
  localMatrix: THREE.Matrix4;
}

export interface BreakableProp {
  id: number;
  kind: 'pole' | 'bollard' | 'fence' | 'sign' | 'umbrella' | 'tree' | 'bench' | 'pot' | 'tyre';
  x: number;
  y: number;
  z: number;
  groundY: number;
  parts: BreakablePart[];
  knocked: boolean;
  settled: boolean;
  posX: number;
  posY: number;
  posZ: number;
  vx: number;
  vy: number;
  vz: number;
  fallDirX: number;
  fallDirZ: number;
  tiltAngle: number;
  tiltVel: number;
  spinAngle: number;
  spinVel: number;
  bounceCount: number;
  // Optional metadata for reactive Go-Kart tyre-barrier stacks
  sampleIdx?: number;
  tier?: number;
  side?: number;
  baseGroundY?: number;
  hitCooldown?: number;
}

export interface BuiltTrack {
  id: TrackId;
  timeOfDay: TimeOfDay;
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  samples: SplineSample[];
  ramps: TrackRamp[];
  diversions: TrackDiversion[];
  poleColliders: TrackPoleCollider[];
  boxColliders: TrackBoxCollider[];
  breakables: BreakableProp[];
  roadWidth: number;
  kerbWidth: number;
  barrierOffset: number;
  length: number;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  minimapPoints: Array<{ x: number; z: number }>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  getGroundY: (x: number, z: number) => number;
  roadMaterial: THREE.MeshStandardMaterial;
  dispose: () => void;
}

// Reusable scratch objects for zero-GC 60fps knock-down prop physics
const _kbAxis = new THREE.Vector3();
const _kbUp = new THREE.Vector3(0, 1, 0);
const _kbQFall = new THREE.Quaternion();
const _kbQSpin = new THREE.Quaternion();
const _kbQTotal = new THREE.Quaternion();
const _kbPivotMat = new THREE.Matrix4();
const _kbFinalMat = new THREE.Matrix4();
const _kbPos = new THREE.Vector3();
const _kbScale = new THREE.Vector3(1, 1, 1);
const _dirtyBreakableMeshes = new Set<THREE.InstancedMesh>();

/**
 * Triggers a speed-based knock-down on a roadside pole, bollard, fence, sign, or umbrella.
 * Low speed gently topples it onto the road; high speed launches & tumbles it down the street!
 */
export function knockBreakableProp(
  prop: BreakableProp,
  carVx: number,
  carVz: number,
  carX: number,
  carZ: number
): void {
  if (prop.knocked) return;
  prop.knocked = true;
  prop.settled = false;
  prop.bounceCount = 0;

  const hitSpeed = Math.hypot(carVx, carVz);
  const toPropX = prop.x - carX;
  const toPropZ = prop.z - carZ;
  const toPropLen = Math.hypot(toPropX, toPropZ) || 1;
  const pushX = toPropX / toPropLen;
  const pushZ = toPropZ / toPropLen;

  // Blend 76% car travel vector + 24% contact push vector so poles fall naturally ahead & onto the road
  let dirX = pushX;
  let dirZ = pushZ;
  if (hitSpeed > 1.2) {
    dirX = (carVx / hitSpeed) * 0.76 + pushX * 0.24;
    dirZ = (carVz / hitSpeed) * 0.76 + pushZ * 0.24;
    const dLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dLen;
    dirZ /= dLen;
  }

  prop.fallDirX = dirX;
  prop.fallDirZ = dirZ;

  const speedNorm = THREE.MathUtils.clamp((hitSpeed - 3) / 42, 0, 1);
  const isLight =
    prop.kind === 'bollard' ||
    prop.kind === 'umbrella' ||
    prop.kind === 'sign' ||
    prop.kind === 'pot';
  const isBench = prop.kind === 'bench';
  const isFence = prop.kind === 'fence';
  const isTree = prop.kind === 'tree';
  const massScale = isLight ? 1.2 : isBench ? 1.04 : isFence ? 0.92 : isTree ? 0.72 : 0.85;

  // Slow hit -> topples forward where it stands; Fast hit -> launches & tumbles across the road!
  const fwdLaunch =
    hitSpeed < 9
      ? hitSpeed * 0.24 * massScale
      : Math.min(27, hitSpeed * (0.36 + speedNorm * 0.24) * massScale);
  prop.vx = dirX * fwdLaunch;
  prop.vz = dirZ * fwdLaunch;
  prop.vy = (0.75 + speedNorm * (isLight ? 5.6 : isTree ? 3.2 : 4.2)) * massScale;

  // Angular fall velocity scales strongly with hit speed
  prop.tiltAngle = 0.08;
  prop.tiltVel = (2.6 + speedNorm * (isTree ? 6.2 : 7.8)) * massScale;

  // Side-swipe spin around vertical axis
  const cross = pushX * dirZ - pushZ * dirX;
  const spinSign = cross >= 0 ? 1 : -1;
  prop.spinVel = spinSign * (0.45 + speedNorm * (isLight ? 4.4 : isTree ? 1.9 : 2.6));
}

/**
 * Triggers realistic rubber-barrier movement on Go-Kart tyre stacks near a car impact point.
 * Light scrapes make stacks shift/wobble outward; medium-hard crashes pop upper tyres off
 * the stack to bounce, roll, and scatter realistically while lower tyres recoil outward!
 */
export function impactNearbyTyres(
  breakables: BreakableProp[],
  sampleIdx: number,
  sampleCount: number,
  hitX: number,
  hitZ: number,
  carVx: number,
  carVz: number,
  outwardX: number,
  outwardZ: number,
  hitStrength: number
): void {
  if (breakables.length === 0) return;

  const clampedStrength = THREE.MathUtils.clamp(hitStrength, 0.08, 1.0);
  const impactRadius = 3.1 + clampedStrength * 2.5;
  const impactRadiusSq = impactRadius * impactRadius;
  const carSpeed = Math.hypot(carVx, carVz);
  const carDirX = carSpeed > 0.8 ? carVx / carSpeed : outwardX;
  const carDirZ = carSpeed > 0.8 ? carVz / carSpeed : outwardZ;
  const halfSamples = sampleCount * 0.5;

  for (let i = 0; i < breakables.length; i++) {
    const p = breakables[i];
    if (p.kind !== 'tyre') continue;
    if ((p.hitCooldown ?? 0) > 0) continue;

    // O(1) spline-window filter so we only inspect tyres right beside the collision
    if (p.sampleIdx !== undefined) {
      let idxDiff = Math.abs(p.sampleIdx - sampleIdx);
      if (idxDiff > halfSamples) idxDiff = sampleCount - idxDiff;
      if (idxDiff > 22) continue;
    }

    const dx = p.posX - hitX;
    const dz = p.posZ - hitZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > impactRadiusSq) continue;

    const dist = Math.sqrt(distSq) || 0.01;
    const prox = Math.pow(1 - dist / impactRadius, 1.2);
    const localForce = clampedStrength * prox;
    if (localForce < 0.035) continue;

    const tier = p.tier ?? 0;
    const radX = dx / dist;
    const radZ = dz / dist;

    // Blend outward barrier normal (52%), radial push away from car (28%), and glancing car momentum (20%)
    let dirX = outwardX * 0.52 + radX * 0.28 + carDirX * 0.20;
    let dirZ = outwardZ * 0.52 + radZ * 0.28 + carDirZ * 0.20;
    const dLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dLen;
    dirZ /= dLen;

    // Deterministic per-tyre slight scatter jitter so neighboring tyres separate naturally
    const jitterHash = Math.sin(p.id * 19.37 + hitX * 0.7 + hitZ * 0.5) * 43758.5453;
    const jitter = (jitterHash - Math.floor(jitterHash) - 0.5) * 0.34;
    const cosJ = Math.cos(jitter);
    const sinJ = Math.sin(jitter);
    const pushX = dirX * cosJ - dirZ * sinJ;
    const pushZ = dirX * sinJ + dirZ * cosJ;

    p.knocked = true;
    p.settled = false;
    p.bounceCount = 0;
    p.hitCooldown = 0.16;
    p.fallDirX = pushX;
    p.fallDirZ = pushZ;

    // Tier-aware rubber impulse: upper tyres detach & fly/bounce easily; bottom tyres anchor & recoil outward
    const tierBoost = tier === 0 ? 0.58 : tier === 1 ? 1.15 : 1.48;
    const horizSpeed = (1.6 + localForce * 14.5 + Math.min(6.5, carSpeed * 0.14)) * tierBoost;

    p.vx = p.vx * 0.35 + pushX * horizSpeed;
    p.vz = p.vz * 0.35 + pushZ * horizSpeed;

    if (tier >= 1) {
      // Upper tyres hop off the stack and bounce rubberily on medium/hard impacts
      const popUp = (0.9 + localForce * 6.8 + tier * 0.85) * (localForce > 0.18 ? 1.0 : 0.45);
      p.vy = Math.max(p.vy, popUp);
      p.tiltVel += (2.4 + localForce * 10.5) * (jitter >= 0 ? 1 : -1);
      p.spinVel += (jitter >= 0 ? 1 : -1) * (1.8 + localForce * 6.5);
    } else {
      // Bottom tyres recoil outward and wobble; only hop & tumble on hard direct hits
      const popUp = localForce > 0.36 ? (localForce - 0.28) * 5.2 : 0.25 + localForce * 1.4;
      p.vy = Math.max(p.vy, popUp);
      p.tiltVel += (1.1 + localForce * 4.8) * (jitter >= 0 ? 1 : -1);
      p.spinVel += (jitter >= 0 ? 1 : -1) * (0.8 + localForce * 3.4);
    }
  }
}

/**
 * Steps active falling/tumbling poles, fences & reactive Go-Kart tyres each frame,
 * updating ONLY moved InstancedMesh entries with zero per-frame allocations.
 */
export function stepBreakables(breakables: BreakableProp[], dt: number): void {
  if (breakables.length === 0) return;
  _dirtyBreakableMeshes.clear();

  const GRAVITY = 18.8;
  const HALF_PI = Math.PI * 0.5;

  for (let i = 0; i < breakables.length; i++) {
    const p = breakables[i];
    if ((p.hitCooldown ?? 0) > 0) {
      p.hitCooldown = Math.max(0, (p.hitCooldown ?? 0) - dt);
    }
    if (!p.knocked || p.settled) continue;

    // Dedicated realistic rubber-tyre physics for Go-Kart track tyre barriers!
    if (p.kind === 'tyre') {
      p.posX += p.vx * dt;
      p.posZ += p.vz * dt;
      p.vy -= GRAVITY * dt;
      p.posY += p.vy * dt;

      // Upper tyres stay supported by the stack below until displaced >0.44m off their stack center!
      const horizDisp = Math.hypot(p.posX - p.x, p.posZ - p.z);
      const tier = p.tier ?? 0;
      const baseGround = p.baseGroundY ?? p.groundY;
      const onStackSupport = tier > 0 && horizDisp < 0.44;
      const effectiveGroundY = onStackSupport ? baseGround + tier * 0.415 : baseGround;

      // Exact torus clearance height: 0.21m when flat on sidewall, 0.63m when rolling upright on tread!
      const tyreSupportOffset = 0.21 + 0.42 * Math.abs(Math.sin(p.tiltAngle));
      const restY = effectiveGroundY + tyreSupportOffset;

      if (p.posY <= restY) {
        p.posY = restY;
        if (p.vy < -1.15 && p.bounceCount < 4) {
          // Lively vulcanized-rubber bounce restitution!
          p.vy = -p.vy * 0.52;
          p.vx *= 0.76;
          p.vz *= 0.76;
          p.tiltVel *= 0.78;
          p.spinVel *= 0.72;
          p.bounceCount++;
        } else {
          p.vy = 0;
          // Rolling tyres lose speed more gradually than flat-sliding tyres
          const isRolling = Math.abs(Math.sin(p.tiltAngle)) > 0.65;
          const drag = Math.exp((isRolling ? -2.2 : -4.2) * dt);
          p.vx *= drag;
          p.vz *= drag;
          p.spinVel *= Math.exp(-3.8 * dt);
        }
      }

      // Natural tyre wobble & flop-flat settling torque on ground contact
      const onGround = p.posY <= restY + 0.035;
      if (onGround) {
        const nearestFlat = Math.round(p.tiltAngle / Math.PI) * Math.PI;
        const flatError = nearestFlat - p.tiltAngle;
        // Gravity gently pulls tilted tyres back onto their flat rubber sidewall with damped wobble
        p.tiltVel += flatError * 14.5 * dt;
        p.tiltVel *= Math.exp(-3.6 * dt);
      } else {
        p.tiltVel *= Math.exp(-0.75 * dt);
      }
      p.tiltAngle += p.tiltVel * dt;
      p.spinAngle += p.spinVel * dt;

      // Compose world transform around tyre center
      _kbAxis.set(p.fallDirZ, 0, -p.fallDirX).normalize();
      _kbQFall.setFromAxisAngle(_kbAxis, p.tiltAngle);
      _kbQSpin.setFromAxisAngle(_kbUp, p.spinAngle);
      _kbQTotal.copy(_kbQFall).multiply(_kbQSpin);
      _kbPos.set(p.posX, p.posY, p.posZ);
      _kbPivotMat.compose(_kbPos, _kbQTotal, _kbScale);

      for (let j = 0; j < p.parts.length; j++) {
        const part = p.parts[j];
        _kbFinalMat.multiplyMatrices(_kbPivotMat, part.localMatrix);
        part.mesh.setMatrixAt(part.instanceId, _kbFinalMat);
        _dirtyBreakableMeshes.add(part.mesh);
      }

      const nearestFlat = Math.round(p.tiltAngle / Math.PI) * Math.PI;
      if (
        p.posY <= restY + 0.015 &&
        Math.abs(p.vy) < 0.05 &&
        Math.hypot(p.vx, p.vz) < 0.08 &&
        Math.abs(p.tiltAngle - nearestFlat) < 0.025 &&
        Math.abs(p.tiltVel) < 0.08 &&
        Math.abs(p.spinVel) < 0.08
      ) {
        p.tiltAngle = nearestFlat;
        p.tiltVel = 0;
        p.vx = 0;
        p.vz = 0;
        p.vy = 0;
        p.settled = true;
      }
      continue;
    }

    // 1. Parabolic translational flight + road surface bounce & skid friction
    p.posX += p.vx * dt;
    p.posZ += p.vz * dt;
    p.vy -= GRAVITY * dt;
    p.posY += p.vy * dt;

    const restY =
      p.groundY +
      (p.kind === 'tree'
        ? 0.42
        : p.kind === 'pot'
        ? 0.28
        : p.kind === 'bench'
        ? 0.24
        : p.kind === 'fence'
        ? 0.14
        : 0.18);
    if (p.posY <= restY) {
      p.posY = restY;
      if (p.vy < -1.45 && p.bounceCount < 2) {
        p.vy = -p.vy * 0.3;
        p.vx *= 0.68;
        p.vz *= 0.68;
        p.spinVel *= 0.62;
        p.bounceCount++;
      } else {
        p.vy = 0;
        const drag = Math.exp(-5.0 * dt);
        p.vx *= drag;
        p.vz *= drag;
        p.spinVel *= Math.exp(-5.6 * dt);
      }
    }

    // 2. Gravity-assisted topple onto the road (0 -> PI/2) with crisp road-slap bounce!
    if (p.tiltAngle < HALF_PI || Math.abs(p.tiltVel) > 0.05) {
      p.tiltVel += Math.sin(Math.min(HALF_PI, p.tiltAngle)) * 15.0 * dt;
      p.tiltAngle += p.tiltVel * dt;
      if (p.tiltAngle >= HALF_PI) {
        p.tiltAngle = HALF_PI;
        if (p.tiltVel > 1.35) {
          p.tiltVel = -p.tiltVel * 0.25;
        } else {
          p.tiltVel = 0;
        }
      } else if (p.tiltAngle < 0.05) {
        p.tiltAngle = 0.05;
        p.tiltVel = Math.abs(p.tiltVel) * 0.4;
      }
    }

    p.spinAngle += p.spinVel * dt;

    // 3. Compose pivot world transform: T(pos) * R_fall(axis = up x fallDir) * R_y(spin)
    _kbAxis.set(p.fallDirZ, 0, -p.fallDirX).normalize();
    _kbQFall.setFromAxisAngle(_kbAxis, p.tiltAngle);
    _kbQSpin.setFromAxisAngle(_kbUp, p.spinAngle);
    _kbQTotal.copy(_kbQFall).multiply(_kbQSpin);
    _kbPos.set(p.posX, p.posY, p.posZ);
    _kbPivotMat.compose(_kbPos, _kbQTotal, _kbScale);

    for (let j = 0; j < p.parts.length; j++) {
      const part = p.parts[j];
      _kbFinalMat.multiplyMatrices(_kbPivotMat, part.localMatrix);
      part.mesh.setMatrixAt(part.instanceId, _kbFinalMat);
      _dirtyBreakableMeshes.add(part.mesh);
    }

    // Mark settled once resting flat & stationary on the road (0 CPU/GPU cost thereafter!)
    if (
      p.posY <= restY + 0.01 &&
      Math.abs(p.vy) < 0.04 &&
      Math.hypot(p.vx, p.vz) < 0.1 &&
      Math.abs(p.tiltAngle - HALF_PI) < 0.015 &&
      Math.abs(p.tiltVel) < 0.05 &&
      Math.abs(p.spinVel) < 0.05
    ) {
      p.settled = true;
    }
  }

  _dirtyBreakableMeshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

const TRACK_CONTROL_POINTS: Record<TrackId, Array<[number, number, number]>> = {
  // 1. Off-Road Track: Dramatic rally hills, sweeping drift hairpins, split diversions & big jump straightaways
  'offroad-track': [
    [0, 0, 0],
    [0, 0.8, -104],
    [32, 11.5, -186],
    [102, 2.2, -248],
    [194, 17.5, -244],
    [258, 5.2, -168],
    [186, 15.5, -104],
    [98, 3.2, -124],
    [68, 13.5, -36],
    [164, 2.0, 26],
    [244, 14.5, 112],
    [186, 3.2, 212],
    [82, 10.5, 228],
    [12, 1.8, 158],
    [-4, 0, 82],
  ],
  // 2. Hill Track: Steep alpine mountain climb, summit ridge switchbacks & exhilarating downhill drift hairpins
  'hill-track': [
    [0, 0, 0],
    [0, 4.2, -122],
    [46, 15.5, -218],
    [142, 26.5, -258],
    [244, 36.0, -208],
    [268, 39.0, -108],
    [166, 29.5, -70],
    [104, 21.5, -6],
    [212, 27.5, 64],
    [264, 16.5, 162],
    [192, 9.2, 238],
    [84, 14.2, 214],
    [20, 4.5, 152],
    [-6, 0, 78],
  ],
  // 3. City Track: Fast metropolitan avenues weaving into tight Old-Town small streets, chicanes & 90° drift turns
  'city-track': [
    [0, 0, 0],
    [0, 0, -155],
    [32, 0, -238],
    [138, 0, -248],
    [222, 0, -202],
    [230, 0, -112],
    [138, 0, -78],
    [146, 0, 20],
    [234, 0, 62],
    [228, 0, 176],
    [150, 0, 214],
    [76, 0, 178],
    [10, 0, 146],
    [-4, 0, 72],
  ],
  // 4. Riverside Track: Sweeping scenic riverbank road with rapid S-bends & drift sweepers
  'riverside-track': [
    [0, 0, 0],
    [0, 0.5, -135],
    [38, 2.2, -232],
    [134, 3.8, -270],
    [238, 2.6, -225],
    [278, 1.0, -132],
    [230, 0.5, -44],
    [176, 1.8, 34],
    [234, 1.5, 130],
    [178, 0.8, 218],
    [82, 0.5, 234],
    [14, 0.2, 168],
    [-6, 0, 88],
  ],
  // 5. Stadium Track: Wide floodlit arena bowl with high-speed sweepers & sharp technical infield chicane
  'stadium-track': [
    [0, 0, 0],
    [0, 0, -116],
    [34, 0, -184],
    [120, 0, -198],
    [202, 0, -152],
    [210, 0, -70],
    [140, 0, -24],
    [200, 0, 48],
    [176, 0, 138],
    [98, 0, 170],
    [24, 0, 134],
    [-4, 0, 68],
  ],
  // 6. Racing Track: High-speed Grand Prix circuit with heavy braking hairpins, S-curves & long main straight
  'racing-track': [
    [0, 0, 0],
    [0, 0, -146],
    [24, 1.6, -248],
    [108, 3.8, -288],
    [212, 2.2, -254],
    [262, 0.5, -182],
    [206, 0, -108],
    [126, 1.6, -72],
    [192, 2.6, 12],
    [246, 1.0, 114],
    [196, 0, 204],
    [94, 0, 228],
    [14, 0, 175],
    [-8, 0, 95],
  ],
  // 7. Go-Kart Track: Curve-packed technical karting arena with 12+ flowing hairpins, S-curves & chained drift zones
  'gokart-track': [
    // Dead-straight Start/Finish launch zone
    [0, 0, 0],
    [0, 0, -76],
    // T1-T3: Sweeping North-West Drift S-Curve
    [44, 0, -142],
    [108, 0, -134],
    [158, 0, -190],
    // T4-T5: Wide North Drift Hairpin Bowl
    [230, 0, -198],
    [276, 0, -142],
    [236, 0, -82],
    // T6-T8: Flowing East Drift Esses (Right -> Left -> Right)
    [284, 0, -22],
    [270, 0, 48],
    [198, 0, 62],
    // T9-T11: Infield Technical Switchback Hairpin
    [162, 0, -10],
    [98, 0, -18],
    [90, 0, 56],
    // T12-T14: South-East Wide Drift Carousel & Hairpin
    [168, 0, 112],
    [172, 0, 184],
    [102, 0, 204],
    // T15-T17: South Drift Chicane & Sweeping Final Turn onto Straight
    [50, 0, 154],
    [-18, 0, 174],
    [-62, 0, 124],
    [-38, 0, 66],
    [0, 0, 42],
  ],
};

function createRoadSurfaceTexture(
  trackId: TrackId,
  maxAniso: number,
  timeOfDay: TimeOfDay
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const isNight = timeOfDay === 'night';
  const isEvening = timeOfDay === 'evening';

  if (trackId === 'offroad-track') {
    // Stylized sunlit sandy-tan rally dirt with sculpted dark-brown tire ruts (matches reference art)
    ctx.fillStyle = isNight ? '#5c4936' : isEvening ? '#be976c' : '#cfb186';
    ctx.fillRect(0, 0, 512, 512);

    // Soft longitudinal sand-blended streaks along the road
    for (let i = 0; i < 42; i++) {
      const x = Math.random() * 512;
      const w = 10 + Math.random() * 26;
      ctx.fillStyle =
        i % 2 === 0
          ? isNight
            ? 'rgba(116, 92, 66, 0.16)'
            : 'rgba(232, 208, 174, 0.24)'
          : isNight
          ? 'rgba(54, 40, 26, 0.22)'
          : 'rgba(148, 112, 76, 0.20)';
      ctx.fillRect(x, 0, w, 512);
    }

    // Crisp dark twin rally tire-rut grooves (left & right pair, matching reference)
    const drawRut = (cx: number, width: number, alpha: number) => {
      const g = ctx.createLinearGradient(cx - width, 0, cx + width, 0);
      g.addColorStop(0, 'rgba(92, 68, 44, 0)');
      g.addColorStop(0.5, isNight ? `rgba(38, 27, 17, ${alpha})` : `rgba(114, 86, 58, ${alpha})`);
      g.addColorStop(1, 'rgba(92, 68, 44, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - width, 0, width * 2, 512);
    };
    drawRut(126, 48, 0.56);
    drawRut(196, 30, 0.34);
    drawRut(316, 30, 0.34);
    drawRut(386, 48, 0.56);

    // Fine pebble & sand grain speckle
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random();
      ctx.fillStyle =
        r < 0.45
          ? 'rgba(112, 84, 54, 0.26)'
          : r < 0.85
          ? 'rgba(242, 224, 196, 0.26)'
          : 'rgba(84, 62, 42, 0.32)';
      ctx.fillRect(x, y, 3, 3);
    }

    // Soft dusty track edges
    const leftEdge = ctx.createLinearGradient(0, 0, 36, 0);
    leftEdge.addColorStop(0, isNight ? 'rgba(62, 48, 34, 0.72)' : 'rgba(154, 122, 84, 0.65)');
    leftEdge.addColorStop(1, 'rgba(154, 122, 84, 0)');
    ctx.fillStyle = leftEdge;
    ctx.fillRect(0, 0, 36, 512);

    const rightEdge = ctx.createLinearGradient(476, 0, 512, 0);
    rightEdge.addColorStop(0, 'rgba(154, 122, 84, 0)');
    rightEdge.addColorStop(1, isNight ? 'rgba(62, 48, 34, 0.72)' : 'rgba(154, 122, 84, 0.65)');
    ctx.fillStyle = rightEdge;
    ctx.fillRect(476, 0, 36, 512);
  } else if (trackId === 'city-track') {
    // Authentic Italian Sampietrini Cobblestone & Roman Basalt Street Pavement
    ctx.fillStyle = isNight ? '#2a2b30' : isEvening ? '#4e4844' : '#585552';
    ctx.fillRect(0, 0, 512, 512);

    // Interlocking staggered basalt cobblestone courses (sampietrini)
    const stoneH = 16;
    const stoneW = 24;
    for (let row = 0; row < 512 / stoneH; row++) {
      const y = row * stoneH;
      const offset = (row % 2) * (stoneW * 0.5);
      for (let col = -1; col <= 512 / stoneW + 1; col++) {
        const x = col * stoneW + offset;
        const hash = Math.abs(Math.sin(row * 19.3 + col * 37.7) * 43758.5453) % 1;
        const base = isNight ? 38 + Math.floor(hash * 24) : isEvening ? 74 + Math.floor(hash * 32) : 84 + Math.floor(hash * 34);
        const warmR = isEvening ? 10 : isNight ? 2 : 5;
        const warmG = isEvening ? 5 : isNight ? 2 : 3;
        ctx.fillStyle = `rgb(${base + warmR},${base + warmG},${base})`;
        ctx.fillRect(x + 1.5, y + 1.5, stoneW - 3, stoneH - 3);
        // Subtle sunlit top bevel on each stone block
        ctx.fillStyle = isNight ? 'rgba(255,220,170,0.06)' : 'rgba(255,244,225,0.12)';
        ctx.fillRect(x + 2, y + 2, stoneW - 4, 2);
      }
    }

    // Pale Roman travertine stone drainage gutters lining both outer road borders
    ctx.fillStyle = isNight ? '#57534e' : isEvening ? '#b8a996' : '#c8bca9';
    ctx.fillRect(0, 0, 24, 512);
    ctx.fillRect(488, 0, 24, 512);
    ctx.fillStyle = isNight ? 'rgba(15,18,24,0.45)' : 'rgba(68,60,52,0.35)';
    for (let y = 0; y < 512; y += 32) {
      ctx.fillRect(0, y, 24, 2);
      ctx.fillRect(488, y, 24, 2);
    }

    // Warm golden Italian streetlamp / sunset sheen down the worn cobblestone tire tracks
    const warmSheen = ctx.createLinearGradient(110, 0, 402, 0);
    warmSheen.addColorStop(0, 'rgba(255, 200, 120, 0)');
    warmSheen.addColorStop(0.5, isNight ? 'rgba(255, 195, 110, 0.12)' : isEvening ? 'rgba(255, 185, 105, 0.14)' : 'rgba(255, 246, 224, 0.08)');
    warmSheen.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = warmSheen;
    ctx.fillRect(110, 0, 292, 512);

    // Classic subtle European white dashed center lane guide & border stripe
    ctx.fillStyle = 'rgba(248, 245, 238, 0.65)';
    ctx.fillRect(24, 0, 5, 512);
    ctx.fillRect(483, 0, 5, 512);
    ctx.fillStyle = 'rgba(248, 244, 234, 0.62)';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(253, y + 10, 6, 28);
    }
  } else {
    // Motorsport tarmac (Racing Track, Stadium, Hill, Riverside & Go-Kart Track)
    ctx.fillStyle =
      trackId === 'gokart-track'
        ? isNight
          ? '#1e2430'
          : '#343b47'
        : isNight
        ? '#1b202a'
        : '#2e3440';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = Math.floor(36 + Math.random() * 38);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Rubbered twin racing grooves
    const gradLeft = ctx.createLinearGradient(105, 0, 215, 0);
    gradLeft.addColorStop(0, 'rgba(12,14,18,0)');
    gradLeft.addColorStop(0.5, 'rgba(12,14,18,0.34)');
    gradLeft.addColorStop(1, 'rgba(12,14,18,0)');
    ctx.fillStyle = gradLeft;
    ctx.fillRect(105, 0, 110, 512);

    const gradRight = ctx.createLinearGradient(297, 0, 407, 0);
    gradRight.addColorStop(0, 'rgba(12,14,18,0)');
    gradRight.addColorStop(0.5, 'rgba(12,14,18,0.34)');
    gradRight.addColorStop(1, 'rgba(12,14,18,0)');
    ctx.fillStyle = gradRight;
    ctx.fillRect(297, 0, 110, 512);

    // Bright white outer track limit lines
    ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
    ctx.fillRect(14, 0, 12, 512);
    ctx.fillRect(486, 0, 12, 512);

    ctx.fillStyle =
      trackId === 'gokart-track' || trackId === 'stadium-track'
        ? 'rgba(250, 204, 21, 0.68)'
        : isNight
        ? 'rgba(245, 158, 11, 0.72)'
        : 'rgba(241, 245, 249, 0.48)';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(252, y + 6, 8, 32);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createSidewalkTexture(maxAniso: number, isNight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // Warm Roman travertine & historic Italian piazza flagstone paving
  ctx.fillStyle = isNight ? '#443f3b' : '#d6cab6';
  ctx.fillRect(0, 0, 256, 256);

  // Staggered sandstone flagstone blocks
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    const off = (row % 2) * 32;
    for (let col = -1; col < 5; col++) {
      const x = col * 64 + off;
      const shade = ((row * 7 + col * 13) & 3) * 5;
      ctx.fillStyle = isNight
        ? `rgb(${64 + shade},${59 + shade},${54 + shade})`
        : `rgb(${212 - shade},${198 - shade},${178 - shade})`;
      ctx.fillRect(x + 2, y + 2, 60, 28);
    }
  }
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,250,240,0.08)' : 'rgba(42,32,22,0.07)';
    ctx.fillRect(x, y, 2, 2);
  }
  // Crisp cream travertine stone curb border along inner street edge
  ctx.fillStyle = isNight ? '#78716c' : '#efe7da';
  ctx.fillRect(0, 0, 26, 256);
  ctx.fillStyle = isNight ? '#292524' : '#a89a86';
  ctx.fillRect(26, 0, 4, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createTireBarrierTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Neutral bright base so per-instance colors (Red, White, Matte Black Rubber) tint cleanly
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle moulded rubber tread ribs & sidewall grooves around the torus circumference
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
    ctx.fillRect(0, y, 256, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(0, y + 4, 256, 2);
  }

  // Diagonal kart-tire tread blocks along the central crown band
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  for (let x = -32; x < 288; x += 22) {
    for (let y = 76; y < 180; y += 20) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y + 7);
      ctx.lineTo(x + 12, y + 14);
      ctx.lineTo(x, y + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Fine rubber grain & subtle trackside tire-scuff weathering
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.55 ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.anisotropy = maxAniso;
  return tex;
}

function createJumpRoadMarkingTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Transparent background so the sculpted sandy dirt / road surface & tire ruts show right through!
  ctx.clearRect(0, 0, 256, 512);

  // Subtle painted yellow/white directional launch chevrons sprayed onto the jump face
  for (let y = 88; y < 445; y += 98) {
    // Soft dark road-paint shadow outline for crisp sunlight contrast
    ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
    ctx.beginPath();
    ctx.moveTo(46, y + 40);
    ctx.lineTo(128, y - 16);
    ctx.lineTo(210, y + 40);
    ctx.lineTo(210, y + 66);
    ctx.lineTo(128, y + 10);
    ctx.lineTo(46, y + 66);
    ctx.closePath();
    ctx.fill();

    // Vivid weathered yellow motorsport chevron paint
    ctx.fillStyle = y % 196 === 88 ? 'rgba(255, 208, 20, 0.84)' : 'rgba(255, 245, 210, 0.76)';
    ctx.beginPath();
    ctx.moveTo(52, y + 36);
    ctx.lineTo(128, y - 10);
    ctx.lineTo(204, y + 36);
    ctx.lineTo(204, y + 58);
    ctx.lineTo(128, y + 12);
    ctx.lineTo(52, y + 58);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle dashed launch-crest warning stripe near the takeoff lip (top edge v=0)
  for (let x = 24; x < 232; x += 28) {
    ctx.fillStyle = (x / 28) % 2 === 0 ? 'rgba(255, 208, 20, 0.85)' : 'rgba(229, 37, 43, 0.82)';
    ctx.fillRect(x, 12, 20, 18);
  }

  // Light gravel/dust weathering speckle across the paint so it looks naturally driven-over!
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    ctx.fillStyle = `rgba(0,0,0,${0.18 + Math.random() * 0.35})`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createJumpArchTexture(maxAniso: number, text = 'JUMP ZONE'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0B1424';
  ctx.fillRect(0, 0, 512, 128);

  // Diagonal yellow/black warning bands on left & right edges
  ctx.fillStyle = '#FFD014';
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 22, 0);
    ctx.lineTo(i * 22 + 12, 0);
    ctx.lineTo(i * 22 - 14, 128);
    ctx.lineTo(i * 22 - 26, 128);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(410 + i * 22, 0);
    ctx.lineTo(422 + i * 22, 0);
    ctx.lineTo(396 + i * 22, 128);
    ctx.lineTo(384 + i * 22, 128);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#E5252B';
  ctx.fillRect(96, 8, 320, 12);
  ctx.fillStyle = '#FFD014';
  ctx.fillRect(96, 108, 320, 12);

  ctx.fillStyle = '#FFD014';
  ctx.font = 'italic 900 50px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`▲ ${text} ▲`, 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createDiversionSignTexture(
  maxAniso: number,
  leftText: string,
  rightText: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0B1424';
  ctx.fillRect(0, 0, 512, 192);

  // Outer high-visibility yellow border
  ctx.strokeStyle = '#FFD014';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 182);

  // Top header ribbon
  ctx.fillStyle = '#E5252B';
  ctx.fillRect(10, 10, 492, 46);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 900 28px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPLIT DIVERSION — CHOOSE LANE', 256, 34);

  // Center vertical divider
  ctx.fillStyle = '#FFD014';
  ctx.fillRect(253, 56, 6, 126);

  // Left lane callout (◄)
  ctx.fillStyle = '#FFD014';
  ctx.font = 'italic 900 44px "Chakra Petch", sans-serif';
  ctx.fillText(`◄ ${leftText}`, 130, 124);

  // Right lane callout (►)
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(`${rightText} ►`, 382, 124);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createCornerChevronTexture(maxAniso: number, dir: -1 | 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Vivid motorsport black-and-yellow reflective corner arrow board
  ctx.fillStyle = '#0B1220';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#E5252B';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 120);

  ctx.fillStyle = '#FFD014';
  const offsets = [42, 128, 214];
  for (const cx of offsets) {
    ctx.beginPath();
    if (dir > 0) {
      // Right-pointing chevron >
      ctx.moveTo(cx - 24, 20);
      ctx.lineTo(cx + 8, 20);
      ctx.lineTo(cx + 34, 64);
      ctx.lineTo(cx + 8, 108);
      ctx.lineTo(cx - 24, 108);
      ctx.lineTo(cx + 2, 64);
    } else {
      // Left-pointing chevron <
      ctx.moveTo(cx + 24, 20);
      ctx.lineTo(cx - 8, 20);
      ctx.lineTo(cx - 34, 64);
      ctx.lineTo(cx - 8, 108);
      ctx.lineTo(cx + 24, 108);
      ctx.lineTo(cx - 2, 64);
    }
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createHazardStripeTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFD014';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#0F172A';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i - 112, 128);
    ctx.lineTo(i - 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createCrosswalkTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
  for (let x = 22; x < 490; x += 48) {
    ctx.fillRect(x, 12, 28, 104);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createKerbTexture(maxAniso: number): THREE.CanvasTexture {
  // Crisp motorsport Red & White border strips so speed-reduction border is unmistakable
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const stripes = 4;
  const h = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#E12D2D' : '#F8FAFC';
    ctx.fillRect(0, i * h, 64, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 5, 256);
  ctx.fillRect(59, 0, 5, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createBollardTexture(maxAniso: number): THREE.CanvasTexture {
  // Iconic white roadside marker post with bright red middle band & warm yellow-orange top cap
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 64, 128);
  // Golden-amber top band
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 64, 16);
  // Crisp red center reflective band
  ctx.fillStyle = '#E12D2D';
  ctx.fillRect(0, 44, 64, 34);
  // Subtle base dirt shadow
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 114, 64, 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createMudBorderTexture(maxAniso: number, trackId: TrackId, isNight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Distinct damp earth/mud shoulder bordering the red-and-white kerbs
  ctx.fillStyle = isNight
    ? '#332316'
    : trackId === 'offroad-track'
    ? '#6c4d32'
    : '#5b432e';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.random();
    ctx.fillStyle =
      r < 0.42
        ? 'rgba(46, 30, 16, 0.45)'
        : r < 0.78
        ? 'rgba(128, 96, 62, 0.38)'
        : 'rgba(164, 132, 92, 0.28)';
    ctx.fillRect(x, y, 4, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createCheckeredTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const cw = 256 / cols;
  const rh = 64 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
      ctx.fillRect(c * cw, r * rh, cw, rh);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createGroundTexture(timeOfDay: TimeOfDay, trackId: TrackId, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const isNight = timeOfDay === 'night';
  const isEvening = timeOfDay === 'evening';

  if (trackId === 'city-track') {
    // Historic Italian stone piazza & warm travertine courtyard blocks
    ctx.fillStyle = isNight ? '#282524' : isEvening ? '#8c7a65' : '#a89984';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = isNight ? 'rgba(168,162,158,0.14)' : 'rgba(68,56,44,0.18)';
    ctx.lineWidth = 4;
    for (let g = 0; g < 512; g += 64) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,248,232,0.07)' : 'rgba(28,20,14,0.08)';
      ctx.fillRect(x, y, 3, 3);
    }
  } else {
    // Vibrant sunlit alpine meadow grass (richer stadium turf for stadium-track)
    ctx.fillStyle =
      trackId === 'stadium-track'
        ? isNight
          ? '#163822'
          : isEvening
          ? '#3b8c32'
          : '#3ea832'
        : isNight
        ? '#1b3522'
        : isEvening
        ? '#4c8e2b'
        : '#58b431';
    ctx.fillRect(0, 0, 512, 512);

    if (trackId === 'stadium-track') {
      // Mowed stadium turf stripes
      ctx.fillStyle = isNight ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)';
      for (let y = 0; y < 512; y += 64) {
        ctx.fillRect(0, y, 512, 32);
      }
    }

    // Soft dappled meadow grass swatches
    for (let i = 0; i < 480; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const rad = 10 + Math.random() * 28;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle =
        i % 2 === 0
          ? isNight
            ? 'rgba(42, 82, 46, 0.22)'
            : 'rgba(116, 206, 58, 0.24)'
          : isNight
          ? 'rgba(14, 34, 20, 0.25)'
          : 'rgba(56, 134, 34, 0.22)';
      ctx.fill();
    }

    // Stylized grass blades & subtle yellow wildflower accents
    for (let i = 0; i < 5500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random();
      if (r > 0.985 && !isNight) {
        ctx.fillStyle = 'rgba(250, 224, 72, 0.85)';
        ctx.fillRect(x, y, 3, 3);
      } else if (r > 0.5) {
        ctx.fillStyle = isNight ? 'rgba(60, 108, 62, 0.22)' : 'rgba(136, 218, 68, 0.28)';
        ctx.fillRect(x, y, 3, 5);
      } else {
        ctx.fillStyle = isNight ? 'rgba(10, 24, 14, 0.25)' : 'rgba(46, 120, 28, 0.24)';
        ctx.fillRect(x, y, 3, 5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 42);
  tex.anisotropy = maxAniso;
  return tex;
}

function createApexGantryTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#141E30';
  ctx.fillRect(0, 0, 512, 128);

  // Left and right bold checkered wing squares (matching Level Complete gantry art!)
  const sq = 22;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
      ctx.fillRect(c * sq, r * sq, sq, sq);
      ctx.fillRect(512 - (c + 1) * sq, r * sq, sq, sq);
    }
  }

  // Yellow bottom speed trim bar
  ctx.fillStyle = '#FFD014';
  ctx.fillRect(92, 110, 328, 10);

  // Crisp bold italic RUSH LINE lettering in center
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'italic 900 58px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RUSH LINE', 256, 60);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

type CityFacadeVariant = 'tuscan-terracotta' | 'roman-ochre' | 'venetian-rose' | 'vicolo-stone';

function createCityFacadeTexture(
  variant: CityFacadeVariant,
  isNight: boolean,
  maxAniso: number
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const emCanvas = document.createElement('canvas');
  emCanvas.width = 256;
  emCanvas.height = 512;
  const eCtx = emCanvas.getContext('2d')!;
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 256, 512);

  // Authentic Italian stucco palette (Tuscan terracotta, Roman ochre, Venetian rose, aged vicolo sandstone)
  const wallColor =
    variant === 'tuscan-terracotta'
      ? isNight
        ? '#5b3224'
        : '#c96f4b'
      : variant === 'roman-ochre'
      ? isNight
        ? '#634b28'
        : '#dca95c'
      : variant === 'venetian-rose'
      ? isNight
        ? '#5d3b3c'
        : '#d49a89'
      : isNight
      ? '#4c4338'
      : '#c8b69b';

  const trimColor = isNight ? '#3d362e' : '#ede4d4';
  const shutterColor =
    variant === 'venetian-rose'
      ? isNight
        ? '#2c1f18'
        : '#4b3324'
      : isNight
      ? '#173628'
      : '#24583f';

  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 256, 512);

  // Subtle Mediterranean plaster texture & weathered stone mortar variations
  for (let i = 0; i < 42; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,248,232,0.07)' : 'rgba(42,24,14,0.08)';
    ctx.fillRect((i * 47) % 236, (i * 71) % 360, 28, 36);
  }

  // Travertine stone base plinth & classic Italian stringcourse cornice bands between floors
  ctx.fillStyle = isNight ? '#38322c' : '#b7a994';
  ctx.fillRect(0, 356, 256, 156);
  ctx.fillStyle = trimColor;
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillRect(0, 174, 256, 12);
  ctx.fillRect(0, 344, 256, 14);
  // Corner limestone quoins
  for (let qy = 22; qy < 340; qy += 28) {
    ctx.fillStyle = isNight ? 'rgba(220,210,194,0.16)' : 'rgba(246,238,224,0.42)';
    ctx.fillRect(0, qy, 12, 16);
    ctx.fillRect(244, qy, 12, 16);
  }

  // Upper 2 stories: Classic tall Italian windows with cream stone frames & green/walnut louvered shutters (persiane)!
  for (const rowY of [40, 206]) {
    for (let c = 0; c < 3; c++) {
      const wx = 26 + c * 78;
      // Stone window surround & sill
      ctx.fillStyle = trimColor;
      ctx.fillRect(wx - 4, rowY - 5, 52, 84);
      ctx.fillRect(wx - 8, rowY + 75, 60, 7);

      // Louvered wooden shutters folded open on both sides of the window
      ctx.fillStyle = shutterColor;
      ctx.fillRect(wx - 16, rowY, 13, 74);
      ctx.fillRect(wx + 47, rowY, 13, 74);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let slat = 4; slat < 72; slat += 6) {
        ctx.fillRect(wx - 15, rowY + slat, 11, 2);
        ctx.fillRect(wx + 48, rowY + slat, 11, 2);
      }

      // Recessed window glass with warm glowing Italian apartment interior light
      const lit = ((c * 5 + rowY) % 3) !== 0;
      ctx.fillStyle = lit ? (isNight ? '#fcd34d' : '#fef3c7') : isNight ? '#1c222e' : '#334155';
      ctx.fillRect(wx + 2, rowY + 2, 40, 70);
      if (lit) {
        eCtx.fillStyle = isNight ? '#f59e0b' : '#92400e';
        eCtx.fillRect(wx + 2, rowY + 2, 40, 70);
      }
      // Classic wooden window mullion crossbars
      ctx.fillStyle = trimColor;
      ctx.fillRect(wx + 20, rowY + 2, 3, 70);
      ctx.fillRect(wx + 2, rowY + 34, 40, 3);
    }
  }

  // Ground floor: Arched Roman stone porticoes — glowing Trattoria / Gelateria / Caffè windows OR Vicolo wooden arched door!
  if (variant === 'vicolo-stone') {
    // Narrow Italian vicolo ground floor: heavy arched walnut carriage door + warm glowing shuttered tavern window
    ctx.fillStyle = trimColor;
    ctx.beginPath();
    ctx.arc(72, 422, 44, Math.PI, 0);
    ctx.lineTo(116, 512);
    ctx.lineTo(28, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isNight ? '#332015' : '#5c3a24';
    ctx.beginPath();
    ctx.arc(72, 424, 37, Math.PI, 0);
    ctx.lineTo(109, 512);
    ctx.lineTo(35, 512);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(71, 388, 3, 124);

    // Right warm arched wine-bar / osteria window
    ctx.fillStyle = trimColor;
    ctx.beginPath();
    ctx.arc(186, 426, 40, Math.PI, 0);
    ctx.lineTo(226, 496);
    ctx.lineTo(146, 496);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(186, 428, 33, Math.PI, 0);
    ctx.lineTo(219, 490);
    ctx.lineTo(153, 490);
    ctx.closePath();
    ctx.fill();
    eCtx.fillStyle = isNight ? '#f59e0b' : '#b45309';
    eCtx.beginPath();
    eCtx.arc(186, 428, 33, Math.PI, 0);
    eCtx.lineTo(219, 490);
    eCtx.lineTo(153, 490);
    eCtx.closePath();
    eCtx.fill();
  } else {
    // Main piazza ground floor: Twin arched Italian storefront porticos + vintage brass café sign plaque!
    const signLabel =
      variant === 'tuscan-terracotta'
        ? 'TRATTORIA'
        : variant === 'roman-ochre'
        ? 'GELATERIA'
        : 'CAFFÈ ROMA';
    const plaqueBg = variant === 'tuscan-terracotta' ? '#7f1d1d' : variant === 'roman-ochre' ? '#14532d' : '#1e293b';
    ctx.fillStyle = plaqueBg;
    ctx.fillRect(28, 360, 200, 32);
    ctx.strokeStyle = '#f5d07a';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 362, 196, 28);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(signLabel, 128, 377);
    eCtx.fillStyle = isNight ? '#b45309' : '#451a03';
    eCtx.fillRect(30, 362, 196, 28);

    for (const ax of [70, 186]) {
      ctx.fillStyle = trimColor;
      ctx.beginPath();
      ctx.arc(ax, 444, 42, Math.PI, 0);
      ctx.lineTo(ax + 42, 512);
      ctx.lineTo(ax - 42, 512);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(ax, 446, 35, Math.PI, 0);
      ctx.lineTo(ax + 35, 512);
      ctx.lineTo(ax - 35, 512);
      ctx.closePath();
      ctx.fill();

      eCtx.fillStyle = isNight ? '#fbbf24' : '#b45309';
      eCtx.beginPath();
      eCtx.arc(ax, 446, 35, Math.PI, 0);
      eCtx.lineTo(ax + 35, 512);
      eCtx.lineTo(ax - 35, 512);
      eCtx.closePath();
      eCtx.fill();

      // Dark wrought-iron arch mullions
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(ax - 2, 412, 4, 100);
      ctx.fillRect(ax - 35, 458, 70, 4);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAniso;

  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAniso;

  return { map, emissiveMap };
}

/**
 * Vintage wrought-iron hanging Italian Trattoria / Caffè / Gelateria street signboard texture
 */
function createItalianSignTexture(label: string, accentHex: string, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fef7e6';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, 240, 144);
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, 216, 120);

  // Subtle Italian green-white-red tricolor stripe accent
  ctx.fillStyle = '#15803d';
  ctx.fillRect(58, 34, 46, 8);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(104, 34, 48, 8);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(152, 34, 46, 8);

  ctx.fillStyle = '#1c1917';
  ctx.font = 'italic bold 32px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createStadiumCrowdTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // Concrete bleacher risers
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, 256, 128);

  const seatColors = ['#E5252B', '#FFD014', '#2563EB', '#F8FAFC', '#F97316', '#10B981', '#38BDF8'];
  for (let row = 0; row < 10; row++) {
    const ry = row * 12.8;
    // Concrete step shadow
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, ry, 256, 3);
    // Colored stadium seats & seated fans
    for (let col = 0; col < 32; col++) {
      // Leave crisp concrete aisle stairway gaps at col 0 and col 16
      if (col === 0 || col === 16) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(col * 8, ry + 1, 8, 11);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(col * 8, ry + 1, 2, 11);
        continue;
      }
      ctx.fillStyle = seatColors[(row * 13 + col * 19) % seatColors.length];
      ctx.fillRect(col * 8 + 1, ry + 4, 6, 7);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createStadiumJumbotronTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 512, 256);
  bg.addColorStop(0, '#091124');
  bg.addColorStop(1, '#152547');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);

  // Top red/gold racing banner header
  ctx.fillStyle = '#E5252B';
  ctx.fillRect(0, 0, 512, 54);
  ctx.fillStyle = '#FFD014';
  ctx.fillRect(0, 54, 512, 6);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 900 32px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RUSH LINE STADIUM GP', 256, 29);

  // Live Race Leaderboard Graphic
  const rows = [
    { pos: '1ST', name: 'LIVE ARENA', gap: 'LEADER', col: '#FFD014' },
    { pos: '2ND', name: 'FULL THROTTLE', gap: '+0.42s', col: '#38BDF8' },
    { pos: '3RD', name: 'CHAMPIONSHIP', gap: '+1.18s', col: '#FB923C' },
  ];
  rows.forEach((r, idx) => {
    const y = 84 + idx * 52;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(24, y, 464, 40);
    ctx.fillStyle = r.col;
    ctx.fillRect(24, y, 10, 40);
    ctx.font = '900 22px "Chakra Petch", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(r.pos, 48, y + 21);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(r.name, 128, y + 21);
    ctx.fillStyle = r.col;
    ctx.textAlign = 'right';
    ctx.fillText(r.gap, 470, y + 21);
  });

  // Outer LED frame
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 250);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function buildRibbonGeometry(
  samples: SplineSample[],
  leftOffset: number,
  rightOffset: number,
  yOffset: number,
  vRepeatPerMeter: number,
  totalLength: number
): THREE.BufferGeometry {
  const count = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const dist = (i / count) * totalLength;
    const vCoord = dist * vRepeatPerMeter;

    const lx = s.pos.x + s.right.x * leftOffset;
    const ly = s.pos.y + yOffset;
    const lz = s.pos.z + s.right.z * leftOffset;

    const rx = s.pos.x + s.right.x * rightOffset;
    const ry = s.pos.y + yOffset;
    const rz = s.pos.z + s.right.z * rightOffset;

    positions.push(lx, ly, lz, rx, ry, rz);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, vCoord, 1, vCoord);
  }

  // Winding order (a, b, c) and (b, d, c) faces +Y upward (CCW viewed from above)
  for (let i = 0; i < count; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Multi-column subdivided ribbon builder that sculpts seamless jump crests directly into
 * the road, kerb, and dirt shoulder geometry itself (zero separate floating boxes!).
 */
function buildSculptedRibbonGeometry(
  samples: SplineSample[],
  leftOffset: number,
  rightOffset: number,
  yOffset: number,
  vRepeatPerMeter: number,
  totalLength: number,
  latSegs: number,
  longSubSteps: number,
  extraHeightAt: (sampleFloatIdx: number, lateral: number) => number
): THREE.BufferGeometry {
  const count = samples.length;
  const totalRows = count * longSubSteps;
  const cols = latSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= totalRows; row++) {
    const fIdx = row / longSubSteps;
    const i0 = Math.floor(fIdx) % count;
    const i1 = (i0 + 1) % count;
    const frac = fIdx - Math.floor(fIdx);
    const s0 = samples[i0];
    const s1 = samples[i1];

    const px = s0.pos.x + (s1.pos.x - s0.pos.x) * frac;
    const py = s0.pos.y + (s1.pos.y - s0.pos.y) * frac;
    const pz = s0.pos.z + (s1.pos.z - s0.pos.z) * frac;
    let rx = s0.right.x + (s1.right.x - s0.right.x) * frac;
    let rz = s0.right.z + (s1.right.z - s0.right.z) * frac;
    const rLen = Math.hypot(rx, rz) || 1;
    rx /= rLen;
    rz /= rLen;

    const dist = (row / totalRows) * totalLength;
    const vCoord = dist * vRepeatPerMeter;

    for (let c = 0; c <= latSegs; c++) {
      const u = c / latSegs;
      const lat = leftOffset + (rightOffset - leftOffset) * u;
      const extraY = extraHeightAt(fIdx % count, lat);
      positions.push(px + rx * lat, py + yOffset + extraY, pz + rz * lat);
      uvs.push(u, vCoord);
    }
  }

  for (let row = 0; row < totalRows; row++) {
    for (let c = 0; c < latSegs; c++) {
      const a = row * cols + c;
      const b = a + 1;
      const cIdx = (row + 1) * cols + c;
      const d = cIdx + 1;
      indices.push(a, b, cIdx, b, d, cIdx);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildGuardrailGeometry(
  samples: SplineSample[],
  lateralOffset: number,
  height: number
): THREE.BufferGeometry {
  const count = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const x = s.pos.x + s.right.x * lateralOffset;
    const y = s.pos.y;
    const z = s.pos.z + s.right.z * lateralOffset;
    const u = i / 4;

    positions.push(x, y, z, x, y + height, z);
    uvs.push(u, 0, u, 1);
  }

  for (let i = 0; i < count; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Variable-width ribbon builder used by City Track so boulevards seamlessly narrow
 * into thrilling tight small-street alleyways and widen back out into avenues.
 */
function buildVariableRibbonGeometry(
  samples: SplineSample[],
  leftOffsetAt: (idx: number) => number,
  rightOffsetAt: (idx: number) => number,
  yOffset: number,
  vRepeatPerMeter: number,
  totalLength: number
): THREE.BufferGeometry {
  const count = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= count; i++) {
    const idx = i % count;
    const s = samples[idx];
    const dist = (i / count) * totalLength;
    const vCoord = dist * vRepeatPerMeter;
    const lOff = leftOffsetAt(idx);
    const rOff = rightOffsetAt(idx);

    positions.push(
      s.pos.x + s.right.x * lOff,
      s.pos.y + yOffset,
      s.pos.z + s.right.z * lOff,
      s.pos.x + s.right.x * rOff,
      s.pos.y + yOffset,
      s.pos.z + s.right.z * rOff
    );
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, vCoord, 1, vCoord);
  }

  for (let i = 0; i < count; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildVariableWallGeometry(
  samples: SplineSample[],
  lateralOffsetAt: (idx: number) => number,
  height: number
): THREE.BufferGeometry {
  const count = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= count; i++) {
    const idx = i % count;
    const s = samples[idx];
    const lat = lateralOffsetAt(idx);
    const x = s.pos.x + s.right.x * lat;
    const y = s.pos.y;
    const z = s.pos.z + s.right.z * lat;
    const u = i / 4;

    positions.push(x, y, z, x, y + height, z);
    uvs.push(u, 0, u, 1);
  }

  for (let i = 0; i < count; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function getTrackSamples(trackId: TrackId): {
  curve: THREE.CatmullRomCurve3;
  samples: SplineSample[];
  length: number;
  minimapPoints: Array<{ x: number; z: number }>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
} {
  const pts = TRACK_CONTROL_POINTS[trackId].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);
  const sampleCount = 600;
  const up = new THREE.Vector3(0, 1, 0);
  const samples: SplineSample[] = [];
  const minimapPoints: Array<{ x: number; z: number }> = [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    samples.push({ t, pos, tangent, right, curvature: 0 });

    if (i % 6 === 0) {
      minimapPoints.push({ x: pos.x, z: pos.z });
    }
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.z < minZ) minZ = pos.z;
    if (pos.z > maxZ) maxZ = pos.z;
  }

  for (let i = 0; i < sampleCount; i++) {
    const prev = samples[(i - 4 + sampleCount) % sampleCount];
    const next = samples[(i + 4) % sampleCount];
    const dot = THREE.MathUtils.clamp(prev.tangent.dot(next.tangent), -1, 1);
    samples[i].curvature = Math.acos(dot);
  }

  return {
    curve,
    samples,
    length: curve.getLength(),
    minimapPoints,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

export function buildTrackScene(
  trackId: TrackId,
  timeOfDay: TimeOfDay,
  maxAniso: number,
  lowPower = false
): BuiltTrack {
  const effectiveAniso = lowPower ? Math.min(maxAniso, 4) : maxAniso;
  const { curve, samples, length, minimapPoints, bounds } = getTrackSamples(trackId);
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const isOffroad = trackId === 'offroad-track';
  const isHill = trackId === 'hill-track';
  const isCity = trackId === 'city-track';
  const isRiverside = trackId === 'riverside-track';
  const isStadium = trackId === 'stadium-track';
  const isGoKart = trackId === 'gokart-track';
  const isNight = timeOfDay === 'night';
  const isEvening = timeOfDay === 'evening';

  const poleColliders: TrackPoleCollider[] = [];
  const boxColliders: TrackBoxCollider[] = [];
  const breakables: BreakableProp[] = [];

  const registerBreakable = (
    kind: BreakableProp['kind'],
    x: number,
    y: number,
    z: number,
    groundY: number,
    rawParts: Array<{ mesh: THREE.InstancedMesh; instanceId: number; worldMatrix: THREE.Matrix4 }>
  ): number => {
    const invPivot = new THREE.Matrix4().makeTranslation(-x, -y, -z);
    const parts: BreakablePart[] = rawParts.map((rp) => {
      rp.mesh.frustumCulled = false;
      return {
        mesh: rp.mesh,
        instanceId: rp.instanceId,
        localMatrix: invPivot.clone().multiply(rp.worldMatrix),
      };
    });
    const id = breakables.length;
    breakables.push({
      id,
      kind,
      x,
      y,
      z,
      groundY,
      parts,
      knocked: false,
      settled: false,
      posX: x,
      posY: y,
      posZ: z,
      vx: 0,
      vy: 0,
      vz: 0,
      fallDirX: 0,
      fallDirZ: 1,
      tiltAngle: 0,
      tiltVel: 0,
      spinAngle: 0,
      spinVel: 0,
      bounceCount: 0,
    });
    return id;
  };

  const roadWidth = isGoKart ? 12.6 : isStadium ? 18.2 : isOffroad || isHill ? 15.2 : 16.5;
  const halfRoad = roadWidth * 0.5;
  const kerbWidth = isGoKart ? 1.5 : 1.8;
  // Generous drivable side-road / shoulder space before fences, buildings, trees & guardrails
  const runOffWidth = isGoKart ? 3.0 : isCity ? 3.2 : isStadium ? 3.4 : isOffroad || isHill ? 3.8 : 3.8;
  const barrierOffset = halfRoad + kerbWidth + runOffWidth;

  // Dynamic road & sidewalk width helpers for City Track's small-street passages
  const cityHalfRoadAt = (idx: number): number => {
    if (!isCity) return halfRoad;
    const t = getCityStreetTightness(idx, samples.length);
    return halfRoad - t * 2.85; // 8.25m piazza boulevard -> 5.4m thrilling narrow Italian vicolo
  };
  const cityBarrierOffsetAt = (idx: number): number => {
    if (!isCity) return barrierOffset;
    const t = getCityStreetTightness(idx, samples.length);
    return barrierOffset - t * 5.85; // 13.25m boulevard building line -> 7.4m tight vicolo palazzo line
  };

  // Dynamic Morning / Evening / Night lighting tuned to match the vivid sunlit alpine & Italian golden-hour art style
  const skyColor = isNight ? 0x0a1328 : isEvening ? 0xd97d4a : 0x45aaf5;
  const fogColor = isNight ? 0x0e1a36 : isEvening ? 0xe39460 : 0x7ec5f8;
  const fogDensity = isNight ? 0.0017 : isEvening ? 0.0011 : 0.00078;
  const sunColor = isNight ? 0x9ab8f2 : isEvening ? 0xffae5e : 0xfff8e6;
  const sunIntensity = isNight ? 1.25 : isEvening ? 2.55 : 3.05;
  const sunPos = isNight
    ? new THREE.Vector3(-120, 120, -140)
    : isEvening
    ? new THREE.Vector3(210, 62, -165)
    : new THREE.Vector3(145, 200, 105);
  const hemiSky = isNight ? 0x334c80 : isEvening ? 0xffd0a0 : 0x9cd8ff;
  const hemiGround = isCity
    ? isNight
      ? 0x26211e
      : 0x7d6b58
    : isNight
    ? 0x16261a
    : isEvening
    ? 0x4c682c
    : 0x4ea632;
  const hemiIntensity = isNight ? 0.72 : isEvening ? 0.92 : 1.05;

  // Center of circuit for horizon mountains, clouds, and terrain framing
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;

  // Deterministic rolling alpine meadow elevation function that hugs track height cleanly
  const coarseSamples: SplineSample[] = [];
  for (let i = 0; i < samples.length; i += 3) {
    coarseSamples.push(samples[i]);
  }

  const sampleTerrainHeight = (x: number, z: number): { y: number; distToTrack: number } => {
    let minSq = Infinity;
    let nearestY = 0;
    let weightSum = 0;
    let weightedYSum = 0;
    for (let i = 0; i < coarseSamples.length; i++) {
      const sp = coarseSamples[i].pos;
      const dx = x - sp.x;
      const dz = z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minSq) {
        minSq = dSq;
        nearestY = sp.y;
      }
      // Smooth inverse-distance weight prevents sharp Voronoi cliff discontinuities between nearby elevated/low track legs
      const w = 1 / (dSq + 360);
      weightSum += w;
      weightedYSum += sp.y * w;
    }
    const dist = Math.sqrt(minSq);

    // City Track sits completely flat at urban street level (ZERO flyover embankment or rolling hills!)
    if (isCity) {
      return { y: -0.02, distToTrack: dist };
    }

    // Gentle stylized rolling meadow hills further away from the track (flatter for Stadium)
    const hillAmp = isStadium ? 0.45 : isHill ? 7.2 : 3.8;
    const hills =
      Math.sin(x * 0.014 + 0.6) * Math.cos(z * 0.013 - 0.3) * hillAmp +
      Math.sin(x * 0.031 - z * 0.025) * (hillAmp * 0.35);

    // Extra vertical clearance under the road on Off-Road & Hill so coarse terrain quads NEVER poke through valleys!
    const roadClearance = isOffroad || isHill ? 0.85 : 0.32;
    const flatZone = barrierOffset + (isOffroad || isHill ? 6.5 : 3.5);
    if (dist <= flatZone) {
      return { y: nearestY - roadClearance, distToTrack: dist };
    }
    const blend = THREE.MathUtils.clamp((dist - flatZone) / 42, 0, 1);
    const smoothBlend = blend * blend * (3 - 2 * blend);
    const smoothTrackY = weightSum > 0 ? weightedYSum / weightSum : nearestY;
    const farBase = isStadium ? -0.35 : Math.max(-0.4, smoothTrackY * 0.46 + hills);
    const baseFade = THREE.MathUtils.lerp(nearestY - roadClearance, farBase, smoothBlend);
    return { y: baseFade, distToTrack: dist };
  };

  // Textures (capped anisotropy on mobile to reduce GPU memory bandwidth & heat)
  const roadTex = createRoadSurfaceTexture(trackId, effectiveAniso, timeOfDay);
  const kerbTex = createKerbTexture(effectiveAniso);
  const bollardTex = createBollardTexture(effectiveAniso);
  const mudTex = createMudBorderTexture(effectiveAniso, trackId, isNight);
  const checkerTex = createCheckeredTexture(effectiveAniso);
  const groundTex = createGroundTexture(timeOfDay, trackId, effectiveAniso);
  const gantryBannerTex = createApexGantryTexture(effectiveAniso);
  disposables.push(roadTex, kerbTex, bollardTex, mudTex, checkerTex, groundTex, gantryBannerTex);

  // 1. Rolling Stylized Terrain (or flat concrete/asphalt metro block ground for City Track!)
  const groundSegs = isCity
    ? 12
    : lowPower
    ? isOffroad || isHill
      ? 96
      : 64
    : isOffroad || isHill
    ? 160
    : 96;
  const groundGeo = new THREE.PlaneGeometry(1800, 1800, groundSegs, groundSegs);
  groundGeo.rotateX(-Math.PI / 2);
  const gPos = groundGeo.attributes.position;
  const groundStride = groundSegs + 1;
  const groundHeights = new Float32Array(gPos.count);
  for (let i = 0; i < gPos.count; i++) {
    const wx = gPos.getX(i) + centerX;
    const wz = gPos.getZ(i) + centerZ;
    const { y } = sampleTerrainHeight(wx, wz);
    gPos.setY(i, y);
    groundHeights[i] = y;
  }
  gPos.needsUpdate = true;
  groundGeo.computeVertexNormals();

  // Exact O(1) barycentric triangle height query matching Three.js PlaneGeometry triangles 100% identically!
  // Eliminates any discrepancy between coarse terrain triangles and prop/car ground placement from any camera angle.
  const sampleMeshGroundY = (wx: number, wz: number): number => {
    if (isCity) return -0.02;
    const gx = THREE.MathUtils.clamp(((wx - centerX + 900) / 1800) * groundSegs, 0, groundSegs - 0.0001);
    const gz = THREE.MathUtils.clamp(((wz - centerZ + 900) / 1800) * groundSegs, 0, groundSegs - 0.0001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const iA = iz * groundStride + ix;
    const iB = (iz + 1) * groundStride + ix;
    const iC = iB + 1;
    const iD = iA + 1;
    const yA = groundHeights[iA];
    const yB = groundHeights[iB];
    const yC = groundHeights[iC];
    const yD = groundHeights[iD];
    // PlaneGeometry splits each quad along diagonal (b -> d): tri1 = (a,b,d), tri2 = (b,c,d)
    if (fx + fz <= 1) {
      return yA + fx * (yD - yA) + fz * (yB - yA);
    }
    return yC + (1 - fx) * (yB - yC) + (1 - fz) * (yD - yC);
  };

  // Surface height helper for props near the road shoulder/embankment vs outer terrain
  const sampleRoadsideGroundY = (wx: number, wz: number, roadY: number, absLat: number): number => {
    if (isCity) return roadY + 0.22;
    const meshY = sampleMeshGroundY(wx, wz);
    const skirtEdge = barrierOffset + 0.72;
    if (absLat <= skirtEdge) {
      return Math.max(roadY - 0.02, meshY);
    }
    const embOuter = barrierOffset + 7.5;
    if (absLat < embOuter) {
      const t = (absLat - skirtEdge) / (embOuter - skirtEdge);
      const embY = THREE.MathUtils.lerp(roadY - 0.02, meshY - 0.15, t);
      return Math.max(embY, meshY);
    }
    return meshY;
  };

  const groundMat = new THREE.MeshStandardMaterial({
    map: isCity ? undefined : groundTex,
    color: isCity ? (isNight ? 0x1e293b : 0x64748b) : 0xffffff,
    roughness: isCity ? 0.92 : 0.94,
    metalness: 0.02,
    flatShading: !isCity,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(centerX, 0, centerZ);
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // Pre-define road-blended sculpted Jump Ramps BEFORE building the road, kerbs, mud shoulders & diversion aprons
  // so every ramp IS literally sculpted out of the road surface itself (ZERO floating separate objects, ZERO divider penetration!).
  const ramps: TrackRamp[] = [];
  if (isOffroad || isHill) {
    const rawRamps: Array<{
      startIdx: number;
      endIdx: number;
      crestU: number;
      latMin: number;
      latMax: number;
      fullWidth: boolean;
      height: number;
    }> = isOffroad
      ? [
          // 5 Wide Full-Road Sculpted Off-Road Rally Jumps (blended seamlessly with road, kerbs & dirt shoulders!)
          { startIdx: 24, endIdx: 35, crestU: 0.72, latMin: -halfRoad, latMax: halfRoad, fullWidth: true, height: 3.1 },
          { startIdx: 164, endIdx: 175, crestU: 0.72, latMin: -halfRoad, latMax: halfRoad, fullWidth: true, height: 3.05 },
          { startIdx: 232, endIdx: 243, crestU: 0.72, latMin: -halfRoad, latMax: halfRoad, fullWidth: true, height: 3.2 },
          { startIdx: 378, endIdx: 389, crestU: 0.72, latMin: -halfRoad, latMax: halfRoad, fullWidth: true, height: 3.3 },
          { startIdx: 530, endIdx: 541, crestU: 0.72, latMin: -halfRoad, latMax: halfRoad, fullWidth: true, height: 3.0 },
          // + 3 Split-Diversion Single-Lane Stunt Jumps strictly outside ±2.2m (ZERO penetration with 1.75m center divider!)
          { startIdx: 98, endIdx: 109, crestU: 0.72, latMin: -11.4, latMax: -2.2, fullWidth: false, height: 3.35 },
          { startIdx: 304, endIdx: 315, crestU: 0.72, latMin: 2.2, latMax: 11.4, fullWidth: false, height: 3.35 },
          { startIdx: 479, endIdx: 490, crestU: 0.72, latMin: -11.4, latMax: -2.2, fullWidth: false, height: 3.25 },
        ]
      : [
          // 2 Scenic Road-Blended Alpine Crest Jumps on Hill Track
          { startIdx: 108, endIdx: 118, crestU: 0.72, latMin: -11.2, latMax: -2.2, fullWidth: false, height: 2.55 },
          { startIdx: 418, endIdx: 429, crestU: 0.72, latMin: -halfRoad, latMax: halfRoad, fullWidth: true, height: 2.65 },
        ];

    for (const rr of rawRamps) {
      let arcLen = 0;
      for (let k = rr.startIdx; k < rr.endIdx; k++) {
        const a = samples[k % samples.length].pos;
        const b = samples[(k + 1) % samples.length].pos;
        arcLen += Math.hypot(b.x - a.x, b.z - a.z);
      }
      ramps.push({
        ...rr,
        lengthMeters: Math.max(12, arcLen),
      });
    }
  }

  const rampExtraYAt = (sampleFloatIdx: number, lateral: number): number =>
    ramps.length > 0
      ? evaluateTrackRampAt(sampleFloatIdx, lateral, samples.length, ramps, halfRoad, kerbWidth, barrierOffset).extraY
      : 0;

  // 2. Shoulder Apron: Raised Concrete City Sidewalks on City Track OR Sculpted Mud Run-Off on Circuit/Off-Road Tracks
  if (isCity) {
    const sidewalkTex = createSidewalkTexture(maxAniso, isNight);
    const sidewalkMat = new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.85,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x6b645c : 0xe8dfd0,
      roughness: 0.74,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    // Variable-width concrete sidewalks hugging BOTH wide boulevards AND tight small streets at curb height (+0.22m)
    const leftSidewalkGeo = buildVariableRibbonGeometry(
      samples,
      (i) => -(cityBarrierOffsetAt(i) + 18),
      (i) => -cityHalfRoadAt(i),
      0.22,
      0.14,
      length
    );
    const rightSidewalkGeo = buildVariableRibbonGeometry(
      samples,
      (i) => cityHalfRoadAt(i),
      (i) => cityBarrierOffsetAt(i) + 18,
      0.22,
      0.14,
      length
    );
    const leftSidewalk = new THREE.Mesh(leftSidewalkGeo, sidewalkMat);
    const rightSidewalk = new THREE.Mesh(rightSidewalkGeo, sidewalkMat);
    leftSidewalk.receiveShadow = true;
    rightSidewalk.receiveShadow = true;

    // Vertical granite curb face stepping smoothly down from sidewalk (+0.22m) to street asphalt (+0.08m)
    const leftCurbWallGeo = buildVariableWallGeometry(samples, (i) => -cityHalfRoadAt(i), 0.23);
    const rightCurbWallGeo = buildVariableWallGeometry(samples, (i) => cityHalfRoadAt(i), 0.23);
    const leftCurbWall = new THREE.Mesh(leftCurbWallGeo, curbMat);
    const rightCurbWall = new THREE.Mesh(rightCurbWallGeo, curbMat);

    group.add(leftSidewalk, rightSidewalk, leftCurbWall, rightCurbWall);
    disposables.push(
      sidewalkTex,
      sidewalkMat,
      curbMat,
      leftSidewalkGeo,
      rightSidewalkGeo,
      leftCurbWallGeo,
      rightCurbWallGeo
    );
  } else {
    const skirtGeo =
      ramps.length > 0
        ? buildSculptedRibbonGeometry(
            samples,
            -(barrierOffset + 0.8),
            barrierOffset + 0.8,
            -0.02,
            0.12,
            length,
            18,
            2,
            rampExtraYAt
          )
        : buildRibbonGeometry(
            samples,
            -(barrierOffset + 0.8),
            barrierOffset + 0.8,
            -0.02,
            0.12,
            length
          );
    const skirtMat = new THREE.MeshStandardMaterial({
      map: mudTex,
      roughness: 0.96,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.receiveShadow = true;
    group.add(skirt);
    disposables.push(skirtGeo, skirtMat);

    // Solid 2-stage sloped earthen embankment sealing both outer edges of the road skirt deeply down into the terrain mesh
    // so elevated rally hills and roads never show gaps or floating undersides from any camera angle!
    const buildEmbankmentSide = (side: -1 | 1): THREE.BufferGeometry => {
      const innerLat = side * (barrierOffset + 0.72);
      const midLat = side * (barrierOffset + 3.4);
      const outerLat = side * (barrierOffset + 7.5);
      const n = samples.length;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= n; i++) {
        const s = samples[i % n];
        const ix = s.pos.x + s.right.x * innerLat;
        const iz = s.pos.z + s.right.z * innerLat;
        const mx = s.pos.x + s.right.x * midLat;
        const mz = s.pos.z + s.right.z * midLat;
        const ox = s.pos.x + s.right.x * outerLat;
        const oz = s.pos.z + s.right.z * outerLat;
        const iy = s.pos.y - 0.02;
        const midGround = sampleMeshGroundY(mx, mz);
        const my = Math.min(iy - 0.25, Math.max(midGround - 0.2, iy - 1.45));
        const oy = Math.min(sampleMeshGroundY(ox, oz) - 1.25, s.pos.y - 2.4);
        const vCoord = (i / n) * length * 0.08;
        if (side < 0) {
          positions.push(ox, oy, oz, mx, my, mz, ix, iy, iz);
        } else {
          positions.push(ix, iy, iz, mx, my, mz, ox, oy, oz);
        }
        uvs.push(0, vCoord, 0.5, vCoord, 1, vCoord);
      }
      for (let i = 0; i < n; i++) {
        const row0 = i * 3;
        const row1 = (i + 1) * 3;
        for (let seg = 0; seg < 2; seg++) {
          const a = row0 + seg;
          const b = a + 1;
          const c = row1 + seg;
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };
    const leftEmbGeo = buildEmbankmentSide(-1);
    const rightEmbGeo = buildEmbankmentSide(1);
    const leftEmb = new THREE.Mesh(leftEmbGeo, skirtMat);
    const rightEmb = new THREE.Mesh(rightEmbGeo, skirtMat);
    leftEmb.receiveShadow = true;
    rightEmb.receiveShadow = true;
    group.add(leftEmb, rightEmb);
    disposables.push(leftEmbGeo, rightEmbGeo);
  }

  // 3. Main drivable circuit surface (Variable-width street on City Track, sculpted jumps on Off-Road/Hill)
  const roadGeo = isCity
    ? buildVariableRibbonGeometry(
        samples,
        (i) => -cityHalfRoadAt(i),
        (i) => cityHalfRoadAt(i),
        0.08,
        0.085,
        length
      )
    : ramps.length > 0
    ? buildSculptedRibbonGeometry(samples, -halfRoad, halfRoad, 0.08, 0.085, length, 14, 2, rampExtraYAt)
    : buildRibbonGeometry(samples, -halfRoad, halfRoad, 0.08, 0.085, length);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: isOffroad ? 0.90 : isNight ? 0.48 : 0.7,
    metalness: isOffroad ? 0.02 : isNight ? 0.14 : 0.06,
    side: THREE.DoubleSide,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  disposables.push(roadGeo, roadMat);

  // 4. High-contrast RED & WHITE circuit border kerbs (hug sculpted road jumps seamlessly!)
  if (!isCity) {
    const leftKerbGeo =
      ramps.length > 0
        ? buildSculptedRibbonGeometry(samples, -(halfRoad + kerbWidth), -halfRoad, 0.11, 0.22, length, 2, 2, rampExtraYAt)
        : buildRibbonGeometry(samples, -(halfRoad + kerbWidth), -halfRoad, 0.11, 0.22, length);
    const rightKerbGeo =
      ramps.length > 0
        ? buildSculptedRibbonGeometry(samples, halfRoad, halfRoad + kerbWidth, 0.11, 0.22, length, 2, 2, rampExtraYAt)
        : buildRibbonGeometry(samples, halfRoad, halfRoad + kerbWidth, 0.11, 0.22, length);
    const kerbMat = new THREE.MeshStandardMaterial({
      map: kerbTex,
      roughness: 0.62,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const leftKerb = new THREE.Mesh(leftKerbGeo, kerbMat);
    const rightKerb = new THREE.Mesh(rightKerbGeo, kerbMat);
    leftKerb.receiveShadow = true;
    rightKerb.receiveShadow = true;
    group.add(leftKerb, rightKerb);
    disposables.push(leftKerbGeo, rightKerbGeo, kerbMat);
  } else {
    // Crisp White Zebra Pedestrian Crosswalks spaced along City Avenue intersections & Small-Street entries
    const crosswalkTex = createCrosswalkTexture(effectiveAniso);
    const crosswalkGeo = new THREE.PlaneGeometry(1, 3.6);
    crosswalkGeo.rotateX(-Math.PI / 2);
    const crosswalkMat = new THREE.MeshStandardMaterial({
      map: crosswalkTex,
      transparent: true,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (let i = 45; i < samples.length - 35; i += 48) {
      const s = samples[i];
      if (s.curvature > 0.14) continue;
      const cw = new THREE.Mesh(crosswalkGeo, crosswalkMat);
      cw.scale.x = cityHalfRoadAt(i) * 2 - 0.6;
      cw.position.set(s.pos.x, s.pos.y + 0.105, s.pos.z);
      cw.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
      group.add(cw);
    }
    disposables.push(crosswalkTex, crosswalkGeo, crosswalkMat);
  }

  // 4B. TRACK SPLIT-ROUTE DIVERSIONS ON ALL TRACKS (Flared Dual-Lane Forks + Hazard Nose + Overhead Split Sign!)
  const diversions: TrackDiversion[] = [];
  const diversionConfigs: Record<TrackId, Array<{ start: number; len: number; rampSide?: -1 | 1; left: string; right: string }>> = {
    'offroad-track': [
      { start: 86, len: 42, rampSide: -1, left: 'JUMP', right: 'DRIFT' },
      { start: 292, len: 42, rampSide: 1, left: 'DRIFT', right: 'JUMP' },
      { start: 468, len: 38, rampSide: -1, left: 'STUNT', right: 'FAST' },
    ],
    'hill-track': [
      { start: 96, len: 38, rampSide: -1, left: 'CREST', right: 'APEX' },
      { start: 332, len: 40, left: 'INSIDE', right: 'WIDE' },
      { start: 486, len: 36, left: 'FAST', right: 'DRIFT' },
    ],
    'city-track': [
      { start: 78, len: 38, left: 'EXPRESS', right: 'STREET' },
      { start: 286, len: 40, left: 'INNER', right: 'OUTER' },
      { start: 454, len: 38, left: 'APEX', right: 'WIDE' },
    ],
    'riverside-track': [
      { start: 84, len: 40, left: 'WOODS', right: 'RIVER' },
      { start: 306, len: 40, left: 'APEX', right: 'SWEEP' },
      { start: 472, len: 36, left: 'FAST', right: 'RIVER' },
    ],
    'stadium-track': [
      { start: 80, len: 36, left: 'INSIDE', right: 'BOWL' },
      { start: 312, len: 38, left: 'APEX', right: 'DRIFT' },
    ],
    'racing-track': [
      { start: 88, len: 40, left: 'APEX', right: 'FAST' },
      { start: 298, len: 40, left: 'INNER', right: 'WIDE' },
      { start: 468, len: 38, left: 'SHORT', right: 'SWEEP' },
    ],
    'gokart-track': [
      { start: 124, len: 30, left: 'TIGHT', right: 'WIDE' },
      { start: 382, len: 32, left: 'APEX', right: 'DRIFT' },
    ],
  };

  const hazardTex = createHazardStripeTexture(maxAniso);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.45,
    metalness: 0.15,
    emissive: isNight ? 0x5c4200 : 0x000000,
    emissiveIntensity: isNight ? 0.5 : 0,
  });
  const islandBaseMat = new THREE.MeshStandardMaterial({
    color: isOffroad ? 0x5c4028 : 0x334155,
    roughness: 0.85,
    metalness: 0.12,
  });
  const islandTrimMat = new THREE.MeshStandardMaterial({
    map: kerbTex,
    roughness: 0.55,
    metalness: 0.08,
  });
  const signPostMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.65,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffd014,
    emissive: 0xffd014,
    emissiveIntensity: isNight ? 2.2 : 1.1,
    roughness: 0.25,
  });
  disposables.push(hazardTex, hazardMat, islandBaseMat, islandTrimMat, signPostMat, beaconMat);

  const extraOuterWidth = isCity ? 0.0 : isGoKart ? 3.8 : 4.8;
  const islandHalfWidth = isCity ? 1.35 : isGoKart ? 1.45 : 1.75;

  // Helper to build a smooth flared diversion road ribbon for [startIdx .. endIdx]
  // Subdivided & sculpted with rampExtraYAt so split-lane jump mounds rise seamlessly out of the flared road!
  const buildDiversionApron = (startIdx: number, endIdx: number, side: -1 | 1): THREE.BufferGeometry => {
    const span = endIdx - startIdx;
    const pad = 8;
    const subSteps = ramps.length > 0 ? 2 : 1;
    const totalSteps = (span + pad * 2) * subSteps;
    const latSegs = ramps.length > 0 ? 8 : 1;
    const cols = latSegs + 1;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let row = 0; row <= totalSteps; row++) {
      const kFloat = row / subSteps;
      const fIdx = (startIdx - pad + kFloat + samples.length) % samples.length;
      const i0 = Math.floor(fIdx) % samples.length;
      const i1 = (i0 + 1) % samples.length;
      const frac = fIdx - Math.floor(fIdx);
      const s0 = samples[i0];
      const s1 = samples[i1];

      const px = s0.pos.x + (s1.pos.x - s0.pos.x) * frac;
      const py = s0.pos.y + (s1.pos.y - s0.pos.y) * frac;
      const pz = s0.pos.z + (s1.pos.z - s0.pos.z) * frac;
      let rx = s0.right.x + (s1.right.x - s0.right.x) * frac;
      let rz = s0.right.z + (s1.right.z - s0.right.z) * frac;
      const rLen = Math.hypot(rx, rz) || 1;
      rx /= rLen;
      rz /= rLen;

      const totalK = span + pad * 2;
      let flare = 1.0;
      if (kFloat < pad) {
        const u = kFloat / pad;
        flare = u * u * (3 - 2 * u);
      } else if (kFloat > totalK - pad) {
        const u = (totalK - kFloat) / pad;
        flare = u * u * (3 - 2 * u);
      }
      const innerLat = side * (halfRoad - 1.2);
      const outerLat = side * (halfRoad + extraOuterWidth * flare);
      const lLat = Math.min(innerLat, outerLat);
      const rLat = Math.max(innerLat, outerLat);
      const vCoord = kFloat * 0.35;

      for (let c = 0; c <= latSegs; c++) {
        const u = c / latSegs;
        const lat = lLat + (rLat - lLat) * u;
        // Sit 1.4cm above kerbs (+0.11) and rise identically with any split-lane sculpted jump!
        const y = py + 0.124 + rampExtraYAt(fIdx, lat);
        positions.push(px + rx * lat, y, pz + rz * lat);
        uvs.push(u, vCoord);
      }
    }

    for (let row = 0; row < totalSteps; row++) {
      for (let c = 0; c < latSegs; c++) {
        const a = row * cols + c;
        const b = a + 1;
        const cIdx = (row + 1) * cols + c;
        const d = cIdx + 1;
        indices.push(a, b, cIdx, b, d, cIdx);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  for (const cfg of diversionConfigs[trackId] ?? []) {
    const startIdx = cfg.start % samples.length;
    const endIdx = (cfg.start + cfg.len) % samples.length;
    if (endIdx <= startIdx) continue;

    diversions.push({
      startIdx,
      endIdx,
      centerOffset: 0,
      islandHalfWidth,
      extraOuterWidth,
      rampSide: cfg.rampSide,
      labelLeft: cfg.left,
      labelRight: cfg.right,
    });

    // Flared left & right drivable bypass lane aprons matching the main road surface (non-city tracks)
    if (extraOuterWidth > 0.1) {
      for (const side of [-1, 1] as const) {
        const apronGeo = buildDiversionApron(startIdx, endIdx, side);
        const apronMesh = new THREE.Mesh(apronGeo, roadMat);
        apronMesh.receiveShadow = true;
        group.add(apronMesh);
        disposables.push(apronGeo);
      }
    }

    // Build raised physical Split-Diversion Island running down the center of the fork
    const islandSteps = Math.max(4, endIdx - startIdx - 4);
    const segLenStep = 2;
    for (let si = startIdx + 2; si <= endIdx - 2; si += segLenStep) {
      const s0 = samples[si % samples.length];
      const s1 = samples[Math.min(endIdx - 1, si + segLenStep) % samples.length];
      const dx = s1.pos.x - s0.pos.x;
      const dy = s1.pos.y - s0.pos.y;
      const dz = s1.pos.z - s0.pos.z;
      const segLen = Math.max(1.5, Math.hypot(dx, dz));
      const yaw = Math.atan2(dx, dz);
      const tNorm = (si - startIdx) / Math.max(1, endIdx - startIdx);
      const taper = Math.sin(THREE.MathUtils.clamp(tNorm, 0.05, 0.95) * Math.PI);
      const w = Math.max(0.75, islandHalfWidth * 2 * (0.45 + 0.55 * Math.pow(taper, 0.5)));

      const blkGeo = new THREE.BoxGeometry(w, 1.2, segLen + 0.35);
      const blk = new THREE.Mesh(blkGeo, si <= startIdx + 5 ? hazardMat : islandTrimMat);
      blk.position.set(
        (s0.pos.x + s1.pos.x) * 0.5,
        (s0.pos.y + s1.pos.y) * 0.5 + 0.33,
        (s0.pos.z + s1.pos.z) * 0.5
      );
      blk.rotation.set(-Math.atan2(dy, segLen), yaw, 0);
      blk.castShadow = true;
      blk.receiveShadow = true;
      group.add(blk);
      disposables.push(blkGeo);
    }

    // Dramatic Crash-Attenuator Nose + Tall Glowing Split-Diversion Signboard facing oncoming racers!
    const noseSample = samples[(startIdx + 1) % samples.length];
    const noseYaw = Math.atan2(noseSample.tangent.x, noseSample.tangent.z);
    const noseGroup = new THREE.Group();
    noseGroup.position.set(noseSample.pos.x, noseSample.pos.y + 0.08, noseSample.pos.z);
    noseGroup.rotation.y = noseYaw;

    // Tapered yellow-black striped crash barrel nose
    const noseConeGeo = new THREE.CylinderGeometry(0.55, 1.35, 1.35, 6);
    noseConeGeo.translate(0, 0.68, 0);
    const noseCone = new THREE.Mesh(noseConeGeo, hazardMat);
    noseCone.castShadow = true;

    // Glowing amber warning beacon atop the nose
    const beaconGeo = new THREE.SphereGeometry(0.32, 8, 8);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 1.55, 0);

    // Tall unmistakable Split-Diversion Signboard (`◄ JUMP | DRIFT ►` or `◄ APEX | WIDE ►`)
    const divSignTex = createDiversionSignTexture(maxAniso, cfg.left, cfg.right);
    const divSignMat = new THREE.MeshStandardMaterial({
      map: divSignTex,
      roughness: 0.35,
      emissive: 0x1e293b,
      emissiveIntensity: isNight ? 1.15 : 0.35,
    });
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.8, 6);
    const leftPost = new THREE.Mesh(postGeo, signPostMat);
    leftPost.position.set(-1.35, 2.4, 0.6);
    const rightPost = new THREE.Mesh(postGeo, signPostMat);
    rightPost.position.set(1.35, 2.4, 0.6);

    const boardGeo = new THREE.BoxGeometry(5.6, 2.15, 0.24);
    const board = new THREE.Mesh(boardGeo, [
      signPostMat,
      signPostMat,
      signPostMat,
      signPostMat,
      divSignMat,
      divSignMat,
    ]);
    board.position.set(0, 4.65, 0.6);
    board.castShadow = true;

    noseGroup.add(noseCone, beacon, leftPost, rightPost, board);
    group.add(noseGroup);
    // Register diversion nose sign posts as solid collidable poles
    for (const pxOff of [-1.35, 1.35]) {
      poleColliders.push({
        x: noseSample.pos.x + noseSample.right.x * pxOff + noseSample.tangent.x * 0.6,
        z: noseSample.pos.z + noseSample.right.z * pxOff + noseSample.tangent.z * 0.6,
        radius: 0.36,
        sampleIdx: (startIdx + 1) % samples.length,
      });
    }
    disposables.push(noseConeGeo, beaconGeo, divSignTex, divSignMat, postGeo, boardGeo);

    // Unused variable guard
    void islandSteps;
  }

  // 4C. ROAD-BLENDED JUMP LAUNCH MARKINGS, GROUNDED JUMP ZONE ARCHES & LANDING FLAGS
  // (The jump ramps themselves are already seamlessly sculpted into the road, kerbs, shoulders & aprons above!)
  if (ramps.length > 0) {
    const jumpMarkingTex = createJumpRoadMarkingTexture(maxAniso);
    const jumpArchTex = createJumpArchTexture(maxAniso, isOffroad ? 'JUMP ZONE' : 'CREST JUMP');
    const jumpMarkingMat = new THREE.MeshStandardMaterial({
      map: jumpMarkingTex,
      transparent: true,
      roughness: 0.78,
      metalness: 0.02,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      emissive: 0x3b2a04,
      emissiveIntensity: isNight ? 0.9 : 0.15,
    });
    const archPillarMat = new THREE.MeshStandardMaterial({
      color: 0x162235,
      roughness: 0.4,
      metalness: 0.6,
    });
    const archBannerMat = new THREE.MeshStandardMaterial({
      map: jumpArchTex,
      roughness: 0.32,
      emissive: 0x3a2a04,
      emissiveIntensity: isNight ? 1.25 : 0.42,
    });
    const rampFlagPoleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.4,
      metalness: 0.6,
    });
    const rampFlagMat = new THREE.MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.45,
      side: THREE.DoubleSide,
    });
    const flagGeo = new THREE.PlaneGeometry(1.5, 0.92);
    disposables.push(
      jumpMarkingTex,
      jumpArchTex,
      jumpMarkingMat,
      archPillarMat,
      archBannerMat,
      rampFlagPoleMat,
      rampFlagMat,
      flagGeo
    );

    const interpSpline = (fIdx: number) => {
      const wrapped = ((fIdx % samples.length) + samples.length) % samples.length;
      const i0 = Math.floor(wrapped);
      const i1 = (i0 + 1) % samples.length;
      const frac = wrapped - i0;
      const s0 = samples[i0];
      const s1 = samples[i1];
      const px = s0.pos.x + (s1.pos.x - s0.pos.x) * frac;
      const py = s0.pos.y + (s1.pos.y - s0.pos.y) * frac;
      const pz = s0.pos.z + (s1.pos.z - s0.pos.z) * frac;
      let tx = s0.tangent.x + (s1.tangent.x - s0.tangent.x) * frac;
      let tz = s0.tangent.z + (s1.tangent.z - s0.tangent.z) * frac;
      const tLen = Math.hypot(tx, tz) || 1;
      tx /= tLen;
      tz /= tLen;
      let rx = s0.right.x + (s1.right.x - s0.right.x) * frac;
      let rz = s0.right.z + (s1.right.z - s0.right.z) * frac;
      const rLen = Math.hypot(rx, rz) || 1;
      rx /= rLen;
      rz /= rLen;
      return { px, py, pz, tx, tz, rx, rz };
    };

    for (const r of ramps) {
      // 1. Surface-hugging painted directional launch chevrons directly ON the sculpted road launch face!
      const span = r.endIdx - r.startIdx;
      const decalStart = r.startIdx + span * 0.08;
      const decalEnd = r.startIdx + span * r.crestU;
      const decalRows = 14;
      const decalCols = 6;
      const innerPad = r.fullWidth ? 1.6 : 1.35;
      const dLatMin = r.latMin + innerPad;
      const dLatMax = r.latMax - innerPad;

      const dPositions: number[] = [];
      const dUvs: number[] = [];
      const dIndices: number[] = [];

      for (let row = 0; row <= decalRows; row++) {
        const t = row / decalRows;
        const fIdx = decalStart + (decalEnd - decalStart) * t;
        const sp = interpSpline(fIdx);
        // v=1 at ramp bottom, v=0 at takeoff crest so chevrons point cleanly UP the jump!
        const vCoord = 1 - t;
        for (let c = 0; c <= decalCols; c++) {
          const u = c / decalCols;
          const lat = dLatMin + (dLatMax - dLatMin) * u;
          const onApron = !r.fullWidth && Math.abs(lat) >= halfRoad - 1.25;
          const baseOffset = onApron ? 0.148 : 0.108;
          const y = sp.py + baseOffset + rampExtraYAt(fIdx, lat);
          dPositions.push(sp.px + sp.rx * lat, y, sp.pz + sp.rz * lat);
          dUvs.push(u, vCoord);
        }
      }
      for (let row = 0; row < decalRows; row++) {
        for (let c = 0; c < decalCols; c++) {
          const a = row * (decalCols + 1) + c;
          const b = a + 1;
          const cIdx = (row + 1) * (decalCols + 1) + c;
          const d = cIdx + 1;
          dIndices.push(a, b, cIdx, b, d, cIdx);
        }
      }
      const decalGeo = new THREE.BufferGeometry();
      decalGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPositions, 3));
      decalGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dUvs, 2));
      decalGeo.setIndex(dIndices);
      decalGeo.computeVertexNormals();
      const decalMesh = new THREE.Mesh(decalGeo, jumpMarkingMat);
      decalMesh.receiveShadow = true;
      group.add(decalMesh);
      disposables.push(decalGeo);

      // 2. Ground-planted overhead JUMP ZONE arch straddling the outer road banks (ZERO pillars in/penetrating dividers!)
      const crestFIdx = r.startIdx + span * r.crestU;
      const cs = interpSpline(crestFIdx);
      const crestYaw = Math.atan2(cs.tx, cs.tz);
      const outerBankLat = r.fullWidth
        ? halfRoad + kerbWidth + 0.95
        : halfRoad + extraOuterWidth + 0.85;
      const leftPostLat = -outerBankLat;
      const rightPostLat = outerBankLat;
      const bannerTopY = cs.py + r.height + 5.25;

      for (const postLat of [leftPostLat, rightPostLat]) {
        const wx = cs.px + cs.rx * postLat;
        const wz = cs.pz + cs.rz * postLat;
        const terrainY = sampleTerrainHeight(wx, wz).y;
        const bottomY = Math.min(cs.py, terrainY) - 1.5;
        const postHeight = Math.max(4.5, bannerTopY - bottomY);
        const postGeo = new THREE.BoxGeometry(0.62, postHeight, 0.72);
        const post = new THREE.Mesh(postGeo, archPillarMat);
        post.position.set(wx, bottomY + postHeight * 0.5, wz);
        post.rotation.y = crestYaw;
        post.castShadow = true;
        group.add(post);
        poleColliders.push({
          x: wx,
          z: wz,
          radius: 0.52,
          sampleIdx: Math.round(crestFIdx) % samples.length,
        });
        disposables.push(postGeo);
      }

      if (r.fullWidth) {
        const archSpan = Math.abs(rightPostLat - leftPostLat) + 1.1;
        const bannerGeo = new THREE.BoxGeometry(archSpan, 1.5, 0.72);
        const archBanner = new THREE.Mesh(bannerGeo, [
          archPillarMat,
          archPillarMat,
          archPillarMat,
          archPillarMat,
          archBannerMat,
          archBannerMat,
        ]);
        archBanner.position.set(cs.px, bannerTopY - 0.35, cs.pz);
        archBanner.rotation.y = crestYaw;
        group.add(archBanner);
        disposables.push(bannerGeo);
      } else {
        // Full outer-to-outer overhead gantry beam (completely clear of the central divider!)
        // with the JUMP ZONE sign positioned directly above the jump lane
        const gantrySpan = Math.abs(rightPostLat - leftPostLat) + 1.1;
        const beamGeo = new THREE.BoxGeometry(gantrySpan, 0.46, 0.54);
        const beam = new THREE.Mesh(beamGeo, archPillarMat);
        beam.position.set(cs.px, bannerTopY - 0.12, cs.pz);
        beam.rotation.y = crestYaw;
        beam.castShadow = true;
        group.add(beam);

        const laneBannerWidth = Math.abs(r.latMax - r.latMin) + 0.6;
        const laneMidLat = (r.latMin + r.latMax) * 0.5;
        const bannerGeo = new THREE.BoxGeometry(laneBannerWidth, 1.48, 0.74);
        const archBanner = new THREE.Mesh(bannerGeo, [
          archPillarMat,
          archPillarMat,
          archPillarMat,
          archPillarMat,
          archBannerMat,
          archBannerMat,
        ]);
        archBanner.position.set(
          cs.px + cs.rx * laneMidLat,
          bannerTopY - 0.42,
          cs.pz + cs.rz * laneMidLat
        );
        archBanner.rotation.y = crestYaw;
        group.add(archBanner);
        disposables.push(beamGeo, bannerGeo);
      }

      // 3. Ground-planted checkered landing-zone flags ~22m downrange past the crest
      const landIdx = (Math.round(r.endIdx) + 6) % samples.length;
      const ls = samples[landIdx];
      const landYaw = Math.atan2(ls.tangent.x, ls.tangent.z);
      const flagLats = r.fullWidth
        ? [-(halfRoad + kerbWidth + 0.9), halfRoad + kerbWidth + 0.9]
        : r.latMin < 0
        ? [-(halfRoad + extraOuterWidth + 0.65)]
        : [halfRoad + extraOuterWidth + 0.65];

      for (const fLat of flagLats) {
        const fx = ls.pos.x + ls.right.x * fLat;
        const fz = ls.pos.z + ls.right.z * fLat;
        const tY = sampleTerrainHeight(fx, fz).y;
        const poleBottom = Math.min(ls.pos.y, tY) - 1.2;
        const poleTop = ls.pos.y + 5.3;
        const poleH = Math.max(4.5, poleTop - poleBottom);
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, poleH, 6);
        const pole = new THREE.Mesh(poleGeo, rampFlagPoleMat);
        pole.position.set(fx, poleBottom + poleH * 0.5, fz);
        const sideSign = Math.sign(fLat || 1);
        const flag = new THREE.Mesh(flagGeo, rampFlagMat);
        flag.position.set(
          fx + ls.right.x * sideSign * 0.78,
          poleTop - 0.52,
          fz + ls.right.z * sideSign * 0.78
        );
        flag.rotation.y = landYaw;
        group.add(pole, flag);
        disposables.push(poleGeo);
      }
    }
  }

  // 5. Track Perimeter Fences & Barriers
  // Reference-inspired warm wooden post-and-rail ranch fences along scenic right/outer stretches on Off-Road,
  // plus classic low motorsport rails on Racing & Go-Kart circuits!
  const dummy = new THREE.Object3D();
  const colorTmp = new THREE.Color();

  if (isOffroad || isRiverside) {
    // Stylized wooden post-and-rail fences curving smoothly along the dirt track edges (deeply anchored posts!)
    const fencePostGeo = new THREE.BoxGeometry(0.24, 2.05, 0.24);
    fencePostGeo.translate(0, 0.35, 0);
    const fenceRailGeo = new THREE.BoxGeometry(0.12, 0.16, 1.0);
    const woodFenceMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x4b311d : 0x7c4b24,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    });

    const postMatrices: THREE.Matrix4[] = [];
    const railMatrices: THREE.Matrix4[] = [];
    const fenceMeta: Array<{
      midX: number;
      midY: number;
      midZ: number;
      groundY: number;
      postIdx: number;
      railIdx0: number;
      railIdx1: number;
      halfD: number;
      cosYaw: number;
      sinYaw: number;
      sampleIdx: number;
    }> = [];
    const fenceStep = 3;
    for (let i = 0; i < samples.length; i += fenceStep) {
      // Keep wooden fences completely clear of flared diversion bypass lanes
      if (diversions.some((d) => i >= d.startIdx - 12 && i <= d.endIdx + 12)) continue;
      const s = samples[i];
      const sNext = samples[(i + fenceStep) % samples.length];
      for (const side of [-1, 1]) {
        // Place wooden fence on the scenic outer/right edge & select stretches so open pine meadows stay visible
        const showSection =
          side === 1 ? (i % 66 < 46) : (i % 84 >= 26 && i % 84 < 58);
        if (!showSection) continue;

        const px = s.pos.x + s.right.x * side * barrierOffset;
        const py = s.pos.y - 0.05;
        const pz = s.pos.z + s.right.z * side * barrierOffset;
        const nx = sNext.pos.x + sNext.right.x * side * barrierOffset;
        const ny = sNext.pos.y - 0.05;
        const nz = sNext.pos.z + sNext.right.z * side * barrierOffset;

        const dx = nx - px;
        const dy = ny - py;
        const dz = nz - pz;
        const segLen = Math.hypot(dx, dy, dz);
        const yaw = Math.atan2(dx, dz);

        const postIdx = postMatrices.length;
        dummy.position.set(px, py, pz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postMatrices.push(dummy.matrix.clone());

        // Upper & lower horizontal wooden fence rails connecting consecutive posts
        const railIdx0 = railMatrices.length;
        for (const railY of [0.52, 1.02]) {
          dummy.position.set((px + nx) * 0.5, (py + ny) * 0.5 + railY, (pz + nz) * 0.5);
          dummy.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), yaw, 0);
          dummy.scale.set(1, 1, segLen + 0.14);
          dummy.updateMatrix();
          railMatrices.push(dummy.matrix.clone());
        }

        const horizLen = Math.hypot(dx, dz);
        fenceMeta.push({
          midX: (px + nx) * 0.5,
          midY: (py + ny) * 0.5,
          midZ: (pz + nz) * 0.5,
          groundY: (s.pos.y + sNext.pos.y) * 0.5 + 0.05,
          postIdx,
          railIdx0,
          railIdx1: railIdx0 + 1,
          halfD: horizLen * 0.5 + 0.14,
          cosYaw: Math.cos(yaw),
          sinYaw: Math.sin(yaw),
          sampleIdx: i,
        });
      }
    }

    let postInst: THREE.InstancedMesh | null = null;
    let railInst: THREE.InstancedMesh | null = null;
    if (postMatrices.length > 0) {
      postInst = new THREE.InstancedMesh(fencePostGeo, woodFenceMat, postMatrices.length);
      postMatrices.forEach((m, idx) => postInst!.setMatrixAt(idx, m));
      postInst.instanceMatrix.needsUpdate = true;
      postInst.castShadow = !lowPower;
      postInst.computeBoundingSphere();
      group.add(postInst);
    }
    if (railMatrices.length > 0) {
      railInst = new THREE.InstancedMesh(fenceRailGeo, woodFenceMat, railMatrices.length);
      railMatrices.forEach((m, idx) => railInst!.setMatrixAt(idx, m));
      railInst.instanceMatrix.needsUpdate = true;
      railInst.castShadow = !lowPower;
      railInst.computeBoundingSphere();
      group.add(railInst);
    }
    if (postInst && railInst) {
      for (const fm of fenceMeta) {
        const breakableId = registerBreakable('fence', fm.midX, fm.midY, fm.midZ, fm.groundY, [
          { mesh: postInst, instanceId: fm.postIdx, worldMatrix: postMatrices[fm.postIdx] },
          { mesh: railInst, instanceId: fm.railIdx0, worldMatrix: railMatrices[fm.railIdx0] },
          { mesh: railInst, instanceId: fm.railIdx1, worldMatrix: railMatrices[fm.railIdx1] },
        ]);
        boxColliders.push({
          x: fm.midX,
          z: fm.midZ,
          halfW: 0.3,
          halfD: fm.halfD,
          cosYaw: fm.cosYaw,
          sinYaw: fm.sinYaw,
          sampleIdx: fm.sampleIdx,
          breakableId,
        });
      }
    }
    disposables.push(fencePostGeo, fenceRailGeo, woodFenceMat);
  } else if (isCity) {
    // Classic Italian Cast-Iron Street Curb Bollards tucked neatly onto the travertine sidewalk (knock-downable!)
    const urbanPostGeo = new THREE.CylinderGeometry(0.11, 0.15, 0.96, 8);
    urbanPostGeo.translate(0, 0.48, 0);
    const urbanPostMat = new THREE.MeshStandardMaterial({
      color: 0x1c2024,
      roughness: 0.38,
      metalness: 0.78,
    });
    const urbanCapGeo = new THREE.SphereGeometry(0.13, 7, 7);
    urbanCapGeo.translate(0, 0.98, 0);
    const urbanCapMat = new THREE.MeshStandardMaterial({
      color: 0xd4a44c,
      emissive: 0x92641a,
      emissiveIntensity: isNight ? 0.55 : 0.12,
      roughness: 0.32,
      metalness: 0.72,
    });

    const cityPostMatrices: THREE.Matrix4[] = [];
    const cityPostMeta: Array<{ x: number; y: number; z: number; groundY: number; sampleIdx: number }> = [];
    for (let i = 8; i < samples.length; i += 16) {
      // Keep narrow vicoli & flared diversion lanes open for clean high-speed city driving!
      if (getCityStreetTightness(i, samples.length) > 0.35) continue;
      if (diversions.some((d) => i >= d.startIdx - 10 && i <= d.endIdx + 10)) continue;
      const s = samples[i];
      const postLat = cityHalfRoadAt(i) + 1.18;
      for (const side of [-1, 1]) {
        const bx = s.pos.x + s.right.x * side * postLat;
        const bz = s.pos.z + s.right.z * side * postLat;
        const by = s.pos.y + 0.22;
        dummy.position.set(bx, by, bz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        cityPostMatrices.push(dummy.matrix.clone());
        cityPostMeta.push({ x: bx, y: by, z: bz, groundY: s.pos.y + 0.1, sampleIdx: i });
      }
    }
    if (cityPostMatrices.length > 0) {
      const postInst = new THREE.InstancedMesh(urbanPostGeo, urbanPostMat, cityPostMatrices.length);
      const capInst = new THREE.InstancedMesh(urbanCapGeo, urbanCapMat, cityPostMatrices.length);
      cityPostMatrices.forEach((m, idx) => {
        postInst.setMatrixAt(idx, m);
        capInst.setMatrixAt(idx, m);
        const meta = cityPostMeta[idx];
        const breakableId = registerBreakable('bollard', meta.x, meta.y, meta.z, meta.groundY, [
          { mesh: postInst, instanceId: idx, worldMatrix: m },
          { mesh: capInst, instanceId: idx, worldMatrix: m },
        ]);
        poleColliders.push({
          x: meta.x,
          z: meta.z,
          radius: 0.24,
          sampleIdx: meta.sampleIdx,
          breakableId,
        });
      });
      postInst.instanceMatrix.needsUpdate = true;
      capInst.instanceMatrix.needsUpdate = true;
      postInst.computeBoundingSphere();
      capInst.computeBoundingSphere();
      group.add(postInst, capInst);
    }
    disposables.push(urbanPostGeo, urbanPostMat, urbanCapGeo, urbanCapMat);
  } else if (isGoKart) {
    // Go-Kart Track: Authentic 3D Stacked Motorsport Tire-Barrier Fences lining both edges of the entire circuit!
    const tireTex = createTireBarrierTexture(effectiveAniso);
    const tireGeo = new THREE.TorusGeometry(0.42, 0.21, lowPower ? 8 : 10, lowPower ? 14 : 18);
    tireGeo.rotateX(Math.PI / 2);

    const tireMat = new THREE.MeshStandardMaterial({
      map: tireTex,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.04,
    });

    // Dark vulcanized rubber retaining strap & steel anchor stakes linking the tire stacks
    const strapMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x161a22 : 0x1f242e,
      roughness: 0.9,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const stakeGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.62, 6);
    stakeGeo.translate(0, 0.22, 0);
    const stakeMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.65,
    });

    // Compute lateral offset of the tire fence center (flares cleanly outside split-route bypass aprons!)
    const tireWallLatAt = (idx: number): number => {
      let extra = 0;
      for (const div of diversions) {
        const pad = 8;
        if (idx >= div.startIdx - pad && idx <= div.endIdx + pad) {
          let flare = 1.0;
          if (idx < div.startIdx) {
            const u = (idx - (div.startIdx - pad)) / pad;
            flare = u * u * (3 - 2 * u);
          } else if (idx > div.endIdx) {
            const u = (div.endIdx + pad - idx) / pad;
            flare = u * u * (3 - 2 * u);
          }
          extra = Math.max(extra, div.extraOuterWidth * flare * 0.72);
        }
      }
      // Inner rubber edge (offset - 0.63m) sits flush with physics barrierOffset + extra!
      return barrierOffset + extra + 0.56;
    };

    // Sleek matte-black rubber retaining strap behind the tire stacks binding the fence together
    const leftStrapGeo = buildVariableWallGeometry(samples, (i) => -(tireWallLatAt(i) + 0.42), 0.26);
    const rightStrapGeo = buildVariableWallGeometry(samples, (i) => tireWallLatAt(i) + 0.42, 0.26);
    const leftStrap = new THREE.Mesh(leftStrapGeo, strapMat);
    const rightStrap = new THREE.Mesh(rightStrapGeo, strapMat);
    leftStrap.position.y = 0.34;
    rightStrap.position.y = 0.34;
    group.add(leftStrap, rightStrap);
    disposables.push(leftStrapGeo, rightStrapGeo, strapMat);

    const tireMatrices: THREE.Matrix4[] = [];
    const tireColors: THREE.Color[] = [];
    const tireMeta: Array<{
      x: number;
      y: number;
      z: number;
      groundY: number;
      sampleIdx: number;
      tier: number;
      side: number;
    }> = [];
    const stakeMatrices: THREE.Matrix4[] = [];

    const colRed = new THREE.Color(isNight ? 0xb91c1c : 0xdc2626);
    const colWhite = new THREE.Color(isNight ? 0xcbd5e1 : 0xf1f5f9);
    const colBlack = new THREE.Color(isNight ? 0x1e222a : 0x2a2f3a);
    const tmpColor = new THREE.Color();

    const spacing = 1.24; // Close edge-to-edge tire stacks (outer diameter 1.26m)
    const sampleCount = samples.length;

    for (const side of [-1, 1] as const) {
      let carryDist = 0;
      let stackCounter = 0;

      for (let i = 0; i < sampleCount; i++) {
        const s0 = samples[i];
        const s1 = samples[(i + 1) % sampleCount];
        const lat0 = side * tireWallLatAt(i);
        const lat1 = side * tireWallLatAt((i + 1) % sampleCount);

        const x0 = s0.pos.x + s0.right.x * lat0;
        const y0 = s0.pos.y;
        const z0 = s0.pos.z + s0.right.z * lat0;

        const x1 = s1.pos.x + s1.right.x * lat1;
        const y1 = s1.pos.y;
        const z1 = s1.pos.z + s1.right.z * lat1;

        const segLen = Math.hypot(x1 - x0, z1 - z0);
        if (segLen < 0.01) continue;

        // Determine if this edge is the outside of a sharp drift corner (for taller 3-tier tire walls!)
        const nextS = samples[(i + 4) % sampleCount];
        const crossY = s0.tangent.z * nextS.tangent.x - s0.tangent.x * nextS.tangent.z;
        const isOutsideCurve =
          s0.curvature > 0.11 && ((side === 1 && crossY < -0.02) || (side === -1 && crossY > 0.02));
        const tiers = isOutsideCurve && s0.curvature > 0.145 ? 3 : 2;

        let d = carryDist;
        while (d < segLen) {
          const frac = d / segLen;
          const bx = x0 + (x1 - x0) * frac;
          const by = y0 + (y1 - y0) * frac;
          const bz = z0 + (z1 - z0) * frac;
          const absStackLat = Math.abs(lat0 + (lat1 - lat0) * frac);
          const groundSupportY = sampleRoadsideGroundY(bx, bz, by, absStackLat);

          // Classic alternating karting blocks: 4 Red stacks, 4 White stacks, with dark rubber base/accent tires
          const blockIdx = Math.floor(stackCounter / 4);
          const isRedBlock = blockIdx % 2 === 0;
          const isAccentBlackStack = stackCounter % 8 === 3 || stackCounter % 8 === 7;

          for (let tier = 0; tier < tiers; tier++) {
            const hash = Math.sin(stackCounter * 12.9898 + tier * 78.233 + side * 31.7) * 43758.5453;
            const jitter = (hash - Math.floor(hash) - 0.5) * 0.045;
            const rotY = (hash - Math.floor(hash)) * Math.PI * 2;
            const tx = bx + jitter;
            const ty = groundSupportY + 0.19 + tier * 0.415;
            const tz = bz - jitter;

            dummy.position.set(tx, ty, tz);
            dummy.rotation.set(0, rotY, 0);
            dummy.scale.set(1.0, 1.0, 1.0);
            dummy.updateMatrix();
            tireMatrices.push(dummy.matrix.clone());
            tireMeta.push({
              x: tx,
              y: ty,
              z: tz,
              groundY: groundSupportY,
              sampleIdx: i,
              tier,
              side,
            });

            // Alternate raw dark rubber tires on bottom tier of every other stack for authentic karting look
            if (isAccentBlackStack || (tier === 0 && stackCounter % 2 === 1)) {
              tmpColor.copy(colBlack);
            } else {
              tmpColor.copy(isRedBlock ? colRed : colWhite);
            }
            // Subtle per-tire shade variation so stacks look tactile & hand-built
            const shade = 0.92 + ((hash - Math.floor(hash)) * 0.14);
            tmpColor.multiplyScalar(shade);
            tireColors.push(tmpColor.clone());
          }

          // Steel anchor stake behind every 4th tire stack
          if (stackCounter % 4 === 0) {
            const rx = s0.right.x * side;
            const rz = s0.right.z * side;
            dummy.position.set(bx + rx * 0.62, groundSupportY, bz + rz * 0.62);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, tiers === 3 ? 1.25 : 1.0, 1);
            dummy.updateMatrix();
            stakeMatrices.push(dummy.matrix.clone());
          }

          stackCounter++;
          d += spacing;
        }
        carryDist = d - segLen;
      }
    }

    if (tireMatrices.length > 0) {
      const tireInst = new THREE.InstancedMesh(tireGeo, tireMat, tireMatrices.length);
      for (let i = 0; i < tireMatrices.length; i++) {
        tireInst.setMatrixAt(i, tireMatrices[i]);
        tireInst.setColorAt(i, tireColors[i]);
        const tm = tireMeta[i];
        const bId = registerBreakable('tyre', tm.x, tm.y, tm.z, tm.groundY, [
          { mesh: tireInst, instanceId: i, worldMatrix: tireMatrices[i] },
        ]);
        const prop = breakables[bId];
        prop.sampleIdx = tm.sampleIdx;
        prop.tier = tm.tier;
        prop.side = tm.side;
        prop.baseGroundY = tm.groundY;
        prop.hitCooldown = 0;
      }
      tireInst.instanceMatrix.needsUpdate = true;
      if (tireInst.instanceColor) tireInst.instanceColor.needsUpdate = true;
      tireInst.castShadow = !lowPower;
      tireInst.receiveShadow = true;
      tireInst.frustumCulled = false;
      tireInst.computeBoundingSphere();
      group.add(tireInst);
    }

    if (stakeMatrices.length > 0) {
      const stakeInst = new THREE.InstancedMesh(stakeGeo, stakeMat, stakeMatrices.length);
      for (let i = 0; i < stakeMatrices.length; i++) {
        stakeInst.setMatrixAt(i, stakeMatrices[i]);
      }
      stakeInst.instanceMatrix.needsUpdate = true;
      stakeInst.computeBoundingSphere();
      group.add(stakeInst);
    }

    disposables.push(tireTex, tireGeo, tireMat, stakeGeo, stakeMat);
  } else {
    // Racing Track / Hill / Stadium (Armco barrier)
    const leftRailGeo = buildGuardrailGeometry(samples, -barrierOffset, 1.08);
    const rightRailGeo = buildGuardrailGeometry(samples, barrierOffset, 1.08);
    const railMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x64748b : 0xdbe4ef,
      roughness: 0.4,
      metalness: 0.65,
      side: THREE.DoubleSide,
    });
    const leftRail = new THREE.Mesh(leftRailGeo, railMat);
    const rightRail = new THREE.Mesh(rightRailGeo, railMat);
    leftRail.castShadow = !lowPower;
    rightRail.castShadow = !lowPower;
    group.add(leftRail, rightRail);
    disposables.push(leftRailGeo, rightRailGeo, railMat);

    // Decorative wooden ranch fencing outside the perimeter on Racing/Hill meadow corners
    const extPostGeo = new THREE.BoxGeometry(0.24, 1.8, 0.24);
    extPostGeo.translate(0, 0.42, 0);
    const extRailGeo = new THREE.BoxGeometry(0.11, 0.15, 1.0);
    const extWoodMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x4b311d : 0x7e4d26,
      roughness: 0.9,
      flatShading: true,
    });
    const extPosts: THREE.Matrix4[] = [];
    const extRails: THREE.Matrix4[] = [];
    const extFenceMeta: Array<{
      midX: number;
      midY: number;
      midZ: number;
      postIdx: number;
      railIdx0: number;
      railIdx1: number;
      halfD: number;
      cosYaw: number;
      sinYaw: number;
      sampleIdx: number;
    }> = [];
    for (let i = 36; i < samples.length - 20; i += 4) {
      if (i % 90 > 44) continue;
      const s = samples[i];
      const sNext = samples[(i + 4) % samples.length];
      const lat = barrierOffset + 3.2;
      const px = s.pos.x + s.right.x * lat;
      const pz = s.pos.z + s.right.z * lat;
      const nx = sNext.pos.x + sNext.right.x * lat;
      const nz = sNext.pos.z + sNext.right.z * lat;
      const py = sampleRoadsideGroundY(px, pz, s.pos.y, lat);
      const ny = sampleRoadsideGroundY(nx, nz, sNext.pos.y, lat);
      const dx = nx - px;
      const dy = ny - py;
      const dz = nz - pz;
      const segLen = Math.hypot(dx, dy, dz);
      const yaw = Math.atan2(dx, dz);

      const postIdx = extPosts.length;
      dummy.position.set(px, py, pz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      extPosts.push(dummy.matrix.clone());

      const railIdx0 = extRails.length;
      for (const ry of [0.48, 0.96]) {
        dummy.position.set((px + nx) * 0.5, (py + ny) * 0.5 + ry, (pz + nz) * 0.5);
        dummy.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), yaw, 0);
        dummy.scale.set(1, 1, segLen + 0.14);
        dummy.updateMatrix();
        extRails.push(dummy.matrix.clone());
      }

      const horizLen = Math.hypot(dx, dz);
      extFenceMeta.push({
        midX: (px + nx) * 0.5,
        midY: (py + ny) * 0.5,
        midZ: (pz + nz) * 0.5,
        postIdx,
        railIdx0,
        railIdx1: railIdx0 + 1,
        halfD: horizLen * 0.5 + 0.14,
        cosYaw: Math.cos(yaw),
        sinYaw: Math.sin(yaw),
        sampleIdx: i,
      });
    }
    let extPInst: THREE.InstancedMesh | null = null;
    let extRInst: THREE.InstancedMesh | null = null;
    if (extPosts.length > 0) {
      extPInst = new THREE.InstancedMesh(extPostGeo, extWoodMat, extPosts.length);
      extPosts.forEach((m, idx) => extPInst!.setMatrixAt(idx, m));
      extPInst.instanceMatrix.needsUpdate = true;
      extPInst.computeBoundingSphere();
      group.add(extPInst);
    }
    if (extRails.length > 0) {
      extRInst = new THREE.InstancedMesh(extRailGeo, extWoodMat, extRails.length);
      extRails.forEach((m, idx) => extRInst!.setMatrixAt(idx, m));
      extRInst.instanceMatrix.needsUpdate = true;
      extRInst.computeBoundingSphere();
      group.add(extRInst);
    }
    if (extPInst && extRInst) {
      for (const fm of extFenceMeta) {
        const breakableId = registerBreakable('fence', fm.midX, fm.midY, fm.midZ, fm.midY + 0.06, [
          { mesh: extPInst, instanceId: fm.postIdx, worldMatrix: extPosts[fm.postIdx] },
          { mesh: extRInst, instanceId: fm.railIdx0, worldMatrix: extRails[fm.railIdx0] },
          { mesh: extRInst, instanceId: fm.railIdx1, worldMatrix: extRails[fm.railIdx1] },
        ]);
        boxColliders.push({
          x: fm.midX,
          z: fm.midZ,
          halfW: 0.3,
          halfD: fm.halfD,
          cosYaw: fm.cosYaw,
          sinYaw: fm.sinYaw,
          sampleIdx: fm.sampleIdx,
          breakableId,
        });
      }
    }
    disposables.push(extPostGeo, extRailGeo, extWoodMat);
  }

  // 6. Iconic Red-and-White Trackside Marker Bollards (non-city circuits — knock-downable!)
  if (!isCity) {
    const bollardGeo = new THREE.CylinderGeometry(0.16, 0.18, 1.65, 8);
    bollardGeo.translate(0, 0.52, 0);
    const bollardMat = new THREE.MeshStandardMaterial({
      map: bollardTex,
      roughness: 0.42,
      metalness: 0.08,
      emissive: isNight ? 0x3b1818 : 0x000000,
      emissiveIntensity: isNight ? 0.5 : 0,
    });
    const bollardMatrices: THREE.Matrix4[] = [];
    const bollardMeta: Array<{ x: number; y: number; z: number; groundY: number; sampleIdx: number }> = [];
    const bollardStep = isGoKart ? 10 : 8;
    for (let i = 14; i < samples.length - 8; i += bollardStep) {
      if (diversions.some((d) => i >= d.startIdx - 8 && i <= d.endIdx + 8)) continue;
      const s = samples[i];
      const bollardLat = halfRoad + kerbWidth + (isOffroad ? 2.4 : runOffWidth + 1.15);
      const sides = isOffroad ? [-1, 1] : [-1];
      for (const side of sides) {
        if (isOffroad && side === 1 && i % 66 < 46) continue;
        const bx = s.pos.x + s.right.x * side * bollardLat;
        const bz = s.pos.z + s.right.z * side * bollardLat;
        const groundY = sampleRoadsideGroundY(bx, bz, s.pos.y, bollardLat);
        const by = groundY - 0.02;
        dummy.position.set(bx, by, bz);
        dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bollardMatrices.push(dummy.matrix.clone());
        bollardMeta.push({ x: bx, y: by, z: bz, groundY, sampleIdx: i });
      }
    }
    if (bollardMatrices.length > 0) {
      const bollardInst = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardMatrices.length);
      bollardMatrices.forEach((m, idx) => {
        bollardInst.setMatrixAt(idx, m);
        const meta = bollardMeta[idx];
        const breakableId = registerBreakable('bollard', meta.x, meta.y, meta.z, meta.groundY, [
          { mesh: bollardInst, instanceId: idx, worldMatrix: m },
        ]);
        poleColliders.push({
          x: meta.x,
          z: meta.z,
          radius: 0.26,
          sampleIdx: meta.sampleIdx,
          breakableId,
        });
      });
      bollardInst.instanceMatrix.needsUpdate = true;
      bollardInst.castShadow = !lowPower;
      bollardInst.computeBoundingSphere();
      group.add(bollardInst);
    }
    disposables.push(bollardGeo, bollardMat);
  }

  // 7. Start / Finish Line Strip + Starting Grid Boxes + Overhead Gantry
  const startSample = samples[0];
  const startAngle = Math.atan2(startSample.tangent.x, startSample.tangent.z);

  const lineGeo = new THREE.PlaneGeometry(roadWidth - 0.6, 3.6);
  lineGeo.rotateX(-Math.PI / 2);
  const lineMat = new THREE.MeshStandardMaterial({
    map: checkerTex,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const startLine = new THREE.Mesh(lineGeo, lineMat);
  startLine.position.set(startSample.pos.x, startSample.pos.y + 0.12, startSample.pos.z);
  startLine.rotation.y = startAngle;
  group.add(startLine);
  disposables.push(lineGeo, lineMat);

  const gridLineGeo = new THREE.PlaneGeometry(2.5, 0.26);
  gridLineGeo.rotateX(-Math.PI / 2);
  const gridSideGeo = new THREE.PlaneGeometry(0.22, 2.1);
  gridSideGeo.rotateX(-Math.PI / 2);
  const gridMat = new THREE.MeshBasicMaterial({
    color: 0xf8fafc,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  for (let slot = 0; slot < 15; slot++) {
    const backIdx = (samples.length - (4 + slot * 3)) % samples.length;
    const gs = samples[backIdx];
    const laneSign = slot % 2 === 0 ? -1 : 1;
    const lat = laneSign * (isGoKart ? 2.4 : 2.9);
    const slotGroup = new THREE.Group();
    slotGroup.position.set(
      gs.pos.x + gs.right.x * lat,
      gs.pos.y + 0.12,
      gs.pos.z + gs.right.z * lat
    );
    slotGroup.rotation.y = Math.atan2(gs.tangent.x, gs.tangent.z);
    const frontBar = new THREE.Mesh(gridLineGeo, gridMat);
    frontBar.position.set(0, 0, 2.4);
    const leftBar = new THREE.Mesh(gridSideGeo, gridMat);
    leftBar.position.set(-1.14, 0, 1.45);
    const rightBar = new THREE.Mesh(gridSideGeo, gridMat);
    rightBar.position.set(1.14, 0, 1.45);
    slotGroup.add(frontBar, leftBar, rightBar);
    group.add(slotGroup);
  }
  disposables.push(gridLineGeo, gridSideGeo, gridMat);

  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSample.pos);
  gantryGroup.rotation.y = startAngle;

  // Deeply anchored gantry pillars extending 2.4m below track datum so they never float on sloped/embanked starts
  const pillarGeo = new THREE.BoxGeometry(1.1, 11.0, 1.3);
  const gantryMetalMat = new THREE.MeshStandardMaterial({
    color: isOffroad ? 0x1e293b : 0x162235,
    roughness: 0.4,
    metalness: 0.55,
  });
  const leftPillar = new THREE.Mesh(pillarGeo, gantryMetalMat);
  leftPillar.position.set(-(halfRoad + 2.4), 3.1, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, gantryMetalMat);
  rightPillar.position.set(halfRoad + 2.4, 3.1, 0);
  for (const side of [-1, 1]) {
    poleColliders.push({
      x: startSample.pos.x + startSample.right.x * side * (halfRoad + 2.4),
      z: startSample.pos.z + startSample.right.z * side * (halfRoad + 2.4),
      radius: 0.65,
      sampleIdx: 0,
    });
  }

  const bridgeGeo = new THREE.BoxGeometry(roadWidth + 6.2, 2.2, 1.45);
  const bridgeBannerMat = new THREE.MeshStandardMaterial({
    map: gantryBannerTex,
    roughness: 0.38,
    metalness: 0.25,
    emissive: 0x1e293b,
    emissiveIntensity: isNight ? 0.65 : 0.15,
  });
  const bridgeMesh = new THREE.Mesh(bridgeGeo, [
    gantryMetalMat,
    gantryMetalMat,
    gantryMetalMat,
    gantryMetalMat,
    bridgeBannerMat,
    bridgeBannerMat,
  ]);
  bridgeMesh.position.set(0, 7.8, 0);

  const accentBarGeo = new THREE.BoxGeometry(roadWidth + 5.8, 0.28, 1.55);
  const accentBarMat = new THREE.MeshStandardMaterial({
    color: 0xffd014,
    emissive: 0xffd014,
    emissiveIntensity: isNight ? 1.4 : 0.35,
    roughness: 0.3,
  });
  const accentBar = new THREE.Mesh(accentBarGeo, accentBarMat);
  accentBar.position.set(0, 6.62, 0);

  const podGeo = new THREE.BoxGeometry(1.1, 0.5, 0.38);
  const podMat = new THREE.MeshStandardMaterial({
    color: 0xe5252b,
    emissive: 0xe5252b,
    emissiveIntensity: isNight ? 1.6 : 0.85,
    roughness: 0.2,
  });
  for (let p = -2; p <= 2; p++) {
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.set(p * 2.1, 6.22, 0.78);
    gantryGroup.add(pod);
  }

  gantryGroup.add(leftPillar, rightPillar, bridgeMesh, accentBar);
  group.add(gantryGroup);
  disposables.push(pillarGeo, gantryMetalMat, bridgeGeo, bridgeBannerMat, accentBarGeo, accentBarMat, podGeo, podMat);

  // 8. Start-Straight Grandstands / Pit Canopies (for Racing, Stadium & Go-Kart; open alpine for Off-Road; city blocks for City!)
  if (!isOffroad && !isCity && !isStadium) {
    const standBaseH = isGoKart ? 4.2 : 6.5;
    const standPlinthDepth = 4.0;
    const standGeo = new THREE.BoxGeometry(isGoKart ? 5.5 : 8, standBaseH + standPlinthDepth, isGoKart ? 26 : 42);
    const standRoofGeo = new THREE.BoxGeometry(isGoKart ? 6.8 : 9.5, 0.45, isGoKart ? 28 : 44);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.2 });
    const roofMat = new THREE.MeshStandardMaterial({
      color: isGoKart ? 0xdc2626 : 0xf1f5f9,
      roughness: 0.4,
      metalness: 0.35,
    });

    for (const side of [-1, 1]) {
      const stand = new THREE.Group();
      const base = new THREE.Mesh(standGeo, standMat);
      // Extends 4.0m below datum into terrain so grandstands never hover on hillsides from any camera angle
      base.position.y = (standBaseH - standPlinthDepth) * 0.5;
      base.castShadow = !lowPower;
      const roof = new THREE.Mesh(standRoofGeo, roofMat);
      roof.position.y = isGoKart ? 4.8 : 7.4;
      stand.add(base, roof);
      const gx = startSample.pos.x + startSample.right.x * side * (barrierOffset + (isGoKart ? 7.5 : 10));
      const gz = startSample.pos.z - (isGoKart ? 14 : 22);
      const standY = Math.min(startSample.pos.y, sampleMeshGroundY(gx, gz) + 0.15);
      stand.position.set(gx, standY, gz);
      group.add(stand);
      boxColliders.push({
        x: gx,
        z: gz,
        halfW: isGoKart ? 2.75 : 4.0,
        halfD: isGoKart ? 13.0 : 21.0,
        cosYaw: 1,
        sinYaw: 0,
        sampleIdx: 0,
      });
    }
    disposables.push(standGeo, standRoofGeo, standMat, roofMat);
  }

  // Helper: check clearance from track centerline
  const isClearOfTrack = (x: number, z: number, minClearance: number): boolean => {
    const minSq = minClearance * minClearance;
    for (let i = 0; i < samples.length; i += 4) {
      const dx = samples[i].pos.x - x;
      const dz = samples[i].pos.z - z;
      if (dx * dx + dz * dz < minSq) return false;
    }
    return true;
  };

  // City-aware clearance check that accounts for narrow small-street corridors vs wide downtown boulevards
  const isClearOfCityRoad = (x: number, z: number, halfFootprint: number): boolean => {
    for (let i = 0; i < samples.length; i += 3) {
      const s = samples[i];
      const dx = s.pos.x - x;
      const dz = s.pos.z - z;
      const localClear = cityBarrierOffsetAt(i) + halfFootprint;
      if (dx * dx + dz * dz < localClear * localClear) return false;
    }
    return true;
  };

  // 9. Collidable Trackside Streetlamp Poles (Ornate Cast-Iron Italian Globe Lamps on City Track; Floodlights on Night/Stadium/Go-Kart)
  if (isNight || isGoKart || isCity || isStadium) {
    const postGeo = isCity
      ? new THREE.CylinderGeometry(0.11, 0.24, 6.8, 8)
      : new THREE.CylinderGeometry(0.13, 0.19, 9.8, 6);
    postGeo.translate(0, isCity ? 3.4 : 3.7, 0);
    const postMat = new THREE.MeshStandardMaterial({
      color: isCity ? 0x1a1e22 : 0x475569,
      roughness: isCity ? 0.38 : 0.45,
      metalness: isCity ? 0.78 : 0.72,
    });
    const lampBulbGeo = isCity
      ? new THREE.SphereGeometry(0.36, 8, 8)
      : new THREE.BoxGeometry(1.6, 0.28, 0.48);
    const lampBulbMat = new THREE.MeshStandardMaterial({
      color: isCity ? 0xfff8e1 : isNight ? 0xfef9c3 : 0xe2e8f0,
      emissive: isCity ? (isNight ? 0xffbf5e : isEvening ? 0xffcf77 : 0xfff3c4) : isNight ? 0xf59e0b : 0x000000,
      emissiveIntensity: isCity ? (isNight ? 2.4 : isEvening ? 1.55 : 0.45) : isNight ? 2.2 : 0.0,
      roughness: 0.18,
    });

    const step = isGoKart ? 24 : isCity ? 24 : 20;
    const lampIndices: number[] = [];
    for (let i = 0; i < samples.length; i += step) {
      // Keep City Track flared diversion lanes clear of side poles
      if (isCity && diversions.some((d) => i >= d.startIdx - 8 && i <= d.endIdx + 8)) continue;
      lampIndices.push(i);
    }

    const postInst = new THREE.InstancedMesh(postGeo, postMat, lampIndices.length * 2);
    const bulbInst = new THREE.InstancedMesh(lampBulbGeo, lampBulbMat, lampIndices.length * 2);
    // Decorative wrought-iron lantern collars & bracket arms for authentic Italian streetlamps
    const armGeo = isCity ? new THREE.BoxGeometry(0.95, 0.1, 0.1) : null;
    const armInst = isCity && armGeo ? new THREE.InstancedMesh(armGeo, postMat, lampIndices.length * 2) : null;
    let idx = 0;
    for (const si of lampIndices) {
      const s = samples[si];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      // Plant streetlamps cleanly back on the sidewalk so main road stays clear & hits knock poles down!
      const poleLat = isCity ? cityHalfRoadAt(si) + 1.08 : barrierOffset - 0.15;
      for (const side of [-1, 1]) {
        const px = s.pos.x + s.right.x * side * poleLat;
        const py = s.pos.y + (isCity ? 0.18 : 0);
        const pz = s.pos.z + s.right.z * side * poleLat;
        dummy.position.set(px, py, pz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        const postMat4 = dummy.matrix.clone();
        postInst.setMatrixAt(idx, postMat4);

        const parts: Array<{ mesh: THREE.InstancedMesh; instanceId: number; worldMatrix: THREE.Matrix4 }> = [
          { mesh: postInst, instanceId: idx, worldMatrix: postMat4 },
        ];

        if (isCity) {
          if (armInst) {
            dummy.position.set(px - s.right.x * side * 0.42, s.pos.y + 6.72, pz - s.right.z * side * 0.42);
            dummy.rotation.set(0, yaw, 0);
            dummy.updateMatrix();
            const armMat4 = dummy.matrix.clone();
            armInst.setMatrixAt(idx, armMat4);
            parts.push({ mesh: armInst, instanceId: idx, worldMatrix: armMat4 });
          }
          dummy.position.set(px - s.right.x * side * 0.78, s.pos.y + 7.04, pz - s.right.z * side * 0.78);
        } else {
          dummy.position.set(px - s.right.x * side * 1.1, s.pos.y + 8.4, pz - s.right.z * side * 1.1);
        }
        dummy.updateMatrix();
        const bulbMat4 = dummy.matrix.clone();
        bulbInst.setMatrixAt(idx, bulbMat4);
        parts.push({ mesh: bulbInst, instanceId: idx, worldMatrix: bulbMat4 });

        // Register every streetlamp pole as a knock-downable BreakableProp!
        const breakableId = registerBreakable('pole', px, py, pz, s.pos.y + 0.1, parts);
        poleColliders.push({
          x: px,
          z: pz,
          radius: isCity ? 0.26 : 0.34,
          sampleIdx: si,
          breakableId,
        });
        idx++;
      }
    }
    postInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    postInst.computeBoundingSphere();
    bulbInst.computeBoundingSphere();
    group.add(postInst, bulbInst);
    if (armInst && armGeo) {
      armInst.instanceMatrix.needsUpdate = true;
      armInst.computeBoundingSphere();
      group.add(armInst);
      disposables.push(armGeo);
    }
    disposables.push(postGeo, postMat, lampBulbGeo, lampBulbMat);
  }

  // =========================================================================
  // 10. REFERENCE-ART TRACKSIDE SCENERY:
  //     - Sparkling Trackside Alpine Ponds (turquoise water + pebble banks)
  //     - 4-Part Stylized Layered Low-Poly Pine Forests
  //     - Faceted Angular Grey Boulders
  //     - Lush Low-Poly Meadow Bushes & Shrub Tufts
  //     - Fallen Bark Timber Logs with Tan Cut Ends
  // =========================================================================
  let seed = isOffroad ? 991 : isGoKart ? 547 : 217;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // A. Scenic Sparkling Turquoise Trackside Ponds (alpine / natural tracks only — never in City!)
  const pondCenters: Array<{ x: number; y: number; z: number; rx: number; rz: number }> = [];
  if (!isCity) {
    // Keep ponds in naturally level meadow clearings (never on steep hillsides like off-road start!)
    const candidatePondIndices = isGoKart
      ? [45, 295]
      : isOffroad || isHill
      ? [155, 285, 465]
      : [34, 210, 440];
    const pondWaterMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x113654 : isEvening ? 0x3b8fb8 : 0x2eb2e8,
      roughness: 0.16,
      metalness: 0.25,
      flatShading: true,
    });
    const pondBankMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x4b463d : 0xd2bf9b,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    });
    const pondCircleGeo = new THREE.CircleGeometry(1, 16);
    pondCircleGeo.rotateX(-Math.PI / 2);
    // Deep flared earthen shoreline basin (12m downward skirt) so pond edges ALWAYS anchor deeply into terrain!
    const pondBasinGeo = new THREE.CylinderGeometry(1.0, 1.38, 12.0, 16);
    pondBasinGeo.translate(0, -6.0, 0);
    disposables.push(pondWaterMat, pondBankMat, pondCircleGeo, pondBasinGeo);

    for (const si of candidatePondIndices) {
      const s = samples[si % samples.length];
      const rx = isGoKart ? 11 : isOffroad || isHill ? 13 : 17;
      const rz = isGoKart ? 18 : isOffroad || isHill ? 20 : 28;
      const dist = barrierOffset + rx + 8.5;
      const px = s.pos.x + s.right.x * dist;
      const pz = s.pos.z + s.right.z * dist;
      if (!isClearOfTrack(px, pz, barrierOffset + rx + 4.0)) continue;

      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const probeOffsets: Array<[number, number]> = [
        [0, 0],
        [rx, 0],
        [-rx, 0],
        [0, rz],
        [0, -rz],
        [rx * 0.72, rz * 0.72],
        [-rx * 0.72, rz * 0.72],
        [rx * 0.72, -rz * 0.72],
        [-rx * 0.72, -rz * 0.72],
      ];
      let minH = Infinity;
      let maxH = -Infinity;
      let sumH = 0;
      for (const [lx, lz] of probeOffsets) {
        const wx = px + lx * cosY + lz * sinY;
        const wz = pz - lx * sinY + lz * cosY;
        const h = sampleMeshGroundY(wx, wz);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        sumH += h;
      }
      // Never place a flat pond basin across a steep hillside where it would protrude like floating land!
      if (maxH - minH > 2.2) continue;

      const avgH = sumH / probeOffsets.length;
      const py = Math.max(avgH + 0.08, maxH - 0.18);

      const bankMesh = new THREE.Mesh(pondBasinGeo, pondBankMat);
      bankMesh.position.set(px, py - 0.04, pz);
      bankMesh.rotation.y = yaw;
      bankMesh.scale.set(rx + 2.4, 1, rz + 2.6);
      group.add(bankMesh);

      const waterMesh = new THREE.Mesh(pondCircleGeo, pondWaterMat);
      waterMesh.position.set(px, py + 0.04, pz);
      waterMesh.rotation.y = yaw;
      waterMesh.scale.set(rx, 1, rz);
      group.add(waterMesh);

      pondCenters.push({ x: px, y: py, z: pz, rx: rx + 3.5, rz: rz + 3.5 });
    }
  }

  const isInsidePond = (x: number, z: number): boolean => {
    for (const p of pondCenters) {
      const dx = (x - p.x) / p.rx;
      const dz = (z - p.z) / p.rz;
      if (dx * dx + dz * dz < 1.15) return true;
    }
    return false;
  };

  // B. 4-Part Layered Stylized Low-Poly Pine Trees (flared bark trunk with deep root base + 3 stacked green cone tiers!)
  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.78, 5.2, 7);
  trunkGeo.translate(0, 1.8, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x452814 : 0x8e4e24,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true,
  });

  const tier1Geo = new THREE.ConeGeometry(3.45, 4.9, 7);
  tier1Geo.translate(0, 5.5, 0);
  const tier1Mat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1b4720 : 0x2f8e27,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });

  const tier2Geo = new THREE.ConeGeometry(2.75, 4.7, 7);
  tier2Geo.translate(0, 8.2, 0);
  const tier2Mat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x235927 : 0x49b82c,
    roughness: 0.80,
    metalness: 0.02,
    flatShading: true,
  });

  const tier3Geo = new THREE.ConeGeometry(1.95, 4.3, 7);
  tier3Geo.translate(0, 10.8, 0);
  const tier3Mat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x2d6d2d : 0x6dd136,
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true,
  });

  // =========================================================================
  // 10B. SPECIALTY TRACK LANDMARKS (City Skyline, Riverside River, Stadium Bowl)
  // =========================================================================
  if (isRiverside) {
    // Wide sparkling turquoise river winding parallel along the outer right side of Riverside Track!
    const riverRibbonGeo = buildRibbonGeometry(
      samples,
      barrierOffset + 6.5,
      barrierOffset + 48.0,
      -0.38,
      0.04,
      length
    );
    const riverMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x104062 : isEvening ? 0x2e88b5 : 0x22b8eb,
      roughness: 0.14,
      metalness: 0.28,
      side: THREE.DoubleSide,
    });
    const riverMesh = new THREE.Mesh(riverRibbonGeo, riverMat);
    group.add(riverMesh);

    // Sandy pebble river embankment bridging track to water
    const bankGeo = buildRibbonGeometry(
      samples,
      barrierOffset + 1.2,
      barrierOffset + 8.5,
      -0.25,
      0.06,
      length
    );
    const bankMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x4b463d : 0xd6c096,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const bankMesh = new THREE.Mesh(bankGeo, bankMat);
    group.add(bankMesh);
    disposables.push(riverRibbonGeo, riverMat, bankGeo, bankMat);
  }

  if (isCity) {
    // =========================================================================
    // AUTHENTIC ITALIAN STREET VIEW (ROME / FLORENCE / TRASTEVERE PIAZZA & VICOLI)
    //   1. Warm Tuscan terracotta, Roman ochre, Venetian rose & sandstone palazzos with green persiane shutters
    //   2. Pitched terracotta barrel-tile roofs (coppi) & cream travertine cornices
    //   3. Wrought-iron Juliet balconies with terracotta flower boxes bursting with red geraniums
    //   4. Slanted Italian striped cafe awnings + hanging Trattoria / Gelateria / Caffe signboards
    //   5. Retro Vespa scooters, terracotta olive/cypress planter pots, piazza bistro umbrellas
    //   6. Warm Edison cafe string lights, Italian tricolore bunting & collidable twin-globe piazza median lamps!
    // =========================================================================
    const terracottaTex = createCityFacadeTexture('tuscan-terracotta', isNight, effectiveAniso);
    const ochreTex = createCityFacadeTexture('roman-ochre', isNight, effectiveAniso);
    const roseTex = createCityFacadeTexture('venetian-rose', isNight, effectiveAniso);
    const vicoloTex = createCityFacadeTexture('vicolo-stone', isNight, effectiveAniso);
    const trattoriaSignTex = createItalianSignTexture('TRATTORIA', '#7f1d1d', effectiveAniso);
    const gelatoSignTex = createItalianSignTexture('GELATERIA', '#15803d', effectiveAniso);

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    unitBoxGeo.translate(0, 0.5, 0);

    // Pitched Italian terracotta barrel-tile roof cap (4-sided hip roof!)
    const pitchedRoofGeo = new THREE.ConeGeometry(0.75, 1.0, 4);
    pitchedRoofGeo.rotateY(Math.PI / 4);
    pitchedRoofGeo.translate(0, 0.5, 0);

    // Slanted Italian canvas cafe awning overhanging ground-floor trattorias & gelaterias
    const slantedAwningGeo = new THREE.BoxGeometry(2.2, 0.14, 1.0);
    slantedAwningGeo.rotateZ(0.28);

    // Ornate wrought-iron Juliet balcony + terracotta flower box + lush red geranium cluster!
    const balconyFloorGeo = new THREE.BoxGeometry(1.15, 0.16, 2.5);
    const balconyRailGeo = new THREE.BoxGeometry(0.12, 0.92, 2.46);
    balconyRailGeo.translate(-0.5, 0.52, 0);
    const flowerBoxGeo = new THREE.BoxGeometry(0.32, 0.28, 1.9);
    flowerBoxGeo.translate(-0.58, 0.95, 0);
    const geraniumGeo = new THREE.BoxGeometry(0.42, 0.34, 1.82);
    geraniumGeo.translate(-0.62, 1.18, 0);
    const hangingSignGeo = new THREE.BoxGeometry(0.12, 1.05, 1.65);

    const emScale = isNight ? 1.35 : isEvening ? 0.95 : 0.32;
    const terracottaMat = new THREE.MeshStandardMaterial({
      map: terracottaTex.map,
      emissiveMap: terracottaTex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: emScale,
      roughness: 0.84,
      metalness: 0.04,
    });
    const ochreMat = new THREE.MeshStandardMaterial({
      map: ochreTex.map,
      emissiveMap: ochreTex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: emScale,
      roughness: 0.84,
      metalness: 0.04,
    });
    const roseMat = new THREE.MeshStandardMaterial({
      map: roseTex.map,
      emissiveMap: roseTex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: emScale,
      roughness: 0.84,
      metalness: 0.04,
    });
    const vicoloMat = new THREE.MeshStandardMaterial({
      map: vicoloTex.map,
      emissiveMap: vicoloTex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: emScale,
      roughness: 0.88,
      metalness: 0.04,
    });
    const roofTileMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x5c2d1f : 0xb34c2e,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: true,
    });
    const corniceMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x4b443c : 0xebe2d2,
      roughness: 0.84,
      metalness: 0.04,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x1c2024,
      roughness: 0.42,
      metalness: 0.72,
    });
    const flowerPotMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x6b341f : 0xc25932,
      roughness: 0.85,
    });
    const geraniumMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x991b1b : 0xe11d48,
      roughness: 0.78,
    });
    const awningMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.08,
    });
    const trattoriaSignMat = new THREE.MeshStandardMaterial({
      map: trattoriaSignTex,
      emissiveMap: trattoriaSignTex,
      emissive: 0xffe4b5,
      emissiveIntensity: isNight ? 0.65 : isEvening ? 0.35 : 0.1,
      roughness: 0.42,
    });
    const gelatoSignMat = new THREE.MeshStandardMaterial({
      map: gelatoSignTex,
      emissiveMap: gelatoSignTex,
      emissive: 0xffe4b5,
      emissiveIntensity: isNight ? 0.65 : isEvening ? 0.35 : 0.1,
      roughness: 0.42,
    });

    interface PlacedInst {
      matrix: THREE.Matrix4;
      color?: number;
    }

    const terracottaBlocks: PlacedInst[] = [];
    const ochreBlocks: PlacedInst[] = [];
    const roseBlocks: PlacedInst[] = [];
    const vicoloBlocks: PlacedInst[] = [];
    const roofs: PlacedInst[] = [];
    const cornices: PlacedInst[] = [];
    const balconies: PlacedInst[] = [];
    const awnings: PlacedInst[] = [];
    const trattoriaSigns: PlacedInst[] = [];
    const gelatoSigns: PlacedInst[] = [];

    const italianTints = [0xffffff, 0xfaefe2, 0xf7e6d6, 0xfff5e8, 0xf2dfcf];
    const awningColors = [0x991b1b, 0x166534, 0xb45309, 0x1e3a5f, 0x7f1d1d, 0xd97706];

    const pushBox = (
      list: PlacedInst[],
      x: number,
      y: number,
      z: number,
      yaw: number,
      sx: number,
      sy: number,
      sz: number,
      color?: number
    ) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      list.push({ matrix: dummy.matrix.clone(), color });
    };

    // Row 1: Shoulder-to-Shoulder 3-4 Story Italian Palazzos on Piazza Avenues & Picturesque 2-3 Story Vicolo Houses!
    let streetCounter = 0;
    for (let i = 6; i < samples.length - 6; i += 9) {
      const s = samples[i];
      const tightness = getCityStreetTightness(i, samples.length);
      const isNarrow = tightness > 0.35;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const localBarrier = cityBarrierOffsetAt(i);

      for (const side of [-1, 1]) {
        streetCounter++;
        const bw = isNarrow ? 7.4 + rand() * 2.4 : 9.8 + rand() * 3.4;
        const bd = isNarrow ? 9.0 + rand() * 2.4 : 10.8 + rand() * 3.0;
        const setBack = isNarrow ? 0.65 : 2.35;
        const dist = localBarrier + setBack + bw * 0.5;
        const bx = s.pos.x + s.right.x * side * dist;
        const bz = s.pos.z + s.right.z * side * dist;
        const halfDiag = Math.hypot(bw * 0.5, bd * 0.5);
        if (!isClearOfCityRoad(bx, bz, halfDiag - (isNarrow ? 0.35 : 0.15))) continue;

        const frontX = bx - s.right.x * side * (bw * 0.5);
        const frontZ = bz - s.right.z * side * (bw * 0.5);
        // Local -X points TOWARD the street on BOTH sides (side=-1 -> yaw, side=+1 -> yaw+PI)
        const faceYaw = side === -1 ? yaw : yaw + Math.PI;

        const bh = isNarrow ? 8.8 + rand() * 4.2 : 11.2 + rand() * 5.8;
        const roll = streetCounter % 4;
        const targetList = isNarrow
          ? roll === 0
            ? terracottaBlocks
            : roll === 1
            ? ochreBlocks
            : vicoloBlocks
          : roll === 0
          ? terracottaBlocks
          : roll === 1
          ? ochreBlocks
          : roll === 2
          ? roseBlocks
          : vicoloBlocks;

        pushBox(targetList, bx, 0.18, bz, yaw, bw, bh, bd, italianTints[streetCounter % italianTints.length]);
        // Register every Italian palazzo / vicolo house as a solid building blocker!
        boxColliders.push({
          x: bx,
          z: bz,
          halfW: bw * 0.5,
          halfD: bd * 0.5,
          cosYaw: Math.cos(yaw),
          sinYaw: Math.sin(yaw),
          sampleIdx: i,
        });
        // Cream travertine roof cornice eaves + warm terracotta barrel-tile pitched hip roof!
        pushBox(cornices, bx, 0.18 + bh, bz, yaw, bw * 1.05, 0.42, bd * 1.05);
        pushBox(roofs, bx, 0.58 + bh, bz, yaw, bw * 1.02, 2.3 + rand() * 1.1, bd * 1.02);

        // Wrought-iron Juliet balcony with red geranium flower box overlooking the street!
        const balX = frontX - s.right.x * side * 0.52;
        const balZ = frontZ - s.right.z * side * 0.52;
        pushBox(balconies, balX, 5.4, balZ, faceYaw, 1, 1, 1);
        if (bh > 11.8 && streetCounter % 2 === 0) {
          pushBox(balconies, balX, 9.2, balZ, faceYaw, 1, 1, 1);
        }

        // Slanted burgundy / forest-green / ochre Italian cafe canopy awning over ground-floor arches
        const awnX = frontX - s.right.x * side * 0.96;
        const awnZ = frontZ - s.right.z * side * 0.96;
        pushBox(
          awnings,
          awnX,
          3.65,
          awnZ,
          faceYaw,
          1,
          1,
          bd * 0.78,
          awningColors[streetCounter % awningColors.length]
        );

        // Vintage hanging wrought-iron Trattoria / Gelateria street signboard facing oncoming traffic
        if (streetCounter % 3 === 0) {
          const signX = frontX - s.right.x * side * 1.18;
          const signZ = frontZ - s.right.z * side * 1.18;
          pushBox(
            streetCounter % 6 === 0 ? trattoriaSigns : gelatoSigns,
            signX,
            4.35,
            signZ,
            faceYaw + Math.PI * 0.5,
            1,
            1,
            1
          );
        }
      }
    }

    // Row 2: Historic 4-6 Story Italian Town Skyline with terracotta tile roofs behind the palazzos
    for (let tries = 0; tries < 420; tries++) {
      const sIdx = Math.floor(rand() * samples.length);
      const s = samples[sIdx];
      const side = rand() > 0.5 ? 1 : -1;
      const dist = barrierOffset + 20 + rand() * 56;
      const bx = s.pos.x + s.right.x * side * dist + (rand() - 0.5) * 12;
      const bz = s.pos.z + s.right.z * side * dist + (rand() - 0.5) * 12;
      const bw = 11 + rand() * 10;
      const bd = 11 + rand() * 10;
      if (!isClearOfCityRoad(bx, bz, Math.max(bw, bd) * 0.72 + 10)) continue;

      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const bh = 14 + rand() * 14;
      const list =
        tries % 4 === 0
          ? terracottaBlocks
          : tries % 4 === 1
          ? ochreBlocks
          : tries % 4 === 2
          ? roseBlocks
          : vicoloBlocks;
      pushBox(list, bx, -0.02, bz, yaw, bw, bh, bd, italianTints[tries % italianTints.length]);
      if (dist < barrierOffset + 32) {
        boxColliders.push({
          x: bx,
          z: bz,
          halfW: bw * 0.5,
          halfD: bd * 0.5,
          cosYaw: Math.cos(yaw),
          sinYaw: Math.sin(yaw),
          sampleIdx: sIdx,
        });
      }
      pushBox(cornices, bx, bh - 0.02, bz, yaw, bw * 1.04, 0.45, bd * 1.04);
      pushBox(roofs, bx, bh + 0.4, bz, yaw, bw * 1.0, 2.8 + rand() * 1.4, bd * 1.0);
    }

    const addInstBatch = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      items: PlacedInst[],
      useColor: boolean
    ) => {
      if (items.length === 0) return;
      const inst = new THREE.InstancedMesh(geo, mat, items.length);
      for (let idx = 0; idx < items.length; idx++) {
        inst.setMatrixAt(idx, items[idx].matrix);
        if (useColor && items[idx].color !== undefined) {
          colorTmp.setHex(items[idx].color!);
          inst.setColorAt(idx, colorTmp);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    };

    addInstBatch(unitBoxGeo, terracottaMat, terracottaBlocks, true);
    addInstBatch(unitBoxGeo, ochreMat, ochreBlocks, true);
    addInstBatch(unitBoxGeo, roseMat, roseBlocks, true);
    addInstBatch(unitBoxGeo, vicoloMat, vicoloBlocks, true);
    addInstBatch(unitBoxGeo, corniceMat, cornices, false);
    addInstBatch(pitchedRoofGeo, roofTileMat, roofs, false);
    addInstBatch(balconyFloorGeo, corniceMat, balconies, false);
    addInstBatch(balconyRailGeo, ironMat, balconies, false);
    addInstBatch(flowerBoxGeo, flowerPotMat, balconies, false);
    addInstBatch(geraniumGeo, geraniumMat, balconies, false);
    addInstBatch(slantedAwningGeo, awningMat, awnings, true);
    addInstBatch(hangingSignGeo, trattoriaSignMat, trattoriaSigns, false);
    addInstBatch(hangingSignGeo, gelatoSignMat, gelatoSigns, false);

    // =========================================================================
    // ITALIAN STREET PROPS (STRICTLY ON PIAZZA SIDEWALKS OUTSIDE ROAD BORDERS!)
    // - Classic Retro Italian Vespa Scooters in mint, red, cream & sky blue
    // - Terracotta Olive & Mediterranean Cypress Planter Pots
    // - Outdoor Trattoria Cafe Umbrellas on Wide Piazzas
    // =========================================================================
    const vespaBodyGeo = new THREE.BoxGeometry(0.56, 0.56, 1.52);
    vespaBodyGeo.translate(0, 0.44, 0);
    const vespaShieldGeo = new THREE.BoxGeometry(0.58, 0.62, 0.22);
    vespaShieldGeo.translate(0, 0.66, 0.56);
    const vespaSeatGeo = new THREE.BoxGeometry(0.46, 0.15, 0.76);
    vespaSeatGeo.translate(0, 0.79, -0.18);
    // Front & rear rubber scooter wheels resting flush at y = 0 on the sidewalk!
    const vespaWheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10);
    vespaWheelGeo.rotateZ(Math.PI / 2);
    const vespaFrontWheelGeo = vespaWheelGeo.clone();
    vespaFrontWheelGeo.translate(0, 0.22, 0.52);
    const vespaRearWheelGeo = vespaWheelGeo.clone();
    vespaRearWheelGeo.translate(0, 0.22, -0.52);
    const vespaWheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.88 });
    const vespaMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.22 });
    const leatherSeatMat = new THREE.MeshStandardMaterial({ color: 0x5c341d, roughness: 0.78 });

    const vespaItems: PlacedInst[] = [];
    const vespaPalette = [0xdc2626, 0x6ee7b7, 0xfef3c7, 0x38bdf8, 0xf59e0b, 0xf8fafc];
    for (let i = 16; i < samples.length - 12; i += 16) {
      if (diversions.some((d) => i >= d.startIdx - 10 && i <= d.endIdx + 10)) continue;
      if (getCityStreetTightness(i, samples.length) > 0.35) continue;
      const s = samples[i];
      const side = (i % 32 === 16 ? 1 : -1) as -1 | 1;
      const lat = cityHalfRoadAt(i) + 2.35;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z) + side * 0.52;
      const vx = s.pos.x + s.right.x * side * lat;
      const vz = s.pos.z + s.right.z * side * lat;
      pushBox(
        vespaItems,
        vx,
        0.21,
        vz,
        yaw,
        1,
        1,
        1,
        vespaPalette[i % vespaPalette.length]
      );
      boxColliders.push({
        x: vx,
        z: vz,
        halfW: 0.38,
        halfD: 0.82,
        cosYaw: Math.cos(yaw),
        sinYaw: Math.sin(yaw),
        sampleIdx: i,
      });
    }
    if (vespaItems.length > 0) {
      addInstBatch(vespaBodyGeo, vespaMat, vespaItems, true);
      addInstBatch(vespaShieldGeo, vespaMat, vespaItems, true);
      addInstBatch(vespaSeatGeo, leatherSeatMat, vespaItems, false);
      addInstBatch(vespaFrontWheelGeo, vespaWheelMat, vespaItems, false);
      addInstBatch(vespaRearWheelGeo, vespaWheelMat, vespaItems, false);
    }
    disposables.push(vespaWheelGeo, vespaFrontWheelGeo, vespaRearWheelGeo, vespaWheelMat);

    // Terracotta Planter Pots with Slender Mediterranean Cypress / Olive Trees along the piazza sidewalks (movable!)
    const potGeo = new THREE.CylinderGeometry(0.42, 0.30, 0.65, 8);
    potGeo.translate(0, 0.32, 0);
    const cypressGeo = new THREE.ConeGeometry(0.62, 3.1, 7);
    cypressGeo.translate(0, 2.05, 0);
    const cypressMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x163824 : 0x2f6b36,
      roughness: 0.85,
      flatShading: true,
    });
    const potItems: PlacedInst[] = [];
    const potMeta: Array<{ x: number; y: number; z: number; groundY: number; sampleIdx: number }> = [];
    for (let i = 10; i < samples.length - 8; i += 14) {
      if (getCityStreetTightness(i, samples.length) > 0.35) continue;
      if (diversions.some((d) => i >= d.startIdx - 10 && i <= d.endIdx + 10)) continue;
      const s = samples[i];
      const side = (i % 28 === 10 ? -1 : 1) as -1 | 1;
      const lat = cityHalfRoadAt(i) + 3.45;
      const px = s.pos.x + s.right.x * side * lat;
      const pz = s.pos.z + s.right.z * side * lat;
      pushBox(potItems, px, 0.22, pz, 0, 1, 1, 1);
      potMeta.push({ x: px, y: 0.22, z: pz, groundY: s.pos.y + 0.1, sampleIdx: i });
    }
    if (potItems.length > 0) {
      const cypressPotInst = new THREE.InstancedMesh(potGeo, flowerPotMat, potItems.length);
      const cypressTreeInst = new THREE.InstancedMesh(cypressGeo, cypressMat, potItems.length);
      for (let pIdx = 0; pIdx < potItems.length; pIdx++) {
        const item = potItems[pIdx];
        const meta = potMeta[pIdx];
        cypressPotInst.setMatrixAt(pIdx, item.matrix);
        cypressTreeInst.setMatrixAt(pIdx, item.matrix);
        const breakableId = registerBreakable('tree', meta.x, meta.y, meta.z, meta.groundY, [
          { mesh: cypressPotInst, instanceId: pIdx, worldMatrix: item.matrix },
          { mesh: cypressTreeInst, instanceId: pIdx, worldMatrix: item.matrix },
        ]);
        poleColliders.push({
          x: meta.x,
          z: meta.z,
          radius: 0.48,
          sampleIdx: meta.sampleIdx,
          breakableId,
        });
      }
      cypressPotInst.instanceMatrix.needsUpdate = true;
      cypressTreeInst.instanceMatrix.needsUpdate = true;
      cypressPotInst.computeBoundingSphere();
      cypressTreeInst.computeBoundingSphere();
      group.add(cypressPotInst, cypressTreeInst);
    }

    // Outdoor Trattoria Cafe Umbrellas tucked along wide Italian piazzas
    const umbPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
    umbPoleGeo.translate(0, 1.25, 0);
    const umbTopGeo = new THREE.ConeGeometry(1.45, 0.55, 8);
    umbTopGeo.translate(0, 2.48, 0);
    const umbItems: PlacedInst[] = [];
    const umbMeta: Array<{ x: number; y: number; z: number; groundY: number; sampleIdx: number }> = [];
    const umbPalette = [0xfef3c7, 0x991b1b, 0x166534, 0xd97706];
    for (let i = 22; i < samples.length - 16; i += 28) {
      if (getCityStreetTightness(i, samples.length) > 0.25) continue;
      if (diversions.some((d) => i >= d.startIdx - 12 && i <= d.endIdx + 12)) continue;
      const s = samples[i];
      const side = (i % 56 === 22 ? 1 : -1) as -1 | 1;
      const lat = cityHalfRoadAt(i) + 3.15;
      const ux = s.pos.x + s.right.x * side * lat;
      const uz = s.pos.z + s.right.z * side * lat;
      pushBox(
        umbItems,
        ux,
        0.22,
        uz,
        0,
        1,
        1,
        1,
        umbPalette[i % umbPalette.length]
      );
      umbMeta.push({ x: ux, y: 0.22, z: uz, groundY: s.pos.y + 0.1, sampleIdx: i });
    }
    if (umbItems.length > 0) {
      const umbPoleInst = new THREE.InstancedMesh(umbPoleGeo, ironMat, umbItems.length);
      const umbTopInst = new THREE.InstancedMesh(umbTopGeo, awningMat, umbItems.length);
      for (let uIdx = 0; uIdx < umbItems.length; uIdx++) {
        const item = umbItems[uIdx];
        umbPoleInst.setMatrixAt(uIdx, item.matrix);
        umbTopInst.setMatrixAt(uIdx, item.matrix);
        if (item.color !== undefined) {
          colorTmp.setHex(item.color);
          umbTopInst.setColorAt(uIdx, colorTmp);
        }
        const meta = umbMeta[uIdx];
        const breakableId = registerBreakable('umbrella', meta.x, meta.y, meta.z, meta.groundY, [
          { mesh: umbPoleInst, instanceId: uIdx, worldMatrix: item.matrix },
          { mesh: umbTopInst, instanceId: uIdx, worldMatrix: item.matrix },
        ]);
        poleColliders.push({
          x: meta.x,
          z: meta.z,
          radius: 0.26,
          sampleIdx: meta.sampleIdx,
          breakableId,
        });
      }
      umbPoleInst.instanceMatrix.needsUpdate = true;
      umbTopInst.instanceMatrix.needsUpdate = true;
      if (umbTopInst.instanceColor) umbTopInst.instanceColor.needsUpdate = true;
      umbPoleInst.computeBoundingSphere();
      umbTopInst.computeBoundingSphere();
      group.add(umbPoleInst, umbTopInst);
    }

    // =========================================================================
    // OVERHEAD WARM ITALIAN BISTRO STRING LIGHTS & TRICOLORE STREET BUNTING
    // + COLLIDABLE TWIN-GLOBE PIAZZA MEDIAN LAMP POLES ON SPLIT DIVERSIONS
    // =========================================================================
    const wireGeo = new THREE.BoxGeometry(1, 0.05, 0.05);
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
    const bulbGeo = new THREE.SphereGeometry(0.16, 5, 5);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: isNight ? 2.4 : isEvening ? 1.55 : 0.65,
      roughness: 0.2,
    });
    const flagTriGeo = new THREE.BoxGeometry(0.32, 0.42, 0.04);
    const flagTriMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });

    const wireMatrices: THREE.Matrix4[] = [];
    const bulbItems: PlacedInst[] = [];
    const flagItems: PlacedInst[] = [];
    const italianTricolore = [0x16a34a, 0xf8fafc, 0xdc2626];

    for (let i = 16; i < samples.length - 10; i += 14) {
      const s = samples[i];
      const tightness = getCityStreetTightness(i, samples.length);
      const isNarrow = tightness > 0.35;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const span = cityBarrierOffsetAt(i) * 2 + 2.4;

      dummy.position.set(s.pos.x, s.pos.y + (isNarrow ? 6.8 : 8.1), s.pos.z);
      dummy.rotation.set(0, yaw + (i % 28 === 0 ? 0.14 : -0.14), 0);
      dummy.scale.set(span * 1.04, 1, 1);
      dummy.updateMatrix();
      wireMatrices.push(dummy.matrix.clone());

      const isBuntingRow = i % 28 === 2;
      const count = isNarrow ? 8 : 12;
      const halfC = (count - 1) * 0.5;
      for (let k = 0; k < count; k++) {
        const u = (k - halfC) / Math.max(1, halfC);
        const lat = u * (span * 0.44);
        const sag = (1 - u * u) * (isNarrow ? 0.62 : 1.05);
        const bx = s.pos.x + s.right.x * lat;
        const by = s.pos.y + (isNarrow ? 6.65 : 7.95) - sag;
        const bz = s.pos.z + s.right.z * lat;

        dummy.position.set(bx, by, bz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if (isBuntingRow) {
          flagItems.push({
            matrix: dummy.matrix.clone(),
            color: italianTricolore[k % 3],
          });
        } else {
          bulbItems.push({
            matrix: dummy.matrix.clone(),
            color: k % 2 === 0 ? 0xffd580 : 0xfff3c4,
          });
        }
      }
    }

    // Ornate Twin-Globe Italian Piazza Lamp Poles along the stone median of City's Split-Route Diversions (ALL COLLIDABLE!)
    const twinPoleGeo = new THREE.CylinderGeometry(0.12, 0.22, 7.2, 8);
    twinPoleGeo.translate(0, 3.6, 0);
    const twinArmGeo = new THREE.BoxGeometry(2.8, 0.12, 0.12);
    twinArmGeo.translate(0, 7.1, 0);
    const twinLampGeo = new THREE.SphereGeometry(0.34, 8, 8);
    const twinLampMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xffcf77,
      emissiveIntensity: isNight ? 2.5 : isEvening ? 1.6 : 0.5,
    });
    const twinPoleMatrices: THREE.Matrix4[] = [];
    const twinBulbMatrices: THREE.Matrix4[] = [];
    const twinMeta: Array<{ x: number; y: number; z: number; groundY: number; sampleIdx: number }> = [];
    for (const d of diversions) {
      for (let di = d.startIdx + 6; di <= d.endIdx - 6; di += 10) {
        const s = samples[di % samples.length];
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        dummy.position.set(s.pos.x, s.pos.y + 0.3, s.pos.z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        twinPoleMatrices.push(dummy.matrix.clone());
        twinMeta.push({
          x: s.pos.x,
          y: s.pos.y + 0.3,
          z: s.pos.z,
          groundY: s.pos.y + 0.1,
          sampleIdx: di % samples.length,
        });
        for (const armSide of [-1.35, 1.35]) {
          dummy.position.set(
            s.pos.x + s.right.x * armSide,
            s.pos.y + 7.42,
            s.pos.z + s.right.z * armSide
          );
          dummy.updateMatrix();
          twinBulbMatrices.push(dummy.matrix.clone());
        }
      }
    }
    if (twinPoleMatrices.length > 0) {
      const tpInst = new THREE.InstancedMesh(twinPoleGeo, ironMat, twinPoleMatrices.length);
      const taInst = new THREE.InstancedMesh(twinArmGeo, ironMat, twinPoleMatrices.length);
      const tbInst = new THREE.InstancedMesh(twinLampGeo, twinLampMat, twinBulbMatrices.length);
      twinBulbMatrices.forEach((m, idx) => tbInst.setMatrixAt(idx, m));
      twinPoleMatrices.forEach((m, idx) => {
        tpInst.setMatrixAt(idx, m);
        taInst.setMatrixAt(idx, m);
        const meta = twinMeta[idx];
        const breakableId = registerBreakable('pole', meta.x, meta.y, meta.z, meta.groundY, [
          { mesh: tpInst, instanceId: idx, worldMatrix: m },
          { mesh: taInst, instanceId: idx, worldMatrix: m },
          { mesh: tbInst, instanceId: idx * 2, worldMatrix: twinBulbMatrices[idx * 2] },
          { mesh: tbInst, instanceId: idx * 2 + 1, worldMatrix: twinBulbMatrices[idx * 2 + 1] },
        ]);
        poleColliders.push({
          x: meta.x,
          z: meta.z,
          radius: 0.34,
          sampleIdx: meta.sampleIdx,
          breakableId,
        });
      });
      for (const inst of [tpInst, taInst, tbInst]) {
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        group.add(inst);
      }
    }

    if (wireMatrices.length > 0) {
      const wireInst = new THREE.InstancedMesh(wireGeo, wireMat, wireMatrices.length);
      wireMatrices.forEach((m, idx) => wireInst.setMatrixAt(idx, m));
      wireInst.instanceMatrix.needsUpdate = true;
      wireInst.computeBoundingSphere();
      group.add(wireInst);
    }
    addInstBatch(bulbGeo, bulbMat, bulbItems, true);
    addInstBatch(flagTriGeo, flagTriMat, flagItems, true);

    disposables.push(
      terracottaTex.map,
      terracottaTex.emissiveMap,
      ochreTex.map,
      ochreTex.emissiveMap,
      roseTex.map,
      roseTex.emissiveMap,
      vicoloTex.map,
      vicoloTex.emissiveMap,
      trattoriaSignTex,
      gelatoSignTex,
      unitBoxGeo,
      pitchedRoofGeo,
      slantedAwningGeo,
      balconyFloorGeo,
      balconyRailGeo,
      flowerBoxGeo,
      geraniumGeo,
      hangingSignGeo,
      terracottaMat,
      ochreMat,
      roseMat,
      vicoloMat,
      roofTileMat,
      corniceMat,
      ironMat,
      flowerPotMat,
      geraniumMat,
      awningMat,
      trattoriaSignMat,
      gelatoSignMat,
      vespaBodyGeo,
      vespaShieldGeo,
      vespaSeatGeo,
      vespaMat,
      leatherSeatMat,
      potGeo,
      cypressGeo,
      cypressMat,
      umbPoleGeo,
      umbTopGeo,
      wireGeo,
      wireMat,
      bulbGeo,
      bulbMat,
      flagTriGeo,
      flagTriMat,
      twinPoleGeo,
      twinArmGeo,
      twinLampGeo,
      twinLampMat
    );
  }

  if (isStadium) {
    // =========================================================================
    // FULL-BOWL MULTI-TIER AUDIENCE SEATING STAGES + SEATED SPECTATORS + JUMBOTRONS!
    // Each stage has:
    //   - Front trackside concrete sponsor wall + red/gold RUSH LINE parapet trim
    //   - 5 physically stepped amphitheater bleacher tiers climbing skyward away from track
    //   - Hundreds of colorful 3D seated spectators (torso + head) sitting across every tier!
    //   - Cantilevered white stadium canopy roof + rear steel trusses + glowing LED ribbon
    //   - Wrapped continuously around the ENTIRE outer bowl + spacious infield viewing areas!
    // =========================================================================
    const crowdTex = createStadiumCrowdTexture(effectiveAniso);
    const jumbotronTex = createStadiumJumbotronTexture(effectiveAniso);

    const stageLength = 21.5;

    // 1. Trackside concrete front parapet wall & vivid red/gold stadium fascia (deeply skirted 1.6m below datum!)
    const stageSkirt = 1.6;
    const frontWallGeo = new THREE.BoxGeometry(1.1, 2.0 + stageSkirt, stageLength);
    frontWallGeo.translate(-6.4, (2.0 - stageSkirt) * 0.5, 0);
    const frontWallMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.65,
      metalness: 0.12,
    });
    const fasciaStripeGeo = new THREE.BoxGeometry(1.22, 0.55, stageLength + 0.1);
    fasciaStripeGeo.translate(-6.4, 1.72, 0);
    const fasciaStripeMat = new THREE.MeshStandardMaterial({
      color: 0xe5252b,
      emissive: isNight ? 0x7f1d1d : 0x000000,
      emissiveIntensity: isNight ? 0.55 : 0,
      roughness: 0.42,
    });

    // 2. Five physically stepped amphitheater seating tiers rising from trackside (-X) to rear (+X)!
    const tierSpecs = [
      { x: -4.4, h: 2.3, d: 2.8 },
      { x: -1.7, h: 3.9, d: 2.8 },
      { x: 1.0, h: 5.5, d: 2.8 },
      { x: 3.7, h: 7.1, d: 2.8 },
      { x: 6.4, h: 8.7, d: 3.0 },
    ];
    const tierGeos = tierSpecs.map((ts) => {
      const g = new THREE.BoxGeometry(ts.d, ts.h + stageSkirt, stageLength);
      g.translate(ts.x, (ts.h - stageSkirt) * 0.5, 0);
      return g;
    });
    const tierMat = new THREE.MeshStandardMaterial({
      map: crowdTex,
      roughness: 0.72,
      metalness: 0.08,
    });

    // 3. Rear concourse enclosure wall, structural steel canopy pillars & cantilevered architectural roof!
    const backWallGeo = new THREE.BoxGeometry(1.0, 12.6 + stageSkirt, stageLength);
    backWallGeo.translate(8.1, (12.6 - stageSkirt) * 0.5, 0);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.62,
      metalness: 0.35,
    });
    const canopyGeo = new THREE.BoxGeometry(16.8, 0.68, stageLength + 0.6);
    canopyGeo.rotateZ(-0.11); // slight upward architectural tilt toward track!
    canopyGeo.translate(0.6, 13.0, 0);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.36,
      metalness: 0.32,
    });
    const canopyLedGeo = new THREE.BoxGeometry(0.42, 0.35, stageLength + 0.4);
    canopyLedGeo.translate(-7.5, 13.45, 0);
    const canopyLedMat = new THREE.MeshStandardMaterial({
      color: 0xffd014,
      emissive: 0xffd014,
      emissiveIntensity: isNight ? 2.1 : 0.75,
      roughness: 0.2,
    });
    const stPillarGeo = new THREE.BoxGeometry(0.75, 12.6 + stageSkirt, 0.75);
    const stPillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.68,
    });

    // Collect outer stadium bowl stages (side = -1: full 360° perimeter!) + spacious infield stages (side = +1)
    const stagePlacements: Array<{ x: number; y: number; z: number; yaw: number; side: -1 | 1 }> = [];
    const stageMatrices: THREE.Matrix4[] = [];
    const pillarMatrices: THREE.Matrix4[] = [];

    // Outer Stadium Bowl (continuous encircling audience stages!)
    for (let i = 0; i < samples.length; i += 11) {
      const s = samples[i];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      // Place center of stage at barrierOffset + 10.6 so trackside front wall (-6.4) sits neatly at barrierOffset + 4.2m!
      const dist = barrierOffset + 10.6;
      const sx = s.pos.x - s.right.x * dist;
      const sz = s.pos.z - s.right.z * dist;
      if (!isClearOfTrack(sx, sz, barrierOffset + 7.2)) continue;

      dummy.position.set(sx, s.pos.y - 0.1, sz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      stageMatrices.push(dummy.matrix.clone());
      stagePlacements.push({ x: sx, y: s.pos.y - 0.1, z: sz, yaw, side: -1 });
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      boxColliders.push({
        x: sx + cosY * 0.85,
        z: sz - sinY * 0.85,
        halfW: 7.7,
        halfD: stageLength * 0.5,
        cosYaw: cosY,
        sinYaw: sinY,
        sampleIdx: i,
      });
    }

    // Infield Audience Viewing Stages along clear straights & main paddock plaza (facing straight at track!)
    for (let i = 10; i < samples.length - 10; i += 14) {
      const s = samples[i];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const dist = barrierOffset + 11.4;
      const sx = s.pos.x + s.right.x * dist;
      const sz = s.pos.z + s.right.z * dist;
      // Strict clearance so infield stages never touch opposite inner curves
      if (!isClearOfTrack(sx, sz, barrierOffset + 10.2)) continue;

      const stageYaw = yaw + Math.PI;
      dummy.position.set(sx, s.pos.y - 0.1, sz);
      dummy.rotation.set(0, stageYaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      stageMatrices.push(dummy.matrix.clone());
      stagePlacements.push({ x: sx, y: s.pos.y - 0.1, z: sz, yaw: stageYaw, side: 1 });
      const cosY = Math.cos(stageYaw);
      const sinY = Math.sin(stageYaw);
      boxColliders.push({
        x: sx + cosY * 0.85,
        z: sz - sinY * 0.85,
        halfW: 7.7,
        halfD: stageLength * 0.5,
        cosYaw: cosY,
        sinYaw: sinY,
        sampleIdx: i,
      });
    }

    if (stageMatrices.length > 0) {
      const frontWallInst = new THREE.InstancedMesh(frontWallGeo, frontWallMat, stageMatrices.length);
      const fasciaInst = new THREE.InstancedMesh(fasciaStripeGeo, fasciaStripeMat, stageMatrices.length);
      const backWallInst = new THREE.InstancedMesh(backWallGeo, backWallMat, stageMatrices.length);
      const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, stageMatrices.length);
      const canopyLedInst = new THREE.InstancedMesh(canopyLedGeo, canopyLedMat, stageMatrices.length);
      const tierInsts = tierGeos.map((g) => new THREE.InstancedMesh(g, tierMat, stageMatrices.length));

      stageMatrices.forEach((m, idx) => {
        frontWallInst.setMatrixAt(idx, m);
        fasciaInst.setMatrixAt(idx, m);
        backWallInst.setMatrixAt(idx, m);
        canopyInst.setMatrixAt(idx, m);
        canopyLedInst.setMatrixAt(idx, m);
        for (let t = 0; t < tierInsts.length; t++) {
          tierInsts[t].setMatrixAt(idx, m);
        }
      });

      // Twin rear steel roof support columns per stage
      for (const sp of stagePlacements) {
        const cosY = Math.cos(sp.yaw);
        const sinY = Math.sin(sp.yaw);
        for (const localZ of [-8.2, 8.2]) {
          const lx = 7.4;
          const wx = sp.x + lx * cosY + localZ * sinY;
          const wz = sp.z - lx * sinY + localZ * cosY;
          dummy.position.set(wx, sp.y + 6.3, wz);
          dummy.rotation.set(0, sp.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          pillarMatrices.push(dummy.matrix.clone());
        }
      }

      const pillarInst = new THREE.InstancedMesh(stPillarGeo, stPillarMat, pillarMatrices.length);
      pillarMatrices.forEach((m, idx) => pillarInst.setMatrixAt(idx, m));

      for (const inst of [
        frontWallInst,
        fasciaInst,
        backWallInst,
        canopyInst,
        canopyLedInst,
        pillarInst,
        ...tierInsts,
      ]) {
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        group.add(inst);
      }

      // 4. Thousands of 3D Seated Spectators sitting across all 5 stepped tiers (only 2 GPU draw calls!)
      const specBodyGeo = new THREE.BoxGeometry(0.46, 0.72, 0.52);
      specBodyGeo.translate(0, 0.36, 0);
      const specHeadGeo = new THREE.SphereGeometry(0.22, 5, 4);
      specHeadGeo.translate(0, 0.92, 0);
      const specBodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
      const specHeadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });

      const jerseyPalette = [0xe5252b, 0xffd014, 0x2563eb, 0xf8fafc, 0xf97316, 0x10b981, 0x38bdf8, 0xa855f7];
      const skinPalette = [0xf5d0b5, 0xe8b896, 0xc68b63, 0x8d5524, 0xffdfc4];

      const seatsPerRow = lowPower ? 7 : 10;
      const maxSpectators = stagePlacements.length * tierSpecs.length * seatsPerRow;
      const specBodyInst = new THREE.InstancedMesh(specBodyGeo, specBodyMat, maxSpectators);
      const specHeadInst = new THREE.InstancedMesh(specHeadGeo, specHeadMat, maxSpectators);

      let sCount = 0;
      for (let stIdx = 0; stIdx < stagePlacements.length; stIdx++) {
        const sp = stagePlacements[stIdx];
        const cosY = Math.cos(sp.yaw);
        const sinY = Math.sin(sp.yaw);

        for (let t = 0; t < tierSpecs.length; t++) {
          const ts = tierSpecs[t];
          for (let seat = 0; seat < seatsPerRow; seat++) {
            // Skip occasional empty seats & center aisle for natural cheering stadium look
            if (seat === Math.floor(seatsPerRow / 2)) continue;
            if (rand() < 0.14) continue;
            if (sCount >= maxSpectators) break;

            const u = (seat + 0.5) / seatsPerRow;
            const localZ = (u - 0.5) * (stageLength - 2.4) + (rand() - 0.5) * 0.45;
            const localX = ts.x - 0.25 + (rand() - 0.5) * 0.55;
            const wx = sp.x + localX * cosY + localZ * sinY;
            const wz = sp.z - localX * sinY + localZ * cosY;
            const wy = sp.y + ts.h;

            const scaleH = 0.88 + rand() * 0.26;
            dummy.position.set(wx, wy, wz);
            dummy.rotation.set(0, sp.yaw, 0);
            dummy.scale.set(1, scaleH, 1);
            dummy.updateMatrix();
            specBodyInst.setMatrixAt(sCount, dummy.matrix);
            specHeadInst.setMatrixAt(sCount, dummy.matrix);

            colorTmp.setHex(jerseyPalette[(stIdx * 7 + t * 13 + seat * 5) % jerseyPalette.length]);
            specBodyInst.setColorAt(sCount, colorTmp);
            colorTmp.setHex(skinPalette[(stIdx + t * 3 + seat) % skinPalette.length]);
            specHeadInst.setColorAt(sCount, colorTmp);
            sCount++;
          }
        }
      }
      specBodyInst.count = sCount;
      specHeadInst.count = sCount;
      specBodyInst.instanceMatrix.needsUpdate = true;
      specHeadInst.instanceMatrix.needsUpdate = true;
      if (specBodyInst.instanceColor) specBodyInst.instanceColor.needsUpdate = true;
      if (specHeadInst.instanceColor) specHeadInst.instanceColor.needsUpdate = true;
      specBodyInst.computeBoundingSphere();
      specHeadInst.computeBoundingSphere();
      group.add(specBodyInst, specHeadInst);

      disposables.push(specBodyGeo, specHeadGeo, specBodyMat, specHeadMat);
    }

    // 5. Four Giant Elevated Stadium Jumbotron Scoreboard Screens above the outer grandstands!
    const jumboFrameGeo = new THREE.BoxGeometry(1.1, 8.4, 16.4);
    const jumboScreenGeo = new THREE.PlaneGeometry(15.2, 7.2);
    jumboScreenGeo.rotateY(Math.PI / 2); // faces +X; we flip inward toward track
    const jumboPylonGeo = new THREE.CylinderGeometry(0.4, 0.55, 22.0, 8);
    jumboPylonGeo.translate(0, 8.5, 0);
    const jumboScreenMat = new THREE.MeshStandardMaterial({
      map: jumbotronTex,
      emissiveMap: jumbotronTex,
      emissive: 0xffffff,
      emissiveIntensity: isNight ? 1.05 : 0.45,
      roughness: 0.2,
    });

    const jumboIndices = [45, 195, 345, 495];
    for (const ji of jumboIndices) {
      const s = samples[ji % samples.length];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const dist = barrierOffset + 19.5;
      const jx = s.pos.x - s.right.x * dist;
      const jz = s.pos.z - s.right.z * dist;

      const jGroup = new THREE.Group();
      jGroup.position.set(jx, Math.min(s.pos.y, sampleMeshGroundY(jx, jz) + 0.2), jz);
      jGroup.rotation.y = yaw;

      const leftPylon = new THREE.Mesh(jumboPylonGeo, stPillarMat);
      leftPylon.position.set(0, 0, -5.6);
      const rightPylon = new THREE.Mesh(jumboPylonGeo, stPillarMat);
      rightPylon.position.set(0, 0, 5.6);
      const frame = new THREE.Mesh(jumboFrameGeo, stPillarMat);
      frame.position.set(0, 19.2, 0);
      // Screen sits on local -X face pointing directly back toward the racing track!
      const screen = new THREE.Mesh(jumboScreenGeo, jumboScreenMat);
      screen.rotation.y = Math.PI;
      screen.position.set(-0.62, 19.2, 0);

      jGroup.add(leftPylon, rightPylon, frame, screen);
      group.add(jGroup);
    }

    // 6. Eight Giant Stadium Corner Floodlight Towers rising above the arena bowl
    const mastGeo = new THREE.CylinderGeometry(0.45, 0.85, 34, 8);
    mastGeo.translate(0, 15, 0);
    const headGeo = new THREE.BoxGeometry(7.2, 3.0, 1.2);
    headGeo.translate(0, 32.4, 0);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfef08a,
      emissiveIntensity: isNight ? 2.6 : 1.1,
      roughness: 0.2,
    });
    const towerCount = 8;
    const mastInst = new THREE.InstancedMesh(mastGeo, stPillarMat, towerCount);
    const headInst = new THREE.InstancedMesh(headGeo, headMat, towerCount);
    for (let k = 0; k < towerCount; k++) {
      const ang = (k / towerCount) * Math.PI * 2;
      const tx = centerX + Math.cos(ang) * 172;
      const tz = centerZ + Math.sin(ang) * 192;
      dummy.position.set(tx, sampleMeshGroundY(tx, tz) - 0.35, tz);
      dummy.rotation.set(0, Math.atan2(centerX - tx, centerZ - tz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mastInst.setMatrixAt(k, dummy.matrix);
      headInst.setMatrixAt(k, dummy.matrix);
    }
    mastInst.instanceMatrix.needsUpdate = true;
    headInst.instanceMatrix.needsUpdate = true;
    mastInst.computeBoundingSphere();
    headInst.computeBoundingSphere();
    group.add(mastInst, headInst);

    disposables.push(
      crowdTex,
      jumbotronTex,
      frontWallGeo,
      frontWallMat,
      fasciaStripeGeo,
      fasciaStripeMat,
      ...tierGeos,
      tierMat,
      backWallGeo,
      backWallMat,
      canopyGeo,
      canopyMat,
      canopyLedGeo,
      canopyLedMat,
      stPillarGeo,
      stPillarMat,
      jumboFrameGeo,
      jumboScreenGeo,
      jumboPylonGeo,
      jumboScreenMat,
      mastGeo,
      headGeo,
      headMat
    );
  }

  // Pine forest, boulders, meadow bushes & fallen logs belong on natural/circuit tracks — NOT downtown City Streets!
  if (!isCity) {
  const maxTrees = isStadium ? 95 : isGoKart ? 185 : isHill ? 340 : 310;
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, maxTrees);
  const tier1Inst = new THREE.InstancedMesh(tier1Geo, tier1Mat, maxTrees);
  const tier2Inst = new THREE.InstancedMesh(tier2Geo, tier2Mat, maxTrees);
  const tier3Inst = new THREE.InstancedMesh(tier3Geo, tier3Mat, maxTrees);

  let tCount = 0;
  for (let tries = 0; tries < 1800 && tCount < maxTrees; tries++) {
    const sampleIdx = Math.floor(rand() * samples.length);
    const sample = samples[sampleIdx];
    const side = rand() > 0.5 ? 1 : -1;
    // Mix of dramatic close-in roadside forest corridor trees (like the reference!) & deep woodland trees
    const closeBand = rand() < 0.45;
    const dist = closeBand
      ? barrierOffset + 6.5 + rand() * 20
      : barrierOffset + 24 + rand() * (isGoKart ? 95 : 150);
    const x = sample.pos.x + sample.right.x * side * dist + (rand() - 0.5) * 18;
    const z = sample.pos.z + sample.right.z * side * dist + (rand() - 0.5) * 18;
    if (!isClearOfTrack(x, z, barrierOffset + (isCity ? 18 : isStadium ? 22 : 5.2))) continue;
    // Keep the Riverside river channel completely open water (no trees inside the river!)
    if (isRiverside && side === 1 && dist < barrierOffset + 52) continue;
    if (isInsidePond(x, z)) continue;

    const gy = sampleMeshGroundY(x, z);
    const s = 0.78 + rand() * 0.62;
    const sy = s * (0.88 + rand() * 0.36);

    dummy.position.set(x, gy - 0.12, z);
    dummy.rotation.set((rand() - 0.5) * 0.04, rand() * Math.PI * 2, (rand() - 0.5) * 0.04);
    dummy.scale.set(s, sy, s);
    dummy.updateMatrix();

    const treeWorldMat = dummy.matrix.clone();
    trunkInst.setMatrixAt(tCount, treeWorldMat);
    tier1Inst.setMatrixAt(tCount, treeWorldMat);
    tier2Inst.setMatrixAt(tCount, treeWorldMat);
    tier3Inst.setMatrixAt(tCount, treeWorldMat);

    // Every pine tree within drivable side-road range is now a movable knock-downable object!
    if (dist < barrierOffset + 42) {
      const breakableId = registerBreakable('tree', x, gy - 0.12, z, gy + 0.08, [
        { mesh: trunkInst, instanceId: tCount, worldMatrix: treeWorldMat },
        { mesh: tier1Inst, instanceId: tCount, worldMatrix: treeWorldMat },
        { mesh: tier2Inst, instanceId: tCount, worldMatrix: treeWorldMat },
        { mesh: tier3Inst, instanceId: tCount, worldMatrix: treeWorldMat },
      ]);
      poleColliders.push({
        x,
        z,
        radius: 0.68 * s,
        sampleIdx,
        breakableId,
      });
    }

    const hueShift = (rand() - 0.5) * 0.045;
    const lightShift = (rand() - 0.5) * 0.08;
    colorTmp.setHSL(0.32 + hueShift, isNight ? 0.42 : 0.62, (isNight ? 0.18 : 0.34) + lightShift);
    tier1Inst.setColorAt(tCount, colorTmp);
    colorTmp.setHSL(0.30 + hueShift, isNight ? 0.45 : 0.66, (isNight ? 0.23 : 0.44) + lightShift);
    tier2Inst.setColorAt(tCount, colorTmp);
    colorTmp.setHSL(0.28 + hueShift, isNight ? 0.48 : 0.70, (isNight ? 0.28 : 0.52) + lightShift);
    tier3Inst.setColorAt(tCount, colorTmp);
    tCount++;
  }

  for (const inst of [trunkInst, tier1Inst, tier2Inst, tier3Inst]) {
    inst.count = tCount;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = !lowPower;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  disposables.push(trunkGeo, trunkMat, tier1Geo, tier1Mat, tier2Geo, tier2Mat, tier3Geo, tier3Mat);

  // C. Faceted Angular Grey Boulders (roadside hero boulders + pond bank rocks!)
  const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
  rockGeo.translate(0, 0.72, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x565c68 : 0xa5a7ad,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });

  // D. Stylized Green Meadow Bush / Shrub Tufts (clustering near rocks, logs, fences & tree bases!)
  const bushGeo = new THREE.IcosahedronGeometry(0.85, 0);
  bushGeo.translate(0, 0.45, 0);
  const bushMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x235224 : 0x4dbe2e,
    roughness: 0.84,
    metalness: 0.01,
    flatShading: true,
  });

  const maxRocks = 130;
  const maxBushes = 260;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, maxRocks);
  const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, maxBushes);

  let rCount = 0;
  let bCount = 0;

  const addBushCluster = (cx: number, _cy: number, cz: number, count: number, overrideY?: number) => {
    for (let k = 0; k < count && bCount < maxBushes; k++) {
      const ang = rand() * Math.PI * 2;
      const rad = 0.6 + rand() * 1.4;
      const bx = cx + Math.cos(ang) * rad;
      const bz = cz + Math.sin(ang) * rad;
      const s = 0.65 + rand() * 0.75;
      const by = overrideY !== undefined ? overrideY : sampleMeshGroundY(bx, bz);
      dummy.position.set(bx, by - 0.14 * s, bz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s * 1.15, s * 0.75, s);
      dummy.updateMatrix();
      bushInst.setMatrixAt(bCount, dummy.matrix);
      colorTmp.setHSL(0.28 + (rand() - 0.5) * 0.05, isNight ? 0.46 : 0.68, (isNight ? 0.22 : 0.45) + rand() * 0.12);
      bushInst.setColorAt(bCount, colorTmp);
      bCount++;
    }
  };

  // Ring pond shorelines with stylized boulders & green reeds/bushes
  for (const p of pondCenters) {
    for (let k = 0; k < 8 && rCount < maxRocks; k++) {
      const ang = (k / 8) * Math.PI * 2 + rand() * 0.4;
      const bx = p.x + Math.cos(ang) * (p.rx - 1.2);
      const bz = p.z + Math.sin(ang) * (p.rz - 1.2);
      if (!isClearOfTrack(bx, bz, barrierOffset + 2.5)) continue;
      const sx = 0.9 + rand() * 1.3;
      const sy = 0.6 + rand() * 0.85;
      const sz = 0.9 + rand() * 1.3;
      const bankY = Math.min(p.y, sampleMeshGroundY(bx, bz) + 0.12);
      dummy.position.set(bx, bankY - 0.28 * sy, bz);
      dummy.rotation.set(rand() * 0.25, rand() * Math.PI * 2, rand() * 0.25);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      rockInst.setMatrixAt(rCount, dummy.matrix);
      colorTmp.setHSL(0.6, 0.05, (isNight ? 0.28 : 0.56) + rand() * 0.14);
      rockInst.setColorAt(rCount, colorTmp);
      rCount++;
      addBushCluster(bx, bankY, bz, 2, bankY);
    }
  }

  // Roadside & meadow faceted boulders paired with green bush tufts
  for (let tries = 0; tries < 700 && rCount < maxRocks; tries++) {
    const sampleIdx = Math.floor(rand() * samples.length);
    const sample = samples[sampleIdx];
    const side = rand() > 0.5 ? 1 : -1;
    const dist = barrierOffset + 3.8 + rand() * (isGoKart ? 55 : 92);
    const x = sample.pos.x + sample.right.x * side * dist;
    const z = sample.pos.z + sample.right.z * side * dist;
    if (!isClearOfTrack(x, z, barrierOffset + 3.2)) continue;
    if (isInsidePond(x, z)) continue;

    const gy = sampleMeshGroundY(x, z);
    const isNearRoad = dist < barrierOffset + 14;
    const sx = isNearRoad ? 0.9 + rand() * 1.4 : 1.4 + rand() * 3.0;
    const sy = isNearRoad ? 0.65 + rand() * 1.05 : 1.0 + rand() * 2.6;
    const sz = isNearRoad ? 0.9 + rand() * 1.4 : 1.4 + rand() * 3.0;
    dummy.position.set(x, gy - 0.32 * sy, z);
    dummy.rotation.set(rand() * 0.25, rand() * Math.PI * 2, rand() * 0.25);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(rCount, dummy.matrix);
    colorTmp.setHSL(0.08, 0.06, (isNight ? 0.26 : 0.54) + rand() * 0.16);
    rockInst.setColorAt(rCount, colorTmp);
    rCount++;

    if (dist < barrierOffset + 36) {
      poleColliders.push({
        x,
        z,
        radius: Math.max(sx, sz) * 1.12,
        sampleIdx,
      });
    }

    if (isNearRoad && bCount < maxBushes - 2) {
      addBushCluster(x, gy, z, 2);
    }
  }

  // Additional roadside bush tufts along the grassy verge
  for (let tries = 0; tries < 500 && bCount < maxBushes; tries++) {
    const sample = samples[Math.floor(rand() * samples.length)];
    const side = rand() > 0.5 ? 1 : -1;
    const dist = barrierOffset + 2.5 + rand() * 28;
    const x = sample.pos.x + sample.right.x * side * dist;
    const z = sample.pos.z + sample.right.z * side * dist;
    if (!isClearOfTrack(x, z, barrierOffset + 2.1)) continue;
    if (isInsidePond(x, z)) continue;
    const gy = sampleMeshGroundY(x, z);
    addBushCluster(x, gy, z, 1);
  }

  rockInst.count = rCount;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.castShadow = !lowPower;
  rockInst.computeBoundingSphere();

  bushInst.count = bCount;
  bushInst.instanceMatrix.needsUpdate = true;
  if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
  bushInst.computeBoundingSphere();

  group.add(rockInst, bushInst);
  disposables.push(rockGeo, rockMat, bushGeo, bushMat);

  // E. Fallen Timber Logs with Tan Cut Ends (aligned seamlessly to terrain slope so neither end ever hovers!)
  const logBarkGeo = new THREE.CylinderGeometry(0.42, 0.48, 3.6, 8);
  logBarkGeo.rotateZ(Math.PI / 2);
  logBarkGeo.translate(0, 0.42, 0);
  const logBarkMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x452714 : 0x8a4d22,
    roughness: 0.92,
    flatShading: true,
  });

  const logCapGeo = new THREE.CylinderGeometry(0.36, 0.36, 3.66, 8);
  logCapGeo.rotateZ(Math.PI / 2);
  logCapGeo.translate(0, 0.42, 0);
  const logCapMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x6a5036 : 0xdcb072,
    roughness: 0.85,
    flatShading: true,
  });

  const maxLogs = 52;
  const logBarkInst = new THREE.InstancedMesh(logBarkGeo, logBarkMat, maxLogs);
  const logCapInst = new THREE.InstancedMesh(logCapGeo, logCapMat, maxLogs);
  let lCount = 0;
  for (let tries = 0; tries < 360 && lCount < maxLogs; tries++) {
    const sampleIdx = Math.floor(rand() * samples.length);
    const sample = samples[sampleIdx];
    const side = rand() > 0.5 ? 1 : -1;
    const dist = barrierOffset + 5.5 + rand() * 24;
    const x = sample.pos.x + sample.right.x * side * dist;
    const z = sample.pos.z + sample.right.z * side * dist;
    if (!isClearOfTrack(x, z, barrierOffset + 4.5)) continue;
    if (isInsidePond(x, z)) continue;
    const s = 0.8 + rand() * 0.55;
    const logYaw = rand() * Math.PI * 2;
    const cosY = Math.cos(logYaw);
    const sinY = Math.sin(logYaw);
    const halfLen = 1.65 * s;
    const yC = sampleMeshGroundY(x, z);
    const yL = sampleMeshGroundY(x - cosY * halfLen, z + sinY * halfLen);
    const yR = sampleMeshGroundY(x + cosY * halfLen, z - sinY * halfLen);
    const baseY = Math.min(yC, (yL + yR) * 0.5) - 0.14 * s;
    const slopeRoll = Math.atan2(yR - yL, halfLen * 2);
    dummy.position.set(x, baseY, z);
    dummy.rotation.set(0, logYaw, THREE.MathUtils.clamp(slopeRoll, -0.35, 0.35), 'YXZ');
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    logBarkInst.setMatrixAt(lCount, dummy.matrix);
    logCapInst.setMatrixAt(lCount, dummy.matrix);
    boxColliders.push({
      x,
      z,
      halfW: 1.85 * s,
      halfD: 0.48 * s,
      cosYaw: cosY,
      sinYaw: sinY,
      sampleIdx,
    });
    lCount++;
  }
  logBarkInst.count = lCount;
  logCapInst.count = lCount;
  logBarkInst.instanceMatrix.needsUpdate = true;
  logCapInst.instanceMatrix.needsUpdate = true;
  logBarkInst.castShadow = !lowPower;
  logBarkInst.computeBoundingSphere();
  logCapInst.computeBoundingSphere();
  group.add(logBarkInst, logCapInst);
  disposables.push(logBarkGeo, logBarkMat, logCapGeo, logCapMat);
  } else {
    disposables.push(trunkGeo, trunkMat, tier1Geo, tier1Mat, tier2Geo, tier2Mat, tier3Geo, tier3Mat);
  }

  // =========================================================================
  // 11. DISTANT SNOW-CAPPED ALPINE MOUNTAIN RANGE + FLUFFY LOW-POLY CLOUDS
  // =========================================================================
  if (!isCity) {
  const mtBodyGeo = new THREE.ConeGeometry(1, 1, 6);
  mtBodyGeo.translate(0, 0.5, 0);
  const mtBodyMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1e2c45 : isEvening ? 0x7b6c88 : 0x7aa0c6,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
  });

  const mtSnowGeo = new THREE.ConeGeometry(0.42, 0.42, 6);
  mtSnowGeo.translate(0, 0.8, 0);
  const mtSnowMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x8da4c8 : isEvening ? 0xffdfc4 : 0xf4f9ff,
    roughness: 0.72,
    metalness: 0.02,
    flatShading: true,
  });

  const peakCount = 30;
  const mtBodyInst = new THREE.InstancedMesh(mtBodyGeo, mtBodyMat, peakCount);
  const mtSnowInst = new THREE.InstancedMesh(mtSnowGeo, mtSnowMat, peakCount);
  for (let i = 0; i < peakCount; i++) {
    const angle = (i / peakCount) * Math.PI * 2 + (rand() - 0.5) * 0.14;
    const radius = 520 + rand() * 190;
    const mx = centerX + Math.cos(angle) * radius;
    const mz = centerZ + Math.sin(angle) * radius;
    const mWidth = 95 + rand() * 85;
    const mHeight = 95 + rand() * 115;

    const mtBaseY = Math.min(-12, sampleMeshGroundY(mx, mz) - 10);
    dummy.position.set(mx, mtBaseY, mz);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(mWidth, mHeight, mWidth * (0.85 + rand() * 0.3));
    dummy.updateMatrix();
    mtBodyInst.setMatrixAt(i, dummy.matrix);
    mtSnowInst.setMatrixAt(i, dummy.matrix);
  }
  mtBodyInst.instanceMatrix.needsUpdate = true;
  mtSnowInst.instanceMatrix.needsUpdate = true;
  mtBodyInst.computeBoundingSphere();
  mtSnowInst.computeBoundingSphere();
  group.add(mtBodyInst, mtSnowInst);
  disposables.push(mtBodyGeo, mtBodyMat, mtSnowGeo, mtSnowMat);
  }

  // Fluffy Stylized Low-Poly Sky Clouds
  const cloudPuffGeo = new THREE.DodecahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x243454 : isEvening ? 0xffcaa2 : 0xffffff,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
    fog: false,
  });
  const cloudGroups = 24;
  const puffsPerCloud = 3;
  const cloudInst = new THREE.InstancedMesh(cloudPuffGeo, cloudMat, cloudGroups * puffsPerCloud);
  let cIdx = 0;
  for (let c = 0; c < cloudGroups; c++) {
    const ang = (c / cloudGroups) * Math.PI * 2 + rand() * 0.25;
    const rad = 220 + rand() * 440;
    const cx = centerX + Math.cos(ang) * rad;
    const cz = centerZ + Math.sin(ang) * rad;
    const cy = 120 + rand() * 55;
    const baseScale = 14 + rand() * 14;

    const offsets = [
      { ox: 0, oy: 0, oz: 0, sx: 1.5, sy: 0.62, sz: 1.0 },
      { ox: -baseScale * 0.95, oy: -baseScale * 0.14, oz: baseScale * 0.18, sx: 1.05, sy: 0.48, sz: 0.85 },
      { ox: baseScale * 1.0, oy: -baseScale * 0.12, oz: -baseScale * 0.16, sx: 1.1, sy: 0.50, sz: 0.88 },
    ];
    for (const off of offsets) {
      dummy.position.set(cx + off.ox, cy + off.oy, cz + off.oz);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(baseScale * off.sx, baseScale * off.sy, baseScale * off.sz);
      dummy.updateMatrix();
      cloudInst.setMatrixAt(cIdx++, dummy.matrix);
    }
  }
  cloudInst.instanceMatrix.needsUpdate = true;
  cloudInst.computeBoundingSphere();
  group.add(cloudInst);
  disposables.push(cloudPuffGeo, cloudMat);

  // 12. High-Visibility Motorsport Corner Diversion Chevron Boards (<<< / >>>) & Overhead Drift Zone Arches
  const chevLeftTex = createCornerChevronTexture(maxAniso, -1);
  const chevRightTex = createCornerChevronTexture(maxAniso, 1);
  // Deeply anchored post extending 1.6m below track datum so chevrons never float above embankments
  const chevPostGeo = new THREE.BoxGeometry(0.18, 3.9, 0.18);
  const chevBoardGeo = new THREE.BoxGeometry(3.2, 1.55, 0.22);
  const chevPostMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.65 });
  const chevLeftMat = new THREE.MeshStandardMaterial({
    map: chevLeftTex,
    roughness: 0.35,
    emissive: 0x3b2c04,
    emissiveIntensity: isNight ? 1.55 : 0.48,
  });
  const chevRightMat = new THREE.MeshStandardMaterial({
    map: chevRightTex,
    roughness: 0.35,
    emissive: 0x3b2c04,
    emissiveIntensity: isNight ? 1.55 : 0.48,
  });

  const leftTurnMats: THREE.Matrix4[] = [];
  const rightTurnMats: THREE.Matrix4[] = [];
  const postTurnMats: THREE.Matrix4[] = [];
  const chevMeta: Array<{
    x: number;
    y: number;
    z: number;
    sampleIdx: number;
    turnDir: -1 | 1;
    boardIdx: number;
    postIdx: number;
  }> = [];

  for (let i = 10; i < samples.length - 8; i += 6) {
    if (samples[i].curvature < 0.105) continue;
    // Skip placing chevron boards directly inside flared diversion aprons
    const insideDiv = diversions.some((d) => i >= d.startIdx - 6 && i <= d.endIdx + 6);
    if (insideDiv) continue;

    const s = samples[i];
    const next = samples[(i + 6) % samples.length];
    const crossY = s.tangent.x * next.tangent.z - s.tangent.z * next.tangent.x;
    // crossY > 0 means track curves left -> outside wall is on the RIGHT (+1) and arrows point LEFT (-1)
    const turnDir: -1 | 1 = crossY > 0 ? -1 : 1;
    const outsideSide = -turnDir;
    const chevLat = barrierOffset + 0.95;
    const px = s.pos.x + s.right.x * outsideSide * chevLat;
    const pz = s.pos.z + s.right.z * outsideSide * chevLat;
    const chevBaseY = sampleRoadsideGroundY(px, pz, s.pos.y, chevLat);
    // Angle the chevron board slightly inward toward oncoming drivers so arrows read crisply from afar
    const boardYaw = Math.atan2(s.tangent.x, s.tangent.z) + outsideSide * 0.42;

    dummy.position.set(px, s.pos.y + 1.95, pz);
    dummy.rotation.set(0, boardYaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    let boardIdx = 0;
    if (turnDir < 0) {
      boardIdx = leftTurnMats.length;
      leftTurnMats.push(dummy.matrix.clone());
    } else {
      boardIdx = rightTurnMats.length;
      rightTurnMats.push(dummy.matrix.clone());
    }

    const postIdx = postTurnMats.length;
    dummy.position.set(px, s.pos.y + 0.35, pz);
    dummy.updateMatrix();
    postTurnMats.push(dummy.matrix.clone());
    chevMeta.push({ x: px, y: chevBaseY, z: pz, sampleIdx: i, turnDir, boardIdx, postIdx });
  }

  let leftBoardInst: THREE.InstancedMesh | null = null;
  let rightBoardInst: THREE.InstancedMesh | null = null;
  let chevPostInst: THREE.InstancedMesh | null = null;
  if (leftTurnMats.length > 0) {
    leftBoardInst = new THREE.InstancedMesh(chevBoardGeo, chevLeftMat, leftTurnMats.length);
    leftTurnMats.forEach((m, idx) => leftBoardInst!.setMatrixAt(idx, m));
    leftBoardInst.instanceMatrix.needsUpdate = true;
    leftBoardInst.computeBoundingSphere();
    group.add(leftBoardInst);
  }
  if (rightTurnMats.length > 0) {
    rightBoardInst = new THREE.InstancedMesh(chevBoardGeo, chevRightMat, rightTurnMats.length);
    rightTurnMats.forEach((m, idx) => rightBoardInst!.setMatrixAt(idx, m));
    rightBoardInst.instanceMatrix.needsUpdate = true;
    rightBoardInst.computeBoundingSphere();
    group.add(rightBoardInst);
  }
  if (postTurnMats.length > 0) {
    chevPostInst = new THREE.InstancedMesh(chevPostGeo, chevPostMat, postTurnMats.length);
    postTurnMats.forEach((m, idx) => chevPostInst!.setMatrixAt(idx, m));
    chevPostInst.instanceMatrix.needsUpdate = true;
    chevPostInst.computeBoundingSphere();
    group.add(chevPostInst);
  }
  if (chevPostInst) {
    for (const cm of chevMeta) {
      const boardMesh = cm.turnDir < 0 ? leftBoardInst : rightBoardInst;
      const boardMats = cm.turnDir < 0 ? leftTurnMats : rightTurnMats;
      const parts: Array<{ mesh: THREE.InstancedMesh; instanceId: number; worldMatrix: THREE.Matrix4 }> = [
        { mesh: chevPostInst, instanceId: cm.postIdx, worldMatrix: postTurnMats[cm.postIdx] },
      ];
      if (boardMesh) {
        parts.push({ mesh: boardMesh, instanceId: cm.boardIdx, worldMatrix: boardMats[cm.boardIdx] });
      }
      const breakableId = registerBreakable('sign', cm.x, cm.y, cm.z, cm.y + 0.08, parts);
      poleColliders.push({
        x: cm.x,
        z: cm.z,
        radius: 0.3,
        sampleIdx: cm.sampleIdx,
        breakableId,
      });
    }
  }

  // Overhead Motorsport Sector / Drift Zone Gantries around the circuit for authentic speed sensation!
  const driftArchTex = createJumpArchTexture(maxAniso, 'DRIFT ZONE');
  const driftArchMat = new THREE.MeshStandardMaterial({
    map: driftArchTex,
    roughness: 0.34,
    emissive: 0x2a1f05,
    emissiveIntensity: isNight ? 1.15 : 0.35,
  });
  const sectorPostGeo = new THREE.BoxGeometry(0.75, 10.4, 0.85);
  const sectorBeamGeo = new THREE.BoxGeometry(roadWidth + 4.8, 1.65, 0.85);
  const sectorIndices = [195, 395];
  for (const si of sectorIndices) {
    const insideDiv = diversions.some((d) => si >= d.startIdx - 10 && si <= d.endIdx + 10);
    if (insideDiv) continue;
    const s = samples[si % samples.length];
    const sg = new THREE.Group();
    sg.position.copy(s.pos);
    sg.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(sectorPostGeo, signPostMat);
      p.position.set(side * (halfRoad + 2.2), 2.8, 0);
      sg.add(p);
      poleColliders.push({
        x: s.pos.x + s.right.x * side * (halfRoad + 2.2),
        z: s.pos.z + s.right.z * side * (halfRoad + 2.2),
        radius: 0.56,
        sampleIdx: si % samples.length,
      });
    }
    const beam = new THREE.Mesh(sectorBeamGeo, [
      signPostMat,
      signPostMat,
      signPostMat,
      signPostMat,
      driftArchMat,
      driftArchMat,
    ]);
    beam.position.set(0, 7.6, 0);
    sg.add(beam);
    group.add(sg);
  }

  // =========================================================================
  // 12. DECORATIVE MULTI-PART STREET BENCHES & COLORFUL TERRACOTTA FLOWER POTS
  //     Fills empty sidewalks, piazzas, promenades & roadside verges on ALL tracks
  //     (Every bench & flower pot is a speed-based movable knock-down object!)
  // =========================================================================
  // A. 4-Part Cast-Iron & Cedar Wood Park/Street Bench (2.1m wide, anchored legs extend 0.16m below datum for sloped verges!)
  const benchLegGeo = new THREE.BoxGeometry(0.12, 0.90, 0.62);
  benchLegGeo.translate(0, 0.29, 0);
  const benchSeatGeo = new THREE.BoxGeometry(2.05, 0.09, 0.56);
  benchSeatGeo.translate(0, 0.46, 0.04);
  const benchBackGeo = new THREE.BoxGeometry(2.05, 0.42, 0.08);
  benchBackGeo.rotateX(-0.18);
  benchBackGeo.translate(0, 0.80, -0.24);
  const benchBraceGeo = new THREE.BoxGeometry(1.96, 0.08, 0.08);
  benchBraceGeo.translate(0, 0.24, 0);

  const benchIronMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1e242d : 0x26313d,
    roughness: 0.42,
    metalness: 0.68,
  });
  const benchWoodMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x5c371d : 0xa15c2c,
    roughness: 0.78,
    metalness: 0.04,
  });

  // B. 4-Part Sculpted Lathe Terracotta Flower Pot + Potting Soil + Foliage + Vibrant Blooms
  const urnProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.27, 0.0),
    new THREE.Vector2(0.32, 0.14),
    new THREE.Vector2(0.41, 0.44),
    new THREE.Vector2(0.46, 0.58),
    new THREE.Vector2(0.49, 0.66),
    new THREE.Vector2(0.43, 0.69),
    new THREE.Vector2(0.38, 0.64),
  ];
  const decoPotGeo = new THREE.LatheGeometry(urnProfile, 10);
  const decoPotMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.05,
  });

  const decoSoilGeo = new THREE.CylinderGeometry(0.39, 0.36, 0.08, 8);
  decoSoilGeo.translate(0, 0.62, 0);
  const decoSoilMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x241710 : 0x422a1b,
    roughness: 0.96,
    metalness: 0.0,
  });

  const decoLeafGeo = new THREE.DodecahedronGeometry(0.44, 0);
  decoLeafGeo.scale(1.15, 0.78, 1.15);
  decoLeafGeo.translate(0, 0.88, 0);
  const decoLeafMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1d4d24 : 0x338a36,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });

  const decoBloomGeo = new THREE.DodecahedronGeometry(0.22, 0);
  decoBloomGeo.translate(0, 1.12, 0);
  const decoBloomMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.02,
    emissive: isNight ? 0x1e1418 : 0x000000,
    emissiveIntensity: isNight ? 0.35 : 0,
    flatShading: true,
  });

  interface PlacedBench {
    x: number;
    y: number;
    z: number;
    groundY: number;
    yaw: number;
    sampleIdx: number;
  }
  interface PlacedFlowerPot {
    x: number;
    y: number;
    z: number;
    groundY: number;
    scale: number;
    potTint: number;
    bloomTint: number;
    sampleIdx: number;
  }

  const placedBenches: PlacedBench[] = [];
  const placedPots: PlacedFlowerPot[] = [];

  const potTints = isNight
    ? [0x7d3b24, 0x8f4c2f, 0x7a5738, 0x6b3a2c]
    : [0xc95d36, 0xd87444, 0xb84f2e, 0xc89a65, 0xb3643c];
  const bloomPalette = [
    0xef4444, // vibrant geranium red
    0xf59e0b, // sunny marigold gold
    0xec4899, // Mediterranean bougainvillea pink
    0xa855f7, // lavender violet
    0xf97316, // warm coral orange
    0xfef3c7, // cream jasmine white
  ];

  const pushDecorPot = (
    x: number,
    y: number,
    z: number,
    groundY: number,
    sampleIdx: number,
    scale = 1.0
  ) => {
    const idx = placedPots.length;
    placedPots.push({
      x,
      y,
      z,
      groundY,
      scale,
      potTint: potTints[idx % potTints.length],
      bloomTint: bloomPalette[idx % bloomPalette.length],
      sampleIdx,
    });
  };

  if (isCity) {
    // City Track: line wide Italian sidewalks, piazza stretches & storefronts with welcoming benches & vibrant flower pots!
    const cityHalfRoadFn = (idx: number) =>
      halfRoad - getCityStreetTightness(idx, samples.length) * 2.85;

    for (let i = 6; i < samples.length - 6; i += 9) {
      const insideDiv = diversions.some((d) => i >= d.startIdx - 10 && i <= d.endIdx + 10);
      const s = samples[i];
      const tightness = getCityStreetTightness(i, samples.length);
      const roadHalf = cityHalfRoadFn(i);
      const roadYaw = Math.atan2(s.tangent.x, s.tangent.z);

      if (insideDiv) {
        // Flower pots decorating the stone central diversion median between twin lamps!
        if (i % 18 === 6) {
          pushDecorPot(s.pos.x, s.pos.y + 0.30, s.pos.z, s.pos.y + 0.10, i, 1.08);
        }
        continue;
      }

      if (tightness <= 0.35) {
        // Wide Italian boulevards & piazzas: benches facing the street flanked by colorful terracotta flower pots!
        const side = (i % 18 === 6 ? -1 : 1) as -1 | 1;
        const benchLat = roadHalf + 2.55;
        const bx = s.pos.x + s.right.x * side * benchLat;
        const bz = s.pos.z + s.right.z * side * benchLat;
        // Local +Z faces toward the street center from either side
        const faceYaw = side === -1 ? roadYaw + Math.PI * 0.5 : roadYaw - Math.PI * 0.5;
        placedBenches.push({
          x: bx,
          y: s.pos.y + 0.21,
          z: bz,
          groundY: s.pos.y + 0.10,
          yaw: faceYaw,
          sampleIdx: i,
        });

        // Pair a vibrant flower pot beside the bench + one on the opposite sidewalk!
        pushDecorPot(
          bx + s.tangent.x * 1.48,
          s.pos.y + 0.21,
          bz + s.tangent.z * 1.48,
          s.pos.y + 0.10,
          i,
          0.95 + (i % 3) * 0.08
        );
        const oppLat = roadHalf + 2.05;
        pushDecorPot(
          s.pos.x - s.right.x * side * oppLat,
          s.pos.y + 0.21,
          s.pos.z - s.right.z * side * oppLat,
          s.pos.y + 0.10,
          i,
          0.9 + (i % 4) * 0.07
        );
      } else if (i % 18 === 6) {
        // Narrow vicolo alleys: tuck compact colorful terracotta flower pots flush against storefront walls
        const side = (i % 36 === 6 ? -1 : 1) as -1 | 1;
        const potLat = roadHalf + 1.35;
        pushDecorPot(
          s.pos.x + s.right.x * side * potLat,
          s.pos.y + 0.19,
          s.pos.z + s.right.z * side * potLat,
          s.pos.y + 0.10,
          i,
          0.84
        );
      }
    }
  } else {
    // Non-City Tracks (Racing, Stadium, Hill, Off-Road, Riverside, Go-Kart):
    // Decorate empty roadside verges, spectator promenades, overlooks & paddock borders with benches & flower pots!
    const step = isStadium || isGoKart ? 11 : 13;
    for (let i = 10; i < samples.length - 10; i += step) {
      const insideDiv = diversions.some((d) => i >= d.startIdx - 10 && i <= d.endIdx + 10);
      if (insideDiv) continue;
      const s = samples[i];
      const side = (Math.floor(i / step) % 2 === 0 ? -1 : 1) as -1 | 1;
      // Keep Riverside's right-hand water channel dry!
      if (isRiverside && side === 1) continue;

      const vergeDist =
        isStadium
          ? barrierOffset + 1.85
          : isOffroad || isRiverside
          ? halfRoad + kerbWidth + 3.2
          : barrierOffset + 2.6;
      const bx = s.pos.x + s.right.x * side * vergeDist;
      const bz = s.pos.z + s.right.z * side * vergeDist;
      if (!isClearOfTrack(bx, bz, halfRoad + kerbWidth + 1.4)) continue;
      if (isInsidePond(bx, bz)) continue;

      const roadYaw = Math.atan2(s.tangent.x, s.tangent.z);
      const faceYaw = side === -1 ? roadYaw + Math.PI * 0.5 : roadYaw - Math.PI * 0.5;
      const cosF = Math.cos(faceYaw);
      const sinF = Math.sin(faceYaw);
      const yCenter = sampleRoadsideGroundY(bx, bz, s.pos.y, vergeDist);
      const yLeftLeg = sampleRoadsideGroundY(bx - cosF * 0.88, bz + sinF * 0.88, s.pos.y, vergeDist);
      const yRightLeg = sampleRoadsideGroundY(bx + cosF * 0.88, bz - sinF * 0.88, s.pos.y, vergeDist);
      const gy = Math.min(yCenter, yLeftLeg, yRightLeg) - 0.02;
      placedBenches.push({
        x: bx,
        y: gy,
        z: bz,
        groundY: gy,
        yaw: faceYaw,
        sampleIdx: i,
      });

      // Flanking flower pots on both ends of each roadside bench!
      for (const endSign of [-1, 1]) {
        const px = bx + s.tangent.x * endSign * 1.52;
        const pz = bz + s.tangent.z * endSign * 1.52;
        if (!isClearOfTrack(px, pz, halfRoad + kerbWidth + 1.2)) continue;
        const pgy = sampleRoadsideGroundY(px, pz, s.pos.y, vergeDist) - 0.04;
        pushDecorPot(px, pgy, pz, pgy, i, 0.95 + ((i + (endSign > 0 ? 1 : 0)) % 3) * 0.1);
      }

      // Opposite roadside colorful flower pot cluster to balance the visual horizon!
      const oppSide = -side;
      if (!(isRiverside && oppSide === 1)) {
        const oppDist =
          isOffroad || isRiverside ? halfRoad + kerbWidth + 2.85 : barrierOffset + 2.35;
        const ox = s.pos.x + s.right.x * oppSide * oppDist;
        const oz = s.pos.z + s.right.z * oppSide * oppDist;
        if (isClearOfTrack(ox, oz, halfRoad + kerbWidth + 1.2) && !isInsidePond(ox, oz)) {
          const ogy = sampleRoadsideGroundY(ox, oz, s.pos.y, oppDist) - 0.04;
          pushDecorPot(ox, ogy, oz, ogy, i, 1.06);
        }
      }
    }
  }

  // Instantiate all 4-part benches as knock-downable BreakableProps!
  if (placedBenches.length > 0) {
    const bCount = placedBenches.length;
    const benchLegInst = new THREE.InstancedMesh(benchLegGeo, benchIronMat, bCount * 2);
    const benchSeatInst = new THREE.InstancedMesh(benchSeatGeo, benchWoodMat, bCount);
    const benchBackInst = new THREE.InstancedMesh(benchBackGeo, benchWoodMat, bCount);
    const benchBraceInst = new THREE.InstancedMesh(benchBraceGeo, benchIronMat, bCount);

    for (let bi = 0; bi < bCount; bi++) {
      const b = placedBenches[bi];
      const cosY = Math.cos(b.yaw);
      const sinY = Math.sin(b.yaw);

      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      const baseMat = dummy.matrix.clone();
      benchSeatInst.setMatrixAt(bi, baseMat);
      benchBackInst.setMatrixAt(bi, baseMat);
      benchBraceInst.setMatrixAt(bi, baseMat);

      // Left & right cast-iron leg frames offset ±0.88m along bench local X
      const legMats: THREE.Matrix4[] = [];
      for (let li = 0; li < 2; li++) {
        const lx = li === 0 ? -0.88 : 0.88;
        dummy.position.set(b.x + cosY * lx, b.y, b.z - sinY * lx);
        dummy.rotation.set(0, b.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        const lm = dummy.matrix.clone();
        benchLegInst.setMatrixAt(bi * 2 + li, lm);
        legMats.push(lm);
      }

      const breakableId = registerBreakable('bench', b.x, b.y, b.z, b.groundY, [
        { mesh: benchLegInst, instanceId: bi * 2, worldMatrix: legMats[0] },
        { mesh: benchLegInst, instanceId: bi * 2 + 1, worldMatrix: legMats[1] },
        { mesh: benchSeatInst, instanceId: bi, worldMatrix: baseMat },
        { mesh: benchBackInst, instanceId: bi, worldMatrix: baseMat },
        { mesh: benchBraceInst, instanceId: bi, worldMatrix: baseMat },
      ]);
      boxColliders.push({
        x: b.x,
        z: b.z,
        halfW: 1.04,
        halfD: 0.34,
        cosYaw: cosY,
        sinYaw: sinY,
        sampleIdx: b.sampleIdx,
        breakableId,
      });
    }

    for (const inst of [benchLegInst, benchSeatInst, benchBackInst, benchBraceInst]) {
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = !lowPower;
      inst.computeBoundingSphere();
      group.add(inst);
    }
  }

  // Instantiate all 4-part terracotta flower pots with vibrant multi-color blossoms (movable!)
  if (placedPots.length > 0) {
    const pCount = placedPots.length;
    const potBodyInst = new THREE.InstancedMesh(decoPotGeo, decoPotMat, pCount);
    const potSoilInst = new THREE.InstancedMesh(decoSoilGeo, decoSoilMat, pCount);
    const potLeafInst = new THREE.InstancedMesh(decoLeafGeo, decoLeafMat, pCount);
    const potBloomInst = new THREE.InstancedMesh(decoBloomGeo, decoBloomMat, pCount * 3);

    const bloomOffsets: Array<[number, number, number]> = [
      [0.0, 0.04, 0.0],
      [0.21, -0.08, 0.14],
      [-0.20, -0.07, -0.15],
    ];

    for (let pi = 0; pi < pCount; pi++) {
      const p = placedPots[pi];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, (pi * 1.17) % (Math.PI * 2), 0);
      dummy.scale.set(p.scale, p.scale, p.scale);
      dummy.updateMatrix();
      const baseMat = dummy.matrix.clone();

      potBodyInst.setMatrixAt(pi, baseMat);
      potSoilInst.setMatrixAt(pi, baseMat);
      potLeafInst.setMatrixAt(pi, baseMat);

      colorTmp.setHex(p.potTint);
      potBodyInst.setColorAt(pi, colorTmp);

      const parts: Array<{ mesh: THREE.InstancedMesh; instanceId: number; worldMatrix: THREE.Matrix4 }> = [
        { mesh: potBodyInst, instanceId: pi, worldMatrix: baseMat },
        { mesh: potSoilInst, instanceId: pi, worldMatrix: baseMat },
        { mesh: potLeafInst, instanceId: pi, worldMatrix: baseMat },
      ];

      for (let k = 0; k < 3; k++) {
        const [ox, oy, oz] = bloomOffsets[k];
        dummy.position.set(p.x + ox * p.scale, p.y + oy * p.scale, p.z + oz * p.scale);
        dummy.rotation.set(0, pi * 0.7 + k * 2.1, 0);
        const bs = p.scale * (k === 0 ? 1.05 : 0.82);
        dummy.scale.set(bs, bs, bs);
        dummy.updateMatrix();
        const bm = dummy.matrix.clone();
        const bloomIdx = pi * 3 + k;
        potBloomInst.setMatrixAt(bloomIdx, bm);
        colorTmp.setHex(k === 0 ? p.bloomTint : bloomPalette[(pi + k * 2) % bloomPalette.length]);
        potBloomInst.setColorAt(bloomIdx, colorTmp);
        parts.push({ mesh: potBloomInst, instanceId: bloomIdx, worldMatrix: bm });
      }

      const breakableId = registerBreakable('pot', p.x, p.y, p.z, p.groundY, parts);
      poleColliders.push({
        x: p.x,
        z: p.z,
        radius: 0.42 * p.scale,
        sampleIdx: p.sampleIdx,
        breakableId,
      });
    }

    for (const inst of [potBodyInst, potSoilInst, potLeafInst, potBloomInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }
  }

  disposables.push(
    chevLeftTex,
    chevRightTex,
    chevPostGeo,
    chevBoardGeo,
    chevPostMat,
    chevLeftMat,
    chevRightMat,
    driftArchTex,
    driftArchMat,
    sectorPostGeo,
    sectorBeamGeo,
    benchLegGeo,
    benchSeatGeo,
    benchBackGeo,
    benchBraceGeo,
    benchIronMat,
    benchWoodMat,
    decoPotGeo,
    decoPotMat,
    decoSoilGeo,
    decoSoilMat,
    decoLeafGeo,
    decoLeafMat,
    decoBloomGeo,
    decoBloomMat
  );

  return {
    id: trackId,
    timeOfDay,
    group,
    curve,
    samples,
    ramps,
    diversions,
    poleColliders,
    boxColliders,
    breakables,
    roadWidth,
    kerbWidth,
    barrierOffset,
    length,
    skyColor,
    fogColor,
    fogDensity,
    sunColor,
    sunIntensity,
    sunPos,
    hemiSky,
    hemiGround,
    hemiIntensity,
    minimapPoints,
    bounds,
    getGroundY: sampleMeshGroundY,
    roadMaterial: roadMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
