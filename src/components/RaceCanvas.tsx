import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildTrackScene, stepBreakables } from '../game/tracks.ts';
import { buildVehicleMesh, type CarMeshRig } from '../game/carMesh.ts';
import {
  computeAiInput,
  createPhysicsCar,
  resolveCarCollisions,
  stepCarPhysics,
  type CarInput,
  type PhysicsCar,
} from '../game/physics.ts';
import { RacingAudioEngine } from '../game/audio.ts';
import {
  DEFAULT_VEHICLE_CONFIG,
  TRACK_SPECS,
  type CameraMode,
  type ChassisId,
  type GameMode,
  type MultiplayerPlayer,
  type PerformanceMode,
  type PlatformType,
  type RaceTelemetry,
  type RemoteCarState,
  type TimeOfDay,
  type TrackId,
  type TransmissionMode,
  type VehicleConfig,
} from '../types/game.ts';

export interface TouchInputState {
  left: boolean;
  right: boolean;
  gyroSteer: number; // -1..1 analog tilt steering when gyroscope mode is active
  wheelSteer: number; // -1..1 analog rotary steering when on-screen steering wheel mode is active
  joystickSteer: number; // -1..1 analog thumbstick steering when on-screen virtual joystick mode is active
  gas: boolean;
  brake: boolean;
  reverse: boolean;
  handbrake?: boolean;
  nitro: boolean;
  shiftUpPending: boolean;
  shiftDownPending: boolean;
}

interface RaceCanvasProps {
  trackId: TrackId;
  timeOfDay: TimeOfDay;
  mode: GameMode;
  playerName: string;
  playerPlatform: PlatformType;
  playerVehicle: VehicleConfig;
  playerId: string;
  multiplayerPlayers?: MultiplayerPlayer[];
  fillWithAi?: boolean;
  lapsOverride?: number;
  paused: boolean;
  muted: boolean;
  cameraMode: CameraMode;
  transmissionMode: TransmissionMode;
  performanceMode: PerformanceMode;
  resetCounter: number;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  peerStatesRef: React.MutableRefObject<Map<string, RemoteCarState>>;
  onTelemetry: (telemetry: RaceTelemetry) => void;
  onBroadcastState?: (state: RemoteCarState) => void;
  onRaceFinish?: (result: {
    position: number;
    completedAllLaps: boolean;
    bestLapMs: number;
    totalTimeMs: number;
    topSpeedKmh: number;
    driftPoints: number;
    standings: RaceTelemetry['standings'];
  }) => void;
  onTogglePause?: () => void;
  onCycleCamera?: () => void;
}

interface AiRival {
  car: PhysicsCar;
  rig: CarMeshRig;
  skill: number;
  preferredLane: number;
}

interface PeerCar {
  player: MultiplayerPlayer;
  rig: CarMeshRig;
  x: number;
  y: number;
  z: number;
  heading: number;
  steer: number;
  pitch: number;
  roll: number;
  wheelSpin: number;
}

const AI_ROSTER: Array<{
  name: string;
  chassisId: ChassisId;
  color: string;
  accent: string;
  skill: number;
  engineLevel: number;
}> = [
  { name: 'K. Takahashi', chassisId: 'hyperion-proto', color: '#E2E8F0', accent: '#EF4444', skill: 1.03, engineLevel: 5 },
  { name: 'L. Bellini', chassisId: 'stratos-gt3', color: '#2563EB', accent: '#F59E0B', skill: 0.99, engineLevel: 4 },
  { name: 'M. Lindqvist', chassisId: 'veloce-v12', color: '#F59E0B', accent: '#0F172A', skill: 0.96, engineLevel: 4 },
  { name: 'R. Alvarez', chassisId: 'vanguard-v8', color: '#15803D', accent: '#F8FAFC', skill: 0.93, engineLevel: 3 },
  { name: 'S. Moreau', chassisId: 'drift-s15', color: '#0EA5E9', accent: '#F8FAFC', skill: 0.90, engineLevel: 3 },
];

