import {
  ArrowLeft,
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudFog,
  CloudRain,
  CloudSun,
  Coins,
  Disc,
  Flag,
  Gauge,
  Lock,
  MapPin,
  Moon,
  Repeat,
  Sliders,
  Smartphone,
  Snowflake,
  Sun,
  Sunset,
  Unlock,
  Zap,
} from 'lucide-react';
import {
  CHASSIS_ORDER,
  CHASSIS_SPECS,
  TRACK_ORDER,
  TRACK_SPECS,
  type ChassisId,
  type ClimateMode,
  type GameMode,
  type TimeOfDay,
  type TrackId,
  type VehicleConfig,
} from '../types/game.ts';
import { computeVehicleStats } from '../game/physics.ts';
import { ShowroomCanvas } from './ShowroomCanvas.tsx';
import { CarCardThumb, CheckeredAccent, TrackCardArt } from './GameArtWidgets.tsx';

interface SelectRaceScreenProps {
  vehicle: VehicleConfig;
  coins: number;
  unlockedChassis: ChassisId[];
  selectedTrack: TrackId;
  selectedMode: GameMode;
  timeOfDay: TimeOfDay;
  climateMode: ClimateMode;
  laps: number;
  onSelectChassis: (chassisId: ChassisId) => void;
  onUnlockChassis: (chassisId: ChassisId) => void;
  onSelectTrack: (trackId: TrackId) => void;
  onSelectMode: (mode: GameMode) => void;
  onSelectTimeOfDay: (tod: TimeOfDay) => void;
  onSelectClimateMode: (climate: ClimateMode) => void;
  onSelectLaps: (laps: number) => void;
  onBack: () => void;
  onOpenGarage: () => void;
  onOpenInstall?: () => void;
  onStartRace: () => void;
}

const TRACK_SUBTITLES: Record<TrackId, string> = {
  'offroad-track': 'Rolling Hills & Dirt Rally',
  'hill-track': 'Alpine Mountain Pass',
  'city-track': 'Italian Piazza & Vicoli',
  'riverside-track': 'Emerald River Bend',
  'stadium-track': 'Floodlit Arena Bowl',
  'racing-track': 'Grand Prix Circuit',
  'gokart-track': 'Technical Kart Arena',
};

