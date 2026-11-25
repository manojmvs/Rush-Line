import { useEffect, useState } from 'react';
import { RefreshCw, Trophy, X } from 'lucide-react';
import {
  CHASSIS_SPECS,
  TRACK_SPECS,
  formatLapTime,
  type LeaderboardEntry,
  type TrackId,
} from '../types/game.ts';
import { fetchLeaderboard } from '../services/multiplayer.ts';
import { CheckeredAccent } from './GameArtWidgets.tsx';

interface LeaderboardOverlayProps {
  initialTrack: TrackId;
  highlightId?: string | null;
  onClose: () => void;
}

export function LeaderboardOverlay({ initialTrack, highlightId, onClose }: LeaderboardOverlayProps) {
  const [trackFilter, setTrackFilter] = useState<string>(initialTrack);
  const [platformFilter, setPlatformFilter] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchLeaderboard({
        trackId: trackFilter,
        platform: platformFilter,
      });
      setEntries(list);
    } catch {
      setError('Unable to reach global rankings server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [trackFilter, platformFilter]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#050A14]/82 p-3 sm:p-4">
      <div className="w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-lg bg-[#0B1424] border border-white/18 shadow-2xl overflow-hidden">
        {/* Header aligned with Apex Circuit Motorsport Theme */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3 bg-[#08101E] border-b-2 border-[#FFD014]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="-skew-x-12 w-8 h-8 bg-[#FFD014] text-[#0B1220] flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 skew-x-12" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display italic font-black text-base sm:text-xl text-white tracking-wide truncate">
                  GLOBAL LEADERBOARD
                </h2>
                <CheckeredAccent color="#FFD014" className="hidden sm:block w-10 h-4 shrink-0" />
              </div>
              <div className="text-[11px] font-display italic font-bold text-slate-300 truncate">
                Verified Cross-Platform Lap &amp; Race Records
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadData}
              className="-skew-x-10 w-9 h-9 bg-[#14223A] hover:bg-[#1E3254] border border-white/18 flex items-center justify-center text-[#FFD014] transition-colors"
              aria-label="Refresh leaderboard"
            >
              <RefreshCw className={`w-4 h-4 skew-x-10 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="-skew-x-10 w-9 h-9 bg-[#14223A] hover:bg-[#E5252B] border border-white/18 flex items-center justify-center text-white transition-colors"
              aria-label="Close leaderboard"
            >
              <X className="w-5 h-5 skew-x-10" />
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-5 py-2.5 border-b border-white/12 bg-[#0E192D]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTrackFilter('all')}
              className={`px-3 py-1 -skew-x-10 text-xs font-display italic font-black transition-colors whitespace-nowrap border ${
                trackFilter === 'all'
                  ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                  : 'bg-[#122038] border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              <span className="block skew-x-10">ALL TRACKS</span>
            </button>
            {(Object.keys(TRACK_SPECS) as TrackId[]).map((tid) => (
              <button
                key={tid}
                type="button"
                onClick={() => setTrackFilter(tid)}
                className={`px-2.5 py-1 -skew-x-10 text-xs font-display italic font-black transition-colors whitespace-nowrap border ${
                  trackFilter === tid
                    ? 'bg-[#FFD014] border-[#FFD014] text-[#0B1220]'
                    : 'bg-[#122038] border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                <span className="block skew-x-10">{TRACK_SPECS[tid].name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(
              [
                ['all', 'ALL'],
                ['mobile', 'MOBILE'],
                ['desktop', 'DESKTOP'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setPlatformFilter(val)}
                className={`px-2.5 py-1 -skew-x-10 text-xs font-display italic font-black transition-colors whitespace-nowrap border ${
                  platformFilter === val
                    ? 'bg-[#E5252B] border-[#E5252B] text-white'
                    : 'bg-[#122038] border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                <span className="block skew-x-10">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Rankings Table */}
        <div className="flex-1 overflow-auto custom-scroll">
          {error ? (
            <div className="p-8 text-center text-sm font-display italic font-bold text-red-300">{error}</div>
          ) : loading ? (
            <div className="p-8 text-center text-sm font-display italic font-bold text-slate-400">
              Loading global standings...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-sm font-display italic font-bold text-slate-400">
              No records match this filter yet. Complete a race to claim P1.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/12 text-[11px] font-display italic font-black text-[#FFD014] bg-[#08101E]">
                  <th className="py-2.5 pl-4 sm:pl-5 pr-2">RANK</th>
                  <th className="py-2.5 px-3">DRIVER</th>
                  <th className="py-2.5 px-3">TRACK / CAR</th>
                  <th className="py-2.5 px-3 text-right">BEST LAP</th>
                  <th className="py-2.5 px-3 text-right">RACE TOTAL</th>
                  <th className="py-2.5 pl-3 pr-4 sm:pr-5 text-right">TOP SPEED</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08] text-sm">
                {entries.map((entry, idx) => {
                  const isHighlighted = highlightId === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className={`${
                        isHighlighted ? 'bg-[#FFD014]/15' : 'hover:bg-[#13223B]'
                      } transition-colors`}
                    >
                      <td className="py-2.5 pl-4 sm:pl-5 pr-2 font-mono-tabular font-black">
                        <span
                          className={
                            idx === 0
                              ? 'text-[#FFD014]'
                              : idx === 1
                              ? 'text-slate-100'
                              : idx === 2
                              ? 'text-orange-400'
                              : 'text-slate-400'
                          }
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-display italic font-black text-white">{entry.driverName}</div>
                        <div className="text-[11px] text-slate-300">
                          {entry.platform} ·{' '}
                          {entry.mode === 'multiplayer'
                            ? 'Multiplayer'
                            : entry.mode === 'time-trial'
                            ? 'Time Trial'
                            : 'Quick Race'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-white text-xs font-display italic font-bold">
                          {TRACK_SPECS[entry.trackId].name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {CHASSIS_SPECS[entry.chassisId].name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-[#FFD014]">
                        {formatLapTime(entry.bestLapMs)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-200">
                        {formatLapTime(entry.totalTimeMs)}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 sm:pr-5 text-right font-mono-tabular text-slate-200">
                        {entry.topSpeedKmh} km/h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
