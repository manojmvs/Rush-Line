import express from 'express';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ChassisId,
  GameMode,
  LeaderboardEntry,
  MultiplayerPlayer,
  PlatformType,
  RemoteCarState,
  RoomState,
  TrackId,
  VehicleConfig,
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

/**
 * Computes a deterministic version hash from active app files so installed mobile PWAs
 * automatically detect any new code/asset update and refresh seamlessly.
 */
function collectFileFingerprints(targetPath: string, baseDir: string, out: string[]): void {
  try {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath).sort();
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'data') continue;
        collectFileFingerprints(path.join(targetPath, entry), baseDir, out);
      }
    } else if (stat.isFile()) {
      const rel = path.relative(baseDir, targetPath);
      out.push(`${rel}:${stat.size}:${Math.floor(stat.mtimeMs)}`);
    }
  } catch {
    // ignore transient file writes during edits
  }
}

function computeAppVersion(): string {
  const parts: string[] = [];
  if (IS_PROD) {
    collectFileFingerprints(path.join(__dirname, 'dist', 'index.html'), __dirname, parts);
    collectFileFingerprints(path.join(__dirname, 'dist', 'sw.js'), __dirname, parts);
    collectFileFingerprints(path.join(__dirname, 'dist', 'assets'), __dirname, parts);
  } else {
    collectFileFingerprints(path.join(__dirname, 'src'), __dirname, parts);
    collectFileFingerprints(path.join(__dirname, 'index.html'), __dirname, parts);
    collectFileFingerprints(path.join(__dirname, 'public', 'pwa-192x192.png'), __dirname, parts);
    collectFileFingerprints(path.join(__dirname, 'public', 'pwa-512x512.png'), __dirname, parts);
  }
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash.slice(0, 12);
}

let currentAppVersion = computeAppVersion();
let currentVersionUpdatedAt = Date.now();

function refreshAppVersion(): { version: string; updatedAt: number; changed: boolean } {
  const next = computeAppVersion();
  if (next !== currentAppVersion) {
    currentAppVersion = next;
    currentVersionUpdatedAt = Date.now();
    return { version: currentAppVersion, updatedAt: currentVersionUpdatedAt, changed: true };
  }
  return { version: currentAppVersion, updatedAt: currentVersionUpdatedAt, changed: false };
}

