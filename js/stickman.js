// Articulated 3D Stick Figure with Procedural Calisthenics & Stealth Poses
class Stickman3D {
  constructor(scene, config) {
    this.scene = scene;
    this.id = config.id;
    this.name = config.name;
    this.role = config.role; // 'hider' | 'seeker'
    this.isPlayer = !!config.isPlayer;
    this.baseColor = new THREE.Color(config.color || 0x10b981);
    this.wallBlendColor = new THREE.Color(0xcbd5e1);

    // Physics & Transform
    this.position = new THREE.Vector3(config.x || 0, 0, config.z || 0);
    this.velocity = new THREE.Vector3();
    this.facingAngle = 0;
    this.radius = 0.42;

    // Gameplay States
    this.state = 'free'; // 'free' | 'jailed' | 'saved'
    this.posture = 'normal'; // 'normal' | 'wall_hug' | 'dragon_flag' | 'flat_paint' | 'corridor_split'
    this.wallNormal = new THREE.Vector3(0, 0, 1);
    this.isTouchingWall = false;
    this.inCorridor = false;
    this.corridorInfo = null;
    this.activeSkill = null;
    this.skillTimer = 0;

    // Stamina / Muscle Stability (0 to 100)
    this.stamina = 100;
    this.isTrembling = false;
    this.tremorNoiseTimer = 0;
    this.footstepTimer = 0;
    this.speedBoostTimer = 0;
    this.escapeTrailTimer = 0;
    this.escapeStepSpawnTimer = 0;
    this.stunTimer = 0;

    // Cooldowns map (seconds remaining)
    this.cooldowns = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    };
    this.singleUseConsumed = {};

