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

interface ChassisProfileSpec {
  len: number;
  wid: number;
  sillY: number;
  roofY: number;
  hoodY: number;
  deckY: number;
  frontZ: number;
  rearZ: number;
  frontR: number;
  rearR: number;
  frontGap: number;
  rearGap: number;
  frontW: number;
  rearW: number;
  camber: number;
  liveryHoodStart: number;
  liveryHoodEnd: number;
  liveryRoofStart: number;
  liveryRoofEnd: number;
  liveryDeckStart: number;
  liveryDeckEnd: number;
  wingZ: number;
  wingBaseY: number;
}

const CHASSIS_PROFILES: Record<VehicleConfig['chassisId'], ChassisProfileSpec> = {
  // 1. Muscular JDM Twin-Turbo GT Coupe
  'apex-gtr': {
    len: 4.56,
    wid: 1.94,
    sillY: 0.24,
    roofY: 1.28,
    hoodY: 0.82,
    deckY: 0.90,
    frontZ: 1.38,
    rearZ: -1.36,
    frontR: 0.32,
    rearR: 0.33,
    frontGap: 0.085,
    rearGap: 0.078,
    frontW: 0.25,
    rearW: 0.27,
    camber: 0.015,
    liveryHoodStart: 0.74,
    liveryHoodEnd: 2.04,
    liveryRoofStart: -0.92,
    liveryRoofEnd: 0.24,
    liveryDeckStart: -2.14,
    liveryDeckEnd: -1.34,
    wingZ: -2.04,
    wingBaseY: 0.90,
  },
  // 2. Compact, Short & Nimble Street-Drift Widebody Coupe
  'drift-s15': {
    len: 4.18,
    wid: 1.84,
    sillY: 0.22,
    roofY: 1.24,
    hoodY: 0.77,
    deckY: 0.85,
    frontZ: 1.26,
    rearZ: -1.24,
    frontR: 0.30,
    rearR: 0.31,
    frontGap: 0.082,
    rearGap: 0.075,
    frontW: 0.24,
    rearW: 0.27,
    camber: 0.05,
    liveryHoodStart: 0.66,
    liveryHoodEnd: 1.90,
    liveryRoofStart: -0.82,
    liveryRoofEnd: 0.22,
    liveryDeckStart: -1.96,
    liveryDeckEnd: -1.26,
    wingZ: -1.94,
    wingBaseY: 0.85,
  },
  // 3. Long, Tall, Heavy Widebody American Muscle Car w/ Supercharger & Big Drag Rear Tires
  'vanguard-v8': {
    len: 4.98,
    wid: 2.08,
    sillY: 0.26,
    roofY: 1.40,
    hoodY: 0.90,
    deckY: 0.98,
    frontZ: 1.48,
    rearZ: -1.42,
    frontR: 0.33,
    rearR: 0.38,
    frontGap: 0.088,
    rearGap: 0.085,
    frontW: 0.25,
    rearW: 0.35,
    camber: 0.0,
    liveryHoodStart: 0.80,
    liveryHoodEnd: 2.34,
    liveryRoofStart: -0.88,
    liveryRoofEnd: 0.28,
    liveryDeckStart: -2.36,
    liveryDeckEnd: -1.72,
    wingZ: -2.28,
    wingBaseY: 0.98,
  },
  // 4. Low, Wide Cab-Forward Italian Mid-Engine Wedge Supercar
  'veloce-v12': {
    len: 4.62,
    wid: 2.12,
    sillY: 0.20,
    roofY: 1.12,
    hoodY: 0.62,
    deckY: 0.86,
    frontZ: 1.42,
    rearZ: -1.38,
    frontR: 0.31,
    rearR: 0.34,
    frontGap: 0.080,
    rearGap: 0.076,
    frontW: 0.25,
    rearW: 0.33,
    camber: 0.018,
    liveryHoodStart: 1.06,
    liveryHoodEnd: 2.14,
    liveryRoofStart: -0.34,
    liveryRoofEnd: 0.60,
    liveryDeckStart: -2.14,
    liveryDeckEnd: -0.92,
    wingZ: -2.08,
    wingBaseY: 0.86,
  },
  // 5. Ultra-Wide Homologated FIA GT3 Endurance Race Car
  'stratos-gt3': {
    len: 4.76,
    wid: 2.24,
    sillY: 0.21,
    roofY: 1.18,
    hoodY: 0.78,
    deckY: 0.89,
    frontZ: 1.42,
    rearZ: -1.40,
    frontR: 0.33,
    rearR: 0.35,
    frontGap: 0.085,
    rearGap: 0.080,
    frontW: 0.30,
    rearW: 0.34,
    camber: 0.03,
    liveryHoodStart: 0.82,
    liveryHoodEnd: 2.14,
    liveryRoofStart: -0.64,
    liveryRoofEnd: 0.38,
    liveryDeckStart: -2.18,
    liveryDeckEnd: -1.28,
    wingZ: -2.18,
    wingBaseY: 0.89,
  },
  // 6. Extreme Ultra-Low Open-Channel Le Mans Hypercar Prototype
  'hyperion-proto': {
    len: 5.08,
    wid: 2.22,
    sillY: 0.19,
    roofY: 1.04,
    hoodY: 0.50,
    deckY: 0.74,
    frontZ: 1.54,
    rearZ: -1.52,
    frontR: 0.33,
    rearR: 0.35,
    frontGap: 0.082,
    rearGap: 0.078,
    frontW: 0.29,
    rearW: 0.34,
    camber: 0.02,
    liveryHoodStart: 1.16,
    liveryHoodEnd: 2.38,
    liveryRoofStart: -0.34,
    liveryRoofEnd: 0.56,
    liveryDeckStart: -2.28,
    liveryDeckEnd: -1.16,
    wingZ: -2.32,
    wingBaseY: 0.80,
  },
};

interface WheelArchCutout {
  z: number;
  r: number;      // wheel center Y (= tire radius)
  archR: number;  // desired visible inner arch radius AFTER bevel (= tire radius + air gap)
}

