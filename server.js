// Servidor Multiplayer de Mini-Servidores (HTTP + WebSocket Nativo RFC 6455 sem dependências externas)
// Stick Pique-Esconde 3D: Salva Todos!

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ==================== MINI-SERVIDORES (SALAS INSTANCIADAS) ====================
const ALL_SLOTS = ['seeker_main', 'hider_0', 'hider_1', 'hider_2', 'hider_3'];

const rooms = new Map();
const defaultRooms = [
  { id: 'srv_1', name: '🏰 Masmorra #1 — Santuário Norte' },
  { id: 'srv_2', name: '🔥 Masmorra #2 — Catacumbas de Sangue' },
  { id: 'srv_3', name: '⚡ Masmorra #3 — Corredor das Sombras' },
  { id: 'srv_4', name: '💀 Masmorra #4 — Altar da Pedra d\'Alma' }
];

for (const dr of defaultRooms) {
  rooms.set(dr.id, {
    id: dr.id,
    name: dr.name,
    maxPlayers: 5,
    state: 'idle', // 'idle' | 'countdown' | 'hunt' | 'gameover'
    hostId: null,
    clients: new Map() // clientId -> clientObj
  });
}

const allClients = new Set();
let nextClientId = 1;

// ==================== WEBSOCKET RFC 6455 ENCODER / DECODER ====================
function encodeWsFrame(dataStr) {
  const payload = Buffer.from(dataStr, 'utf8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text Frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function sendJson(client, obj) {
  if (!client || !client.socket || client.socket.destroyed) return;
  try {
    const frame = encodeWsFrame(JSON.stringify(obj));
    client.socket.write(frame);
  } catch (err) {
    // Ignore write error on closing socket
  }
}

function broadcastServerList() {
  const list = [];
  for (const r of rooms.values()) {
    const humanCount = r.clients.size;
    const aiCount = Math.max(0, r.maxPlayers - humanCount);
    list.push({
      id: r.id,
      name: r.name,
      humanCount,
      aiCount,
      maxPlayers: r.maxPlayers,
      state: humanCount === 0 ? 'idle' : r.state
    });
  }

  const msg = { type: 'server_list', servers: list };
  for (const c of allClients) {
    sendJson(c, msg);
  }
}

function buildRoomRoster(room) {
  const players = [];
  for (const c of room.clients.values()) {
    players.push({
      clientId: c.id,
      name: c.name,
      slotId: c.slotId,
      role: c.slotId === 'seeker_main' ? 'seeker' : 'hider'
    });
  }
  return {
    type: 'room_roster',
    roomId: room.id,
    roomName: room.name,
    hostId: room.hostId,
    state: room.state,
    players
  };
}

function broadcastToRoom(room, obj, excludeClient = null) {
  for (const c of room.clients.values()) {
    if (c !== excludeClient) {
      sendJson(c, obj);
    }
  }
}

function pickAvailableSlot(room, preferredRole) {
  const takenSlots = new Set();
  for (const c of room.clients.values()) {
    if (c.slotId) takenSlots.add(c.slotId);
  }

  if (preferredRole === 'seeker' && !takenSlots.has('seeker_main')) {
    return 'seeker_main';
  }

  for (const hSlot of ['hider_0', 'hider_1', 'hider_2', 'hider_3']) {
    if (!takenSlots.has(hSlot)) return hSlot;
  }

  if (!takenSlots.has('seeker_main')) {
    return 'seeker_main';
  }

  return null;
}

function removeClientFromRoom(client) {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  client.roomId = null;
  client.slotId = null;
  if (!room) return;

  room.clients.delete(client.id);

  if (room.clients.size === 0) {
    room.hostId = null;
    room.state = 'idle';
  } else if (room.hostId === client.id) {
    // Migrate host to the next connected human in this Mini-Server
    const nextHost = room.clients.values().next().value;
    room.hostId = nextHost ? nextHost.id : null;
  }

  const roster = buildRoomRoster(room);
  broadcastToRoom(room, roster);
  broadcastServerList();
}

function handleWsMessage(client, msg) {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'get_servers') {
    broadcastServerList();
    return;
  }

  if (msg.type === 'join_room') {
    removeClientFromRoom(client);

    const room = rooms.get(msg.roomId);
    if (!room) {
      sendJson(client, { type: 'join_error', message: 'Mini-servidor não encontrado.' });
      return;
    }

    if (room.clients.size >= room.maxPlayers) {
      sendJson(client, { type: 'join_error', message: 'Este Mini-Servidor já está com 5/5 humanos! Escolha outro.' });
      return;
    }

    const slotId = pickAvailableSlot(room, msg.preferredRole || 'hider');
    if (!slotId) {
      sendJson(client, { type: 'join_error', message: 'Sem vagas disponíveis nesta sala.' });
      return;
    }

    const cleanName = String(msg.playerName || `Jogador ${client.id}`).trim().slice(0, 18) || `Jogador ${client.id}`;
    client.name = cleanName;
    client.roomId = room.id;
    client.slotId = slotId;

    if (!room.hostId || !room.clients.has(room.hostId)) {
      room.hostId = client.id;
    }

    room.clients.set(client.id, client);

    const roster = buildRoomRoster(room);
    sendJson(client, {
      type: 'joined_room',
      clientId: client.id,
      roomId: room.id,
      roomName: room.name,
      slotId: client.slotId,
      assignedRole: client.slotId === 'seeker_main' ? 'seeker' : 'hider',
      hostId: room.hostId,
      state: room.state,
      players: roster.players
    });

    broadcastToRoom(room, roster);
    broadcastServerList();
    return;
  }

  if (msg.type === 'leave_room') {
    removeClientFromRoom(client);
    return;
  }

  // Room-scoped packets
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) return;

  if (msg.type === 'player_update') {
    msg.clientId = client.id;
    msg.slotId = client.slotId;
    msg.playerName = client.name;
    broadcastToRoom(room, msg, client);
  } else if (msg.type === 'world_sync') {
    // Only room host drives authoritative match timer & AI bots
    if (room.hostId === client.id) {
      if (msg.matchState && room.state !== msg.matchState) {
        room.state = msg.matchState;
        broadcastServerList();
      }
      broadcastToRoom(room, msg, client);
    }
  } else if (msg.type === 'game_event') {
    msg.senderId = client.id;
    msg.senderSlot = client.slotId;
    broadcastToRoom(room, msg, client);
  } else if (msg.type === 'restart_match') {
    const now = Date.now();
    if (now - (room.lastRestartAt || 0) < 3500) return;
    room.lastRestartAt = now;
    room.state = 'countdown';
    broadcastToRoom(room, { type: 'restart_match', hostId: room.hostId });
    broadcastServerList();
  }
}

