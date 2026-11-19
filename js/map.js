// 3D Arena Builder, Wall Physics, Wall-Hug Normal Detection & Raycasting
class ArenaMap {
  constructor(scene) {
    this.scene = scene;
    this.walls = []; // Array of { minX, maxX, minZ, maxZ, cx, cz, w, d, h, mesh }
    this.mapHalfSize = 22;

    // Pique (Base of Salvation) at center
    this.piquePos = new THREE.Vector3(0, 0, 0);
    this.piqueRadius = 2.15;

    // Jail Zone (Prisão + Alavanca Salva Todos) far in the North Wing, away from Pique!
    this.jailPos = new THREE.Vector3(0, 0, -16.8);
    this.jailRadius = 1.85;

    // Patrol waypoints for AI Seeker & Hiding spots for AI Hiders
    this.waypoints = [
      new THREE.Vector3(-14, 0, -14),
      new THREE.Vector3(0, 0, -15),
      new THREE.Vector3(14, 0, -14),
      new THREE.Vector3(15, 0, 0),
      new THREE.Vector3(14, 0, 14),
      new THREE.Vector3(0, 0, 15),
      new THREE.Vector3(-14, 0, 14),
      new THREE.Vector3(-15, 0, 0),
      new THREE.Vector3(-7, 0, -7),
      new THREE.Vector3(8, 0, 8),
      new THREE.Vector3(-8, 0, 8),
      new THREE.Vector3(8, 0, -9)
    ];

    // Good wall-side anchor spots for AI Hiders (0.6m from wall faces)
    this.hidingSpots = [
      { x: -10.75, z: -8.5, nx: 1, nz: 0 },
      { x: -13.25, z: -8.5, nx: -1, nz: 0, isCorridor: true },
      { x: -14.35, z: -8.5, nx: 1, nz: 0, isCorridor: true },
      { x: 10.75, z: -9.5, nx: -1, nz: 0 },
      { x: 13.25, z: -9.5, nx: 1, nz: 0, isCorridor: true },
      { x: 14.35, z: -9.5, nx: -1, nz: 0, isCorridor: true },
      { x: -10.75, z: 9.5, nx: 1, nz: 0 },
      { x: -13.25, z: 9.5, nx: -1, nz: 0, isCorridor: true },
      { x: -14.35, z: 9.5, nx: 1, nz: 0, isCorridor: true },
      { x: 10.75, z: 9.5, nx: -1, nz: 0 },
      { x: 13.25, z: 9.5, nx: 1, nz: 0, isCorridor: true },
      { x: 14.35, z: 9.5, nx: -1, nz: 0, isCorridor: true },
      { x: 0, z: -10.75, nx: 0, nz: -1 },
      { x: 0, z: 10.75, nx: 0, nz: 1 },
      { x: -16.5, z: 2.75, nx: 0, nz: 1 },
      { x: 16.5, z: -2.75, nx: 0, nz: -1 }
    ];

    this.braziers = [];
    this.generateDiabloTextures();
    this.buildArena();
    this.buildNavGrid();
  }

