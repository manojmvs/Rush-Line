import type { ChassisId, TrackId } from '../types/game.ts';

export function CheckeredAccent({
  color = '#FFD014',
  className = '',
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <g transform="skewX(-18) translate(6, 0)">
        <rect x="0" y="2" width="8" height="7" fill={color} />
        <rect x="16" y="2" width="8" height="7" fill={color} />
        <rect x="32" y="2" width="8" height="7" fill={color} />
        <rect x="8" y="9" width="8" height="7" fill={color} />
        <rect x="24" y="9" width="8" height="7" fill={color} />
        <rect x="0" y="16" width="8" height="6" fill={color} opacity="0.65" />
        <rect x="16" y="16" width="8" height="6" fill={color} opacity="0.65" />
      </g>
    </svg>
  );
}

export function ApexLogo({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const isLg = size === 'lg';
  return (
    <div className="inline-flex flex-col items-center select-none pointer-events-none">
      {/* Top Row: Skewed Red RUSH plate + Checkered Flag */}
      <div className="flex items-center -mb-2 z-10">
        <div
          className={`bg-[#E5252B] -skew-x-14 shadow-[0_6px_20px_rgba(0,0,0,0.45)] ${
            isLg ? 'px-6 py-1.5 sm:px-8 sm:py-2' : 'px-4 py-1'
          }`}
        >
          <span
            className={`block skew-x-14 font-display italic font-black tracking-tight text-white leading-none drop-shadow ${
              isLg ? 'text-4xl sm:text-6xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            RUSH
          </span>
        </div>
        <CheckeredAccent
          color="#FFFFFF"
          className={isLg ? 'w-14 h-9 sm:w-20 sm:h-12 -ml-1' : 'w-10 h-6 -ml-1'}
        />
      </div>

      {/* Bottom Row: Dark Navy LINE plate + Bold Yellow Speed Underline */}
      <div className="relative">
        <div
          className={`bg-[#101C30] border border-white/15 -skew-x-14 shadow-[0_10px_28px_rgba(0,0,0,0.55)] ${
            isLg ? 'px-9 py-1.5 sm:px-12 sm:py-2' : 'px-6 py-1'
          }`}
        >
          <span
            className={`block skew-x-14 font-display italic font-black tracking-wider text-white leading-none ${
              isLg ? 'text-3xl sm:text-5xl' : 'text-xl sm:text-2xl'
            }`}
          >
            LINE
          </span>
        </div>
        {/* Yellow Speed Slash */}
        <div
          className={`mx-auto -skew-x-18 bg-[#FFD014] shadow-[0_3px_12px_rgba(255,208,20,0.55)] ${
            isLg ? 'h-2 sm:h-2.5 w-[88%] -mt-0.5' : 'h-1.5 w-[86%] -mt-0.5'
          }`}
        />
      </div>
    </div>
  );
}

/**
 * Stylized low-poly angled car thumbnail matching the reference Garage & Select Race car strip.
 */
export function CarCardThumb({
  primaryColor,
  accentColor,
  chassisId,
  className = 'w-full h-14',
}: {
  primaryColor: string;
  accentColor: string;
  chassisId: ChassisId;
  className?: string;
}) {
  const isProto = chassisId === 'hyperion-proto' || chassisId === 'veloce-v12';
  const hasTallWing = chassisId !== 'vanguard-v8';

  return (
    <svg viewBox="0 0 140 72" className={className} fill="none" aria-hidden="true">
      {/* Soft ground shadow */}
      <ellipse cx="70" cy="61" rx="52" ry="7" fill="rgba(0,0,0,0.48)" />

      {/* Rear Wing */}
      {hasTallWing && (
        <g>
          <rect x="97" y="17" width="4" height="12" fill="#1E293B" />
          <rect x="115" y="18" width="4" height="11" fill="#1E293B" />
          <polygon points="88,15 126,17 123,22 86,20" fill={accentColor} />
          <polygon points="122,13 128,14 126,23 120,22" fill="#F8FAFC" />
        </g>
      )}

      {/* Main Car Body (Angled 3/4 Low-Poly Silhouette) */}
      <polygon
        points={
          isProto
            ? '18,45 30,33 56,31 96,29 121,34 123,49 102,55 42,56 16,51'
            : '17,44 26,33 55,31 98,28 122,33 123,49 101,55 40,56 15,50'
        }
        fill={primaryColor}
      />

      {/* Side Shadow Facet */}
      <polygon
        points="62,43 122,33 123,49 101,55 62,55"
        fill="rgba(0,0,0,0.22)"
      />

      {/* Hood Highlight Facet */}
      <polygon
        points="20,43 32,33 65,33 58,44"
        fill="rgba(255,255,255,0.16)"
      />

      {/* Racing Stripes on Hood & Roof */}
      <polygon points="35,43 44,33 50,33 41,43" fill={accentColor} opacity="0.92" />
      <polygon points="44,43 52,33 56,33 48,43" fill={accentColor} opacity="0.92" />

      {/* Cabin / Windshield */}
      <polygon
        points={
          isProto
            ? '47,33 61,21 92,21 104,31'
            : '45,33 56,20 93,20 105,31'
        }
        fill="#0F172A"
      />
      {/* Roof panel */}
      <polygon
        points={isProto ? '61,21 92,21 88,24 63,24' : '56,20 93,20 89,24 58,24'}
        fill={primaryColor}
      />
      {/* Side window tint */}
      <polygon points="78,22 93,22 101,31 76,32" fill="#1E293B" />

      {/* Front Splitter & Glowing Headlights */}
      <polygon points="15,50 61,54 61,58 14,53" fill="#0B1120" />
      <polygon points="19,44 30,45 29,49 18,48" fill="#FFFBEB" />
      <polygon points="44,46 57,47 56,51 43,50" fill="#FFFBEB" />

      {/* Front Wheel */}
      <ellipse cx="78" cy="52" rx="10" ry="12" fill="#111827" />
      <ellipse cx="79" cy="52" rx="6" ry="8" fill="#E2E8F0" />

      {/* Rear Wheel */}
      <ellipse cx="111" cy="46" rx="8" ry="10" fill="#111827" />
      <ellipse cx="112" cy="46" rx="4.8" ry="6.5" fill="#CBD5E1" />
    </svg>
  );
}

/**
 * Vibrant stylized low-poly alpine landscape thumbnails matching the Select Race track list!
 */
export function TrackCardArt({
  trackId,
  className = 'w-28 h-16',
}: {
  trackId: TrackId;
  className?: string;
}) {
  if (trackId === 'offroad-track') {
    return (
      <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* Bright alpine sky */}
        <rect width="120" height="68" fill="#46ADF5" />
        {/* Clouds */}
        <ellipse cx="34" cy="12" rx="14" ry="4.5" fill="#FFFFFF" opacity="0.92" />
        <ellipse cx="90" cy="10" rx="12" ry="4" fill="#FFFFFF" opacity="0.88" />
        {/* Distant snow mountains */}
        <polygon points="36,34 62,11 88,34" fill="#7CA3CB" />
        <polygon points="55,17 62,11 69,17 62,20" fill="#F8FAFC" />
        <polygon points="74,34 98,16 122,34" fill="#6B92BA" />
        {/* Lush green alpine meadow */}
        <rect x="0" y="32" width="120" height="36" fill="#54B431" />
        {/* Winding sandy-tan rally dirt road */}
        <path d="M22,68 Q56,50 58,42 Q60,36 74,32 L82,32 Q74,40 76,48 Q78,56 64,68 Z" fill="#D4B589" />
        <path d="M34,68 Q62,52 64,43 Q66,37 76,32" stroke="#8C6B49" strokeWidth="2.5" fill="none" />
        {/* Sparkling pond on right */}
        <ellipse cx="105" cy="54" rx="17" ry="8" fill="#2CB2E8" />
        {/* Layered pine trees */}
        <g>
          <rect x="12" y="34" width="4" height="16" fill="#854B22" />
          <polygon points="14,10 2,34 26,34" fill="#2F8E27" />
          <polygon points="14,4 5,22 23,22" fill="#5CC631" />
          <rect x="96" y="30" width="3.5" height="12" fill="#854B22" />
          <polygon points="98,11 88,31 108,31" fill="#3C9E2B" />
          <polygon points="98,6 91,20 105,20" fill="#6BD036" />
        </g>
        {/* Red & white bollard */}
        <rect x="33" y="45" width="3" height="9" fill="#FFFFFF" />
        <rect x="33" y="48" width="3" height="3" fill="#E12D2D" />
      </svg>
    );
  }

  if (trackId === 'hill-track') {
    return (
      <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* Crisp high-altitude sky */}
        <rect width="120" height="68" fill="#3B9AE8" />
        <ellipse cx="26" cy="11" rx="14" ry="4" fill="#FFFFFF" opacity="0.9" />
        {/* Tall jagged snowy alpine peaks */}
        <polygon points="4,40 36,6 68,40" fill="#648BB5" />
        <polygon points="27,15 36,6 45,15 36,19" fill="#F8FAFC" />
        <polygon points="52,40 88,4 122,40" fill="#5278A2" />
        <polygon points="78,14 88,4 98,14 88,18" fill="#FFFFFF" />
        {/* Steep sloped mountain hillside */}
        <polygon points="0,30 120,20 120,68 0,68" fill="#3E9630" />
        <polygon points="0,42 74,28 120,38 120,68 0,68" fill="#4BA834" />
        {/* Dramatic ascending switchback mountain tarmac */}
        <path d="M10,68 Q46,56 76,46 Q94,40 62,32 Q42,27 72,22 L84,22 Q64,27 78,32 Q112,41 86,52 Q58,61 36,68 Z" fill="#2E3644" />
        <path d="M22,68 Q52,58 78,48 Q98,40 66,32 Q50,28 76,22" stroke="#F8FAFC" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.75" />
        {/* Alpine pine trees & rock cliffs */}
        <polygon points="16,24 6,46 26,46" fill="#237624" />
        <polygon points="16,18 9,33 23,33" fill="#4DB830" />
        <polygon points="104,22 94,44 114,44" fill="#237624" />
        <polygon points="104,16 97,31 111,31" fill="#55C234" />
        <polygon points="88,52 98,46 112,56 90,62" fill="#8D98A5" />
      </svg>
    );
  }

  if (trackId === 'city-track') {
    return (
      <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* Warm Italian golden-hour sky */}
        <rect width="120" height="68" fill="#D97B48" />
        <rect x="0" y="0" width="120" height="22" fill="#4672A8" opacity="0.65" />
        <circle cx="60" cy="24" r="9" fill="#FDE68A" opacity="0.72" />
        {/* Left terracotta & ochre Italian palazzos with pitched tile roofs */}
        <polygon points="0,14 22,8 38,16 0,16" fill="#9E3B24" />
        <rect x="0" y="16" width="38" height="28" fill="#C96F4B" />
        <polygon points="32,20 44,16 50,21 32,21" fill="#8C331E" />
        <rect x="32" y="21" width="17" height="21" fill="#DCA95C" />
        {/* Right Venetian rose & Tuscan ochre palazzos with pitched tile roofs */}
        <polygon points="82,16 98,8 120,14 120,16" fill="#9E3B24" />
        <rect x="82" y="16" width="38" height="28" fill="#D49A89" />
        <polygon points="70,21 76,16 88,20 88,21" fill="#8C331E" />
        <rect x="71" y="21" width="17" height="21" fill="#C96F4B" />
        {/* Classic Italian green louvered shutters & warm lit windows + red geranium flower boxes */}
        <rect x="5" y="20" width="8" height="10" fill="#24583F" />
        <rect x="7" y="21" width="4" height="8" fill="#FEF3C7" />
        <rect x="20" y="20" width="8" height="10" fill="#24583F" />
        <rect x="22" y="21" width="4" height="8" fill="#FEF3C7" />
        <rect x="19" y="29" width="10" height="3" fill="#E11D48" />
        <rect x="92" y="20" width="8" height="10" fill="#24583F" />
        <rect x="94" y="21" width="4" height="8" fill="#FEF3C7" />
        <rect x="106" y="20" width="8" height="10" fill="#24583F" />
        <rect x="108" y="21" width="4" height="8" fill="#FEF3C7" />
        <rect x="91" y="29" width="10" height="3" fill="#E11D48" />
        {/* Ground-floor striped trattoria / gelateria awnings */}
        <polygon points="0,35 38,35 42,39 0,39" fill="#991B1B" />
        <polygon points="78,39 82,35 120,35 120,39" fill="#166534" />
        {/* Warm travertine stone sidewalks & road curbs */}
        <polygon points="0,68 22,68 46,41 36,41" fill="#D6CAB6" />
        <polygon points="98,68 120,68 84,41 74,41" fill="#D6CAB6" />
        {/* Italian Sampietrini basalt cobblestone street */}
        <polygon points="18,68 45,41 75,41 102,68" fill="#4E4844" />
        <line x1="60" y1="42" x2="60" y2="68" stroke="#F8F4EA" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.7" />
        {/* Ornate dark wrought-iron Italian globe streetlamps */}
        <rect x="31" y="26" width="2" height="24" fill="#1C2024" />
        <circle cx="34.5" cy="26" r="2.6" fill="#FEF08A" />
        <rect x="87" y="26" width="2" height="24" fill="#1C2024" />
        <circle cx="85.5" cy="26" r="2.6" fill="#FEF08A" />
        {/* Overhead warm cafe bistro string lights & Italian green-white-red bunting */}
        <path d="M26,18 Q60,26 94,18" stroke="#18181B" strokeWidth="0.9" fill="none" />
        <circle cx="42" cy="21.2" r="1.4" fill="#16A34A" />
        <circle cx="51" cy="22.4" r="1.4" fill="#F8FAFC" />
        <circle cx="60" cy="22.8" r="1.4" fill="#DC2626" />
        <circle cx="69" cy="22.4" r="1.4" fill="#FDE047" />
        <circle cx="78" cy="21.2" r="1.4" fill="#FDE047" />
      </svg>
    );
  }

  if (trackId === 'riverside-track') {
    return (
      <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* Sunny sky */}
        <rect width="120" height="68" fill="#46B3F7" />
        <ellipse cx="82" cy="11" rx="15" ry="4" fill="#FFFFFF" opacity="0.92" />
        {/* Distant hills */}
        <polygon points="0,32 30,14 64,32" fill="#6D97C0" />
        <polygon points="48,32 82,16 120,32" fill="#5D87B1" />
        {/* Lush green riverbank */}
        <rect x="0" y="30" width="120" height="38" fill="#4EB032" />
        {/* Wide turquoise sparkling river on right */}
        <path d="M62,68 Q78,48 92,30 L120,30 L120,68 Z" fill="#1CA9E6" />
        <path d="M74,64 Q88,52 98,36" stroke="#7DD3FC" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />
        <path d="M90,62 Q102,54 112,44" stroke="#E0F2FE" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.7" />
        {/* Sandy pebble embankment */}
        <path d="M55,68 Q72,48 86,30 L93,30 Q79,48 64,68 Z" fill="#D8C299" />
        {/* Riverside curving asphalt road */}
        <path d="M6,68 Q34,46 58,30 L74,30 Q54,48 38,68 Z" fill="#303846" />
        <path d="M22,68 Q44,48 66,30" stroke="#F8FAFC" strokeWidth="1.8" strokeDasharray="5 4" fill="none" opacity="0.8" />
        {/* Pine trees on left bank */}
        <polygon points="14,12 4,34 24,34" fill="#2A8A26" />
        <polygon points="14,6 7,21 21,21" fill="#61CA33" />
        <polygon points="34,16 26,34 42,34" fill="#349729" />
      </svg>
    );
  }

  if (trackId === 'stadium-track') {
    return (
      <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* Crisp arena twilight-blue sky */}
        <rect width="120" height="68" fill="#1E4682" />
        {/* Stadium floodlight towers */}
        <rect x="14" y="6" width="3" height="24" fill="#94A3B8" />
        <rect x="9" y="5" width="13" height="5" fill="#FEF9C3" />
        <rect x="103" y="6" width="3" height="24" fill="#94A3B8" />
        <rect x="98" y="5" width="13" height="5" fill="#FEF9C3" />
        {/* Multi-tier encircling stadium grandstand + white canopy */}
        <path d="M0,26 Q60,14 120,26 L120,40 L0,40 Z" fill="#1E293B" />
        <path d="M0,22 Q60,10 120,22 L120,26 Q60,14 0,26 Z" fill="#F1F5F9" />
        {/* Crowd color bands */}
        <path d="M6,29 Q60,19 114,29" stroke="#FFD014" strokeWidth="2.5" strokeDasharray="4 3" fill="none" />
        <path d="M4,34 Q60,24 116,34" stroke="#E5252B" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
        {/* Mowed stadium turf */}
        <rect x="0" y="38" width="120" height="30" fill="#3FA12C" />
        <rect x="0" y="46" width="120" height="8" fill="#49B433" />
        {/* Wide oval/arena motorsport circuit + red/white kerbs */}
        <path d="M8,68 Q60,42 112,68 Z" fill="#2A313D" />
        <path d="M8,68 Q60,42 112,68" stroke="#E5252B" strokeWidth="3.5" strokeDasharray="6 6" fill="none" />
        <path d="M8,68 Q60,42 112,68" stroke="#FFFFFF" strokeWidth="3.5" strokeDasharray="6 6" strokeDashoffset="6" fill="none" />
        <path d="M28,68 Q60,52 92,68" stroke="#FFD014" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
      </svg>
    );
  }

  if (trackId === 'gokart-track') {
    return (
      <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* Crisp sunny sky */}
        <rect width="120" height="68" fill="#3FA2EE" />
        <ellipse cx="78" cy="11" rx="15" ry="4.5" fill="#FFFFFF" opacity="0.9" />
        {/* Mountain ridge */}
        <polygon points="0,33 28,15 56,33" fill="#789CC2" />
        <polygon points="22,19 28,15 34,19" fill="#FFFFFF" />
        {/* Bright meadow */}
        <rect x="0" y="31" width="120" height="37" fill="#4BA82E" />
        {/* Sweeping tight S-curve kart asphalt + red/white kerbs */}
        <path d="M12,68 Q34,46 66,50 Q92,53 96,35 L110,35 Q106,62 66,62 Q40,62 34,68 Z" fill="#2F3744" />
        <path d="M12,68 Q34,46 66,50 Q92,53 96,35" stroke="#E5252B" strokeWidth="3.2" strokeDasharray="6 5" fill="none" />
        <path d="M12,68 Q34,46 66,50 Q92,53 96,35" stroke="#FFFFFF" strokeWidth="3.2" strokeDasharray="5 6" strokeDashoffset="5" fill="none" />
        {/* Red kart canopy + pine trees */}
        <rect x="10" y="26" width="26" height="8" fill="#DC2626" />
        <rect x="12" y="34" width="22" height="7" fill="#1E293B" />
        <polygon points="106,12 96,32 116,32" fill="#2F8E27" />
        <polygon points="106,7 99,21 113,21" fill="#68CF35" />
        <polygon points="56,16 48,32 64,32" fill="#3B9E29" />
      </svg>
    );
  }

  // Default: Racing Track (Grand Prix Circuit with sunlit alpine backdrop, gantry, asphalt & red-white kerbs)
  return (
    <svg viewBox="0 0 120 68" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* Vivid blue sky */}
      <rect width="120" height="68" fill="#41A6F4" />
      <ellipse cx="32" cy="11" rx="14" ry="4" fill="#FFFFFF" opacity="0.92" />
      {/* Snow-capped peaks */}
      <polygon points="48,32 76,10 106,32" fill="#779EC6" />
      <polygon points="69,16 76,10 83,16 76,19" fill="#F8FAFC" />
      {/* Meadow */}
      <rect x="0" y="30" width="120" height="38" fill="#4FAF30" />
      {/* Wide Grand Prix Tarmac */}
      <polygon points="16,68 54,32 74,32 108,68" fill="#2C3442" />
      {/* Center line */}
      <line x1="64" y1="33" x2="62" y2="68" stroke="#F8FAFC" strokeWidth="2" strokeDasharray="5 5" opacity="0.7" />
      {/* Red & White Kerbs */}
      <line x1="16" y1="68" x2="54" y2="32" stroke="#E5252B" strokeWidth="4" strokeDasharray="6 6" />
      <line x1="16" y1="68" x2="54" y2="32" stroke="#FFFFFF" strokeWidth="4" strokeDasharray="6 6" strokeDashoffset="6" />
      <line x1="108" y1="68" x2="74" y2="32" stroke="#E5252B" strokeWidth="4" strokeDasharray="6 6" />
      <line x1="108" y1="68" x2="74" y2="32" stroke="#FFFFFF" strokeWidth="4" strokeDasharray="6 6" strokeDashoffset="6" />
      {/* Overhead Start Gantry */}
      <rect x="46" y="21" width="36" height="5" fill="#0F172A" />
      <rect x="46" y="21" width="4" height="15" fill="#1E293B" />
      <rect x="78" y="21" width="4" height="15" fill="#1E293B" />
      {/* Pine trees flanking circuit */}
      <polygon points="14,10 4,34 24,34" fill="#2F8E27" />
      <polygon points="14,5 7,21 21,21" fill="#64CC34" />
      <polygon points="108,12 98,34 118,34" fill="#2F8E27" />
      <polygon points="108,7 101,22 115,22" fill="#64CC34" />
    </svg>
  );
}
