import type {
  GameMode,
  LeaderboardEntry,
  PlatformType,
  RemoteCarState,
  RoomState,
  TrackId,
  VehicleConfig,
} from '../types/game.ts';

export interface PublicRoomSummary {
  code: string;
  trackId: TrackId;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
  platforms: PlatformType[];
}

export interface MultiplayerCallbacks {
  onConnectionChange?: (connected: boolean) => void;
  onSessionInit?: (playerId: string) => void;
  onAppVersion?: (version: string, updatedAt: number) => void;
  onRoomState?: (room: RoomState | null) => void;
  onCountdown?: (countdown: number) => void;
  onRaceStart?: (raceStartTime: number) => void;
  onPeerState?: (playerId: string, state: RemoteCarState) => void;
  onError?: (message: string) => void;
}

const LOCAL_LEADERBOARD_KEY = 'rush-line-local-leaderboard-v1';

function isStaticHosting(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.github.io') || window.location.protocol === 'file:';
}

function readLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 80)));
  } catch {
    // ignore storage quota errors
  }
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedManually = false;
  private failedAttempts = 0;
  private everConnected = false;
  private callbacks: MultiplayerCallbacks = {};
  public playerId = '';

  public setCallbacks(cb: MultiplayerCallbacks): void {
    this.callbacks = cb;
  }

  public connect(): void {
    if (isStaticHosting()) {
      this.callbacks.onConnectionChange?.(false);
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedManually = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.failedAttempts = 0;
        this.everConnected = true;
        this.callbacks.onConnectionChange?.(true);
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const type = String(msg.type ?? '');
        if (type === 'session:init') {
          this.playerId = String(msg.playerId ?? '');
          this.callbacks.onSessionInit?.(this.playerId);
          if (typeof msg.appVersion === 'string' && msg.appVersion) {
            this.callbacks.onAppVersion?.(msg.appVersion, Number(msg.updatedAt ?? Date.now()));
          }
        } else if (type === 'app:version') {
          if (typeof msg.version === 'string' && msg.version) {
            this.callbacks.onAppVersion?.(msg.version, Number(msg.updatedAt ?? Date.now()));
          }
        } else if (type === 'room:state') {
          this.callbacks.onRoomState?.(msg.room as RoomState);
        } else if (type === 'room:left') {
          this.callbacks.onRoomState?.(null);
        } else if (type === 'room:countdown') {
          this.callbacks.onCountdown?.(Number(msg.countdown ?? 0));
        } else if (type === 'race:start') {
          this.callbacks.onRaceStart?.(Number(msg.raceStartTime ?? Date.now()));
        } else if (type === 'race:peerState') {
          this.callbacks.onPeerState?.(String(msg.playerId ?? ''), msg.state as RemoteCarState);
        } else if (type === 'room:error') {
          this.callbacks.onError?.(String(msg.message ?? 'Room error'));
        }
      };

      ws.onclose = () => {
        this.callbacks.onConnectionChange?.(false);
        this.ws = null;
        this.failedAttempts += 1;
        // Stop retrying if backend WebSocket is absent (e.g. static hosting) after 2 failed attempts
        if (!this.closedManually && (this.everConnected || this.failedAttempts < 2)) {
          this.reconnectTimer = setTimeout(() => this.connect(), 2500);
        }
      };

      ws.onerror = () => {
        // Handled cleanly in onclose
      };
    } catch {
      this.callbacks.onConnectionChange?.(false);
    }
  }

  public disconnect(): void {
    this.closedManually = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public createRoom(name: string, platform: PlatformType, trackId: TrackId, vehicle: VehicleConfig): void {
    this.send({ type: 'room:create', name, platform, trackId, vehicle });
  }

  public quickMatch(name: string, platform: PlatformType, trackId: TrackId, vehicle: VehicleConfig): void {
    this.send({ type: 'room:quickmatch', name, platform, trackId, vehicle });
  }

  public joinRoom(code: string, name: string, platform: PlatformType, vehicle: VehicleConfig): void {
    this.send({ type: 'room:join', code: code.trim().toUpperCase(), name, platform, vehicle });
  }

  public leaveRoom(): void {
    this.send({ type: 'room:leave' });
  }

  public setReady(ready: boolean): void {
    this.send({ type: 'room:ready', ready });
  }

  public updateVehicle(vehicle: VehicleConfig): void {
    this.send({ type: 'room:updateVehicle', vehicle });
  }

  public updateSettings(settings: { trackId?: TrackId; fillWithAi?: boolean; laps?: number }): void {
    this.send({ type: 'room:settings', ...settings });
  }

  public startRace(): void {
    this.send({ type: 'room:start' });
  }

  public returnLobby(): void {
    this.send({ type: 'room:returnLobby' });
  }

  public sendTelemetry(state: RemoteCarState): void {
    this.send({ type: 'race:telemetry', state });
  }
}

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  if (isStaticHosting()) return [];
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return [];
  }
}

export async function fetchLeaderboard(filters: {
  trackId?: string;
  mode?: string;
  platform?: string;
}): Promise<LeaderboardEntry[]> {
  const filterLocal = () => {
    let entries = readLocalLeaderboard();
    if (filters.trackId && filters.trackId !== 'all') {
      entries = entries.filter((e) => e.trackId === filters.trackId);
    }
    if (filters.mode && filters.mode !== 'all') {
      entries = entries.filter((e) => e.mode === filters.mode);
    }
    if (filters.platform && filters.platform !== 'all') {
      entries = entries.filter((e) =>
        filters.platform === 'mobile'
          ? e.platform === 'Mobile iOS' || e.platform === 'Mobile Android'
          : e.platform === 'Desktop'
      );
    }
    return entries.sort((a, b) => a.bestLapMs - b.bestLapMs);
  };

  if (isStaticHosting()) {
    return filterLocal();
  }

  const params = new URLSearchParams();
  if (filters.trackId && filters.trackId !== 'all') params.set('trackId', filters.trackId);
  if (filters.mode && filters.mode !== 'all') params.set('mode', filters.mode);
  if (filters.platform && filters.platform !== 'all') params.set('platform', filters.platform);

  try {
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    if (!res.ok) return filterLocal();
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return filterLocal();
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : filterLocal();
  } catch {
    return filterLocal();
  }
}

export async function submitLeaderboardRecord(payload: {
  driverName: string;
  platform: PlatformType;
  trackId: TrackId;
  mode: GameMode;
  chassisId: VehicleConfig['chassisId'];
  bestLapMs: number;
  totalTimeMs: number;
  topSpeedKmh: number;
}): Promise<{ entry: LeaderboardEntry; trackRank: number } | null> {
  const saveLocal = () => {
    const entry: LeaderboardEntry = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...payload,
      createdAt: new Date().toISOString(),
    };
    const all = [...readLocalLeaderboard(), entry];
    writeLocalLeaderboard(all);
    const sameTrack = all
      .filter((e) => e.trackId === payload.trackId)
      .sort((a, b) => a.bestLapMs - b.bestLapMs);
    const trackRank = sameTrack.findIndex((e) => e.id === entry.id) + 1;
    return { entry, trackRank: Math.max(1, trackRank) };
  };

  if (isStaticHosting()) {
    return saveLocal();
  }

  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return saveLocal();
    return await res.json();
  } catch {
    return saveLocal();
  }
}
