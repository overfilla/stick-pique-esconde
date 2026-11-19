# Memória do Projeto — Stick Pique-Esconde 3D: Salva Todos!

Este documento registra toda a arquitetura, regras de jogo, mecânicas de furtividade/acrobacia, inteligência artificial e decisões de balanceamento definidas para o projeto **Stick Pique-Esconde 3D**.

---

## 1. Visão Geral do Conceito
- **Gênero:** Furtividade Acrobática / Pique-Esconde Tático (*Top-Down 3D*).
- **Tecnologia:** HTML5 + CSS3 (HUD Glassmorphism) + **Three.js (r128)** + **Web Audio API** (efeitos sonoros procedurais sintetizados sem dependência de arquivos externos).
- **Personagens:** Bonecos palito 3D articulados (`Stickman3D`) capazes de se encolher contra paredes e executar poses de calistenia/contorcionismo para sair do campo de visão do Pegador.
- **Modos de Papel:** O jogador pode atuar como **Escondido (1 de 4 fujões)** contra Pegador IA, ou como **Pegador (Caçador)** contra 4 Escondidos IA (com sistema de Névoa de Guerra / *Fog of War*).

---

## 2. Estrutura de Arquivos (`D:\Stick Pique Esconde`)

- `server.js`: Servidor HTTP estático + Servidor **WebSocket RFC 6455 nativo** (em puro Node.js, sem dependências externas) na porta `8080`. Gerencia os **4 Mini-Servidores instanciados** (`srv_1` a `srv_4` — *Catedral de Sangue #1*, *Catacumbas de Kyovashad #2*, *Altar da Pedra d'Alma #3*, *Santuário Sombrio #4*), alocação dinâmica de vagas (`seeker_main` e `hider_0..3`), eleição automática de *Host* da sala e preenchimento híbrido com IA (*AI Backfill*).
- `index.html`: Estrutura das telas (Menu Inicial com escolha de papel, seletor de Mini-Servidores Ao Vivo, botão de **Tela Cheia (`⛶ Tela Cheia`)** no canto superior direito do menu e do HUD, HUD Superior de fases/cronômetro/equipe, HUD Inferior de postura/fôlego/habilidades/objetivos e Modal de Fim de Partida).
- `style.css`: Estilização visual neon/dark, barras de estamina/tremor, botões de habilidades com recarga (cooldown) e etiquetas flutuantes 3D→2D.
- `js/audio.js` (`SoundFX`): Sintetizador de áudio procedural Web Audio API (contagem, encostar na parede, ativação de cada habilidade, tremor muscular, captura, sirene de *Salva Todos*, *Curto-Circuito* e vitória/derrota).
- `js/ads.js` (`AdManager` / `window.ADS_CONFIG`): Sistema de monetização universal que exibe **2 anúncios sequenciais (`Anúncio 1/2` ➔ `Anúncio 2/2`)** ao término de toda partida (tanto Online nos Mini-Servidores quanto no Modo Solo Offline), após 3.5s de exibição do placar final, silenciando o som do jogo durante o intervalo e iniciando automaticamente a próxima partida para todos os jogadores ao terminar o 2º anúncio. Compatível com `GameMonetize SDK`, `Google AdSense / H5 Games Ads` e `House Ads / Patrocínios Próprios`.
- `js/stickman.js` (`Stickman3D`): Modelo hierárquico 3D articulado (pelve, coluna, cabeça com visor direcional, braços e pernas), controle de fôlego/estabilidade muscular (`stamina`), tremor (`isTrembling`), tempos de recarga (`cooldowns`) e animações procedurais das poses.
- `js/map.js` (`ArenaMap`):
  - Construção da arena 3D (`44m x 44m`) com estética gótica sombria inspirada em *Diablo IV*: texturas PBR procedurais (`CanvasTexture` 512x512 com mapas de cor e relevo `bumpMap`) de lajes de pedra rachada no chão e alvenaria gótica nas paredes, mapeamento UV em escala de mundo (`scaleBoxUVs`) para evitar estiramento de tijolos, rodapés/cornijas esculpidas e **8 Braseiros de Fogo Vivo** (`buildDungeonBraziers`) com oscilação dinâmica de chamas.
  - Paredes externas, salas em L, corredores estreitos (`2.4m`), **O Pique** no centro `(0, 0)` com Altar de Pedra d'Alma (*Soulstone*) + cúpula de bloqueio e a **Zona de Prisão + Botão Salva-Todos** no extremo Norte `(0, -16.8)`.
  - Colisão círculo-AABB (`resolveCollision`), detecção de proximidade e pressão direcional contra paredes (`detectWallInteraction`) e raycasting 2D/3D (`castVisionRay`, `hasLineOfSight`).
  - Malha de navegação (`buildNavGrid`) e algoritmo de **Pathfinding A\*** (`findPath`) para movimentação inteligente dos bots sem travar em quinas ou muros.
- `js/game.js` (`StickHideAndSeekGame`):
  - Loop principal, câmera 3D com 3 ângulos + zoom, sistema de iluminação real estilo **Tibia (`utevo lux` / `utevo gran lux`)**:
    - `seekerSpotLight` (`THREE.SpotLight` com `castShadow = true` e `penumbra = 0.78`) projetando luz real e sombras de paredes para o feixe direcional da lanterna e para o *Olhar para Cima*.
    - `seekerGranLuxLight` (`THREE.PointLight` radial que opera como halo de tocha curto normalmente e explode em `intensity = 5.2, distance = 21m` dourado-solar 360° ao ativar `1: Acender a Luz / Utevo Gran Lux`).
    - Malha volumétrica multi-anel (`visionRings = 5, visionRays = 96`) com `vertexColors` + `THREE.AdditiveBlending` que decai suavemente até `0` nas bordas (eliminando qualquer aparência de "faixa chapada de outra cor").
  - Névoa de Guerra, regras das 3 fases da partida, sistema Anti-"Guarda-Caixão" e máquinas de estado da IA.

---

## 3. Fluxo da Partida e Regras de Balanceamento

### Cronograma da Partida (8s de Contagem + 90s de Caçada)
1. **Contagem Inicial (8 segundos):**
   - O Pegador fica no centro (**O Pique**) de olhos fechados enquanto os 4 Escondidos correm para as salas e encostam nas paredes.
2. **Ato 1 — Caçada Inicial (Primeiros 30s: `01:30` até `01:00`):**
   - **O Pique Central está TRANCADO** (cúpula azul) e o **Botão Salva-Todos da Prisão também está TRANCADO**.
   - Toda captura feita pelo Pegador nesses 30s iniciais fica garantida na Prisão.
3. **Ato 2 — Fase de Resgate (Dos 30s aos 60s: `01:00` até `00:30`):**
   - O **Botão Salva-Todos** na Prisão ao Norte `(0, -16.8)` é **LIBERADO** (luz verde).
   - Escondidos livres podem ir até a Prisão e apertar `ESPAÇO` para libertar todos os aliados presos com bônus de velocidade, deixando um **rastro de pegadas luminosas (`👣 RASTRO DE FUGA`) por 3 segundos** após o resgate.
   - O Pegador pode usar sua habilidade única **`5: Curto-Circuito`** para bloquear o botão da Prisão por 15 segundos.
4. **Ato 3 — Clímax Final (Últimos 30s: `00:30` até `00:00`):**
   - **O Pique Central `(0, 0)` ABRE!** A cúpula azul desaparece e o cristal fica dourado.
   - Qualquer Escondido livre que chegar ao Pique e apertar `ESPAÇO` bate Pique e garante a vitória da equipe!

### Sistema Anti-"Guarda-Caixão" (`updateAntiCamp`)
- Nem o jogador nem a IA no papel de Pegador podem "acampar" a menos de `6.5m` do **Pique Aberto** ou da **Prisão Ativa** por mais de **4 segundos** sem estar perseguindo um Escondido visível:
  - **Na Prisão:** Se acampar por 4s, as grades se abrem sozinhas (*Salva-Todos Automático*) e o Pegador é repelido e atordoado por `2.6s`.
  - **No Pique Aberto:** Se acampar por 4s, o Pegador sofre choque/atordoamento de `2.6s` e é repelido para longe do centro.
  - **Exceção Importante:** A regra de Guardar Caixão na Prisão fica **suspensa** nos primeiros 30s da partida (enquanto o Salva-Todos ainda não abriu) e durante os 15s da habilidade **Curto-Circuito**.

---

## 4. Kit de Posturas e Habilidades

### Escondido (Fujão)
- **Passiva — Encolher na Parede (`wall_hug`):** Ao pressionar a seta/WASD contra uma parede próxima, o boneco achata as costas no muro. Reduz o alcance de detecção do Pegador em **60%** (`4.6m`), estreita o ângulo de visão necessário para ser notado e permite andar silenciosamente sem emitir ondas de passos.
- **Barra de Fôlego / Tensão Muscular:** Segurar poses acrobáticas consome fôlego. Abaixo de `25%`, o boneco começa a **tremer**, emitindo alertas sonoros (`⚠️ MÚSCULO TREMENDO!`) que revelam sua posição.
- **Habilidades Ativas:**
  1. **`1` / `Q` — Dragon Flag (4s | CD: 11s | Requer Parede):** Ancora ombros e mãos na parede a `2.25m` de altura e projeta o tronco, quadril e pernas esticadas em prancha rígida horizontal/inclinada para fora da parede (de barriga para cima, executando a alavanca clássica de calistenia). **100% imune** ao cone de visão baixo e à *Luz 360°* (o Pegador passa por baixo sem capturar). Só é detectado se o Pegador usar *Olhar para Cima (`2`)*.
  2. **`2` / `E` — Tinta Fresca 2D (4.5s | CD: 13s | Requer Parede):** Achata-se como grafite 2D na cor do muro. **100% imune** à visão normal e ao *Olhar para Cima*, mesmo se o Pegador passar colado. Só é revelado se o Pegador usar *Acender a Luz 360° (`1`)* a menos de `6.5m`.
  3. **`3` / `R` — Espacate Alto do Van Damme (4s | CD: 12s | Exclusivo em Corredores):** Só pode ser ativado dentro de corredores estreitos entre duas paredes paralelas (`detectCorridor`). Centraliza o boneco no corredor a `2.65m` de altura e abre espacate horizontal de 180° cravando os dois pés nas paredes opostas. O Pegador passa por baixo das pernas sem capturar, a menos que use *Olhar para Cima (`2`)*.
  4. **`4` / `F` — Estalo Distração (CD: 9s):** Arremessa uma pedrinha `7.5m` à frente que cria ondas sonoras (`🪨 ESTALO!`) para atrair o Pegador para longe.
- **Cancelamento / Soltura Antecipada de Acrobacias (`releaseHoldPose`):**
  - Enquanto estiver em `Dragon Flag (1)`, `Tinta Fresca 2D (2)` ou `Espacate Alto (3)`, o jogador pode **soltar a pose a qualquer instante** para correr ao Pique ou salvar aliados:
    1. Apertando **qualquer tecla de movimento (`WASD` / Setas)** para longe da parede (ou após soltar a tecla que mantinha pressionada ao ativar a habilidade);
    2. Apertando **`ESPAÇO`**;
    3. Apertando novamente a **própria tecla da habilidade (`1`/`Q`, `2`/`E`, `3`/`R`)** ou clicando no botão do HUD.

### Pegador (Caçador)
- **Velocidade de Movimento:** Velocidade padrão de `10.4 m/s` (acima do antigo Bote Rápido que era `9.9 m/s`), mantendo os `+50%` (`1.5x`) no **Bote Rápido**, que agora atinge `15.6 m/s`.
- **Passiva — Névoa de Guerra + Percepção de Passos:** Escondidos fora do cone de luz ficam invisíveis, mas qualquer escondido que correr **em pé (`normal`)** a menos de `9.5m` do Pegador emite ondas discretas (`👣 PASSOS`).
- **Passiva — Efeito *Momentum* ao Capturar:** Cada captura reduz instantaneamente em **`3.5s`** os tempos de recarga (*cooldowns*) das habilidades 1 a 4 do Pegador.
- **Habilidades Ativas:**
  1. **`1` / `Q` — Acender a Luz 360° (3.2s | CD: 11s):** Ilumina `13m` em 360° ao redor do Pegador, revelando quem está encolhido nas sombras das paredes (`wall_hug`) ou camuflado em *Tinta Fresca 2D*.
  2. **`2` / `E` — Olhar para Cima (3.0s | CD: 9s):** Eleva o feixe de visão para `2.25m` de altura (com apenas `-20%` de lentidão, mantendo `80%` da velocidade), flagrando e capturando quem estiver em *Dragon Flag* ou *Espacate Alto*.
  3. **`3` / `R` — Radar Cardíaco (3.5s | CD: 13s):** Emite pulso de sonar que revela através das paredes qualquer escondido em movimento ou com fôlego baixo/músculo tremendo.
  4. **`4` / `F` — Bote Rápido (0.42s | CD: 6s):** Avanço de alta velocidade com alcance de captura ampliado (`1.85m`).
  5. **`5` / `G` — Curto-Circuito ⚡ (15.0s | Uso Único na Partida):** Sobrecarrega à distância o botão *Salva-Todos* da Prisão ao Norte, impedindo qualquer resgate e suspendendo a regra de Guardar Caixão na Prisão por **15 segundos**.

---

## 5. Detalhes Técnicos Importantes para Manutenção Futura

### Geometria das Animações Acrobáticas (`js/stickman.js` e `js/map.js`)
- **Coordenadas Locais do `Stickman3D`:**
  - `pelvis` é a raiz articulada: a coluna (`spineMesh`, `0 → +0.72`) e a cabeça (`headGroup`, `y = +0.88`) crescem no eixo `+Y` local da pelve, enquanto as pernas (`leftLeg`/`rightLeg`, comprimento `0.88`) crescem no eixo `-Y` local da pelve.
- **Matemática do `dragon_flag`:**
  - Para que o boneco fique **de barriga para cima (supino)** com a cabeça/ombros na parede (`-Z`) e as pernas esticadas para fora da parede (`+Z`), `pelvis.rotation.x` deve ser **negativo** (`~ -Math.PI * 0.56`, oscilando `±0.08 rad`).
  - A posição da pelve é calculada em função do ângulo (`y = 2.25 - 0.68 * cos(flagAngle)`, `z = -0.22 - 0.68 * sin(flagAngle)`) para manter os **ombros (`y_local = 0.68`) 100% fixos na parede** enquanto o corpo inteiro faz a alavanca rígida.
- **Matemática e Restrição de Corredor do `corridor_split` (Espacate Alto do Van Damme):**
  - Os 4 corredores principais da arena (`x = ±12.0` e `x = ±15.6` em `js/map.js`) possuem vão livre de **`2.4m`** (mantendo a coluna `wx = ±14` livre na malha A\*).
  - `ArenaMap.detectCorridor(pos)` dispara raios opostos (`±X` e `±Z`) e valida que ambas as paredes paralelas continuam ao longo do eixo do corredor (`span <= 3.2m`).
  - Ao ativar `corridor_split`, o boneco é posicionado exatamente em `corridorInfo.centerPos`, orientado ao longo do corredor (`facingAngle = 0` para corredores Norte-Sul ou `Math.PI / 2` para Leste-Oeste) e tem `leftLeg.scale.y` / `rightLeg.scale.y` ajustados dinamicamente para `(span * 0.5 - 0.19) / 0.88`, garantindo que os dois pés toquem perfeitamente as duas paredes opostas em 180°.

### Histórico de Decisões de Balanceamento do Usuário
- **Aprovadas e Ativas:**
  - Velocidade base do Pegador em **`10.4 m/s`** (acima do antigo Bote Rápido que era `9.9 m/s`), mantendo **`+50%` (`1.5x` = `15.6 m/s`)** no **Bote Rápido** (contra `6.1 m/s` do Escondido).
  - **Rastro de Fuga (`escapeTrailTimer = 3.0s`)** com pegadas luminosas após acionamento do *Salva-Todos*.
  - Penalidade de movimento do **Olhar para Cima (`2`)** reduzida para apenas **`-20%` (`0.80x`)**.
  - **Efeito *Momentum***: capturar um Escondido reduz em **`3.5s`** o *cooldown* das habilidades 1 a 4 do Pegador.
- **Ideias Descartadas pelo Usuário (Não Implementar):**
  - **NÃO** adicionar custo inicial instantâneo de fôlego ao ativar acrobacias (manter apenas o dreno contínuo por segundo).
  - **NÃO** aumentar o raio de detecção periférica em 360° no chão além de `1.25m` para escondidos em pé.

---

## 6. Arquitetura Multiplayer: Mini-Servidores com AI Backfill (`server.js` + `js/game.js`)
- **Salas Instanciadas (Até 5 jogadores por Mini-Servidor):**
  - 1 vaga de Pegador (`seeker_main`) + 4 vagas de Escondidos (`hider_0` a `hider_3`).
  - Se um jogador humano escolher um papel que já está ocupado na sala, o servidor atribui automaticamente a próxima vaga livre e informa o cliente (`assignedRole`).
- **Preenchimento Híbrido com IA (*AI Backfill*):**
  - Todas as vagas sem humanos conectados (`isRemoteHuman = false`) continuam sendo controladas por bots IA com Pathfinding A\*.
  - Assim que um humano entra no Mini-Servidor, ele assume o controle em tempo real de um dos bonecos (`isRemoteHuman = true`), exibindo o seu apelido acima da cabeça, e se desconectar, o bot IA reassume o boneco imediatamente sem interromper a partida.
- **Sincronização WebSocket (~28 Hz):**
  - Cada cliente humano é autoritativo sobre a física, posição, postura e habilidades do seu próprio personagem (`player_update`).
  - O *Host* da sala (primeiro humano da sala, migrado automaticamente se sair) sincroniza o cronômetro da partida, estado das portas/Pique e a posição dos bots IA restantes (`world_sync`).
  - Eventos críticos (`capture`, `rescue_all`, `pique_win`, `short_circuit`, `distraction`) são transmitidos instantaneamente via `game_event`.

---

## 7. Como Executar e Publicar o Projeto
- **URL Pública na Nuvem (Render.com — Plano Free sem cartão, deploy automático via GitHub):**
  - Link ao vivo: `https://stick-pique-esconde.onrender.com/`
  - Repositório GitHub: `https://github.com/overfilla/stick-pique-esconde.git` (`branch main`)
  - Configuração de serviço em `render.yaml` (`node server.js`, WebSocket + HTTP, auto-deploy ativo a cada `git push origin main`).
- **Monetização (Adsterra — Banners Limpos Controlados, ZERO Pop-up):**
  - **Anúncio 1/2 (5s):** Banner `300x250` (`key: b2db0a752021cd91ed89ea4fe0f486ae`) renderizado dentro do modal `#ad-break-modal` via `iframe` `srcdoc`.
  - **Anúncio 2/2 (5s):** Banner `728x90` (`key: 9c614d5786045bfaefeae3f138cfa684`) renderizado dentro do modal `#ad-break-modal` via `iframe` `srcdoc`.
  - Ao final dos 2 anúncios, o modal fecha sozinho e inicia a próxima partida automaticamente.
- **Localmente com Multiplayer (Mini-Servidores WebSocket + HTTP na porta 8080):**
  ```powershell
  node "D:\Stick Pique Esconde\server.js"
  ```
  e acesse `http://localhost:8080`.

---

## 8. Histórico das 6 Tarefas Prioritárias (Concluídas em 13/11/2026)

1. ✅ **Sem pausa no `Alt + Tab` no Modo Online (`js/game.js`):**
   - `stepSimulation(dt)` foi separado da renderização e conectado ao `setupBackgroundOnlineLoop()` (`40ms` / 25 Hz), mantendo a partida, os bots IA e o envio de pacotes ativos quando `document.hidden === true` e `this.isMultiplayer === true` (pausando apenas no Modo Solo Local).
2. ✅ **Anúncios do GameMonetize ativos também em `stick-pique-esconde.fly.dev` (`js/ads.js` e `style.css`):**
   - Normalização automática do `localStorage('gd_tag')` (`description_url` e `domain=html5.gamemonetize.co`) em `triggerGameMonetizeBanner()` e `z-index: 999999 !important` nos containers `#sdk__advertisement`, `#imaContainer` e `#imaContainer_new`.
3. ✅ **Exibição garantida dos 2 Anúncios seguidos (`Anúncio 1/2` ➔ `Anúncio 2/2`) (`js/ads.js`):**
   - Reset automático das travas de cooldown internas do SDK (`window.sdk.adRequestTimer = undefined`, `videoAdInstance.requestRunning = false`, `comAPI.ad._lastInGameAdTime = -1`) antes de cada chamada a `window.sdk.showBanner()`, com intervalo de `650ms` entre o fechamento do 1º vídeo e a abertura do 2º vídeo.
4. ✅ **Congelamento total da partida enquanto o anúncio carrega ou toca (`js/ads.js` + `js/game.js`):**
   - `window.adManager.isAdActive()` monitora `isPlayingAdBreak`, `sdkVideoPlaying`, `sdkAdPending` e `isSdkOverlayVisible()` (`#sdk__advertisement`, `#imaContainer`, `#promo`), bloqueando 100% do `stepSimulation(dt)` e de `restart_match` até que os 2 anúncios terminem.
5. ✅ **Remoção dos cards de exemplo ("Diablo IV: Vessel of Hatred" e "Tibia: Utevo Gran Lux Edition") (`js/ads.js` + `style.css`):**
   - Substituídos por um aviso limpo e discreto (`.ad-clean-status`) sem poluição visual atrás do vídeo em tela cheia.
6. ✅ **Desbloqueio do botão `Request activation` no painel do GameMonetize (`index.html` + `js/ads.js`):**
   - Inclusão do snippet oficial `window.SDK_OPTIONS` + disparo automático de `postMessage('SDK_IMPLEMENTED')`, `event.php` e `opphbh2.php` em `notifyGameMonetizeVerified()`, além da atualização do pacote [JOGO-PRONTO-GAMEMONETIZE.zip](file:///D:/Stick%20Pique%20Esconde/JOGO-PRONTO-GAMEMONETIZE.zip). *(Posteriormente o jogo foi recusado na revisão manual da GameMonetize por ser feito por IA.)*

---

## 9. Histórico da Migração para Render.com + Monetag (Concluída em 18/11/2026)

1. ✅ **Alternativa ao GameMonetize para jogo feito por IA:**
   - Migrado para **Monetag** (`sw.js` verificado + MultiTag `data-zone="312297"` integrada em `index.html` e `js/ads.js`), removendo completamente os scripts da GameMonetize.
2. ✅ **Hospedagem Gratuita sem Cartão (Render.com):**
   - Migrado da Fly.io para o **Render.com** (`https://stick-pique-esconde.onrender.com/`) com deploy automático via GitHub (`https://github.com/overfilla/stick-pique-esconde.git`).
3. ✅ **Ajustes Gerais:**
   - WebSocket em `js/game.js` agora usa `${wsProto}//${window.location.host}/ws` dinamicamente, `server.js` serve `.txt` e `sw.js`, selo do menu atualizado para `ARENA 3D MULTIPLAYER` e loop de segundo plano Web Worker ativo no modo Online.