// Reusable math helpers outside render loop (zero GC)
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function RaceCanvas({
  trackId,
  timeOfDay,
  mode,
  playerName,
  playerPlatform,
  playerVehicle,
  playerId,
  multiplayerPlayers,
  fillWithAi = true,
  lapsOverride,
  paused,
  muted,
  cameraMode,
  transmissionMode,
  performanceMode,
  resetCounter,
  touchInputRef,
  peerStatesRef,
  onTelemetry,
  onBroadcastState,
  onRaceFinish,
  onTogglePause,
  onCycleCamera,
}: RaceCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const cameraModeRef = useRef(cameraMode);
  const onTogglePauseRef = useRef(onTogglePause);
  onTogglePauseRef.current = onTogglePause;
  const onCycleCameraRef = useRef(onCycleCamera);
  onCycleCameraRef.current = onCycleCamera;
  cameraModeRef.current = cameraMode;
  const transmissionModeRef = useRef(transmissionMode);
  transmissionModeRef.current = transmissionMode;
  const resetCounterRef = useRef(resetCounter);
  resetCounterRef.current = resetCounter;
  const onTelemetryRef = useRef(onTelemetry);
  onTelemetryRef.current = onTelemetry;
  const onBroadcastRef = useRef(onBroadcastState);
  onBroadcastRef.current = onBroadcastState;
  const onFinishRef = useRef(onRaceFinish);
  onFinishRef.current = onRaceFinish;

  const audioRef = useRef<RacingAudioEngine | null>(null);
  const resumeLoopRef = useRef<(() => void) | null>(null);
  const performanceModeRef = useRef(performanceMode);
  const applyPerfRef = useRef<((mode: PerformanceMode) => void) | null>(null);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    performanceModeRef.current = performanceMode;
    applyPerfRef.current?.(performanceMode);
  }, [performanceMode]);

  useEffect(() => {
    if (paused) {
      audioRef.current?.setSuspended(true);
    } else {
      audioRef.current?.setSuspended(false);
      resumeLoopRef.current?.();
    }
  }, [paused]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const isMobile = playerPlatform !== 'Desktop';
    const initialPerf = performanceModeRef.current;
    let isEco = initialPerf === 'eco';
    const isBalanced = initialPerf === 'balanced';
    const lowPower = isEco || isBalanced || isMobile;

    const maxDpr = isSoftwareGl
      ? 1
      : isEco
      ? 1.0
      : isBalanced
      ? isMobile
        ? 1.2
        : 1.5
      : isMobile
      ? 1.5
      : 2.0;
    let activeDpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    // Disable expensive hardware MSAA on high-PPI mobile screens & Eco mode to save GPU tile bandwidth & heat
    const useAntialias = !isSoftwareGl && !isEco && !(isMobile && isBalanced);
    const renderer = new THREE.WebGLRenderer({
      antialias: useAntialias,
      powerPreference: isMobile || isEco ? 'default' : 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(activeDpr);
    let shadowsEnabled = !isSoftwareGl && !isEco;
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = lowPower ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    // On mobile/balanced, update dynamic shadow map every 2nd rendered frame (cuts shadow GPU pass in half!)
    let shadowUpdateStride = lowPower ? 2 : 1;
    if (shadowsEnabled && shadowUpdateStride > 1) {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
    }
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAniso = lowPower
      ? Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
      : renderer.capabilities.getMaxAnisotropy();
    const builtTrack = buildTrackScene(trackId, timeOfDay, maxAniso, lowPower);
    const totalLaps = lapsOverride ?? TRACK_SPECS[trackId].laps;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(builtTrack.skyColor);
    scene.fog = new THREE.FogExp2(builtTrack.fogColor, builtTrack.fogDensity);
    scene.add(builtTrack.group);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = timeOfDay === 'night' ? 0.55 : 0.85;
    pmrem.dispose();

    // Warm sun key light + cool sky/ground hemisphere fill
    const hemi = new THREE.HemisphereLight(
      builtTrack.hemiSky,
      builtTrack.hemiGround,
      builtTrack.hemiIntensity
    );
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(builtTrack.sunColor, builtTrack.sunIntensity);
    sun.position.copy(builtTrack.sunPos);
    sun.castShadow = shadowsEnabled;
    const shadowRes = lowPower ? 512 : 1024;
    const shadowBound = lowPower ? 34 : 45;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    sun.shadow.camera.left = -shadowBound;
    sun.shadow.camera.right = shadowBound;
    sun.shadow.camera.top = shadowBound;
    sun.shadow.camera.bottom = -shadowBound;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = lowPower ? 260 : 360;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    // Night high-beam forward illumination light for clear night racing visibility
    const headlightBeam =
      timeOfDay === 'night' ? new THREE.PointLight(0xfff4d6, 26, 62, 1.35) : null;
    if (headlightBeam) {
      scene.add(headlightBeam);
    }

    const cameraFar = isEco ? 680 : lowPower ? 860 : 1450;
    const camera = new THREE.PerspectiveCamera(
      64,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.2,
      cameraFar
    );

    // Determine starting grid slot for local player
    const remoteHumans = (multiplayerPlayers ?? []).filter((p) => p.id !== playerId);
    const localMpEntry = (multiplayerPlayers ?? []).find((p) => p.id === playerId);
    const playerSlot = mode === 'multiplayer' && localMpEntry ? localMpEntry.gridSlot : 0;

    const playerCar = createPhysicsCar(
      playerId || 'local-player',
      playerName,
      playerVehicle,
      builtTrack.samples,
      playerSlot
    );
    const playerRig = buildVehicleMesh(playerVehicle, { lowPower });
    scene.add(playerRig.root);

    // Build remote multiplayer human peer rigs
    const peerCars: PeerCar[] = remoteHumans.map((mp) => {
      const startCar = createPhysicsCar(mp.id, mp.name, mp.vehicle, builtTrack.samples, mp.gridSlot);
      const rig = buildVehicleMesh(mp.vehicle, { lowPower });
      rig.root.position.set(startCar.x, startCar.y, startCar.z);
      rig.root.rotation.y = startCar.heading;
      scene.add(rig.root);
      return {
        player: mp,
        rig,
        x: startCar.x,
        y: startCar.y,
        z: startCar.z,
        heading: startCar.heading,
        steer: 0,
        pitch: 0,
        roll: 0,
        wheelSpin: 0,
      };
    });

    // Build AI rivals for Quick Race or Multiplayer AI Grid Fill
    const aiRivals: AiRival[] = [];
    const wantAiCount =
      mode === 'time-trial'
        ? 0
        : mode === 'quick-race'
        ? 5
        : fillWithAi
        ? Math.max(0, 6 - (multiplayerPlayers?.length ?? 1))
        : 0;

    const usedSlots = new Set<number>([playerSlot, ...remoteHumans.map((p) => p.gridSlot)]);
    let nextSlot = 0;
    for (let i = 0; i < wantAiCount; i++) {
      while (usedSlots.has(nextSlot)) nextSlot++;
      usedSlots.add(nextSlot);

      const template = AI_ROSTER[i % AI_ROSTER.length];
      const aiConfig: VehicleConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        chassisId: template.chassisId,
        primaryColor: template.color,
        accentColor: template.accent,
        engineLevel: template.engineLevel,
      };
      const aiCar = createPhysicsCar(`ai-${i}`, template.name, aiConfig, builtTrack.samples, nextSlot);
      const aiRig = buildVehicleMesh(aiConfig, { lowPower });
      scene.add(aiRig.root);
      const lanePattern = [-3.1, 3.1, -2.2, 2.2, -1.4];
      aiRivals.push({
        car: aiCar,
        rig: aiRig,
        skill: template.skill,
        preferredLane: lanePattern[i % lanePattern.length],
      });
    }

    // Pre-allocated collision car list (zero GC allocations inside fixed physics substeps!)
    const allPhysicsCars: PhysicsCar[] = [playerCar, ...aiRivals.map((a) => a.car)];

    // Instanced tire drift smoke / warm tan rally dust particle pool (scaled down on mobile to limit overdraw)
    const MAX_SMOKE = isEco ? 44 : lowPower ? 64 : 110;
    const smokeGeo = new THREE.DodecahedronGeometry(trackId === 'offroad-track' ? 0.58 : 0.42, 0);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: trackId === 'offroad-track' ? 0xdcc39b : 0xe2e8f0,
      transparent: true,
      opacity: trackId === 'offroad-track' ? 0.54 : 0.42,
      depthWrite: false,
    });
    const smokeInst = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE);
    smokeInst.frustumCulled = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      _dummyObj.position.set(0, -100, 0);
      _dummyObj.scale.set(0.001, 0.001, 0.001);
      _dummyObj.updateMatrix();
      smokeInst.setMatrixAt(i, _dummyObj.matrix);
    }
    smokeInst.instanceMatrix.needsUpdate = true;
    scene.add(smokeInst);

    const smokeParticles = Array.from({ length: MAX_SMOKE }, () => ({
      x: 0,
      y: -100,
      z: 0,
      vy: 0,
      life: 0,
      scale: 0.01,
    }));
    let smokeCursor = 0;
    let activeSmokeCount = 0;

    const spawnSmoke = (x: number, y: number, z: number, boostScale = 0.65) => {
      const p = smokeParticles[smokeCursor];
      smokeCursor = (smokeCursor + 1) % MAX_SMOKE;
      if (p.life <= 0) activeSmokeCount++;
      p.x = x + (Math.random() - 0.5) * 0.42;
      p.y = y + 0.2;
      p.z = z + (Math.random() - 0.5) * 0.42;
      p.vy = 0.85 + Math.random() * 0.75;
      p.life = 1.0;
      p.scale = boostScale;
    };

    // Instanced persistent Tire Drift Skid Marks / Off-Road Dirt Drift Tracks (zero GC)
    const MAX_SKIDS = isEco ? 96 : lowPower ? 140 : 260;
    const skidGeo = new THREE.PlaneGeometry(0.42, 1.45);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: trackId === 'offroad-track' ? 0x5c3e24 : 0x0f131a,
      transparent: true,
      opacity: trackId === 'offroad-track' ? 0.52 : 0.48,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const skidInst = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
    skidInst.frustumCulled = false;
    for (let i = 0; i < MAX_SKIDS; i++) {
      _dummyObj.position.set(0, -100, 0);
      _dummyObj.scale.set(0.001, 0.001, 0.001);
      _dummyObj.updateMatrix();
      skidInst.setMatrixAt(i, _dummyObj.matrix);
    }
    skidInst.instanceMatrix.needsUpdate = true;
    scene.add(skidInst);
    let skidCursor = 0;
    let skidDirty = false;
    let skidStampAccum = 0;

    const stampSkid = (x: number, y: number, z: number, heading: number, widthScale = 1.0) => {
      _dummyObj.position.set(x, y + 0.04, z);
      _dummyObj.rotation.set(0, heading, 0);
      _dummyObj.scale.set(widthScale, 1, 1);
      _dummyObj.updateMatrix();
      skidInst.setMatrixAt(skidCursor, _dummyObj.matrix);
      skidCursor = (skidCursor + 1) % MAX_SKIDS;
      skidDirty = true;
    };

    // Pooled glowing orange-yellow metallic collision spark particles (zero GC)
    const MAX_SPARKS = isEco ? 20 : lowPower ? 28 : 48;
    const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.36);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffd014,
      transparent: true,
      opacity: 0.95,
    });
    const sparkInst = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    sparkInst.frustumCulled = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      _dummyObj.position.set(0, -100, 0);
      _dummyObj.scale.set(0.001, 0.001, 0.001);
      _dummyObj.updateMatrix();
      sparkInst.setMatrixAt(i, _dummyObj.matrix);
    }
    sparkInst.instanceMatrix.needsUpdate = true;
    scene.add(sparkInst);

    const sparkParticles = Array.from({ length: MAX_SPARKS }, () => ({
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
    }));
    let sparkCursor = 0;
    let activeSparkCount = 0;

    const spawnSparks = (x: number, y: number, z: number, count: number) => {
      const scaledCount = lowPower ? Math.max(3, Math.round(count * 0.65)) : count;
      for (let k = 0; k < scaledCount; k++) {
        const sp = sparkParticles[sparkCursor];
        sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
        if (sp.life <= 0) activeSparkCount++;
        const ang = Math.random() * Math.PI * 2;
        const spd = 4 + Math.random() * 11;
        sp.x = x + (Math.random() - 0.5) * 0.5;
        sp.y = y + 0.15 + Math.random() * 0.35;
        sp.z = z + (Math.random() - 0.5) * 0.5;
        sp.vx = Math.cos(ang) * spd;
        sp.vy = 2.5 + Math.random() * 5.5;
        sp.vz = Math.sin(ang) * spd;
        sp.life = 0.45 + Math.random() * 0.3;
      }
    };

    // Audio engine
    const audio = new RacingAudioEngine();
    audio.setMuted(mutedRef.current);
    audioRef.current = audio;

    // Keyboard state + edge-triggered manual gear shift queue
    const keys = new Set<string>();
    let pendingShiftUp = false;
    let pendingShiftDown = false;
    const onKeyDown = (e: KeyboardEvent) => {
      audio.unlock();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        if (e.code === 'KeyE' || e.code === 'BracketRight') {
          pendingShiftUp = true;
        } else if (e.code === 'KeyQ' || e.code === 'BracketLeft') {
          pendingShiftDown = true;
        }
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    const onFirstPointer = () => {
      audio.unlock();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onFirstPointer, { passive: true });

    // Handle WebGL context loss safely
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    // Initialize camera behind player car
    camera.position.set(
      playerCar.x - Math.sin(playerCar.heading) * 7.5,
      playerCar.y + 3.0,
      playerCar.z - Math.cos(playerCar.heading) * 7.5
    );
    camera.lookAt(playerCar.x, playerCar.y + 1.0, playerCar.z);

    // Race state loop variables
    let countdownSec = 3.2;
    let lastBeepInt = 4;
    let raceElapsedMs = 0;
    let raceEnded = false;
    let leaderFinished = false;
    let lockedFinishTimeMs = 0;
    let lockedPlayerLap = 1;
    let lockedStandings: RaceTelemetry['standings'] | null = null;
    let finishNotified = false;
    let lastTelemetryTime = 0;
    let lastBroadcastTime = 0;
    let lastFrameTime = performance.now();
    let physicsAccum = 0;
    let frameId = 0;
    let disposed = false;
    let handledReset = resetCounterRef.current;
    let camHeading = playerCar.heading;
    let camDist = cameraModeRef.current === 'far-chase' ? 9.4 : 6.9;
    let camHeight = cameraModeRef.current === 'far-chase' ? 3.55 : 2.55;
    let camY = playerCar.y;
    let impactShake = 0;
    let victoryCamBlend = 0;
    let victoryCamPosInit = false;
    const victoryCamCurr = new THREE.Vector3();
    const victoryLookCurr = new THREE.Vector3();

    const resetPlayerToTrack = () => {
      const s = builtTrack.samples[playerCar.sampleIndex];
      playerCar.x = s.pos.x;
      playerCar.y = s.pos.y + 0.11;
      playerCar.z = s.pos.z;
      playerCar.prevX = playerCar.x;
      playerCar.prevY = playerCar.y;
      playerCar.prevZ = playerCar.z;
      playerCar.vx = 0;
      playerCar.vy = 0;
      playerCar.vz = 0;
      playerCar.airborne = false;
      playerCar.airTime = 0;
      playerCar.onRamp = false;
      playerCar.speed = 0;
      playerCar.gear = 1;
      playerCar.yawRate = 0;
      playerCar.steerAngle = 0;
      playerCar.heading = Math.atan2(s.tangent.x, s.tangent.z);
      playerCar.prevHeading = playerCar.heading;
      camHeading = playerCar.heading;
      camY = playerCar.y;
    };

    // Hardware USB / Bluetooth Gamepad & Joystick Controller state (edge detection + rumble throttle)
    const prevGpButtons = {
      rb: false,
      lb: false,
      cam: false,
      pause: false,
      reset: false,
    };
    let lastRumbleMs = 0;

    const getActiveGamepad = (): Gamepad | null => {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
      const pads = navigator.getGamepads();
      if (!pads) return null;
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (gp && gp.connected) return gp;
      }
      return null;
    };

    const pulseGamepadHaptic = (intensity: number, durationMs = 110) => {
      const nowMs = performance.now();
      if (nowMs - lastRumbleMs < 95) return;
      const gp = getActiveGamepad();
      if (!gp) return;
      const actuator = (
        gp as Gamepad & {
          vibrationActuator?: {
            playEffect?: (
              type: string,
              params: { duration: number; strongMagnitude: number; weakMagnitude: number }
            ) => Promise<void>;
          };
        }
      ).vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        lastRumbleMs = nowMs;
        const mag = THREE.MathUtils.clamp(intensity, 0.12, 1);
        void actuator
          .playEffect('dual-rumble', {
            duration: durationMs,
            strongMagnitude: mag,
            weakMagnitude: mag * 0.75,
          })
          .catch(() => {});
      }
    };

    const readPlayerInput = (): CarInput => {
      const t = touchInputRef.current;

      // Poll connected USB / Bluetooth Gamepad or Flight/Arcade Joystick (zero GC, 60/120Hz analog precision!)
      let gpSteer = 0;
      let gpThrottle = 0;
      let gpBrake = 0;
      let gpNitro = false;
      let gpShiftUp = false;
      let gpShiftDown = false;

      const gp = getActiveGamepad();
      if (gp) {
        const isStandard = gp.mapping === 'standard';
        const btnVal = (idx: number) => gp.buttons[idx]?.value ?? 0;
        const btnDown = (idx: number) => Boolean(gp.buttons[idx]?.pressed || btnVal(idx) > 0.35);

        // Steering: Left Analog Stick X (axes[0]) with 0.10 deadzone & smooth curve, or D-pad Left/Right
        const rawX = gp.axes[0] ?? 0;
        if (Math.abs(rawX) > 0.1) {
          const norm = (Math.abs(rawX) - 0.1) / 0.9;
          gpSteer = Math.sign(rawX) * Math.pow(Math.min(1, norm), 1.22);
        } else if (btnDown(14) || btnDown(15)) {
          gpSteer = (btnDown(15) ? 1 : 0) - (btnDown(14) ? 1 : 0);
        }

        // Throttle: RT analog trigger (7), A/Cross (0), Right-Stick Up (-axes[3]), or Flight-Stick Y (-axes[1])
        const rt = btnVal(7);
        const rStickUp = isStandard && gp.axes.length > 3 && (gp.axes[3] ?? 0) < -0.15 ? -(gp.axes[3] ?? 0) : 0;
        const flightUp = !isStandard && gp.axes.length > 1 && (gp.axes[1] ?? 0) < -0.15 ? -(gp.axes[1] ?? 0) : 0;
        gpThrottle = Math.max(rt > 0.05 ? rt : 0, btnDown(0) ? 1 : 0, rStickUp, flightUp);

        // Brake / Reverse: LT analog trigger (6), X/Square (2), Right-Stick Down (axes[3]), or Flight-Stick Y (axes[1])
        const lt = btnVal(6);
        const rStickDown = isStandard && gp.axes.length > 3 && (gp.axes[3] ?? 0) > 0.15 ? gp.axes[3] ?? 0 : 0;
        const flightDown = !isStandard && gp.axes.length > 1 && (gp.axes[1] ?? 0) > 0.15 ? gp.axes[1] ?? 0 : 0;
        gpBrake = Math.max(lt > 0.05 ? lt : 0, btnDown(2) ? 1 : 0, rStickDown, flightDown);

        // Nitro: B/Circle (1) or RB (5) in Automatic mode
        const rbDown = btnDown(5);
        const lbDown = btnDown(4);
        gpNitro = btnDown(1) || (transmissionModeRef.current === 'auto' && rbDown);

        // Manual Gear Shifts: RB upshift / LB downshift (edge-triggered)
        if (transmissionModeRef.current === 'manual') {
          if (rbDown && !prevGpButtons.rb) gpShiftUp = true;
          if (lbDown && !prevGpButtons.lb) gpShiftDown = true;
        }
        prevGpButtons.rb = rbDown;
        prevGpButtons.lb = lbDown;

        // Camera cycle: Y/Triangle (3) or Select/View (8)
        const camDown = btnDown(3) || btnDown(8);
        if (camDown && !prevGpButtons.cam) {
          onCycleCameraRef.current?.();
        }
        prevGpButtons.cam = camDown;

        // Pause toggle: Start/Options (9)
        const pauseDown = btnDown(9);
        if (pauseDown && !prevGpButtons.pause) {
          onTogglePauseRef.current?.();
        }
        prevGpButtons.pause = pauseDown;

        // Car Reset to Track: L3/R3 click (10/11)
        const resetDown = btnDown(10) && btnDown(11);
        if (resetDown && !prevGpButtons.reset) {
          resetPlayerToTrack();
        }
        prevGpButtons.reset = resetDown;
      }

      const keyThrottle = keys.has('KeyW') || keys.has('ArrowUp') || t.gas ? 1 : 0;
      const keyBrake = keys.has('KeyS') || keys.has('ArrowDown') || t.brake ? 1 : 0;
      const throttle = Math.max(keyThrottle, gpThrottle);
      const brake = Math.max(keyBrake, gpBrake);
      const reverse = t.reverse;
      const touchBrake = t.brake && gpBrake < 0.1 && !keys.has('KeyS') && !keys.has('ArrowDown');
      const left = keys.has('KeyA') || keys.has('ArrowLeft') || t.left;
      const right = keys.has('KeyD') || keys.has('ArrowRight') || t.right;
      const digitalSteer = (right ? 1 : 0) - (left ? 1 : 0);
      const touchAnalogSteer =
        Math.abs(t.joystickSteer || 0) > 0.005
          ? t.joystickSteer
          : Math.abs(t.wheelSteer || 0) > 0.005
          ? t.wheelSteer
          : t.gyroSteer || 0;
      const steer =
        digitalSteer !== 0
          ? digitalSteer
          : Math.abs(gpSteer) > 0.005
          ? THREE.MathUtils.clamp(gpSteer, -1, 1)
          : THREE.MathUtils.clamp(touchAnalogSteer, -1, 1);
      // Drifting triggers automatically & naturally while turning — no manual drift button needed!
      const handbrake = false;
      const nitro = keys.has('ShiftLeft') || keys.has('ShiftRight') || t.nitro || gpNitro;
      const shiftUp = pendingShiftUp || t.shiftUpPending || gpShiftUp;
      const shiftDown = pendingShiftDown || t.shiftDownPending || gpShiftDown;
      pendingShiftUp = false;
      pendingShiftDown = false;
      t.shiftUpPending = false;
      t.shiftDownPending = false;
      return { throttle, brake, reverse, touchBrake, steer, handbrake, nitro, shiftUp, shiftDown };
    };

    const syncRig = (
      rig: CarMeshRig,
      x: number,
      y: number,
      z: number,
      heading: number,
      pitch: number,
      roll: number,
      steerAngle: number,
      wheelSpin: number,
      braking: boolean,
      nitroActive: boolean
    ) => {
      rig.root.position.set(x, y, z);
      rig.root.rotation.y = heading;
      rig.bodyGroup.rotation.x = pitch;
      rig.bodyGroup.rotation.z = roll;
      for (const fw of rig.frontWheels) {
        fw.rotation.y = steerAngle;
      }
      for (const sw of rig.spinWheels) {
        sw.rotation.x = wheelSpin;
      }
      rig.brakeLightMat.emissiveIntensity = braking ? 3.2 : 0.75;
      for (const fl of rig.nitroFlames) {
        fl.visible = nitroActive;
        if (nitroActive) {
          fl.scale.set(1, 1, 0.75 + Math.random() * 0.55);
        }
      }
    };

    const buildStandings = (): RaceTelemetry['standings'] => {
      const list: RaceTelemetry['standings'] = [
        {
          id: playerCar.id,
          name: playerName,
          platform: playerPlatform,
          chassisId: playerVehicle.chassisId,
          position: 1,
          lap: playerCar.lap,
          totalProgress: playerCar.totalProgress,
          finished: playerCar.finished,
          finishTimeMs: playerCar.finishTimeMs,
          bestLapMs: playerCar.bestLapMs,
          topSpeedKmh: playerCar.topSpeedKmh,
          isPlayer: true,
          color: playerVehicle.primaryColor,
        },
      ];

      for (const ai of aiRivals) {
        list.push({
          id: ai.car.id,
          name: ai.car.name,
          platform: 'AI',
          chassisId: ai.car.config.chassisId,
          position: 1,
          lap: ai.car.lap,
          totalProgress: ai.car.totalProgress,
          finished: ai.car.finished,
          finishTimeMs: ai.car.finishTimeMs,
          bestLapMs: ai.car.bestLapMs,
          topSpeedKmh: ai.car.topSpeedKmh,
          isPlayer: false,
          color: ai.car.config.primaryColor,
        });
      }

      for (const peer of peerCars) {
        const st = peerStatesRef.current.get(peer.player.id);
        list.push({
          id: peer.player.id,
          name: peer.player.name,
          platform: peer.player.platform,
          chassisId: peer.player.vehicle.chassisId,
          position: 1,
          lap: st?.lap ?? 1,
          totalProgress: st?.totalProgress ?? -peer.player.gridSlot * 0.002,
          finished: st?.finished ?? false,
          finishTimeMs: st?.finishTimeMs ?? 0,
          bestLapMs: st?.bestLapMs ?? 0,
          topSpeedKmh: st?.topSpeedKmh ?? 0,
          isPlayer: false,
          color: peer.player.vehicle.primaryColor,
        });
      }

      list.sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished && b.finished && a.finishTimeMs !== b.finishTimeMs) {
          return a.finishTimeMs - b.finishTimeMs;
        }
        return b.totalProgress - a.totalProgress;
      });
      list.forEach((entry, idx) => {
        entry.position = idx + 1;
      });
      return list;
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    // 60Hz deterministic physics on mobile/eco cuts CPU load in half with identical responsive handling!
    let FIXED_DT = lowPower ? 1 / 60 : 1 / 120;
    // Frame pacing prevents 90Hz/120Hz phones from overheating at 120fps (Eco = 30fps, Mobile = 60fps max)
    let targetFrameMs = isEco ? 31.5 : isMobile ? 15.5 : 0;
    let telemetryIntervalMs = isEco ? 115 : lowPower ? 95 : 65;

    let loopSleeping = false;

    // Live performance mode switcher so toggling COOL 30 / BALANCED / HIGH in Pause never resets the race!
    applyPerfRef.current = (nextMode: PerformanceMode) => {
      if (disposed) return;
      isEco = nextMode === 'eco';
      const nextBalanced = nextMode === 'balanced';
      const nextLowPower = isEco || nextBalanced || isMobile;
      const nextMaxDpr = isSoftwareGl
        ? 1
        : isEco
        ? 1.0
        : nextBalanced
        ? isMobile
          ? 1.2
          : 1.5
        : isMobile
        ? 1.5
        : 2.0;
      activeDpr = Math.min(window.devicePixelRatio || 1, nextMaxDpr);
      renderer.setPixelRatio(activeDpr);

      shadowsEnabled = !isSoftwareGl && !isEco;
      renderer.shadowMap.enabled = shadowsEnabled;
      sun.castShadow = shadowsEnabled;
      shadowUpdateStride = nextLowPower ? 2 : 1;
      renderer.shadowMap.autoUpdate = shadowsEnabled && shadowUpdateStride === 1;
      if (shadowsEnabled) {
        renderer.shadowMap.needsUpdate = true;
      }

      camera.far = isEco ? 680 : nextLowPower ? 860 : 1450;
      camera.updateProjectionMatrix();

      FIXED_DT = nextLowPower ? 1 / 60 : 1 / 120;
      targetFrameMs = isEco ? 31.5 : isMobile ? 15.5 : 0;
      telemetryIntervalMs = isEco ? 115 : nextLowPower ? 95 : 65;
      emaWorkMs = 8;
      lastRenderTimestamp = 0;

      if (loopSleeping) {
        renderer.render(scene, camera);
      }
    };
    let renderedFrameCount = 0;
    let lastRenderTimestamp = 0;
    let emaWorkMs = 8;
    let lastThermalAdjustMs = 0;
    let lastSmokeTickMs = 0;

    const scheduleNextFrame = () => {
      if (disposed || loopSleeping) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    const wakeLoop = () => {
      if (disposed || !loopSleeping || document.hidden || pausedRef.current) return;
      loopSleeping = false;
      lastFrameTime = performance.now();
      lastRenderTimestamp = 0;
      physicsAccum = 0;
      scheduleNextFrame();
    };
    resumeLoopRef.current = wakeLoop;

    const onVisibilityChange = () => {
      if (document.hidden) {
        audio.setSuspended(true);
        loopSleeping = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
      } else if (!pausedRef.current) {
        audio.setSuspended(false);
        wakeLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const tick = () => {
      if (disposed) return;

      // Sleep the WebGL loop completely when tab is hidden or race is paused (0% idle GPU heat!)
      if (document.hidden || pausedRef.current) {
        audio.setSuspended(true);
        loopSleeping = true;
        return;
      }

      const now = performance.now();

      // Frame pacing for mobile 90Hz/120Hz displays & 30fps Eco mode
      if (targetFrameMs > 0 && lastRenderTimestamp > 0 && now - lastRenderTimestamp < targetFrameMs) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      lastRenderTimestamp = now;

      const dt = Math.min(0.06, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      if (resetCounterRef.current !== handledReset || keys.has('KeyR')) {
        handledReset = resetCounterRef.current;
        keys.delete('KeyR');
        resetPlayerToTrack();
      }

      if (!pausedRef.current) {
        // Countdown phase
        const allowMovement = countdownSec <= 0;
        if (countdownSec > 0) {
          countdownSec -= dt;
          const ceilInt = Math.ceil(countdownSec);
          if (ceilInt < lastBeepInt && ceilInt >= 1) {
            lastBeepInt = ceilInt;
            audio.playBeep(false);
          }
          if (countdownSec <= 0) {
            countdownSec = 0;
            audio.playBeep(true);
          }
        } else if (!raceEnded) {
          raceElapsedMs += dt * 1000;
        }

        // Once race ends, smoothly brake the car to a complete halt!
        let pInput: CarInput;
        if (raceEnded) {
          const n = builtTrack.samples.length;
          const targetS = builtTrack.samples[(playerCar.sampleIndex + 8) % n];
          const dx = targetS.pos.x - playerCar.x;
          const dz = targetS.pos.z - playerCar.z;
          let angleDiff = Math.atan2(dx, dz) - playerCar.heading;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const gentleSteer = Math.abs(playerCar.speed) > 0.6 ? THREE.MathUtils.clamp(-angleDiff * 1.4, -0.45, 0.45) : 0;
          pInput = {
            throttle: 0,
            brake: Math.abs(playerCar.speed) > 0.15 ? 0.76 : 1.0,
            touchBrake: true,
            reverse: false,
            steer: gentleSteer,
            handbrake: Math.abs(playerCar.speed) < 3.5,
            nitro: false,
            shiftUp: false,
            shiftDown: false,
          };
        } else {
          pInput = readPlayerInput();
        }

        physicsAccum += dt;
        const maxSteps = 8;
        let steps = 0;
        let maxCarImpact = 0;
        let maxWallImpact = 0;
        let maxLandedImpact = 0;
        let launchedJumpEvent = false;
        let carImpactX = playerCar.x;
        let carImpactY = playerCar.y + 0.5;
        let carImpactZ = playerCar.z;
        let shiftedEvent: -1 | 0 | 1 = 0;

        while (physicsAccum >= FIXED_DT && steps < maxSteps) {
          physicsAccum -= FIXED_DT;
          steps++;

          const stepInput: CarInput =
            steps === 1 ? pInput : { ...pInput, shiftUp: false, shiftDown: false };

          const res = stepCarPhysics(
            playerCar,
            stepInput,
            FIXED_DT,
            builtTrack.samples,
            builtTrack.roadWidth,
            builtTrack.kerbWidth,
            builtTrack.barrierOffset,
            raceElapsedMs,
            totalLaps,
            allowMovement,
            raceEnded ? 'auto' : transmissionModeRef.current,
            builtTrack.ramps,
            builtTrack.diversions,
            trackId,
            builtTrack.poleColliders,
            builtTrack.boxColliders,
            builtTrack.breakables
          );
          if (res.barrierImpact > maxWallImpact) {
            maxWallImpact = res.barrierImpact;
          }
          if (res.landedImpact > maxLandedImpact) {
            maxLandedImpact = res.landedImpact;
          }
          if (res.launchedJump) {
            launchedJumpEvent = true;
          }
          if (res.shiftedGear !== 0) {
            shiftedEvent = res.shiftedGear;
          }

          for (const ai of aiRivals) {
            let aiIn: CarInput;
            if (raceEnded) {
              aiIn = { throttle: 0, brake: 0.75, touchBrake: true, steer: 0, handbrake: Math.abs(ai.car.speed) < 4, nitro: false };
            } else if (ai.car.finished) {
              // Keep finished AI cruising gently past the finish line so they never park & block a 2nd/3rd player!
              const cruiseIn = computeAiInput(
                ai.car,
                builtTrack.samples,
                ai.skill,
                ai.preferredLane,
                builtTrack.diversions,
                playerCar.totalProgress,
                trackId
              );
              aiIn = {
                ...cruiseIn,
                throttle: ai.car.speed < 22 ? 0.32 : 0,
                brake: ai.car.speed > 26 ? 0.25 : 0,
                nitro: false,
                handbrake: false,
              };
            } else {
              aiIn = computeAiInput(
                ai.car,
                builtTrack.samples,
                ai.skill,
                ai.preferredLane,
                builtTrack.diversions,
                playerCar.totalProgress,
                trackId
              );
            }
            stepCarPhysics(
              ai.car,
              aiIn,
              FIXED_DT,
              builtTrack.samples,
              builtTrack.roadWidth,
              builtTrack.kerbWidth,
              builtTrack.barrierOffset,
              raceElapsedMs,
              totalLaps,
              allowMovement,
              'auto',
              builtTrack.ramps,
              builtTrack.diversions,
              trackId,
              builtTrack.poleColliders,
              builtTrack.boxColliders,
              builtTrack.breakables
            );
          }

          if (allowMovement && aiRivals.length > 0) {
            const colRes = resolveCarCollisions(allPhysicsCars, playerCar.id);
            if (colRes.playerImpact > maxCarImpact) {
              maxCarImpact = colRes.playerImpact;
              carImpactX = colRes.impactX;
              carImpactY = colRes.impactY;
              carImpactZ = colRes.impactZ;
            }
          }

          // Podium finish & elimination rule:
          // - If player crosses the finish line -> end race & lock standings!
          // - If a rival finishes first while player is in 2nd or 3rd -> let player keep driving to reach the finish line!
          // - If a rival has finished and player is in 4th or worse (> 3rd) -> immediately end race & show Lose screen!
          if (!raceEnded && allowMovement) {
            const anyAiFinished = mode !== 'time-trial' && aiRivals.some((a) => a.car.finished);
            let anyPeerFinished = false;
            if (mode !== 'time-trial') {
              for (const peer of peerCars) {
                if (peerStatesRef.current.get(peer.player.id)?.finished) {
                  anyPeerFinished = true;
                  break;
                }
              }
            }
            if (anyAiFinished || anyPeerFinished) {
              leaderFinished = true;
            }

            if (playerCar.finished) {
              raceEnded = true;
              lockedFinishTimeMs = Math.round(raceElapsedMs);
              lockedPlayerLap = playerCar.lap;
              lockedStandings = buildStandings();
            } else if (leaderFinished && mode !== 'time-trial') {
              const liveStandings = buildStandings();
              const playerPos = liveStandings.find((s) => s.isPlayer)?.position ?? 1;
              if (playerPos > 3) {
                raceEnded = true;
                lockedFinishTimeMs = Math.round(raceElapsedMs);
                lockedPlayerLap = playerCar.lap;
                lockedStandings = liveStandings;
              }
            }
          }
        }

        // Prevent residual accumulator overflow after heavy frame spikes
        if (physicsAccum > FIXED_DT) {
          physicsAccum = FIXED_DT;
        }

        if (shiftedEvent !== 0 && !raceEnded) {
          audio.playGearShift(shiftedEvent > 0);
        }
        if (launchedJumpEvent && !raceEnded) {
          audio.playJumpLaunch();
          const sinJ = Math.sin(playerCar.heading);
          const cosJ = Math.cos(playerCar.heading);
          spawnSmoke(playerCar.x - sinJ * 1.4 - cosJ * 0.75, playerCar.y, playerCar.z - cosJ * 1.4 + sinJ * 0.75, 0.9);
          spawnSmoke(playerCar.x - sinJ * 1.4 + cosJ * 0.75, playerCar.y, playerCar.z - cosJ * 1.4 - sinJ * 0.75, 0.9);
        }

        // Play crisp multi-layered collision sound + spark burst + landing suspension thud + controller rumble!
        if (maxCarImpact > 0.08) {
          audio.playImpact(maxCarImpact, 'car');
          pulseGamepadHaptic(maxCarImpact * 0.9, 130);
          impactShake = Math.max(impactShake, Math.min(0.32, maxCarImpact * 0.34));
          spawnSparks(carImpactX, carImpactY, carImpactZ, Math.round(6 + maxCarImpact * 10));
        } else if (maxWallImpact > 0.11) {
          audio.playImpact(maxWallImpact, 'wall');
          pulseGamepadHaptic(maxWallImpact * 0.85, 115);
          impactShake = Math.max(impactShake, Math.min(0.24, maxWallImpact * 0.25));
          const sideSign = Math.sign(playerCar.lateralOffset || 1);
          const sCurr = builtTrack.samples[playerCar.sampleIndex];
          spawnSparks(
            playerCar.x + sCurr.right.x * sideSign * 0.95,
            playerCar.y + 0.5,
            playerCar.z + sCurr.right.z * sideSign * 0.95,
            Math.round(5 + maxWallImpact * 8)
          );
        } else if (maxLandedImpact > 0.16) {
          audio.playImpact(maxLandedImpact * 0.56, 'wall');
          pulseGamepadHaptic(maxLandedImpact * 0.65, 100);
          impactShake = Math.max(impactShake, Math.min(0.22, maxLandedImpact * 0.24));
          const sinH = Math.sin(playerCar.heading);
          const cosH = Math.cos(playerCar.heading);
          for (const axle of [-1.45, 1.45]) {
            const ax = playerCar.x + sinH * axle;
            const az = playerCar.z + cosH * axle;
            spawnSmoke(ax - cosH * 0.85, playerCar.y, az + sinH * 0.85, 1.05);
            spawnSmoke(ax + cosH * 0.85, playerCar.y, az - sinH * 0.85, 1.05);
          }
        }
        impactShake = THREE.MathUtils.damp(impactShake, 0, 14, dt);
        if (impactShake < 0.002) impactShake = 0;

        // Animate speed-based falling/tumbling poles, bollards, fences, signs & umbrellas onto the road!
        stepBreakables(builtTrack.breakables, dt);

        // Sub-step interpolation factor eliminates fixed-timestep jitter/vibration
        const alpha = THREE.MathUtils.clamp(physicsAccum / FIXED_DT, 0, 1);
        const lerpAngle = (a: number, b: number, t: number) => {
          let d = b - a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          return a + d * t;
        };

        const renderPx = THREE.MathUtils.lerp(playerCar.prevX, playerCar.x, alpha);
        const renderPy = THREE.MathUtils.lerp(playerCar.prevY, playerCar.y, alpha);
        const renderPz = THREE.MathUtils.lerp(playerCar.prevZ, playerCar.z, alpha);
        const renderPh = lerpAngle(playerCar.prevHeading, playerCar.heading, alpha);
        const visualPlayerHeading = renderPh + playerCar.driftAngle * 0.56;
        const visualPlayerSteer = THREE.MathUtils.clamp(
          playerCar.steerAngle - playerCar.driftAngle * 0.52,
          -0.65,
          0.65
        );

        // Update player 3D rig (drift slip angle + counter-steer wheels + roadPitch & suspension!)
        syncRig(
          playerRig,
          renderPx,
          renderPy,
          renderPz,
          visualPlayerHeading,
          playerCar.roadPitch + playerCar.pitch,
          playerCar.roll,
          visualPlayerSteer,
          playerCar.wheelSpin,
          playerCar.braking,
          playerCar.nitroActive || playerCar.driftBoostTimer > 0
        );

        // Update AI 3D rigs with interpolation & expressive drift slip angle
        for (const ai of aiRivals) {
          const aiRenderH = lerpAngle(ai.car.prevHeading, ai.car.heading, alpha) + ai.car.driftAngle * 0.52;
          const aiVisualSteer = THREE.MathUtils.clamp(
            ai.car.steerAngle - ai.car.driftAngle * 0.48,
            -0.62,
            0.62
          );
          syncRig(
            ai.rig,
            THREE.MathUtils.lerp(ai.car.prevX, ai.car.x, alpha),
            THREE.MathUtils.lerp(ai.car.prevY, ai.car.y, alpha),
            THREE.MathUtils.lerp(ai.car.prevZ, ai.car.z, alpha),
            aiRenderH,
            ai.car.roadPitch + ai.car.pitch,
            ai.car.roll,
            aiVisualSteer,
            ai.car.wheelSpin,
            ai.car.braking,
            ai.car.nitroActive || ai.car.driftBoostTimer > 0
          );
        }

        // Smoothly interpolate remote multiplayer cars
        for (const peer of peerCars) {
          const st = peerStatesRef.current.get(peer.player.id);
          if (st) {
            peer.x = THREE.MathUtils.damp(peer.x, st.x, 12, dt);
            peer.y = THREE.MathUtils.damp(peer.y, st.y, 12, dt);
            peer.z = THREE.MathUtils.damp(peer.z, st.z, 12, dt);
            // Shortest angular interpolation
            let diff = st.heading - peer.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            peer.heading += diff * Math.min(1, 12 * dt);
            peer.steer = THREE.MathUtils.damp(peer.steer, st.steer, 12, dt);
            peer.pitch = THREE.MathUtils.damp(peer.pitch, st.pitch, 10, dt);
            peer.roll = THREE.MathUtils.damp(peer.roll, st.roll, 10, dt);
            peer.wheelSpin += (st.speed / 0.35) * dt;
            syncRig(
              peer.rig,
              peer.x,
              peer.y,
              peer.z,
              peer.heading,
              peer.pitch,
              peer.roll,
              peer.steer,
              peer.wheelSpin,
              st.braking,
              st.nitro
            );
          }
        }

        // Emit tire drift smoke / rally dirt roost & stamp persistent skid marks on ALL tracks!
        skidStampAccum += dt;
        const shouldStampSkid = skidStampAccum >= 0.028;
        if (shouldStampSkid) skidStampAccum = 0;

        const isPlayerDrifting = !playerCar.airborne && playerCar.driftIntensity > 0.14 && Math.abs(playerCar.speed) > 5.8;
        const kickUpDust =
          !playerCar.airborne &&
          (isPlayerDrifting ||
            (playerCar.surface === 'offtrack' && Math.abs(playerCar.speed) > 9) ||
            (trackId === 'offroad-track' && Math.abs(playerCar.speed) > 10));
        const allowSmokeEmit = !lowPower || now - lastSmokeTickMs >= 42;
        if (kickUpDust && allowSmokeEmit) {
          lastSmokeTickMs = now;
          const sinH = Math.sin(visualPlayerHeading);
          const cosH = Math.cos(visualPlayerHeading);
          const rearX = playerCar.x - sinH * 1.55;
          const rearZ = playerCar.z - cosH * 1.55;
          const leftWheelX = rearX - cosH * 0.8;
          const leftWheelZ = rearZ + sinH * 0.8;
          const rightWheelX = rearX + cosH * 0.8;
          const rightWheelZ = rearZ - sinH * 0.8;
          const plumeScale = isPlayerDrifting ? 0.65 + playerCar.driftIntensity * 0.55 : 0.55;
          spawnSmoke(leftWheelX, playerCar.y, leftWheelZ, plumeScale);
          if (!isEco) {
            spawnSmoke(rightWheelX, playerCar.y, rightWheelZ, plumeScale);
          }

          if (shouldStampSkid && isPlayerDrifting) {
            const velHeading = Math.atan2(playerCar.vx, playerCar.vz);
            const wScale = 0.85 + playerCar.driftIntensity * 0.55;
            stampSkid(leftWheelX, playerCar.y, leftWheelZ, velHeading, wScale);
            stampSkid(rightWheelX, playerCar.y, rightWheelZ, velHeading, wScale);
          }
        }

        // Nearby AI rivals also kick up billowing drift smoke & leave tire skid marks around corners!
        if (!isEco) {
          for (const ai of aiRivals) {
            if (ai.car.airborne || ai.car.driftIntensity <= 0.28 || Math.abs(ai.car.speed) < 11) continue;
            const dSq = (ai.car.x - playerCar.x) ** 2 + (ai.car.z - playerCar.z) ** 2;
            if (dSq > (lowPower ? 5600 : 10000)) continue;
            const aiVisH = ai.car.heading + ai.car.driftAngle * 0.5;
            const sA = Math.sin(aiVisH);
            const cA = Math.cos(aiVisH);
            const rx = ai.car.x - sA * 1.52;
            const rz = ai.car.z - cA * 1.52;
            if (shouldStampSkid) {
              spawnSmoke(rx - cA * 0.78, ai.car.y, rz + sA * 0.78, 0.72);
              if (!lowPower) {
                spawnSmoke(rx + cA * 0.78, ai.car.y, rz - sA * 0.78, 0.72);
              }
              const aiVelH = Math.atan2(ai.car.vx, ai.car.vz);
              stampSkid(rx - cA * 0.78, ai.car.y, rz + sA * 0.78, aiVelH, 0.9);
              stampSkid(rx + cA * 0.78, ai.car.y, rz - sA * 0.78, aiVelH, 0.9);
            }
          }
        }

        if (skidDirty) {
          skidInst.instanceMatrix.needsUpdate = true;
          skidDirty = false;
        }

        // Animate pooled smoke instances ONLY when particles are active (0 GPU uploads when idle!)
        if (activeSmokeCount > 0) {
          let remainingSmoke = 0;
          for (let i = 0; i < MAX_SMOKE; i++) {
            const p = smokeParticles[i];
            if (p.life > 0) {
              p.life = Math.max(0, p.life - dt * 1.55);
              if (p.life > 0) {
                remainingSmoke++;
                p.y += p.vy * dt;
                p.scale += dt * 2.15;
                _dummyObj.position.set(p.x, p.y, p.z);
                const s = p.scale * p.life;
                _dummyObj.scale.set(s, s * 0.72, s);
              } else {
                _dummyObj.position.set(0, -100, 0);
                _dummyObj.scale.set(0.001, 0.001, 0.001);
              }
              _dummyObj.updateMatrix();
              smokeInst.setMatrixAt(i, _dummyObj.matrix);
            }
          }
          activeSmokeCount = remainingSmoke;
          smokeInst.instanceMatrix.needsUpdate = true;
        }

        // Animate pooled metallic collision spark bursts ONLY when sparks are active!
        if (activeSparkCount > 0) {
          let remainingSparks = 0;
          for (let i = 0; i < MAX_SPARKS; i++) {
            const sp = sparkParticles[i];
            if (sp.life > 0) {
              sp.life = Math.max(0, sp.life - dt * 2.1);
              if (sp.life > 0) {
                remainingSparks++;
                sp.vy -= 18 * dt;
                sp.x += sp.vx * dt;
                sp.y += sp.vy * dt;
                sp.z += sp.vz * dt;
                _dummyObj.position.set(sp.x, sp.y, sp.z);
                _dummyObj.rotation.set(0, Math.atan2(sp.vx, sp.vz), 0);
                const s = Math.max(0.01, sp.life * 1.4);
                _dummyObj.scale.set(s, s, s * 1.8);
              } else {
                _dummyObj.position.set(0, -100, 0);
                _dummyObj.scale.set(0.001, 0.001, 0.001);
              }
              _dummyObj.updateMatrix();
              sparkInst.setMatrixAt(i, _dummyObj.matrix);
            }
          }
          activeSparkCount = remainingSparks;
          sparkInst.instanceMatrix.needsUpdate = true;
        }

        // Follow sun shadow frustum & optional night headlight beam around interpolated player position
        sun.position.set(
          renderPx + builtTrack.sunPos.x * 0.55,
          renderPy + builtTrack.sunPos.y * 0.55,
          renderPz + builtTrack.sunPos.z * 0.55
        );
        sun.target.position.set(renderPx, renderPy, renderPz);
        if (headlightBeam) {
          headlightBeam.position.set(
            renderPx + Math.sin(renderPh) * 10.5,
            renderPy + 1.65,
            renderPz + Math.cos(renderPh) * 10.5
          );
        }

        // Dynamic racing camera: relaxes slightly behind wide corner drifts so you see the tail sweep sideways!
        let headingDiff = renderPh - camHeading;
        while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
        while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
        const camFollowRate = THREE.MathUtils.lerp(10.5, 6.4, playerCar.driftIntensity);
        camHeading += headingDiff * (1 - Math.exp(-camFollowRate * dt));
        camY = THREE.MathUtils.damp(camY, renderPy, playerCar.airborne ? 7.5 : 12, dt);

        const sinH = Math.sin(renderPh);
        const cosH = Math.cos(renderPh);
        const rightX = cosH;
        const rightZ = -sinH;
        const sinCam = Math.sin(camHeading);
        const cosCam = Math.cos(camHeading);
        const cm = cameraModeRef.current;
        const speedRatio = THREE.MathUtils.clamp(Math.abs(playerCar.speed) / 62, 0, 1);

        if (raceEnded) {
          // Smoothly swing around into Front-3/4 Victory Hero Camera framing the stopped car on the LEFT
          // with the APEX checkered finish gantry behind it (exact Level Complete reference framing!)
          if (!victoryCamPosInit) {
            victoryCamPosInit = true;
            victoryCamCurr.copy(camera.position);
            victoryLookCurr.set(renderPx, camY + 1.0, renderPz);
          }
          victoryCamBlend = THREE.MathUtils.damp(victoryCamBlend, 1, 2.8, dt);

          const heroCamX = renderPx + sinH * 6.4 - rightX * 3.1;
          const heroCamY = camY + 1.95;
          const heroCamZ = renderPz + cosH * 6.4 - rightZ * 3.1;

          // Look slightly to the right of the car so the car sits cleanly on the left half behind the HUD!
          const heroLookX = renderPx - sinH * 1.2 + rightX * 2.25;
          const heroLookY = camY + 1.1;
          const heroLookZ = renderPz - cosH * 1.2 + rightZ * 2.25;

          victoryCamCurr.x = THREE.MathUtils.damp(victoryCamCurr.x, heroCamX, 3.4, dt);
          victoryCamCurr.y = THREE.MathUtils.damp(victoryCamCurr.y, heroCamY, 3.4, dt);
          victoryCamCurr.z = THREE.MathUtils.damp(victoryCamCurr.z, heroCamZ, 3.4, dt);

          victoryLookCurr.x = THREE.MathUtils.damp(victoryLookCurr.x, heroLookX, 3.8, dt);
          victoryLookCurr.y = THREE.MathUtils.damp(victoryLookCurr.y, heroLookY, 3.8, dt);
          victoryLookCurr.z = THREE.MathUtils.damp(victoryLookCurr.z, heroLookZ, 3.8, dt);

          camera.position.copy(victoryCamCurr);
          camera.lookAt(victoryLookCurr);
        } else {
          const shakeX = impactShake > 0 ? (Math.random() - 0.5) * impactShake * 0.9 : 0;
          const shakeY = impactShake > 0 ? (Math.random() - 0.5) * impactShake * 0.65 : 0;

          if (cm === 'hood') {
            _camTargetPos.set(renderPx + sinH * 0.35 + shakeX, camY + 1.32 + shakeY, renderPz + cosH * 0.35);
            _camLookTarget.set(renderPx + sinH * 24, camY + 1.15 - Math.sin(playerCar.roadPitch) * 6, renderPz + cosH * 24);
            camera.position.copy(_camTargetPos);
            camera.lookAt(_camLookTarget);
          } else if (cm === 'bumper') {
            _camTargetPos.set(renderPx + sinH * 2.1 + shakeX, camY + 0.68 + shakeY, renderPz + cosH * 2.1);
            _camLookTarget.set(renderPx + sinH * 26, camY + 0.65 - Math.sin(playerCar.roadPitch) * 6, renderPz + cosH * 26);
            camera.position.copy(_camTargetPos);
            camera.lookAt(_camLookTarget);
          } else {
            const baseDist = cm === 'far-chase' ? 9.4 : 6.9;
            const targetDist =
              baseDist +
              speedRatio * 0.95 +
              (playerCar.nitroActive || playerCar.driftBoostTimer > 0 ? 0.5 : 0) +
              (playerCar.airborne ? 0.65 : 0);
            const targetHeight = (cm === 'far-chase' ? 3.55 : 2.55) + (playerCar.airborne ? 0.45 : 0);
            camDist = THREE.MathUtils.damp(camDist, targetDist, 5.5, dt);
            camHeight = THREE.MathUtils.damp(camHeight, targetHeight, 5.5, dt);

            camera.position.set(
              renderPx - sinCam * camDist + shakeX,
              camY + camHeight + shakeY,
              renderPz - cosCam * camDist
            );
            _camLookTarget.set(
              renderPx + sinCam * 7.8,
              camY + 1.05 - Math.sin(playerCar.roadPitch) * 2.2,
              renderPz + cosCam * 7.8
            );
            camera.lookAt(_camLookTarget);
          }
        }

        const targetFov = raceEnded
          ? 52
          : 62 +
            speedRatio * 13.5 +
            (playerCar.nitroActive ? 5.2 : playerCar.driftBoostTimer > 0 ? 3.2 : 0);
        const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 5.5, dt);
        if (Math.abs(nextFov - camera.fov) > 0.002) {
          camera.fov = nextFov;
          camera.updateProjectionMatrix();
        }

        // Update procedural audio engine (quiet cleanly once finished & stopped so result music shines!)
        const engineAudioActive = !pausedRef.current && !(raceEnded && Math.abs(playerCar.speed) < 1.2);
        audio.update(
          playerCar.rpm,
          8600,
          pInput.throttle,
          speedRatio,
          playerCar.driftIntensity,
          playerCar.nitroActive || playerCar.driftBoostTimer > 0,
          engineAudioActive,
          trackId === 'offroad-track'
        );

        // Broadcast telemetry over WebSocket at ~20Hz in multiplayer
        if (mode === 'multiplayer' && allowMovement && now - lastBroadcastTime > 50) {
          lastBroadcastTime = now;
          onBroadcastRef.current?.({
            x: playerCar.x,
            y: playerCar.y,
            z: playerCar.z,
            heading: playerCar.heading,
            speed: playerCar.speed,
            steer: playerCar.steerAngle,
            pitch: playerCar.pitch,
            roll: playerCar.roll,
            drift: playerCar.driftIntensity,
            nitro: playerCar.nitroActive,
            braking: playerCar.braking,
            lap: playerCar.lap,
            progress: playerCar.progress,
            totalProgress: playerCar.totalProgress,
            finished: playerCar.finished,
            finishTimeMs: playerCar.finishTimeMs,
            bestLapMs: playerCar.bestLapMs,
            topSpeedKmh: playerCar.topSpeedKmh,
          });
        }

        // Push HUD telemetry (10Hz on mobile/eco, 15Hz on desktop — immediately on race finish)
        if ((raceEnded && !finishNotified) || now - lastTelemetryTime > telemetryIntervalMs) {
          lastTelemetryTime = now;
          const standings = lockedStandings ?? buildStandings();
          const myStanding = standings.find((s) => s.isPlayer);
          const minimapCars = [
            { id: playerCar.id, x: playerCar.x, z: playerCar.z, color: '#EF4444', isPlayer: true },
            ...aiRivals.map((a) => ({
              id: a.car.id,
              x: a.car.x,
              z: a.car.z,
              color: '#94A3B8',
              isPlayer: false,
            })),
            ...peerCars.map((p) => ({
              id: p.player.id,
              x: p.x,
              z: p.z,
              color: '#38BDF8',
              isPlayer: false,
            })),
          ];

          onTelemetryRef.current({
            speedKmh: Math.round(Math.abs(playerCar.speed) * 3.6),
            rpm: Math.round(playerCar.rpm),
            maxRpm: 8600,
            gear: playerCar.gear,
            transmission: transmissionModeRef.current,
            shiftPrompt: playerCar.shiftPrompt,
            nitroPct: Math.round(playerCar.nitroEnergy),
            driftIntensity: playerCar.driftIntensity,
            driftPoints: playerCar.driftPoints,
            currentDriftChain: Math.round(playerCar.currentDriftChain),
            driftMultiplier: playerCar.driftMultiplier,
            driftBoostActive: playerCar.driftBoostTimer > 0,
            airborne: playerCar.airborne,
            airTime: playerCar.airTime,
            lastJumpBonus: playerCar.lastJumpBonus,
            surface: playerCar.surface,
            lap: raceEnded ? lockedPlayerLap : playerCar.lap,
            totalLaps,
            position: myStanding?.position ?? 1,
            totalRacers: standings.length,
            currentLapMs: playerCar.currentLapMs,
            bestLapMs: playerCar.bestLapMs,
            totalRaceMs: raceEnded ? lockedFinishTimeMs : Math.round(raceElapsedMs),
            wrongWay: playerCar.wrongWay,
            countdown: countdownSec > 0 ? Math.ceil(countdownSec) : -1,
            finished: raceEnded,
            leaderFinished: leaderFinished && !raceEnded,
            cameraMode: cameraModeRef.current,
            minimapCars,
            standings,
          });

          if (raceEnded && !finishNotified) {
            finishNotified = true;
            const totalDriftPoints =
              playerCar.driftPoints + Math.round(playerCar.currentDriftChain * playerCar.driftMultiplier);
            onFinishRef.current?.({
              position: myStanding?.position ?? 1,
              completedAllLaps: playerCar.finished,
              bestLapMs: playerCar.bestLapMs || Math.round(lockedFinishTimeMs / totalLaps),
              totalTimeMs: lockedFinishTimeMs,
              topSpeedKmh: playerCar.topSpeedKmh,
              driftPoints: totalDriftPoints,
              standings,
            });
          }
        }
      } else {
        audio.update(1000, 8600, 0, 0, 0, false, false);
      }

      renderedFrameCount++;
      if (shadowsEnabled && shadowUpdateStride > 1 && renderedFrameCount % shadowUpdateStride === 0) {
        renderer.shadowMap.needsUpdate = true;
      }

      const renderStart = performance.now();
      renderer.render(scene, camera);
      const frameWorkMs = performance.now() - renderStart;

      // Adaptive mobile thermal guard: if frame render work stays heavy, step down DPR gently to cool the GPU
      if (!isSoftwareGl && isMobile) {
        emaWorkMs = emaWorkMs * 0.92 + frameWorkMs * 0.08;
        const budgetMs = isEco ? 20 : 12.5;
        if (emaWorkMs > budgetMs && activeDpr > 0.85 && now - lastThermalAdjustMs > 3500) {
          lastThermalAdjustMs = now;
          activeDpr = Math.max(0.85, Math.round((activeDpr - 0.1) * 100) / 100);
          renderer.setPixelRatio(activeDpr);
        }
      }

      scheduleNextFrame();
    };

    const onResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (loopSleeping) {
        renderer.render(scene, camera);
      }
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Render one crisp initial starting-grid frame immediately (even when Objective briefing is open!),
    // then sleep GPU cleanly if paused until player taps START RACE!
    syncRig(
      playerRig,
      playerCar.x,
      playerCar.y,
      playerCar.z,
      playerCar.heading,
      0,
      0,
      0,
      0,
      false,
      false
    );
    for (const ai of aiRivals) {
      syncRig(ai.rig, ai.car.x, ai.car.y, ai.car.z, ai.car.heading, 0, 0, 0, 0, false, false);
    }
    renderer.render(scene, camera);

    if (pausedRef.current || document.hidden) {
      loopSleeping = true;
      audio.setSuspended(true);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      resumeLoopRef.current = null;
      applyPerfRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onFirstPointer);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      audio.dispose();
      playerRig.dispose();
      aiRivals.forEach((a) => a.rig.dispose());
      peerCars.forEach((p) => p.rig.dispose());
      smokeGeo.dispose();
      smokeMat.dispose();
      skidGeo.dispose();
      skidMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      builtTrack.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [
    trackId,
    timeOfDay,
    mode,
    playerName,
    playerPlatform,
    playerVehicle,
    playerId,
    fillWithAi,
    lapsOverride,
    multiplayerPlayers,
  ]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-0 w-full h-full touch-control"
      aria-label="3D Racing Viewport"
    />
  );
}