    this.animTime = Math.random() * 10;
    this.buildMesh();
  }

  buildMesh() {
    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    this.limbMaterial = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.35,
      metalness: 0.15,
      emissive: this.baseColor,
      emissiveIntensity: 0.12
    });

    this.jointMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.1
    });

    // Ground Blob Shadow
    const shadowGeo = new THREE.CircleGeometry(0.48, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });
    this.groundShadow = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.groundShadow.position.y = 0.02;
    this.group.add(this.groundShadow);

    // Player Selection Ring on Floor
    if (this.isPlayer) {
      const ringGeo = new THREE.RingGeometry(0.52, 0.64, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.role === 'seeker' ? 0xf43f5e : 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75
      });
      this.playerRing = new THREE.Mesh(ringGeo, ringMat);
      this.playerRing.position.y = 0.03;
      this.group.add(this.playerRing);
    }

    // Pelvis (root of articulated body at hip height y = 0.95)
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.95;
    this.bodyPivot.add(this.pelvis);

    // Spine / Torso
    const spineGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.72, 12);
    spineGeo.translate(0, 0.36, 0);
    this.spineMesh = new THREE.Mesh(spineGeo, this.limbMaterial);
    this.spineMesh.castShadow = true;
    this.pelvis.add(this.spineMesh);

    // Head
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.88, 0);
    this.pelvis.add(this.headGroup);

    const headGeo = new THREE.SphereGeometry(0.24, 20, 20);
    this.headMesh = new THREE.Mesh(headGeo, this.limbMaterial);
    this.headMesh.castShadow = true;
    this.headGroup.add(this.headMesh);

    // Eyes / Visor band so facing direction is super clear from top-down 3D
    const visorGeo = new THREE.BoxGeometry(0.32, 0.09, 0.16);
    const visorMat = new THREE.MeshBasicMaterial({
      color: this.role === 'seeker' ? 0xfef08a : 0xffffff
    });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.position.set(0, 0.03, 0.18);
    this.headGroup.add(this.visorMesh);

    // Arms (Left & Right)
    this.leftArm = this.createLimb(0.06, 0.56);
    this.leftArm.position.set(0.22, 0.68, 0);
    this.pelvis.add(this.leftArm);

    this.rightArm = this.createLimb(0.06, 0.56);
    this.rightArm.position.set(-0.22, 0.68, 0);
    this.pelvis.add(this.rightArm);

    // Legs (Left & Right)
    this.leftLeg = this.createLimb(0.068, 0.88);
    this.leftLeg.position.set(0.13, 0, 0);
    this.pelvis.add(this.leftLeg);

    this.rightLeg = this.createLimb(0.068, 0.88);
    this.rightLeg.position.set(-0.13, 0, 0);
    this.pelvis.add(this.rightLeg);

    // Seeker Lantern / Spotlight Prop
    if (this.role === 'seeker') {
      const lanternGeo = new THREE.SphereGeometry(0.14, 12, 12);
      const lanternMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      this.lanternOrb = new THREE.Mesh(lanternGeo, lanternMat);
      this.lanternOrb.position.set(0, -0.52, 0.1);
      this.rightArm.add(this.lanternOrb);
    }

    this.scene.add(this.group);
  }

  createLimb(radius, length) {
    const pivot = new THREE.Group();
    const geo = new THREE.CylinderGeometry(radius, radius * 0.85, length, 10);
    geo.translate(0, -length / 2, 0);
    const mesh = new THREE.Mesh(geo, this.limbMaterial);
    mesh.castShadow = true;
    pivot.add(mesh);

    const jointGeo = new THREE.SphereGeometry(radius * 1.15, 10, 10);
    const joint = new THREE.Mesh(jointGeo, this.jointMaterial);
    joint.position.set(0, -length, 0);
    pivot.add(joint);

    return pivot;
  }

  resetPoses() {
    this.bodyPivot.position.set(0, 0, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.bodyPivot.scale.set(1, 1, 1);

    this.pelvis.position.set(0, 0.95, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);

    this.leftArm.position.set(0.22, 0.68, 0);
    this.rightArm.position.set(-0.22, 0.68, 0);
    this.leftLeg.position.set(0.13, 0, 0);
    this.rightLeg.position.set(-0.13, 0, 0);

    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);

    this.leftArm.scale.set(1, 1, 1);
    this.rightArm.scale.set(1, 1, 1);
    this.leftLeg.scale.set(1, 1, 1);
    this.rightLeg.scale.set(1, 1, 1);
  }

  update(dt, isMoving) {
    this.animTime += dt * (isMoving ? 10 : 3);

    // Tick cooldowns
    for (const k of [1, 2, 3, 4, 5]) {
      if (this.cooldowns[k] > 0) {
        this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
      }
    }

    if (this.speedBoostTimer > 0) this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
    if (this.escapeTrailTimer > 0) this.escapeTrailTimer = Math.max(0, this.escapeTrailTimer - dt);
    if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt);

    // Tick active skill duration
    if (this.activeSkill) {
      this.skillTimer -= dt;
      if (this.skillTimer <= 0) {
        this.endActiveSkill();
      }
    }

    // Stamina & Muscle Tremor Logic for Hiders
    if (this.role === 'hider' && this.state === 'free') {
      let drainRate = 0;
      if (this.posture === 'dragon_flag') drainRate = 22;
      else if (this.posture === 'corridor_split') drainRate = 20;
      else if (this.posture === 'flat_paint') drainRate = 16;
      else if (this.posture === 'wall_hug') drainRate = 3.5;

      if (drainRate > 0) {
        this.stamina = Math.max(0, this.stamina - drainRate * dt);
      } else {
        const regen = isMoving ? 14 : 26;
        this.stamina = Math.min(100, this.stamina + regen * dt);
      }

      // Tremor happens when stamina < 25% while holding a wall/acrobatic posture
      this.isTrembling = (this.posture !== 'normal' && this.stamina < 25);

      // Collapse out of acrobatic skill if stamina hits 0
      if (this.stamina <= 0.1 && this.activeSkill) {
        this.endActiveSkill(true);
      }
    } else {
      this.isTrembling = false;
      this.stamina = Math.min(100, this.stamina + 25 * dt);
    }

    // Apply Visual Poses
    this.resetPoses();
    this.limbMaterial.color.copy(this.baseColor);
    this.limbMaterial.emissive.copy(this.baseColor);
    this.limbMaterial.emissiveIntensity = 0.18;
    if (this.limbMaterial.map !== null && this.posture !== 'flat_paint') {
      this.limbMaterial.map = null;
      this.limbMaterial.bumpMap = null;
      this.limbMaterial.needsUpdate = true;
    }
    this.shadowMat.opacity = 0.42;

    if (this.posture === 'wall_hug') {
      // Face away from wall and flatten against the wall
      const wallAngle = Math.atan2(this.wallNormal.x, this.wallNormal.z);
      this.facingAngle = wallAngle;

      // Squash depth against wall and push back slightly toward the wall
      this.bodyPivot.scale.set(1.12, 0.94, 0.45);
      this.bodyPivot.position.set(
        -this.wallNormal.x * 0.18,
        0,
        -this.wallNormal.z * 0.18
      );

      // Arms spread flat against the wall
      this.leftArm.rotation.z = 0.75;
      this.rightArm.rotation.z = -0.75;
      // Slight crouch
      this.pelvis.position.y = 0.84;
      this.leftLeg.rotation.z = 0.18;
      this.rightLeg.rotation.z = -0.18;

      if (isMoving) {
        const slide = Math.sin(this.animTime * 0.9) * 0.25;
        this.leftLeg.rotation.z = 0.2 + slide;
        this.rightLeg.rotation.z = -0.2 - slide;
      }
    } else if (this.posture === 'dragon_flag') {
      // DRAGON FLAG REAL: Ombros e mãos ancorados na parede alta (y = 2.25m),
      // corpo inteiro (tronco, quadril e pernas esticadas) travado em prancha reta
      // de barriga para cima projetado na horizontal/diagonal para fora da parede!
      const wallAngle = Math.atan2(this.wallNormal.x, this.wallNormal.z);
      this.facingAngle = wallAngle;

      // Oscilação lenta de alavanca (lever) típica do Dragon Flag (entre +5° e +20° acima da horizontal)
      const flagAngle = -Math.PI * 0.56 - Math.sin(this.animTime * 1.6) * 0.08;
      this.pelvis.rotation.x = flagAngle;

      // Mantém os ombros (y_local = 0.68) fixos na parede em (y = 2.25, z = -0.22) enquanto o corpo faz a alavanca
      this.pelvis.position.set(
        0,
        2.25 - 0.68 * Math.cos(flagAngle),
        -0.22 - 0.68 * Math.sin(flagAngle)
      );

      // Queixo levemente recolhido olhando para cima
      this.headGroup.rotation.x = 0.28;

      // Ambos os braços estendidos para trás da cabeça segurando firme na parede
      this.leftArm.rotation.x = Math.PI * 0.86;
      this.rightArm.rotation.x = Math.PI * 0.86;
      this.leftArm.rotation.z = -0.26;
      this.rightArm.rotation.z = 0.26;

      // Pernas 100% retas, coladas e alinhadas com o tronco (prancha rígida de calistenia)
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftLeg.rotation.z = -0.05;
      this.rightLeg.rotation.z = 0.05;

      this.limbMaterial.emissive.setHex(0xc084fc);
      this.limbMaterial.emissiveIntensity = 0.4;
      this.shadowMat.opacity = 0.12; // Sombra suave no chão por estar elevado
    } else if (this.posture === 'flat_paint') {
      // TINTA FRESCA 2D: Paper-thin against the wall + color camouflage
      const wallAngle = Math.atan2(this.wallNormal.x, this.wallNormal.z);
      this.facingAngle = wallAngle;

      this.bodyPivot.scale.set(1.22, 1.04, 0.08);
      this.bodyPivot.position.set(
        -this.wallNormal.x * 0.28,
        0.05,
        -this.wallNormal.z * 0.28
      );

      // Frozen graffiti pose
      this.leftArm.rotation.z = 1.25;
      this.rightArm.rotation.z = -1.25;
      this.leftLeg.rotation.z = 0.35;
      this.rightLeg.rotation.z = -0.35;

      // Camuflagem Gótica em Baixo-Relevo: aplica a própria textura e relevo da pedra da masmorra!
      this.limbMaterial.color.copy(this.wallBlendColor);
      if (window.gothicWallColorTex && this.limbMaterial.map !== window.gothicWallColorTex) {
        this.limbMaterial.map = window.gothicWallColorTex;
        this.limbMaterial.bumpMap = window.gothicWallBumpTex;
        this.limbMaterial.bumpScale = 0.08;
        this.limbMaterial.needsUpdate = true;
      }
      this.limbMaterial.emissive.setHex(0x0d1017);
      this.limbMaterial.emissiveIntensity = 0.03;
      this.shadowMat.opacity = 0.04;
    } else if (this.posture === 'corridor_split') {
      // ESPACATE ALTO DO VAN DAMME: Centralizado no corredor a y = 2.65m,
      // abertura total de 180° com os dois pés apoiados nas paredes opostas do corredor!
      if (this.corridorInfo && typeof this.corridorInfo.facingAngle === 'number') {
        this.facingAngle = this.corridorInfo.facingAngle;
      }

      const breathe = Math.sin(this.animTime * 1.8) * 0.03;
      this.pelvis.position.set(0, 2.65 + breathe, 0);
      this.pelvis.rotation.x = 0.04;

      // Abertura de 180° perfeita (90° para cada lado, perpendicular às paredes do corredor)
      this.leftLeg.rotation.z = Math.PI * 0.5;
      this.rightLeg.rotation.z = -Math.PI * 0.5;

      // Ajusta o alcance das pernas para cravar os dois pés exatamente nas duas paredes do corredor
      const span = (this.corridorInfo && this.corridorInfo.width) ? this.corridorInfo.width : 2.4;
      const legReachNeeded = Math.max(0.88, span * 0.5 - 0.13 - 0.06);
      const legScale = legReachNeeded / 0.88;
      this.leftLeg.scale.set(1, legScale, 1);
      this.rightLeg.scale.set(1, legScale, 1);

      // Postura clássica de guarda marcial / braços flexionados do Van Damme
      this.leftArm.rotation.z = Math.PI * 0.34;
      this.rightArm.rotation.z = -Math.PI * 0.34;
      this.leftArm.rotation.x = -0.52;
      this.rightArm.rotation.x = -0.52;

      this.limbMaterial.emissive.setHex(0x38bdf8);
      this.limbMaterial.emissiveIntensity = 0.38;
      this.shadowMat.opacity = 0.1;
    } else {
      // Normal Standing / Running Animation
      if (isMoving) {
        const swing = Math.sin(this.animTime) * 0.75;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
        this.leftArm.rotation.x = -swing * 0.85;
        this.rightArm.rotation.x = swing * 0.85;
        this.pelvis.position.y = 0.95 + Math.abs(Math.cos(this.animTime)) * 0.08;
        this.pelvis.rotation.x = 0.14; // Forward run lean
      } else {
        const breathe = Math.sin(this.animTime) * 0.03;
        this.pelvis.position.y = 0.95 + breathe;
        this.leftArm.rotation.z = 0.12;
        this.rightArm.rotation.z = -0.12;
      }

      // Seeker Special Skill Poses
      if (this.role === 'seeker') {
        if (this.activeSkill === 'flashlight_360') {
          // Hold lantern high above head
          this.rightArm.rotation.x = -Math.PI * 0.92;
        } else if (this.activeSkill === 'look_up') {
          // Tilt head and flashlight upward to scan high poses
          this.headGroup.rotation.x = -0.65;
          this.rightArm.rotation.x = -Math.PI * 0.72;
        } else {
          // Normal flashlight carry forward
          this.rightArm.rotation.x = -Math.PI * 0.35;
        }
      }
    }

    // Apply Muscle Tremor jitter if low stamina
    if (this.isTrembling) {
      this.bodyPivot.position.x += (Math.random() - 0.5) * 0.09;
      this.bodyPivot.position.z += (Math.random() - 0.5) * 0.09;
    }

    // Sync Group Transform
    this.group.position.copy(this.position);
    this.bodyPivot.rotation.y = this.facingAngle;
  }

  endActiveSkill(collapsed = false) {
    this.activeSkill = null;
    this.skillTimer = 0;
    if (this.role === 'hider') {
      this.posture = this.isTouchingWall ? 'wall_hug' : 'normal';
      if (collapsed) {
        this.posture = 'normal';
        this.stunTimer = 0.8;
      }
    }
  }

  getElevationLevel() {
    if (this.posture === 'dragon_flag' || this.posture === 'corridor_split') {
      return 'high'; // Elevated above normal floor line-of-sight
    }
    return 'ground';
  }
}

window.Stickman3D = Stickman3D;

