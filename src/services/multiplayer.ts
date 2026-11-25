import { Peer, type DataConnection } from 'peerjs';
import {
  TRACK_SPECS,
  type GameMode,
  type LeaderboardEntry,
  type MultiplayerPlayer,
  type PlatformType,
  type RemoteCarState,
  type RoomState,
  type TrackId,
  type VehicleConfig,
} from '../types/game.ts';

export type MultiplayerTransport = 'ws' | 'p2p';

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
  onTransportChange?: (transport: MultiplayerTransport) => void;
  onSessionInit?: (playerId: string) => void;
  onAppVersion?: (version: string, updatedAt: number) => void;
  onRoomState?: (room: RoomState | null) => void;
  onCountdown?: (countdown: number) => void;
  onRaceStart?: (raceStartTime: number) => void;
  onPeerState?: (playerId: string, state: RemoteCarState) => void;
  onError?: (message: string) => void;
}

const LOCAL_LEADERBOARD_KEY = 'rush-line-local-leaderboard-v1';
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const P2P_ROOM_PREFIX = 'rushline-v1-room-';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

function getConfiguredWsServerUrl(): string | null {
  try {
    const raw = (import.meta.env as Record<string, string | undefined>).VITE_MULTIPLAYER_SERVER_URL;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

export function isStaticHosting(): boolean {
  if (typeof window === 'undefined') return false;
  if (getConfiguredWsServerUrl()) return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.github.io') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.vercel.app') ||
    window.location.protocol === 'file:'
  );
}

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function generatePeerPlayerId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36).slice(-4);
  return `rlp-${ts}-${rand}`;
}

