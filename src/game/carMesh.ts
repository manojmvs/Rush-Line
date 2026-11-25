import * as THREE from 'three';
import type { VehicleConfig } from '../types/game.ts';

export interface CarMeshRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheels: THREE.Group[];
  spinWheels: THREE.Object3D[];
  brakeLightMat: THREE.MeshStandardMaterial;
  nitroFlames: THREE.Mesh[];
  dispose: () => void;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 128, 18, 64, 128, 118);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (!sharedShadowTex) {
    sharedShadowTex = createContactShadowTexture();
  }
  return sharedShadowTex;
}

export function buildVehicleMesh(
  config: VehicleConfig,
  options?: { lowPower?: boolean }
): CarMeshRig {
  const lowPower = options?.lowPower ?? false;
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposables: Array<{ dispose: () => void }> = [];

  // Proportions per chassis class
  const dims =
    config.chassisId === 'hyperion-proto'
      ? { len: 4.78, wid: 2.06, hgt: 0.96, cabinZ: 0.14, noseSlope: 0.40 }
      : config.chassisId === 'stratos-gt3'
      ? { len: 4.66, wid: 2.02, hgt: 1.04, cabinZ: 0.04, noseSlope: 0.44 }
      : config.chassisId === 'veloce-v12'
      ? { len: 4.55, wid: 1.98, hgt: 1.05, cabinZ: 0.05, noseSlope: 0.45 }
      : config.chassisId === 'vanguard-v8'
      ? { len: 4.74, wid: 1.98, hgt: 1.20, cabinZ: -0.26, noseSlope: 0.58 }
      : config.chassisId === 'drift-s15'
      ? { len: 4.42, wid: 1.84, hgt: 1.18, cabinZ: -0.15, noseSlope: 0.56 }
      : { len: 4.60, wid: 1.92, hgt: 1.14, cabinZ: -0.10, noseSlope: 0.52 };

  // PBR Car Paint based on finish (use lightweight MeshStandardMaterial on mobile to avoid heavy dual-lobe clearcoat shaders!)
  const paintRoughness =
    config.paintFinish === 'matte' ? 0.62 : config.paintFinish === 'metallic' ? 0.24 : 0.14;
  const paintMetalness =
    config.paintFinish === 'matte' ? 0.18 : config.paintFinish === 'metallic' ? 0.82 : 0.32;
  const clearcoat = config.paintFinish === 'matte' ? 0.05 : 1.0;

  const paintMat = lowPower
    ? new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.primaryColor),
        roughness: paintRoughness,
        metalness: paintMetalness,
      })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(config.primaryColor),
        roughness: paintRoughness,
        metalness: paintMetalness,
        clearcoat,
        clearcoatRoughness: 0.08,
      });

  const accentMat = lowPower
    ? new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.accentColor),
        roughness: 0.25,
        metalness: 0.5,
      })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(config.accentColor),
        roughness: 0.25,
        metalness: 0.5,
        clearcoat: 0.85,
      });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.48,
    metalness: 0.35,
  });

  const glassMat = lowPower
    ? new THREE.MeshStandardMaterial({
        color: 0x0a111c,
        roughness: 0.1,
        metalness: 0.25,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0x0a111c,
        roughness: 0.08,
        metalness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xe0f2fe,
    emissiveIntensity: 1.8,
    roughness: 0.15,
  });

  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });

  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.22,
    metalness: 0.92,
  });

  disposables.push(paintMat, accentMat, carbonMat, glassMat, headlightMat, brakeLightMat, exhaustMat);

  // 1. Primary Silhouette: Sculpted beveled side profile extruded across car width
  // Car faces +Z (front is +len/2, rear is -len/2)
  const halfL = dims.len * 0.5;
  const profile = new THREE.Shape();
  profile.moveTo(-halfL, 0.28);
  profile.lineTo(halfL - 0.18, 0.25);
  profile.lineTo(halfL, 0.42);
  profile.lineTo(halfL - 0.55, dims.noseSlope + 0.18);
  profile.lineTo(0.85, dims.noseSlope + 0.26);
  profile.lineTo(-halfL + 0.25, 0.82);
  profile.lineTo(-halfL, 0.72);
  profile.closePath();

  const bodyExtrude = new THREE.ExtrudeGeometry(profile, {
    depth: dims.wid - 0.16,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  bodyExtrude.center();
  // Rotate so profile X maps to +Z (front) and extrusion depth maps to X (width)
  bodyExtrude.rotateY(-Math.PI / 2);

  const mainHull = new THREE.Mesh(bodyExtrude, paintMat);
  mainHull.position.set(0, 0.54, 0);
  mainHull.castShadow = true;
  mainHull.receiveShadow = true;
  bodyGroup.add(mainHull);
  disposables.push(bodyExtrude);

  // 2. Sculpted Fender Haunches (wide motorsport stance)
  const fenderGeo = new THREE.BoxGeometry(0.28, 0.36, 1.38);
  const flFender = new THREE.Mesh(fenderGeo, paintMat);
  flFender.position.set(-(dims.wid * 0.5 - 0.12), 0.54, halfL - 0.95);
  const frFender = new THREE.Mesh(fenderGeo, paintMat);
  frFender.position.set(dims.wid * 0.5 - 0.12, 0.54, halfL - 0.95);
  const rlFender = new THREE.Mesh(fenderGeo, paintMat);
  rlFender.position.set(-(dims.wid * 0.5 - 0.10), 0.58, -(halfL - 1.02));
  const rrFender = new THREE.Mesh(fenderGeo, paintMat);
  rrFender.position.set(dims.wid * 0.5 - 0.10, 0.58, -(halfL - 1.02));
  [flFender, frFender, rlFender, rrFender].forEach((f) => {
    f.castShadow = !lowPower;
    bodyGroup.add(f);
  });
  disposables.push(fenderGeo);

  // 3. Secondary Read: Aerodynamic Cockpit Canopy + Windshield Glass
  const cabinProfile = new THREE.Shape();
  cabinProfile.moveTo(-1.15, 0);
  cabinProfile.lineTo(1.05, 0);
  cabinProfile.lineTo(0.45, dims.hgt - 0.62);
  cabinProfile.lineTo(-0.62, dims.hgt - 0.62);
  cabinProfile.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinProfile, {
    depth: dims.wid * 0.68,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: lowPower ? 1 : 2,
  });
  cabinGeo.center();
  cabinGeo.rotateY(-Math.PI / 2);

  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.set(0, 0.94, dims.cabinZ);
  cabinMesh.castShadow = !lowPower;
  bodyGroup.add(cabinMesh);
  disposables.push(cabinGeo);

  // Roof cap painted in primary or carbon
  const roofGeo = new THREE.BoxGeometry(dims.wid * 0.62, 0.06, 1.08);
  const roofMesh = new THREE.Mesh(
    roofGeo,
    config.chassisId === 'hyperion-proto' || config.chassisId === 'stratos-gt3'
      ? carbonMat
      : paintMat
  );
  roofMesh.position.set(0, dims.hgt + 0.09, dims.cabinZ - 0.08);
  bodyGroup.add(roofMesh);
  disposables.push(roofGeo);

  // Chassis-specific aero signatures (hood power dome for V8, roof scoop for GT3/Hypercar)
  if (config.chassisId === 'vanguard-v8') {
    const bulgeGeo = new THREE.BoxGeometry(0.68, 0.12, 1.15);
    const bulge = new THREE.Mesh(bulgeGeo, carbonMat);
    bulge.position.set(0, 0.85, 1.05);
    bodyGroup.add(bulge);
    disposables.push(bulgeGeo);
  } else if (config.chassisId === 'stratos-gt3' || config.chassisId === 'hyperion-proto') {
    const scoopGeo = new THREE.BoxGeometry(0.32, 0.14, 0.72);
    const scoop = new THREE.Mesh(scoopGeo, carbonMat);
    scoop.position.set(0, dims.hgt + 0.16, dims.cabinZ - 0.18);
    bodyGroup.add(scoop);
    disposables.push(scoopGeo);
  }

  // 4. Carbon Front Splitter, Side Skirts, & Rear Diffuser
  const splitterGeo = new THREE.BoxGeometry(dims.wid + 0.06, 0.07, 0.58);
  const splitter = new THREE.Mesh(splitterGeo, carbonMat);
  splitter.position.set(0, 0.24, halfL - 0.12);
  bodyGroup.add(splitter);

  const skirtGeo = new THREE.BoxGeometry(0.14, 0.12, dims.len * 0.56);
  const leftSkirt = new THREE.Mesh(skirtGeo, carbonMat);
  leftSkirt.position.set(-(dims.wid * 0.5), 0.26, 0);
  const rightSkirt = new THREE.Mesh(skirtGeo, carbonMat);
  rightSkirt.position.set(dims.wid * 0.5, 0.26, 0);
  bodyGroup.add(leftSkirt, rightSkirt);

  const diffuserGeo = new THREE.BoxGeometry(dims.wid * 0.86, 0.22, 0.42);
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.30, -halfL + 0.05);
  bodyGroup.add(diffuser);
  disposables.push(splitterGeo, skirtGeo, diffuserGeo);

  // 5. Livery Stripes
  if (config.liveryStyle === 'center-stripe') {
    const stripeGeo = new THREE.BoxGeometry(0.36, 0.03, dims.len * 0.86);
    const stripe = new THREE.Mesh(stripeGeo, accentMat);
    stripe.position.set(0, 0.84, 0.1);
    bodyGroup.add(stripe);
    disposables.push(stripeGeo);
  } else if (config.liveryStyle === 'dual-stripe') {
    const stripeGeo = new THREE.BoxGeometry(0.14, 0.03, dims.len * 0.86);
    const s1 = new THREE.Mesh(stripeGeo, accentMat);
    s1.position.set(-0.14, 0.84, 0.1);
    const s2 = new THREE.Mesh(stripeGeo, accentMat);
    s2.position.set(0.14, 0.84, 0.1);
    bodyGroup.add(s1, s2);
    disposables.push(stripeGeo);
  } else if (config.liveryStyle === 'side-blade') {
    const bladeGeo = new THREE.BoxGeometry(0.05, 0.20, dims.len * 0.48);
    const b1 = new THREE.Mesh(bladeGeo, accentMat);
    b1.position.set(-(dims.wid * 0.5 + 0.01), 0.52, -0.05);
    const b2 = new THREE.Mesh(bladeGeo, accentMat);
    b2.position.set(dims.wid * 0.5 + 0.01, 0.52, -0.05);
    bodyGroup.add(b1, b2);
    disposables.push(bladeGeo);
  }

  // 6. Accent Details: Headlights, Rear Brake Light Bar, Exhaust Pipes, & Nitro Flames
  const hlGeo = new THREE.BoxGeometry(0.42, 0.11, 0.16);
  const hlL = new THREE.Mesh(hlGeo, headlightMat);
  hlL.position.set(-dims.wid * 0.34, 0.56, halfL - 0.08);
  hlL.rotation.y = 0.18;
  const hlR = new THREE.Mesh(hlGeo, headlightMat);
  hlR.position.set(dims.wid * 0.34, 0.56, halfL - 0.08);
  hlR.rotation.y = -0.18;
  bodyGroup.add(hlL, hlR);

  const tlGeo = new THREE.BoxGeometry(dims.wid * 0.82, 0.11, 0.1);
  const tailBar = new THREE.Mesh(tlGeo, brakeLightMat);
  tailBar.position.set(0, 0.68, -halfL - 0.02);
  bodyGroup.add(tailBar);

  const pipeGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.26, 10);
  pipeGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.085, 0.78, 8);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.4);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.88,
  });

  const nitroFlames: THREE.Mesh[] = [];
  for (const xOff of [-0.38, 0.38]) {
    const pipe = new THREE.Mesh(pipeGeo, exhaustMat);
    pipe.position.set(xOff, 0.32, -halfL - 0.05);
    bodyGroup.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(xOff, 0.32, -halfL - 0.14);
    flame.visible = false;
    bodyGroup.add(flame);
    nitroFlames.push(flame);
  }
  disposables.push(hlGeo, tlGeo, pipeGeo, flameGeo, flameMat);

  // 7. Rear Wing Aero Kit
  if (config.wingStyle !== 'delete') {
    const wingGroup = new THREE.Group();
    if (config.wingStyle === 'stock') {
      const lipGeo = new THREE.BoxGeometry(dims.wid * 0.84, 0.07, 0.24);
      const lip = new THREE.Mesh(lipGeo, carbonMat);
      lip.position.set(0, 0.90, -halfL + 0.16);
      lip.rotation.x = 0.18;
      wingGroup.add(lip);
      disposables.push(lipGeo);
    } else if (config.wingStyle === 'gt-carbon') {
      const bladeGeo = new THREE.BoxGeometry(dims.wid * 0.96, 0.06, 0.34);
      const strutGeo = new THREE.BoxGeometry(0.06, 0.34, 0.24);
      const endplateGeo = new THREE.BoxGeometry(0.04, 0.24, 0.42);
      const blade = new THREE.Mesh(bladeGeo, carbonMat);
      blade.position.set(0, 1.15, -halfL + 0.14);
      blade.rotation.x = 0.12;
      const sL = new THREE.Mesh(strutGeo, carbonMat);
      sL.position.set(-0.48, 0.97, -halfL + 0.18);
      const sR = new THREE.Mesh(strutGeo, carbonMat);
      sR.position.set(0.48, 0.97, -halfL + 0.18);
      const eL = new THREE.Mesh(endplateGeo, accentMat);
      eL.position.set(-dims.wid * 0.48, 1.15, -halfL + 0.14);
      const eR = new THREE.Mesh(endplateGeo, accentMat);
      eR.position.set(dims.wid * 0.48, 1.15, -halfL + 0.14);
      wingGroup.add(blade, sL, sR, eL, eR);
      disposables.push(bladeGeo, strutGeo, endplateGeo);
    } else if (config.wingStyle === 'swan-neck') {
      const bladeGeo = new THREE.BoxGeometry(dims.wid * 1.04, 0.07, 0.42);
      const strutGeo = new THREE.BoxGeometry(0.07, 0.46, 0.22);
      const endplateGeo = new THREE.BoxGeometry(0.05, 0.32, 0.50);
      const blade = new THREE.Mesh(bladeGeo, carbonMat);
      blade.position.set(0, 1.24, -halfL + 0.05);
      blade.rotation.x = 0.16;
      const sL = new THREE.Mesh(strutGeo, carbonMat);
      sL.position.set(-0.32, 1.06, -halfL + 0.15);
      sL.rotation.x = -0.25;
      const sR = new THREE.Mesh(strutGeo, carbonMat);
      sR.position.set(0.32, 1.06, -halfL + 0.15);
      sR.rotation.x = -0.25;
      const eL = new THREE.Mesh(endplateGeo, paintMat);
      eL.position.set(-dims.wid * 0.52, 1.24, -halfL + 0.05);
      const eR = new THREE.Mesh(endplateGeo, paintMat);
      eR.position.set(dims.wid * 0.52, 1.24, -halfL + 0.05);
      wingGroup.add(blade, sL, sR, eL, eR);
      disposables.push(bladeGeo, strutGeo, endplateGeo);
    }
    bodyGroup.add(wingGroup);
  }

  // 8. Articulated 4-Wheel Assemblies (Tire + Rim Spokes + Brake Disc + Caliper)
  const wheelRadius = 0.35;
  const wheelWidth = 0.28;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.88, metalness: 0.04 });

  const rimBarrelGeo = new THREE.CylinderGeometry(wheelRadius * 0.68, wheelRadius * 0.68, wheelWidth + 0.015, 16);
  rimBarrelGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.rimColor),
    roughness: 0.22,
    metalness: 0.88,
  });

  const discGeo = new THREE.CylinderGeometry(wheelRadius * 0.54, wheelRadius * 0.54, 0.04, 14);
  discGeo.rotateZ(Math.PI / 2);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 });

  const caliperGeo = new THREE.BoxGeometry(0.11, 0.17, 0.12);
  const caliperMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.caliperColor),
    roughness: 0.3,
    metalness: 0.45,
  });

  const spokeGeo =
    config.rimStyle === 'aero-disc'
      ? new THREE.CylinderGeometry(wheelRadius * 0.62, wheelRadius * 0.62, 0.04, 16)
      : new THREE.BoxGeometry(0.05, wheelRadius * 1.24, config.rimStyle === 'turbine' ? 0.045 : 0.07);
  if (config.rimStyle === 'aero-disc') {
    spokeGeo.rotateZ(Math.PI / 2);
  }

  disposables.push(tireGeo, tireMat, rimBarrelGeo, rimMat, discGeo, discMat, caliperGeo, caliperMat, spokeGeo);

  const frontZ = halfL - 0.92;
  const rearZ = -(halfL - 0.96);
  const trackHalf = dims.wid * 0.5 - 0.08;

  const wheelDefs = [
    { x: -trackHalf, z: frontZ, front: true, side: -1 },
    { x: trackHalf, z: frontZ, front: true, side: 1 },
    { x: -trackHalf, z: rearZ, front: false, side: -1 },
    { x: trackHalf, z: rearZ, front: false, side: 1 },
  ];

  const frontWheels: THREE.Group[] = [];
  const spinWheels: THREE.Object3D[] = [];

  for (const wd of wheelDefs) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wd.x, wheelRadius, wd.z);

    // Non-spinning brake caliper mounted to steering knuckle
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(wd.side * 0.03, 0.04, -0.14);
    steerPivot.add(caliper);

    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = !lowPower;
    const rim = new THREE.Mesh(rimBarrelGeo, rimMat);
    const disc = new THREE.Mesh(discGeo, discMat);
    spinGroup.add(tire, rim, disc);

    if (config.rimStyle === 'aero-disc') {
      const cap = new THREE.Mesh(spokeGeo, rimMat);
      cap.position.x = wd.side * (wheelWidth * 0.45);
      spinGroup.add(cap);
    } else {
      const spokeCount = config.rimStyle === 'turbine' ? 7 : 5;
      for (let s = 0; s < spokeCount; s++) {
        const sp = new THREE.Mesh(spokeGeo, rimMat);
        sp.position.x = wd.side * (wheelWidth * 0.48);
        sp.rotation.x = (s / spokeCount) * Math.PI;
        spinGroup.add(sp);
      }
    }

    steerPivot.add(spinGroup);
    root.add(steerPivot);

    if (wd.front) frontWheels.push(steerPivot);
    spinWheels.push(spinGroup);
  }

  // 9. Contact Shadow Grounding Plane (prevents floating appearance on every surface)
  const shadowGeo = new THREE.PlaneGeometry(dims.wid * 1.48, dims.len * 1.24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.035;
  root.add(shadowPlane);
  disposables.push(shadowGeo, shadowMat);

  return {
    root,
    bodyGroup,
    frontWheels,
    spinWheels,
    brakeLightMat,
    nitroFlames,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * Icon-faithful red low-poly RUSH LINE hero sports coupe for the Intro screen:
 * Matches the uploaded RUSH LINE app icon with sloped red hood, flush dual white
 * racing stripes, bold glowing rectangular headlights + amber corner markers,
 * crisp white side door trim, dark splitter with silver-white lip, tinted coupe
 * cabin with red roof/pillars, crisp WHITE rear spoiler on black struts, and
 * chunky tires with bright clean silver-white aero-disc rims.
 */
export function buildIntroIconCar(): CarMeshRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposables: Array<{ dispose: () => void }> = [];

  const len = 4.68;
  const wid = 2.08;
  const halfL = len * 0.5; // 2.34
  const halfW = wid * 0.5; // 1.04

  const redPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xe21c24,
    roughness: 0.22,
    metalness: 0.14,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
  });

  const whiteTrimMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.18,
    metalness: 0.08,
    clearcoat: 0.85,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x141822,
    roughness: 0.52,
    metalness: 0.25,
  });

  const silverLipMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ef,
    roughness: 0.24,
    metalness: 0.65,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x101828,
    roughness: 0.07,
    metalness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8e6,
    emissiveIntensity: 2.2,
    roughness: 0.1,
  });

  const amberCornerMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    emissive: 0xff9500,
    emissiveIntensity: 1.9,
    roughness: 0.15,
  });

  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });

  disposables.push(
    redPaintMat,
    whiteTrimMat,
    darkTrimMat,
    silverLipMat,
    glassMat,
    headlightMat,
    amberCornerMat,
    brakeLightMat
  );

  // 1. Primary Sculpted Low-Poly Red Coupe Hull (facing +Z)
  // Shape coordinates: x -> world +Z, y -> world +Y
  const hullProfile = new THREE.Shape();
  hullProfile.moveTo(-halfL, 0.30);          // Rear bottom
  hullProfile.lineTo(halfL - 0.08, 0.28);    // Front chin bottom
  hullProfile.lineTo(halfL + 0.06, 0.50);    // Front bumper tip (angular undercut like icon!)
  hullProfile.lineTo(halfL - 0.08, 0.73);    // Steep bold front headlight fascia crest
  hullProfile.lineTo(0.76, 0.89);            // Windshield cowl base
  hullProfile.lineTo(-1.12, 0.90);           // Rear cabin base
  hullProfile.lineTo(-halfL + 0.04, 0.88);   // Rear trunk edge
  hullProfile.lineTo(-halfL, 0.74);          // Rear fascia upper
  hullProfile.closePath();

  const hullDepth = wid - 0.14;
  const hullGeo = new THREE.ExtrudeGeometry(hullProfile, {
    depth: hullDepth,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  // Center only along extrusion depth (Z before rotate -> X after rotate) so Y & longitudinal Z stay exact!
  hullGeo.translate(0, 0, -hullDepth * 0.5);
  hullGeo.rotateY(-Math.PI / 2);

  const hullMesh = new THREE.Mesh(hullGeo, redPaintMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  bodyGroup.add(hullMesh);
  disposables.push(hullGeo);

  // 2. Sculpted Front Chin Splitter + Crisp Silver-White Lower Lip Accent
  const splitterGeo = new THREE.BoxGeometry(wid + 0.06, 0.08, 0.62);
  const splitter = new THREE.Mesh(splitterGeo, darkTrimMat);
  splitter.position.set(0, 0.25, halfL - 0.16);
  bodyGroup.add(splitter);

  const lipGeo = new THREE.BoxGeometry(wid + 0.08, 0.045, 0.15);
  const frontLip = new THREE.Mesh(lipGeo, silverLipMat);
  frontLip.position.set(0, 0.255, halfL + 0.10);
  bodyGroup.add(frontLip);

  const sideSkirtGeo = new THREE.BoxGeometry(0.10, 0.10, len * 0.58);
  const skirtL = new THREE.Mesh(sideSkirtGeo, darkTrimMat);
  skirtL.position.set(-halfW, 0.26, -0.05);
  const skirtR = new THREE.Mesh(sideSkirtGeo, darkTrimMat);
  skirtR.position.set(halfW, 0.26, -0.05);
  bodyGroup.add(skirtL, skirtR);

  // Recessed Dark Front Grille Strip between headlights
  const grilleGeo = new THREE.BoxGeometry(wid * 0.42, 0.16, 0.08);
  const grille = new THREE.Mesh(grilleGeo, darkTrimMat);
  grille.position.set(0, 0.61, halfL + 0.06);
  grille.rotation.x = -0.46;
  bodyGroup.add(grille);

  // Rear Diffuser & Tail Light Bar
  const diffuserGeo = new THREE.BoxGeometry(wid * 0.88, 0.20, 0.36);
  const diffuser = new THREE.Mesh(diffuserGeo, darkTrimMat);
  diffuser.position.set(0, 0.32, -halfL + 0.06);
  const tlGeo = new THREE.BoxGeometry(wid * 0.84, 0.12, 0.08);
  const tailBar = new THREE.Mesh(tlGeo, brakeLightMat);
  tailBar.position.set(0, 0.72, -halfL - 0.03);
  bodyGroup.add(diffuser, tailBar);
  disposables.push(splitterGeo, lipGeo, sideSkirtGeo, grilleGeo, diffuserGeo, tlGeo);

  // 3. Bold Glowing Rectangular Headlights + Warm Amber Outer Corners (matching icon!)
  const hlGeo = new THREE.BoxGeometry(0.52, 0.21, 0.12);
  const ambGeo = new THREE.BoxGeometry(0.14, 0.20, 0.13);
  for (const side of [-1, 1]) {
    const hlGroup = new THREE.Group();
    hlGroup.position.set(side * (halfW - 0.35), 0.61, halfL + 0.045);
    hlGroup.rotation.x = -0.48;
    hlGroup.rotation.y = -side * 0.08;

    const hl = new THREE.Mesh(hlGeo, headlightMat);
    const amb = new THREE.Mesh(ambGeo, amberCornerMat);
    amb.position.set(side * 0.30, -0.005, -0.015);
    hlGroup.add(hl, amb);
    bodyGroup.add(hlGroup);
  }
  disposables.push(hlGeo, ambGeo);

  // 4. Flush Dual White Racing Stripes conforming cleanly to the sloped hood, nose & trunk!
  const hoodStartZ = 0.76;
  const hoodStartY = 0.89;
  const hoodEndZ = halfL - 0.08;
  const hoodEndY = 0.73;
  const hoodLen = Math.hypot(hoodEndZ - hoodStartZ, hoodEndY - hoodStartY) + 0.04;
  const hoodAngle = Math.atan2(hoodStartY - hoodEndY, hoodEndZ - hoodStartZ); // pitch down toward +Z
  const hoodMidZ = (hoodStartZ + hoodEndZ) * 0.5;
  const hoodMidY = (hoodStartY + hoodEndY) * 0.5 + 0.066;

  const hoodStripeGeo = new THREE.BoxGeometry(0.22, 0.025, hoodLen);
  const noseStripeGeo = new THREE.BoxGeometry(0.22, 0.025, 0.18);
  const trunkStripeGeo = new THREE.BoxGeometry(0.22, 0.025, 1.18);

  for (const xOff of [-0.19, 0.19]) {
    const hs = new THREE.Mesh(hoodStripeGeo, whiteTrimMat);
    hs.position.set(xOff, hoodMidY, hoodMidZ);
    hs.rotation.x = hoodAngle;
    bodyGroup.add(hs);

    const ns = new THREE.Mesh(noseStripeGeo, whiteTrimMat);
    ns.position.set(xOff, 0.725, halfL - 0.02);
    ns.rotation.x = 0.72;
    bodyGroup.add(ns);

    const ts = new THREE.Mesh(trunkStripeGeo, whiteTrimMat);
    ts.position.set(xOff, 0.945, -1.68);
    bodyGroup.add(ts);
  }

  // Crisp White Horizontal Side Door Accent Line (matching icon!)
  const sideLineGeo = new THREE.BoxGeometry(0.03, 0.038, 1.85);
  const sideDropGeo = new THREE.BoxGeometry(0.03, 0.24, 0.038);
  for (const side of [-1, 1]) {
    const sl = new THREE.Mesh(sideLineGeo, whiteTrimMat);
    sl.position.set(side * (halfW + 0.006), 0.72, -0.34);
    const sd = new THREE.Mesh(sideDropGeo, whiteTrimMat);
    sd.position.set(side * (halfW + 0.006), 0.61, 0.57);
    bodyGroup.add(sl, sd);
  }
  disposables.push(hoodStripeGeo, noseStripeGeo, trunkStripeGeo, sideLineGeo, sideDropGeo);

  // 5. Tinted Coupe Cockpit Canopy + Sleek Red Roof Cap & Crisp Pillars
  const cabinProfile = new THREE.Shape();
  cabinProfile.moveTo(-1.12, 0.86);
  cabinProfile.lineTo(0.84, 0.86);
  cabinProfile.lineTo(0.26, 1.38);
  cabinProfile.lineTo(-0.66, 1.38);
  cabinProfile.closePath();

  const cabinDepth = wid * 0.68;
  const cabinGeo = new THREE.ExtrudeGeometry(cabinProfile, {
    depth: cabinDepth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  cabinGeo.translate(0, 0, -cabinDepth * 0.5);
  cabinGeo.rotateY(-Math.PI / 2);

  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.castShadow = true;
  bodyGroup.add(cabinMesh);

  // Red roof panel + crisp light-catching white-red top highlight
  const roofGeo = new THREE.BoxGeometry(cabinDepth + 0.08, 0.075, 0.98);
  const roofMesh = new THREE.Mesh(roofGeo, redPaintMat);
  roofMesh.position.set(0, 1.41, -0.20);
  bodyGroup.add(roofMesh);

  // Red A-pillars framing the dark glossy windshield (matching icon!)
  const pillarGeo = new THREE.BoxGeometry(0.085, 0.72, 0.085);
  for (const side of [-1, 1]) {
    const aPillar = new THREE.Mesh(pillarGeo, redPaintMat);
    aPillar.position.set(side * (cabinDepth * 0.5 + 0.01), 1.13, 0.54);
    aPillar.rotation.x = -0.84;
    aPillar.rotation.z = side * 0.10;
    bodyGroup.add(aPillar);

    const cPillar = new THREE.Mesh(pillarGeo, redPaintMat);
    cPillar.position.set(side * (cabinDepth * 0.5 + 0.01), 1.12, -0.86);
    cPillar.rotation.x = 0.72;
    cPillar.rotation.z = side * 0.10;
    bodyGroup.add(cPillar);
  }
  disposables.push(cabinGeo, roofGeo, pillarGeo);

  // 6. Iconic High-Mounted CRISP WHITE Rear Spoiler on Black Struts (matching icon!)
  const wingBladeGeo = new THREE.BoxGeometry(wid * 1.02, 0.09, 0.38);
  const wingBlade = new THREE.Mesh(wingBladeGeo, whiteTrimMat);
  wingBlade.position.set(0, 1.32, -halfL + 0.22);
  wingBlade.rotation.x = 0.10;
  wingBlade.castShadow = true;

  const wingStrutGeo = new THREE.BoxGeometry(0.09, 0.44, 0.22);
  const strutL = new THREE.Mesh(wingStrutGeo, darkTrimMat);
  strutL.position.set(-0.56, 1.10, -halfL + 0.24);
  const strutR = new THREE.Mesh(wingStrutGeo, darkTrimMat);
  strutR.position.set(0.56, 1.10, -halfL + 0.24);

  const endplateGeo = new THREE.BoxGeometry(0.075, 0.34, 0.48);
  const endL = new THREE.Mesh(endplateGeo, whiteTrimMat);
  endL.position.set(-(wid * 0.51), 1.33, -halfL + 0.22);
  const endR = new THREE.Mesh(endplateGeo, whiteTrimMat);
  endR.position.set(wid * 0.51, 1.33, -halfL + 0.22);

  bodyGroup.add(wingBlade, strutL, strutR, endL, endR);
  disposables.push(wingBladeGeo, wingStrutGeo, endplateGeo);

  // 7. Chunky Dark Tires + Clean Bright Silver-White Aero-Disc Rims (matching icon!)
  const wheelRadius = 0.40;
  const wheelWidth = 0.34;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x1c2028,
    roughness: 0.88,
    metalness: 0.04,
  });

  const rimOuterGeo = new THREE.CylinderGeometry(wheelRadius * 0.72, wheelRadius * 0.72, wheelWidth + 0.018, 22);
  rimOuterGeo.rotateZ(Math.PI / 2);
  const rimOuterMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.28,
    metalness: 0.55,
  });

  const rimDiscGeo = new THREE.CylinderGeometry(wheelRadius * 0.66, wheelRadius * 0.66, wheelWidth + 0.032, 22);
  rimDiscGeo.rotateZ(Math.PI / 2);
  const rimDiscMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.24,
    metalness: 0.22,
  });

  disposables.push(tireGeo, tireMat, rimOuterGeo, rimOuterMat, rimDiscGeo, rimDiscMat);

  const frontZ = halfL - 0.94;
  const rearZ = -(halfL - 0.94);
  const trackHalf = halfW - 0.05;

  const frontWheels: THREE.Group[] = [];
  const spinWheels: THREE.Object3D[] = [];
  const wheelDefs = [
    { x: -trackHalf, z: frontZ, front: true },
    { x: trackHalf, z: frontZ, front: true },
    { x: -trackHalf, z: rearZ, front: false },
    { x: trackHalf, z: rearZ, front: false },
  ];

  for (const wd of wheelDefs) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wd.x, wheelRadius, wd.z);
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rimOuter = new THREE.Mesh(rimOuterGeo, rimOuterMat);
    const rimDisc = new THREE.Mesh(rimDiscGeo, rimDiscMat);
    spinGroup.add(tire, rimOuter, rimDisc);
    steerPivot.add(spinGroup);
    root.add(steerPivot);
    if (wd.front) frontWheels.push(steerPivot);
    spinWheels.push(spinGroup);
  }

  // 8. Grounded Contact Shadow Plane (zero floating, zero smoke)
  const shadowGeo = new THREE.PlaneGeometry(wid * 1.46, len * 1.22);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.76,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);
  disposables.push(shadowGeo, shadowMat);

  return {
    root,
    bodyGroup,
    frontWheels,
    spinWheels,
    brakeLightMat,
    nitroFlames: [],
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