export function SelectRaceScreen({
  vehicle,
  coins,
  unlockedChassis,
  selectedTrack,
  selectedMode,
  timeOfDay,
  climateMode,
  laps,
  onSelectChassis,
  onUnlockChassis,
  onSelectTrack,
  onSelectMode,
  onSelectTimeOfDay,
  onSelectClimateMode,
  onSelectLaps,
  onBack,
  onOpenGarage,
  onOpenInstall,
  onStartRace,
}: SelectRaceScreenProps) {
  const stats = computeVehicleStats(vehicle);
  const spec = CHASSIS_SPECS[vehicle.chassisId];
  const isUnlocked = unlockedChassis.includes(vehicle.chassisId);
  const canAfford = coins >= spec.unlockCost;
  const gripRating = Math.min(100, Math.round(stats.gripCoeff * 64));

  const currentIdx = CHASSIS_ORDER.indexOf(vehicle.chassisId);
  const stepCar = (dir: -1 | 1) => {
    const nextIdx = (currentIdx + dir + CHASSIS_ORDER.length) % CHASSIS_ORDER.length;
    onSelectChassis(CHASSIS_ORDER[nextIdx]);
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-4 bg-gradient-to-b from-[#162740] via-[#0F1A2C] to-[#0A111D] select-none overflow-hidden">
      {/* TOP BAR: Back + SELECT RACE Header + Coins */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Intro"
            className="w-10 h-9 sm:w-12 sm:h-10 -skew-x-12 rounded-md bg-[#111A29] hover:bg-[#1B2A42] border border-white/18 text-white flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-5 h-5 skew-x-12" />
          </button>

          <div className="relative -skew-x-12 bg-[#111A29] border border-white/15 px-4 sm:px-6 py-1.5 flex items-center gap-2.5">
            <span className="skew-x-12 font-display italic font-black text-lg sm:text-2xl tracking-wide text-white leading-none">
              SELECT RACE
            </span>
            <CheckeredAccent color="#FFD014" className="skew-x-12 w-9 h-5 sm:w-11 sm:h-6" />
            <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-[#FFD014]" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="-skew-x-12 bg-[#111A29] border border-white/18 pl-3 pr-1.5 py-1 flex items-center gap-2.5 rounded-sm">
            <div className="skew-x-12 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-[#FFD014]" />
              <span className="font-display italic font-bold text-sm sm:text-base text-white font-mono-tabular">
                {coins.toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenGarage}
              title="Open Garage"
              className="w-6 h-6 sm:w-7 sm:h-7 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] flex items-center justify-center font-black text-sm rounded-xs transition-colors"
            >
              <span className="skew-x-12 leading-none">+</span>
            </button>
          </div>

          {onOpenInstall && (
            <button
              type="button"
              onClick={onOpenInstall}
              className="-skew-x-12 bg-[#111A29] hover:bg-[#1B2A42] border border-[#FFD014]/55 px-2.5 sm:px-3 py-1.5 flex items-center gap-1.5 text-white rounded-sm transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#FFD014] skew-x-12 shrink-0" />
              <span className="skew-x-12 font-display italic font-black text-[11px] text-[#FFD014] whitespace-nowrap">
                INSTALL
              </span>
            </button>
          )}
        </div>
      </div>

      {/* CENTER TWO-COLUMN ARENA: SELECT CAR (Left 7 cols) + SELECT TRACK (Right 5 cols) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2 lg:gap-3.5 my-1.5 lg:my-3 overflow-hidden">
        {/* LEFT PANEL: SELECT CAR */}
        <div className="md:col-span-7 bg-[#0E1625]/92 border border-white/14 rounded-xl p-2 lg:p-3 flex flex-col min-h-0 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="-skew-x-12 bg-[#FFD014] px-3 py-0.5 lg:px-3.5 lg:py-1 inline-flex items-center gap-1.5 shadow">
              <CarFront className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#0B1220] skew-x-12" />
              <span className="skew-x-12 font-display italic font-black text-[11px] lg:text-sm text-[#0B1220] tracking-wide">
                SELECT CAR
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] lg:text-xs">
              <span className="font-display italic font-bold text-white">{spec.name}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono-tabular text-[#FFD014] font-semibold">
                {stats.topSpeedKmh} km/h
              </span>
            </div>
          </div>

          {/* Embedded 3D Turntable Car Stage + Floating 4-Stat Bars */}
          <div className="relative flex-1 min-h-[96px] my-1.5 lg:my-2 rounded-lg overflow-hidden border border-white/10 bg-[#0B1220]">
            <ShowroomCanvas
              vehicle={vehicle}
              sceneMode="select"
              className="w-full h-full"
              interactive={false}
            />

            {/* Left / Right Car Cycle Arrows */}
            <button
              type="button"
              onClick={() => stepCar(-1)}
              aria-label="Previous car"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-10 rounded-md bg-black/45 hover:bg-black/70 border border-white/15 text-white flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => stepCar(1)}
              aria-label="Next car"
              className="absolute right-2 sm:right-[188px] top-1/2 -translate-y-1/2 z-10 w-8 h-10 rounded-md bg-black/45 hover:bg-black/70 border border-white/15 text-white flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Floating Right Stat Card (exact layout of race_selection_screen!) */}
            <div className="hidden sm:flex flex-col gap-2 absolute right-2.5 top-1/2 -translate-y-1/2 z-10 w-[174px] bg-[#0D1524]/90 border border-white/15 rounded-lg p-2.5 shadow-xl">
              {[
                { label: 'Top Speed', val: stats.speedRating, icon: Gauge },
                { label: 'Acceleration', val: stats.accelRating, icon: Zap },
                { label: 'Handling', val: stats.handlingRating, icon: Sliders },
                { label: 'Grip', val: gripRating, icon: Disc },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[10px] leading-none mb-1">
                        <span className="text-slate-200 italic truncate">{row.label}</span>
                        <span className="font-display italic font-bold text-white font-mono-tabular">
                          {row.val}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/12 -skew-x-12 overflow-hidden">
                        <div
                          className="h-full bg-[#FFD014] transition-all duration-200"
                          style={{ width: `${row.val}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Locked Car Unlock Banner if previewing locked chassis */}
            {!isUnlocked && (
              <div className="absolute bottom-2 left-2.5 z-10 flex items-center gap-2 bg-[#0B1220]/92 border border-[#FFD014]/50 px-3 py-1.5 rounded-md">
                <Lock className="w-3.5 h-3.5 text-[#FFD014]" />
                <span className="text-[11px] font-display italic font-bold text-white">
                  {spec.unlockCost.toLocaleString()} Coins
                </span>
                {canAfford && (
                  <button
                    type="button"
                    onClick={() => onUnlockChassis(vehicle.chassisId)}
                    className="ml-1 px-2 py-0.5 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] text-[10px] font-display italic font-black rounded-xs inline-flex items-center gap-1"
                  >
                    <Unlock className="w-3 h-3" />
                    UNLOCK
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bottom 6-Car Thumbnail Strip */}
          <div className="grid grid-cols-6 gap-1.5 shrink-0">
            {CHASSIS_ORDER.map((cid) => {
              const c = CHASSIS_SPECS[cid];
              const selected = vehicle.chassisId === cid;
              const unlocked = unlockedChassis.includes(cid);
              return (
                <button
                  key={cid}
                  type="button"
                  onClick={() => onSelectChassis(cid)}
                  className={`relative -skew-x-6 rounded-md p-1 border-2 transition-all overflow-hidden ${
                    selected
                      ? 'bg-[#1A2840] border-[#FFD014] shadow-[0_0_12px_rgba(255,208,20,0.4)]'
                      : 'bg-[#111A29] border-white/12 hover:border-white/30'
                  }`}
                >
                  <div className="skew-x-6 flex flex-col items-center">
                    <CarCardThumb
                      chassisId={cid}
                      primaryColor={selected ? vehicle.primaryColor : c.defaultColor}
                      accentColor={selected ? vehicle.accentColor : c.defaultAccent}
                      className="w-full h-8 sm:h-10"
                    />
                    {!unlocked && (
                      <span className="absolute top-0.5 right-0.5 bg-[#0B1220]/90 text-[#FFD014] rounded-xs px-1 py-0.5 text-[8px] font-mono-tabular font-bold flex items-center gap-0.5">
                        <Lock className="w-2 h-2" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL: SELECT TRACK */}
        <div className="md:col-span-5 bg-[#0E1625]/92 border border-white/14 rounded-xl p-2 lg:p-3 flex flex-col min-h-0 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 shrink-0 mb-1.5 lg:mb-2">
            <div className="-skew-x-12 bg-[#FFD014] px-3 py-0.5 lg:px-3.5 lg:py-1 inline-flex items-center gap-1.5 shadow">
              <MapPin className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#0B1220] skew-x-12" />
              <span className="skew-x-12 font-display italic font-black text-[11px] lg:text-sm text-[#0B1220] tracking-wide">
                SELECT TRACK
              </span>
            </div>
            <span className="text-[10px] lg:text-[11px] text-slate-400 font-mono-tabular">
              {selectedMode === 'last-man-standing'
                ? '15 Cars · Last Car Eliminated Each Lap · 1st: 1,000'
                : '1st: 500 · 2nd: 300 · 3rd: 150'}
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-1.5 lg:gap-2 overflow-y-auto custom-scroll pr-1">
            {TRACK_ORDER.map((tid) => {
              const tr = TRACK_SPECS[tid];
              const active = selectedTrack === tid;
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => onSelectTrack(tid)}
                  className={`relative shrink-0 h-[56px] lg:h-[70px] rounded-lg border-2 overflow-hidden flex items-center gap-2 lg:gap-3 p-1 pr-2 lg:p-1.5 lg:pr-3 text-left transition-all ${
                    active
                      ? 'bg-[#192842] border-[#FFD014] shadow-[0_0_16px_rgba(255,208,20,0.35)]'
                      : 'bg-[#121D30] border-white/12 hover:border-white/30'
                  }`}
                >
                  {/* Illustrated Stylized Track Thumbnail */}
                  <div className="w-20 lg:w-28 h-full rounded-md overflow-hidden border border-white/15 shrink-0">
                    <TrackCardArt trackId={tid} className="w-full h-full" />
                  </div>

                  <div className="flex-1 min-w-0 z-10">
                    <div className="font-display italic font-black text-xs lg:text-base text-white truncate">
                      {tr.name}
                    </div>
                    <div className="text-[10px] lg:text-[11px] text-slate-300 truncate">
                      {TRACK_SUBTITLES[tid]}
                    </div>
                    <div className="mt-0.5 text-[9px] lg:text-[10px] font-mono-tabular text-[#FFD014] font-semibold">
                      {(tr.lengthMeters / 1000).toFixed(2)} km · {tr.difficulty}
                    </div>
                  </div>

                  <CheckeredAccent
                    color={active ? '#FFD014' : '#475569'}
                    className="w-7 h-4 lg:w-10 lg:h-6 shrink-0 opacity-85"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM BAR: RACE MODE | TIME ZONE | LAPS + Big Yellow START RACE >> CTA */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 bg-[#0D1524]/92 border border-white/14 rounded-xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* RACE MODE */}
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-[#FFD014] shrink-0" />
            <div>
              <div className="text-[9px] font-display italic font-bold text-slate-400 leading-none mb-1">
                RACE MODE
              </div>
              <select
                aria-label="Race Mode"
                value={selectedMode}
                onChange={(e) => onSelectMode(e.target.value as GameMode)}
                className="h-7 px-2 rounded bg-[#162338] border border-white/18 text-xs font-display italic font-bold text-white focus:outline-none focus:border-[#FFD014]"
              >
                <option value="quick-race">Quick Race</option>
                <option value="last-man-standing">Last Man Standing (15 Cars)</option>
                <option value="time-trial">Time Trial</option>
                <option value="multiplayer">Multiplayer</option>
              </select>
            </div>
          </div>

          {/* TIME ZONE (Morning / Evening / Night) */}
          <div className="flex items-center gap-2">
            {timeOfDay === 'morning' ? (
              <Sun className="w-4 h-4 text-[#FFD014] shrink-0" />
            ) : timeOfDay === 'evening' ? (
              <Sunset className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <div>
              <div className="text-[9px] font-display italic font-bold text-slate-400 leading-none mb-1">
                TIME ZONE
              </div>
              <select
                aria-label="Time of Day"
                value={timeOfDay}
                onChange={(e) => onSelectTimeOfDay(e.target.value as TimeOfDay)}
                className="h-7 px-2 rounded bg-[#162338] border border-white/18 text-xs font-display italic font-bold text-white focus:outline-none focus:border-[#FFD014]"
              >
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
            </div>
          </div>

          {/* CLIMATE (Dynamic / Rain / Snow / Mist / Clear) */}
          <div className="flex items-center gap-2">
            {climateMode === 'rain' ? (
              <CloudRain className="w-4 h-4 text-sky-400 shrink-0" />
            ) : climateMode === 'snow' ? (
              <Snowflake className="w-4 h-4 text-cyan-200 shrink-0" />
            ) : climateMode === 'mist' ? (
              <CloudFog className="w-4 h-4 text-slate-300 shrink-0" />
            ) : climateMode === 'clear' ? (
              <Sun className="w-4 h-4 text-[#FFD014] shrink-0" />
            ) : (
              <CloudSun className="w-4 h-4 text-[#FFD014] shrink-0" />
            )}
            <div>
              <div className="text-[9px] font-display italic font-bold text-slate-400 leading-none mb-1">
                CLIMATE
              </div>
              <select
                aria-label="Track Climate"
                value={climateMode}
                onChange={(e) => onSelectClimateMode(e.target.value as ClimateMode)}
                className="h-7 px-2 rounded bg-[#162338] border border-white/18 text-xs font-display italic font-bold text-white focus:outline-none focus:border-[#FFD014]"
              >
                <option value="dynamic">Dynamic (Rain/Snow/Mist)</option>
                <option value="rain">Rain</option>
                <option value="snow">Snow</option>
                <option value="mist">Mist</option>
                <option value="clear">Clear</option>
              </select>
            </div>
          </div>

          {/* LAPS DROPDOWN (Fixed to 14 Knockout Laps for Last Man Standing) */}
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-[#FFD014] shrink-0" />
            <div>
              <label
                htmlFor="select-race-laps"
                className="block text-[9px] font-display italic font-bold text-slate-400 leading-none mb-1"
              >
                {selectedMode === 'last-man-standing' ? 'KNOCKOUT' : 'LAPS'}
              </label>
              {selectedMode === 'last-man-standing' ? (
                <div className="h-7 px-2.5 rounded bg-[#2A1016] border border-[#E5252B]/65 text-xs font-display italic font-black text-[#FFD014] flex items-center whitespace-nowrap">
                  15 Cars · 14 Laps
                </div>
              ) : (
                <div className="relative">
                  <select
                    id="select-race-laps"
                    aria-label="Select Number of Laps"
                    value={laps}
                    onChange={(e) => onSelectLaps(Number(e.target.value))}
                    className="appearance-none h-7 pl-2.5 pr-7 rounded bg-[#162338] border border-[#FFD014]/50 text-xs font-display italic font-black text-white focus:outline-none focus:border-[#FFD014] cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 7, 10].map((n) => (
                      <option key={n} value={n} className="bg-[#0B1424] text-white">
                        {n} {n === 1 ? 'Lap' : 'Laps'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#FFD014]" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BIG BOLD YELLOW SKEWED START RACE >> CTA */}
        <button
          type="button"
          onClick={onStartRace}
          className="h-11 sm:h-12 px-7 sm:px-10 -skew-x-12 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] font-display italic font-black text-base sm:text-lg tracking-wide shadow-[0_0_24px_rgba(255,208,20,0.45)] transition-all active:scale-95"
        >
          <span className="skew-x-12 flex items-center gap-1.5 whitespace-nowrap">
            {isUnlocked ? 'START RACE »' : 'RACE WITH OWNED »'}
          </span>
        </button>
      </div>
    </div>
  );
}
