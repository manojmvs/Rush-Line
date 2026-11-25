import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildIntroIconCar, buildVehicleMesh, type CarMeshRig } from '../game/carMesh.ts';
import {
  CHASSIS_ORDER,
  type ChassisId,
  type VehicleConfig,
} from '../types/game.ts';

export type ShowroomSceneMode = 'intro' | 'garage' | 'select';

interface ShowroomCanvasProps {
  vehicle: VehicleConfig;
  sceneMode?: ShowroomSceneMode;
  className?: string;
  interactive?: boolean;
}

type TransitionPhase = 'idle' | 'exiting' | 'entering';

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

function createGarageWallTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep dark moody charcoal-navy industrial garage back wall (matching garage reference!)
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#090e18');
  grad.addColorStop(0.5, '#0f1827');
  grad.addColorStop(1, '#060a12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle vertical dark steel bay columns & ribs
  ctx.strokeStyle = 'rgba(180, 210, 255, 0.03)';
  ctx.lineWidth = 3;
  for (let x = 32; x < 1024; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Framing architectural bay pillars left/right
  ctx.fillStyle = 'rgba(4, 7, 14, 0.55)';
  ctx.fillRect(0, 0, 140, 512);
  ctx.fillRect(884, 0, 140, 512);

  // Painted wall emblem ("RUSH LINE" + checkered flag)
  ctx.save();
  ctx.translate(512, 232);
  ctx.transform(1, 0, -0.22, 1, 0, 0);
  ctx.textAlign = 'center';
  ctx.font = '900 72px "Chakra Petch", sans-serif';
  ctx.fillStyle = 'rgba(148, 174, 210, 0.2)';
  ctx.fillText('RUSH', -38, -14);
  ctx.fillStyle = 'rgba(255, 198, 28, 0.24)';
  ctx.fillText('LINE', 0, 56);

  // Checkered squares beside RUSH
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      if ((r + c) % 2 === 0) {
        ctx.fillStyle = 'rgba(195, 218, 245, 0.18)';
        ctx.fillRect(88 + c * 22, -62 + r * 22, 20, 20);
      }
    }
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createGarageFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b111c';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 10 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${v},${v + 5},${v + 12})`;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = 'rgba(130, 165, 210, 0.045)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = maxAniso;
  return tex;
}

function createKerbStripeTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#E5252B' : '#F8FAFC';
    ctx.fillRect(0, i * 64, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 16);
  tex.anisotropy = maxAniso;
  return tex;
}

function createCheckeredFlagTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Vibrant motorsport crimson-red flag base matching the RUSH LINE icon
  ctx.fillStyle = '#E21C24';
  ctx.fillRect(0, 0, 256, 512);

  // Subtle darker vertical shadow fold depth
  const foldGrad = ctx.createLinearGradient(0, 0, 256, 0);
  foldGrad.addColorStop(0, 'rgba(0,0,0,0.14)');
  foldGrad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  foldGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = foldGrad;
  ctx.fillRect(0, 0, 256, 512);

  // Crisp outer navy/white frame trim
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 498);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, 220, 476);

  // Bold diagonal black-and-white checkered racing band across the banner
  ctx.save();
  ctx.beginPath();
  ctx.rect(20, 20, 216, 472);
  ctx.clip();

  // Horizontal/angled checkered racing strip in upper-middle & lower accent
  const cell = 36;
  ctx.translate(128, 256);
  ctx.rotate(-0.32);
  const cols = 8;
  const rows = 4;
  const startX = -(cols * cell) / 2;
  const startY = -(rows * cell) / 2;
  // Crisp white backing border for the checker band
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(startX - 8, startY - 8, cols * cell + 16, rows * cell + 16);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : '#0F172A';
      ctx.fillRect(startX + c * cell, startY + r * cell, cell, cell);
    }
  }
  ctx.restore();

  // Top & bottom gold motorsport accent bars
  ctx.fillStyle = '#FFD014';
  ctx.fillRect(20, 24, 216, 14);
  ctx.fillRect(20, 474, 216, 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function ShowroomCanvas({
  vehicle,
  sceneMode = 'garage',
  className = 'fixed inset-0 z-0 w-full h-full',
  interactive = false,
}: ShowroomCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<CarMeshRig | null>(null);
  const carPivotRef = useRef<THREE.Group | null>(null);
  const turntableRigRef = useRef<THREE.Group | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const sceneModeRef = useRef<ShowroomSceneMode>(sceneMode);
  sceneModeRef.current = sceneMode;

  // Track mounted chassisId & pending transition state for base slide-out / slide-in
  const displayedChassisRef = useRef<ChassisId>(vehicle.chassisId);
  const pendingVehicleRef = useRef<VehicleConfig | null>(null);
  const transitionRef = useRef<{
    phase: TransitionPhase;
    progress: number;
    direction: 1 | -1;
  }>({
    phase: 'idle',
    progress: 0,
    direction: 1,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isIntro = sceneMode === 'intro';
    const isSelect = sceneMode === 'select';
    const isSoftwareGl = detectSoftwareGl();
    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 900));

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && !isMobileDevice,
      powerPreference: isMobileDevice ? 'default' : 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Darker moody studio exposure for garage & select to match the reference garage image
    renderer.toneMappingExposure = isIntro ? 1.12 : 0.94;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, isMobileDevice ? 1.35 : 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = isMobileDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const disposables: Array<{ dispose: () => void }> = [];
    const maxAniso = isMobileDevice
      ? Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
      : renderer.capabilities.getMaxAnisotropy();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    // Lower environment intensity in garage so walls/floor stay deeply dark while car reflects cleanly
    scene.environmentIntensity = isIntro ? 0.85 : 0.44;
    pmrem.dispose();
    disposables.push(envTex);

    const camera = new THREE.PerspectiveCamera(
      isIntro ? 42 : isSelect ? 36 : 38,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      400
    );

    // Unified turntable rig (car + circular illuminated base slide together on car switch!)
    const turntableRig = new THREE.Group();
    scene.add(turntableRig);
    turntableRigRef.current = turntableRig;

    const carPivot = new THREE.Group();
    turntableRig.add(carPivot);
    carPivotRef.current = carPivot;

    let warmFloorGlow: THREE.PointLight | null = null;

    if (isIntro) {
      // =====================================================================
      // INTRO HERO SCENE: Sunlit Alpine Straightaway + Icon Hero Car
      // Unified roadGroup guarantees exact center divider, edge-to-edge finish
      // line & RUSH LINE arch, and checkered flags flanking both sides!
      // =====================================================================
      scene.background = new THREE.Color(0x36a2f2);
      scene.fog = new THREE.FogExp2(0x7ac8fa, 0.0046);

      const hemi = new THREE.HemisphereLight(0xc2e9ff, 0x459c2a, 1.18);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xfff6dc, 3.1);
      sun.position.set(18, 32, 22);
      sun.castShadow = !isSoftwareGl;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -24;
      sun.shadow.camera.right = 24;
      sun.shadow.camera.top = 24;
      sun.shadow.camera.bottom = -24;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.02;
      scene.add(sun);

      // Subtle cool fill light on front-left of hero car so red bevels & white stripes pop
      const frontFill = new THREE.DirectionalLight(0xdbeafe, 0.75);
      frontFill.position.set(-14, 10, 18);
      scene.add(frontFill);

      // Procedural sunlit multi-tone meadow turf texture
      const meadowCanvas = document.createElement('canvas');
      meadowCanvas.width = 256;
      meadowCanvas.height = 256;
      const mCtx = meadowCanvas.getContext('2d')!;
      mCtx.fillStyle = '#52b030';
      mCtx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4200; i++) {
        const gx = Math.random() * 256;
        const gy = Math.random() * 256;
        mCtx.fillStyle = Math.random() > 0.5 ? 'rgba(132, 224, 72, 0.28)' : 'rgba(38, 114, 24, 0.24)';
        mCtx.fillRect(gx, gy, 3, 5);
      }
      const meadowTex = new THREE.CanvasTexture(meadowCanvas);
      meadowTex.colorSpace = THREE.SRGBColorSpace;
      meadowTex.wrapS = THREE.RepeatWrapping;
      meadowTex.wrapT = THREE.RepeatWrapping;
      meadowTex.repeat.set(36, 36);
      meadowTex.anisotropy = maxAniso;

      const meadowGeo = new THREE.PlaneGeometry(380, 380);
      meadowGeo.rotateX(-Math.PI / 2);
      const meadowMat = new THREE.MeshStandardMaterial({
        map: meadowTex,
        roughness: 0.92,
      });
      const meadow = new THREE.Mesh(meadowGeo, meadowMat);
      meadow.position.y = -0.05;
      meadow.receiveShadow = true;
      scene.add(meadow);
      disposables.push(meadowTex, meadowGeo, meadowMat);

      // Unified Road Group — straight along -Z, centered at world X = 1.6
      const ROAD_W = 13.6;
      const ROAD_LEN = 180;
      const KERB_W = 1.35;
      const FINISH_Z = -22;
      const ROAD_CENTER_X = 1.6;

      const roadGroup = new THREE.Group();
      roadGroup.position.set(ROAD_CENTER_X, 0, 0);
      scene.add(roadGroup);

      // High-contrast Motorsport Asphalt Texture with exact-center dashed divider & outer lines
      const roadCanvas = document.createElement('canvas');
      roadCanvas.width = 512;
      roadCanvas.height = 512;
      const rCtx = roadCanvas.getContext('2d')!;
      rCtx.fillStyle = '#2c3444';
      rCtx.fillRect(0, 0, 512, 512);

      // Fine asphalt mineral grain
      for (let i = 0; i < 14000; i++) {
        const ax = Math.random() * 512;
        const ay = Math.random() * 512;
        const v = Math.floor(38 + Math.random() * 32);
        rCtx.fillStyle = `rgb(${v},${v + 4},${v + 11})`;
        rCtx.fillRect(ax, ay, 2, 2);
      }
      // Twin dark rubberized racing tire tracks (symmetric around x = 256)
      const gL = rCtx.createLinearGradient(88, 0, 198, 0);
      gL.addColorStop(0, 'rgba(10,14,22,0)');
      gL.addColorStop(0.5, 'rgba(10,14,22,0.38)');
      gL.addColorStop(1, 'rgba(10,14,22,0)');
      rCtx.fillStyle = gL;
      rCtx.fillRect(88, 0, 110, 512);
      const gR = rCtx.createLinearGradient(314, 0, 424, 0);
      gR.addColorStop(0, 'rgba(10,14,22,0)');
      gR.addColorStop(0.5, 'rgba(10,14,22,0.38)');
      gR.addColorStop(1, 'rgba(10,14,22,0)');
      rCtx.fillStyle = gR;
      rCtx.fillRect(314, 0, 110, 512);

      // Symmetric bold solid white outer track limit lines
      rCtx.fillStyle = 'rgba(248, 250, 252, 0.96)';
      rCtx.fillRect(14, 0, 14, 512);
      rCtx.fillRect(484, 0, 14, 512);

      // Exact center divider (centered at pixel 256.0: 248..264)
      rCtx.fillStyle = '#FFD014';
      for (let y = 0; y < 512; y += 64) {
        rCtx.fillRect(248, y + 6, 16, 36);
      }

      const introRoadTex = new THREE.CanvasTexture(roadCanvas);
      introRoadTex.colorSpace = THREE.SRGBColorSpace;
      introRoadTex.wrapS = THREE.ClampToEdgeWrapping;
      introRoadTex.wrapT = THREE.RepeatWrapping;
      introRoadTex.repeat.set(1, 16);
      introRoadTex.anisotropy = maxAniso;

      const roadGeo = new THREE.PlaneGeometry(ROAD_W, ROAD_LEN);
      roadGeo.rotateX(-Math.PI / 2);
      const roadMat = new THREE.MeshStandardMaterial({
        map: introRoadTex,
        roughness: 0.68,
        metalness: 0.06,
      });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(0, 0.02, -62);
      road.receiveShadow = true;
      roadGroup.add(road);

      // Crisp Checkered Finish Line Strip spanning 100% from left road edge to right road edge!
      const chkCanvas = document.createElement('canvas');
      chkCanvas.width = 512;
      chkCanvas.height = 128;
      const cCtx = chkCanvas.getContext('2d')!;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 16; c++) {
          cCtx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
          cCtx.fillRect(c * 32, r * 32, 32, 32);
        }
      }
      const chkTex = new THREE.CanvasTexture(chkCanvas);
      chkTex.colorSpace = THREE.SRGBColorSpace;
      chkTex.anisotropy = maxAniso;
      const finishStripGeo = new THREE.PlaneGeometry(ROAD_W, 3.2);
      finishStripGeo.rotateX(-Math.PI / 2);
      const finishStripMat = new THREE.MeshStandardMaterial({
        map: chkTex,
        roughness: 0.52,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const finishStrip = new THREE.Mesh(finishStripGeo, finishStripMat);
      finishStrip.position.set(0, 0.045, FINISH_Z);
      roadGroup.add(finishStrip);

      // Symmetric Red-and-White Kerbs flush against both left & right road edges
      const introKerbTex = createKerbStripeTexture(maxAniso);
      const kerbGeo = new THREE.PlaneGeometry(KERB_W, ROAD_LEN);
      kerbGeo.rotateX(-Math.PI / 2);
      const kerbMat = new THREE.MeshStandardMaterial({ map: introKerbTex, roughness: 0.58 });
      const kerbOffsetX = ROAD_W * 0.5 + KERB_W * 0.5 - 0.04;
      const leftKerb = new THREE.Mesh(kerbGeo, kerbMat);
      leftKerb.position.set(-kerbOffsetX, 0.035, -62);
      const rightKerb = new THREE.Mesh(kerbGeo, kerbMat);
      rightKerb.position.set(kerbOffsetX, 0.035, -62);
      roadGroup.add(leftKerb, rightKerb);
      disposables.push(
        introRoadTex,
        roadGeo,
        roadMat,
        chkTex,
        finishStripGeo,
        finishStripMat,
        introKerbTex,
        kerbGeo,
        kerbMat
      );

      // Full-Width RUSH LINE Finish Overhead Gantry spanning completely from one end of the road to the other!
      const bannerCanvas = document.createElement('canvas');
      bannerCanvas.width = 1024;
      bannerCanvas.height = 192;
      const bCtx = bannerCanvas.getContext('2d')!;
      bCtx.fillStyle = '#0F1B2E';
      bCtx.fillRect(0, 0, 1024, 192);
      const drawChecker = (ox: number) => {
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 6; c++) {
            bCtx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
            bCtx.fillRect(ox + c * 28, r * 32, 28, 32);
          }
        }
      };
      drawChecker(20);
      drawChecker(1024 - 20 - 168);
      bCtx.fillStyle = '#FFD014';
      bCtx.fillRect(0, 174, 1024, 18);
      bCtx.fillStyle = '#FFFFFF';
      bCtx.font = 'italic 900 104px "Chakra Petch", sans-serif';
      bCtx.textAlign = 'center';
      bCtx.textBaseline = 'middle';
      bCtx.fillText('RUSH LINE', 512, 92);
      const gantryTex = new THREE.CanvasTexture(bannerCanvas);
      gantryTex.colorSpace = THREE.SRGBColorSpace;
      gantryTex.anisotropy = maxAniso;

      const pillarX = ROAD_W * 0.5 + KERB_W + 0.35; // 8.5 on both sides (outside kerbs)
      const bridgeSpan = pillarX * 2 + 1.2; // 18.2 full end-to-end span
      const gantryGroup = new THREE.Group();
      gantryGroup.position.set(0, 0, FINISH_Z);
      const gPillarGeo = new THREE.BoxGeometry(1.15, 7.2, 1.2);
      const gBridgeGeo = new THREE.BoxGeometry(bridgeSpan, 2.2, 1.3);
      const gMat = new THREE.MeshStandardMaterial({ color: 0x162235, roughness: 0.42, metalness: 0.55 });
      const gBannerMat = new THREE.MeshStandardMaterial({
        map: gantryTex,
        roughness: 0.35,
        metalness: 0.2,
      });
      const gYellowBarGeo = new THREE.BoxGeometry(bridgeSpan - 0.2, 0.24, 1.4);
      const gYellowMat = new THREE.MeshStandardMaterial({
        color: 0xffd014,
        emissive: 0xffd014,
        emissiveIntensity: 0.45,
        roughness: 0.3,
      });
      const gPodGeo = new THREE.BoxGeometry(0.95, 0.42, 0.35);
      const gPodMat = new THREE.MeshStandardMaterial({
        color: 0xe5252b,
        emissive: 0xe5252b,
        emissiveIntensity: 1.1,
      });
      const gpL = new THREE.Mesh(gPillarGeo, gMat);
      gpL.position.set(-pillarX, 3.6, 0);
      const gpR = new THREE.Mesh(gPillarGeo, gMat);
      gpR.position.set(pillarX, 3.6, 0);
      const gBridge = new THREE.Mesh(gBridgeGeo, [gMat, gMat, gMat, gMat, gBannerMat, gBannerMat]);
      gBridge.position.set(0, 6.65, 0);
      const gYellow = new THREE.Mesh(gYellowBarGeo, gYellowMat);
      gYellow.position.set(0, 5.5, 0);
      for (let p = -2; p <= 2; p++) {
        const pod = new THREE.Mesh(gPodGeo, gPodMat);
        pod.position.set(p * 2.1, 5.15, 0.72);
        gantryGroup.add(pod);
      }
      gantryGroup.add(gpL, gpR, gBridge, gYellow);
      roadGroup.add(gantryGroup);
      disposables.push(gantryTex, gPillarGeo, gBridgeGeo, gMat, gBannerMat, gYellowBarGeo, gYellowMat, gPodGeo, gPodMat);

      // Symmetric Red-and-White Roadside Marker Bollards along BOTH sides of the road
      const bolCanvas = document.createElement('canvas');
      bolCanvas.width = 32;
      bolCanvas.height = 64;
      const boCtx = bolCanvas.getContext('2d')!;
      boCtx.fillStyle = '#F8FAFC';
      boCtx.fillRect(0, 0, 32, 64);
      boCtx.fillStyle = '#FFD014';
      boCtx.fillRect(0, 0, 32, 8);
      boCtx.fillStyle = '#E5252B';
      boCtx.fillRect(0, 22, 32, 18);
      const bolTex = new THREE.CanvasTexture(bolCanvas);
      bolTex.colorSpace = THREE.SRGBColorSpace;
      const bolGeo = new THREE.CylinderGeometry(0.15, 0.17, 1.25, 8);
      bolGeo.translate(0, 0.625, 0);
      const bolMat = new THREE.MeshStandardMaterial({ map: bolTex, roughness: 0.4 });
      const bolX = ROAD_W * 0.5 + KERB_W + 0.35;
      for (const bz of [4, -8, -16, -30, -42]) {
        for (const side of [-1, 1]) {
          const bol = new THREE.Mesh(bolGeo, bolMat);
          bol.position.set(side * bolX, 0, bz);
          bol.castShadow = true;
          roadGroup.add(bol);
        }
      }
      disposables.push(bolTex, bolGeo, bolMat);

      // Checkered Racing Banner Flags symmetrically flanking BOTH left & right sides of the road!
      const flagTex = createCheckeredFlagTexture(maxAniso);
      const flagPoleGeo = new THREE.CylinderGeometry(0.075, 0.095, 5.0, 8);
      flagPoleGeo.translate(0, 2.5, 0);
      const crossBarGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.45, 8);
      crossBarGeo.rotateZ(Math.PI / 2);
      const finialGeo = new THREE.SphereGeometry(0.11, 8, 8);
      const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 });
      const finialMat = new THREE.MeshStandardMaterial({ color: 0xffd014, roughness: 0.3, metalness: 0.6 });
      const flagFaceMat = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.48 });
      const flagEdgeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
      const bannerGeo = new THREE.BoxGeometry(1.22, 2.45, 0.07);
      const flagMaterials = [flagEdgeMat, flagEdgeMat, flagEdgeMat, flagEdgeMat, flagFaceMat, flagFaceMat];

      const flagX = ROAD_W * 0.5 + KERB_W + 0.75; // 8.9 on BOTH sides of road right outside kerbs
      const flagZList = [-7.5, -15.5, -28.5, -39.0];
      for (const fz of flagZList) {
        for (const side of [-1, 1]) {
          const fg = new THREE.Group();
          fg.position.set(side * flagX, 0, fz);
          // Slight inward angle toward the camera so the checkered pattern reads crisply
          fg.rotation.y = side * -0.14;

          const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
          pole.castShadow = true;
          const bar = new THREE.Mesh(crossBarGeo, flagPoleMat);
          bar.position.set(side * 0.66, 4.78, 0);
          const cap = new THREE.Mesh(finialGeo, finialMat);
          cap.position.set(0, 5.02, 0);
          const ban = new THREE.Mesh(bannerGeo, flagMaterials);
          ban.position.set(side * 0.68, 3.48, 0);
          ban.castShadow = true;

          fg.add(pole, bar, cap, ban);
          roadGroup.add(fg);
        }
      }
      disposables.push(
        flagTex,
        flagPoleGeo,
        crossBarGeo,
        finialGeo,
        flagPoleMat,
        finialMat,
        flagFaceMat,
        flagEdgeMat,
        bannerGeo
      );

      // Layered Stylized Low-Poly Pine Forest kept cleanly outside the road & flag corridor
      const trunkGeo = new THREE.CylinderGeometry(0.32, 0.56, 3.6, 7);
      trunkGeo.translate(0, 1.8, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4c22, roughness: 0.9, flatShading: true });
      const t1Geo = new THREE.ConeGeometry(2.8, 4.2, 7);
      t1Geo.translate(0, 4.7, 0);
      const t1Mat = new THREE.MeshStandardMaterial({ color: 0x2e8e26, roughness: 0.82, flatShading: true });
      const t2Geo = new THREE.ConeGeometry(2.15, 3.9, 7);
      t2Geo.translate(0, 7.1, 0);
      const t2Mat = new THREE.MeshStandardMaterial({ color: 0x56c230, roughness: 0.8, flatShading: true });

      const treePositions: Array<[number, number, number]> = [
        [-11.8, -3, 1.2], [-15.2, -11, 1.15], [-12.5, -20, 1.05], [-16.8, -30, 1.3],
        [-13.5, -42, 1.1], [-18.5, -52, 1.25], [-10.8, 5, 1.15], [-16.5, 2, 1.05],
        [15.4, -3, 1.15], [17.8, -14, 1.25], [15.8, -26, 1.1], [19.5, -38, 1.28], [16.5, -50, 1.08],
        [14.6, 5, 1.05],
      ];
      const dummy = new THREE.Object3D();
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
      const t1Inst = new THREE.InstancedMesh(t1Geo, t1Mat, treePositions.length);
      const t2Inst = new THREE.InstancedMesh(t2Geo, t2Mat, treePositions.length);
      treePositions.forEach(([x, z, s], i) => {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, i * 1.1, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);
        t1Inst.setMatrixAt(i, dummy.matrix);
        t2Inst.setMatrixAt(i, dummy.matrix);
      });
      trunkInst.instanceMatrix.needsUpdate = true;
      t1Inst.instanceMatrix.needsUpdate = true;
      t2Inst.instanceMatrix.needsUpdate = true;
      scene.add(trunkInst, t1Inst, t2Inst);
      disposables.push(trunkGeo, trunkMat, t1Geo, t1Mat, t2Geo, t2Mat);

      // Faceted Grey Boulders & Vibrant Green Meadow Bushes outside the flag line
      const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
      rockGeo.translate(0, 0.52, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.88, flatShading: true });
      const bushGeo = new THREE.IcosahedronGeometry(0.78, 0);
      bushGeo.translate(0, 0.42, 0);
      const bushMat = new THREE.MeshStandardMaterial({ color: 0x45b82a, roughness: 0.84, flatShading: true });
      [
        [-10.2, -1.5, 1.0], [-11.4, -17.5, 0.85], [13.8, -1.5, 1.1], [14.8, -18.5, 1.15],
      ].forEach(([rx, rz, rs], idx) => {
        const rk = new THREE.Mesh(rockGeo, rockMat);
        rk.position.set(rx, -0.05, rz);
        rk.rotation.set(0.2, idx * 1.4, 0.1);
        rk.scale.set(rs * 1.2, rs * 0.85, rs);
        scene.add(rk);

        const bs = new THREE.Mesh(bushGeo, bushMat);
        bs.position.set(rx + (rx < 0 ? -1.1 : 1.1), -0.05, rz + 0.9);
        bs.scale.set(rs * 1.1, rs * 0.85, rs);
        scene.add(bs);
      });
      disposables.push(rockGeo, rockMat, bushGeo, bushMat);

      // Distant Snow-Capped Alpine Mountain Peaks
      const mtGeo = new THREE.ConeGeometry(28, 36, 6);
      mtGeo.translate(0, 18, 0);
      const mtMat = new THREE.MeshStandardMaterial({ color: 0x6f97c2, roughness: 0.92, flatShading: true });
      const snowGeo = new THREE.ConeGeometry(12, 15, 6);
      snowGeo.translate(0, 29, 0);
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6faff, roughness: 0.72, flatShading: true });
      [
        [-45, -108, 1.25],
        [4, -126, 1.55],
        [52, -112, 1.38],
        [96, -98, 1.15],
      ].forEach(([mx, mz, ms]) => {
        const m = new THREE.Mesh(mtGeo, mtMat);
        m.position.set(mx, -2, mz);
        m.scale.setScalar(ms);
        const sn = new THREE.Mesh(snowGeo, snowMat);
        sn.position.set(mx, -2, mz);
        sn.scale.setScalar(ms);
        scene.add(m, sn);
      });
      disposables.push(mtGeo, mtMat, snowGeo, snowMat);

      // Fluffy Stylized Low-Poly White Sky Clouds (static)
      const introCloudsGroup = new THREE.Group();
      const cloudGeo = new THREE.DodecahedronGeometry(1, 1);
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
        flatShading: true,
        fog: false,
      });
      const cloudSpecs: Array<[number, number, number, number]> = [
        [-28, 22, -74, 4.2],
        [14, 26, -90, 5.4],
        [48, 21, -80, 4.6],
        [-5, 30, -108, 6.0],
      ];
      cloudSpecs.forEach(([cx, cy, cz, cs]) => {
        const cg = new THREE.Group();
        cg.position.set(cx, cy, cz);
        const p1 = new THREE.Mesh(cloudGeo, cloudMat);
        p1.scale.set(cs * 1.5, cs * 0.6, cs);
        const p2 = new THREE.Mesh(cloudGeo, cloudMat);
        p2.position.set(-cs * 0.9, -cs * 0.14, 0.4);
        p2.scale.set(cs * 1.0, cs * 0.48, cs * 0.85);
        const p3 = new THREE.Mesh(cloudGeo, cloudMat);
        p3.position.set(cs * 0.95, -cs * 0.12, -0.3);
        p3.scale.set(cs * 1.05, cs * 0.5, cs * 0.88);
        cg.add(p1, p2, p3);
        introCloudsGroup.add(cg);
      });
      scene.add(introCloudsGroup);
      disposables.push(cloudGeo, cloudMat);

      // Hero Car positioned prominently on the intro straightaway (zero smoke behind it!)
      carPivot.position.set(ROAD_CENTER_X + 0.45, 0.02, 2.75);
      carPivot.rotation.y = -0.52;
    } else {
      // =====================================================================
      // GARAGE & SELECT RACE BAY: Deep Dark Moody Bay + Glowing Amber Turntable
      // =====================================================================
      scene.background = new THREE.Color(0x070b13);
      scene.fog = new THREE.FogExp2(0x070b13, 0.044);

      // Subtle cool top fill, very deep dark floor bounce
      const hemi = new THREE.HemisphereLight(0x7fb4e8, 0x070b12, 0.36);
      scene.add(hemi);

      // Focused studio key light highlighting the hero vehicle against the dark garage
      const keyLight = new THREE.DirectionalLight(0xfff4e2, 1.75);
      keyLight.position.set(4.5, 8.5, 7.2);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -7;
      keyLight.shadow.camera.right = 7;
      keyLight.shadow.camera.top = 7;
      keyLight.shadow.camera.bottom = -7;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      // Cool blue rim from behind-left to carve the car silhouette
      const coolRim = new THREE.DirectionalLight(0x3b82f6, 0.9);
      coolRim.position.set(-7, 4.5, -5.5);
      scene.add(coolRim);

      // Warm amber under-glow attached to the moving turntable rig!
      warmFloorGlow = new THREE.PointLight(0xff9b1a, 3.8, 10.5, 1.8);
      warmFloorGlow.position.set(0, 0.75, 0.6);
      turntableRig.add(warmFloorGlow);

      // Subtle warm amber wall sconce glow on the far left pillar (matching garage reference!)
      const leftWallGlow = new THREE.PointLight(0xff8c1a, 1.5, 7, 2);
      leftWallGlow.position.set(-5.8, 3.0, -5.4);
      scene.add(leftWallGlow);

      if (!isSoftwareGl && !isMobileDevice) {
        RectAreaLightUniformsLib.init();
        const overheadSoftbox = new THREE.RectAreaLight(0xbfdbfe, 2.8, 8.5, 1.8);
        overheadSoftbox.position.set(0, 5.1, 0.3);
        overheadSoftbox.lookAt(0, 0.4, 0);
        scene.add(overheadSoftbox);
      }

      // Dark polished concrete garage floor
      const floorTex = createGarageFloorTexture(maxAniso);
      const floorGeo = new THREE.PlaneGeometry(75, 75);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.28,
        metalness: 0.35,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);
      disposables.push(floorTex, floorGeo, floorMat);

      // Dark industrial back wall with APEX CIRCUIT branding
      const wallTex = createGarageWallTexture(maxAniso);
      const wallGeo = new THREE.PlaneGeometry(24, 11);
      const wallMat = new THREE.MeshStandardMaterial({
        map: wallTex,
        roughness: 0.9,
        metalness: 0.1,
      });
      const backWall = new THREE.Mesh(wallGeo, wallMat);
      backWall.position.set(0, 5.2, -7.8);
      scene.add(backWall);
      disposables.push(wallTex, wallGeo, wallMat);

      // Dark ceiling girders & side structural columns for authentic garage bay depth
      const girderGeo = new THREE.BoxGeometry(24, 0.45, 0.6);
      const girderMat = new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.75,
        metalness: 0.45,
      });
      [-2.2, -5.0].forEach((gz) => {
        const girder = new THREE.Mesh(girderGeo, girderMat);
        girder.position.set(0, 5.7, gz);
        scene.add(girder);
      });
      disposables.push(girderGeo, girderMat);

      // Warm orange wall accent strip on left pillar (just like garage reference!)
      const wallStripGeo = new THREE.BoxGeometry(1.4, 0.14, 0.12);
      const wallStripMat = new THREE.MeshStandardMaterial({
        color: 0xffb732,
        emissive: 0xff8c1a,
        emissiveIntensity: 2.6,
        roughness: 0.2,
      });
      const wallStrip = new THREE.Mesh(wallStripGeo, wallStripMat);
      wallStrip.position.set(-5.7, 3.1, -6.2);
      scene.add(wallStrip);
      disposables.push(wallStripGeo, wallStripMat);

      // Overhead Cyan-White Fluorescent LED Light Tubes (matching Garage reference!)
      const tubeGeo = new THREE.BoxGeometry(3.3, 0.11, 0.24);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        emissive: 0x7dd3fc,
        emissiveIntensity: 2.4,
        roughness: 0.2,
      });
      [-3.8, 0, 3.8].forEach((tx) => {
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.position.set(tx, 5.25, -2.1);
        scene.add(tube);
      });
      disposables.push(tubeGeo, tubeMat);

      // Deep Red Workshop Tool Chests flanking the garage bay
      const chestGeo = new THREE.BoxGeometry(1.65, 2.05, 1.0);
      const chestMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.48,
        metalness: 0.35,
      });
      const chestTopGeo = new THREE.BoxGeometry(1.72, 0.12, 1.06);
      const chestTopMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.6,
        metalness: 0.55,
      });
      [-5.1, 5.1].forEach((cx) => {
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.set(cx, 1.02, -5.8);
        const top = new THREE.Mesh(chestTopGeo, chestTopMat);
        top.position.set(cx, 2.1, -5.8);
        scene.add(chest, top);
      });
      disposables.push(chestGeo, chestMat, chestTopGeo, chestTopMat);

      // Circular Dark Steel Turntable Plinth + Glowing Segmented Amber LED Ring
      // Attached to `turntableRig` so the entire base + car slides out & in on car change!
      const plinthGeo = new THREE.CylinderGeometry(3.25, 3.55, 0.16, 48);
      const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.26,
        metalness: 0.72,
      });
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.08;
      plinth.receiveShadow = true;
      turntableRig.add(plinth);

      // Inner dark bezel ring
      const innerRimGeo = new THREE.RingGeometry(2.62, 2.75, 48);
      innerRimGeo.rotateX(-Math.PI / 2);
      const innerRimMat = new THREE.MeshBasicMaterial({ color: 0x263244 });
      const innerRim = new THREE.Mesh(innerRimGeo, innerRimMat);
      innerRim.position.y = 0.165;
      turntableRig.add(innerRim);

      // Outer brushed metallic lip ring
      const outerRimGeo = new THREE.RingGeometry(3.24, 3.32, 48);
      outerRimGeo.rotateX(-Math.PI / 2);
      const outerRimMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
      const outerRim = new THREE.Mesh(outerRimGeo, outerRimMat);
      outerRim.position.y = 0.164;
      turntableRig.add(outerRim);

      // 14 Glowing Segmented Amber/Gold LED Light Arcs around turntable edge
      const segCount = 14;
      const segGeo = new THREE.BoxGeometry(0.95, 0.045, 0.28);
      const segMat = new THREE.MeshStandardMaterial({
        color: 0xffd014,
        emissive: 0xff9412,
        emissiveIntensity: 2.8,
        roughness: 0.18,
      });
      for (let i = 0; i < segCount; i++) {
        const ang = (i / segCount) * Math.PI * 2;
        const seg = new THREE.Mesh(segGeo, segMat);
        seg.position.set(Math.sin(ang) * 3.02, 0.17, Math.cos(ang) * 3.02);
        seg.rotation.y = ang;
        turntableRig.add(seg);
      }
      disposables.push(
        plinthGeo,
        plinthMat,
        innerRimGeo,
        innerRimMat,
        outerRimGeo,
        outerRimMat,
        segGeo,
        segMat
      );

      // Hero 3/4 car pose on the turntable facing front-left (matching Garage & Select Race screenshots!)
      carPivot.position.set(0, 0.16, 0);
      carPivot.rotation.y = -0.62;
    }

    const initialRig = isIntro ? buildIntroIconCar() : buildVehicleMesh(vehicle);
    if (isIntro) {
      // Dynamic hero stance matching the RUSH LINE app icon (subtle counter-steer on front wheels)
      initialRig.frontWheels.forEach((fw) => {
        fw.rotation.y = 0.18;
      });
    }
    carPivot.add(initialRig.root);
    rigRef.current = initialRig;
    displayedChassisRef.current = vehicle.chassisId;
    pendingVehicleRef.current = null;
    transitionRef.current = { phase: 'idle', progress: 0, direction: 1 };

    // Fixed camera framing for Intro (static hero shot) and Garage / Select bays
    // Adapts framing cleanly for ultra-wide/short mobile landscape aspect ratios
    const applyFixedCamera = () => {
      const aspect = camera.aspect;
      if (isIntro) {
        if (aspect > 1.95) {
          // Wide mobile landscape: frame full road width, both sides' flags, RUSH LINE arch & hero car cleanly
          camera.position.set(0.35, 2.3, 11.4);
          camera.lookAt(1.55, 1.35, -18.0);
        } else {
          camera.position.set(0.35, 2.2, 10.6);
          camera.lookAt(1.55, 1.32, -18.0);
        }
        return;
      }
      if (isSelect) {
        camera.position.set(0.45, 2.05, aspect > 2.0 ? 7.35 : 6.75);
        camera.lookAt(0.35, 0.72, 0);
      } else if (aspect > 1.95) {
        // Wide/short mobile landscape: pull slightly back and frame car slightly higher above bottom tabs
        camera.position.set(0, 2.25, 8.15);
        camera.lookAt(0, 0.42, 0);
      } else {
        camera.position.set(0, 2.15, 7.25);
        camera.lookAt(0, 0.68, 0);
      }
    };
    applyFixedCamera();

    const SLIDE_DISTANCE = 11.5;
    const EXIT_DURATION = 0.26;
    const ENTER_DURATION = 0.36;

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const swapRigInPlace = (nextVehicle: VehicleConfig) => {
      if (rigRef.current) {
        carPivot.remove(rigRef.current.root);
        rigRef.current.dispose();
      }
      const nextRig = buildVehicleMesh(nextVehicle);
      carPivot.add(nextRig.root);
      rigRef.current = nextRig;
      displayedChassisRef.current = nextVehicle.chassisId;
    };

    const updateScene = (dt: number) => {
      if (isIntro) {
        // Home page background is completely static (no animation)
        return;
      }

      // Garage / Select Race: fixed camera, animate turntable base + car slide-out & slide-in on chassis switch!
      const tr = transitionRef.current;
      if (tr.phase === 'exiting') {
        tr.progress = Math.min(1, tr.progress + dt / EXIT_DURATION);
        const eased = easeInCubic(tr.progress);
        turntableRig.position.x = -tr.direction * SLIDE_DISTANCE * eased;
        if (warmFloorGlow) {
          warmFloorGlow.intensity = 3.8 * (1 - eased * 0.75);
        }

        if (tr.progress >= 1) {
          // Swap to latest requested car while off-screen, then slide new base + car in from opposite side
          const nextVeh = pendingVehicleRef.current;
          pendingVehicleRef.current = null;
          if (nextVeh) {
            swapRigInPlace(nextVeh);
          }
          turntableRig.position.x = tr.direction * SLIDE_DISTANCE;
          tr.phase = 'entering';
          tr.progress = 0;
        }
      } else if (tr.phase === 'entering') {
        tr.progress = Math.min(1, tr.progress + dt / ENTER_DURATION);
        const eased = easeOutCubic(tr.progress);
        turntableRig.position.x = tr.direction * SLIDE_DISTANCE * (1 - eased);
        if (warmFloorGlow) {
          warmFloorGlow.intensity = 3.8 * (0.25 + eased * 0.75);
        }

        if (tr.progress >= 1) {
          turntableRig.position.x = 0;
          if (warmFloorGlow) warmFloorGlow.intensity = 3.8;
          tr.phase = 'idle';
          tr.progress = 0;

          // If another car was queued during entrance, kick off next slide immediately
          if (
            pendingVehicleRef.current &&
            pendingVehicleRef.current.chassisId !== displayedChassisRef.current
          ) {
            const prevIdx = CHASSIS_ORDER.indexOf(displayedChassisRef.current);
            const nextIdx = CHASSIS_ORDER.indexOf(pendingVehicleRef.current.chassisId);
            tr.direction = nextIdx >= prevIdx ? 1 : -1;
            tr.phase = 'exiting';
            tr.progress = 0;
          }
        }
      } else {
        turntableRig.position.x = 0;
      }
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
          frameId = window.setTimeout(cb, 32);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    let renderBusy = false;
    let renderDirty = false;

    // True on-demand rendering for ALL devices:
    // Renders single crisp frames on load/resize/paint edit, and ONLY runs rAF while a car slide transition is active!
    // Eliminates 100% of continuous GPU heat in the Garage, Select Race, and Intro screens.
    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      lastTime = performance.now();
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = isSoftwareGl ? 0.05 : Math.min(0.05, Math.max(0.008, (now - lastTime) / 1000));
        lastTime = now;
        updateScene(dt);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if ((renderDirty || transitionRef.current.phase !== 'idle') && !disposed) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };
    requestRenderRef.current = requestRender;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    const onResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      applyFixedCamera();
      renderer.setSize(w, h);
      requestRender();
    };

    window.addEventListener('resize', onResize);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => onResize())
        : null;
    resizeObserver?.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
      rigRef.current?.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [sceneMode, interactive]);

  // Handle vehicle changes:
  // - In Garage/Select: if chassisId changed, slide the turntable base + car out and slide the new car + base in!
  // - If only paint/decals/wing/rims/upgrades changed on the same car (or on Intro), update in place smoothly.
  useEffect(() => {
    const pivot = carPivotRef.current;
    if (!pivot) return;

    const isGarageLike = sceneModeRef.current !== 'intro';
    if (!isGarageLike) {
      // Intro screen always displays the iconic RUSH LINE hero coupe
      return;
    }
    const chassisChanged = vehicle.chassisId !== displayedChassisRef.current;

    if (isGarageLike && chassisChanged) {
      const prevIdx = CHASSIS_ORDER.indexOf(displayedChassisRef.current);
      const nextIdx = CHASSIS_ORDER.indexOf(vehicle.chassisId);
      const wrapForward = prevIdx === CHASSIS_ORDER.length - 1 && nextIdx === 0;
      const wrapBack = prevIdx === 0 && nextIdx === CHASSIS_ORDER.length - 1;
      const dir: 1 | -1 = wrapForward ? 1 : wrapBack ? -1 : nextIdx >= prevIdx ? 1 : -1;

      pendingVehicleRef.current = vehicle;
      const tr = transitionRef.current;
      if (tr.phase === 'idle') {
        tr.direction = dir;
        tr.phase = 'exiting';
        tr.progress = 0;
      } else if (tr.phase === 'entering') {
        // Reverse cleanly into exit to bring in the newly selected car
        tr.direction = dir;
        tr.phase = 'exiting';
        tr.progress = Math.max(0, 1 - tr.progress);
      }
      requestRenderRef.current?.();
      return;
    }

    // Same chassis (paint/livery/wing/rims) or Intro screen: update mesh in place
    if (transitionRef.current.phase !== 'idle') {
      pendingVehicleRef.current = vehicle;
      return;
    }

    if (rigRef.current) {
      pivot.remove(rigRef.current.root);
      rigRef.current.dispose();
    }
    const nextRig = buildVehicleMesh(vehicle);
    pivot.add(nextRig.root);
    rigRef.current = nextRig;
    displayedChassisRef.current = vehicle.chassisId;
    requestRenderRef.current?.();
  }, [vehicle]);

  return (
    <div
      ref={mountRef}
      className={className}
      aria-label={sceneMode === 'intro' ? '3D Alpine Circuit Backdrop' : '3D Garage Turntable'}
    />
  );
}