function makeExtrudedProfile(
  points: Array<[number, number]>,
  width: number,
  bevelThickness = 0.04,
  bevelSize = 0.03,
  bevelSegments = 2
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevelThickness > 0 && bevelSize > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
  });
  // Map shape X -> world +Z (front), shape Y -> world +Y (height), extrude Z -> world X (centered)
  geo.translate(0, 0, -width * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an extruded car body or wheel pontoon with REAL semicircular wheel-arch cutouts
 * carved out of its lower side profile, automatically compensating for bevelSize so the
 * final painted fender edge maintains exact visible air clearance around every tire!
 */
function makeBodyWithWheelArches(
  rearBottomZ: number,
  frontBottomZ: number,
  sillY: number,
  upperPointsFrontToRear: Array<[number, number]>,
  arches: WheelArchCutout[],
  width: number,
  bevelThickness = 0.04,
  bevelSize = 0.032,
  bevelSegments = 2
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const sortedArches = [...arches].sort((a, b) => a.z - b.z);

  shape.moveTo(rearBottomZ, sillY);
  for (const arch of sortedArches) {
    // Expand cutout radius by bevelSize so after ExtrudeGeometry bevels inward, the painted rim sits at arch.archR!
    const cutR = arch.archR + bevelSize;
    const dy = THREE.MathUtils.clamp(arch.r - sillY, -cutR * 0.85, cutR * 0.85);
    const dz = Math.sqrt(Math.max(0.002, cutR * cutR - dy * dy));
    const ang = Math.asin(THREE.MathUtils.clamp(dy / cutR, -0.92, 0.92));

    shape.lineTo(arch.z - dz, sillY);
    shape.absarc(arch.z, arch.r, cutR, Math.PI + ang, -ang, true);
  }
  shape.lineTo(frontBottomZ, sillY);

  for (let i = 0; i < upperPointsFrontToRear.length; i++) {
    shape.lineTo(upperPointsFrontToRear[i][0], upperPointsFrontToRear[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevelThickness > 0 && bevelSize > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
    curveSegments: 16,
  });
  geo.translate(0, 0, -width * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a HOLLOW curved fender-flare arch lip that wraps cleanly OUTSIDE the wheel-arch
 * opening (strictly r >= archR), giving widebody cars sculpted arches with zero tire penetration!
 */
function makeHollowArchFlare(
  wheelR: number,
  archR: number,
  sillY: number,
  lipThickness: number,
  depth: number
): THREE.ExtrudeGeometry {
  const rIn = archR + 0.008;
  const rOut = rIn + lipThickness;
  const dyIn = THREE.MathUtils.clamp(wheelR - sillY, -rIn * 0.85, rIn * 0.85);
  const angIn = Math.asin(THREE.MathUtils.clamp(dyIn / rIn, -0.9, 0.9));
  const dyOut = THREE.MathUtils.clamp(wheelR - sillY, -rOut * 0.85, rOut * 0.85);
  const angOut = Math.asin(THREE.MathUtils.clamp(dyOut / rOut, -0.9, 0.9));

  const shape = new THREE.Shape();
  // Outer arc from rear bottom up over top to front bottom (clockwise)
  shape.absarc(0, 0, rOut, Math.PI + angOut, -angOut, true);
  // Inner arc back from front bottom over top to rear bottom (counter-clockwise)
  shape.absarc(0, 0, rIn, -angIn, Math.PI + angIn, false);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: 16,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function getArchSpanHalfZ(wheelR: number, archR: number, sillY: number): number {
  const dy = THREE.MathUtils.clamp(wheelR - sillY, -archR * 0.85, archR * 0.85);
  return Math.sqrt(Math.max(0.01, archR * archR - dy * dy));
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
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const cid = config.chassisId;
  const spec = CHASSIS_PROFILES[cid] ?? CHASSIS_PROFILES['apex-gtr'];
  const halfL = spec.len * 0.5;
  const halfW = spec.wid * 0.5;
  const bevSegs = lowPower ? 1 : 2;

  const frontArchR = spec.frontR + spec.frontGap;
  const rearArchR = spec.rearR + spec.rearGap;
  const frontArchDz = getArchSpanHalfZ(spec.frontR, frontArchR, spec.sillY);
  const rearArchDz = getArchSpanHalfZ(spec.rearR, rearArchR, spec.sillY);

  // Wheel outer sidewall sits cleanly 2.5cm inside outer fender arch; inner tub sits 14cm clear of inner tire wall!
  const frontWheelX = halfW - spec.frontW * 0.5 - 0.025;
  const rearWheelX = halfW - spec.rearW * 0.5 - 0.025;
  const maxWheelW = Math.max(spec.frontW, spec.rearW);
  const innerTubHalfW = Math.max(0.42, halfW - maxWheelW - 0.16);

  // Side skirt spans STRICTLY between rear and front wheel-arch openings (zero tire overlap!)
  const skirtStartZ = spec.rearZ + rearArchDz + 0.02;
  const skirtEndZ = spec.frontZ - frontArchDz - 0.02;
  const skirtLen = Math.max(0.5, skirtEndZ - skirtStartZ);
  const skirtMidZ = (skirtStartZ + skirtEndZ) * 0.5;

  // Front overhang starts strictly ahead of front wheel-arch opening; rear diffuser strictly behind rear arch!
  const frontOverhangStartZ = spec.frontZ + frontArchDz + 0.02;
  const rearOverhangEndZ = spec.rearZ - rearArchDz - 0.02;

  // PBR Car Paint based on finish (lightweight MeshStandardMaterial on mobile for high FPS)
  const paintRoughness =
    config.paintFinish === 'matte' ? 0.62 : config.paintFinish === 'metallic' ? 0.24 : 0.14;
  const paintMetalness =
    config.paintFinish === 'matte' ? 0.18 : config.paintFinish === 'metallic' ? 0.82 : 0.32;
  const clearcoat = config.paintFinish === 'matte' ? 0.05 : 1.0;

  const paintMat = trackMat(
    lowPower
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
        })
  );

  const accentMat = trackMat(
    lowPower
      ? new THREE.MeshStandardMaterial({
          color: new THREE.Color(config.accentColor),
          roughness: 0.26,
          metalness: 0.5,
        })
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(config.accentColor),
          roughness: 0.24,
          metalness: 0.52,
          clearcoat: 0.85,
        })
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x151922,
      roughness: 0.46,
      metalness: 0.34,
    })
  );

  const darkMeshMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x090c12,
      roughness: 0.84,
      metalness: 0.12,
    })
  );

  const linerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0a0d12,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.DoubleSide,
    })
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.14,
      metalness: 0.92,
    })
  );

  const titaniumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.88,
    })
  );

  const glassMat = trackMat(
    lowPower
      ? new THREE.MeshStandardMaterial({
          color: 0x09111d,
          roughness: 0.1,
          metalness: 0.28,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x09111d,
          roughness: 0.07,
          metalness: 0.16,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
        })
  );

  // Chassis-specific headlight tint: warm endurance yellow for Stratos GT3, cyan-laser for Hyperion Proto, crisp LED white for others
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: cid === 'stratos-gt3' ? 0xfef08a : cid === 'hyperion-proto' ? 0xe0f2fe : 0xf8fafc,
      emissive: cid === 'stratos-gt3' ? 0xfacc15 : cid === 'hyperion-proto' ? 0x38bdf8 : 0xe0f2fe,
      emissiveIntensity: cid === 'hyperion-proto' ? 2.4 : 1.95,
      roughness: 0.1,
    })
  );

  const amberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xff8c00,
      emissiveIntensity: 1.7,
      roughness: 0.16,
    })
  );

  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      roughness: 0.18,
    })
  );

  const redAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.3,
      metalness: 0.45,
    })
  );

  const addBox = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    castShadow = !lowPower
  ): THREE.Mesh => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    bodyGroup.add(mesh);
    return mesh;
  };

  const addCyl = (
    rTop: number,
    rBot: number,
    h: number,
    segs: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    castShadow = false
  ): THREE.Mesh => {
    const geo = trackGeo(new THREE.CylinderGeometry(rTop, rBot, h, segs));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = castShadow;
    bodyGroup.add(mesh);
    return mesh;
  };

  // Adds recessed dark inner wheel-well liners curving cleanly ABOVE each tire (never touching the rubber!)
  const addWheelWellLiners = (
    outerEdgeX: number,
    innerEdgeX: number,
    fArchR: number,
    rArchR: number
  ) => {
    const wellDepth = Math.max(0.18, outerEdgeX - innerEdgeX);
    const midX = (outerEdgeX + innerEdgeX) * 0.5;
    const fLinerGeo = trackGeo(
      new THREE.CylinderGeometry(fArchR + 0.008, fArchR + 0.008, wellDepth, 16, 1, true, 0, Math.PI)
    );
    fLinerGeo.rotateZ(Math.PI / 2);

    const rLinerGeo = trackGeo(
      new THREE.CylinderGeometry(rArchR + 0.008, rArchR + 0.008, wellDepth, 16, 1, true, 0, Math.PI)
    );
    rLinerGeo.rotateZ(Math.PI / 2);

    for (const side of [-1, 1]) {
      const fl = new THREE.Mesh(fLinerGeo, linerMat);
      fl.position.set(side * midX, spec.frontR, spec.frontZ);
      bodyGroup.add(fl);

      const rl = new THREE.Mesh(rLinerGeo, linerMat);
      rl.position.set(side * midX, spec.rearR, spec.rearZ);
      bodyGroup.add(rl);
    }
  };

  // Adds hollow curved exterior fender-arch lips strictly OUTSIDE the tire opening
  const addHollowFenderFlares = (
    mat: THREE.Material,
    frontLipThick: number,
    rearLipThick: number,
    flareDepth: number,
    protrudeOut = 0.022
  ) => {
    const fFlareGeo = trackGeo(
      makeHollowArchFlare(spec.frontR, frontArchR, spec.sillY, frontLipThick, flareDepth)
    );
    const rFlareGeo = trackGeo(
      makeHollowArchFlare(spec.rearR, rearArchR, spec.sillY, rearLipThick, flareDepth)
    );
    for (const side of [-1, 1]) {
      const fx = side * (halfW - flareDepth * 0.5 + protrudeOut);
      const ff = new THREE.Mesh(fFlareGeo, mat);
      ff.position.set(fx, spec.frontR, spec.frontZ);
      ff.castShadow = !lowPower;
      ff.receiveShadow = true;
      bodyGroup.add(ff);

      const rf = new THREE.Mesh(rFlareGeo, mat);
      rf.position.set(fx, spec.rearR, spec.rearZ);
      rf.castShadow = !lowPower;
      rf.receiveShadow = true;
      bodyGroup.add(rf);
    }
  };

  // Recessed Matte-Black Inner Chassis Tub (strictly narrower than all 4 wheels — gives realistic shadowed wheel wells!)
  addBox(innerTubHalfW * 2, 0.34, spec.len - 0.44, darkMeshMat, 0, spec.sillY + 0.18, 0, 0, 0, 0, false);

  // Exhaust tip positions collected per chassis so nitro flames match every car's unique exhaust layout!
  const exhaustOutlets: Array<{ x: number; y: number; z: number; rx?: number; ry?: number; scale?: number }> = [];

  // =========================================================================
  // 1. CHASSIS-SPECIFIC SCULPTED BODYWORK WITH CARVED WHEEL-ARCH CUTOUTS
  // =========================================================================
  const bothArches: WheelArchCutout[] = [
    { z: spec.rearZ, r: spec.rearR, archR: rearArchR },
    { z: spec.frontZ, r: spec.frontR, archR: frontArchR },
  ];

  if (cid === 'apex-gtr') {
    // --- APEX GT-R: Muscular JDM Twin-Turbo GT Coupe ---
    const bev = 0.036;
    const hullGeo = trackGeo(
      makeBodyWithWheelArches(
        -halfL,
        halfL - 0.08,
        spec.sillY,
        [
          [halfL + 0.04, 0.38],
          [halfL - 0.04, 0.72],
          [spec.frontZ, 0.82],
          [0.72, 0.84],
          [-1.06, 0.88],
          [-halfL + 0.06, 0.90],
          [-halfL, 0.72],
        ],
        bothArches,
        spec.wid - bev * 2,
        0.04,
        bev,
        bevSegs
      )
    );
    const hull = new THREE.Mesh(hullGeo, paintMat);
    hull.castShadow = !lowPower;
    hull.receiveShadow = true;
    bodyGroup.add(hull);

    addWheelWellLiners(halfW - 0.03, innerTubHalfW, frontArchR, rearArchR);
    addHollowFenderFlares(paintMat, 0.065, 0.075, 0.06, 0.018);

    // Lower carbon aero side skirts (strictly between wheel arches!) & side fender vents
    for (const side of [-1, 1]) {
      addBox(0.14, 0.08, skirtLen, carbonMat, side * (halfW - 0.05), spec.sillY - 0.01, skirtMidZ, 0, 0, 0, false);
      addBox(0.05, 0.22, 0.26, darkMeshMat, side * (halfW - 0.01), 0.56, 0.62, 0, 0, 0, false);
    }

    // Classic JDM Notchback GT Coupe Greenhouse
    const cabinGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-1.34, 0.86],
          [0.74, 0.82],
          [0.24, spec.roofY],
          [-0.90, spec.roofY],
        ],
        spec.wid * 0.72,
        0.04,
        0.035,
        bevSegs
      )
    );
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.castShadow = !lowPower;
    bodyGroup.add(cabin);

    addBox(spec.wid * 0.70, 0.065, 1.14, paintMat, 0, spec.roofY + 0.015, -0.33);
    for (const side of [-1, 1]) {
      addBox(0.08, 0.48, 0.10, paintMat, side * (spec.wid * 0.365), 1.05, 0.46, -0.78, 0, side * 0.12);
      addBox(0.10, 0.50, 0.16, paintMat, side * (spec.wid * 0.365), 1.07, -1.10, 0.72, 0, side * 0.10);
      addBox(0.19, 0.08, 0.14, paintMat, side * (spec.wid * 0.48), 0.92, 0.54, 0, side * -0.18, 0, false);
    }

    // Twin NACA Hood Ducts
    for (const side of [-1, 1]) {
      addBox(0.22, 0.04, 0.42, darkMeshMat, side * 0.34, 0.83, 1.32, 0.08, 0, 0, false);
    }

    // Front Splitter (strictly ahead of front wheel arch!) + GT-R Grille + Silver Intercooler
    const splitDepth = Math.max(0.24, halfL + 0.06 - frontOverhangStartZ);
    addBox(spec.wid + 0.04, 0.055, splitDepth, carbonMat, 0, 0.21, frontOverhangStartZ + splitDepth * 0.5);
    addBox(1.10, 0.30, 0.08, darkMeshMat, 0, 0.45, halfL + 0.02, 0, 0, 0, false);
    addBox(0.86, 0.20, 0.06, chromeMat, 0, 0.42, halfL + 0.04, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      addBox(0.42, 0.11, 0.24, headlightMat, side * (halfW - 0.34), 0.67, halfL - 0.10, 0.16, side * 0.14, 0, false);
      addBox(0.14, 0.16, 0.08, darkMeshMat, side * (halfW - 0.22), 0.44, halfL + 0.01, 0, 0, 0, false);
    }

    // Iconic QUAD ROUND Glowing Red GT-R Afterburner Taillights!
    addBox(spec.wid - 0.22, 0.24, 0.08, darkMeshMat, 0, 0.73, -halfL - 0.01, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      addCyl(0.095, 0.095, 0.07, 16, brakeLightMat, side * 0.64, 0.74, -halfL - 0.03, Math.PI / 2);
      addCyl(0.076, 0.076, 0.07, 16, brakeLightMat, side * 0.42, 0.74, -halfL - 0.03, Math.PI / 2);
    }

    // Rear Carbon Diffuser (strictly behind rear wheel arch!) + Quad Titanium Exhausts
    const diffDepth = Math.max(0.22, rearOverhangEndZ - (-halfL - 0.02));
    addBox(spec.wid - 0.22, 0.22, diffDepth, carbonMat, 0, 0.26, -halfL + diffDepth * 0.5);
    for (let f = -2; f <= 2; f++) {
      addBox(0.035, 0.18, diffDepth + 0.04, carbonMat, f * 0.26, 0.23, -halfL + diffDepth * 0.5 - 0.02, 0, 0, 0, false);
    }
    for (const xPos of [-0.56, -0.40, 0.40, 0.56]) {
      addCyl(0.056, 0.056, 0.22, 12, titaniumMat, xPos, 0.27, -halfL - 0.04, Math.PI / 2);
      exhaustOutlets.push({ x: xPos, y: 0.27, z: -halfL - 0.14, scale: 0.9 });
    }
  } else if (cid === 'drift-s15') {
    // --- KURO S15 SPEC: Compact Short Street-Drift Widebody Coupe ---
    const bev = 0.032;
    const hullGeo = trackGeo(
      makeBodyWithWheelArches(
        -halfL,
        halfL - 0.06,
        spec.sillY,
        [
          [halfL + 0.04, 0.36],
          [halfL - 0.06, 0.66],
          [spec.frontZ, 0.77],
          [0.64, 0.79],
          [-1.12, 0.83],
          [-halfL + 0.04, 0.85],
          [-halfL, 0.68],
        ],
        bothArches,
        spec.wid - bev * 2 - 0.04,
        0.036,
        bev,
        bevSegs
      )
    );
    const hull = new THREE.Mesh(hullGeo, paintMat);
    hull.castShadow = !lowPower;
    hull.receiveShadow = true;
    bodyGroup.add(hull);

    addWheelWellLiners(halfW - 0.02, innerTubHalfW, frontArchR, rearArchR);
    // Signature Rocket-Bunny Riveted Widebody Overfender Flares (100% HOLLOW inside — zero tire overlap!)
    addHollowFenderFlares(paintMat, 0.095, 0.105, 0.095, 0.035);
    addHollowFenderFlares(carbonMat, 0.024, 0.024, 0.105, 0.042);

    // Aggressive drift side skirts strictly between wheel arches + rear canard fin
    for (const side of [-1, 1]) {
      addBox(0.18, 0.08, skirtLen, carbonMat, side * (halfW - 0.04), spec.sillY - 0.01, skirtMidZ, 0, 0, 0, false);
      addBox(0.05, 0.18, 0.28, accentMat, side * (halfW + 0.03), 0.29, skirtStartZ + 0.16, 0, 0, 0, false);
    }

    // Sleek Compact Fastback Drift Greenhouse
    const cabinGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-1.32, 0.81],
          [0.70, 0.77],
          [0.22, spec.roofY],
          [-0.80, spec.roofY],
        ],
        spec.wid * 0.74,
        0.04,
        0.035,
        bevSegs
      )
    );
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.castShadow = !lowPower;
    bodyGroup.add(cabin);
    addBox(spec.wid * 0.70, 0.06, 1.00, paintMat, 0, spec.roofY + 0.01, -0.29);

    for (const side of [-1, 1]) {
      addBox(0.17, 0.07, 0.12, carbonMat, side * (spec.wid * 0.46), 0.86, 0.48, 0, side * -0.22, 0, false);
    }

    // Carbon Vented Drift Hood Insert with Louver Slats
    addBox(0.90, 0.04, 0.94, carbonMat, 0, 0.76, 1.24, 0.11, 0, 0, false);
    for (let s = 0; s < 3; s++) {
      addBox(0.66, 0.03, 0.09, darkMeshMat, 0, 0.785 - s * 0.022, 1.12 + s * 0.18, 0.16, 0, 0, false);
    }

    // Giant Front-Mount Intercooler Cutout + Exposed Chrome FMIC Core + Red Drift Tow Strap
    const splitDepth = Math.max(0.22, halfL + 0.06 - frontOverhangStartZ);
    addBox(spec.wid + 0.06, 0.055, splitDepth, carbonMat, 0, 0.19, frontOverhangStartZ + splitDepth * 0.5);
    addBox(1.06, 0.28, 0.10, darkMeshMat, 0, 0.40, halfL + 0.01, 0, 0, 0, false);
    addBox(0.92, 0.22, 0.08, chromeMat, 0, 0.39, halfL + 0.04, 0, 0, 0, false);
    addBox(0.09, 0.03, 0.18, redAccentMat, 0.56, 0.27, halfL + 0.10, 0.22, 0, 0, false);

    // Swept Cat-Eye JDM Headlights + Glowing Amber Corner Indicators
    for (const side of [-1, 1]) {
      addBox(0.36, 0.10, 0.26, headlightMat, side * (halfW - 0.34), 0.63, halfL - 0.10, 0.18, side * 0.24, 0, false);
      addBox(0.12, 0.10, 0.18, amberMat, side * (halfW - 0.14), 0.61, halfL - 0.18, 0.16, side * 0.30, 0, false);
    }

    // Wide Dual-Tier JDM Taillights + Rear Tow Hook + Single Angled Drift-Cannon Exhaust
    for (const side of [-1, 1]) {
      addBox(0.56, 0.13, 0.08, brakeLightMat, side * 0.52, 0.69, -halfL - 0.01, 0, 0, 0, false);
      addBox(0.46, 0.045, 0.085, headlightMat, side * 0.50, 0.61, -halfL - 0.01, 0, 0, 0, false);
    }
    addBox(0.08, 0.08, 0.12, redAccentMat, -0.44, 0.24, -halfL - 0.04, 0, 0, 0, false);

    const diffDepth = Math.max(0.20, rearOverhangEndZ - (-halfL - 0.02));
    addBox(spec.wid - 0.26, 0.18, diffDepth, carbonMat, 0, 0.24, -halfL + diffDepth * 0.5);
    addCyl(0.088, 0.096, 0.34, 14, titaniumMat, 0.54, 0.26, -halfL - 0.06, Math.PI / 2 - 0.10, -0.22, 0);
    exhaustOutlets.push({ x: 0.56, y: 0.27, z: -halfL - 0.18, ry: -0.22, scale: 1.45 });
  } else if (cid === 'vanguard-v8') {
    // --- VANGUARD GT V8: Tall, Long, Heavy Widebody American Muscle Beast ---
    const bev = 0.036;
    const hullGeo = trackGeo(
      makeBodyWithWheelArches(
        -halfL,
        halfL - 0.04,
        spec.sillY,
        [
          [halfL + 0.04, 0.44],
          [halfL + 0.02, 0.83], // Tall bluff vertical American muscle nose!
          [spec.frontZ, 0.89],
          [0.78, 0.91],         // Long flat imposing muscle hood
          [-0.78, 0.94],        // Rising muscular Coke-bottle rear haunch!
          [spec.rearZ, 0.99],
          [-halfL + 0.04, 0.98],
          [-halfL, 0.72],
        ],
        bothArches,
        spec.wid - bev * 2,
        0.042,
        bev,
        bevSegs
      )
    );
    const hull = new THREE.Mesh(hullGeo, paintMat);
    hull.castShadow = !lowPower;
    hull.receiveShadow = true;
    bodyGroup.add(hull);

    addWheelWellLiners(halfW - 0.02, innerTubHalfW, frontArchR, rearArchR);
    addHollowFenderFlares(paintMat, 0.075, 0.095, 0.07, 0.022);

    // Lower muscle rocker trim strictly between wheel arches
    for (const side of [-1, 1]) {
      addBox(0.14, 0.10, skirtLen, carbonMat, side * (halfW - 0.05), spec.sillY - 0.01, skirtMidZ, 0, 0, 0, false);
    }

    // SIGNATURE CENTERPIECE: Giant Exposed Chrome V8 Supercharger Blower on the Hood!
    addBox(0.62, 0.22, 0.82, chromeMat, 0, 1.00, 1.38);
    for (const side of [-1, 1]) {
      addBox(0.06, 0.18, 0.74, titaniumMat, side * 0.32, 1.01, 1.38, 0, 0, 0, false);
    }
    addCyl(0.07, 0.08, 0.26, 12, titaniumMat, 0, 1.00, 1.88, Math.PI / 2);
    addCyl(0.10, 0.10, 0.05, 14, chromeMat, 0, 1.00, 2.00, Math.PI / 2);
    addBox(0.56, 0.14, 0.42, chromeMat, 0, 1.17, 1.44);
    for (const bx of [-0.16, 0, 0.16]) {
      addCyl(0.055, 0.055, 0.08, 12, redAccentMat, bx, 1.17, 1.64, Math.PI / 2);
    }

    // Upright Fastback Muscle Greenhouse + Slatted Black Rear Window Louvers
    const cabinGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-1.82, 0.96],
          [0.74, 0.90],
          [0.28, spec.roofY],
          [-0.86, spec.roofY],
        ],
        spec.wid * 0.74,
        0.045,
        0.04,
        bevSegs
      )
    );
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.castShadow = !lowPower;
    bodyGroup.add(cabin);
    addBox(spec.wid * 0.72, 0.075, 1.14, paintMat, 0, spec.roofY + 0.015, -0.29);

    for (const side of [-1, 1]) {
      addBox(0.11, 0.56, 0.22, paintMat, side * (spec.wid * 0.375), 1.16, -1.26, 0.92, 0, side * 0.06);
      addBox(0.20, 0.09, 0.14, chromeMat, side * (spec.wid * 0.48), 1.00, 0.52, 0, side * -0.12, 0, false);
    }
    for (let lv = 0; lv < 4; lv++) {
      const t = lv / 3;
      addBox(spec.wid * 0.62, 0.035, 0.16, carbonMat, 0, 1.31 - t * 0.28, -0.96 - t * 0.64, 0.22, 0, 0, false);
    }

    // Deep Recessed Full-Width Black Muscle Grille + QUAD ROUND Headlights!
    addBox(spec.wid - 0.18, 0.32, 0.10, darkMeshMat, 0, 0.64, halfL + 0.01, 0, 0, 0, false);
    addBox(spec.wid - 0.10, 0.05, 0.14, chromeMat, 0, 0.82, halfL + 0.01, 0, 0, 0, false);
    addBox(spec.wid - 0.10, 0.09, 0.22, chromeMat, 0, 0.36, halfL + 0.02, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      addCyl(0.092, 0.092, 0.08, 16, headlightMat, side * 0.76, 0.64, halfL + 0.04, Math.PI / 2);
      addCyl(0.082, 0.082, 0.08, 16, headlightMat, side * 0.54, 0.64, halfL + 0.04, Math.PI / 2);
      addBox(0.18, 0.06, 0.06, amberMat, side * 0.76, 0.46, halfL + 0.04, 0, 0, 0, false);
    }

    // Rear Blackout Panel + Six Sequential Vertical Muscle Taillight Blades + Chunky Quad Exhausts
    addBox(spec.wid - 0.20, 0.28, 0.08, darkMeshMat, 0, 0.77, -halfL - 0.01, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      for (const offset of [0.44, 0.60, 0.76]) {
        addBox(0.075, 0.22, 0.07, brakeLightMat, side * offset, 0.77, -halfL - 0.03, 0, 0, 0, false);
      }
    }
    const diffDepth = Math.max(0.24, rearOverhangEndZ - (-halfL - 0.02));
    addBox(spec.wid - 0.18, 0.22, diffDepth, carbonMat, 0, 0.31, -halfL + diffDepth * 0.5);
    for (const xPos of [-0.66, -0.48, 0.48, 0.66]) {
      addCyl(0.068, 0.068, 0.26, 12, chromeMat, xPos, 0.31, -halfL - 0.05, Math.PI / 2);
      exhaustOutlets.push({ x: xPos, y: 0.31, z: -halfL - 0.16, scale: 1.05 });
    }
  } else if (cid === 'veloce-v12') {
    // --- VELOCE V12: Low Knife-Edge Cab-Forward Italian Mid-Engine Exotic ---
    // Sculpted Exotic Architecture: low central wedge nose (inside innerTubHalfW!) flanked by taller curved fender haunches with real wheel arches!
    const bev = 0.03;
    // 1) Central knife-edge exotic fuselage (narrower than wheels so nose dips ultra-low!)
    const centerGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-halfL, 0.22],
          [halfL - 0.08, 0.18],
          [halfL + 0.08, 0.28],
          [halfL - 0.14, 0.50],
          [1.06, 0.64],
          [-0.78, 0.84],
          [-halfL + 0.04, 0.85],
          [-halfL, 0.64],
        ],
        innerTubHalfW * 2 + 0.04,
        0.035,
        0.03,
        bevSegs
      )
    );
    const centerHull = new THREE.Mesh(centerGeo, paintMat);
    centerHull.castShadow = !lowPower;
    centerHull.receiveShadow = true;
    bodyGroup.add(centerHull);

    // 2) Left & Right Sculpted Exotic Fender Side-Bodies with Carved Semicircular Wheel Arches!
    const sideWidth = halfW - innerTubHalfW - bev;
    const sideGeo = trackGeo(
      makeBodyWithWheelArches(
        -halfL,
        halfL - 0.08,
        spec.sillY,
        [
          [halfL + 0.04, 0.34],
          [halfL - 0.14, 0.62],
          [spec.frontZ, 0.77],  // Sculpted Italian front fender crest arching cleanly over front tire!
          [0.72, 0.72],
          [-0.52, 0.80],
          [spec.rearZ, 0.88],   // Sculpted mid-engine rear haunch arching cleanly over rear tire!
          [-halfL + 0.04, 0.86],
          [-halfL, 0.64],
        ],
        bothArches,
        Math.max(0.20, sideWidth - bev),
        0.035,
        bev,
        bevSegs
      )
    );
    for (const side of [-1, 1]) {
      const sideBody = new THREE.Mesh(sideGeo, paintMat);
      sideBody.position.x = side * (innerTubHalfW + sideWidth * 0.5);
      sideBody.castShadow = !lowPower;
      sideBody.receiveShadow = true;
      bodyGroup.add(sideBody);

      // Giant angular carbon side air-intake scoops strictly between front & rear arches!
      addBox(0.14, 0.36, 0.66, carbonMat, side * (halfW - 0.04), 0.54, -0.34, 0, side * 0.14, 0);
      addBox(0.08, 0.28, 0.24, darkMeshMat, side * (halfW - 0.02), 0.54, -0.06, 0, side * 0.10, 0, false);
      // Low razor carbon side splitter strictly between wheel arches
      addBox(0.20, 0.055, skirtLen, carbonMat, side * (halfW - 0.04), spec.sillY - 0.01, skirtMidZ, 0, 0, 0, false);
      addBox(0.18, 0.06, 0.12, paintMat, side * (spec.wid * 0.44), 0.80, 0.80, 0, side * -0.25, 0, false);
    }

    addWheelWellLiners(halfW - 0.02, innerTubHalfW, frontArchR, rearArchR);

    // Cab-Forward Teardrop Supercar Cockpit
    const cabinGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-0.86, 0.80],
          [1.08, 0.62],
          [0.44, spec.roofY],
          [-0.36, spec.roofY],
        ],
        spec.wid * 0.62,
        0.04,
        0.035,
        bevSegs
      )
    );
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.castShadow = !lowPower;
    bodyGroup.add(cabin);
    addBox(spec.wid * 0.56, 0.05, 0.78, paintMat, 0, spec.roofY + 0.01, 0.05);

    // SIGNATURE CENTERPIECE: Slatted V12 Rear Engine Bay Cover w/ Glowing Red V12 Intake Plenums!
    addBox(0.94, 0.06, 1.18, darkMeshMat, 0, 0.84, -1.36, 0.03, 0, 0, false);
    for (const side of [-1, 1]) {
      addBox(0.22, 0.09, 0.88, redAccentMat, side * 0.22, 0.85, -1.34, 0.03, 0, 0, false);
      addBox(0.06, 0.10, 0.82, chromeMat, side * 0.22, 0.86, -1.34, 0.03, 0, 0, false);
    }
    for (let s = 0; s < 4; s++) {
      addBox(0.90, 0.025, 0.14, carbonMat, 0, 0.91 - s * 0.014, -0.96 - s * 0.26, 0.16, 0, 0, false);
    }

    // Razor Front Splitter (strictly ahead of front wheel arch!) + Y-LED Headlights!
    const splitDepth = Math.max(0.24, halfL + 0.08 - frontOverhangStartZ);
    addBox(spec.wid + 0.06, 0.05, splitDepth, carbonMat, 0, 0.17, frontOverhangStartZ + splitDepth * 0.5);
    for (const side of [-1, 1]) {
      addBox(0.56, 0.18, 0.12, darkMeshMat, side * 0.52, 0.29, halfL - 0.02, 0, side * 0.18, 0, false);
      addBox(0.42, 0.055, 0.14, headlightMat, side * (halfW - 0.34), 0.52, halfL - 0.12, 0.18, side * 0.34, 0, false);
      addBox(0.22, 0.045, 0.12, headlightMat, side * (halfW - 0.20), 0.46, halfL - 0.06, 0.18, side * -0.22, 0, false);
    }

    // Rear Exotic Y-Taillights + CENTRAL TRIPLE-PIPE EXHAUST CLUSTER!
    addBox(spec.wid - 0.22, 0.22, 0.08, darkMeshMat, 0, 0.67, -halfL - 0.01, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      addBox(0.50, 0.06, 0.08, brakeLightMat, side * 0.60, 0.71, -halfL - 0.02, 0, 0, side * 0.12, false);
      addBox(0.26, 0.05, 0.08, brakeLightMat, side * 0.74, 0.63, -halfL - 0.02, 0, 0, side * -0.28, false);
    }
    const diffDepth = Math.max(0.24, rearOverhangEndZ - (-halfL - 0.02));
    addBox(spec.wid - 0.20, 0.24, diffDepth, carbonMat, 0, 0.24, -halfL + diffDepth * 0.5);
    for (let f = -3; f <= 3; f++) {
      if (f === 0) continue;
      addBox(0.035, 0.20, diffDepth + 0.04, carbonMat, f * 0.24, 0.22, -halfL + diffDepth * 0.5 - 0.02, 0, 0, 0, false);
    }
    for (const xPos of [-0.14, 0, 0.14]) {
      addCyl(0.052, 0.052, 0.24, 12, titaniumMat, xPos, 0.35, -halfL - 0.05, Math.PI / 2);
      exhaustOutlets.push({ x: xPos, y: 0.35, z: -halfL - 0.15, scale: 0.95 });
    }
  } else if (cid === 'stratos-gt3') {
    // --- STRATOS GT3: Ultra-Wide Homologated FIA GT3 Endurance Track Weapon ---
    const bev = 0.03;
    const hullGeo = trackGeo(
      makeBodyWithWheelArches(
        -halfL,
        halfL - 0.10,
        spec.sillY,
        [
          [halfL + 0.06, 0.32],
          [halfL - 0.08, 0.66],
          [spec.frontZ, 0.83],  // Tall boxy vented GT3 front wheel arches!
          [0.78, 0.79],
          [-0.86, 0.86],
          [spec.rearZ, 0.90],
          [-halfL + 0.04, 0.89],
          [-halfL, 0.68],
        ],
        bothArches,
        spec.wid - bev * 2,
        0.038,
        bev,
        bevSegs
      )
    );
    const hull = new THREE.Mesh(hullGeo, paintMat);
    hull.castShadow = !lowPower;
    hull.receiveShadow = true;
    bodyGroup.add(hull);

    addWheelWellLiners(halfW - 0.02, innerTubHalfW, frontArchR, rearArchR);
    addHollowFenderFlares(carbonMat, 0.055, 0.065, 0.07, 0.022);

    // Top-Arch Louver Vent Gills, Front Canards, Side Skirts (between arches!) & Carbon Mirrors
    for (const side of [-1, 1]) {
      for (let g = 0; g < 3; g++) {
        addBox(0.24, 0.03, 0.10, darkMeshMat, side * (halfW - 0.22), 0.835, spec.frontZ + 0.14 - g * 0.16, 0.12, 0, 0, false);
      }
      // Double-stacked carbon front bumper dive-plane canards strictly on front overhang!
      addBox(0.20, 0.035, 0.30, carbonMat, side * (halfW + 0.04), 0.34, halfL - 0.24, 0.18, side * 0.14, side * -0.12, false);
      addBox(0.18, 0.035, 0.24, accentMat, side * (halfW + 0.03), 0.45, halfL - 0.28, 0.22, side * 0.14, side * -0.10, false);
      // Deep race side-skirt aero floor strictly between wheel arches!
      addBox(0.24, 0.08, skirtLen, carbonMat, side * (halfW - 0.05), spec.sillY - 0.01, skirtMidZ, 0, 0, 0, false);
      addBox(0.04, 0.22, 0.42, accentMat, side * (halfW + 0.04), 0.31, skirtEndZ - 0.24, 0, 0, 0, false);
      addBox(0.18, 0.07, 0.12, carbonMat, side * (spec.wid * 0.44), 0.86, 0.54, 0, side * -0.16, 0, false);
    }

    // Slammed GT3 Endurance Greenhouse + Windshield Race Sun-Strip + Roof Airbox Scoop!
    const cabinGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-1.32, 0.84],
          [0.80, 0.77],
          [0.36, spec.roofY],
          [-0.64, spec.roofY],
        ],
        spec.wid * 0.62,
        0.04,
        0.035,
        bevSegs
      )
    );
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.castShadow = !lowPower;
    bodyGroup.add(cabin);
    addBox(spec.wid * 0.58, 0.055, 1.00, paintMat, 0, spec.roofY + 0.01, -0.14);
    addBox(spec.wid * 0.58, 0.12, 0.10, accentMat, 0, spec.roofY - 0.07, 0.43, -0.78, 0, 0, false);

    // Roof-mounted carbon airbox intake snorkel
    addBox(0.28, 0.14, 0.56, carbonMat, 0, spec.roofY + 0.08, 0.04);
    addBox(0.22, 0.09, 0.06, darkMeshMat, 0, spec.roofY + 0.08, 0.32, 0, 0, 0, false);

    // Central Rear Aerodynamic Stabilizer Shark Fin
    const finGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-1.96, 0.84],
          [-0.62, 0.96],
          [-0.62, 1.18],
          [-1.96, 0.96],
        ],
        0.045,
        0.005,
        0.005,
        1
      )
    );
    const fin = new THREE.Mesh(finGeo, carbonMat);
    bodyGroup.add(fin);

    // Massive Protruding Carbon Front Splitter (strictly ahead of front wheel arch!) + Turnbuckle Rods + Yellow GT3 Headlights
    const splitDepth = Math.max(0.32, halfL + 0.24 - frontOverhangStartZ);
    addBox(spec.wid + 0.14, 0.055, splitDepth, carbonMat, 0, 0.17, frontOverhangStartZ + splitDepth * 0.5);
    addBox(spec.wid + 0.16, 0.03, 0.08, accentMat, 0, 0.19, halfL + 0.22, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      addCyl(0.016, 0.016, 0.26, 8, chromeMat, side * 0.42, 0.30, halfL + 0.12, -0.26);
      addBox(0.42, 0.13, 0.24, headlightMat, side * (halfW - 0.38), 0.58, halfL - 0.10, 0.18, side * 0.16, 0, false);
    }
    addBox(1.18, 0.26, 0.08, darkMeshMat, 0, 0.36, halfL + 0.01, 0, 0, 0, false);
    addBox(0.84, 0.05, 0.54, darkMeshMat, 0, 0.77, 1.48, 0.10, 0, 0, false);

    // Rear Full-Width Racing LED Bar + Massive 6-Strake Diffuser (strictly behind rear arch!) + Red FIA Rain Light
    addBox(spec.wid - 0.26, 0.09, 0.08, brakeLightMat, 0, 0.74, -halfL - 0.01, 0, 0, 0, false);
    const diffDepth = Math.max(0.28, rearOverhangEndZ - (-halfL - 0.04));
    addBox(spec.wid - 0.14, 0.28, diffDepth, carbonMat, 0, 0.26, -halfL + diffDepth * 0.5 - 0.02);
    for (let f = -3; f <= 3; f++) {
      if (f === 0) continue;
      addBox(0.04, 0.24, diffDepth + 0.04, carbonMat, f * 0.27, 0.24, -halfL + diffDepth * 0.5 - 0.04, 0, 0, 0, false);
    }
    addBox(0.08, 0.16, 0.07, brakeLightMat, 0, 0.33, -halfL - 0.06, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      addCyl(0.068, 0.068, 0.24, 12, titaniumMat, side * 0.58, 0.29, -halfL - 0.08, Math.PI / 2);
      exhaustOutlets.push({ x: side * 0.58, y: 0.29, z: -halfL - 0.18, scale: 1.15 });
    }
  } else {
    // --- HYPERION PROTO: Extreme Ultra-Low Open-Channel Le Mans Prototype Hypercar ---
    const bev = 0.028;

    // 1. Ground-Effect Underfloor Plank (narrowed through wheel wells, wide only between axles!)
    addBox(spec.wid - 0.12, 0.065, skirtLen, carbonMat, 0, 0.17, skirtMidZ);
    addBox(innerTubHalfW * 2, 0.065, spec.len - 0.16, carbonMat, 0, 0.17, 0.02);

    // 2. Narrow Central Monocoque Fuselage (strictly inside innerTubHalfW — 100% clear of all 4 wheels!)
    const monoGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-halfL + 0.08, 0.20],
          [halfL + 0.08, 0.19],
          [halfL + 0.04, 0.34],
          [1.22, 0.52],
          [0.72, 0.66],
          [-0.96, 0.72],
          [-halfL + 0.06, 0.70],
          [-halfL, 0.50],
        ],
        Math.min(spec.wid * 0.44, innerTubHalfW * 1.92),
        0.04,
        0.032,
        bevSegs
      )
    );
    const mono = new THREE.Mesh(monoGeo, paintMat);
    mono.castShadow = !lowPower;
    mono.receiveShadow = true;
    bodyGroup.add(mono);

    // 3. Narrow Fighter-Jet Teardrop Bubble Glass Canopy!
    const canopyGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-0.98, 0.68],
          [0.98, 0.58],
          [0.42, spec.roofY],
          [-0.36, spec.roofY],
        ],
        spec.wid * 0.42,
        0.045,
        0.04,
        bevSegs
      )
    );
    const canopy = new THREE.Mesh(canopyGeo, glassMat);
    canopy.castShadow = !lowPower;
    bodyGroup.add(canopy);
    addBox(0.32, 0.05, 0.78, paintMat, 0, spec.roofY + 0.015, 0.02);
    addBox(0.24, 0.09, 0.24, carbonMat, 0, spec.roofY + 0.04, -0.34);

    // 4. Four Towering Sculpted LMP Wheel Pontoon Pods WITH REAL CARVED SEMICIRCULAR WHEEL ARCHES!
    const podWidth = Math.max(0.34, halfW - innerTubHalfW - 0.06);
    const frontPodGeo = trackGeo(
      makeBodyWithWheelArches(
        0.62,
        halfL - 0.04,
        spec.sillY,
        [
          [halfL + 0.06, 0.38],
          [halfL - 0.14, 0.70],
          [spec.frontZ, 0.85], // Towering sculpted front LMP wheel arch crest cleanly above tire!
          [0.82, 0.72],
          [0.62, 0.42],
        ],
        [{ z: spec.frontZ, r: spec.frontR, archR: frontArchR }],
        podWidth - bev * 2,
        0.034,
        bev,
        bevSegs
      )
    );
    const rearPodGeo = trackGeo(
      makeBodyWithWheelArches(
        -halfL,
        -0.56,
        spec.sillY,
        [
          [-0.64, 0.66],
          [spec.rearZ, 0.88], // Towering sculpted rear LMP wheel arch crest cleanly above tire!
          [-halfL + 0.10, 0.82],
          [-halfL, 0.62],
        ],
        [{ z: spec.rearZ, r: spec.rearR, archR: rearArchR }],
        podWidth - bev * 2,
        0.034,
        bev,
        bevSegs
      )
    );

    const podCenterX = halfW - podWidth * 0.5;
    for (const side of [-1, 1]) {
      const fPod = new THREE.Mesh(frontPodGeo, paintMat);
      fPod.position.x = side * podCenterX;
      fPod.castShadow = !lowPower;
      fPod.receiveShadow = true;
      bodyGroup.add(fPod);

      const rPod = new THREE.Mesh(rearPodGeo, paintMat);
      rPod.position.x = side * podCenterX;
      rPod.castShadow = !lowPower;
      rPod.receiveShadow = true;
      bodyGroup.add(rPod);

      // Sculpted matte-carbon sidepod bridges strictly between front & rear wheel openings!
      addBox(0.34, 0.28, skirtLen, carbonMat, side * (halfW - 0.34), 0.36, skirtMidZ);
      addBox(0.05, 0.24, skirtLen * 0.90, accentMat, side * (halfW - 0.04), 0.29, skirtMidZ, 0, 0, 0, false);

      // Futuristic Cyan-White Razor Laser Blade Headlights tracing front pontoon leading edges!
      addBox(0.10, 0.05, 0.56, headlightMat, side * podCenterX, 0.63, halfL - 0.34, 0.38, side * 0.08, 0, false);
      addBox(0.34, 0.045, 0.09, headlightMat, side * podCenterX, 0.44, halfL + 0.02, 0, side * 0.12, 0, false);

      // Floating Split Rear Red Laser Tail-Blades
      addBox(0.54, 0.055, 0.08, brakeLightMat, side * podCenterX, 0.70, -halfL - 0.02, 0, 0, side * -0.06, false);
      addBox(0.06, 0.36, 0.08, brakeLightMat, side * (halfW - 0.05), 0.53, -halfL - 0.02, 0, 0, 0, false);
    }

    addWheelWellLiners(halfW - 0.02, innerTubHalfW, frontArchR, rearArchR);

    // 5. Suspended Carbon Front Aero Wing Bridge across sunken nose (strictly ahead of front tires!)
    const splitDepth = Math.max(0.28, halfL + 0.16 - frontOverhangStartZ);
    addBox(spec.wid + 0.08, 0.045, splitDepth, carbonMat, 0, 0.20, frontOverhangStartZ + splitDepth * 0.5);
    addBox(spec.wid + 0.10, 0.025, 0.07, accentMat, 0, 0.23, halfL + 0.15, 0, 0, 0, false);

    // 6. Iconic Full-Length Central LMP Dorsal Shark Fin!
    const dorsalGeo = trackGeo(
      makeExtrudedProfile(
        [
          [-halfL + 0.14, 0.70],
          [-0.44, 0.70],
          [-0.44, spec.roofY + 0.03],
          [-halfL + 0.14, 0.98],
        ],
        0.05,
        0.006,
        0.006,
        1
      )
    );
    const dorsal = new THREE.Mesh(dorsalGeo, accentMat);
    dorsal.castShadow = !lowPower;
    bodyGroup.add(dorsal);

    // 7. Massive Ground-Effect Dual Venturi Diffuser (strictly behind rear arch!) + TOP-DECK Twin Central Exhausts!
    const diffDepth = Math.max(0.30, rearOverhangEndZ - (-halfL - 0.02));
    addBox(spec.wid - 0.14, 0.28, diffDepth, carbonMat, 0, 0.26, -halfL + diffDepth * 0.5);
    for (let f = -3; f <= 3; f++) {
      addBox(0.045, 0.26, diffDepth + 0.04, carbonMat, f * 0.28, 0.25, -halfL + diffDepth * 0.5 - 0.02, 0, 0, 0, false);
    }
    for (const side of [-1, 1]) {
      addCyl(0.065, 0.072, 0.30, 12, titaniumMat, side * 0.22, 0.74, -halfL + 0.26, Math.PI / 2 - 0.26);
      exhaustOutlets.push({ x: side * 0.22, y: 0.76, z: -halfL + 0.12, rx: -0.26, scale: 1.05 });
    }
  }

  // =========================================================================
  // 2. ADAPTIVE LIVERY GRAPHICS (aligned cleanly to each car's exact heights!)
  // =========================================================================
  if (config.liveryStyle === 'center-stripe') {
    const hoodLen = spec.liveryHoodEnd - spec.liveryHoodStart;
    const roofLen = spec.liveryRoofEnd - spec.liveryRoofStart;
    const deckLen = spec.liveryDeckEnd - spec.liveryDeckStart;
    const stripeW = cid === 'hyperion-proto' ? 0.26 : 0.34;
    if (cid !== 'vanguard-v8') {
      addBox(stripeW, 0.018, hoodLen, accentMat, 0, spec.hoodY + 0.028, (spec.liveryHoodStart + spec.liveryHoodEnd) * 0.5, 0.08, 0, 0, false);
    }
    addBox(stripeW, 0.018, roofLen, accentMat, 0, spec.roofY + 0.052, (spec.liveryRoofStart + spec.liveryRoofEnd) * 0.5, 0, 0, 0, false);
    if (cid !== 'veloce-v12' && cid !== 'hyperion-proto') {
      addBox(stripeW, 0.018, deckLen, accentMat, 0, spec.deckY + 0.028, (spec.liveryDeckStart + spec.liveryDeckEnd) * 0.5, 0, 0, 0, false);
    }
  } else if (config.liveryStyle === 'dual-stripe') {
    const hoodLen = spec.liveryHoodEnd - spec.liveryHoodStart;
    const roofLen = spec.liveryRoofEnd - spec.liveryRoofStart;
    const deckLen = spec.liveryDeckEnd - spec.liveryDeckStart;
    const offset = cid === 'vanguard-v8' ? 0.44 : cid === 'hyperion-proto' ? 0.14 : 0.20;
    for (const side of [-1, 1]) {
      addBox(0.14, 0.018, hoodLen, accentMat, side * offset, spec.hoodY + 0.028, (spec.liveryHoodStart + spec.liveryHoodEnd) * 0.5, 0.08, 0, 0, false);
      addBox(0.14, 0.018, roofLen, accentMat, side * (cid === 'vanguard-v8' ? 0.24 : offset), spec.roofY + 0.052, (spec.liveryRoofStart + spec.liveryRoofEnd) * 0.5, 0, 0, 0, false);
      if (cid !== 'veloce-v12' && cid !== 'hyperion-proto') {
        addBox(0.14, 0.018, deckLen, accentMat, side * (cid === 'vanguard-v8' ? 0.24 : offset), spec.deckY + 0.028, (spec.liveryDeckStart + spec.liveryDeckEnd) * 0.5, 0, 0, 0, false);
      }
    }
  } else if (config.liveryStyle === 'side-blade') {
    for (const side of [-1, 1]) {
      const bladeY = cid === 'vanguard-v8' ? 0.58 : cid === 'hyperion-proto' ? 0.44 : 0.50;
      const bladeX = cid === 'hyperion-proto' ? halfW - 0.15 : halfW + 0.005;
      addBox(0.032, 0.14, skirtLen * 0.92, accentMat, side * bladeX, bladeY, skirtMidZ, 0, 0, 0, false);
    }
  }

  // =========================================================================
  // 3. REAR WING / SPOILER SYSTEM (Unique factory stock aero per car + aftermarket wings!)
  // =========================================================================
  if (config.wingStyle !== 'delete') {
    const wz = spec.wingZ;
    const wy = spec.wingBaseY;

    if (config.wingStyle === 'stock') {
      if (cid === 'drift-s15') {
        addBox(spec.wid - 0.16, 0.13, 0.26, paintMat, 0, wy + 0.09, wz + 0.02, -0.44, 0, 0);
      } else if (cid === 'vanguard-v8') {
        addBox(spec.wid - 0.18, 0.06, 0.26, carbonMat, 0, wy + 0.12, wz, 0.14, 0, 0);
        for (const side of [-1, 1]) {
          addBox(0.08, 0.14, 0.18, carbonMat, side * 0.62, wy + 0.05, wz);
        }
      } else if (cid === 'veloce-v12') {
        addBox(spec.wid - 0.24, 0.045, 0.30, carbonMat, 0, wy + 0.15, wz, 0.10, 0, 0);
        for (const side of [-1, 1]) {
          addBox(0.055, 0.16, 0.18, carbonMat, side * 0.46, wy + 0.07, wz + 0.03);
        }
      } else if (cid === 'stratos-gt3') {
        addBox(spec.wid + 0.08, 0.055, 0.38, carbonMat, 0, wy + 0.42, wz - 0.04, 0.10, 0, 0);
        for (const side of [-1, 1]) {
          addBox(0.045, 0.44, 0.20, carbonMat, side * 0.56, wy + 0.22, wz + 0.04);
          addBox(0.045, 0.34, 0.46, accentMat, side * (halfW + 0.04), wy + 0.40, wz - 0.04);
        }
      } else if (cid === 'hyperion-proto') {
        addBox(spec.wid + 0.04, 0.05, 0.36, carbonMat, 0, wy + 0.22, wz, 0.08, 0, 0);
        for (const side of [-1, 1]) {
          addBox(0.05, 0.34, 0.46, paintMat, side * (halfW + 0.01), wy + 0.14, wz);
        }
      } else {
        addBox(spec.wid - 0.14, 0.055, 0.28, paintMat, 0, wy + 0.20, wz, 0.08, 0, 0);
        for (const side of [-1, 1]) {
          addBox(0.07, 0.22, 0.22, paintMat, side * 0.68, wy + 0.09, wz);
        }
      }
    } else if (config.wingStyle === 'gt-carbon') {
      const wingH = cid === 'hyperion-proto' ? wy + 0.34 : wy + 0.38;
      addBox(spec.wid + 0.10, 0.055, 0.34, carbonMat, 0, wingH, wz, 0.09, 0, 0);
      for (const side of [-1, 1]) {
        addBox(0.045, wingH - wy + 0.04, 0.22, carbonMat, side * 0.54, (wingH + wy) * 0.5, wz + 0.02);
        addBox(0.04, 0.26, 0.42, accentMat, side * (halfW + 0.05), wingH, wz);
      }
    } else if (config.wingStyle === 'swan-neck') {
      const wingH = cid === 'hyperion-proto' ? wy + 0.42 : wy + 0.46;
      addBox(spec.wid + 0.16, 0.055, 0.40, carbonMat, 0, wingH, wz - 0.04, 0.12, 0, 0);
      for (const side of [-1, 1]) {
        addBox(0.045, wingH - wy + 0.08, 0.16, carbonMat, side * 0.46, (wingH + wy) * 0.5 + 0.02, wz + 0.06, -0.14, 0, 0);
        addBox(0.045, 0.34, 0.48, accentMat, side * (halfW + 0.08), wingH - 0.02, wz - 0.04);
      }
    }
  }

  // =========================================================================
  // 4. NITRO EXHAUST FLAMES (matched to each car's exact exhaust outlets!)
  // =========================================================================
  const flameGeo = trackGeo(new THREE.ConeGeometry(0.10, 0.72, 8));
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.34);
  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const nitroFlames: THREE.Mesh[] = [];
  for (const out of exhaustOutlets) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(out.x, out.y, out.z);
    if (out.rx) flame.rotation.x = out.rx;
    if (out.ry) flame.rotation.y = out.ry;
    const sc = out.scale ?? 1.0;
    flame.scale.set(sc, sc, sc);
    flame.visible = false;
    bodyGroup.add(flame);
    nitroFlames.push(flame);
  }

  // =========================================================================
  // 5. CHASSIS-SCALED WHEELS (CLEANLY CENTERED IN CARVED WHEEL ARCHES!)
  // =========================================================================
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161920,
      roughness: 0.88,
      metalness: 0.05,
    })
  );
  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.rimColor),
      roughness: 0.22,
      metalness: 0.86,
    })
  );
  const rotorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.34,
      metalness: 0.78,
    })
  );
  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.caliperColor),
      roughness: 0.26,
      metalness: 0.45,
    })
  );

  const buildWheelGeoSet = (r: number, w: number) => {
    const tireSegs = lowPower ? 16 : 24;
    const tireGeo = trackGeo(new THREE.CylinderGeometry(r, r, w, tireSegs));
    tireGeo.rotateZ(Math.PI / 2);

    const rimRatio = cid === 'vanguard-v8' && r > 0.36 ? 0.58 : cid === 'drift-s15' ? 0.72 : 0.70;
    const rimR = r * rimRatio;

    const rimBarrelGeo = trackGeo(new THREE.CylinderGeometry(rimR, rimR, w + 0.012, 18));
    rimBarrelGeo.rotateZ(Math.PI / 2);

    const rimLipGeo = trackGeo(new THREE.TorusGeometry(rimR * 0.96, 0.02, 8, 18));
    rimLipGeo.rotateY(Math.PI / 2);

    const hubGeo = trackGeo(new THREE.CylinderGeometry(rimR * 0.28, rimR * 0.28, w + 0.028, 12));
    hubGeo.rotateZ(Math.PI / 2);

    const spokeGeo = trackGeo(new THREE.BoxGeometry(w + 0.022, rimR * 1.86, 0.042));
    const discGeo = trackGeo(new THREE.CylinderGeometry(rimR * 0.92, rimR * 0.92, w + 0.022, 18));
    discGeo.rotateZ(Math.PI / 2);

    const rotorGeo = trackGeo(new THREE.CylinderGeometry(rimR * 0.76, rimR * 0.76, 0.036, 16));
    rotorGeo.rotateZ(Math.PI / 2);

    const caliperGeo = trackGeo(new THREE.BoxGeometry(0.07, rimR * 0.54, rimR * 0.34));

    return { r, w, rimR, tireGeo, rimBarrelGeo, rimLipGeo, hubGeo, spokeGeo, discGeo, rotorGeo, caliperGeo };
  };

  const frontWheelSet = buildWheelGeoSet(spec.frontR, spec.frontW);
  const rearWheelSet = buildWheelGeoSet(spec.rearR, spec.rearW);

  const frontWheels: THREE.Group[] = [];
  const spinWheels: THREE.Object3D[] = [];

  const wheelPositions = [
    { x: -frontWheelX, z: spec.frontZ, front: true, side: -1, set: frontWheelSet },
    { x: frontWheelX, z: spec.frontZ, front: true, side: 1, set: frontWheelSet },
    { x: -rearWheelX, z: spec.rearZ, front: false, side: -1, set: rearWheelSet },
    { x: rearWheelX, z: spec.rearZ, front: false, side: 1, set: rearWheelSet },
  ];

  for (const wp of wheelPositions) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wp.x, wp.set.r, wp.z);

    const camberHolder = new THREE.Group();
    camberHolder.rotation.z = wp.side * spec.camber;

    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(wp.set.tireGeo, tireMat);
    tire.castShadow = !lowPower;
    spinGroup.add(tire);

    const barrel = new THREE.Mesh(wp.set.rimBarrelGeo, darkMeshMat);
    const lip = new THREE.Mesh(wp.set.rimLipGeo, rimMat);
    lip.position.x = wp.side * (wp.set.w * 0.46);
    const hub = new THREE.Mesh(wp.set.hubGeo, rimMat);
    spinGroup.add(barrel, lip, hub);

    if (config.rimStyle === 'aero-disc') {
      const disc = new THREE.Mesh(wp.set.discGeo, rimMat);
      spinGroup.add(disc);
    } else {
      const spokeCount = config.rimStyle === 'turbine' ? 7 : 5;
      for (let s = 0; s < spokeCount; s++) {
        const spoke = new THREE.Mesh(wp.set.spokeGeo, rimMat);
        spoke.rotation.x = (s / spokeCount) * Math.PI;
        spinGroup.add(spoke);
      }
    }

    const rotor = new THREE.Mesh(wp.set.rotorGeo, rotorMat);
    rotor.position.x = -wp.side * 0.04;
    spinGroup.add(rotor);

    const caliper = new THREE.Mesh(wp.set.caliperGeo, caliperMat);
    caliper.position.set(-wp.side * 0.04, 0.04, wp.front ? -wp.set.rimR * 0.44 : wp.set.rimR * 0.44);

    camberHolder.add(spinGroup, caliper);
    steerPivot.add(camberHolder);
    root.add(steerPivot);

    if (wp.front) frontWheels.push(steerPivot);
    spinWheels.push(spinGroup);
  }

  // =========================================================================
  // 6. GROUNDED CONTACT SHADOW PLANE
  // =========================================================================
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(spec.wid * 1.46, spec.len * 1.22));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    })
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.035;
  root.add(shadowPlane);

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
 * cabin with red roof/pillars, crisp WHITE rear spoiler on black struts, carved
 * wheel arches with clean body-to-tyre space, and bright silver-white aero-disc rims.
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
  const sillY = 0.26;
  const wheelRadius = 0.34;
  const wheelWidth = 0.30;
  const archR = wheelRadius + 0.085;
  const archDz = getArchSpanHalfZ(wheelRadius, archR, sillY);
  const frontZ = halfL - 0.94;
  const rearZ = -(halfL - 0.94);
  const innerTubHalfW = halfW - wheelWidth - 0.16;

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

  const linerMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    roughness: 0.92,
    metalness: 0.04,
    side: THREE.DoubleSide,
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
    linerMat,
    silverLipMat,
    glassMat,
    headlightMat,
    amberCornerMat,
    brakeLightMat
  );

  // 1. Primary Sculpted Low-Poly Red Coupe Hull WITH CARVED WHEEL ARCHES!
  const hullBev = 0.042;
  const hullGeo = makeBodyWithWheelArches(
    -halfL,
    halfL - 0.08,
    sillY,
    [
      [halfL + 0.06, 0.48],
      [halfL - 0.08, 0.74],
      [frontZ, 0.85],
      [0.76, 0.90],
      [-1.12, 0.91],
      [-halfL + 0.04, 0.89],
      [-halfL, 0.74],
    ],
    [
      { z: rearZ, r: wheelRadius, archR },
      { z: frontZ, r: wheelRadius, archR },
    ],
    wid - hullBev * 2,
    0.05,
    hullBev,
    2
  );

  const hullMesh = new THREE.Mesh(hullGeo, redPaintMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  bodyGroup.add(hullMesh);

  // Recessed dark inner chassis core & wheel-well liners (zero tire penetration!)
  const tubGeo = new THREE.BoxGeometry(innerTubHalfW * 2, 0.36, len - 0.48);
  const tubMesh = new THREE.Mesh(tubGeo, linerMat);
  tubMesh.position.set(0, sillY + 0.19, 0);
  bodyGroup.add(tubMesh);

  const wellDepth = Math.max(0.22, halfW - 0.03 - innerTubHalfW);
  const wellMidX = (halfW - 0.03 + innerTubHalfW) * 0.5;
  const linerGeo = new THREE.CylinderGeometry(archR + 0.008, archR + 0.008, wellDepth, 16, 1, true, 0, Math.PI);
  linerGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const wz of [frontZ, rearZ]) {
      const liner = new THREE.Mesh(linerGeo, linerMat);
      liner.position.set(side * wellMidX, wheelRadius, wz);
      bodyGroup.add(liner);
    }
  }
  disposables.push(hullGeo, tubGeo, linerGeo);

  // 2. Sculpted Front Chin Splitter (ahead of front wheel arch), Side Skirts (between arches) & Diffuser (behind rear arch)
  const frontStartZ = frontZ + archDz + 0.02;
  const splitDepth = Math.max(0.26, halfL + 0.12 - frontStartZ);
  const splitterGeo = new THREE.BoxGeometry(wid + 0.06, 0.08, splitDepth);
  const splitter = new THREE.Mesh(splitterGeo, darkTrimMat);
  splitter.position.set(0, 0.23, frontStartZ + splitDepth * 0.5);
  bodyGroup.add(splitter);

  const lipGeo = new THREE.BoxGeometry(wid + 0.08, 0.045, 0.14);
  const frontLip = new THREE.Mesh(lipGeo, silverLipMat);
  frontLip.position.set(0, 0.24, halfL + 0.10);
  bodyGroup.add(frontLip);

  const skirtLen = Math.max(0.8, frontZ - archDz - (rearZ + archDz) - 0.04);
  const sideSkirtGeo = new THREE.BoxGeometry(0.10, 0.10, skirtLen);
  const skirtL = new THREE.Mesh(sideSkirtGeo, darkTrimMat);
  skirtL.position.set(-halfW, 0.24, 0);
  const skirtR = new THREE.Mesh(sideSkirtGeo, darkTrimMat);
  skirtR.position.set(halfW, 0.24, 0);
  bodyGroup.add(skirtL, skirtR);

  const grilleGeo = new THREE.BoxGeometry(wid * 0.42, 0.16, 0.08);
  const grille = new THREE.Mesh(grilleGeo, darkTrimMat);
  grille.position.set(0, 0.61, halfL + 0.06);
  grille.rotation.x = -0.46;
  bodyGroup.add(grille);

  const rearEndZ = rearZ - archDz - 0.02;
  const diffDepth = Math.max(0.24, rearEndZ - (-halfL - 0.02));
  const diffuserGeo = new THREE.BoxGeometry(wid * 0.88, 0.20, diffDepth);
  const diffuser = new THREE.Mesh(diffuserGeo, darkTrimMat);
  diffuser.position.set(0, 0.30, -halfL + diffDepth * 0.5);
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
  const hoodStartY = 0.90;
  const hoodEndZ = halfL - 0.08;
  const hoodEndY = 0.74;
  const hoodLen = Math.hypot(hoodEndZ - hoodStartZ, hoodEndY - hoodStartY) + 0.04;
  const hoodAngle = Math.atan2(hoodStartY - hoodEndY, hoodEndZ - hoodStartZ);
  const hoodMidZ = (hoodStartZ + hoodEndZ) * 0.5;
  const hoodMidY = (hoodStartY + hoodEndY) * 0.5 + 0.052;

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

  // Crisp White Horizontal Side Door Accent Line (strictly between wheel arches!)
  const sideLineGeo = new THREE.BoxGeometry(0.03, 0.038, skirtLen * 0.92);
  const sideDropGeo = new THREE.BoxGeometry(0.03, 0.22, 0.038);
  for (const side of [-1, 1]) {
    const sl = new THREE.Mesh(sideLineGeo, whiteTrimMat);
    sl.position.set(side * (halfW + 0.006), 0.72, 0);
    const sd = new THREE.Mesh(sideDropGeo, whiteTrimMat);
    sd.position.set(side * (halfW + 0.006), 0.61, skirtLen * 0.45);
    bodyGroup.add(sl, sd);
  }
  disposables.push(hoodStripeGeo, noseStripeGeo, trunkStripeGeo, sideLineGeo, sideDropGeo);

  // 5. Tinted Coupe Cockpit Canopy + Sleek Red Roof Cap & Crisp Pillars
  const cabinProfile = new THREE.Shape();
  cabinProfile.moveTo(-1.12, 0.87);
  cabinProfile.lineTo(0.84, 0.87);
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

  const roofGeo = new THREE.BoxGeometry(cabinDepth + 0.08, 0.075, 0.98);
  const roofMesh = new THREE.Mesh(roofGeo, redPaintMat);
  roofMesh.position.set(0, 1.41, -0.20);
  bodyGroup.add(roofMesh);

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

  // 7. Chunky Dark Tires + Clean Bright Silver-White Aero-Disc Rims (cleanly spaced inside arches!)
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

  const trackHalf = halfW - wheelWidth * 0.5 - 0.025;

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