  // Generates procedural high-contrast PBR textures (Color + Bump) inspired by Diablo IV dungeons
  generateDiabloTextures() {
    // 1. Dungeon Floor Flagstone / Slate Texture (512x512 seamless)
    const fSize = 512;
    const fColCanvas = document.createElement('canvas');
    const fBumpCanvas = document.createElement('canvas');
    fColCanvas.width = fColCanvas.height = fSize;
    fBumpCanvas.width = fBumpCanvas.height = fSize;
    const fCtx = fColCanvas.getContext('2d');
    const fbCtx = fBumpCanvas.getContext('2d');

    // Deep mortar base
    fCtx.fillStyle = '#090b10';
    fCtx.fillRect(0, 0, fSize, fSize);
    fbCtx.fillStyle = '#141414';
    fbCtx.fillRect(0, 0, fSize, fSize);

    // Deterministic pseudo-random helper for rich stone grain
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Draw coursed irregular dungeon flagstones (4 rows x 4 cols with staggered joints)
    const rows = 4;
    const rowH = fSize / rows;
    const stonePalettes = [
      [24, 28, 36],
      [30, 33, 41],
      [21, 24, 31],
      [34, 32, 38],
      [26, 31, 34]
    ];

    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      const offset = (r % 2) * (fSize / 8);
      const cols = 4;
      const colW = fSize / cols;

      for (let c = -1; c <= cols; c++) {
        const jitterW = (rand() - 0.5) * 14;
        const sx = c * colW + offset + jitterW;
        const sw = colW - jitterW;
        const pad = 4; // Mortar groove width

        const pal = stonePalettes[Math.floor(rand() * stonePalettes.length)];
        const shade = (rand() - 0.5) * 10;
        const cr = Math.max(12, Math.min(60, Math.round(pal[0] + shade)));
        const cg = Math.max(14, Math.min(64, Math.round(pal[1] + shade)));
        const cb = Math.max(18, Math.min(72, Math.round(pal[2] + shade)));

        // Stone body color
        fCtx.fillStyle = `rgb(${cr},${cg},${cb})`;
        fCtx.fillRect(sx + pad, y0 + pad, sw - pad * 2, rowH - pad * 2);

        // Worn bevel highlight on stone edges
        fCtx.strokeStyle = `rgba(110, 125, 148, 0.16)`;
        fCtx.lineWidth = 2;
        fCtx.strokeRect(sx + pad + 1, y0 + pad + 1, sw - pad * 2 - 2, rowH - pad * 2 - 2);

        // Bump map stone plateau
        const bVal = Math.round(175 + (rand() - 0.5) * 35);
        fbCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
        fbCtx.fillRect(sx + pad, y0 + pad, sw - pad * 2, rowH - pad * 2);

        fbCtx.strokeStyle = '#606060';
        fbCtx.lineWidth = 3;
        fbCtx.strokeRect(sx + pad + 1, y0 + pad + 1, sw - pad * 2 - 2, rowH - pad * 2 - 2);

        // Subtle cracks inside some flagstones
        if (rand() < 0.55) {
          const cx1 = sx + pad + 12 + rand() * (sw - 30);
          const cy1 = y0 + pad + 10 + rand() * (rowH - 25);
          const cx2 = cx1 + (rand() - 0.5) * 45;
          const cy2 = cy1 + (rand() - 0.5) * 45;
          fCtx.strokeStyle = 'rgba(7, 9, 13, 0.65)';
          fCtx.lineWidth = 1.5;
          fCtx.beginPath();
          fCtx.moveTo(cx1, cy1);
          fCtx.lineTo((cx1 + cx2) * 0.5 + (rand() - 0.5) * 10, (cy1 + cy2) * 0.5);
          fCtx.lineTo(cx2, cy2);
          fCtx.stroke();

          fbCtx.strokeStyle = '#222222';
          fbCtx.lineWidth = 2;
          fbCtx.beginPath();
          fbCtx.moveTo(cx1, cy1);
          fbCtx.lineTo(cx2, cy2);
          fbCtx.stroke();
        }
      }
    }

    // Add fine procedural rock speckles & damp dungeon patches
    for (let i = 0; i < 3200; i++) {
      const px = rand() * fSize;
      const py = rand() * fSize;
      const sz = 1 + rand() * 2.5;
      const dark = rand() < 0.55;
      fCtx.fillStyle = dark ? 'rgba(6, 8, 12, 0.22)' : 'rgba(130, 145, 168, 0.08)';
      fCtx.fillRect(px, py, sz, sz);
      fbCtx.fillStyle = dark ? 'rgba(40, 40, 40, 0.28)' : 'rgba(245, 245, 245, 0.2)';
      fbCtx.fillRect(px, py, sz, sz);
    }

    this.floorColorTex = new THREE.CanvasTexture(fColCanvas);
    this.floorColorTex.wrapS = THREE.RepeatWrapping;
    this.floorColorTex.wrapT = THREE.RepeatWrapping;
    this.floorColorTex.repeat.set(14, 14);

    this.floorBumpTex = new THREE.CanvasTexture(fBumpCanvas);
    this.floorBumpTex.wrapS = THREE.RepeatWrapping;
    this.floorBumpTex.wrapT = THREE.RepeatWrapping;
    this.floorBumpTex.repeat.set(14, 14);

    // 2. Gothic Cathedral Stonework Wall Texture (512x512 seamless)
    const wSize = 512;
    const wColCanvas = document.createElement('canvas');
    const wBumpCanvas = document.createElement('canvas');
    wColCanvas.width = wColCanvas.height = wSize;
    wBumpCanvas.width = wBumpCanvas.height = wSize;
    const wCtx = wColCanvas.getContext('2d');
    const wbCtx = wBumpCanvas.getContext('2d');

    wCtx.fillStyle = '#0d1016';
    wCtx.fillRect(0, 0, wSize, wSize);
    wbCtx.fillStyle = '#121212';
    wbCtx.fillRect(0, 0, wSize, wSize);

    const wRows = 6;
    const wRowH = wSize / wRows;
    const wallPalettes = [
      [44, 50, 62],
      [52, 58, 70],
      [38, 43, 54],
      [56, 53, 61],
      [47, 54, 60]
    ];

