import * as THREE from 'three';
import type { ActiveWeather, ClimateMode, TimeOfDay } from '../types/game.ts';

export interface WeatherSystemOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  roadMaterial?: THREE.MeshStandardMaterial;
  baseSkyColor: number;
  baseFogColor: number;
  baseFogDensity: number;
  baseSunIntensity: number;
  baseHemiIntensity: number;
  baseExposure: number;
  timeOfDay: TimeOfDay;
  climateMode: ClimateMode;
  lowPower?: boolean;
}

export interface WeatherSystem {
  update: (
    dt: number,
    focusX: number,
    focusY: number,
    focusZ: number,
    allowCycle: boolean
  ) => void;
  setClimateMode: (mode: ClimateMode) => void;
  getClimateMode: () => ClimateMode;
  getActiveWeather: () => ActiveWeather;
  getGripMultiplier: () => number;
  dispose: () => void;
}

const DYNAMIC_CYCLE_SEQUENCE: ActiveWeather[] = ['clear', 'rain', 'mist', 'snow'];

function createSnowflakeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(240,248,255,0.88)');
    grad.addColorStop(1, 'rgba(220,238,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(226,236,248,0.44)');
    grad.addColorStop(0.45, 'rgba(210,224,240,0.22)');
    grad.addColorStop(0.8, 'rgba(195,212,232,0.06)');
    grad.addColorStop(1, 'rgba(190,210,232,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrapAround(val: number, center: number, halfSpan: number): number {
  const span = halfSpan * 2;
  let d = val - center;
  if (d > halfSpan) d -= Math.ceil((d - halfSpan) / span) * span;
  else if (d < -halfSpan) d += Math.ceil((-halfSpan - d) / span) * span;
  return center + d;
}