function cloneRoom(room: RoomState): RoomState {
  return {
    ...room,
    players: room.players.map((p) => ({
      ...p,
      vehicle: { ...p.vehicle },
    })),
  };
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

/**
 * Dual-transport real-time multiplayer client:
 * - Uses native WebSocket (/ws) when connected to the Express full-stack server (or VITE_MULTIPLAYER_SERVER_URL).
 * - Automatically uses real WebRTC P2P DataChannels via PeerJS on GitHub Pages / static hosts (or if /ws is unavailable)
 *   so friends on Android, iOS, and Desktop can create rooms, share 4-char codes / invite links, and race live!
 */
export class MultiplayerClient {
  private transport: MultiplayerTransport = isStaticHosting() ? 'p2p' : 'ws';
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedManually = false;
  private wsFailedAttempts = 0;
  private wsEverConnected = false;
  private callbacks: MultiplayerCallbacks = {};
  public playerId = '';

  // P2P WebRTC state (PeerJS)
  private clientPeer: Peer | null = null;
  private hostPeer: Peer | null = null;
  private hostRoom: RoomState | null = null;
  private hostConns = new Map<string, DataConnection>();
  private connToPlayerId = new Map<DataConnection, string>();
  private hostCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private guestConn: DataConnection | null = null;
  private guestJoinTimer: ReturnType<typeof setTimeout> | null = null;
  private guestLeaving = false;

  public getTransport(): MultiplayerTransport {
    return this.transport;
  }

  public setCallbacks(cb: MultiplayerCallbacks): void {
    this.callbacks = cb;
  }

  public connect(): void {
    this.closedManually = false;
    if (this.transport === 'p2p' || isStaticHosting()) {
      this.transport = 'p2p';
      this.callbacks.onTransportChange?.('p2p');
      this.initP2PClient();
      return;
    }
    this.callbacks.onTransportChange?.('ws');
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const customUrl = getConfiguredWsServerUrl();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = customUrl || `${proto}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.wsFailedAttempts = 0;
        this.wsEverConnected = true;
        this.transport = 'ws';
        this.callbacks.onTransportChange?.('ws');
        this.callbacks.onConnectionChange?.(true);
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        this.handleServerMessage(msg);
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.closedManually) {
          this.callbacks.onConnectionChange?.(false);
          return;
        }
        this.wsFailedAttempts += 1;
        // If no WebSocket backend exists on this host, seamlessly switch to real WebRTC P2P multiplayer!
        if (!this.wsEverConnected && this.wsFailedAttempts >= 1 && !customUrl) {
          this.transport = 'p2p';
          this.callbacks.onTransportChange?.('p2p');
          this.initP2PClient();
          return;
        }
        this.callbacks.onConnectionChange?.(false);
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 2500);
      };

      ws.onerror = () => {
        // Handled cleanly in onclose
      };
    } catch {
      this.transport = 'p2p';
      this.callbacks.onTransportChange?.('p2p');
      this.initP2PClient();
    }
  }

  private initP2PClient(): void {
    if (this.clientPeer && !this.clientPeer.destroyed) {
      if (this.clientPeer.open) {
        this.callbacks.onConnectionChange?.(true);
      } else if (this.clientPeer.disconnected) {
        try {
          this.clientPeer.reconnect();
        } catch {
          // recreate below if needed
        }
      }
      return;
    }

    if (!this.playerId) {
      this.playerId = generatePeerPlayerId();
    }
    this.callbacks.onSessionInit?.(this.playerId);

    try {
      const peer = new Peer(this.playerId, {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      });
      this.clientPeer = peer;

      peer.on('open', (id) => {
        if (this.closedManually) return;
        this.playerId = id;
        this.callbacks.onSessionInit?.(id);
        this.callbacks.onConnectionChange?.(true);
      });

      peer.on('disconnected', () => {
        if (this.closedManually) return;
        this.callbacks.onConnectionChange?.(false);
        this.reconnectTimer = setTimeout(() => {
          if (this.closedManually) return;
          if (this.clientPeer && !this.clientPeer.destroyed) {
            try {
              this.clientPeer.reconnect();
            } catch {
              this.clientPeer.destroy();
              this.clientPeer = null;
              this.initP2PClient();
            }
          }
        }, 2000);
      });

      peer.on('error', (err) => {
        if (this.closedManually) return;
        const errType = String((err as { type?: string })?.type || '');
        if (errType === 'peer-unavailable') {
          this.clearGuestJoinTimer();
          this.cleanupGuestConn(false);
          this.callbacks.onError?.('Room not found or host is offline. Double-check the 4-character code.');
        } else if (errType === 'network' || errType === 'server-error' || errType === 'socket-error') {
          this.callbacks.onConnectionChange?.(false);
          this.reconnectTimer = setTimeout(() => {
            if (!this.closedManually) {
              this.clientPeer?.destroy();
              this.clientPeer = null;
              this.initP2PClient();
            }
          }, 3000);
        }
      });
    } catch {
      this.callbacks.onConnectionChange?.(false);
      this.callbacks.onError?.('Unable to initialize WebRTC P2P multiplayer in this browser.');
    }
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
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
      if (typeof msg.reason === 'string' && msg.reason) {
        this.callbacks.onError?.(msg.reason);
      }
    } else if (type === 'room:countdown') {
      this.callbacks.onCountdown?.(Number(msg.countdown ?? 0));
    } else if (type === 'race:start') {
      this.callbacks.onRaceStart?.(Number(msg.raceStartTime ?? Date.now()));
    } else if (type === 'race:peerState') {
      this.callbacks.onPeerState?.(String(msg.playerId ?? ''), msg.state as RemoteCarState);
    } else if (type === 'room:error') {
      this.callbacks.onError?.(String(msg.message ?? 'Room error'));
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
    this.teardownP2PRoom(false);
    if (this.clientPeer) {
      this.clientPeer.destroy();
      this.clientPeer = null;
    }
  }

  private sendWs(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // =========================================================================
  // P2P HOST-AUTHORITATIVE ROOM MANAGEMENT (Works 100% on GitHub Pages!)
  // =========================================================================
  private broadcastFromHost(payload: Record<string, unknown>, excludePlayerId?: string): void {
    this.hostConns.forEach((conn, pid) => {
      if (pid === excludePlayerId) return;
      if (conn.open) {
        try {
          conn.send(payload);
        } catch {
          // ignore transient send errors
        }
      }
    });
  }

  private syncHostRoomState(): void {
    if (!this.hostRoom) return;
    const snapshot = cloneRoom(this.hostRoom);
    this.callbacks.onRoomState?.(snapshot);
    this.broadcastFromHost({ type: 'room:state', room: snapshot });
  }

  private findLowestFreeSlot(players: MultiplayerPlayer[]): number {
    const used = new Set(players.map((p) => p.gridSlot));
    for (let s = 0; s < 6; s++) {
      if (!used.has(s)) return s;
    }
    return players.length;
  }

  private removeP2PGuest(guestId: string): void {
    const conn = this.hostConns.get(guestId);
    if (conn) {
      this.hostConns.delete(guestId);
      this.connToPlayerId.delete(conn);
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    if (!this.hostRoom) return;
    const before = this.hostRoom.players.length;
    this.hostRoom.players = this.hostRoom.players.filter((p) => p.id !== guestId);
    if (this.hostRoom.players.length !== before) {
      if (this.hostRoom.status === 'lobby') {
        this.hostRoom.players.forEach((p, idx) => {
          p.gridSlot = idx;
        });
      }
      this.syncHostRoomState();
    }
  }

  private hostP2PRoom(
    name: string,
    platform: PlatformType,
    trackId: TrackId,
    vehicle: VehicleConfig,
    attempt = 0
  ): void {
    this.teardownP2PRoom(false);
    if (!this.playerId) {
      this.playerId = generatePeerPlayerId();
      this.callbacks.onSessionInit?.(this.playerId);
    }

    const code = generateRoomCode();
    const roomPeerId = `${P2P_ROOM_PREFIX}${code}`;

    const hostPeer = new Peer(roomPeerId, {
      debug: 0,
      config: { iceServers: ICE_SERVERS },
    });
    this.hostPeer = hostPeer;

    hostPeer.on('open', () => {
      if (this.closedManually || this.hostPeer !== hostPeer) return;
      const hostPlayer: MultiplayerPlayer = {
        id: this.playerId,
        name: name.trim().slice(0, 20) || 'Driver',
        platform,
        vehicle: { ...vehicle },
        ready: true,
        isHost: true,
        gridSlot: 0,
      };
      this.hostRoom = {
        code,
        trackId,
        laps: TRACK_SPECS[trackId].laps,
        fillWithAi: true,
        status: 'lobby',
        countdown: 0,
        raceStartTime: 0,
        players: [hostPlayer],
      };
      this.syncHostRoomState();
    });

    hostPeer.on('connection', (conn) => {
      if (this.hostPeer !== hostPeer) {
        conn.close();
        return;
      }

      conn.on('data', (raw) => {
        if (!raw || typeof raw !== 'object') return;
        const msg = raw as Record<string, unknown>;
        const type = String(msg.type ?? '');

        if (type === 'p2p:join') {
          if (!this.hostRoom) {
            conn.send({ type: 'room:error', message: 'Room is no longer active.' });
            return;
          }
          const guestId = String(msg.playerId || conn.peer);
          if (this.hostRoom.status !== 'lobby') {
            conn.send({ type: 'room:error', message: 'Race already in progress. Wait for the next round.' });
            return;
          }
          const existing = this.hostRoom.players.find((p) => p.id === guestId);
          if (!existing && this.hostRoom.players.length >= 6) {
            conn.send({ type: 'room:error', message: 'Room is full (6/6 drivers).' });
            return;
          }

          this.hostConns.set(guestId, conn);
          this.connToPlayerId.set(conn, guestId);

          if (!existing) {
            const guestPlayer: MultiplayerPlayer = {
              id: guestId,
              name: String(msg.name || 'Racer').trim().slice(0, 20) || 'Racer',
              platform: (msg.platform as PlatformType) || 'Desktop',
              vehicle: (msg.vehicle as VehicleConfig) || { ...this.hostRoom.players[0].vehicle },
              ready: false,
              isHost: false,
              gridSlot: this.findLowestFreeSlot(this.hostRoom.players),
            };
            this.hostRoom.players.push(guestPlayer);
          }
          this.syncHostRoomState();
        } else if (type === 'p2p:ready') {
          const guestId = this.connToPlayerId.get(conn);
          if (!guestId || !this.hostRoom) return;
          const p = this.hostRoom.players.find((pl) => pl.id === guestId);
          if (p) {
            p.ready = Boolean(msg.ready);
            this.syncHostRoomState();
          }
        } else if (type === 'p2p:updateVehicle') {
          const guestId = this.connToPlayerId.get(conn);
          if (!guestId || !this.hostRoom) return;
          const p = this.hostRoom.players.find((pl) => pl.id === guestId);
          if (p && msg.vehicle && typeof msg.vehicle === 'object') {
            p.vehicle = { ...(msg.vehicle as VehicleConfig) };
            this.syncHostRoomState();
          }
        } else if (type === 'p2p:leave') {
          const guestId = this.connToPlayerId.get(conn);
          if (guestId) this.removeP2PGuest(guestId);
        } else if (type === 'p2p:telemetry') {
          const guestId = this.connToPlayerId.get(conn);
          if (!guestId || !msg.state) return;
          const state = msg.state as RemoteCarState;
          this.callbacks.onPeerState?.(guestId, state);
          this.broadcastFromHost({ type: 'race:peerState', playerId: guestId, state }, guestId);
        }
      });

      conn.on('close', () => {
        const guestId = this.connToPlayerId.get(conn);
        if (guestId) this.removeP2PGuest(guestId);
      });

      conn.on('error', () => {
        const guestId = this.connToPlayerId.get(conn);
        if (guestId) this.removeP2PGuest(guestId);
      });
    });

    hostPeer.on('error', (err) => {
      const errType = String((err as { type?: string })?.type || '');
      if (errType === 'unavailable-id' && attempt < 4) {
        this.hostP2PRoom(name, platform, trackId, vehicle, attempt + 1);
      } else {
        this.callbacks.onError?.('Could not create P2P room right now. Please try again.');
      }
    });
  }

  private clearGuestJoinTimer(): void {
    if (this.guestJoinTimer) {
      clearTimeout(this.guestJoinTimer);
      this.guestJoinTimer = null;
    }
  }

  private cleanupGuestConn(notifyHost: boolean): void {
    this.clearGuestJoinTimer();
    const conn = this.guestConn;
    this.guestConn = null;
    if (conn) {
      this.guestLeaving = true;
      if (notifyHost && conn.open) {
        try {
          conn.send({ type: 'p2p:leave' });
        } catch {
          // ignore
        }
      }
      try {
        conn.close();
      } catch {
        // ignore
      }
      setTimeout(() => {
        this.guestLeaving = false;
      }, 150);
    }
  }

  private teardownP2PRoom(notifyGuests: boolean): void {
    if (this.hostCountdownTimer) {
      clearInterval(this.hostCountdownTimer);
      this.hostCountdownTimer = null;
    }
    if (notifyGuests) {
      this.broadcastFromHost({ type: 'room:left', reason: 'Host closed the room.' });
    }
    this.hostConns.forEach((conn) => {
      try {
        conn.close();
      } catch {
        // ignore
      }
    });
    this.hostConns.clear();
    this.connToPlayerId.clear();
    if (this.hostPeer) {
      this.hostPeer.destroy();
      this.hostPeer = null;
    }
    this.hostRoom = null;
    this.cleanupGuestConn(notifyGuests);
  }

  // =========================================================================
  // PUBLIC MULTIPLAYER ROOM ACTIONS (Identical API across WS & WebRTC P2P!)
  // =========================================================================
  public createRoom(name: string, platform: PlatformType, trackId: TrackId, vehicle: VehicleConfig): void {
    if (this.transport === 'p2p') {
      this.hostP2PRoom(name, platform, trackId, vehicle);
      return;
    }
    this.sendWs({ type: 'room:create', name, platform, trackId, vehicle });
  }

  public quickMatch(name: string, platform: PlatformType, trackId: TrackId, vehicle: VehicleConfig): void {
    if (this.transport === 'p2p') {
      this.hostP2PRoom(name, platform, trackId, vehicle);
      return;
    }
    this.sendWs({ type: 'room:quickmatch', name, platform, trackId, vehicle });
  }

  public joinRoom(code: string, name: string, platform: PlatformType, vehicle: VehicleConfig): void {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 4) {
      this.callbacks.onError?.('Enter a valid 4-character room code.');
      return;
    }

    if (this.transport === 'p2p') {
      this.teardownP2PRoom(false);
      if (!this.clientPeer || this.clientPeer.destroyed) {
        this.initP2PClient();
      }
      const peer = this.clientPeer;
      if (!peer) {
        this.callbacks.onError?.('Connecting to P2P network... try again in a second.');
        return;
      }

      const startConnect = () => {
        const targetId = `${P2P_ROOM_PREFIX}${cleanCode}`;
        const conn = peer.connect(targetId, { reliable: true });
        this.guestConn = conn;
        this.guestLeaving = false;

        this.clearGuestJoinTimer();
        this.guestJoinTimer = setTimeout(() => {
          if (this.guestConn === conn && !conn.open) {
            this.cleanupGuestConn(false);
            this.callbacks.onError?.(
              `Room ${cleanCode} not found or unreachable. Ask the host to keep their lobby open.`
            );
          }
        }, 9000);

        conn.on('open', () => {
          this.clearGuestJoinTimer();
          conn.send({
            type: 'p2p:join',
            playerId: this.playerId,
            name: name.trim().slice(0, 20) || 'Racer',
            platform,
            vehicle: { ...vehicle },
          });
        });

        conn.on('data', (raw) => {
          if (!raw || typeof raw !== 'object') return;
          this.handleServerMessage(raw as Record<string, unknown>);
        });

        conn.on('close', () => {
          this.clearGuestJoinTimer();
          if (this.guestConn === conn) {
            this.guestConn = null;
            if (!this.guestLeaving) {
              this.callbacks.onRoomState?.(null);
              this.callbacks.onError?.('Disconnected from room host.');
            }
          }
        });

        conn.on('error', () => {
          this.clearGuestJoinTimer();
          if (this.guestConn === conn) {
            this.guestConn = null;
            this.callbacks.onError?.(`Could not join room ${cleanCode}.`);
          }
        });
      };

      if (peer.open) {
        startConnect();
      } else {
        peer.once('open', startConnect);
      }
      return;
    }

    this.sendWs({ type: 'room:join', code: cleanCode, name, platform, vehicle });
  }

  public leaveRoom(): void {
    if (this.transport === 'p2p') {
      this.teardownP2PRoom(true);
      this.callbacks.onRoomState?.(null);
      return;
    }
    this.sendWs({ type: 'room:leave' });
  }

  public setReady(ready: boolean): void {
    if (this.transport === 'p2p') {
      if (this.guestConn && this.guestConn.open) {
        this.guestConn.send({ type: 'p2p:ready', ready });
      }
      return;
    }
    this.sendWs({ type: 'room:ready', ready });
  }

  public updateVehicle(vehicle: VehicleConfig): void {
    if (this.transport === 'p2p') {
      if (this.hostRoom) {
        const me = this.hostRoom.players.find((p) => p.id === this.playerId);
        if (me) {
          me.vehicle = { ...vehicle };
          this.syncHostRoomState();
        }
      } else if (this.guestConn && this.guestConn.open) {
        this.guestConn.send({ type: 'p2p:updateVehicle', vehicle: { ...vehicle } });
      }
      return;
    }
    this.sendWs({ type: 'room:updateVehicle', vehicle });
  }

  public updateSettings(settings: { trackId?: TrackId; fillWithAi?: boolean; laps?: number }): void {
    if (this.transport === 'p2p') {
      if (!this.hostRoom) return;
      if (settings.trackId && settings.trackId in TRACK_SPECS) {
        this.hostRoom.trackId = settings.trackId;
      }
      if (typeof settings.fillWithAi === 'boolean') {
        this.hostRoom.fillWithAi = settings.fillWithAi;
      }
      if (typeof settings.laps === 'number' && settings.laps >= 1 && settings.laps <= 10) {
        this.hostRoom.laps = Math.round(settings.laps);
      }
      this.syncHostRoomState();
      return;
    }
    this.sendWs({ type: 'room:settings', ...settings });
  }

  public startRace(): void {
    if (this.transport === 'p2p') {
      if (!this.hostRoom || this.hostRoom.status !== 'lobby') return;
      this.hostRoom.status = 'countdown';
      this.hostRoom.countdown = 3;
      this.syncHostRoomState();

      if (this.hostCountdownTimer) {
        clearInterval(this.hostCountdownTimer);
      }

      this.hostCountdownTimer = setInterval(() => {
        if (!this.hostRoom) {
          if (this.hostCountdownTimer) clearInterval(this.hostCountdownTimer);
          this.hostCountdownTimer = null;
          return;
        }
        this.hostRoom.countdown -= 1;
        if (this.hostRoom.countdown > 0) {
          this.callbacks.onCountdown?.(this.hostRoom.countdown);
          this.broadcastFromHost({ type: 'room:countdown', countdown: this.hostRoom.countdown });
        } else {
          if (this.hostCountdownTimer) clearInterval(this.hostCountdownTimer);
          this.hostCountdownTimer = null;
          this.hostRoom.status = 'racing';
          this.hostRoom.countdown = 0;
          const raceStartTime = Date.now();
          this.hostRoom.raceStartTime = raceStartTime;
          this.callbacks.onRaceStart?.(raceStartTime);
          this.broadcastFromHost({ type: 'race:start', raceStartTime });
        }
      }, 1000);
      return;
    }
    this.sendWs({ type: 'room:start' });
  }

  public returnLobby(): void {
    if (this.transport === 'p2p') {
      if (this.hostRoom) {
        if (this.hostCountdownTimer) {
          clearInterval(this.hostCountdownTimer);
          this.hostCountdownTimer = null;
        }
        this.hostRoom.status = 'lobby';
        this.hostRoom.countdown = 0;
        this.hostRoom.raceStartTime = 0;
        this.hostRoom.players.forEach((p) => {
          p.ready = p.isHost;
        });
        this.syncHostRoomState();
      }
      return;
    }
    this.sendWs({ type: 'room:returnLobby' });
  }

  public sendTelemetry(state: RemoteCarState): void {
    if (this.transport === 'p2p') {
      if (this.hostRoom) {
        this.broadcastFromHost({ type: 'race:peerState', playerId: this.playerId, state });
      } else if (this.guestConn && this.guestConn.open) {
        try {
          this.guestConn.send({ type: 'p2p:telemetry', state });
        } catch {
          // ignore dropped telemetry tick
        }
      }
      return;
    }
    this.sendWs({ type: 'race:telemetry', state });
  }
}

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  if (isStaticHosting()) return [];
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return [];
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