const SEED_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: 'seed-1',
    driverName: 'K. Takahashi',
    platform: 'Mobile iOS',
    trackId: 'racing-track',
    mode: 'multiplayer',
    chassisId: 'hyperion-proto',
    bestLapMs: 44840,
    totalTimeMs: 136920,
    topSpeedKmh: 216,
    createdAt: '2026-11-18T14:22:00.000Z',
  },
  {
    id: 'seed-2',
    driverName: 'L. Bellini',
    platform: 'Desktop',
    trackId: 'racing-track',
    mode: 'time-trial',
    chassisId: 'veloce-v12',
    bestLapMs: 46110,
    totalTimeMs: 140140,
    topSpeedKmh: 198,
    createdAt: '2026-11-19T09:15:00.000Z',
  },
  {
    id: 'seed-3',
    driverName: 'M. Lindqvist',
    platform: 'Mobile Android',
    trackId: 'racing-track',
    mode: 'multiplayer',
    chassisId: 'apex-gtr',
    bestLapMs: 48125,
    totalTimeMs: 146890,
    topSpeedKmh: 180,
    createdAt: '2026-11-20T18:40:00.000Z',
  },
  {
    id: 'seed-4',
    driverName: 'S. Moreau',
    platform: 'Desktop',
    trackId: 'offroad-track',
    mode: 'multiplayer',
    chassisId: 'vanguard-v8',
    bestLapMs: 50230,
    totalTimeMs: 152800,
    topSpeedKmh: 186,
    createdAt: '2026-11-18T21:10:00.000Z',
  },
  {
    id: 'seed-5',
    driverName: 'R. Alvarez',
    platform: 'Mobile Android',
    trackId: 'offroad-track',
    mode: 'quick-race',
    chassisId: 'drift-s15',
    bestLapMs: 51650,
    totalTimeMs: 156420,
    topSpeedKmh: 188,
    createdAt: '2026-11-20T11:05:00.000Z',
  },
  {
    id: 'seed-6',
    driverName: 'H. Sato',
    platform: 'Tablet',
    trackId: 'offroad-track',
    mode: 'time-trial',
    chassisId: 'apex-gtr',
    bestLapMs: 52310,
    totalTimeMs: 158210,
    topSpeedKmh: 180,
    createdAt: '2026-11-21T06:50:00.000Z',
  },
  {
    id: 'seed-7',
    driverName: 'Y. Nakamura',
    platform: 'Mobile iOS',
    trackId: 'gokart-track',
    mode: 'multiplayer',
    chassisId: 'stratos-gt3',
    bestLapMs: 32180,
    totalTimeMs: 98440,
    topSpeedKmh: 174,
    createdAt: '2026-11-19T23:30:00.000Z',
  },
  {
    id: 'seed-8',
    driverName: 'E. Vance',
    platform: 'Desktop',
    trackId: 'gokart-track',
    mode: 'time-trial',
    chassisId: 'drift-s15',
    bestLapMs: 33020,
    totalTimeMs: 100980,
    topSpeedKmh: 168,
    createdAt: '2026-11-20T15:12:00.000Z',
  },
  {
    id: 'seed-9',
    driverName: 'D. Okafor',
    platform: 'Mobile Android',
    trackId: 'gokart-track',
    mode: 'multiplayer',
    chassisId: 'apex-gtr',
    bestLapMs: 34490,
    totalTimeMs: 104610,
    topSpeedKmh: 164,
    createdAt: '2026-11-21T03:42:00.000Z',
  },
  {
    id: 'seed-10',
    driverName: 'A. Rossi',
    platform: 'Desktop',
    trackId: 'hill-track',
    mode: 'quick-race',
    chassisId: 'stratos-gt3',
    bestLapMs: 53420,
    totalTimeMs: 161890,
    topSpeedKmh: 196,
    createdAt: '2026-11-21T07:10:00.000Z',
  },
  {
    id: 'seed-11',
    driverName: 'N. Park',
    platform: 'Mobile Android',
    trackId: 'city-track',
    mode: 'quick-race',
    chassisId: 'veloce-v12',
    bestLapMs: 47250,
    totalTimeMs: 143900,
    topSpeedKmh: 204,
    createdAt: '2026-11-21T08:20:00.000Z',
  },
  {
    id: 'seed-12',
    driverName: 'C. Bennett',
    platform: 'Mobile iOS',
    trackId: 'riverside-track',
    mode: 'time-trial',
    chassisId: 'vanguard-v8',
    bestLapMs: 45900,
    totalTimeMs: 139200,
    topSpeedKmh: 190,
    createdAt: '2026-11-21T09:15:00.000Z',
  },
  {
    id: 'seed-13',
    driverName: 'V. Kovacs',
    platform: 'Desktop',
    trackId: 'stadium-track',
    mode: 'multiplayer',
    chassisId: 'hyperion-proto',
    bestLapMs: 36840,
    totalTimeMs: 112100,
    topSpeedKmh: 218,
    createdAt: '2026-11-21T10:05:00.000Z',
  },
];

const LEGACY_TRACK_MAP: Record<string, TrackId> = {
  'monza-coastal': 'racing-track',
  'alpine-summit': 'offroad-track',
  'tokyo-bay': 'gokart-track',
};

const VALID_TRACKS = new Set<TrackId>([
  'offroad-track',
  'hill-track',
  'city-track',
  'riverside-track',
  'stadium-track',
  'racing-track',
  'gokart-track',
]);

function normalizeTrackId(id: string): TrackId {
  if (VALID_TRACKS.has(id as TrackId)) return id as TrackId;
  return LEGACY_TRACK_MAP[id] ?? 'offroad-track';
}

function loadLeaderboard(): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(SEED_LEADERBOARD, null, 2));
      return [...SEED_LEADERBOARD];
    }
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((entry) => ({
        ...entry,
        trackId: normalizeTrackId(String(entry.trackId)),
      }));
    }
  } catch (err) {
    console.error('Failed to read leaderboard file, using seed data:', err);
  }
  return [...SEED_LEADERBOARD];
}

let leaderboardEntries: LeaderboardEntry[] = loadLeaderboard();

function persistLeaderboard(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardEntries, null, 2));
  } catch (err) {
    console.error('Failed to persist leaderboard:', err);
  }
}

const VALID_MODES = new Set<GameMode>(['quick-race', 'multiplayer', 'time-trial']);
const VALID_CHASSIS = new Set<ChassisId>([
  'apex-gtr',
  'drift-s15',
  'vanguard-v8',
  'veloce-v12',
  'stratos-gt3',
  'hyperion-proto',
]);
const VALID_PLATFORMS = new Set<PlatformType>(['Mobile iOS', 'Mobile Android', 'Tablet', 'Desktop']);

