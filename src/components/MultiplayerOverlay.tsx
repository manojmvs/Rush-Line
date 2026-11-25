import { useEffect, useState } from 'react';
import { Copy, Check, Link2, RefreshCw, Users, Play, LogOut, X } from 'lucide-react';
import {
  CHASSIS_SPECS,
  TRACK_SPECS,
  type PlatformType,
  type RoomState,
  type TrackId,
} from '../types/game.ts';
import {
  fetchPublicRooms,
  type MultiplayerTransport,
  type PublicRoomSummary,
} from '../services/multiplayer.ts';
import { CheckeredAccent } from './GameArtWidgets.tsx';

interface MultiplayerOverlayProps {
  connected: boolean;
  transport: MultiplayerTransport;
  playerId: string;
  initialJoinCode?: string;
  driverName: string;
  platform: PlatformType;
  selectedTrack: TrackId;
  room: RoomState | null;
  errorMessage: string | null;
  onDriverNameChange: (name: string) => void;
  onQuickMatch: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onUpdateSettings: (settings: { trackId?: TrackId; fillWithAi?: boolean; laps?: number }) => void;
  onStartRace: () => void;
  onClose: () => void;
}

export function MultiplayerOverlay({
  connected,
  transport,
  playerId,
  initialJoinCode = '',
  driverName,
  platform,
  selectedTrack,
  room,
  errorMessage,
  onDriverNameChange,
  onQuickMatch,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onUpdateSettings,
  onStartRace,
  onClose,
}: MultiplayerOverlayProps) {
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode);
    }
  }, [initialJoinCode]);

  const loadRooms = async () => {
    if (transport === 'p2p') {
      setPublicRooms([]);
      setLoadingRooms(false);
      return;
    }
    setLoadingRooms(true);
    const list = await fetchPublicRooms();
    setPublicRooms(list);
    setLoadingRooms(false);
  };

  useEffect(() => {
    if (!room) {
      void loadRooms();
    }
  }, [room, transport]);

  const me = room?.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const copyInviteLink = () => {
    if (!room || typeof window === 'undefined') return;
    const inviteUrl = new URL('./', window.location.href);
    inviteUrl.searchParams.set('room', room.code);
    navigator.clipboard?.writeText(inviteUrl.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#050A14]/82 p-3 sm:p-4">
      <div className="w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-lg bg-[#0B1424] border border-white/18 shadow-2xl overflow-hidden">
        {/* Header aligned with Apex Circuit Motorsport Theme */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3 bg-[#08101E] border-b-2 border-[#FFD014]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="-skew-x-12 px-2.5 py-0.5 bg-[#E5252B] text-white font-display italic font-black text-[10px] sm:text-xs shrink-0">
                <span className="block skew-x-12">ONLINE</span>
              </div>
              <h2 className="font-display italic font-black text-base sm:text-xl text-white tracking-wide truncate">
                MULTIPLAYER LOBBY
              </h2>
              <CheckeredAccent color="#FFD014" className="hidden sm:block w-10 h-4 shrink-0" />
            </div>
            <div className="text-[11px] font-display italic font-bold text-slate-300 mt-0.5 flex items-center gap-2 truncate">
              <span className={connected ? 'text-[#FFD014]' : 'text-slate-400'}>
                {connected
                  ? transport === 'p2p'
                    ? 'Lobby Connected (Direct P2P)'
                    : 'Lobby Connected'
                  : 'Connecting...'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{platform}</span>
              <span aria-hidden="true">·</span>
              <span>Cross-Play Enabled</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close multiplayer overlay"
            className="-skew-x-10 w-9 h-9 bg-[#14223A] hover:bg-[#E5252B] border border-white/18 flex items-center justify-center text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5 skew-x-10" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll p-4 sm:p-5 space-y-4 sm:space-y-5">
          {errorMessage && (
            <div className="px-4 py-2.5 rounded bg-[#E5252B]/18 border border-[#E5252B]/55 text-xs font-display italic font-bold text-red-100">
              {errorMessage}
            </div>
          )}

          {!room ? (
            <>
              {/* Driver Callsign + Primary Matchmaking Actions */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-display italic font-black text-[#FFD014] mb-1">
                    DRIVER CALLSIGN
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={driverName}
                    onChange={(e) => onDriverNameChange(e.target.value)}
                    placeholder="Enter driver name"
                    className="w-full h-10 px-3 rounded bg-[#122038] border border-white/20 text-sm font-display italic font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFD014]"
                  />
                </div>
                <div className="md:col-span-7 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={onQuickMatch}
                    className="flex-1 min-w-[130px] h-10 px-4 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] disabled:opacity-50 text-[#0B1220] text-xs sm:text-sm font-display italic font-black transition-colors whitespace-nowrap"
                  >
                    <span className="block skew-x-10">QUICK MATCH »</span>
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={onCreateRoom}
                    className="flex-1 min-w-[130px] h-10 px-4 -skew-x-10 bg-[#14223A] hover:bg-[#1E3254] disabled:opacity-50 text-white text-xs sm:text-sm font-display italic font-black border border-white/20 transition-colors whitespace-nowrap"
                  >
                    <span className="block skew-x-10">CREATE ROOM</span>
                  </button>
                </div>
              </div>

              {/* Join by Cross-Platform Room Code */}
              <div className="pt-3.5 border-t border-white/12 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-display italic font-bold text-slate-300 mb-1">
                    JOIN FRIEND BY 4-CHAR ROOM CODE
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AX7K"
                    className="w-full h-10 px-3 rounded bg-[#122038] border border-white/20 text-sm font-mono-tabular font-bold tracking-widest uppercase text-[#FFD014] placeholder:text-slate-500 focus:outline-none focus:border-[#FFD014]"
                  />
                </div>
                <button
                  type="button"
                  disabled={!connected || joinCode.trim().length < 4}
                  onClick={() => onJoinRoom(joinCode)}
                  className="h-10 px-6 -skew-x-10 bg-[#E5252B] hover:bg-[#f4383f] disabled:opacity-40 text-white text-xs sm:text-sm font-display italic font-black transition-colors whitespace-nowrap"
                >
                  <span className="block skew-x-10">JOIN ROOM »</span>
                </button>
              </div>

              {/* Active Public Lobbies */}
              <div className="pt-3.5 border-t border-white/12">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs sm:text-sm font-display italic font-black text-white">
                    OPEN ROOMS ({TRACK_SPECS[selectedTrack].name} &amp; ALL TRACKS)
                  </h3>
                  <button
                    type="button"
                    onClick={loadRooms}
                    className="px-2.5 py-1 -skew-x-10 bg-[#14223A] hover:bg-[#1E3254] border border-white/15 text-[11px] font-display italic font-bold text-[#FFD014] flex items-center gap-1.5 transition-colors"
                  >
                    <span className="skew-x-10 flex items-center gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                      <span>REFRESH</span>
                    </span>
                  </button>
                </div>

                {publicRooms.length === 0 ? (
                  <div className="py-5 px-4 text-center text-xs font-display italic font-bold text-slate-400 border border-dashed border-white/15 rounded bg-[#0E192D]">
                    {transport === 'p2p'
                      ? 'Direct P2P Cross-Play is live! Click CREATE ROOM and share the 4-character Room Code or Invite Link with friends on any phone or PC to race together.'
                      : 'No open rooms waiting right now. Start a Quick Match or Create Room to host a cross-platform race.'}
                  </div>
                ) : (
                  <div className="divide-y divide-white/10 border border-white/15 rounded overflow-hidden">
                    {publicRooms.map((r) => (
                      <div
                        key={r.code}
                        className="flex items-center justify-between gap-4 px-4 py-2.5 bg-[#101C30] hover:bg-[#162642] transition-colors"
                      >
                        <div>
                          <div className="text-sm font-display italic font-black text-white flex items-center gap-2">
                            <span className="font-mono-tabular text-[#FFD014]">{r.code}</span>
                            <span>{TRACK_SPECS[r.trackId].name}</span>
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">
                            Host: {r.hostName} · {r.playerCount}/{r.maxPlayers} Drivers · {r.platforms.join(', ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJoinRoom(r.code)}
                          className="px-4 py-1.5 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] text-xs font-display italic font-black text-[#0B1220] transition-colors whitespace-nowrap"
                        >
                          <span className="block skew-x-10">JOIN GRID »</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Active Room Lobby View */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-3.5 border-b border-white/12">
                <div>
                  <div className="text-[11px] font-display italic font-bold text-slate-300">ROOM INVITE CODE</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono-tabular font-black text-2xl tracking-[0.2em] text-[#FFD014]">
                      {room.code}
                    </span>
                    <button
                      type="button"
                      onClick={copyCode}
                      className="px-3 py-1.5 -skew-x-10 bg-[#14223A] hover:bg-[#1E3254] border border-white/18 text-xs font-display italic font-bold text-white flex items-center gap-1.5 transition-colors"
                    >
                      <span className="skew-x-10 flex items-center gap-1.5">
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#FFD014]" />}
                        <span>{copied ? 'COPIED' : 'COPY CODE'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="px-3 py-1.5 -skew-x-10 bg-[#14223A] hover:bg-[#1E3254] border border-[#FFD014]/45 text-xs font-display italic font-bold text-[#FFD014] flex items-center gap-1.5 transition-colors"
                    >
                      <span className="skew-x-10 flex items-center gap-1.5">
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'LINK COPIED' : 'INVITE LINK'}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {isHost ? (
                    <>
                      <select
                        aria-label="Select Multiplayer Track"
                        value={room.trackId}
                        onChange={(e) => onUpdateSettings({ trackId: e.target.value as TrackId })}
                        className="h-9 px-3 rounded bg-[#122038] border border-white/20 text-xs font-display italic font-bold text-white focus:outline-none focus:border-[#FFD014]"
                      >
                        {(Object.keys(TRACK_SPECS) as TrackId[]).map((tid) => (
                          <option key={tid} value={tid} className="bg-[#0B1424]">
                            {TRACK_SPECS[tid].name}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label="Select Multiplayer Laps"
                        value={room.laps}
                        onChange={(e) => onUpdateSettings({ laps: Number(e.target.value) })}
                        className="h-9 px-3 rounded bg-[#122038] border border-[#FFD014]/50 text-xs font-display italic font-black text-white focus:outline-none focus:border-[#FFD014]"
                      >
                        {[1, 2, 3, 4, 5, 7, 10].map((n) => (
                          <option key={n} value={n} className="bg-[#0B1424] text-white">
                            {n} {n === 1 ? 'Lap' : 'Laps'}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ fillWithAi: !room.fillWithAi })}
                        className={`h-9 px-3 -skew-x-10 border text-xs font-display italic font-black transition-colors whitespace-nowrap ${
                          room.fillWithAi
                            ? 'bg-[#FFD014] text-[#0B1220] border-[#FFD014]'
                            : 'bg-[#122038] text-slate-300 border-white/18'
                        }`}
                      >
                        <span className="block skew-x-10">AI GRID: {room.fillWithAi ? 'ON' : 'OFF'}</span>
                      </button>
                    </>
                  ) : (
                    <div className="text-xs font-display italic font-bold text-slate-200">
                      {TRACK_SPECS[room.trackId].name} · {room.laps} Laps · AI Fill {room.fillWithAi ? 'On' : 'Off'}
                    </div>
                  )}
                </div>
              </div>

              {/* Connected Racers Table */}
              <div>
                <div className="flex items-center justify-between text-xs font-display italic font-bold text-slate-300 mb-2">
                  <span className="flex items-center gap-1.5 text-[#FFD014]">
                    <Users className="w-3.5 h-3.5" />
                    CONNECTED DRIVERS ({room.players.length} / 6)
                  </span>
                  <span>
                    {room.fillWithAi
                      ? `${Math.max(0, 6 - room.players.length)} AI Rivals Fill Open Slots`
                      : 'Human Drivers Only'}
                  </span>
                </div>

                <div className="divide-y divide-white/10 border border-white/15 rounded overflow-hidden">
                  {room.players.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 bg-[#101C30]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono-tabular text-xs font-bold text-[#FFD014] w-6">
                          P{p.gridSlot + 1}
                        </span>
                        <span
                          className="w-3 h-3 rounded-sm shrink-0 border border-white/30"
                          style={{ backgroundColor: p.vehicle.primaryColor }}
                        />
                        <div className="truncate">
                          <span className="text-sm font-display italic font-black text-white">
                            {p.name}
                            {p.id === playerId ? ' (YOU)' : ''}
                          </span>
                          <div className="text-xs text-slate-300">
                            {p.platform} · {CHASSIS_SPECS[p.vehicle.chassisId].name}
                            {p.isHost ? ' · Host' : ''}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-display italic font-black ${
                          p.ready || p.isHost ? 'text-emerald-400' : 'text-[#FFD014]'
                        }`}
                      >
                        {p.ready || p.isHost ? 'READY' : 'PREPARING'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lobby Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="h-10 px-4 -skew-x-10 bg-[#14223A] hover:bg-[#E5252B] border border-white/18 text-xs font-display italic font-black text-white flex items-center gap-2 transition-colors"
                >
                  <span className="skew-x-10 flex items-center gap-1.5">
                    <LogOut className="w-4 h-4" />
                    <span>LEAVE ROOM</span>
                  </span>
                </button>

                <div className="flex items-center gap-3">
                  {!isHost && me && (
                    <button
                      type="button"
                      onClick={() => onToggleReady(!me.ready)}
                      className={`h-10 px-5 -skew-x-10 text-xs sm:text-sm font-display italic font-black transition-colors ${
                        me.ready
                          ? 'bg-emerald-500 text-[#0B1220]'
                          : 'bg-[#14223A] hover:bg-[#1E3254] text-white border border-white/20'
                      }`}
                    >
                      <span className="block skew-x-10">{me.ready ? 'READY ✓' : 'MARK READY'}</span>
                    </button>
                  )}

                  {isHost && (
                    <button
                      type="button"
                      disabled={room.status !== 'lobby'}
                      onClick={onStartRace}
                      className="h-10 px-6 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] disabled:opacity-50 text-[#0B1220] text-xs sm:text-sm font-display italic font-black flex items-center gap-2 shadow-[0_6px_18px_rgba(255,208,20,0.35)] transition-colors"
                    >
                      <span className="skew-x-10 flex items-center gap-2">
                        <Play className="w-4 h-4 fill-current" />
                        <span>{room.status === 'countdown' ? `STARTING IN ${room.countdown}...` : 'LAUNCH RACE »'}</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