export function createWeatherSystem(opts: WeatherSystemOptions): WeatherSystem {
  const {
    scene,
    renderer,
    sunLight,
    hemiLight,
    roadMaterial,
    baseSkyColor,
    baseFogColor,
    baseFogDensity,
    baseSunIntensity,
    baseHemiIntensity,
    baseExposure,
    timeOfDay,
    lowPower = false,
  } = opts;

  const isNight = timeOfDay === 'night';
  const isEvening = timeOfDay === 'evening';

  const weatherGroup = new THREE.Group();
  weatherGroup.name = 'DynamicWeatherSystem';
  scene.add(weatherGroup);

  // =========================================================================
  // 1. 3D SLANTED RAIN STREAKS (Zero-GC pre-allocated LineSegments)
  // =========================================================================
  const rainCount = lowPower ? 420 : 880;
  const rainHalfXZ = 36;
  const rainHeight = 28;
  const rainPositions = new Float32Array(rainCount * 2 * 3);
  const rainDropsX = new Float32Array(rainCount);
  const rainDropsY = new Float32Array(rainCount);
  const rainDropsZ = new Float32Array(rainCount);
  const rainSpeeds = new Float32Array(rainCount);

  for (let i = 0; i < rainCount; i++) {
    rainDropsX[i] = (Math.random() * 2 - 1) * rainHalfXZ;
    rainDropsY[i] = Math.random() * rainHeight;
    rainDropsZ[i] = (Math.random() * 2 - 1) * rainHalfXZ;
    rainSpeeds[i] = 28 + Math.random() * 14;
  }

  const rainGeo = new THREE.BufferGeometry();
  const rainPosAttr = new THREE.BufferAttribute(rainPositions, 3);
  rainPosAttr.setUsage(THREE.DynamicDrawUsage);
  rainGeo.setAttribute('position', rainPosAttr);

  const rainMat = new THREE.LineBasicMaterial({
    color: isNight ? 0xa5c9f5 : 0xdbeafe,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rainMesh = new THREE.LineSegments(rainGeo, rainMat);
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  weatherGroup.add(rainMesh);

  // =========================================================================
  // 2. 3D DRIFTING SNOWFLAKES (Zero-GC pre-allocated Points)
  // =========================================================================
  const snowCount = lowPower ? 450 : 950;
  const snowHalfXZ = 40;
  const snowHeight = 26;
  const snowPositions = new Float32Array(snowCount * 3);
  const snowPhase = new Float32Array(snowCount);
  const snowFallSpeed = new Float32Array(snowCount);

  for (let i = 0; i < snowCount; i++) {
    snowPositions[i * 3] = (Math.random() * 2 - 1) * snowHalfXZ;
    snowPositions[i * 3 + 1] = Math.random() * snowHeight;
    snowPositions[i * 3 + 2] = (Math.random() * 2 - 1) * snowHalfXZ;
    snowPhase[i] = Math.random() * Math.PI * 2;
    snowFallSpeed[i] = 3.2 + Math.random() * 2.8;
  }

  const snowGeo = new THREE.BufferGeometry();
  const snowPosAttr = new THREE.BufferAttribute(snowPositions, 3);
  snowPosAttr.setUsage(THREE.DynamicDrawUsage);
  snowGeo.setAttribute('position', snowPosAttr);

  const snowTex = createSnowflakeTexture();
  const snowMat = new THREE.PointsMaterial({
    map: snowTex,
    color: isNight ? 0xdbeafe : 0xffffff,
    size: lowPower ? 0.42 : 0.38,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  snowPoints.visible = false;
  weatherGroup.add(snowPoints);

  // =========================================================================
  // 3. LOW DRIFTING MIST BANKS (Soft Atmospheric Sprites near ground level)
  // =========================================================================
  const mistCount = lowPower ? 14 : 26;
  const mistHalfXZ = 54;
  const mistTex = createMistTexture();
  const mistMat = new THREE.SpriteMaterial({
    map: mistTex,
    color: isNight ? 0x64748b : isEvening ? 0xcfd8e6 : 0xe8f0f8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });

  const mistSprites: THREE.Sprite[] = [];
  const mistOffsetsX = new Float32Array(mistCount);
  const mistOffsetsZ = new Float32Array(mistCount);
  const mistHeightOffset = new Float32Array(mistCount);
  const mistDriftSpeed = new Float32Array(mistCount);

  for (let i = 0; i < mistCount; i++) {
    const sprite = new THREE.Sprite(mistMat);
    const scaleW = 18 + Math.random() * 18;
    const scaleH = 7 + Math.random() * 6;
    sprite.scale.set(scaleW, scaleH, 1);
    mistOffsetsX[i] = (Math.random() * 2 - 1) * mistHalfXZ;
    mistOffsetsZ[i] = (Math.random() * 2 - 1) * mistHalfXZ;
    mistHeightOffset[i] = 1.4 + Math.random() * 3.8;
    mistDriftSpeed[i] = 1.2 + Math.random() * 2.1;
    sprite.visible = false;
    weatherGroup.add(sprite);
    mistSprites.push(sprite);
  }

  // =========================================================================
  // 4. PRE-ALLOCATED TARGET COLORS & BASELINE STATE (Zero GC in update)
  // =========================================================================
  const baseSky = new THREE.Color(baseSkyColor);
  const baseFog = new THREE.Color(baseFogColor);
  const baseHemiSky = hemiLight.color.clone();

  const rainSky = new THREE.Color(isNight ? 0x0b1322 : isEvening ? 0x3b485c : 0x5c718a);
  const rainFog = new THREE.Color(isNight ? 0x0f1a2c : isEvening ? 0x475569 : 0x6c829b);
  const snowSky = new THREE.Color(isNight ? 0x162236 : isEvening ? 0x8a9db5 : 0xc9d8e8);
  const snowFog = new THREE.Color(isNight ? 0x1e2d44 : isEvening ? 0x9eb0c6 : 0xdbe6f2);
  const mistSky = new THREE.Color(isNight ? 0x1a2638 : isEvening ? 0x9aa8ba : 0xcbd7e4);
  const mistFog = new THREE.Color(isNight ? 0x243347 : isEvening ? 0xaab8c9 : 0xd6e1ec);

  const curSky = baseSky.clone();
  const curFog = baseFog.clone();
  const targetSky = baseSky.clone();
  const targetFog = baseFog.clone();
  const targetHemi = baseHemiSky.clone();

  const baseRoadRoughness = roadMaterial ? roadMaterial.roughness : 0.7;
  const baseRoadMetalness = roadMaterial ? roadMaterial.metalness : 0.06;

  let climateMode: ClimateMode = opts.climateMode;
  let activeWeather: ActiveWeather = climateMode === 'dynamic' ? 'clear' : climateMode;
  let cycleIdx = 0;
  let cycleTimer = 0;
  let elapsed = 0;
  let initializedPos = false;

  // Smooth weather weights (0..1)
  let rainWeight = activeWeather === 'rain' ? 1 : 0;
  let snowWeight = activeWeather === 'snow' ? 1 : 0;
  let mistWeight = activeWeather === 'mist' ? 1 : 0;

  const setClimateMode = (nextMode: ClimateMode) => {
    climateMode = nextMode;
    cycleTimer = 0;
    if (nextMode === 'dynamic') {
      // Advance immediately to next weather if already clear for a while, or stay on current
      cycleIdx = Math.max(0, DYNAMIC_CYCLE_SEQUENCE.indexOf(activeWeather));
    } else {
      activeWeather = nextMode;
    }
  };

  const update = (
    dt: number,
    focusX: number,
    focusY: number,
    focusZ: number,
    allowCycle: boolean
  ) => {
    const safeDt = Math.min(dt, 0.05);
    elapsed += safeDt;

    // Auto-cycle climate smoothly across Clear -> Rain -> Mist -> Snow on ANY track
    if (climateMode === 'dynamic' && allowCycle) {
      cycleTimer += safeDt;
      const stageDuration = activeWeather === 'clear' ? 15 : 22;
      if (cycleTimer >= stageDuration) {
        cycleTimer = 0;
        cycleIdx = (cycleIdx + 1) % DYNAMIC_CYCLE_SEQUENCE.length;
        activeWeather = DYNAMIC_CYCLE_SEQUENCE[cycleIdx];
      }
    }

    // Smooth blend weights
    const damp = 1 - Math.exp(-0.95 * safeDt);
    rainWeight += ((activeWeather === 'rain' ? 1 : 0) - rainWeight) * damp;
    snowWeight += ((activeWeather === 'snow' ? 1 : 0) - snowWeight) * damp;
    mistWeight += ((activeWeather === 'mist' ? 1 : 0) - mistWeight) * damp;

    const clearWeight = Math.max(0, 1 - rainWeight - snowWeight - mistWeight);

    // Initialize particle coordinates around player on first frame
    if (!initializedPos) {
      initializedPos = true;
      for (let i = 0; i < rainCount; i++) {
        rainDropsX[i] = focusX + (Math.random() * 2 - 1) * rainHalfXZ;
        rainDropsY[i] = focusY + Math.random() * rainHeight;
        rainDropsZ[i] = focusZ + (Math.random() * 2 - 1) * rainHalfXZ;
      }
      for (let i = 0; i < snowCount; i++) {
        snowPositions[i * 3] = focusX + (Math.random() * 2 - 1) * snowHalfXZ;
        snowPositions[i * 3 + 1] = focusY + Math.random() * snowHeight;
        snowPositions[i * 3 + 2] = focusZ + (Math.random() * 2 - 1) * snowHalfXZ;
      }
    }

    // -----------------------------------------------------------------------
    // Update Rain Streaks
    // -----------------------------------------------------------------------
    if (rainWeight > 0.015) {
      rainMesh.visible = true;
      rainMat.opacity = Math.min(0.66, rainWeight * 0.64);
      const windX = 3.8;
      const windZ = 1.6;
      const minY = focusY - 2;
      const maxY = focusY + rainHeight;
      for (let i = 0; i < rainCount; i++) {
        const spd = rainSpeeds[i];
        let rx = rainDropsX[i] + windX * safeDt;
        let ry = rainDropsY[i] - spd * safeDt;
        let rz = rainDropsZ[i] + windZ * safeDt;

        if (ry < minY) {
          ry += rainHeight + 2;
          rx = focusX + (Math.random() * 2 - 1) * rainHalfXZ;
          rz = focusZ + (Math.random() * 2 - 1) * rainHalfXZ;
        } else {
          rx = wrapAround(rx, focusX, rainHalfXZ);
          rz = wrapAround(rz, focusZ, rainHalfXZ);
          if (ry > maxY) ry = minY + Math.random() * rainHeight;
        }

        rainDropsX[i] = rx;
        rainDropsY[i] = ry;
        rainDropsZ[i] = rz;

        const baseIdx = i * 6;
        const streakLen = 0.85 + (spd - 28) * 0.032;
        rainPositions[baseIdx] = rx;
        rainPositions[baseIdx + 1] = ry;
        rainPositions[baseIdx + 2] = rz;
        rainPositions[baseIdx + 3] = rx - windX * 0.035;
        rainPositions[baseIdx + 4] = ry + streakLen;
        rainPositions[baseIdx + 5] = rz - windZ * 0.035;
      }
      rainPosAttr.needsUpdate = true;
    } else {
      rainMesh.visible = false;
    }

    // -----------------------------------------------------------------------
    // Update Drifting Snowflakes
    // -----------------------------------------------------------------------
    if (snowWeight > 0.015) {
      snowPoints.visible = true;
      snowMat.opacity = Math.min(0.92, snowWeight * 0.9);
      const minY = focusY - 1.5;
      const maxY = focusY + snowHeight;
      for (let i = 0; i < snowCount; i++) {
        const i3 = i * 3;
        const phase = snowPhase[i];
        let sx = snowPositions[i3] + (Math.sin(elapsed * 1.4 + phase) * 2.1 + 1.3) * safeDt;
        let sy = snowPositions[i3 + 1] - snowFallSpeed[i] * safeDt;
        let sz = snowPositions[i3 + 2] + Math.cos(elapsed * 1.1 + phase * 1.3) * 1.6 * safeDt;

        if (sy < minY) {
          sy += snowHeight + 1.5;
          sx = focusX + (Math.random() * 2 - 1) * snowHalfXZ;
          sz = focusZ + (Math.random() * 2 - 1) * snowHalfXZ;
        } else {
          sx = wrapAround(sx, focusX, snowHalfXZ);
          sz = wrapAround(sz, focusZ, snowHalfXZ);
          if (sy > maxY) sy = minY + Math.random() * snowHeight;
        }

        snowPositions[i3] = sx;
        snowPositions[i3 + 1] = sy;
        snowPositions[i3 + 2] = sz;
      }
      snowPosAttr.needsUpdate = true;
    } else {
      snowPoints.visible = false;
    }

    // -----------------------------------------------------------------------
    // Update Low Drifting Mist Banks
    // -----------------------------------------------------------------------
    const effectiveMist = Math.min(1, mistWeight + rainWeight * 0.24 + snowWeight * 0.28);
    if (effectiveMist > 0.02) {
      mistMat.opacity = effectiveMist * (isNight ? 0.34 : 0.42);
      for (let i = 0; i < mistCount; i++) {
        mistOffsetsX[i] = wrapAround(
          mistOffsetsX[i] + mistDriftSpeed[i] * safeDt,
          0,
          mistHalfXZ
        );
        const sprite = mistSprites[i];
        sprite.visible = true;
        sprite.position.set(
          focusX + mistOffsetsX[i],
          focusY + mistHeightOffset[i] + Math.sin(elapsed * 0.45 + i) * 0.4,
          focusZ + mistOffsetsZ[i]
        );
      }
    } else {
      for (let i = 0; i < mistCount; i++) {
        mistSprites[i].visible = false;
      }
    }

    // -----------------------------------------------------------------------
    // Update Atmospheric Sky, Fog Density, Lighting & Wet Glossy Road Surface
    // -----------------------------------------------------------------------
    targetSky.setRGB(
      baseSky.r * clearWeight + rainSky.r * rainWeight + snowSky.r * snowWeight + mistSky.r * mistWeight,
      baseSky.g * clearWeight + rainSky.g * rainWeight + snowSky.g * snowWeight + mistSky.g * mistWeight,
      baseSky.b * clearWeight + rainSky.b * rainWeight + snowSky.b * snowWeight + mistSky.b * mistWeight
    );
    targetFog.setRGB(
      baseFog.r * clearWeight + rainFog.r * rainWeight + snowFog.r * snowWeight + mistFog.r * mistWeight,
      baseFog.g * clearWeight + rainFog.g * rainWeight + snowFog.g * snowWeight + mistFog.g * mistWeight,
      baseFog.b * clearWeight + rainFog.b * rainWeight + snowFog.b * snowWeight + mistFog.b * mistWeight
    );

    curSky.lerp(targetSky, Math.min(1, safeDt * 3.5));
    curFog.lerp(targetFog, Math.min(1, safeDt * 3.5));

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(curSky);
    }
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(curFog);
      const targetDensity =
        baseFogDensity * clearWeight +
        0.0046 * rainWeight +
        0.0058 * snowWeight +
        0.0145 * mistWeight;
      scene.fog.density += (targetDensity - scene.fog.density) * Math.min(1, safeDt * 2.5);
    }

    // Overcast lighting shift
    const sunMult = 1 - rainWeight * 0.42 - snowWeight * 0.34 - mistWeight * 0.46;
    const hemiMult = 1 - rainWeight * 0.12 + snowWeight * 0.14 + mistWeight * 0.08;
    sunLight.intensity = baseSunIntensity * sunMult;
    hemiLight.intensity = baseHemiIntensity * hemiMult;
    targetHemi.copy(baseHemiSky).lerp(curSky, (rainWeight + snowWeight + mistWeight) * 0.45);
    hemiLight.color.copy(targetHemi);

    renderer.toneMappingExposure =
      baseExposure * (1 - rainWeight * 0.08 - mistWeight * 0.05 + snowWeight * 0.04);

    // Wet glossy road reflection during Rain, lightly frosted sheen during Snow
    if (roadMaterial) {
      const targetRoughness = THREE.MathUtils.clamp(
        baseRoadRoughness - rainWeight * 0.46 + snowWeight * 0.08 - mistWeight * 0.06,
        0.2,
        0.95
      );
      const targetMetalness = THREE.MathUtils.clamp(
        baseRoadMetalness + rainWeight * 0.24 + snowWeight * 0.04,
        0.02,
        0.38
      );
      roadMaterial.roughness = targetRoughness;
      roadMaterial.metalness = targetMetalness;
    }
  };

  const getGripMultiplier = (): number => {
    const clearWeight = Math.max(0, 1 - rainWeight - snowWeight - mistWeight);
    return clearWeight * 1.0 + mistWeight * 0.95 + rainWeight * 0.88 + snowWeight * 0.81;
  };

  const dispose = () => {
    scene.remove(weatherGroup);
    rainGeo.dispose();
    rainMat.dispose();
    snowGeo.dispose();
    snowMat.dispose();
    snowTex.dispose();
    mistMat.dispose();
    mistTex.dispose();
  };

  return {
    update,
    setClimateMode,
    getClimateMode: () => climateMode,
    getActiveWeather: () => activeWeather,
    getGripMultiplier,
    dispose,
  };
}