    for (let r = 0; r < wRows; r++) {
      const y0 = r * wRowH;
      const offset = (r % 2) * (wSize / 6);
      const cols = 3;
      const colW = wSize / cols;

      for (let c = -1; c <= cols; c++) {
        const bx = c * colW + offset;
        const pad = 3.5;
        const pal = wallPalettes[Math.floor(rand() * wallPalettes.length)];
        const delta = (rand() - 0.5) * 12;
        const rCol = Math.round(pal[0] + delta);
        const gCol = Math.round(pal[1] + delta);
        const bCol = Math.round(pal[2] + delta);

        // Chiseled stone block with subtle vertical gradient
        const grad = wCtx.createLinearGradient(0, y0 + pad, 0, y0 + wRowH - pad);
        grad.addColorStop(0, `rgb(${rCol + 10},${gCol + 10},${bCol + 12})`);
        grad.addColorStop(0.8, `rgb(${rCol},${gCol},${bCol})`);
        grad.addColorStop(1, `rgb(${Math.max(15, rCol - 12)},${Math.max(15, gCol - 12)},${Math.max(18, bCol - 12)})`);
        wCtx.fillStyle = grad;
        wCtx.fillRect(bx + pad, y0 + pad, colW - pad * 2, wRowH - pad * 2);

        // Top chiseled rim on each stone
        wCtx.fillStyle = 'rgba(180, 195, 215, 0.14)';
        wCtx.fillRect(bx + pad + 2, y0 + pad + 1, colW - pad * 2 - 4, 3);

        // Bump map block height
        const bh = Math.round(180 + (rand() - 0.5) * 45);
        wbCtx.fillStyle = `rgb(${bh},${bh},${bh})`;
        wbCtx.fillRect(bx + pad, y0 + pad, colW - pad * 2, wRowH - pad * 2);
      }
    }

    // Weathering & stone grain on walls
    for (let i = 0; i < 2800; i++) {
      const px = rand() * wSize;
      const py = rand() * wSize;
      const sz = 1 + rand() * 2.2;
      const dark = rand() < 0.55;
      wCtx.fillStyle = dark ? 'rgba(8, 10, 14, 0.25)' : 'rgba(165, 180, 205, 0.09)';
      wCtx.fillRect(px, py, sz, sz);
      wbCtx.fillStyle = dark ? 'rgba(35, 35, 35, 0.3)' : 'rgba(245, 245, 245, 0.22)';
      wbCtx.fillRect(px, py, sz, sz);
    }

    this.wallColorTex = new THREE.CanvasTexture(wColCanvas);
    this.wallColorTex.wrapS = THREE.RepeatWrapping;
    this.wallColorTex.wrapT = THREE.RepeatWrapping;

    this.wallBumpTex = new THREE.CanvasTexture(wBumpCanvas);
    this.wallBumpTex.wrapS = THREE.RepeatWrapping;
    this.wallBumpTex.wrapT = THREE.RepeatWrapping;