// ==================== HTTP + WEBSOCKET SERVER ====================
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ];
  socket.write(headers.join('\r\n'));

  const client = {
    id: `p_${nextClientId++}`,
    socket,
    name: '',
    roomId: null,
    slotId: null,
    buffer: Buffer.alloc(0)
  };
  allClients.add(client);

  // Send initial welcome + server list
  sendJson(client, { type: 'welcome', clientId: client.id });
  broadcastServerList();

  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);

    while (client.buffer.length >= 2) {
      const firstByte = client.buffer[0];
      const secondByte = client.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (client.buffer.length < 4) return;
        payloadLen = client.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (client.buffer.length < 10) return;
        payloadLen = Number(client.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskOffset = offset;
      if (isMasked) offset += 4;

      if (client.buffer.length < offset + payloadLen) {
        return; // Wait for complete frame
      }

      const payload = Buffer.alloc(payloadLen);
      if (isMasked) {
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = client.buffer[offset + i] ^ client.buffer[maskOffset + (i % 4)];
        }
      } else {
        client.buffer.copy(payload, 0, offset, offset + payloadLen);
      }

      client.buffer = client.buffer.subarray(offset + payloadLen);

      if (opcode === 0x08) {
        // Close frame
        socket.end();
        return;
      } else if (opcode === 0x09) {
        // Ping -> Pong
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0;
        socket.write(pong);
      } else if (opcode === 0x01) {
        // Text frame
        try {
          const parsed = JSON.parse(payload.toString('utf8'));
          handleWsMessage(client, parsed);
        } catch (e) {
          // Ignore malformed JSON
        }
      }
    }
  });

  const cleanup = () => {
    if (allClients.has(client)) {
      allClients.delete(client);
      removeClientFromRoom(client);
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

// Heartbeat a cada 25s para manter conexões WebSocket vivas em proxies de nuvem (Fly.io / Render)
setInterval(() => {
  const pingMsg = { type: 'ping', t: Date.now() };
  for (const c of allClients) {
    sendJson(c, pingMsg);
  }
}, 25000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Stick Pique-Esconde 3D (Mini-Servidores + WebSocket) rodando em http://0.0.0.0:${PORT}`);
});

