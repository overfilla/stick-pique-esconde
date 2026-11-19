// Main Game Engine: Stick Pique-Esconde 3D - Salva Todos!
const HIDER_ABILITIES = [
  {
    slot: 1,
    id: 'dragon_flag',
    name: 'Dragon Flag',
    icon: '🤸',
    reqText: 'Requer Parede • 4s',
    cooldown: 11,
    duration: 4.0,
    requiresWall: true
  },
  {
    slot: 2,
    id: 'flat_paint',
    name: 'Tinta Fresca 2D',
    icon: '🎨',
    reqText: 'Requer Parede • 4.5s',
    cooldown: 13,
    duration: 4.5,
    requiresWall: true
  },
  {
    slot: 3,
    id: 'corridor_split',
    name: 'Espacate Alto',
    icon: '🦵',
    reqText: 'Só em Corredor • 4s',
    cooldown: 12,
    duration: 4.0,
    requiresWall: false,
    requiresCorridor: true
  },
  {
    slot: 4,
    id: 'distract_snap',
    idName: 'Estalo / Pedra',
    name: 'Estalo Distração',
    icon: '🪨',
    reqText: 'Atrai Pegador',
    cooldown: 9,
    duration: 0.4,
    requiresWall: false
  }
];

const SEEKER_ABILITIES = [
  {
    slot: 1,
    id: 'flashlight_360',
    name: 'Acender a Luz',
    icon: '☀️',
    reqText: 'Utevo Gran Lux • 3.2s',
    cooldown: 11,
    duration: 3.2,
    requiresWall: false
  },
  {
    slot: 2,
    id: 'look_up',
    name: 'Olhar p/ Cima',
    icon: '👀',
    reqText: 'Flagra Acrobacias',
    cooldown: 9,
    duration: 3.0,
    requiresWall: false
  },
  {
    slot: 3,
    id: 'heartbeat_radar',
    name: 'Radar Cardíaco',
    icon: '💓',
    reqText: 'Ouve Passos/Tremor',
    cooldown: 13,
    duration: 3.5,
    requiresWall: false
  },
  {
    slot: 4,
    id: 'lunge_dash',
    name: 'Bote Rápido',
    icon: '💨',
    reqText: 'Avanço de Captura',
    cooldown: 6,
    duration: 0.42,
    requiresWall: false
  },
  {
    slot: 5,
    id: 'short_circuit',
    name: 'Curto-Circuito',
    icon: '⚡',
    reqText: 'Trava Prisão 15s • 1x',
    cooldown: 999,
    duration: 15.0,
    requiresWall: false,
    singleUse: true
  }
];

class StickHideAndSeekGame {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.labelsContainer = document.getElementById('world-labels');

    this.selectedRole = 'hider'; // 'hider' | 'seeker'
    this.cameraPreset = 0; // 0: Angled Top-Down, 1: High Tactical, 2: Closer Action
    this.zoomFactor = 1.0;

    this.matchState = 'menu'; // 'menu' | 'countdown' | 'hunt' | 'gameover'
    this.countdownTimer = 8.0;
    this.matchTimer = 90.0; // 90s total: 0-30s (Tudo Trancado), 30-60s (Salva-Todos Aberto), 60-90s (Pique Aberto)
    this.salvaTodosUnlockTime = 60.0; // Unlocks after 30s elapsed (when matchTimer <= 60s)
    this.salvaTodosUnlocked = false;
    this.salvaTodosCooldown = 0; // Intervalo mínimo de 10s entre cada Salva-Todos
    this.shortCircuitTimer = 0; // > 0 when Seeker's Curto-Circuito (5) is blocking Salva-Todos
    this.piqueUnlockTime = 30.0;
    this.piqueUnlocked = false;
    this.campTimer = 0;
    this.campingZone = null; // 'jail' | 'pique' | null
    this.elapsedTime = 0;

    this.characters = [];
    this.hiders = [];
    this.seeker = null;
    this.player = null;

    // 3D Sound Ripples / Decoys / Noise Events
    this.noiseEvents = []; // { pos, radius, maxRadius, timer, label, sourceRole }
    this.pebbles = [];

    // Match Stats
    this.stats = {
      captures: 0,
      salvaTodosCount: 0,
      acrobatTime: 0,
      piqueSaves: 0
    };

    // Input State
    this.keys = {};

    // Multiplayer Mini-Servers State
    this.selectedServerId = 'srv_1'; // 'srv_1'..'srv_4' or 'solo'
    this.serverList = [
      { id: 'srv_1', name: '🏰 Masmorra #1 — Santuário Norte', humanCount: 0, aiCount: 5, maxPlayers: 5, state: 'idle' },
      { id: 'srv_2', name: '🔥 Masmorra #2 — Catacumbas de Sangue', humanCount: 0, aiCount: 5, maxPlayers: 5, state: 'idle' },
      { id: 'srv_3', name: '⚡ Masmorra #3 — Corredor das Sombras', humanCount: 0, aiCount: 5, maxPlayers: 5, state: 'idle' },
      { id: 'srv_4', name: '💀 Masmorra #4 — Altar da Pedra d\'Alma', humanCount: 0, aiCount: 5, maxPlayers: 5, state: 'idle' }
    ];
    this.ws = null;
    this.wsConnected = false;
    this.clientId = null;
    this.isMultiplayer = false;
    this.isRoomHost = true;
    this.assignedSlotId = null;
    this.roomName = '';
    this.roomPlayers = [];
    this.netSyncTimer = 0;