// Real-time Multiplayer Room Manager
interface ActiveRoom {
  state: RoomState;
  sockets: Map<string, WebSocket>;
  countdownTimer?: ReturnType<typeof setInterval>;
}

const rooms = new Map<string, ActiveRoom>();
const clientRoomMap = new Map<WebSocket, { roomCode: string; playerId: string }>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: ActiveRoom, payload: unknown, excludePlayerId?: string): void {
  const serialized = JSON.stringify(payload);
  for (const [pid, sock] of room.sockets.entries()) {
    if (excludePlayerId && pid === excludePlayerId) continue;
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(serialized);
    }
  }
}

function reassignGridSlots(room: ActiveRoom): void {
  room.state.players.forEach((p, idx) => {
    p.gridSlot = idx;
  });
}

function leaveCurrentRoom(ws: WebSocket): void {
  const membership = clientRoomMap.get(ws);
  if (!membership) return;
  clientRoomMap.delete(ws);

  const room = rooms.get(membership.roomCode);
  if (!room) return;

  room.sockets.delete(membership.playerId);
  const wasHost = room.state.players.find((p) => p.id === membership.playerId)?.isHost ?? false;
  room.state.players = room.state.players.filter((p) => p.id !== membership.playerId);

  if (room.state.players.length === 0) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    rooms.delete(membership.roomCode);
    return;
  }

  if (wasHost) {
    room.state.players[0].isHost = true;
  }
  reassignGridSlots(room);
  broadcastRoom(room, { type: 'room:state', room: room.state });
}

