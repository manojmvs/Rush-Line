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

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedManually = false;
  private callbacks: MultiplayerCallbacks = {};
  public playerId = '';

  public setCallbacks(cb: MultiplayerCallbacks): void {
    this.callbacks = cb;
  }

  public connect(): void {
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
        if (!this.closedManually) {
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
  const params = new URLSearchParams();
  if (filters.trackId && filters.trackId !== 'all') params.set('trackId', filters.trackId);
  if (filters.mode && filters.mode !== 'all') params.set('mode', filters.mode);
  if (filters.platform && filters.platform !== 'all') params.set('platform', filters.platform);

  const res = await fetch(`/api/leaderboard?${params.toString()}`);
  if (!res.ok) throw new Error('Unable to load leaderboard');
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
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
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