    this.initThree();
    this.arena = new ArenaMap(this.scene);
    this.buildVisionConeMesh();
    this.bindUIEvents();
    this.initMultiplayer();
    this.animate = this.animate.bind(this);
    this.lastFrameTime = performance.now();
    this.setupBackgroundOnlineLoop();
    requestAnimationFrame(this.animate);
  }

  setupBackgroundOnlineLoop() {
    window.addEventListener('blur', () => {
      this.keys = {};
    });

    document.addEventListener('visibilitychange', () => {
      this.keys = {};
      const isOnlineMode = this.isMultiplayer || this.selectedServerId !== 'solo';
      if (!isOnlineMode) {
        this.lastFrameTime = performance.now();
      } else {
        this.advanceOnlineSimulation(performance.now());
      }
    });

    const tickBackground = () => {
      const now = performance.now();
      const isOnlineMode = this.isMultiplayer || this.selectedServerId !== 'solo';
      if (!isOnlineMode) {
        if (document.hidden || !document.hasFocus()) {
          this.lastFrameTime = now;
        }
        return;
      }
      // Quando o jogador dá Alt+Tab, clica fora ou troca de guia, mantém a simulação Online em tempo real 1:1
      if (document.hidden || !document.hasFocus() || now - this.lastFrameTime >= 50) {
        this.advanceOnlineSimulation(now);
      }
    };

    // Web Worker dedicado: não sofre o throttling de 1s do navegador em guias em segundo plano
    try {
      const workerCode = 'setInterval(function(){ postMessage(1); }, 40);';
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.bgWorker = new Worker(URL.createObjectURL(blob));
      this.bgWorker.onmessage = tickBackground;
    } catch (e) {}

    this.bgOnlineInterval = setInterval(tickBackground, 40);
  }

  advanceOnlineSimulation(now) {
    let elapsed = (now - this.lastFrameTime) / 1000;
    if (elapsed <= 0.001) return;
    this.lastFrameTime = now;

    if (window.adManager && window.adManager.isAdActive()) {
      return;
    }

    elapsed = Math.min(30.0, elapsed);
    while (elapsed > 0.0005) {
      const step = Math.min(0.04, elapsed);
      this.stepSimulation(step);
      elapsed -= step;
    }
    this.updateHUD();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080d);
    this.scene.fog = new THREE.FogExp2(0x06080d, 0.0115);

    this.camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.5,
      140
    );
    this.camera.position.set(0, 22, 16);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // Diablo IV + Tibia Cave Darkness: Low ambient moonlight so dynamic lights truly illuminate the stone!
    const hemiLight = new THREE.HemisphereLight(0x64748b, 0x090a0f, 0.28);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0x94a3b8, 0.34);
    dirLight.position.set(16, 32, 18);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 5;
    dirLight.shadow.camera.far = 75;
    dirLight.shadow.bias = -0.0005;
    const d = 26;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    // Soulstone Altar Light over "O Pique" (shifts from Arcane Blue to Golden Fire when unlocked)
    this.piqueLight = new THREE.PointLight(0x38bdf8, 1.35, 11, 1.6);
    this.piqueLight.position.set(0, 2.8, 0);
    this.scene.add(this.piqueLight);

    // Seeker Real 3D Flashlight Beam (SpotLight with real wall shadow-casting & soft penumbra!)
    this.seekerSpotLight = new THREE.SpotLight(0xffd066, 3.8, 16.0, (40 * Math.PI) / 180, 0.78, 1.35);
    this.seekerSpotLight.castShadow = true;
    this.seekerSpotLight.shadow.mapSize.width = 1024;
    this.seekerSpotLight.shadow.mapSize.height = 1024;
    this.seekerSpotLight.shadow.camera.near = 0.5;
    this.seekerSpotLight.shadow.camera.far = 18;
    this.seekerSpotLight.shadow.bias = -0.0008;
    this.scene.add(this.seekerSpotLight);
    this.scene.add(this.seekerSpotLight.target);

    // Seeker "Utevo Gran Lux" 360° Radial Light (Small torch halo normally, massive solar aura on Skill 1!)
    this.seekerGranLuxLight = new THREE.PointLight(0xffb838, 1.15, 7.2, 1.45);
    this.scene.add(this.seekerGranLuxLight);

    // Soft personal night-vision aura for the Human Hider player so nearby walls remain clear in dark caves
    this.hiderAuraLight = new THREE.PointLight(0x7dd3fc, 0.85, 9.5, 1.7);
    this.scene.add(this.hiderAuraLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  buildVisionConeMesh() {
    // Multi-ring volumetric light aura with vertex colors + AdditiveBlending (Tibia "Utevo Gran Lux" style,
    // fading smoothly from incandescent core to 0 at edges instead of a flat colored band!)
    this.visionRays = 96;
    this.visionRings = 5;
    const R = this.visionRays;
    const K = this.visionRings;
    const vertCount = (K + 1) * (R + 1);

    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    this.visionGeo = new THREE.BufferGeometry();
    this.visionGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.visionGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const indices = [];
    for (let ring = 0; ring < K; ring++) {
      for (let ray = 0; ray < R; ray++) {
        const a = ring * (R + 1) + ray;
        const b = ring * (R + 1) + (ray + 1);
        const c = (ring + 1) * (R + 1) + ray;
        const d = (ring + 1) * (R + 1) + (ray + 1);
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
    this.visionGeo.setIndex(indices);

    this.visionMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.visionMesh = new THREE.Mesh(this.visionGeo, this.visionMat);
    this.visionMesh.position.y = 0.05;
    this.scene.add(this.visionMesh);
  }

  bindUIEvents() {
    // Role Selector in Menu
    const roleHiderCard = document.getElementById('select-role-hider');
    const roleSeekerCard = document.getElementById('select-role-seeker');

    roleHiderCard.addEventListener('click', () => {
      this.selectedRole = 'hider';
      roleHiderCard.classList.add('selected');
      roleSeekerCard.classList.remove('selected');
    });

    roleSeekerCard.addEventListener('click', () => {
      this.selectedRole = 'seeker';
      roleSeekerCard.classList.add('selected');
      roleHiderCard.classList.remove('selected');
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      window.soundFX.init();
      this.startMatch();
    });

    document.getElementById('btn-play-again').addEventListener('click', () => {
      this.startPostMatchAds(false);
    });

    document.getElementById('btn-back-menu').addEventListener('click', () => {
      this.startPostMatchAds(true);
    });

    document.getElementById('btn-restart-menu').addEventListener('click', () => {
      if (this.preAdInterval) {
        clearInterval(this.preAdInterval);
        this.preAdInterval = null;
      }
      if (this.isMultiplayer && this.wsConnected) {
        this.sendNetMessage({ type: 'leave_room' });
        this.isMultiplayer = false;
      }
      document.getElementById('menu-modal').classList.remove('hidden');
      document.getElementById('hud-top').classList.add('hidden');
      document.getElementById('hud-bottom').classList.add('hidden');
      this.matchState = 'menu';
    });

    document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
      const on = window.soundFX.toggle();
      e.currentTarget.textContent = on ? '🔊 Som' : '🔇 Mudo';
    });

    document.getElementById('btn-camera-mode').addEventListener('click', () => {
      this.cameraPreset = (this.cameraPreset + 1) % 3;
    });

    const fsBtn = document.getElementById('btn-fullscreen');
    const fsMenuBtn = document.getElementById('btn-fullscreen-menu');
    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
    if (fsMenuBtn) fsMenuBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      const label = isFs ? '🗗 Sair Tela Cheia' : '⛶ Tela Cheia';
      if (fsBtn) fsBtn.textContent = label;
      if (fsMenuBtn) fsMenuBtn.textContent = label;
    });

    // Keyboard & Scroll
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.keys[code] = true;

      if (this.matchState === 'countdown' || this.matchState === 'hunt') {
        if (code === 'Digit1' || code === 'KeyQ') this.triggerPlayerAbility(1);
        if (code === 'Digit2' || code === 'KeyE') this.triggerPlayerAbility(2);
        if (code === 'Digit3' || code === 'KeyR') this.triggerPlayerAbility(3);
        if (code === 'Digit4' || code === 'KeyF') this.triggerPlayerAbility(4);
        if (code === 'Digit5' || code === 'KeyG') this.triggerPlayerAbility(5);
        if (code === 'Space') {
          e.preventDefault();
          this.handlePlayerActionKey();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('wheel', (e) => {
      this.zoomFactor = Math.max(0.65, Math.min(1.45, this.zoomFactor + e.deltaY * 0.0007));
    });
  }

  // ==================== MINI-SERVERS MULTIPLAYER SYSTEM ====================
  initMultiplayer() {
    this.renderServerSelector();

    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/ws`;

    const connect = () => {
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (e) {
        return;
      }

      this.ws.addEventListener('open', () => {
        this.wsConnected = true;
        const statusEl = document.getElementById('mp-conn-status');
        if (statusEl) {
          statusEl.className = 'mp-conn-status online';
          statusEl.textContent = '🟢 Mini-Servidores Online (IA preenche vagas)';
        }
        this.renderServerSelector();
      });

      this.ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          this.handleNetMessage(msg);
        } catch (err) {
          // Ignore invalid packet
        }
      });

      this.ws.addEventListener('close', () => {
        this.wsConnected = false;
        this.isMultiplayer = false;
        this.isRoomHost = true;
        const statusEl = document.getElementById('mp-conn-status');
        if (statusEl) {
          statusEl.className = 'mp-conn-status offline';
          statusEl.textContent = '⚪ Modo Local (Execute node server.js p/ Multiplayer)';
        }
        this.renderServerSelector();
        setTimeout(connect, 4000);
      });
    };

    connect();
  }

  sendNetMessage(obj) {
    if (this.ws && this.wsConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  renderServerSelector() {
    const grid = document.getElementById('mp-servers-grid');
    if (!grid) return;

    let html = '';
    for (const srv of this.serverList) {
      const isSelected = this.selectedServerId === srv.id;
      const stateLabel =
        srv.humanCount === 0
          ? 'Livre'
          : srv.state === 'hunt'
          ? '🔥 Em Caçada'
          : srv.state === 'countdown'
          ? '⏳ Contagem'
          : 'Aberto';

      html += `
        <div class="mp-server-card ${isSelected ? 'selected' : ''}" data-srv="${srv.id}">
          <div class="mp-srv-name">${srv.name}</div>
          <div class="mp-srv-meta">
            <span class="mp-srv-humans">👤 ${srv.humanCount}/5 + 🤖 ${srv.aiCount} IA</span>
            <span>${stateLabel}</span>
          </div>
        </div>
      `;
    }

    // Also include Solo Offline option
    const soloSelected = this.selectedServerId === 'solo' || !this.wsConnected;
    html += `
      <div class="mp-server-card ${soloSelected && this.selectedServerId === 'solo' ? 'selected' : ''}" data-srv="solo">
        <div class="mp-srv-name">💻 Modo Solo (Local)</div>
        <div class="mp-srv-meta">
          <span class="mp-srv-humans">👤 1 Humano + 🤖 4 IA</span>
          <span>Offline</span>
        </div>
      </div>
    `;

    grid.innerHTML = html;

    grid.querySelectorAll('.mp-server-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.selectedServerId = card.getAttribute('data-srv');
        this.renderServerSelector();
      });
    });
  }

  handleNetMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'welcome') {
      this.clientId = msg.clientId;
    } else if (msg.type === 'server_list') {
      this.serverList = msg.servers || this.serverList;
      this.renderServerSelector();
    } else if (msg.type === 'join_error') {
      alert(msg.message || 'Erro ao entrar no Mini-Servidor.');
    } else if (msg.type === 'joined_room') {
      this.clientId = msg.clientId;
      this.isMultiplayer = true;
      this.assignedSlotId = msg.slotId;
      this.selectedRole = msg.assignedRole;
      this.isRoomHost = msg.hostId === this.clientId;
      this.roomName = msg.roomName || '';
      this.roomPlayers = msg.players || [];
      this.launchMatchEntities();
    } else if (msg.type === 'room_roster') {
      const wasHost = this.isRoomHost;
      this.isRoomHost = msg.hostId === this.clientId;
      this.roomPlayers = msg.players || [];
      this.applyRoomRosterToCharacters();
      if (!wasHost && this.isRoomHost && this.matchState !== 'menu') {
        this.showBigAlert('👑 Você agora é o Host deste Mini-Servidor!', 1.8);
      }
    } else if (msg.type === 'player_update') {
      const c = this.characters.find((ch) => ch.id === msg.slotId);
      if (c && !c.isPlayer) {
        c.isRemoteHuman = true;
        if (!c.netTargetPos) c.netTargetPos = c.position.clone();
        c.netTargetPos.set(msg.x, 0, msg.z);
        if (c.position.distanceTo(c.netTargetPos) > 4.5) {
          c.position.copy(c.netTargetPos);
        }
        c.velocity.set(msg.vx || 0, 0, msg.vz || 0);
        c.facingAngle = msg.facingAngle || 0;
        c.posture = msg.posture || 'normal';
        c.activeSkill = msg.activeSkill || null;
        c.skillTimer = msg.skillTimer || 0;
        c.stamina = typeof msg.stamina === 'number' ? msg.stamina : 100;
        c.isTrembling = !!msg.isTrembling;
        c.inCorridor = !!msg.inCorridor;
        if (typeof msg.wnx === 'number' && typeof msg.wnz === 'number') {
          c.wallNormal.set(msg.wnx, 0, msg.wnz);
        }
        if (c.inCorridor && msg.corridorWidth) {
          c.corridorInfo = {
            inCorridor: true,
            width: msg.corridorWidth,
            facingAngle: msg.corridorFacing || 0,
            centerPos: new THREE.Vector3(msg.x, 0, msg.z)
          };
        }
      }
    } else if (msg.type === 'world_sync') {
      if (this.isRoomHost) return;

      // Sync authoritative timers & phase from Room Host
      if (msg.matchState && this.matchState !== msg.matchState && msg.matchState !== 'gameover') {
        if (msg.matchState === 'hunt' && this.matchState === 'countdown') {
          window.soundFX.playCountdownTick(true);
          this.showBigAlert('🔥 CAÇADA INICIADA! (Salva-Todos libera em 30s)', 2.4);
        }
        this.matchState = msg.matchState;
      }

      if (typeof msg.countdownTimer === 'number') this.countdownTimer = msg.countdownTimer;
      if (typeof msg.matchTimer === 'number') this.matchTimer = msg.matchTimer;

      if (msg.salvaTodosUnlocked && !this.salvaTodosUnlocked) {
        this.salvaTodosUnlocked = true;
        if (this.shortCircuitTimer <= 0) this.arena.setJailSwitchState('ready');
        window.soundFX.playSingleSave();
        this.showBigAlert('🔓 BOTÃO SALVA-TODOS LIBERADO NA PRISÃO AO NORTE!', 2.8);
      }

      if (msg.piqueUnlocked && !this.piqueUnlocked) {
        this.piqueUnlocked = true;
        this.arena.setPiqueLocked(false);
        if (this.piqueLight) this.piqueLight.color.setHex(0xf59e0b);
        window.soundFX.playSalvaTodos();
        this.showBigAlert('🔓 O PIQUE ABRIU! (ÚLTIMOS 30s) CORRA PARA O CENTRO!', 3.2);
      }

      if (typeof msg.shortCircuitTimer === 'number') {
        this.shortCircuitTimer = msg.shortCircuitTimer;
      }
      if (typeof msg.salvaTodosCooldown === 'number') {
        this.salvaTodosCooldown = msg.salvaTodosCooldown;
      }
      if (typeof msg.campTimer === 'number') this.campTimer = msg.campTimer;
      this.campingZone = msg.campingZone || null;

      // Sync AI-backfilled characters from Host
      if (Array.isArray(msg.bots)) {
        for (const b of msg.bots) {
          const c = this.characters.find((ch) => ch.id === b.id);
          if (c && !c.isPlayer && !c.isRemoteHuman) {
            if (!c.netTargetPos) c.netTargetPos = c.position.clone();
            c.netTargetPos.set(b.x, 0, b.z);
            if (c.position.distanceTo(c.netTargetPos) > 4.5) {
              c.position.copy(c.netTargetPos);
            }
            c.velocity.set(b.vx || 0, 0, b.vz || 0);
            c.facingAngle = b.facingAngle || 0;
            c.state = b.state || c.state;
            c.posture = b.posture || 'normal';
            c.activeSkill = b.activeSkill || null;
            c.skillTimer = b.skillTimer || 0;
            c.stamina = typeof b.stamina === 'number' ? b.stamina : 100;
            c.isTrembling = !!b.isTrembling;
            c.inCorridor = !!b.inCorridor;
            if (typeof b.wnx === 'number' && typeof b.wnz === 'number') {
              c.wallNormal.set(b.wnx, 0, b.wnz);
            }
            if (c.inCorridor && b.corridorWidth) {
              c.corridorInfo = {
                inCorridor: true,
                width: b.corridorWidth,
                facingAngle: b.corridorFacing || 0,
                centerPos: new THREE.Vector3(b.x, 0, b.z)
              };
            }
          }
        }
      }
    } else if (msg.type === 'game_event') {
      if (msg.eventType === 'noise') {
        this.spawnNoiseEvent(
          new THREE.Vector3(msg.x, 0, msg.z),
          msg.maxRadius,
          msg.labelText,
          msg.sourceRole,
          true
        );
      } else if (msg.eventType === 'capture') {
        const h = this.hiders.find((x) => x.id === msg.hiderId);
        if (h) this.captureHider(h, true);
      } else if (msg.eventType === 'prison_rescue') {
        const r = this.hiders.find((x) => x.id === msg.rescuerId) || null;
        this.triggerPrisonRescue(r, !!msg.isAntiCampAuto, true);
      } else if (msg.eventType === 'pique_save') {
        const h = this.hiders.find((x) => x.id === msg.hiderId);
        if (h) this.triggerPiqueSave(h, true);
      } else if (msg.eventType === 'short_circuit') {
        this.shortCircuitTimer = msg.duration || 15.0;
        this.arena.setJailSwitchState('short_circuit');
        this.spawnNoiseEvent(this.arena.jailPos, 12.0, '⚡ CURTO-CIRCUITO (15s)!', 'seeker', true);
        window.soundFX.playSkillActivate('short_circuit');
        this.showBigAlert('⚡ CURTO-CIRCUITO! Botão Salva-Todos desativado por 15s!', 2.8);
      } else if (msg.eventType === 'gameover') {
        if (this.matchState !== 'gameover') {
          this.endMatch(msg.hidersWon, msg.title, msg.description, true);
        }
      }
    } else if (msg.type === 'restart_match') {
      this.isRoomHost = msg.hostId === this.clientId;
      if (window.adManager && window.adManager.isAdActive()) {
        this.pendingNetRestart = msg;
      } else {
        this.launchMatchEntities();
      }
    }
  }

  applyRoomRosterToCharacters() {
    if (!this.isMultiplayer) return;

    for (const c of this.characters) {
      const human = this.roomPlayers.find((p) => p.slotId === c.id);
      if (human) {
        c.isPlayer = human.clientId === this.clientId;
        c.isRemoteHuman = human.clientId !== this.clientId;
        c.name = c.isPlayer ? `👤 ${human.name} (Você)` : `👤 ${human.name}`;
      } else {
        c.isPlayer = false;
        c.isRemoteHuman = false;
        c.name = c.defaultBotName || c.name;
      }
      if (c.labelEl) {
        c.labelEl.textContent = c.name;
      }
    }
  }

  clearEntities() {
    for (const c of this.characters) {
      this.scene.remove(c.group);
    }
    for (const n of this.noiseEvents) {
      if (n.mesh) this.scene.remove(n.mesh);
    }
    this.characters = [];
    this.hiders = [];
    this.seeker = null;
    this.player = null;
    this.noiseEvents = [];
    this.labelsContainer.innerHTML = '';
  }

  startMatch() {
    // If a Mini-Server is selected and WebSocket is connected, join that Mini-Server!
    if (this.wsConnected && this.selectedServerId && this.selectedServerId !== 'solo') {
      const nickInput = document.getElementById('player-nickname');
      const playerName = nickInput && nickInput.value.trim() ? nickInput.value.trim() : 'Viajante';
      this.sendNetMessage({
        type: 'join_room',
        roomId: this.selectedServerId,
        playerName,
        preferredRole: this.selectedRole
      });
      return;
    }

    // Solo Offline Mode
    this.isMultiplayer = false;
    this.isRoomHost = true;
    this.assignedSlotId = this.selectedRole === 'seeker' ? 'seeker_main' : 'hider_0';
    this.roomName = 'Modo Solo (Local)';
    this.roomPlayers = [];
    this.launchMatchEntities();
  }

  launchMatchEntities() {
    this.clearEntities();
    document.getElementById('menu-modal').classList.add('hidden');
    document.getElementById('gameover-modal').classList.add('hidden');
    document.getElementById('hud-top').classList.remove('hidden');
    document.getElementById('hud-bottom').classList.remove('hidden');

    this.stats = {
      captures: 0,
      salvaTodosCount: 0,
      acrobatTime: 0,
      piqueSaves: 0
    };

    const hiderColors = [0x10b981, 0x38bdf8, 0xa855f7, 0xf97316];
    const hiderNames = ['🤖 Sombra (IA)', '🤖 Calistênico (IA)', '🤖 Guepardo (IA)', '🤖 Acrobata (IA)'];
    const spawnOffsets = [
      { x: -3.2, z: -2.8 },
      { x: 3.2, z: -2.8 },
      { x: -3.2, z: 2.8 },
      { x: 3.2, z: 2.8 }
    ];

    const targetSlot = this.assignedSlotId || (this.selectedRole === 'seeker' ? 'seeker_main' : 'hider_0');

    // Create 4 Hiders
    for (let i = 0; i < 4; i++) {
      const slotId = `hider_${i}`;
      const isPlayerHider = targetSlot === slotId;
      const h = new Stickman3D(this.scene, {
        id: slotId,
        name: isPlayerHider ? '👤 Você (Escondido)' : hiderNames[i],
        role: 'hider',
        isPlayer: isPlayerHider,
        color: hiderColors[i],
        x: spawnOffsets[i].x,
        z: spawnOffsets[i].z
      });
      h.defaultBotName = hiderNames[i];
      h.aiTargetSpot = this.arena.hidingSpots[(i * 2) % this.arena.hidingSpots.length];
      h.aiDecisionTimer = 0;
      this.hiders.push(h);
      this.characters.push(h);
      if (isPlayerHider) this.player = h;
    }

    // Create 1 Seeker at the Pique
    const isPlayerSeeker = targetSlot === 'seeker_main';
    this.seeker = new Stickman3D(this.scene, {
      id: 'seeker_main',
      name: isPlayerSeeker ? '👤 Você (Pegador)' : '🤖 Pegador (IA)',
      role: 'seeker',
      isPlayer: isPlayerSeeker,
      color: 0xf43f5e,
      x: 0,
      z: 0.4
    });
    this.seeker.defaultBotName = '🤖 Pegador (IA)';
    this.seeker.aiState = 'patrol';
    this.seeker.aiTargetPos = this.arena.waypoints[0].clone();
    this.seeker.aiTimer = 0;
    this.characters.push(this.seeker);
    if (isPlayerSeeker) this.player = this.seeker;

    // Create Floating HTML Tags for characters + Pique + Jail
    this.createWorldLabels();

    if (this.isMultiplayer) {
      this.applyRoomRosterToCharacters();
    }

    // Setup Ability Bar UI
    this.renderAbilityBar();

    // Match Timers
    this.matchState = 'countdown';
    this.countdownTimer = 8.0;
    this.lastCountdownInt = 8;
    this.matchTimer = 90.0; // 0-30s: Tudo Trancado | 30-60s: Salva-Todos Aberto | 60-90s: Pique Aberto
    this.salvaTodosUnlockTime = 60.0;
    this.salvaTodosUnlocked = false;
    this.salvaTodosCooldown = 0;
    this.shortCircuitTimer = 0;
    this.piqueUnlockTime = 30.0;
    this.piqueUnlocked = false;
    this.campTimer = 0;
    this.campingZone = null;
    this.arena.setPiqueLocked(true);
    if (this.piqueLight) this.piqueLight.color.setHex(0x38bdf8);
    this.arena.setJailSwitchState('locked');

    this.showBigAlert('ESCONDA-SE! CONTAGEM: 8s', 2.0);
    window.soundFX.playCountdownTick(false);
  }

  createWorldLabels() {
    this.labelsContainer.innerHTML = '';

    // Pique Label
    this.piqueLabelEl = document.createElement('div');
    this.piqueLabelEl.className = 'world-tag pique-marker';
    this.piqueLabelEl.textContent = '🔒 O PIQUE (ABRE NOS 30s FINAIS)';
    this.labelsContainer.appendChild(this.piqueLabelEl);

    // Jail Label
    this.jailLabelEl = document.createElement('div');
    this.jailLabelEl.className = 'world-tag';
    this.jailLabelEl.style.borderColor = '#fb7185';
    this.jailLabelEl.textContent = '🔒 PRISÃO (SALVA-TODOS EM 30s)';
    this.labelsContainer.appendChild(this.jailLabelEl);

    // Character Labels
    for (const c of this.characters) {
      const el = document.createElement('div');
      el.className = 'world-tag';
      el.textContent = c.name;
      this.labelsContainer.appendChild(el);
      c.labelEl = el;
    }
  }

  renderAbilityBar() {
    const bar = document.getElementById('abilities-bar');
    bar.innerHTML = '';
    const kit = this.player.role === 'hider' ? HIDER_ABILITIES : SEEKER_ABILITIES;

    kit.forEach((ab) => {
      const btn = document.createElement('button');
      btn.className = 'ability-btn';
      btn.id = `ability-btn-${ab.slot}`;
      btn.innerHTML = `
        <div class="ability-top">
          <span class="ability-key">${ab.slot}</span>
          <span class="ability-icon">${ab.icon}</span>
        </div>
        <div class="ability-name">${ab.name}</div>
        <div class="ability-req">${ab.reqText}</div>
        <div class="cooldown-overlay hidden" id="cd-overlay-${ab.slot}">0.0s</div>
      `;
      btn.addEventListener('click', () => this.triggerPlayerAbility(ab.slot));
      bar.appendChild(btn);
    });
  }

  showBigAlert(text, duration = 2.0) {
    const el = document.getElementById('big-alert');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.alertTimeout);
    this.alertTimeout = setTimeout(() => {
      el.classList.add('hidden');
    }, duration * 1000);
  }

  spawnNoiseEvent(pos, maxRadius, labelText, sourceRole = 'hider', fromNet = false) {
    if (!fromNet && this.isMultiplayer && this.wsConnected) {
      this.sendNetMessage({
        type: 'game_event',
        eventType: 'noise',
        x: pos.x,
        z: pos.z,
        maxRadius,
        labelText,
        sourceRole
      });
    }

    const ringGeo = new THREE.RingGeometry(0.2, 0.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: sourceRole === 'seeker' ? 0x38bdf8 : 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.set(pos.x, 0.08, pos.z);
    this.scene.add(mesh);

    const tag = document.createElement('div');
    tag.className = 'world-tag noise-alert';
    tag.textContent = labelText || '❗ BARULHO!';
    this.labelsContainer.appendChild(tag);

    this.noiseEvents.push({
      pos: pos.clone(),
      radius: 0.4,
      maxRadius,
      timer: 1.6,
      maxTimer: 1.6,
      mesh,
      mat: ringMat,
      tag,
      sourceRole
    });

    // Alert AI Seeker if it's a hider/decoy noise
    if (sourceRole === 'hider' && this.seeker && !this.seeker.isPlayer && this.matchState === 'hunt') {
      const dist = this.seeker.position.distanceTo(pos);
      if (dist <= maxRadius * 1.45) {
        this.seeker.aiState = 'investigate';
        this.seeker.aiTargetPos = pos.clone();
        this.seeker.aiTimer = 4.0;
      }
    }
  }

  triggerPlayerAbility(slot) {
    if (!this.player) return;
    if (this.player.role === 'seeker' && this.matchState === 'countdown') {
      this.showBigAlert('Espere a contagem acabar!', 1.2);
      return;
    }
    if (this.player.state !== 'free') return;

    // Allow Hider to release/cancel an active acrobatic pose early by pressing its key again!
    if (this.player.role === 'hider' && this.player.activeSkill) {
      const ab = HIDER_ABILITIES.find((a) => a.slot === slot);
      if (ab && this.player.activeSkill === ab.id) {
        this.player.endActiveSkill(false);
        return;
      }
    }

    this.activateCharacterAbility(this.player, slot);
  }

  activateCharacterAbility(char, slot) {
    if (char.singleUseConsumed[slot] || char.cooldowns[slot] > 0 || char.stunTimer > 0) return false;

    const kit = char.role === 'hider' ? HIDER_ABILITIES : SEEKER_ABILITIES;
    const ab = kit.find((a) => a.slot === slot);
    if (!ab) return false;

    if (char.role === 'hider') {
      // Check corridor requirement for Van Damme Corridor Split
      if (ab.requiresCorridor) {
        const corr = this.arena.detectCorridor(char.position);
        if (!corr.inCorridor) {
          if (char.isPlayer) {
            this.showBigAlert('O Espacate Alto só funciona dentro dos corredores!', 1.5);
          }
          return false;
        }
        char.inCorridor = true;
        char.corridorInfo = corr;
      }

      // Check wall requirement for Dragon Flag & Flat Paint
      if (ab.requiresWall && !char.isTouchingWall) {
        if (char.isPlayer) {
          this.showBigAlert('Encoste em uma parede primeiro!', 1.3);
        }
        return false;
      }

      if (char.stamina < 20 && (ab.requiresWall || ab.requiresCorridor)) {
        if (char.isPlayer) {
          this.showBigAlert('Sem fôlego suficiente!', 1.2);
        }
        return false;
      }

      if (ab.id === 'distract_snap') {
        // Throw decoy pebble 7.5 meters ahead in facing direction
        const dirX = Math.sin(char.facingAngle);
        const dirZ = Math.cos(char.facingAngle);
        const hitDist = this.arena.castVisionRay(char.position.x, char.position.z, dirX, dirZ, 8.0);
        const landDist = Math.max(1.5, hitDist - 0.6);
        const targetPos = new THREE.Vector3(
          char.position.x + dirX * landDist,
          0,
          char.position.z + dirZ * landDist
        );
        this.spawnNoiseEvent(targetPos, 11.0, '🪨 ESTALO!', 'hider');
        char.cooldowns[slot] = ab.cooldown;
        window.soundFX.playSkillActivate('distract_snap');
        return true;
      }

      // Snap to exact corridor center & align legs perpendicular to walls on Van Damme Split
      if (ab.id === 'corridor_split' && char.corridorInfo) {
        char.position.copy(char.corridorInfo.centerPos);
        char.facingAngle = char.corridorInfo.facingAngle;
      }

      // Activate Acrobatic Posture Skill
      char.activeSkill = ab.id;
      char.posture = ab.id;
      char.skillTimer = ab.duration;
      char.poseActiveTime = 0;
      char.poseReleaseArmed = false;
      char.cooldowns[slot] = ab.cooldown;
      window.soundFX.playSkillActivate(ab.id);
      return true;
    } else {
      // Seeker Abilities
      if (ab.id === 'short_circuit') {
        if (!this.salvaTodosUnlocked) {
          if (char.isPlayer) {
            this.showBigAlert('O Salva-Todos ainda está trancado nos 30s iniciais!', 1.5);
          }
          return false;
        }
        char.singleUseConsumed[slot] = true;
        this.shortCircuitTimer = ab.duration; // 15s lock on Salva-Todos!
        this.arena.setJailSwitchState('short_circuit');
        this.spawnNoiseEvent(this.arena.jailPos, 12.0, '⚡ CURTO-CIRCUITO (15s)!', 'seeker', true);
        if (this.isMultiplayer && this.wsConnected) {
          this.sendNetMessage({
            type: 'game_event',
            eventType: 'short_circuit',
            duration: ab.duration
          });
        }
        window.soundFX.playSkillActivate('short_circuit');
        this.showBigAlert('⚡ CURTO-CIRCUITO! Botão Salva-Todos desativado por 15s!', 2.8);
        return true;
      }

      char.activeSkill = ab.id;
      char.skillTimer = ab.duration;
      char.cooldowns[slot] = ab.cooldown;
      window.soundFX.playSkillActivate(ab.id);

      if (ab.id === 'flashlight_360') {
        this.spawnNoiseEvent(char.position, 13.5, '☀️ UTEVO GRAN LUX!', 'seeker');
      } else if (ab.id === 'heartbeat_radar') {
        this.spawnNoiseEvent(char.position, 18.0, '💓 RADAR CARDÍACO', 'seeker');
        // Reveal any hider that is moving or trembling
        for (const h of this.hiders) {
          if (h.state === 'free') {
            const isMovingOrTrembling = h.velocity.lengthSq() > 0.1 || h.isTrembling || h.stamina < 65;
            if (isMovingOrTrembling) {
              this.spawnNoiseEvent(h.position, 6.0, '💓 BATIMENTO DETECTADO!', 'hider');
            }
          }
        }
      } else if (ab.id === 'lunge_dash') {
        char.speedBoostTimer = ab.duration;
      }
      return true;
    }
  }

  handlePlayerActionKey() {
    if (!this.player) return;
    if (this.player.role === 'hider' && this.player.state === 'free') {
      // If holding Dragon Flag, Van Damme Split, or Flat Paint, pressing SPACE releases the pose immediately!
      const wasInAcrobaticPose =
        this.player.posture === 'dragon_flag' ||
        this.player.posture === 'corridor_split' ||
        this.player.posture === 'flat_paint';
      if (wasInAcrobaticPose) {
        this.player.endActiveSkill(false);
      }

      const distToJail = this.player.position.distanceTo(this.arena.jailPos);
      const distToPique = this.player.position.distanceTo(this.arena.piquePos);
      const jailedCount = this.hiders.filter((h) => h.state === 'jailed').length;

      // 1. Near Prison Rescue Switch ("Salva Todos!")
      if (distToJail <= this.arena.jailRadius + 1.45) {
        if (!this.salvaTodosUnlocked) {
          const left = Math.max(1, Math.ceil(this.matchTimer - this.salvaTodosUnlockTime));
          this.showBigAlert(`🔒 Salva-Todos bloqueado nos 30s iniciais (faltam ${left}s)!`, 1.6);
        } else if (this.shortCircuitTimer > 0) {
          this.showBigAlert(`⚡ CURTO-CIRCUITO! Botão travado por mais ${this.shortCircuitTimer.toFixed(1)}s!`, 1.6);
        } else if (this.salvaTodosCooldown > 0) {
          this.showBigAlert(`⏳ Salva-Todos em recarga! Aguarde ${Math.ceil(this.salvaTodosCooldown)}s!`, 1.6);
        } else if (jailedCount > 0) {
          this.triggerPrisonRescue(this.player);
        } else {
          this.showBigAlert('Ninguém está preso na gaiola agora!', 1.4);
        }
        return;
      }

      // 2. Near Central Pique ("Bater Pique!")
      if (distToPique <= this.arena.piqueRadius + 0.95) {
        if (this.piqueUnlocked) {
          this.triggerPiqueSave(this.player);
        } else {
          const secsLeft = Math.max(1, Math.ceil(this.matchTimer - this.piqueUnlockTime));
          this.showBigAlert(`🔒 Pique Trancado! Abre nos últimos 30s (faltam ${secsLeft}s)!`, 1.8);
        }
        return;
      }

      if (wasInAcrobaticPose) return;

      this.showBigAlert(
        this.piqueUnlocked
          ? 'Chegue ao PIQUE central (Salvar-se) ou à PRISÃO ao Norte (Salva Todos)!'
          : '🔒 O Pique só abre nos 30s finais! Esconda-se ou salve aliados na Prisão ao Norte!',
        1.8
      );
    } else if (this.player.role === 'seeker' && this.matchState === 'hunt') {
      this.tryCaptureNearbyHiders();
    }
  }

  // Triggered at the Northern Jail Rescue Switch (or automatically if Seeker camps the Jail!)
  triggerPrisonRescue(rescuer = null, isAntiCampAuto = false, fromNet = false) {
    if (this.matchState !== 'hunt') return;
    if (!fromNet && !isAntiCampAuto && (!this.salvaTodosUnlocked || this.shortCircuitTimer > 0 || this.salvaTodosCooldown > 0)) return;

    const jailedHiders = this.hiders.filter((h) => h.state === 'jailed');
    if (jailedHiders.length === 0) return;

    // Intervalo mínimo de 10 segundos entre cada Salva-Todos
    this.salvaTodosCooldown = 10.0;
    if (this.shortCircuitTimer <= 0) {
      this.arena.setJailSwitchState('locked');
    }

    if (!fromNet && this.isMultiplayer && this.wsConnected) {
      this.sendNetMessage({
        type: 'game_event',
        eventType: 'prison_rescue',
        rescuerId: rescuer ? rescuer.id : null,
        isAntiCampAuto
      });
    }

    jailedHiders.forEach((jh, idx) => {
      jh.state = 'free';
      jh.posture = 'normal';
      jh.speedBoostTimer = 4.2;
      jh.escapeTrailTimer = 3.0; // Leaves a 3s trail of luminous footprints after rescue!
      jh.escapeStepSpawnTimer = 0.1;
      const spreadX = (idx - (jailedHiders.length - 1) / 2) * 2.2;
      jh.position.set(
        this.arena.jailPos.x + spreadX,
        0,
        this.arena.jailPos.z + 2.4
      );
    });

    if (rescuer) {
      rescuer.speedBoostTimer = 3.8;
      rescuer.escapeTrailTimer = 3.0;
      rescuer.escapeStepSpawnTimer = 0.1;
    }
    this.stats.salvaTodosCount++;
    window.soundFX.playSalvaTodos();

    if (isAntiCampAuto) {
      this.showBigAlert('⚠️ GUARDAR CAIXÃO PROIBIDO! A Prisão abriu sozinha e libertou todos!', 3.2);
    } else {
      const who = rescuer ? rescuer.name : 'Um aliado';
      this.showBigAlert(`🔥 SALVA TODOS! ${who} abriu a Prisão e libertou ${jailedHiders.length} aliado(s)!`, 3.0);
    }
  }

  // Triggered at the Central Pique (ONLY during the final 30s when Pique is unlocked!)
  triggerPiqueSave(hider, fromNet = false) {
    if (this.matchState !== 'hunt' || hider.state !== 'free' || (!fromNet && !this.piqueUnlocked)) return;

    if (!fromNet && this.isMultiplayer && this.wsConnected) {
      this.sendNetMessage({
        type: 'game_event',
        eventType: 'pique_save',
        hiderId: hider.id
      });
    }

    hider.state = 'saved';
    hider.posture = 'normal';
    hider.activeSkill = null;
    const savedCount = this.hiders.filter((h) => h.state === 'saved').length;
    hider.position.set(-2.0 + savedCount * 1.1, 0, -0.5);
    this.stats.piqueSaves++;
    window.soundFX.playSingleSave();
    this.showBigAlert(`⭐ BATEU PIQUE! ${hider.name} está salvo! (${savedCount}/3 para vitória)`, 2.4);
    this.checkWinConditions();
  }

  // Anti-"Guarda-Caixão" System: Prevents the Seeker from camping the Prison or the Unlocked Pique
  // Note: Suspended at the Prison during the first 30s or while Curto-Circuito (5) is active!
  updateAntiCamp(dt) {
    if (!this.seeker || this.matchState !== 'hunt') {
      this.campTimer = 0;
      this.campingZone = null;
      return;
    }

    // Check if Seeker is actively chasing any visible Hider
    let chasingVisibleHider = false;
    for (const h of this.hiders) {
      if (h.state === 'free' && this.isHiderDetectedBySeeker(h)) {
        chasingVisibleHider = true;
        break;
      }
    }

    const jailedCount = this.hiders.filter((h) => h.state === 'jailed').length;
    const distToJail = this.seeker.position.distanceTo(this.arena.jailPos);
    const distToPique = this.seeker.position.distanceTo(this.arena.piquePos);
    const campRadius = 6.5;

    // Prison anti-camp ONLY applies if Salva-Todos is unlocked, not short-circuited, and not on 10s cooldown!
    const jailRescueActive = this.salvaTodosUnlocked && this.shortCircuitTimer <= 0 && this.salvaTodosCooldown <= 0;

    let currentZone = null;
    if (!chasingVisibleHider && this.seeker.stunTimer <= 0) {
      if (jailedCount > 0 && jailRescueActive && distToJail <= campRadius) {
        currentZone = 'jail';
      } else if (this.piqueUnlocked && distToPique <= campRadius) {
        currentZone = 'pique';
      }
    }

    if (currentZone) {
      this.campingZone = currentZone;
      this.campTimer += dt;

      // Pulse the red Anti-Camp perimeter ring on the floor
      const pulse = 0.35 + Math.abs(Math.sin(this.elapsedTime * 8)) * 0.45;
      if (currentZone === 'jail' && this.arena.jailCampRingMat) {
        this.arena.jailCampRingMat.opacity = pulse;
      }
      if (currentZone === 'pique' && this.arena.piqueCampRingMat) {
        this.arena.piqueCampRingMat.opacity = pulse;
      }

      if (this.campTimer >= 4.0) {
        // Trigger Anti-Camp Penalty!
        this.campTimer = 0;
        this.seeker.stunTimer = 2.6;
        this.seeker.activeSkill = null;
        window.soundFX.playCapture();

        if (currentZone === 'jail') {
          // Push Seeker south away from Jail and auto-free prisoners!
          this.seeker.position.set(0, 0, -7.5);
          this.triggerPrisonRescue(null, true);
        } else {
          // Push Seeker away from the central Pique!
          const angle = Math.random() * Math.PI * 2;
          this.seeker.position.set(Math.cos(angle) * 9.5, 0, Math.sin(angle) * 9.5);
          this.arena.resolveCollision(this.seeker.position, this.seeker.radius);
          this.showBigAlert('⚡ PENALIDADE GUARDA-CAIXÃO! Pegador repelido e atordoado por 2.5s!', 2.8);
        }
      }
    } else {
      this.campingZone = null;
      this.campTimer = Math.max(0, this.campTimer - dt * 1.8);
      if (this.arena.jailCampRingMat) this.arena.jailCampRingMat.opacity = 0;
      if (this.arena.piqueCampRingMat) this.arena.piqueCampRingMat.opacity = 0;
    }
  }

  captureHider(hider, fromNet = false) {
    if (hider.state !== 'free') return;

    if (!fromNet && this.isMultiplayer && this.wsConnected) {
      this.sendNetMessage({
        type: 'game_event',
        eventType: 'capture',
        hiderId: hider.id
      });
    }

    hider.state = 'jailed';
    hider.posture = 'normal';
    hider.activeSkill = null;
    hider.skillTimer = 0;

    const jailedList = this.hiders.filter((h) => h.state === 'jailed');
    const idx = jailedList.length - 1;
    const angle = idx * 1.5;
    hider.position.set(
      this.arena.jailPos.x + Math.cos(angle) * 0.75,
      0,
      this.arena.jailPos.z + Math.sin(angle) * 0.75
    );

    // Efeito Momentum: Cada captura reduz em 3.5s os tempos de recarga das habilidades 1 a 4 do Pegador!
    if (this.seeker) {
      for (const slot of [1, 2, 3, 4]) {
        if (this.seeker.cooldowns[slot] > 0) {
          this.seeker.cooldowns[slot] = Math.max(0, this.seeker.cooldowns[slot] - 3.5);
        }
      }
    }

    this.stats.captures++;
    window.soundFX.playCapture();
    this.showBigAlert(`🚨 PEGO! ${hider.name} foi para a Prisão! (⚡ -3.5s Recargas)`, 2.2);
    this.checkWinConditions();
  }

  checkWinConditions() {
    if (this.matchState === 'gameover') return;

    const freeCount = this.hiders.filter((h) => h.state === 'free').length;
    const savedCount = this.hiders.filter((h) => h.state === 'saved').length;

    // Regra: O Pegador perde imediatamente se pelo menos 3 dos 4 Escondidos estiverem no Pique
    if (savedCount >= 3) {
      this.endMatch(
        true,
        'Vitória dos Escondidos!',
        `${savedCount} de 4 bonecos bateram no Pique e derrotaram o Pegador!`
      );
      return;
    }

    // Se não há mais nenhum escondido solto (freeCount === 0) e menos de 3 chegaram ao Pique, o Pegador vence!
    if (freeCount === 0) {
      this.endMatch(
        false,
        'Vitória do Pegador!',
        savedCount > 0
          ? `Apenas ${savedCount}/3 chegaram ao Pique e todos os demais foram capturados!`
          : 'Todos os bonecos palito foram capturados e trancados na prisão!'
      );
    }
  }

  endMatch(hidersWon, title, description, fromNet = false) {
    if (this.matchState === 'gameover') return;
    this.matchState = 'gameover';

    if (!fromNet && this.isMultiplayer && this.wsConnected && this.isRoomHost) {
      this.sendNetMessage({
        type: 'game_event',
        eventType: 'gameover',
        hidersWon,
        title,
        description
      });
    }
    const playerWon = (this.selectedRole === 'hider' && hidersWon) ||
                      (this.selectedRole === 'seeker' && !hidersWon);

    window.soundFX.playMatchEnd(playerWon);

    const modal = document.getElementById('gameover-modal');
    const badge = document.getElementById('gameover-badge');
    const titleEl = document.getElementById('gameover-title');
    const descEl = document.getElementById('gameover-desc');
    const statsGrid = document.getElementById('match-stats-grid');

    badge.textContent = playerWon ? '🏆 VITÓRIA!' : '💀 FIM DE JOGO';
    titleEl.textContent = title;
    descEl.textContent = description;

    const savedCount = this.hiders.filter((h) => h.state === 'saved').length;
    statsGrid.innerHTML = `
      <div class="match-stat-box">
        <div class="match-stat-val">${this.stats.salvaTodosCount}</div>
        <div class="match-stat-lbl">"Salva Todos" Realizados</div>
      </div>
      <div class="match-stat-box">
        <div class="match-stat-val">${this.stats.captures}</div>
        <div class="match-stat-lbl">Capturas na Partida</div>
      </div>
      <div class="match-stat-box">
        <div class="match-stat-val">${savedCount} / 4</div>
        <div class="match-stat-lbl">Salvos no Pique</div>
      </div>
      <div class="match-stat-box">
        <div class="match-stat-val">${Math.round(this.stats.acrobatTime)}s</div>
        <div class="match-stat-lbl">Tempo em Acrobacia</div>
      </div>
    `;

    modal.classList.remove('hidden');

    // Inicia contagem regressiva de 3.5s no placar antes de entrar nos 2 Anúncios obrigatórios
    if (this.preAdInterval) {
      clearInterval(this.preAdInterval);
      this.preAdInterval = null;
    }

    const adCountdownEl = document.getElementById('gameover-ad-countdown');
    const delaySecs = (window.ADS_CONFIG && window.ADS_CONFIG.scoreboardDelaySeconds) || 3.5;
    const startTs = performance.now();

    if (adCountdownEl) {
      adCountdownEl.textContent = `📺 Intervalo comercial (2 anúncios) em ${Math.ceil(delaySecs)}s...`;
    }

    this.preAdInterval = setInterval(() => {
      const elapsed = (performance.now() - startTs) / 1000;
      const left = Math.max(0, delaySecs - elapsed);
      if (adCountdownEl) {
        adCountdownEl.textContent = `📺 Intervalo comercial (2 anúncios) em ${Math.ceil(left)}s...`;
      }
      if (left <= 0) {
        clearInterval(this.preAdInterval);
        this.preAdInterval = null;
        this.startPostMatchAds(false);
      }
    }, 100);
  }

  startPostMatchAds(preferReturnToMenu = false) {
    if (this.preAdInterval) {
      clearInterval(this.preAdInterval);
      this.preAdInterval = null;
    }

    const gameoverModal = document.getElementById('gameover-modal');
    if (gameoverModal) gameoverModal.classList.add('hidden');

    if (!window.adManager) {
      this.finishPostMatchTransition(preferReturnToMenu);
      return;
    }

    this.pendingNetRestart = null;

    window.adManager.playMatchAdBreak((wantsMenu) => {
      const goToMenu = preferReturnToMenu || wantsMenu;
      this.finishPostMatchTransition(goToMenu);
    });

    if (preferReturnToMenu) {
      window.adManager.returnToMenuAfterAds = true;
      const menuToggleBtn = document.getElementById('btn-ad-return-menu');
      if (menuToggleBtn) {
        menuToggleBtn.classList.add('active');
        menuToggleBtn.textContent = '🏠 Ir para o Menu após os anúncios: SIM (Trocar Papel / Sala)';
      }
    }
  }

  finishPostMatchTransition(goToMenu) {
    if (goToMenu) {
      if (this.isMultiplayer && this.wsConnected) {
        this.sendNetMessage({ type: 'leave_room' });
        this.isMultiplayer = false;
      }
      document.getElementById('gameover-modal').classList.add('hidden');
      document.getElementById('menu-modal').classList.remove('hidden');
      document.getElementById('hud-top').classList.add('hidden');
      document.getElementById('hud-bottom').classList.add('hidden');
      this.matchState = 'menu';
      return;
    }

    // Inicia automaticamente a próxima partida para todos (Online e Offline)
    if (this.isMultiplayer && this.wsConnected) {
      if (this.pendingNetRestart) {
        this.pendingNetRestart = null;
        this.launchMatchEntities();
      } else {
        this.sendNetMessage({ type: 'restart_match' });
      }
    } else {
      this.startMatch();
    }
  }

  // Checks if the Seeker can visually detect a given Hider right now
  isHiderDetectedBySeeker(hider) {
    if (!this.seeker || hider.state !== 'free' || this.matchState !== 'hunt') return false;

    const sPos = this.seeker.position;
    const hPos = hider.position;
    const dx = hPos.x - sPos.x;
    const dz = hPos.z - sPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // 1. Check Line of Sight blocked by walls
    if (!this.arena.hasLineOfSight(sPos, hPos)) return false;

    const seekerSkill = this.seeker.activeSkill;

    // 2. High Acrobatic Poses (Dragon Flag & Corridor Split):
    // 100% immune to normal ground vision and Flashlight 360!
    // ONLY detected if Seeker uses "Olhar para Cima" (look_up) within 9.5m!
    if (hider.getElevationLevel() === 'high') {
      return seekerSkill === 'look_up' && dist <= 9.5;
    }

    // 3. "Tinta Fresca 2D" (Flat Paint camouflage against wall):
    // 100% immune to normal vision and Look Up (even if Seeker walks right past them)!
    // ONLY detected if Seeker uses "Acender a Luz 360°" (flashlight_360) within 6.5m!
    if (hider.posture === 'flat_paint') {
      return seekerSkill === 'flashlight_360' && dist <= 6.5;
    }

    // 4. Determine Vision Range & Cone Angle for normal / wall_hug
    let maxRange = 11.5;
    let halfConeAngle = (35 * Math.PI) / 180; // 70 deg total cone

    if (seekerSkill === 'flashlight_360') {
      maxRange = 13.0;
      halfConeAngle = Math.PI; // Full 360 spotlight reveals wall_hug shadows!
    } else if (hider.posture === 'wall_hug') {
      // Pressing against a wall hides the stickman in the wall's shadow:
      // shrinks detection range by 60% (to 4.6m) and narrows angle!
      maxRange = 4.6;
      halfConeAngle = (24 * Math.PI) / 180;
    }

    if (dist > maxRange) return false;

    // Close physical proximity (< 1.25m) only reveals if NOT in wall_hug/skills
    if (dist < 1.25 && hider.posture === 'normal') return true;

    // Check angle inside Seeker's facing cone
    if (halfConeAngle < Math.PI - 0.01) {
      const lookX = Math.sin(this.seeker.facingAngle);
      const lookZ = Math.cos(this.seeker.facingAngle);
      const dot = (dx / dist) * lookX + (dz / dist) * lookZ;
      const angleToHider = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angleToHider > halfConeAngle) return false;
    }

    return true;
  }

  tryCaptureNearbyHiders() {
    if (!this.seeker || this.matchState !== 'hunt' || this.seeker.stunTimer > 0) return;

    for (const h of this.hiders) {
      if (h.state !== 'free') continue;

      const dist = this.seeker.position.distanceTo(h.position);
      const captureReach = this.seeker.activeSkill === 'lunge_dash' ? 1.85 : 1.35;

      // CRITICAL: Seeker can ONLY capture a Hider if the Hider is actually detected!
      // If the Hider is in Dragon Flag, Tinta Fresca 2D, Espacate, or hidden in Wall Hug
      // outside the cone, the Seeker passes right by/under them without capturing!
      if (dist <= captureReach && this.isHiderDetectedBySeeker(h)) {
        this.captureHider(h);
      }
    }
  }

  updatePlayerInput(dt) {
    if (!this.player || this.player.state !== 'free') return;

    // Seeker stays still at Pique during initial countdown
    if (this.player.role === 'seeker' && this.matchState === 'countdown') {
      this.player.facingAngle += dt * 1.8;
      this.player.update(dt, false);
      return;
    }

    if (this.player.stunTimer > 0) {
      this.player.update(dt, false);
      return;
    }

    let ix = 0;
    let iz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) iz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) iz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;

    const inputVec = new THREE.Vector3(ix, 0, iz);
    if (inputVec.lengthSq() > 0) inputVec.normalize();

    // If holding an immobilized acrobatic pose (Dragon Flag, Flat Paint, Corridor Split)
    if (
      this.player.posture === 'dragon_flag' ||
      this.player.posture === 'flat_paint' ||
      this.player.posture === 'corridor_split'
    ) {
      this.player.poseActiveTime = (this.player.poseActiveTime || 0) + dt;

      // Once the player lets go of the initial movement key, any new directional input releases the pose to run!
      if (inputVec.lengthSq() < 0.01) {
        this.player.poseReleaseArmed = true;
      }

      // Also release immediately if pulling away from the wall after a short 0.22s grace window
      const pullingAwayFromWall =
        this.player.posture !== 'corridor_split' &&
        inputVec.lengthSq() > 0.01 &&
        inputVec.x * this.player.wallNormal.x + inputVec.z * this.player.wallNormal.z > 0.35;

      if (
        this.player.poseActiveTime > 0.22 &&
        ((this.player.poseReleaseArmed && inputVec.lengthSq() > 0.01) || pullingAwayFromWall)
      ) {
        // Drop out of the pose and start running in the same frame!
        this.player.endActiveSkill(false);
      } else {
        this.stats.acrobatTime += dt;
        this.player.velocity.set(0, 0, 0);
        this.player.update(dt, false);
        return;
      }
    }

    // Calculate speed:
    // Seeker standard speed (10.4) is now slightly faster than the old Lunge Dash speed (9.9),
    // and Lunge Dash retains the exact same +50% (1.5x) boost above the new Seeker speed (15.6)!
    let baseSpeed = this.player.role === 'seeker' ? 10.4 : 6.1;
    if (this.player.speedBoostTimer > 0) baseSpeed *= 1.5;
    if (this.player.role === 'seeker' && this.player.activeSkill === 'look_up') {
      baseSpeed *= 0.80; // Penalidade reduzida para apenas -20% ao olhar para cima
    }
    if (this.player.posture === 'wall_hug') {
      baseSpeed *= 0.58; // Careful side-step along wall
    }

    const isMoving = inputVec.lengthSq() > 0.01;
    if (isMoving) {
      this.player.velocity.copy(inputVec).multiplyScalar(baseSpeed);
      this.player.position.addScaledVector(this.player.velocity, dt);
      if (this.player.posture === 'normal') {
        this.player.facingAngle = Math.atan2(inputVec.x, inputVec.z);
      }
    } else {
      this.player.velocity.set(0, 0, 0);
    }

    // Resolve Wall Collisions
    this.arena.resolveCollision(this.player.position, this.player.radius);

    // Detect Wall Proximity & Corridor status for Hider
    const wallCheck = this.arena.detectWallInteraction(
      this.player.position,
      this.player.radius,
      inputVec
    );
    this.player.isTouchingWall = wallCheck.nearWall;

    const corrCheck = this.arena.detectCorridor(this.player.position);
    this.player.inCorridor = corrCheck.inCorridor;
    if (corrCheck.inCorridor) {
      this.player.corridorInfo = corrCheck;
    }

    if (this.player.role === 'hider' && !this.player.activeSkill) {
      if (wallCheck.nearWall) {
        this.player.wallNormal.copy(wallCheck.wallNormal);
        // Enter wall_hug when pressing against the wall, or stay in wall_hug while sliding along it
        if (wallCheck.pressingIntoWall || (this.player.posture === 'wall_hug' && !isMoving)) {
          if (this.player.posture !== 'wall_hug') {
            window.soundFX.playWallHug();
          }
          this.player.posture = 'wall_hug';
        } else if (this.player.posture === 'wall_hug') {
          // Check if player pulled away from wall
          const pullAwayDot = inputVec.x * wallCheck.wallNormal.x + inputVec.z * wallCheck.wallNormal.z;
          if (pullAwayDot > 0.45) {
            this.player.posture = 'normal';
          }
        }
      } else {
        this.player.posture = 'normal';
      }
    }

    // Check auto-interaction with Pique if Hider walks right onto the crystal and presses Space
    this.player.update(dt, isMoving);
  }

  // Moves an AI character smoothly along an A* path around walls toward goalPos
  followNavPath(char, goalPos, speed, dt) {
    char.pathTimer = (char.pathTimer || 0) - dt;
    const goalChanged =
      !char.lastPathGoal || char.lastPathGoal.distanceToSquared(goalPos) > 1.2;

    if (!char.navPath || char.navPath.length === 0 || char.pathTimer <= 0 || goalChanged) {
      char.navPath = this.arena.findPath(char.position, goalPos);
      char.lastPathGoal = goalPos.clone();
      char.pathTimer = 0.45 + Math.random() * 0.15;
    }

    // Pop waypoints that we've already reached, or skip ahead if Line-of-Sight is clear
    while (char.navPath.length > 1) {
      const wp = char.navPath[0];
      if (Math.hypot(wp.x - char.position.x, wp.z - char.position.z) < 0.7) {
        char.navPath.shift();
      } else if (this.arena.hasLineOfSight(char.position, char.navPath[1])) {
        char.navPath.shift();
      } else {
        break;
      }
    }

    const nextWp = char.navPath[0] || goalPos;
    const dx = nextWp.x - char.position.x;
    const dz = nextWp.z - char.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.25) {
      const moveVec = new THREE.Vector3(dx / dist, 0, dz / dist);
      char.velocity.copy(moveVec).multiplyScalar(speed);
      char.position.addScaledVector(char.velocity, dt);

      const targetAngle = Math.atan2(moveVec.x, moveVec.z);
      let diff = targetAngle - char.facingAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      char.facingAngle += diff * Math.min(1, dt * 12);
      return { isMoving: true, moveVec };
    }

    char.velocity.set(0, 0, 0);
    return { isMoving: false, moveVec: new THREE.Vector3() };
  }

  // Picks the safest wall hiding spot out of the Seeker's Line of Sight and away from other Hiders
  pickBestHidingSpot(hider) {
    let bestSpot = hider.aiTargetSpot || this.arena.hidingSpots[0];
    let maxScore = -9999;

    for (const sp of this.arena.hidingSpots) {
      const spVec = new THREE.Vector3(sp.x, 0, sp.z);
      const dSeeker = this.seeker ? spVec.distanceTo(this.seeker.position) : 18;
      const dSelf = spVec.distanceTo(hider.position);

      // Huge bonus if spot is blocked by a wall from Seeker's view
      const hiddenFromSeeker = this.seeker ? !this.arena.hasLineOfSight(this.seeker.position, spVec) : true;

      // Avoid crowding spots already taken by another Hider
      let crowded = false;
      for (const other of this.hiders) {
        if (other !== hider && other.state === 'free') {
          if (Math.hypot(other.position.x - sp.x, other.position.z - sp.z) < 2.2) {
            crowded = true;
            break;
          }
        }
      }

      let score = dSeeker * 1.4 - dSelf * 0.35 + (hiddenFromSeeker ? 12 : -10) - (crowded ? 15 : 0);
      score += Math.random() * 3;

      if (score > maxScore) {
        maxScore = score;
        bestSpot = sp;
      }
    }
    return bestSpot;
  }

  updateAIHiders(dt) {
    // In Multiplayer Mini-Servers, only the Room Host drives AI-backfilled bots
    if (this.isMultiplayer && !this.isRoomHost) return;

    for (const h of this.hiders) {
      if (h.isPlayer || h.isRemoteHuman) continue;

      if (h.state !== 'free') {
        h.update(dt, false);
        continue;
      }

      const distToSeeker = this.seeker ? h.position.distanceTo(this.seeker.position) : 99;
      const isCurrentlyDetected = this.isHiderDetectedBySeeker(h);

      // If holding a fixed acrobatic skill (Dragon Flag, Flat Paint, Corridor Split)
      if (h.activeSkill && h.posture !== 'normal' && h.posture !== 'wall_hug') {
        // Smart Stamina Management: cancel pose early before trembling if Seeker moved away!
        if (h.stamina < 28 && distToSeeker > 7.5) {
          h.endActiveSkill(false);
        } else {
          h.velocity.set(0, 0, 0);
          h.update(dt, false);
          continue;
        }
      }

      h.aiDecisionTimer -= dt;
      const jailedCount = this.hiders.filter((x) => x.state === 'jailed').length;
      const distToPique = h.position.distanceTo(this.arena.piquePos);
      const distToJail = h.position.distanceTo(this.arena.jailPos);

      let goForPrisonRescue = false;
      let goForPiqueSave = false;

      if (this.matchState === 'hunt' && !isCurrentlyDetected) {
        const seekerDistToJail = this.seeker.position.distanceTo(this.arena.jailPos);
        const seekerDistToPique = this.seeker.position.distanceTo(this.arena.piquePos);
        const canRescueNow = this.salvaTodosUnlocked && this.shortCircuitTimer <= 0 && this.salvaTodosCooldown <= 0;

        // 1. If allies are locked in the North Prison, Salva-Todos is unlocked & not short-circuited, go rescue!
        if (jailedCount > 0 && canRescueNow && seekerDistToJail > 6.5) {
          goForPrisonRescue = true;
        }
        // 2. ONLY go for the central Pique when it is UNLOCKED (final 30s of the match)!
        else if (this.piqueUnlocked && seekerDistToPique > 5.5) {
          goForPiqueSave = true;
        }
      }

      // If spotted by Seeker or decision timer expired, pick the best wall hiding spot
      if (isCurrentlyDetected && h.aiDecisionTimer < 1.8) {
        h.aiTargetSpot = this.pickBestHidingSpot(h);
        h.aiDecisionTimer = 3.0;
      } else if (h.aiDecisionTimer <= 0) {
        h.aiTargetSpot = this.pickBestHidingSpot(h);
        h.aiDecisionTimer = 4.5 + Math.random() * 2.5;
      }

      let goalPos = new THREE.Vector3(h.aiTargetSpot.x, 0, h.aiTargetSpot.z);

      if (goForPrisonRescue) {
        goalPos.set(this.arena.jailPos.x, 0, this.arena.jailPos.z + this.arena.jailRadius + 0.4);
        if (distToJail <= this.arena.jailRadius + 1.2) {
          this.triggerPrisonRescue(h, false);
          continue;
        }
      } else if (goForPiqueSave) {
        goalPos.copy(this.arena.piquePos);
        if (distToPique <= this.arena.piqueRadius + 0.5) {
          this.triggerPiqueSave(h);
          continue;
        }
      }

      const distToGoal = h.position.distanceTo(goalPos);
      let isMoving = false;
      let moveVec = new THREE.Vector3();

      if (distToGoal > 0.55) {
        let speed = 6.0;
        if (h.speedBoostTimer > 0) speed *= 1.45;
        const navRes = this.followNavPath(h, goalPos, speed, dt);
        isMoving = navRes.isMoving;
        moveVec = navRes.moveVec;
        h.posture = 'normal';
      } else {
        h.velocity.set(0, 0, 0);
      }

      this.arena.resolveCollision(h.position, h.radius);
      const wallCheck = this.arena.detectWallInteraction(h.position, h.radius, moveVec);
      h.isTouchingWall = wallCheck.nearWall;

      const corrCheck = this.arena.detectCorridor(h.position);
      h.inCorridor = corrCheck.inCorridor;
      if (corrCheck.inCorridor) {
        h.corridorInfo = corrCheck;
      }

      if (wallCheck.nearWall && !goForPrisonRescue && !goForPiqueSave) {
        h.wallNormal.copy(wallCheck.wallNormal);

        // Snap into wall_hug when at hiding spot or when Seeker is nearby
        if (distToGoal < 1.25 || distToSeeker < 8.5) {
          h.posture = 'wall_hug';
        }

        // Tactical Use of Hider Abilities when Seeker is within 10m!
        if (this.matchState === 'hunt' && distToSeeker < 10.0 && h.stamina > 42) {
          // Throw distraction pebble away from self if Seeker isn't looking right at us yet
          if (!isCurrentlyDetected && distToSeeker > 5.0 && h.cooldowns[4] <= 0 && Math.random() < 0.04) {
            this.activateCharacterAbility(h, 4); // Estalo Distração!
          } else if (distToSeeker < 8.5) {
            // Pop an acrobatic stealth pose to become invisible!
            // If in a corridor, prefer the Van Damme Corridor Split (3)
            if (h.inCorridor && h.cooldowns[3] <= 0 && Math.random() < 0.65) {
              this.activateCharacterAbility(h, 3); // Espacate Alto (Só em Corredor)
            } else if (h.cooldowns[1] <= 0 && Math.random() < 0.5) {
              this.activateCharacterAbility(h, 1); // Dragon Flag
            } else if (h.cooldowns[2] <= 0) {
              this.activateCharacterAbility(h, 2); // Tinta Fresca 2D
            }
          }
        }
      }

      h.update(dt, isMoving);
    }
  }

  updateAISeeker(dt) {
    if (!this.seeker || this.seeker.isPlayer || this.seeker.isRemoteHuman) return;
    if (this.isMultiplayer && !this.isRoomHost) return;

    if (this.matchState === 'countdown' || this.seeker.stunTimer > 0) {
      if (this.matchState === 'countdown') this.seeker.facingAngle += dt * 2.2;
      this.seeker.update(dt, false);
      return;
    }

    const s = this.seeker;
    s.aiTimer -= dt;

    // 1. Check if any free Hider is VISUALLY detected (respecting walls and stealth skills!)
    let spottedHider = null;
    let bestDist = Infinity;

    for (const h of this.hiders) {
      if (h.state === 'free' && this.isHiderDetectedBySeeker(h)) {
        const d = s.position.distanceTo(h.position);
        if (d < bestDist) {
          bestDist = d;
          spottedHider = h;
        }
      }
    }

    if (spottedHider) {
      s.aiState = 'chase';
      s.aiTargetPos.copy(spottedHider.position);
      s.aiTimer = 1.5;

      // Use Lunge Dash if within 3.6m and facing the Hider
      if (bestDist < 3.6 && s.cooldowns[4] <= 0) {
        this.activateCharacterAbility(s, 4);
      }
    } else {
      // If Seeker WAS chasing someone, and that Hider just vanished (used Dragon Flag, Tinta Fresca, Espacate, or turned a corner):
      // Seeker loses track of them and switches to patrol another room instead of standing on top of them!
      if (s.aiState === 'chase') {
        s.aiState = 'patrol';
        s.aiTimer = 0; // Pick a new patrol waypoint immediately
      }

      // Fair Skill Usage: If investigating a noise event (!) and close to the noise origin, use a scan skill
      const jailedCount = this.hiders.filter((h) => h.state === 'jailed').length;
      if (this.salvaTodosUnlocked && !s.singleUseConsumed[5] && jailedCount >= 2 && Math.random() < 0.015) {
        this.activateCharacterAbility(s, 5); // Curto-Circuito to protect 2+ prisoners!
      } else if (s.aiState === 'investigate' && s.position.distanceTo(s.aiTargetPos) < 3.5) {
        if (s.cooldowns[2] <= 0 && Math.random() < 0.5) {
          this.activateCharacterAbility(s, 2); // Olhar para Cima at noise spot
        } else if (s.cooldowns[1] <= 0) {
          this.activateCharacterAbility(s, 1); // Acender a Luz 360 at noise spot
        }
        s.aiState = 'patrol';
        s.aiTimer = 0;
      } else if (s.aiState === 'patrol') {
        // Occasional fair patrol scans (no cheating on invisible Hider positions)
        if (s.cooldowns[3] <= 0 && Math.random() < 0.005) {
          this.activateCharacterAbility(s, 3); // Radar Cardíaco
        } else if (s.cooldowns[1] <= 0 && Math.random() < 0.004) {
          this.activateCharacterAbility(s, 1); // Acender a Luz 360
        }
      }

      // Pick next patrol waypoint using A* (avoiding anti-camp zones and picking a distant room)
      if (this.campingZone || s.aiTimer <= 0 || s.position.distanceTo(s.aiTargetPos) < 1.4) {
        s.aiState = 'patrol';
        s.aiTimer = 5.0;
        const validWaypoints = this.arena.waypoints.filter((wp) => {
          if (wp.distanceTo(s.position) < 6.0) return false;
          if (this.piqueUnlocked && wp.distanceTo(this.arena.piquePos) < 7.5) return false;
          if (wp.distanceTo(this.arena.jailPos) < 7.5) return false;
          return true;
        });
        const pool = validWaypoints.length > 0 ? validWaypoints : this.arena.waypoints;
        const wp = pool[Math.floor(Math.random() * pool.length)];
        s.aiTargetPos.copy(wp);
      }
    }

    let speed = s.aiState === 'chase' ? 10.4 : 8.6;
    if (s.speedBoostTimer > 0) speed *= 1.5;
    if (s.activeSkill === 'look_up') speed *= 0.80;

    const navRes = this.followNavPath(s, s.aiTargetPos, speed, dt);
    this.arena.resolveCollision(s.position, s.radius);
    s.update(dt, navRes.isMoving);
  }

  // Smoothly interpolates remote human players (and Host-driven AI bots on non-host clients)
  updateRemoteCharacters(dt) {
    if (!this.isMultiplayer) return;

    for (const c of this.characters) {
      if (c.isPlayer) continue;
      if (this.isRoomHost && !c.isRemoteHuman) continue; // Host already updated its own AI bots

      if (c.netTargetPos) {
        c.position.lerp(c.netTargetPos, Math.min(1, dt * 15));
      }
      const moving = c.velocity && c.velocity.lengthSq() > 0.1;
      c.update(dt, moving);
    }
  }

  broadcastNetworkTick(dt) {
    if (!this.isMultiplayer || !this.wsConnected || !this.player) return;

    this.netSyncTimer -= dt;
    if (this.netSyncTimer > 0) return;
    this.netSyncTimer = 0.035; // ~28 Hz network tick

    // 1. Send our own human character state
    this.sendNetMessage({
      type: 'player_update',
      slotId: this.player.id,
      x: Number(this.player.position.x.toFixed(2)),
      z: Number(this.player.position.z.toFixed(2)),
      vx: Number(this.player.velocity.x.toFixed(2)),
      vz: Number(this.player.velocity.z.toFixed(2)),
      facingAngle: Number(this.player.facingAngle.toFixed(3)),
      posture: this.player.posture,
      activeSkill: this.player.activeSkill,
      skillTimer: Number((this.player.skillTimer || 0).toFixed(2)),
      stamina: Math.round(this.player.stamina),
      isTrembling: this.player.isTrembling,
      inCorridor: this.player.inCorridor,
      corridorWidth: this.player.corridorInfo ? this.player.corridorInfo.width : 2.4,
      corridorFacing: this.player.corridorInfo ? this.player.corridorInfo.facingAngle : 0,
      wnx: Number(this.player.wallNormal.x.toFixed(2)),
      wnz: Number(this.player.wallNormal.z.toFixed(2))
    });

    // 2. If we are the Room Host, broadcast match timers & AI-backfilled bot states
    if (this.isRoomHost) {
      const bots = [];
      for (const c of this.characters) {
        if (!c.isPlayer && !c.isRemoteHuman) {
          bots.push({
            id: c.id,
            x: Number(c.position.x.toFixed(2)),
            z: Number(c.position.z.toFixed(2)),
            vx: Number(c.velocity.x.toFixed(2)),
            vz: Number(c.velocity.z.toFixed(2)),
            facingAngle: Number(c.facingAngle.toFixed(3)),
            state: c.state,
            posture: c.posture,
            activeSkill: c.activeSkill,
            skillTimer: Number((c.skillTimer || 0).toFixed(2)),
            stamina: Math.round(c.stamina),
            isTrembling: c.isTrembling,
            inCorridor: c.inCorridor,
            corridorWidth: c.corridorInfo ? c.corridorInfo.width : 2.4,
            corridorFacing: c.corridorInfo ? c.corridorInfo.facingAngle : 0,
            wnx: Number(c.wallNormal.x.toFixed(2)),
            wnz: Number(c.wallNormal.z.toFixed(2))
          });
        }
      }

      this.sendNetMessage({
        type: 'world_sync',
        matchState: this.matchState,
        countdownTimer: Number(this.countdownTimer.toFixed(2)),
        matchTimer: Number(this.matchTimer.toFixed(2)),
        salvaTodosUnlocked: this.salvaTodosUnlocked,
        salvaTodosCooldown: Number(this.salvaTodosCooldown.toFixed(2)),
        piqueUnlocked: this.piqueUnlocked,
        shortCircuitTimer: Number(this.shortCircuitTimer.toFixed(2)),
        campTimer: Number(this.campTimer.toFixed(2)),
        campingZone: this.campingZone,
        bots
      });
    }
  }

  updateVisionConeAndFog() {
    if (!this.seeker) return;

    const s = this.seeker;
    const ox = s.position.x;
    const oz = s.position.z;
    const lookX = Math.sin(s.facingAngle);
    const lookZ = Math.cos(s.facingAngle);

    let maxDist = 11.8;
    let fov = (74 * Math.PI) / 180;
    let coneY = 0.05;

    // Color stops from core (ring 0) to outer aura (ring 5) for Tibia Utevo Gran Lux / Torch beam
    let coreRGB = [0.58, 0.42, 0.16];
    let midRGB = [0.36, 0.21, 0.05];

    const shimmer = 1.0 + Math.sin(this.elapsedTime * 14.0) * 0.06;

    if (this.matchState === 'countdown') {
      maxDist = 2.4;
      fov = Math.PI * 2;
      coreRGB = [0.22, 0.26, 0.35];
      midRGB = [0.08, 0.10, 0.16];

      if (this.seekerSpotLight) this.seekerSpotLight.intensity = 0;
      if (this.seekerGranLuxLight) {
        this.seekerGranLuxLight.position.set(ox, 1.8, oz);
        this.seekerGranLuxLight.color.setHex(0x94a3b8);
        this.seekerGranLuxLight.intensity = 0.8;
        this.seekerGranLuxLight.distance = 5.0;
      }
    } else if (s.activeSkill === 'flashlight_360') {
      // TIBIA "UTEVO GRAN LUX": Radiant 360° golden-solar illumination flooding the dungeon!
      maxDist = 14.2;
      fov = Math.PI * 2;
      coreRGB = [0.82 * shimmer, 0.62 * shimmer, 0.26 * shimmer];
      midRGB = [0.52 * shimmer, 0.32 * shimmer, 0.08 * shimmer];

      if (this.seekerSpotLight) this.seekerSpotLight.intensity = 1.2;
      if (this.seekerGranLuxLight) {
        this.seekerGranLuxLight.position.set(ox, 2.35, oz);
        this.seekerGranLuxLight.color.setHex(0xffc94d);
        this.seekerGranLuxLight.intensity = 5.2 * shimmer;
        this.seekerGranLuxLight.distance = 21.0;
      }
    } else if (s.activeSkill === 'look_up') {
      // Elevated upper-level beam scanning high walls & corridor ceilings
      maxDist = 10.8;
      fov = (108 * Math.PI) / 180;
      coneY = 2.25;
      coreRGB = [0.42 * shimmer, 0.56 * shimmer, 0.72 * shimmer];
      midRGB = [0.18 * shimmer, 0.30 * shimmer, 0.45 * shimmer];

      if (this.seekerSpotLight) {
        this.seekerSpotLight.position.set(ox, 2.55, oz);
        this.seekerSpotLight.target.position.set(ox + lookX * 8, 2.45, oz + lookZ * 8);
        this.seekerSpotLight.color.setHex(0x93c5fd);
        this.seekerSpotLight.angle = (56 * Math.PI) / 180;
        this.seekerSpotLight.intensity = 4.4 * shimmer;
        this.seekerSpotLight.distance = 15.5;
      }
      if (this.seekerGranLuxLight) {
        this.seekerGranLuxLight.position.set(ox, 2.5, oz);
        this.seekerGranLuxLight.color.setHex(0x60a5fa);
        this.seekerGranLuxLight.intensity = 2.2;
        this.seekerGranLuxLight.distance = 11.0;
      }
    } else {
      // Normal Directional Lantern Beam + subtle Utevo Lux personal halo
      coreRGB = [0.56 * shimmer, 0.40 * shimmer, 0.15 * shimmer];
      midRGB = [0.34 * shimmer, 0.19 * shimmer, 0.04 * shimmer];

      if (this.seekerSpotLight) {
        this.seekerSpotLight.position.set(ox, 1.45, oz);
        this.seekerSpotLight.target.position.set(ox + lookX * 8, 0.4, oz + lookZ * 8);
        this.seekerSpotLight.color.setHex(0xffcb57);
        this.seekerSpotLight.angle = (40 * Math.PI) / 180;
        this.seekerSpotLight.intensity = 4.0 * shimmer;
        this.seekerSpotLight.distance = 16.5;
      }
      if (this.seekerGranLuxLight) {
        this.seekerGranLuxLight.position.set(ox, 1.75, oz);
        this.seekerGranLuxLight.color.setHex(0xffb03a);
        this.seekerGranLuxLight.intensity = 1.15 * shimmer;
        this.seekerGranLuxLight.distance = 6.8;
      }
    }

    // Update Human Hider personal night-vision aura
    if (this.hiderAuraLight) {
      if (this.player && this.player.role === 'hider' && this.player.state === 'free') {
        this.hiderAuraLight.position.set(this.player.position.x, 1.9, this.player.position.z);
        this.hiderAuraLight.intensity = 0.85;
      } else {
        this.hiderAuraLight.intensity = 0;
      }
    }

    this.visionMesh.position.y = coneY;
    const posAttr = this.visionGeo.attributes.position;
    const colAttr = this.visionGeo.attributes.color;
    const R = this.visionRays;
    const K = this.visionRings;
    const ringFracs = [0.0, 0.22, 0.46, 0.70, 0.88, 1.0];
    const isFullCircle = fov >= Math.PI * 1.95;

    const startAngle = s.facingAngle - fov / 2;
    for (let ray = 0; ray <= R; ray++) {
      const u = ray / R;
      const ang = startAngle + u * fov;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const hitDist = this.arena.castVisionRay(ox, oz, dx, dz, maxDist);

      // Smooth angular feathering on cone sides so there is no sharp lateral line
      let angFade = 1.0;
      if (!isFullCircle) {
        const edgeDist = Math.min(u, 1.0 - u);
        const t = Math.min(1.0, edgeDist / 0.18);
        angFade = t * t * (3.0 - 2.0 * t);
      }

      for (let ring = 0; ring <= K; ring++) {
        const vIdx = ring * (R + 1) + ray;
        const frac = ringFracs[ring];
        const dist = hitDist * frac;
        posAttr.setXYZ(vIdx, ox + dx * dist, 0, oz + dz * dist);

        // Radial attenuation based on physical distance + soft fade to 0 at tip
        const normDist = Math.min(1.0, dist / maxDist);
        let radialFade = Math.pow(1.0 - normDist, 1.65);
        if (ring === K) {
          radialFade = 0.0; // Outer boundary always fades to 0 in AdditiveBlending (never a hard band!)
        } else if (ring === K - 1) {
          radialFade *= 0.35;
        }

        const w = radialFade * angFade;
        const rCol = (frac < 0.45 ? coreRGB[0] : midRGB[0]) * w;
        const gCol = (frac < 0.45 ? coreRGB[1] : midRGB[1]) * w;
        const bCol = (frac < 0.45 ? coreRGB[2] : midRGB[2]) * w;
        colAttr.setXYZ(vIdx, rCol, gCol, bCol);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Fog of War when Human plays as Seeker:
    // Hiders outside Seeker's detection are hidden unless jailed, saved, or revealed by radar
    for (const h of this.hiders) {
      if (this.selectedRole === 'seeker') {
        if (this.matchState === 'countdown') {
          h.group.visible = false;
          if (h.labelEl) h.labelEl.style.opacity = '0';
        } else if (h.state !== 'free') {
          h.group.visible = true;
          if (h.labelEl) h.labelEl.style.opacity = '1';
        } else {
          const seen = this.isHiderDetectedBySeeker(h);
          const radarActive = (this.seeker.activeSkill === 'heartbeat_radar' && (h.velocity.lengthSq() > 0.1 || h.isTrembling));
          h.group.visible = seen || radarActive;
          if (h.labelEl) h.labelEl.style.opacity = (seen || radarActive) ? '1' : '0';
        }
      } else {
        h.group.visible = true;
        if (h.labelEl) h.labelEl.style.opacity = '1';
      }
    }
  }

  updateNoiseAndTremors(dt) {
    // Check if any Hider is trembling from low stamina OR running in standing posture near the Seeker
    for (const h of this.hiders) {
      if (h.state !== 'free') continue;

      if (h.isTrembling) {
        h.tremorNoiseTimer -= dt;
        if (h.tremorNoiseTimer <= 0) {
          h.tremorNoiseTimer = 1.35;
          this.spawnNoiseEvent(h.position, 8.5, '⚠️ MÚSCULO TREMENDO!', 'hider');
          if (h.isPlayer) window.soundFX.playTremorPulse();
        }
      }

      // Luminous footprint trail for 3s right after a "Salva-Todos" Prison Rescue
      if (this.matchState === 'hunt' && h.escapeTrailTimer > 0 && h.velocity.lengthSq() > 0.5) {
        h.escapeStepSpawnTimer -= dt;
        if (h.escapeStepSpawnTimer <= 0) {
          h.escapeStepSpawnTimer = 0.42;
          this.spawnNoiseEvent(h.position, 2.8, '👣 RASTRO DE FUGA', 'hider');
        }
      }

      // Subtle footstep ripples when a Hider runs standing upright ('normal') within 9.5m of Seeker
      if (
        this.matchState === 'hunt' &&
        this.seeker &&
        h.posture === 'normal' &&
        h.velocity.lengthSq() > 4.0 &&
        h.position.distanceTo(this.seeker.position) <= 9.5 &&
        !this.isHiderDetectedBySeeker(h)
      ) {
        h.footstepTimer -= dt;
        if (h.footstepTimer <= 0) {
          h.footstepTimer = 0.95;
          this.spawnNoiseEvent(h.position, 3.8, '👣 PASSOS', 'hider');
        }
      }
    }

    // Update active 3D noise ripples
    for (let i = this.noiseEvents.length - 1; i >= 0; i--) {
      const ev = this.noiseEvents[i];
      ev.timer -= dt;
      const progress = 1 - ev.timer / ev.maxTimer;
      const scale = 1 + progress * ev.maxRadius * 2;
      ev.mesh.scale.set(scale, scale, 1);
      ev.mat.opacity = Math.max(0, (ev.timer / ev.maxTimer) * 0.8);

      // Position 2D tag
      this.projectWorldToLabel(ev.pos, 1.5, ev.tag);

      if (ev.timer <= 0) {
        this.scene.remove(ev.mesh);
        ev.tag.remove();
        this.noiseEvents.splice(i, 1);
      }
    }
  }

  updateCamera(dt) {
    if (this.matchState === 'menu' || !this.player) {
      const orbitAng = this.elapsedTime * 0.25;
      this.camera.position.set(
        Math.sin(orbitAng) * 22,
        20,
        Math.cos(orbitAng) * 22
      );
      this.camera.lookAt(0, 1.0, 0);
      return;
    }

    const target = this.player.position;

    let offsetY = 21 * this.zoomFactor;
    let offsetZ = 14.5 * this.zoomFactor;

    if (this.cameraPreset === 1) {
      // High tactical overview
      offsetY = 30 * this.zoomFactor;
      offsetZ = 10 * this.zoomFactor;
    } else if (this.cameraPreset === 2) {
      // Closer action 3D perspective
      offsetY = 14.5 * this.zoomFactor;
      offsetZ = 12.5 * this.zoomFactor;
    }

    const desiredPos = new THREE.Vector3(target.x, offsetY, target.z + offsetZ);
    this.camera.position.lerp(desiredPos, Math.min(1, dt * 7.5));
    this.camera.lookAt(target.x, 0.8, target.z - 1.2);
  }

  projectWorldToLabel(worldPos, yOffset, element) {
    if (!element) return;
    const v = worldPos.clone();
    v.y += yOffset;
    v.project(this.camera);

    if (v.z > 1) {
      element.style.display = 'none';
      return;
    }
    element.style.display = 'block';
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(v.y * 0.5) + 0.5) * window.innerHeight;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  updateHUD() {
    if (this.matchState === 'menu') return;

    // 1. Timer & Phase Banner
    const phaseBadge = document.getElementById('phase-badge');
    const timerDisplay = document.getElementById('timer-display');
    const subAnnounce = document.getElementById('sub-announcement');

    if (this.matchState === 'countdown') {
      phaseBadge.className = 'phase-badge countdown';
      phaseBadge.textContent = 'CONTAGEM NO PIQUE';
      timerDisplay.textContent = `00:0${Math.ceil(this.countdownTimer)}`;
      subAnnounce.textContent =
        this.selectedRole === 'hider'
          ? 'Corra para longe do centro e encoste em uma parede!'
          : 'Contando no Pique... Prepare-se para caçar!';
    } else {
      const mins = Math.floor(this.matchTimer / 60);
      const secs = Math.floor(this.matchTimer % 60);
      timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (this.campingZone && this.campTimer > 0.25) {
        phaseBadge.className = 'phase-badge hunt';
        const left = Math.max(0, 4.0 - this.campTimer).toFixed(1);
        phaseBadge.textContent = `⚠️ PROIBIDO GUARDAR CAIXÃO! (${left}s)`;
        subAnnounce.textContent = 'O Pegador não pode acampar na Prisão ou no Pique sem perseguir alguém!';
      } else if (this.shortCircuitTimer > 0) {
        phaseBadge.className = 'phase-badge hunt';
        phaseBadge.textContent = `⚡ CURTO-CIRCUITO ATIVO! (${this.shortCircuitTimer.toFixed(1)}s)`;
        subAnnounce.textContent = 'O botão Salva-Todos da Prisão está em curto e bloqueado!';
      } else if (this.piqueUnlocked) {
        phaseBadge.className = 'phase-badge salvatodos';
        phaseBadge.textContent = '🔓 CLÍMAX: O PIQUE ESTÁ ABERTO!';
        subAnnounce.textContent =
          this.selectedRole === 'hider'
            ? 'Últimos 30s! Corra para o Pique central e aperte ESPAÇO para vencer!'
            : 'O Pique abriu! Intercepte os escondidos nas rotas (ou use 5: Curto-Circuito na Prisão)!';
      } else if (this.salvaTodosUnlocked) {
        phaseBadge.className = 'phase-badge hunt';
        const unlockIn = Math.max(1, Math.ceil(this.matchTimer - this.piqueUnlockTime));
        phaseBadge.textContent = `🔓 SALVA-TODOS ATIVO • PIQUE EM ${unlockIn}s`;
        subAnnounce.textContent =
          this.selectedRole === 'hider'
            ? 'Botão Salva-Todos liberado na Prisão ao Norte! O Pique abre nos 30s finais.'
            : 'Salva-Todos liberado! Use 5 (Curto-Circuito) se quiser travar a Prisão por 15s!';
      } else {
        phaseBadge.className = 'phase-badge countdown';
        const stIn = Math.max(1, Math.ceil(this.matchTimer - this.salvaTodosUnlockTime));
        phaseBadge.textContent = `🔒 INÍCIO DE CAÇADA (SALVA-TODOS EM ${stIn}s)`;
        subAnnounce.textContent =
          this.selectedRole === 'hider'
            ? 'Primeiros 30s: tanto a Prisão quanto o Pique estão trancados! Esconda-se!'
            : 'Primeiros 30s: Salva-Todos trancado! Prenda o máximo que puder agora!';
      }
    }

    // 2. Team Status List
    const listEl = document.getElementById('hiders-status-list');
    let rowsHTML = '';
    for (const c of this.characters) {
      let tagClass = 'tag-free';
      let tagText = 'Livre';

      if (c.role === 'seeker') {
        tagClass = 'tag-seeker';
        tagText = c.activeSkill ? c.activeSkill.replace('_', ' ') : 'Caçando';
      } else if (c.state === 'jailed') {
        tagClass = 'tag-jailed';
        tagText = 'Preso';
      } else if (c.state === 'saved') {
        tagClass = 'tag-saved';
        tagText = 'No Pique!';
      } else if (c.posture === 'wall_hug') {
        tagClass = 'tag-wall';
        tagText = 'Na Parede';
      } else if (c.posture !== 'normal') {
        tagClass = 'tag-acrobat';
        tagText = c.posture === 'dragon_flag' ? 'Dragon Flag' : c.posture === 'flat_paint' ? 'Tinta 2D' : 'Espacate';
      }

      // If Player is Seeker, don't spoil hidden Hiders' exact posture in the top list
      if (this.selectedRole === 'seeker' && c.role === 'hider' && c.state === 'free') {
        tagClass = 'tag-free';
        tagText = 'Escondido';
      }

      rowsHTML += `
        <div class="player-status-row ${c.isPlayer ? 'is-user' : ''}">
          <div class="player-name-wrap">
            <span class="player-dot" style="background:#${c.baseColor.getHexString()}"></span>
            <span>${c.name}</span>
          </div>
          <span class="player-state-tag ${tagClass}">${tagText}</span>
        </div>
      `;
    }
    listEl.innerHTML = rowsHTML;

    // 3. Player Posture & Stamina Card
    if (this.player) {
      const postureVal = document.getElementById('posture-state');
      const staminaPct = document.getElementById('stamina-pct');
      const staminaFill = document.getElementById('stamina-fill');
      const tremorWarn = document.getElementById('tremor-warning');
      const wallHint = document.getElementById('wall-hint');

      const pct = Math.round(this.player.stamina);
      staminaPct.textContent = `${pct}%`;
      staminaFill.style.width = `${pct}%`;
      staminaFill.classList.toggle('low', pct < 30);
      tremorWarn.classList.toggle('hidden', !this.player.isTrembling);

      if (this.player.role === 'hider') {
        const pMap = {
          normal: ['Em Pé (Visível)', 'state-normal'],
          wall_hug: ['Encolhido na Parede (-60% Visão)', 'state-wall'],
          dragon_flag: ['DRAGON FLAG (Alto / Invisível Baixo)', 'state-skill'],
          flat_paint: ['TINTA FRESCA 2D (Camuflado)', 'state-skill'],
          corridor_split: ['ESPACATE NO TETO (Passam por Baixo)', 'state-skill']
        };
        const [label, cls] = pMap[this.player.posture] || pMap.normal;
        postureVal.textContent = label;
        postureVal.className = `posture-value ${cls}`;

        if (this.player.activeSkill) {
          wallHint.innerHTML = '🔓 <strong>Pose Ativa!</strong> Aperte <strong>[ESPAÇO]</strong>, a tecla da habilidade ou <strong>corra para outra direção</strong> para soltar!';
        } else if (this.player.inCorridor && this.player.isTouchingWall) {
          wallHint.innerHTML = '✅ <strong>Corredor + Parede!</strong> Habilidades 1, 2 e <strong>3 (Espacate Van Damme)</strong> prontas!';
        } else if (this.player.inCorridor) {
          wallHint.innerHTML = '✅ <strong>Dentro de Corredor!</strong> <strong>3 (Espacate Alto)</strong> pronto! Encoste no muro para 1 e 2.';
        } else if (this.player.isTouchingWall) {
          wallHint.innerHTML = '✅ <strong>Parede detectada!</strong> Habilidades 1 e 2 prontas (<strong>3: Espacate</strong> exige corredor).';
        } else {
          wallHint.innerHTML = '💡 Encoste em paredes para 1 e 2, ou entre em um corredor estreito para o 3 (Espacate Alto).';
        }
      } else {
        postureVal.textContent = this.player.activeSkill
          ? `Habilidade: ${this.player.activeSkill.toUpperCase()}`
          : 'Patrulha com Lanterna';
        postureVal.className = 'posture-value state-danger';
        wallHint.innerHTML = '🔦 Use <strong>1 (Luz)</strong>, <strong>2 (Olhar Cima)</strong> ou <strong>5 (Curto-Circuito na Prisão)</strong>!';
      }

      // 4. Ability Cooldown Buttons
      const kit = this.player.role === 'hider' ? HIDER_ABILITIES : SEEKER_ABILITIES;
      for (const ab of kit) {
        const btn = document.getElementById(`ability-btn-${ab.slot}`);
        const cdEl = document.getElementById(`cd-overlay-${ab.slot}`);
        if (!btn || !cdEl) continue;

        const cd = this.player.cooldowns[ab.slot];
        const consumed = !!this.player.singleUseConsumed[ab.slot];
        const isShortCircuitActive = ab.id === 'short_circuit' && this.shortCircuitTimer > 0;
        const isActive = this.player.activeSkill === ab.id || isShortCircuitActive;
        const wallUnmet =
          (this.player.role === 'hider' && ab.requiresWall && !this.player.isTouchingWall) ||
          (this.player.role === 'hider' && ab.requiresCorridor && !this.player.inCorridor) ||
          (ab.id === 'short_circuit' && !this.salvaTodosUnlocked);

        btn.classList.toggle('active-skill', isActive);
        btn.classList.toggle('req-unmet', wallUnmet && !isActive);

        if (isShortCircuitActive) {
          btn.classList.remove('on-cooldown');
          cdEl.classList.remove('hidden');
          cdEl.textContent = `⚡ ${this.shortCircuitTimer.toFixed(1)}s`;
        } else if (consumed) {
          btn.classList.add('on-cooldown');
          cdEl.classList.remove('hidden');
          cdEl.textContent = 'USADO';
        } else if (cd > 0) {
          btn.classList.add('on-cooldown');
          cdEl.classList.remove('hidden');
          cdEl.textContent = `${cd.toFixed(1)}s`;
        } else {
          btn.classList.remove('on-cooldown');
          cdEl.classList.add('hidden');
        }
      }
    }

    // 5. Right Objective Counts
    const freeCount = this.hiders.filter((h) => h.state === 'free').length;
    const jailedCount = this.hiders.filter((h) => h.state === 'jailed').length;
    const savedCount = this.hiders.filter((h) => h.state === 'saved').length;

    document.getElementById('stat-free').textContent = freeCount;
    document.getElementById('stat-jailed').textContent = jailedCount;
    document.getElementById('stat-saved').textContent = savedCount;

    // 6. Floating 3D-to-2D World Labels
    const jailedNow = this.hiders.filter((h) => h.state === 'jailed').length;
    if (this.piqueLabelEl) {
      if (!this.piqueUnlocked) {
        const unlockIn = Math.max(1, Math.ceil(this.matchTimer - this.piqueUnlockTime));
        this.piqueLabelEl.textContent = `🔒 O PIQUE (ABRE EM ${unlockIn}s)`;
      } else if (
        this.player &&
        this.player.role === 'hider' &&
        this.player.state === 'free' &&
        this.player.position.distanceTo(this.arena.piquePos) <= this.arena.piqueRadius + 0.95
      ) {
        this.piqueLabelEl.textContent = `⭐ APERTE [ESPAÇO]: BATER PIQUE! (${savedCount}/3)`;
      } else {
        this.piqueLabelEl.textContent = `🔓 O PIQUE ABERTO! (${savedCount}/3 P/ VENCER)`;
      }
    }

    if (this.jailLabelEl) {
      if (this.shortCircuitTimer > 0) {
        this.jailLabelEl.textContent = `⚡ CURTO-CIRCUITO! BLOQUEADO (${this.shortCircuitTimer.toFixed(1)}s)`;
      } else if (!this.salvaTodosUnlocked) {
        const stIn = Math.max(1, Math.ceil(this.matchTimer - this.salvaTodosUnlockTime));
        this.jailLabelEl.textContent = `🔒 PRISÃO (SALVA-TODOS LIBERA EM ${stIn}s)`;
      } else if (this.salvaTodosCooldown > 0) {
        this.jailLabelEl.textContent = `⏳ PRISÃO (SALVA-TODOS EM RECARGA: ${Math.ceil(this.salvaTodosCooldown)}s)`;
      } else if (jailedNow > 0) {
        if (
          this.player &&
          this.player.role === 'hider' &&
          this.player.state === 'free' &&
          this.player.position.distanceTo(this.arena.jailPos) <= this.arena.jailRadius + 1.45
        ) {
          this.jailLabelEl.textContent = `🔥 APERTE [ESPAÇO]: SALVA TODOS (${jailedNow})!`;
        } else {
          this.jailLabelEl.textContent = `🚨 PRISÃO (${jailedNow} PRESO) • BOTÃO SALVA TODOS`;
        }
      } else {
        this.jailLabelEl.textContent = '🔓 PRISÃO (VAZIA • SALVA-TODOS PRONTO)';
      }
    }

    this.projectWorldToLabel(this.arena.piquePos, 2.5, this.piqueLabelEl);
    this.projectWorldToLabel(this.arena.jailPos, 2.1, this.jailLabelEl);
    for (const c of this.characters) {
      const yOff = c.getElevationLevel() === 'high' ? 3.3 : 2.25;
      this.projectWorldToLabel(c.position, yOff, c.labelEl);
    }
  }

  stepSimulation(dt) {
    this.elapsedTime += dt;
    this.arena.updateVisuals(dt, this.elapsedTime);

    // Congela 100% do andamento da partida (contagem, cronômetro, IA e movimento)
    // enquanto qualquer anúncio ou intervalo comercial estiver carregando ou tocando!
    if (window.adManager && window.adManager.isAdActive()) {
      return;
    }

    if (this.matchState === 'countdown') {
      this.countdownTimer -= dt;
      const ceilSec = Math.ceil(this.countdownTimer);
      if (ceilSec !== this.lastCountdownInt && ceilSec > 0) {
        this.lastCountdownInt = ceilSec;
        window.soundFX.playCountdownTick(false);
        this.showBigAlert(`CONTAGEM: ${ceilSec}...`, 0.9);
      }

      this.updatePlayerInput(dt);
      this.updateAIHiders(dt);
      this.updateAISeeker(dt);
      this.updateRemoteCharacters(dt);
      this.broadcastNetworkTick(dt);
      this.updateVisionConeAndFog();
      this.updateNoiseAndTremors(dt);

      if ((!this.isMultiplayer || this.isRoomHost) && this.countdownTimer <= 0) {
        this.matchState = 'hunt';
        window.soundFX.playCountdownTick(true);
        this.showBigAlert('🔥 CAÇADA INICIADA! (Salva-Todos libera em 30s)', 2.4);
      }
    } else if (this.matchState === 'hunt') {
      this.matchTimer -= dt;

      // Tick Seeker's Curto-Circuito timer
      if (this.shortCircuitTimer > 0) {
        this.shortCircuitTimer = Math.max(0, this.shortCircuitTimer - dt);
        if (this.shortCircuitTimer <= 0) {
          this.arena.setJailSwitchState(
            this.salvaTodosUnlocked && this.salvaTodosCooldown <= 0 ? 'ready' : 'locked'
          );
          this.showBigAlert('🔓 Fim do Curto-Circuito! Botão Salva-Todos voltou a funcionar!', 2.2);
        }
      }

      // Tick global 10s cooldown between Salva-Todos rescues
      if (this.salvaTodosCooldown > 0) {
        this.salvaTodosCooldown = Math.max(0, this.salvaTodosCooldown - dt);
        if (this.salvaTodosCooldown <= 0 && this.salvaTodosUnlocked && this.shortCircuitTimer <= 0) {
          this.arena.setJailSwitchState('ready');
        }
      }

      // 1. Unlock "Salva-Todos" switch after 30 seconds of hunt (at 60s remaining)
      if (!this.salvaTodosUnlocked && this.matchTimer <= this.salvaTodosUnlockTime) {
        this.salvaTodosUnlocked = true;
        if (this.shortCircuitTimer <= 0) {
          this.arena.setJailSwitchState('ready');
        }
        window.soundFX.playSingleSave();
        this.showBigAlert('🔓 BOTÃO SALVA-TODOS LIBERADO NA PRISÃO AO NORTE!', 2.8);
      }

      // 2. Unlock Central Pique in the final 30 seconds!
      if (!this.piqueUnlocked && this.matchTimer <= this.piqueUnlockTime) {
        this.piqueUnlocked = true;
        this.arena.setPiqueLocked(false);
        if (this.piqueLight) this.piqueLight.color.setHex(0xf59e0b);
        window.soundFX.playSalvaTodos();
        this.showBigAlert('🔓 O PIQUE ABRIU! (ÚLTIMOS 30s) CORRA PARA O CENTRO!', 3.2);
      }

      this.updatePlayerInput(dt);
      this.updateAIHiders(dt);
      this.updateAISeeker(dt);
      this.updateRemoteCharacters(dt);
      this.tryCaptureNearbyHiders();
      if (!this.isMultiplayer || this.isRoomHost) {
        this.updateAntiCamp(dt);
      }
      this.broadcastNetworkTick(dt);
      this.updateVisionConeAndFog();
      this.updateNoiseAndTremors(dt);

      if ((!this.isMultiplayer || this.isRoomHost) && this.matchTimer <= 0) {
        const freeCount = this.hiders.filter((h) => h.state === 'free').length;
        const savedCount = this.hiders.filter((h) => h.state === 'saved').length;
        if (freeCount > 0 || savedCount >= 3) {
          this.endMatch(
            true,
            'Tempo Esgotado! Escondidos Vencem!',
            freeCount > 0
              ? `${freeCount} boneco(s) palito terminaram soltos na arena!`
              : `${savedCount} de 4 bonecos bateram no Pique!`
          );
        } else {
          this.endMatch(
            false,
            'Vitória do Pegador!',
            savedCount > 0
              ? `Apenas ${savedCount}/3 chegaram ao Pique e nenhum escondido ficou solto!`
              : 'Nenhum escondido escapou a tempo!'
          );
        }
      }
    }
  }

  animate(now) {
    requestAnimationFrame(this.animate);

    const isOnlineMode = this.isMultiplayer || this.selectedServerId !== 'solo';
    if (!isOnlineMode && (document.hidden || !document.hasFocus())) {
      this.lastFrameTime = now;
      return;
    }

    const rawElapsed = (now - this.lastFrameTime) / 1000;
    if (isOnlineMode && rawElapsed > 0.08) {
      this.advanceOnlineSimulation(now);
    } else {
      const dt = Math.min(0.05, Math.max(0, rawElapsed));
      this.lastFrameTime = now;
      this.stepSimulation(dt);
    }

    this.updateCamera(0.016);
    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new StickHideAndSeekGame();
  });
} else {
  window.game = new StickHideAndSeekGame();
}