    // Expose globally so Stickman3D "Tinta Fresca 2D" can camouflage into the exact stone masonry!
    window.gothicWallColorTex = this.wallColorTex;
    window.gothicWallBumpTex = this.wallBumpTex;
  }

  buildArena() {
    // 1. Diablo IV Dungeon Flagstone Floor with Bump Mapping & Wet Stone Specular
    const floorGeo = new THREE.PlaneGeometry(this.mapHalfSize * 2, this.mapHalfSize * 2);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xb8c2d0,
      map: this.floorColorTex,
      bumpMap: this.floorBumpTex,
      bumpScale: 0.085,
      roughness: 0.68,
      metalness: 0.18
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Subtle Dark-Iron Engraved Sanctuary Grid (maintains tactical spatial reference without neon clutter)
    const grid = new THREE.GridHelper(this.mapHalfSize * 2, 22, 0x1e2430, 0x151922);
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    this.scene.add(grid);

    // 2. Gothic Cathedral Stonework Wall Materials (with world-scaled UVs to prevent stretching!)
    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      map: this.wallColorTex,
      bumpMap: this.wallBumpTex,
      bumpScale: 0.095,
      roughness: 0.64,
      metalness: 0.16
    });

    // Lighter chiseled limestone cornice on wall tops so corridor layout pops clearly from top-down!
    this.wallTopMat = new THREE.MeshStandardMaterial({
      color: 0x647084,
      map: this.floorColorTex,
      bumpMap: this.floorBumpTex,
      bumpScale: 0.04,
      roughness: 0.45,
      metalness: 0.24,
      emissive: 0x1e2533,
      emissiveIntensity: 0.22
    });

    // Heavy dark basal plinth at wall bases
    this.wallPlinthMat = new THREE.MeshStandardMaterial({
      color: 0x1c2029,
      roughness: 0.78,
      metalness: 0.25
    });

    const S = this.mapHalfSize;
    const T = 1.0; // Outer wall thickness
    const H = 3.4; // Wall height (tall enough for Dragon Flag & Corridor Split!)

    // 1. Outer Perimeter Walls
    this.addWall(0, -S, S * 2, T, H);
    this.addWall(0, S, S * 2, T, H);
    this.addWall(-S, 0, T, S * 2, H);
    this.addWall(S, 0, T, S * 2, H);

    // 2. Interior Tactical Walls & Corridors
    // North-West L-Room & Narrow Corridor (2.4m clear width between x = -15.0 and x = -12.6)
    this.addWall(-12, -9, 1.2, 8.5, H);
    this.addWall(-8.5, -13, 6.0, 1.2, H);
    this.addWall(-15.6, -9, 1.2, 8.5, H); // Parallel corridor wall for Jean-Claude Split!

    // North-East Gallery (2.4m clear width between x = 12.6 and x = 15.0)
    this.addWall(12, -10, 1.2, 9.0, H);
    this.addWall(8.0, -14, 7.0, 1.2, H);
    this.addWall(15.6, -10, 1.2, 8.0, H);

    // South-West Maze Corridor (2.4m clear width between x = -15.0 and x = -12.6)
    this.addWall(-12, 10, 1.2, 9.0, H);
    this.addWall(-7.5, 13.5, 8.0, 1.2, H);
    this.addWall(-15.6, 10, 1.2, 8.5, H);

    // South-East Wing (2.4m clear width between x = 12.6 and x = 15.0)
    this.addWall(12, 10, 1.2, 9.0, H);
    this.addWall(8.0, 14, 7.0, 1.2, H);
    this.addWall(15.6, 10, 1.2, 8.5, H);

    // Central Shield Walls around "O Pique" (provides tactical line-of-sight blockers)
    this.addWall(0, -9.5, 8.5, 1.2, H);
    this.addWall(0, 9.5, 8.5, 1.2, H);
    this.addWall(-16.5, 1.5, 6.5, 1.2, H);
    this.addWall(16.5, -1.5, 6.5, 1.2, H);

    // Tactical Pillars near mid-ring
    this.addWall(-5.5, -4.5, 1.8, 1.8, H);
    this.addWall(-5.5, 4.5, 1.8, 1.8, H);
    this.addWall(5.5, 4.5, 1.8, 1.8, H);

    // Build "O PIQUE" (Central Soulstone Sanctuary Altar)
    this.buildPiqueBase();

    // Build "ZONA DE PRISÃO" (Wrought-Iron & Blood-Rune Cage)
    this.buildJailZone();

    // Build Gothic Fire Braziers at key corridor entrances & landmarks
    this.buildDungeonBraziers();
  }

  // Scales BoxGeometry UVs proportionally to physical (w, h, d) so stone blocks never stretch
  scaleBoxUVs(geo, w, h, d, tileSize = 2.8) {
    const uv = geo.attributes.uv;
    if (!uv) return;
    for (let i = 0; i < uv.count; i++) {
      let u = uv.getX(i);
      let v = uv.getY(i);
      if (i < 8) {
        // +X and -X faces (depth x height)
        u *= d / tileSize;
        v *= h / tileSize;
      } else if (i < 16) {
        // +Y and -Y faces (width x depth)
        u *= w / tileSize;
        v *= d / tileSize;
      } else {
        // +Z and -Z faces (width x height)
        u *= w / tileSize;
        v *= h / tileSize;
      }
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
  }

  addWall(cx, cz, w, d, h = 3.4) {
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);

    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    this.scaleBoxUVs(bodyGeo, w, h, d, 2.8);
    bodyGeo.translate(0, h / 2, 0);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.wallMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Heavy Gothic Base Plinth where wall meets the dungeon floor
    const plinthGeo = new THREE.BoxGeometry(w + 0.14, 0.26, d + 0.14);
    plinthGeo.translate(0, 0.13, 0);
    const plinthMesh = new THREE.Mesh(plinthGeo, this.wallPlinthMat);
    plinthMesh.receiveShadow = true;
    group.add(plinthMesh);

    // Chiseled Stone Cornice Trim on top so walls pop visually in 3D top-down view
    const capGeo = new THREE.BoxGeometry(w + 0.14, 0.18, d + 0.14);
    this.scaleBoxUVs(capGeo, w + 0.14, 0.18, d + 0.14, 3.0);
    capGeo.translate(0, h + 0.05, 0);
    const capMesh = new THREE.Mesh(capGeo, this.wallTopMat);
    group.add(capMesh);

    this.scene.add(group);

    this.walls.push({
      cx,
      cz,
      w,
      d,
      h,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      mesh: bodyMesh
    });
  }

  buildDungeonBraziers() {
    // 8 strategic wall-top / gate-post Gothic Braziers (no collision clutter, 60 FPS PointLights)
    const brazierCoords = [
      { x: -12.0, y: 2.65, z: -4.85 },
      { x: 12.0, y: 2.65, z: -5.6 },
      { x: -12.0, y: 2.65, z: 5.6 },
      { x: 12.0, y: 2.65, z: 5.6 },
      { x: -4.1, y: 2.65, z: -9.5 },
      { x: 4.1, y: 2.65, z: 9.5 },
      { x: -2.2, y: 1.9, z: -16.2 },
      { x: 2.2, y: 1.9, z: -16.2 }
    ];

    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0x1e2028,
      roughness: 0.5,
      metalness: 0.75
    });

    brazierCoords.forEach((b, idx) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, b.y, b.z);

      // Forged Iron Brazier Bowl
      const bowlGeo = new THREE.CylinderGeometry(0.28, 0.16, 0.24, 10);
      const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
      bGroup.add(bowlMesh);

      // Glowing Ember & Flame Cone
      const flameGeo = new THREE.ConeGeometry(0.18, 0.46, 8);
      flameGeo.translate(0, 0.26, 0);
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xff7b24,
        transparent: true,
        opacity: 0.92
      });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      bGroup.add(flameMesh);

      // Rising Ember Sparks above each Brazier
      const sparkGeo = new THREE.SphereGeometry(0.045, 6, 6);
      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.85
      });
      const spark1 = new THREE.Mesh(sparkGeo, sparkMat);
      const spark2 = new THREE.Mesh(sparkGeo, sparkMat);
      bGroup.add(spark1);
      bGroup.add(spark2);

      // Warm Diablo Torch PointLight (no shadow map cost -> locked 60 FPS!)
      const light = new THREE.PointLight(0xff6b1a, 1.05, 11.5, 1.8);
      light.position.set(0, 0.45, 0);
      bGroup.add(light);

      this.scene.add(bGroup);
      this.braziers.push({
        group: bGroup,
        flame: flameMesh,
        spark1,
        spark2,
        light,
        phase: idx * 1.37
      });
    });
  }

  buildPiqueBase() {
    this.piqueGroup = new THREE.Group();
    this.piqueGroup.position.copy(this.piquePos);

    // Glowing floor pad
    const padGeo = new THREE.RingGeometry(0.4, this.piqueRadius, 36);
    padGeo.rotateX(-Math.PI / 2);
    this.piquePadMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25
    });
    const padMesh = new THREE.Mesh(padGeo, this.piquePadMat);
    padMesh.position.y = 0.03;
    this.piqueGroup.add(padMesh);

    // Outer border ring
    const borderGeo = new THREE.RingGeometry(this.piqueRadius - 0.12, this.piqueRadius, 36);
    borderGeo.rotateX(-Math.PI / 2);
    this.piqueBorderMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      side: THREE.DoubleSide
    });
    const borderMesh = new THREE.Mesh(borderGeo, this.piqueBorderMat);
    borderMesh.position.y = 0.04;
    this.piqueGroup.add(borderMesh);

    // Locked Energy Dome over the Pique (visible until the last 30s!)
    const domeGeo = new THREE.SphereGeometry(this.piqueRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    this.piqueDomeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    this.piqueLockDome = new THREE.Mesh(domeGeo, this.piqueDomeMat);
    this.piqueGroup.add(this.piqueLockDome);

    // Anti-"Guarda-Caixão" Perimeter Ring (radius 6.5m)
    const campRingGeo = new THREE.RingGeometry(6.35, 6.5, 48);
    campRingGeo.rotateX(-Math.PI / 2);
    this.piqueCampRingMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const campRingMesh = new THREE.Mesh(campRingGeo, this.piqueCampRingMat);
    campRingMesh.position.y = 0.035;
    this.piqueGroup.add(campRingMesh);

    // Central Pique Totem Crystal
    const crystalGeo = new THREE.OctahedronGeometry(0.45, 0);
    this.piqueCrystalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.5
    });
    this.piqueCrystal = new THREE.Mesh(crystalGeo, this.piqueCrystalMat);
    this.piqueCrystal.position.y = 1.65;
    this.piqueCrystal.castShadow = true;
    this.piqueGroup.add(this.piqueCrystal);

    // Gothic Stone Altar Pedestal
    const pedGeo = new THREE.CylinderGeometry(0.38, 0.58, 0.92, 8);
    pedGeo.translate(0, 0.46, 0);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x333a48,
      map: this.wallColorTex,
      bumpMap: this.wallBumpTex,
      bumpScale: 0.05,
      roughness: 0.55,
      metalness: 0.3
    });
    const pedMesh = new THREE.Mesh(pedGeo, pedMat);
    pedMesh.castShadow = true;
    pedMesh.receiveShadow = true;
    this.piqueGroup.add(pedMesh);

    this.scene.add(this.piqueGroup);
  }

  setPiqueLocked(isLocked) {
    if (this.piqueLockDome) {
      this.piqueLockDome.visible = isLocked;
    }
    if (isLocked) {
      this.piquePadMat.color.setHex(0x38bdf8);
      this.piqueBorderMat.color.setHex(0x7dd3fc);
      this.piqueCrystalMat.color.setHex(0x38bdf8);
      this.piqueCrystalMat.emissive.setHex(0x0284c7);
    } else {
      this.piquePadMat.color.setHex(0xf59e0b);
      this.piqueBorderMat.color.setHex(0xfef08a);
      this.piqueCrystalMat.color.setHex(0xfbbf24);
      this.piqueCrystalMat.emissive.setHex(0xf59e0b);
    }
  }

  buildJailZone() {
    this.jailGroup = new THREE.Group();
    this.jailGroup.position.copy(this.jailPos);

    const floorGeo = new THREE.CircleGeometry(this.jailRadius, 28);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.24
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0.025;
    this.jailGroup.add(floorMesh);

    // Rescue Switch Pad ("Botão Salva Todos") right in front of the Jail
    const switchGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.55, 16);
    switchGeo.translate(0, 0.28, this.jailRadius + 0.55);
    this.jailSwitchMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6
    });
    const switchMesh = new THREE.Mesh(switchGeo, this.jailSwitchMat);
    this.jailGroup.add(switchMesh);

    // Anti-"Guarda-Caixão" Perimeter Ring around Jail (radius 6.5m)
    const campRingGeo = new THREE.RingGeometry(6.35, 6.5, 48);
    campRingGeo.rotateX(-Math.PI / 2);
    this.jailCampRingMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const campRingMesh = new THREE.Mesh(campRingGeo, this.jailCampRingMat);
    campRingMesh.position.y = 0.035;
    this.jailGroup.add(campRingMesh);

    // Laser energy bars around the prison circle
    this.jailBarMat = new THREE.MeshBasicMaterial({
      color: 0xfb7185,
      transparent: true,
      opacity: 0.65
    });
    const numBars = 10;
    for (let i = 0; i < numBars; i++) {
      const ang = (i / numBars) * Math.PI * 2;
      const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
      barGeo.translate(
        Math.cos(ang) * this.jailRadius,
        0.9,
        Math.sin(ang) * this.jailRadius
      );
      const bar = new THREE.Mesh(barGeo, this.jailBarMat);
      this.jailGroup.add(bar);
    }

    this.scene.add(this.jailGroup);
  }

  setJailSwitchState(state) {
    if (!this.jailSwitchMat) return;
    if (state === 'short_circuit') {
      this.jailSwitchMat.color.setHex(0xa855f7);
      this.jailSwitchMat.emissive.setHex(0xd946ef);
      this.jailSwitchMat.emissiveIntensity = 0.85;
    } else if (state === 'locked') {
      this.jailSwitchMat.color.setHex(0x475569);
      this.jailSwitchMat.emissive.setHex(0x1e293b);
      this.jailSwitchMat.emissiveIntensity = 0.25;
    } else {
      // 'ready'
      this.jailSwitchMat.color.setHex(0x10b981);
      this.jailSwitchMat.emissive.setHex(0x059669);
      this.jailSwitchMat.emissiveIntensity = 0.7;
    }
  }

  updateVisuals(dt, elapsed) {
    if (this.piqueCrystal) {
      this.piqueCrystal.rotation.y += dt * 1.6;
      this.piqueCrystal.position.y = 1.6 + Math.sin(elapsed * 3) * 0.14;
    }

    // Animate flickering Gothic Torch Braziers
    if (this.braziers) {
      for (const b of this.braziers) {
        const flicker =
          Math.sin(elapsed * 11.0 + b.phase) * 0.12 +
          Math.cos(elapsed * 19.3 + b.phase * 1.7) * 0.08;
        b.light.intensity = 1.05 + flicker;
        const s = 1.0 + flicker * 0.45;
        b.flame.scale.set(1.0 + flicker * 0.2, s, 1.0 - flicker * 0.2);

        if (b.spark1 && b.spark2) {
          const t1 = (elapsed * 1.3 + b.phase) % 1.0;
          const t2 = (elapsed * 1.3 + b.phase + 0.5) % 1.0;
          b.spark1.position.set(
            Math.sin(elapsed * 5 + b.phase) * 0.12,
            0.35 + t1 * 0.85,
            Math.cos(elapsed * 4 + b.phase) * 0.12
          );
          b.spark1.scale.setScalar(1.0 - t1 * 0.75);
          b.spark2.position.set(
            Math.cos(elapsed * 5.5 + b.phase) * 0.12,
            0.35 + t2 * 0.85,
            Math.sin(elapsed * 4.5 + b.phase) * 0.12
          );
          b.spark2.scale.setScalar(1.0 - t2 * 0.75);
        }
      }
    }
  }

  // Resolves circle-AABB collision and returns information about nearest touched wall
  resolveCollision(pos, radius) {
    let touchedWall = false;
    const hitNormal = new THREE.Vector3();

    for (const w of this.walls) {
      const closestX = Math.max(w.minX, Math.min(pos.x, w.maxX));
      const closestZ = Math.max(w.minZ, Math.min(pos.z, w.maxZ));

      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        touchedWall = true;
        const dist = Math.sqrt(distSq);

        if (dist > 0.0001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = radius - dist;
          pos.x += nx * overlap;
          pos.z += nz * overlap;
          hitNormal.set(nx, 0, nz);
        } else {
          // Inside box fallback
          pos.x += radius;
          hitNormal.set(1, 0, 0);
        }
      }
    }

    return { touchedWall, hitNormal };
  }

  // Checks if a stickman is close to any wall and pressing input toward it (or already hugging it)
  detectWallInteraction(pos, radius, inputDir) {
    let bestDist = Infinity;
    let bestNormal = null;
    const checkRange = radius + 0.52;

    for (const w of this.walls) {
      const closestX = Math.max(w.minX, Math.min(pos.x, w.maxX));
      const closestZ = Math.max(w.minZ, Math.min(pos.z, w.maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= checkRange && dist < bestDist && dist > 0.0001) {
        bestDist = dist;
        bestNormal = new THREE.Vector3(dx / dist, 0, dz / dist);
      }
    }

    if (!bestNormal) {
      return { nearWall: false, pressingIntoWall: false, wallNormal: null };
    }

    // Pressing into wall if dot(inputDir, -wallNormal) > 0.28
    let pressingIntoWall = false;
    if (inputDir && inputDir.lengthSq() > 0.01) {
      const dot = inputDir.x * (-bestNormal.x) + inputDir.z * (-bestNormal.z);
      if (dot > 0.28) {
        pressingIntoWall = true;
      }
    }

    return {
      nearWall: true,
      pressingIntoWall,
      wallNormal: bestNormal
    };
  }

  // Checks if position is inside a narrow corridor between two parallel walls (for Van Damme Split!)
  detectCorridor(pos) {
    const maxSpan = 3.2;
    const maxRay = 3.5;

    // 1. Check North-South corridor (opposing walls on Left -X and Right +X)
    const dLeft = this.castVisionRay(pos.x, pos.z, -1, 0, maxRay);
    const dRight = this.castVisionRay(pos.x, pos.z, 1, 0, maxRay);
    if (dLeft < maxRay - 0.1 && dRight < maxRay - 0.1 && dLeft + dRight <= maxSpan) {
      // Confirm walls continue slightly along Z so it's a real corridor wall pair, not a thin edge
      const dLeftN = this.castVisionRay(pos.x, pos.z - 0.35, -1, 0, maxRay);
      const dRightN = this.castVisionRay(pos.x, pos.z - 0.35, 1, 0, maxRay);
      const dLeftS = this.castVisionRay(pos.x, pos.z + 0.35, -1, 0, maxRay);
      const dRightS = this.castVisionRay(pos.x, pos.z + 0.35, 1, 0, maxRay);
      if (
        Math.abs(dLeftN - dLeft) < 0.25 &&
        Math.abs(dRightN - dRight) < 0.25 &&
        Math.abs(dLeftS - dLeft) < 0.25 &&
        Math.abs(dRightS - dRight) < 0.25
      ) {
        const centerX = pos.x + (dRight - dLeft) * 0.5;
        return {
          inCorridor: true,
          axis: 'z',
          width: dLeft + dRight,
          centerPos: new THREE.Vector3(centerX, 0, pos.z),
          facingAngle: 0 // Faces South (+Z, toward camera) so legs (+X / -X) press into East/West walls
        };
      }
    }

    // 2. Check East-West corridor (opposing walls on North -Z and South +Z)
    const dNorth = this.castVisionRay(pos.x, pos.z, 0, -1, maxRay);
    const dSouth = this.castVisionRay(pos.x, pos.z, 0, 1, maxRay);
    if (dNorth < maxRay - 0.1 && dSouth < maxRay - 0.1 && dNorth + dSouth <= maxSpan) {
      const dNorthW = this.castVisionRay(pos.x - 0.35, pos.z, 0, -1, maxRay);
      const dSouthW = this.castVisionRay(pos.x - 0.35, pos.z, 0, 1, maxRay);
      const dNorthE = this.castVisionRay(pos.x + 0.35, pos.z, 0, -1, maxRay);
      const dSouthE = this.castVisionRay(pos.x + 0.35, pos.z, 0, 1, maxRay);
      if (
        Math.abs(dNorthW - dNorth) < 0.25 &&
        Math.abs(dSouthW - dSouth) < 0.25 &&
        Math.abs(dNorthE - dNorth) < 0.25 &&
        Math.abs(dSouthE - dSouth) < 0.25
      ) {
        const centerZ = pos.z + (dSouth - dNorth) * 0.5;
        return {
          inCorridor: true,
          axis: 'x',
          width: dNorth + dSouth,
          centerPos: new THREE.Vector3(pos.x, 0, centerZ),
          facingAngle: Math.PI * 0.5 // Faces East (+X) so legs press into North/South walls
        };
      }
    }

    return { inCorridor: false };
  }

  // Builds a 1m x 1m walkability grid for fast A* pathfinding
  buildNavGrid() {
    this.gridStep = 1.0;
    this.gridMin = -this.mapHalfSize + 1;
    this.gridMax = this.mapHalfSize - 1;
    this.gridSize = Math.round((this.gridMax - this.gridMin) / this.gridStep) + 1;
    this.navWalkable = [];

    const pad = 0.5;
    for (let gz = 0; gz < this.gridSize; gz++) {
      const row = [];
      const wz = this.gridMin + gz * this.gridStep;
      for (let gx = 0; gx < this.gridSize; gx++) {
        const wx = this.gridMin + gx * this.gridStep;
        let blocked = false;
        for (const w of this.walls) {
          if (
            wx >= w.minX - pad &&
            wx <= w.maxX + pad &&
            wz >= w.minZ - pad &&
            wz <= w.maxZ + pad
          ) {
            blocked = true;
            break;
          }
        }
        row.push(!blocked);
      }
      this.navWalkable.push(row);
    }
  }

  worldToGrid(x, z) {
    let gx = Math.round((x - this.gridMin) / this.gridStep);
    let gz = Math.round((z - this.gridMin) / this.gridStep);
    gx = Math.max(0, Math.min(this.gridSize - 1, gx));
    gz = Math.max(0, Math.min(this.gridSize - 1, gz));

    // If cell is blocked, snap to nearest walkable neighbor
    if (!this.navWalkable[gz][gx]) {
      let bestG = { gx, gz };
      let bestD = 999;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (
            nx >= 0 &&
            nx < this.gridSize &&
            nz >= 0 &&
            nz < this.gridSize &&
            this.navWalkable[nz][nx]
          ) {
            const d = dx * dx + dz * dz;
            if (d < bestD) {
              bestD = d;
              bestG = { gx: nx, gz: nz };
            }
          }
        }
      }
      return bestG;
    }
    return { gx, gz };
  }

  gridToWorld(gx, gz) {
    return new THREE.Vector3(
      this.gridMin + gx * this.gridStep,
      0,
      this.gridMin + gz * this.gridStep
    );
  }

  // Fast A* Pathfinding with 8-way movement & corner-cutting prevention
  findPath(startPos, goalPos) {
    const start = this.worldToGrid(startPos.x, startPos.z);
    const goal = this.worldToGrid(goalPos.x, goalPos.z);

    if (start.gx === goal.gx && start.gz === goal.gz) {
      return [new THREE.Vector3(goalPos.x, 0, goalPos.z)];
    }

    const N = this.gridSize;
    const idx = (x, z) => z * N + x;
    const gScore = new Float32Array(N * N).fill(Infinity);
    const fScore = new Float32Array(N * N).fill(Infinity);
    const cameFrom = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);

    const startId = idx(start.gx, start.gz);
    const goalId = idx(goal.gx, goal.gz);

    gScore[startId] = 0;
    fScore[startId] = Math.hypot(goal.gx - start.gx, goal.gz - start.gz);

    const open = [startId];
    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414]
    ];

    let found = false;
    while (open.length > 0) {
      // Find lowest fScore in open list
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestIdx]]) {
          bestIdx = i;
        }
      }
      const current = open[bestIdx];
      open.splice(bestIdx, 1);

      if (current === goalId) {
        found = true;
        break;
      }

      closed[current] = 1;
      const cx = current % N;
      const cz = Math.floor(current / N);

      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;
        if (!this.navWalkable[nz][nx]) continue;

        // Prevent diagonal squeezing through wall corners
        if (dx !== 0 && dz !== 0) {
          if (!this.navWalkable[cz][nx] || !this.navWalkable[nz][cx]) continue;
        }

        const nId = idx(nx, nz);
        if (closed[nId]) continue;

        const tentativeG = gScore[current] + cost;
        if (tentativeG < gScore[nId]) {
          cameFrom[nId] = current;
          gScore[nId] = tentativeG;
          fScore[nId] = tentativeG + Math.hypot(goal.gx - nx, goal.gz - nz);
          if (!open.includes(nId)) {
            open.push(nId);
          }
        }
      }
    }

    if (!found) {
      return [new THREE.Vector3(goalPos.x, 0, goalPos.z)];
    }

    const rawPath = [];
    let curr = goalId;
    while (curr !== -1 && curr !== startId) {
      const gx = curr % N;
      const gz = Math.floor(curr / N);
      rawPath.push(this.gridToWorld(gx, gz));
      curr = cameFrom[curr];
    }
    rawPath.reverse();
    rawPath[rawPath.length - 1] = new THREE.Vector3(goalPos.x, 0, goalPos.z);
    return rawPath;
  }

  // 2D Raycast from (ox, oz) along angle for maxDist, returning hit distance against walls
  castVisionRay(ox, oz, dirX, dirZ, maxDist) {
    let minT = maxDist;

    for (const w of this.walls) {
      const t = this.rayIntersectAABB(ox, oz, dirX, dirZ, w.minX, w.maxX, w.minZ, w.maxZ, minT);
      if (t !== null && t < minT) {
        minT = t;
      }
    }
    return minT;
  }

  rayIntersectAABB(ox, oz, dx, dz, minX, maxX, minZ, maxZ, maxT) {
    let tmin = 0;
    let tmax = maxT;

    if (Math.abs(dx) < 1e-6) {
      if (ox < minX || ox > maxX) return null;
    } else {
      const invD = 1 / dx;
      let t1 = (minX - ox) * invD;
      let t2 = (maxX - ox) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    if (Math.abs(dz) < 1e-6) {
      if (oz < minZ || oz > maxZ) return null;
    } else {
      const invD = 1 / dz;
      let t1 = (minZ - oz) * invD;
      let t2 = (maxZ - oz) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    return tmin;
  }

  hasLineOfSight(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return true;
    const hitDist = this.castVisionRay(p1.x, p1.z, dx / dist, dz / dist, dist);
    return hitDist >= dist - 0.15;
  }
}

window.ArenaMap = ArenaMap;

