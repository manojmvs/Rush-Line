import { useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Coins,
  Disc,
  Flame,
  Gauge,
  Lock,
  Palette,
  Paintbrush,
  RotateCcw,
  Settings,
  Sliders,
  Sparkles,
  Unlock,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  CHASSIS_ORDER,
  CHASSIS_SPECS,
  type AeroSetup,
  type ChassisId,
  type LiveryStyle,
  type PaintFinish,
  type RimStyle,
  type SuspensionSetup,
  type TireCompound,
  type TransmissionMode,
  type VehicleConfig,
  type WingStyle,
} from '../types/game.ts';
import { computeVehicleStats } from '../game/physics.ts';
import { CarCardThumb, CheckeredAccent } from './GameArtWidgets.tsx';

interface GarageDockProps {
  vehicle: VehicleConfig;
  equippedChassisId: ChassisId;
  coins: number;
  unlockedChassis: ChassisId[];
  transmissionMode: TransmissionMode;
  onToggleTransmission: () => void;
  onSelectChassis: (chassisId: ChassisId) => void;
  onUnlockChassis: (chassisId: ChassisId) => void;
  onChange: (next: VehicleConfig) => void;
  onResetVehicle: () => void;
  onBack: () => void;
  onGoToSelectRace: () => void;
}

type GarageTab = 'upgrade' | 'customize' | 'paint' | 'decals';

const CHASSIS_CLASS: Record<ChassisId, string> = {
  'apex-gtr': 'C',
  'drift-s15': 'C',
  'vanguard-v8': 'B',
  'veloce-v12': 'A',
  'stratos-gt3': 'S',
  'hyperion-proto': 'S+',
};

const PAINT_SWATCHES = [
  { name: 'Rally Red', hex: '#E12D2D' },
  { name: 'Cobalt Blue', hex: '#2563EB' },
  { name: 'Sunset Orange', hex: '#F97316' },
  { name: 'Acid Lime', hex: '#65A30D' },
  { name: 'Hyper Violet', hex: '#9333EA' },
  { name: 'Solar Yellow', hex: '#FACC15' },
  { name: 'Glacier White', hex: '#F1F5F9' },
  { name: 'Obsidian', hex: '#1E293B' },
  { name: 'Cyan Apex', hex: '#0EA5E9' },
  { name: 'Racing Green', hex: '#15803D' },
];

const ACCENT_SWATCHES = ['#F8FAFC', '#FFD014', '#0F172A', '#EF4444', '#38BDF8', '#22C55E'];
const CALIPER_SWATCHES = ['#FFD014', '#EF4444', '#38BDF8', '#22C55E', '#F8FAFC'];
const RIM_SWATCHES = ['#E2E8F0', '#1E293B', '#FFD014', '#94A3B8'];

const SUSP_ORDER: SuspensionSetup[] = ['soft', 'balanced', 'stiff'];
const TIRE_ORDER: TireCompound[] = ['street', 'semi-slick', 'racing-slick'];

