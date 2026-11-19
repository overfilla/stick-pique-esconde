# Contexto e Regras do Projeto: Stick Pique-Esconde 3D

Sempre que trabalhar neste repositório (`D:\Stick Pique Esconde`), leia primeiro o arquivo [MEMORIA_DO_PROJETO.md](file:///D:/Stick%20Pique%20Esconde/MEMORIA_DO_PROJETO.md) para entender todas as regras de design, mecânicas e arquitetura.

## Diretrizes Essenciais que Devem Ser Preservadas:
1. **Imunidade Real das Habilidades Furtivas:**
   - O Pegador **só pode capturar** um Escondido se `isHiderDetectedBySeeker(hider)` for `true`.
   - `Dragon Flag (1)` e `Espacate Alto (3)` ficam no plano alto (`y > 2.3m`) e **só** são detectados se o Pegador usar `Olhar para Cima (2)`.
   - `Espacate Alto (3)` **só funciona dentro de corredores** (`ArenaMap.detectCorridor`), centralizando o boneco entre as duas paredes e escalando as pernas em 180° até tocar ambos os muros.
   - `Tinta Fresca 2D (2)` achata o boneco no muro e **só** é detectada se o Pegador usar `Acender a Luz 360° (1)` perto da parede.
   - `Encolher na Parede (wall_hug)` reduz o alcance de detecção em 60% e não emite ondas de passos.
2. **Velocidades e Balanceamento do Pegador:**
   - Velocidade padrão do Pegador: `10.4 m/s`; Bote Rápido (`4`): `15.6 m/s` (`1.5x`, mantendo +50%).
   - Olhar para Cima (`2`) aplica apenas `-20%` de lentidão (`0.80x`).
   - Cada captura reduz em `3.5s` os cooldowns das habilidades 1 a 4 do Pegador (*Momentum*).
   - Resgates no *Salva-Todos* deixam rastro luminoso (`👣 RASTRO DE FUGA`) por `3.0s`.
   - Não adicionar custo inicial de fôlego ao ativar acrobacias nem aumentar o raio de percepção de proximidade (`1.25m`).
3. **IA Justa e Pathfinding A\*:**
   - Todos os bots usam a malha de navegação A\* (`ArenaMap.findPath` + `followNavPath`) em `js/map.js` e `js/game.js`.
   - A IA do Pegador **nunca** deve trapacear lendo coordenadas ou posturas invisíveis dos Escondidos; quando um Escondido ativa uma habilidade furtiva fora do counter ativo, o Pegador perde o rastro imediatamente.
4. **Ritmo em 3 Atos (90s) e Anti-"Guarda-Caixão":**
   - **0s–30s:** Tudo trancado (Pique e Salva-Todos bloqueados).
   - **30s–60s:** Botão **Salva-Todos** abre na Prisão ao Norte (`z = -16.8`). O Pegador pode usar **`5: Curto-Circuito`** (1x na partida, 15s de bloqueio).
   - **60s–90s (Últimos 30s):** **O Pique Central** `(0, 0)` abre para vitória dos Escondidos.
   - A penalidade de **Guardar Caixão** na Prisão fica **suspensa** nos primeiros 30s e durante os 15s do **Curto-Circuito**.
5. **Estética e Iluminação Gótica (Inspirada em *Diablo IV* e *Utevo Gran Lux* do *Tibia*):**
   - Preservar as texturas PBR procedurais (`generateDiabloTextures` com `bumpMap` em `js/map.js`), o mapeamento UV em escala de mundo (`scaleBoxUVs`) para evitar estiramento de tijolos, os 8 braseiros de fogo vivo sem sombras pesadas (60 FPS) e a aplicação da textura da parede (`window.gothicWallColorTex`) no boneco durante a *Tinta Fresca 2D*.
   - A iluminação do Pegador deve usar luzes 3D reais (`seekerSpotLight` com sombra e penumbra suave para o feixe da lanterna + `seekerGranLuxLight` explodindo em 360° dourado-solar na habilidade `1: Acender a Luz`) combinadas com a malha multi-anel em `THREE.AdditiveBlending` (`visionRings = 5`) que decai até `0` nas bordas (nunca usar um polígono chapado de cor uniforme).
6. **Usabilidade, Soltura de Poses e Multiplayer (Mini-Servidores):**
   - Manter o botão de **Tela Cheia (`⛶ Tela Cheia`)** no canto superior direito tanto do menu inicial (`#btn-fullscreen-menu`) quanto do HUD de jogo (`#btn-fullscreen`).
   - Permitir **soltar/cancelar antecipadamente** `Dragon Flag (1)`, `Tinta Fresca 2D (2)` e `Espacate Alto (3)` a qualquer momento ao se mover (`WASD`/Setas), apertar `ESPAÇO` ou pressionar novamente a tecla da habilidade (`releaseHoldPose`).
   - Sempre rodar o servidor com `node server.js` (porta `8080`) para manter ativos os **4 Mini-Servidores WebSocket com preenchimento de IA (AI Backfill)**.
   - **Deploy na Nuvem (Render.com via GitHub):** O projeto está publicado em `https://stick-pique-esconde.onrender.com/` conectado a `https://github.com/overfilla/stick-pique-esconde.git` (`branch main`). Sempre que o usuário pedir para atualizar a versão online, basta fazer commit e executar `git push origin main` (o Render faz auto-deploy).
7. **Monetização (Monetag — Zone 312297):**
   - Ao final de toda partida (`endMatch`), exibir o placar por `3.5s` e entrar automaticamente no intervalo comercial de **2 anúncios (`Anúncio 1 de 2` ➔ `Anúncio 2 de 2`)** gerenciado por `js/ads.js` (`window.adManager`) integrado ao **Monetag** (`sw.js` na raiz + MultiTag `https://quge5.com/88/tag.min.js` `data-zone="312297"`), iniciando a próxima partida automaticamente para todos ao concluir o 2º anúncio.