function startRoomCountdown(room: ActiveRoom): void {
  if (room.state.status !== 'lobby') return;
  room.state.status = 'countdown';
  room.state.countdown = 3;
  room.state.players.forEach((p) => {
    p.state = undefined;
  });
  broadcastRoom(room, { type: 'room:state', room: room.state });

  if (room.countdownTimer) clearInterval(room.countdownTimer);
  room.countdownTimer = setInterval(() => {
    room.state.countdown -= 1;
    if (room.state.countdown <= 0) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      room.countdownTimer = undefined;
      room.state.status = 'racing';
      room.state.countdown = 0;
      room.state.raceStartTime = Date.now();
      broadcastRoom(room, { type: 'room:state', room: room.state });
      broadcastRoom(room, { type: 'race:start', raceStartTime: room.state.raceStartTime });
    } else {
      broadcastRoom(room, { type: 'room:countdown', countdown: room.state.countdown });
    }
  }, 1000);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Ensure installed PWAs never receive stale Service Workers, manifests, or app shell HTML
  app.use((req, res, next) => {
    const p = req.path;
    if (
      p === '/' ||
      p === '/index.html' ||
      p === '/sw.js' ||
      p === '/dev-sw.js' ||
      p === '/registerSW.js' ||
      p.endsWith('.webmanifest') ||
      p === '/api/version'
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Live OTA version endpoint polled by installed mobile PWAs on launch / resume / focus
  app.get('/api/version', (_req, res) => {
    const info = refreshAppVersion();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ version: info.version, updatedAt: info.updatedAt });
  });

  // Health & room summary API
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      version: currentAppVersion,
      activeRooms: rooms.size,
      leaderboardCount: leaderboardEntries.length,
    });
  });

  app.get('/api/rooms', (_req, res) => {
    const publicRooms = Array.from(rooms.values())
      .filter((r) => r.state.status === 'lobby' && r.state.players.length < 6)
      .map((r) => ({
        code: r.state.code,
        trackId: r.state.trackId,
        playerCount: r.state.players.length,
        maxPlayers: 6,
        hostName: r.state.players.find((p) => p.isHost)?.name ?? 'Host',
        platforms: Array.from(new Set(r.state.players.map((p) => p.platform))),
      }));
    res.json({ rooms: publicRooms });
  });

  // Global Leaderboard GET
  app.get('/api/leaderboard', (req, res) => {
    const trackFilter = typeof req.query.trackId === 'string' ? req.query.trackId : 'all';
    const modeFilter = typeof req.query.mode === 'string' ? req.query.mode : 'all';
    const platformFilter = typeof req.query.platform === 'string' ? req.query.platform : 'all';

    let filtered = leaderboardEntries;
    if (trackFilter !== 'all' && VALID_TRACKS.has(trackFilter as TrackId)) {
      filtered = filtered.filter((e) => e.trackId === trackFilter);
    }
    if (modeFilter !== 'all' && VALID_MODES.has(modeFilter as GameMode)) {
      filtered = filtered.filter((e) => e.mode === modeFilter);
    }
    if (platformFilter === 'mobile') {
      filtered = filtered.filter((e) => e.platform === 'Mobile iOS' || e.platform === 'Mobile Android' || e.platform === 'Tablet');
    } else if (platformFilter === 'desktop') {
      filtered = filtered.filter((e) => e.platform === 'Desktop');
    }

    const sorted = [...filtered]
      .sort((a, b) => a.bestLapMs - b.bestLapMs)
      .slice(0, 50);

    res.json({ entries: sorted, total: filtered.length });
  });

  // Global Leaderboard POST
  app.post('/api/leaderboard', (req, res) => {
    const body = req.body ?? {};
    const driverName = String(body.driverName ?? '').trim().slice(0, 24);
    const platform = body.platform as PlatformType;
    const trackId = body.trackId as TrackId;
    const mode = body.mode as GameMode;
    const chassisId = body.chassisId as ChassisId;
    const bestLapMs = Number(body.bestLapMs);
    const totalTimeMs = Number(body.totalTimeMs);
    const topSpeedKmh = Math.min(420, Math.max(40, Math.round(Number(body.topSpeedKmh) || 0)));

    if (
      !driverName ||
      !VALID_PLATFORMS.has(platform) ||
      !VALID_TRACKS.has(trackId) ||
      !VALID_MODES.has(mode) ||
      !VALID_CHASSIS.has(chassisId) ||
      !Number.isFinite(bestLapMs) ||
      bestLapMs < 15000 ||
      bestLapMs > 600000
    ) {
      res.status(400).json({ error: 'Invalid race record payload' });
      return;
    }

    const entry: LeaderboardEntry = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      driverName,
      platform,
      trackId,
      mode,
      chassisId,
      bestLapMs: Math.round(bestLapMs),
      totalTimeMs: Number.isFinite(totalTimeMs) && totalTimeMs > 0 ? Math.round(totalTimeMs) : Math.round(bestLapMs * 3),
      topSpeedKmh,
      createdAt: new Date().toISOString(),
    };

    leaderboardEntries.push(entry);
    leaderboardEntries.sort((a, b) => a.bestLapMs - b.bestLapMs);
    if (leaderboardEntries.length > 200) {
      leaderboardEntries = leaderboardEntries.slice(0, 200);
    }
    persistLeaderboard();

    const trackRank =
      leaderboardEntries
        .filter((e) => e.trackId === trackId)
        .findIndex((e) => e.id === entry.id) + 1;

    res.status(201).json({ entry, trackRank });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Broadcast live app updates to all connected mobile & desktop WebSocket clients
  setInterval(() => {
    const info = refreshAppVersion();
    if (!info.changed) return;
    const payload = JSON.stringify({
      type: 'app:version',
      version: info.version,
      updatedAt: info.updatedAt,
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }, 3500);

  wss.on('connection', (ws) => {
    const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const info = refreshAppVersion();
    sendJson(ws, {
      type: 'session:init',
      playerId,
      appVersion: info.version,
      updatedAt: info.updatedAt,
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(msg.type ?? '');

      if (type === 'room:create' || type === 'room:quickmatch') {
        leaveCurrentRoom(ws);

        const name = String(msg.name ?? 'Racer').trim().slice(0, 20) || 'Racer';
        const platform = VALID_PLATFORMS.has(msg.platform as PlatformType)
          ? (msg.platform as PlatformType)
          : 'Desktop';
        const trackId = VALID_TRACKS.has(msg.trackId as TrackId)
          ? (msg.trackId as TrackId)
          : 'racing-track';
        const vehicle = msg.vehicle as VehicleConfig;

        // If quickmatch, find open lobby on same track or any open lobby
        if (type === 'room:quickmatch') {
          const openRoom = Array.from(rooms.values()).find(
            (r) => r.state.status === 'lobby' && r.state.players.length < 6 && r.state.trackId === trackId
          ) ?? Array.from(rooms.values()).find(
            (r) => r.state.status === 'lobby' && r.state.players.length < 6
          );

          if (openRoom) {
            const player: MultiplayerPlayer = {
              id: playerId,
              name,
              platform,
              ready: false,
              isHost: false,
              vehicle,
              gridSlot: openRoom.state.players.length,
            };
            openRoom.state.players.push(player);
            openRoom.sockets.set(playerId, ws);
            clientRoomMap.set(ws, { roomCode: openRoom.state.code, playerId });
            broadcastRoom(openRoom, { type: 'room:state', room: openRoom.state });
            return;
          }
        }

        const code = generateRoomCode();
        const hostPlayer: MultiplayerPlayer = {
          id: playerId,
          name,
          platform,
          ready: true,
          isHost: true,
          vehicle,
          gridSlot: 0,
        };
        const room: ActiveRoom = {
          state: {
            code,
            trackId,
            laps: 3,
            fillWithAi: true,
            status: 'lobby',
            countdown: 0,
            raceStartTime: 0,
            players: [hostPlayer],
          },
          sockets: new Map([[playerId, ws]]),
        };
        rooms.set(code, room);
        clientRoomMap.set(ws, { roomCode: code, playerId });
        sendJson(ws, { type: 'room:state', room: room.state });
        return;
      }

      if (type === 'room:join') {
        const code = String(msg.code ?? '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, { type: 'room:error', message: `Room ${code} not found.` });
          return;
        }
        if (room.state.status !== 'lobby') {
          sendJson(ws, { type: 'room:error', message: `Room ${code} is already racing.` });
          return;
        }
        if (room.state.players.length >= 6) {
          sendJson(ws, { type: 'room:error', message: `Room ${code} is full (6/6 racers).` });
          return;
        }

        leaveCurrentRoom(ws);

        const name = String(msg.name ?? 'Racer').trim().slice(0, 20) || 'Racer';
        const platform = VALID_PLATFORMS.has(msg.platform as PlatformType)
          ? (msg.platform as PlatformType)
          : 'Desktop';
        const vehicle = msg.vehicle as VehicleConfig;

        const player: MultiplayerPlayer = {
          id: playerId,
          name,
          platform,
          ready: false,
          isHost: false,
          vehicle,
          gridSlot: room.state.players.length,
        };
        room.state.players.push(player);
        room.sockets.set(playerId, ws);
        clientRoomMap.set(ws, { roomCode: code, playerId });
        broadcastRoom(room, { type: 'room:state', room: room.state });
        return;
      }

      if (type === 'room:leave') {
        leaveCurrentRoom(ws);
        sendJson(ws, { type: 'room:left' });
        return;
      }

      const membership = clientRoomMap.get(ws);
      if (!membership) return;
      const room = rooms.get(membership.roomCode);
      if (!room) return;
      const player = room.state.players.find((p) => p.id === membership.playerId);
      if (!player) return;

      if (type === 'room:ready') {
        player.ready = Boolean(msg.ready);
        broadcastRoom(room, { type: 'room:state', room: room.state });
        return;
      }

      if (type === 'room:updateVehicle') {
        if (msg.vehicle) {
          player.vehicle = msg.vehicle as VehicleConfig;
          broadcastRoom(room, { type: 'room:state', room: room.state });
        }
        return;
      }

      if (type === 'room:settings' && player.isHost && room.state.status === 'lobby') {
        if (VALID_TRACKS.has(msg.trackId as TrackId)) {
          room.state.trackId = msg.trackId as TrackId;
        }
        if (typeof msg.fillWithAi === 'boolean') {
          room.state.fillWithAi = msg.fillWithAi;
        }
        if (typeof msg.laps === 'number' && msg.laps >= 1 && msg.laps <= 10) {
          room.state.laps = Math.round(msg.laps);
        }
        broadcastRoom(room, { type: 'room:state', room: room.state });
        return;
      }

      if (type === 'room:start' && player.isHost && room.state.status === 'lobby') {
        startRoomCountdown(room);
        return;
      }

      if (type === 'room:returnLobby' && player.isHost) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        room.state.status = 'lobby';
        room.state.countdown = 0;
        room.state.players.forEach((p) => {
          p.state = undefined;
          p.ready = p.isHost;
        });
        broadcastRoom(room, { type: 'room:state', room: room.state });
        return;
      }

      if (type === 'race:telemetry' && room.state.status === 'racing') {
        const state = msg.state as RemoteCarState;
        if (!state || typeof state.x !== 'number') return;
        player.state = state;
        broadcastRoom(
          room,
          { type: 'race:peerState', playerId: player.id, state },
          player.id
        );

        // Check if all human players finished
        const allFinished = room.state.players.every((p) => p.state?.finished);
        if (allFinished) {
          room.state.status = 'finished';
          broadcastRoom(room, { type: 'room:state', room: room.state });
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(ws);
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Circuit server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