export function GarageDock({
  vehicle,
  equippedChassisId,
  coins,
  unlockedChassis,
  transmissionMode,
  onToggleTransmission,
  onSelectChassis,
  onUnlockChassis,
  onChange,
  onResetVehicle,
  onBack,
  onGoToSelectRace,
}: GarageDockProps) {
  const [tab, setTab] = useState<GarageTab>('upgrade');
  const stats = computeVehicleStats(vehicle);
  const spec = CHASSIS_SPECS[vehicle.chassisId];
  const isCurrentUnlocked = unlockedChassis.includes(vehicle.chassisId);
  const canAffordCurrent = coins >= spec.unlockCost;
  const coinsNeeded = Math.max(0, spec.unlockCost - coins);
  const gripRating = Math.min(100, Math.round(stats.gripCoeff * 64));

  const patch = (partial: Partial<VehicleConfig>) => {
    onChange({ ...vehicle, ...partial });
  };

  const currentIdx = CHASSIS_ORDER.indexOf(vehicle.chassisId);
  const stepCar = (dir: -1 | 1) => {
    const nextIdx = (currentIdx + dir + CHASSIS_ORDER.length) % CHASSIS_ORDER.length;
    onSelectChassis(CHASSIS_ORDER[nextIdx]);
  };

  const suspLv = SUSP_ORDER.indexOf(vehicle.suspension) + 1;
  const tireLv = TIRE_ORDER.indexOf(vehicle.tireCompound) + 1;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between gap-1.5 lg:gap-2.5 p-2 sm:px-3 sm:py-2 lg:p-4 select-none overflow-hidden">
      {/* TOP BAR: Back + Skewed GARAGE Header + Coins (strictly shrink-0 so nothing overlaps it) */}
      <div className="shrink-0 flex items-center justify-between gap-2 z-20">
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Menu"
            className="w-9 h-8 lg:w-12 lg:h-10 -skew-x-12 rounded-md bg-[#111A29]/92 hover:bg-[#1B2A42] border border-white/18 text-white flex items-center justify-center transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 skew-x-12" />
          </button>

          <div className="relative -skew-x-12 bg-[#111A29]/92 border border-white/15 px-3 sm:px-4 lg:px-6 py-1 lg:py-1.5 flex items-center gap-2">
            <span className="skew-x-12 font-display italic font-black text-sm sm:text-base lg:text-2xl tracking-wide text-white leading-none">
              GARAGE
            </span>
            <CheckeredAccent
              color="#FFD014"
              className="skew-x-12 w-7 h-3.5 lg:w-11 lg:h-6"
            />
            <div className="absolute left-0 right-0 bottom-0 h-[2px] lg:h-[3px] bg-[#FFD014]" />
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5">
          <div className="-skew-x-12 bg-[#111A29]/92 border border-white/18 pl-2.5 pr-1 py-0.5 lg:pl-3 lg:pr-1.5 lg:py-1 flex items-center gap-2 rounded-sm">
            <div className="skew-x-12 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#FFD014]" />
              <span className="font-display italic font-bold text-xs sm:text-sm lg:text-base text-white font-mono-tabular">
                {coins.toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              onClick={onGoToSelectRace}
              title="Win races to earn 500 / 300 / 100 Coins"
              className="w-6 h-6 lg:w-7 lg:h-7 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] flex items-center justify-center font-black text-xs lg:text-sm rounded-xs transition-colors"
            >
              <span className="skew-x-12 leading-none">+</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onGoToSelectRace}
            className="flex -skew-x-12 h-8 lg:h-9 px-3 lg:px-4 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] font-display italic font-black text-[11px] lg:text-xs tracking-wide items-center justify-center rounded-sm transition-colors"
          >
            <span className="skew-x-12 whitespace-nowrap">RACE NOW »</span>
          </button>
        </div>
      </div>

      {/* MIDDLE ROW: Left Floating Stats Card + Open 3D Turntable Center + Right Floating Action Panel
          Strictly bounded by flex-1 min-h-0 so panels NEVER overflow over top header or bottom tabs! */}
      <div className="flex-1 min-h-0 flex items-center justify-between gap-2 lg:gap-3 overflow-hidden">
        {/* LEFT FLOATING STATS CARD */}
        <div className="pointer-events-auto w-[184px] sm:w-[205px] lg:w-[252px] max-h-full flex flex-col shrink-0 min-h-0">
          {/* Skewed Yellow Car Name + Class Header */}
          <div className="shrink-0 flex items-stretch -mb-0.5 z-10 pr-1.5">
            <div className="flex-1 -skew-x-12 bg-[#FFD014] px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-md min-w-0">
              <div className="skew-x-12 font-display italic font-black text-[11px] sm:text-xs lg:text-base text-[#0B1220] truncate leading-none">
                {spec.name.toUpperCase()}
              </div>
            </div>
            <div className="-skew-x-12 bg-[#162338] border border-white/20 px-2 lg:px-2.5 py-1 lg:py-1.5 ml-1 flex items-center justify-center shrink-0">
              <span className="skew-x-12 font-display italic font-black text-[11px] lg:text-sm text-white leading-none">
                {CHASSIS_CLASS[vehicle.chassisId]}
              </span>
            </div>
          </div>

          {/* Dark Navy Stats Container (internally scrollable on ultra-short viewports, zero external overlap) */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scroll bg-[#0F1726]/92 border border-white/15 rounded-lg p-2 pt-2.5 lg:p-3 lg:pt-3.5 space-y-1.5 lg:space-y-2.5 shadow-xl">
            {[
              {
                label: 'Top Speed',
                val: stats.speedRating,
                delta: vehicle.engineLevel > 1 ? `+${(vehicle.engineLevel - 1) * 3}` : null,
                icon: Gauge,
              },
              {
                label: 'Acceleration',
                val: stats.accelRating,
                delta: vehicle.engineLevel > 1 ? `+${(vehicle.engineLevel - 1) * 4}` : null,
                icon: Zap,
              },
              {
                label: 'Handling',
                val: stats.handlingRating,
                delta: suspLv > 1 ? `+${(suspLv - 1) * 4}` : null,
                icon: Sliders,
              },
              {
                label: 'Grip',
                val: gripRating,
                delta: tireLv > 1 ? `+${(tireLv - 1) * 5}` : null,
                icon: Disc,
              },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-1.5 lg:gap-2">
                  <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between text-[10px] lg:text-[11px] leading-none mb-0.5 lg:mb-1">
                      <span className="text-slate-200 font-medium italic truncate">{row.label}</span>
                      <div className="flex items-baseline gap-1 font-mono-tabular shrink-0">
                        <span className="font-display italic font-bold text-white text-[11px] lg:text-xs">
                          {row.val}
                        </span>
                        {row.delta && (
                          <span className="text-[9px] lg:text-[10px] font-bold text-emerald-400">
                            {row.delta}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 lg:h-2 bg-white/12 -skew-x-12 overflow-hidden">
                      <div
                        className="h-full bg-[#FFD014] transition-all duration-200"
                        style={{ width: `${row.val}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Top Speed & Unlock / Status Footer */}
            <div className="pt-1.5 lg:pt-2 border-t border-white/10">
              {!isCurrentUnlocked ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    disabled={!canAffordCurrent}
                    onClick={() => onUnlockChassis(vehicle.chassisId)}
                    className={`w-full h-7 lg:h-9 -skew-x-10 font-display italic font-black text-[10px] lg:text-xs flex items-center justify-center gap-1 transition-colors ${
                      canAffordCurrent
                        ? 'bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220]'
                        : 'bg-white/10 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="skew-x-10 flex items-center gap-1">
                      {canAffordCurrent ? (
                        <Unlock className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      ) : (
                        <Lock className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      )}
                      {canAffordCurrent
                        ? `UNLOCK · ${spec.unlockCost.toLocaleString()}`
                        : `NEED ${coinsNeeded.toLocaleString()} COINS`}
                    </span>
                  </button>
                  <div className="hidden lg:block text-[10px] text-slate-400 text-center">
                    Win Races · 1st: 500 · 2nd: 300 · 3rd: 100
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[10px] lg:text-[11px] font-mono-tabular">
                  <span className="text-slate-300 truncate">
                    {stats.topSpeedKmh} km/h · {stats.peakPowerKw} kW
                  </span>
                  <span className="text-emerald-400 font-bold shrink-0 ml-1">
                    {equippedChassisId === vehicle.chassisId ? 'EQUIPPED' : 'OWNED'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT FLOATING ACTION PANEL (UPGRADE / CUSTOMIZE / PAINT / DECALS) */}
        <div className="pointer-events-auto w-[212px] sm:w-[235px] lg:w-[295px] max-h-full flex flex-col shrink-0 min-h-0">
          {/* Yellow Skewed Header */}
          <div className="shrink-0 flex items-center justify-between -mb-0.5 z-10 px-1">
            <div className="-skew-x-12 bg-[#FFD014] px-3 lg:px-4 py-1 lg:py-1.5 shadow-md flex items-center gap-1.5">
              {tab === 'upgrade' && <Wrench className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-[#0B1220] skew-x-12" />}
              {tab === 'customize' && <Settings className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-[#0B1220] skew-x-12" />}
              {tab === 'paint' && <Paintbrush className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-[#0B1220] skew-x-12" />}
              {tab === 'decals' && <Sparkles className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-[#0B1220] skew-x-12" />}
              <span className="skew-x-12 font-display italic font-black text-[11px] lg:text-sm text-[#0B1220] tracking-wide leading-none">
                {tab.toUpperCase()}
              </span>
            </div>

            <button
              type="button"
              onClick={onResetVehicle}
              title="Reset to stock defaults"
              className="w-6 h-6 lg:w-7 lg:h-7 rounded-md bg-[#111A29]/90 border border-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
            >
              <RotateCcw className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scroll bg-[#0F1726]/92 border border-white/15 rounded-lg p-1.5 pt-2 lg:p-2.5 lg:pt-3.5 shadow-xl">
            {tab === 'upgrade' && (
              <div className="space-y-1 lg:space-y-1.5">
                <UpgradeRow
                  icon={<Gauge className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />}
                  name="Engine"
                  levelLabel={`Lv. ${vehicle.engineLevel}`}
                  level={vehicle.engineLevel}
                  maxLevel={5}
                  actionLabel={vehicle.engineLevel >= 5 ? 'MAX' : 'UP'}
                  onUpgrade={() =>
                    patch({ engineLevel: vehicle.engineLevel >= 5 ? 1 : vehicle.engineLevel + 1 })
                  }
                />

                <UpgradeRow
                  icon={<Settings className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />}
                  name="6-Spd Gearbox"
                  levelLabel={transmissionMode === 'manual' ? 'MANUAL' : 'AUTO'}
                  level={transmissionMode === 'manual' ? 5 : 4}
                  maxLevel={5}
                  actionLabel="SWAP"
                  onUpgrade={onToggleTransmission}
                />

                <UpgradeRow
                  icon={<Sliders className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />}
                  name="Suspension"
                  levelLabel={`Lv. ${suspLv}`}
                  level={suspLv}
                  maxLevel={3}
                  actionLabel={suspLv >= 3 ? 'MAX' : 'UP'}
                  onUpgrade={() => patch({ suspension: SUSP_ORDER[suspLv % SUSP_ORDER.length] })}
                />

                <UpgradeRow
                  icon={<Disc className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />}
                  name="Tires"
                  levelLabel={`Lv. ${tireLv}`}
                  level={tireLv}
                  maxLevel={3}
                  actionLabel={tireLv >= 3 ? 'MAX' : 'UP'}
                  onUpgrade={() => patch({ tireCompound: TIRE_ORDER[tireLv % TIRE_ORDER.length] })}
                />

                <UpgradeRow
                  icon={<Flame className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />}
                  name="Nitro"
                  levelLabel={`Lv. ${vehicle.nitroLevel}`}
                  level={vehicle.nitroLevel}
                  maxLevel={5}
                  actionLabel={vehicle.nitroLevel >= 5 ? 'MAX' : 'UP'}
                  onUpgrade={() =>
                    patch({ nitroLevel: vehicle.nitroLevel >= 5 ? 1 : vehicle.nitroLevel + 1 })
                  }
                />
              </div>
            )}

            {tab === 'customize' && (
              <div className="space-y-2 lg:space-y-3 text-xs">
                <div>
                  <div className="text-[10px] lg:text-[11px] font-display italic text-slate-300 mb-1">
                    REAR WING
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        ['stock', 'Lip Spoiler'],
                        ['gt-carbon', 'GT Carbon'],
                        ['swan-neck', 'Swan-Neck'],
                        ['delete', 'Wing Delete'],
                      ] as Array<[WingStyle, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => patch({ wingStyle: id })}
                        className={`py-1 lg:py-1.5 px-1.5 lg:px-2 rounded border text-[10px] lg:text-[11px] font-semibold transition-colors ${
                          vehicle.wingStyle === id
                            ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                            : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] lg:text-[11px] font-display italic text-slate-300 mb-1">
                    AERO PACKAGE
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['low-drag', 'Low Drag'],
                        ['balanced', 'Balanced'],
                        ['high-downforce', 'Downforce'],
                      ] as Array<[AeroSetup, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => patch({ aero: id })}
                        className={`py-1 lg:py-1.5 px-1 rounded border text-[9px] lg:text-[10px] font-semibold transition-colors ${
                          vehicle.aero === id
                            ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                            : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] lg:text-[11px] font-display italic text-slate-300 mb-1">
                    WHEEL RIMS
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['five-spoke', '5-Spoke'],
                        ['turbine', 'Turbine'],
                        ['aero-disc', 'Aero Disc'],
                      ] as Array<[RimStyle, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => patch({ rimStyle: id })}
                        className={`py-1 lg:py-1.5 px-1 rounded border text-[9px] lg:text-[10px] font-semibold transition-colors ${
                          vehicle.rimStyle === id
                            ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                            : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'paint' && (
              <div className="space-y-2 lg:space-y-3">
                <div>
                  <div className="text-[10px] lg:text-[11px] font-display italic text-slate-300 mb-1">
                    BODY COLOR
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 lg:gap-2">
                    {PAINT_SWATCHES.map((sw) => (
                      <button
                        key={sw.hex}
                        type="button"
                        title={sw.name}
                        onClick={() => patch({ primaryColor: sw.hex })}
                        className={`h-6 lg:h-8 rounded-md border-2 transition-transform ${
                          vehicle.primaryColor === sw.hex
                            ? 'border-[#FFD014] scale-105'
                            : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] lg:text-[11px] font-display italic text-slate-300 mb-1">
                    PAINT FINISH
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['gloss', 'metallic', 'matte'] as PaintFinish[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => patch({ paintFinish: f })}
                        className={`py-1 lg:py-1.5 rounded border text-[10px] lg:text-[11px] font-semibold capitalize transition-colors ${
                          vehicle.paintFinish === f
                            ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                            : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'decals' && (
              <div className="space-y-2 lg:space-y-3">
                <div>
                  <div className="text-[10px] lg:text-[11px] font-display italic text-slate-300 mb-1">
                    RACING LIVERY
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        ['clean', 'Clean'],
                        ['center-stripe', 'Center Stripe'],
                        ['dual-stripe', 'Dual Stripes'],
                        ['side-blade', 'Side Blade'],
                      ] as Array<[LiveryStyle, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => patch({ liveryStyle: id })}
                        className={`py-1 lg:py-1.5 px-1.5 rounded border text-[10px] lg:text-[11px] font-semibold transition-colors ${
                          vehicle.liveryStyle === id
                            ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                            : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] lg:text-[10px] font-display italic text-slate-300 mb-1">
                      STRIPE COLOR
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ACCENT_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => patch({ accentColor: hex })}
                          className={`w-5 h-5 lg:w-6 lg:h-6 rounded border-2 ${
                            vehicle.accentColor === hex ? 'border-[#FFD014] scale-110' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] lg:text-[10px] font-display italic text-slate-300 mb-1">
                      RIMS &amp; CALIPERS
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {RIM_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => patch({ rimColor: hex })}
                          className={`w-5 h-5 lg:w-6 lg:h-6 rounded border-2 ${
                            vehicle.rimColor === hex ? 'border-[#FFD014] scale-110' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      {CALIPER_SWATCHES.slice(0, 2).map((hex) => (
                        <button
                          key={`cal-${hex}`}
                          type="button"
                          onClick={() => patch({ caliperColor: hex })}
                          className={`w-5 h-5 lg:w-6 lg:h-6 rounded-full border-2 ${
                            vehicle.caliperColor === hex ? 'border-[#FFD014] scale-110' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ZONE: 4 Skewed Tabs + Horizontal Car Carousel Strip (compact on mobile landscape!) */}
      <div className="shrink-0 pointer-events-auto flex flex-col items-center gap-1 lg:gap-2 z-20">
        {/* 4 Skewed Mode Tabs */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 lg:gap-3">
          {(
            [
              ['upgrade', 'UPGRADE', Wrench],
              ['customize', 'CUSTOMIZE', Palette],
              ['paint', 'PAINT', Paintbrush],
              ['decals', 'DECALS', Sparkles],
            ] as Array<[GarageTab, string, typeof Wrench]>
          ).map(([id, label, Icon]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`-skew-x-12 px-2.5 sm:px-4 lg:px-7 py-1 lg:py-2 rounded-sm border font-display italic font-black text-[10px] sm:text-xs lg:text-sm tracking-wide transition-colors ${
                  active
                    ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220] shadow-[0_0_14px_rgba(255,208,20,0.4)]'
                    : 'bg-[#131E31]/92 border-white/15 text-white hover:bg-[#1C2B45]'
                }`}
              >
                <span className="skew-x-12 flex items-center gap-1 lg:gap-1.5 whitespace-nowrap">
                  <Icon className="w-3 h-3 lg:w-4 lg:h-4" />
                  <span>{label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom Car Carousel with < and > arrows */}
        <div className="w-full max-w-5xl flex items-center gap-1.5 lg:gap-2">
          <button
            type="button"
            onClick={() => stepCar(-1)}
            aria-label="Previous car"
            className="w-7 h-11 lg:w-10 lg:h-16 rounded-md bg-[#111A29]/88 hover:bg-[#1C2B45] border border-white/15 text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 lg:w-6 lg:h-6" />
          </button>

          <div className="flex-1 grid grid-cols-6 gap-1.5 lg:gap-2">
            {CHASSIS_ORDER.map((cid) => {
              const c = CHASSIS_SPECS[cid];
              const selected = vehicle.chassisId === cid;
              const unlocked = unlockedChassis.includes(cid);
              return (
                <button
                  key={cid}
                  type="button"
                  onClick={() => onSelectChassis(cid)}
                  className={`relative -skew-x-8 rounded-md px-1 py-0.5 lg:p-1.5 border-2 transition-all overflow-hidden ${
                    selected
                      ? 'bg-[#1A273D]/95 border-[#FFD014] shadow-[0_0_14px_rgba(255,208,20,0.4)]'
                      : 'bg-[#0E1624]/88 border-white/15 hover:border-white/35'
                  }`}
                >
                  <div className="skew-x-8 flex flex-col items-center">
                    <CarCardThumb
                      chassisId={cid}
                      primaryColor={selected ? vehicle.primaryColor : c.defaultColor}
                      accentColor={selected ? vehicle.accentColor : c.defaultAccent}
                      className="w-full h-7 lg:h-12"
                    />
                    <div className="w-full flex items-center justify-between gap-0.5 text-[8px] sm:text-[9px] lg:text-[10px] leading-none mt-0.5 px-0.5">
                      <span className="font-display italic font-bold text-white truncate">
                        {c.name}
                      </span>
                      {!unlocked && (
                        <span className="inline-flex items-center gap-0.5 text-[#FFD014] font-mono-tabular font-bold shrink-0">
                          <Lock className="w-2 h-2 lg:w-2.5 lg:h-2.5" />
                          {c.unlockCost}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => stepCar(1)}
            aria-label="Next car"
            className="w-7 h-11 lg:w-10 lg:h-16 rounded-md bg-[#111A29]/88 hover:bg-[#1C2B45] border border-white/15 text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <ChevronRight className="w-5 h-5 lg:w-6 lg:h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

function UpgradeRow({
  icon,
  name,
  levelLabel,
  level,
  maxLevel,
  actionLabel,
  onUpgrade,
}: {
  icon: React.ReactNode;
  name: string;
  levelLabel: string;
  level: number;
  maxLevel: number;
  actionLabel: string;
  onUpgrade: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 lg:gap-2 px-2 py-1 lg:px-2.5 lg:py-1.5 rounded-md bg-[#162235]/90 border border-white/10">
      <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 flex-1">
        <div className="w-6 h-6 lg:w-7 lg:h-7 rounded bg-white/8 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1">
            <span className="font-display italic font-bold text-[10px] lg:text-xs text-white truncate">
              {name}
            </span>
            <span className="text-[9px] lg:text-[10px] font-mono-tabular font-semibold text-slate-300 shrink-0">
              {levelLabel}
            </span>
          </div>
          <div className="flex items-center gap-0.5 lg:gap-1 mt-0.5 lg:mt-1">
            {Array.from({ length: maxLevel }).map((_, i) => (
              <div
                key={i}
                className={`h-1 lg:h-1.5 flex-1 -skew-x-12 ${
                  i < level ? 'bg-[#FFD014]' : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onUpgrade}
        className="h-6 lg:h-7 px-1.5 lg:px-2 -skew-x-8 bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] font-display italic font-black text-[9px] lg:text-[10px] rounded-xs flex items-center justify-center gap-0.5 shrink-0 transition-colors"
      >
        <span className="skew-x-8 flex items-center gap-0.5">
          <ArrowUp className="w-2.5 h-2.5 lg:w-3 lg:h-3 stroke-[3]" />
          {actionLabel}
        </span>
      </button>
    </div>
  );
}
