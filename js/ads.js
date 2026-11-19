// Sistema de Monetização — Adsterra Banners Controlados (2 Anúncios por Partida — Online e Offline)
// Fluxo exato:
// 1. ZERO anúncios/pop-ups durante a partida.
// 2. Fim de partida -> 3.5s de placar -> Modal de Intervalo Comercial:
//    - Anúncio 1 de 2 (5s): Banner Adsterra 300x250 dentro da caixa central
//    - Anúncio 2 de 2 (5s): Banner Adsterra 728x90 dentro da caixa central
//    - Fecha automaticamente e inicia a próxima partida!

window.ADS_CONFIG = {
  enabled: true,
  adsPerMatch: 2,               // 2 anúncios sequenciais obrigatórios ao fim de cada partida
  adDurationSeconds: 5,         // 5 segundos por anúncio (Anúncio 1/2 -> Anúncio 2/2 -> fecha sozinho)
  scoreboardDelaySeconds: 3.5,  // Tempo do placar final antes de abrir o Anúncio 1/2
  provider: 'adsterra',

  adsterra: {
    ad1: {
      key: 'b2db0a752021cd91ed89ea4fe0f486ae',
      width: 300,
      height: 250,
      scriptUrl: 'https://bauval.org/22/b2db0a752021cd91ed89ea4fe0f486ae'
    },
    ad2: {
      key: '9c614d5786045bfaefeae3f138cfa684',
      width: 728,
      height: 90,
      scriptUrl: 'https://bauval.org/22/9c614d5786045bfaefeae3f138cfa684'
    }
  }
};

class AdManager {
  constructor() {
    this.isPlayingAdBreak = false;
    this.currentAdIndex = 0;
    this.totalAds = (window.ADS_CONFIG && window.ADS_CONFIG.adsPerMatch) || 2;
    this.returnToMenuAfterAds = false;
    this.wasSoundEnabled = true;
    this.activeTimer = null;

    // Remove qualquer Service Worker residual de testes anteriores (ex: Monetag sw.js)
    // para garantir que nenhum pop-up ou push apareça durante o jogo.
    this.cleanupLegacyServiceWorkers();
  }

  cleanupLegacyServiceWorkers() {
    try {
      if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister().catch(() => {}));
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // Retorna true enquanto o intervalo comercial estiver ativo.
  // Usado pelo game.js para congelar 100% da partida (cronômetro, contagem, IA e movimento).
  isAdActive() {
    return !!this.isPlayingAdBreak;
  }

  // Executa a sequência obrigatória de 2 anúncios ao final da partida (Anúncio 1/2 -> Anúncio 2/2 -> fecha)
  playMatchAdBreak(onAllAdsFinished) {
    if (!window.ADS_CONFIG || !window.ADS_CONFIG.enabled) {
      if (onAllAdsFinished) onAllAdsFinished(this.returnToMenuAfterAds);
      return;
    }

    if (this.isPlayingAdBreak) return;
    this.isPlayingAdBreak = true;
    this.returnToMenuAfterAds = false;
    this.totalAds = window.ADS_CONFIG.adsPerMatch || 2;

    // Silencia o som do jogo durante o intervalo comercial
    if (window.soundFX) {
      this.wasSoundEnabled = window.soundFX.enabled;
      window.soundFX.enabled = false;
    }

    const modal = document.getElementById('ad-break-modal');
    const menuToggleBtn = document.getElementById('btn-ad-return-menu');
    if (modal) modal.classList.remove('hidden');

    if (menuToggleBtn) {
      menuToggleBtn.classList.remove('active');
      menuToggleBtn.textContent = '🏠 Ir para o Menu após os anúncios: NÃO (Iniciar Próxima Partida)';
      menuToggleBtn.onclick = () => {
        this.returnToMenuAfterAds = !this.returnToMenuAfterAds;
        menuToggleBtn.classList.toggle('active', this.returnToMenuAfterAds);
        menuToggleBtn.textContent = this.returnToMenuAfterAds
          ? '🏠 Ir para o Menu após os anúncios: SIM (Trocar Papel / Sala)'
          : '🏠 Ir para o Menu após os anúncios: NÃO (Iniciar Próxima Partida)';
      };
    }

    // Anúncio 1 de 2 (300x250) -> Anúncio 2 de 2 (728x90) -> fecha automaticamente e inicia próxima partida
    this.runSingleAdStep(1, () => {
      this.runSingleAdStep(2, () => {
        this.finishAdBreak(onAllAdsFinished);
      });
    });
  }

  runSingleAdStep(adNumber, onStepDone) {
    this.currentAdIndex = adNumber;
    const cfg = window.ADS_CONFIG;
    const duration = cfg.adDurationSeconds || 5;

    const badgeEl = document.getElementById('ad-step-badge');
    const step1El = document.getElementById('ad-pill-1');
    const step2El = document.getElementById('ad-pill-2');
    const timerTextEl = document.getElementById('ad-timer-text');
    const progressFillEl = document.getElementById('ad-progress-fill');
    const slotContainer = document.getElementById('intermission-stage-box');

    if (badgeEl) {
      badgeEl.textContent = `📺 INTERVALO COMERCIAL • ANÚNCIO ${adNumber} DE ${this.totalAds}`;
    }
    if (step1El) {
      step1El.className = `ad-step-pill ${adNumber === 1 ? 'active' : 'done'}`;
      step1El.textContent = adNumber > 1 ? '✓ Anúncio 1/2' : '▶ Anúncio 1/2';
    }
    if (step2El) {
      step2El.className = `ad-step-pill ${adNumber === 2 ? 'active' : ''}`;
      step2El.textContent = '▶ Anúncio 2/2';
    }
    if (progressFillEl) {
      progressFillEl.style.width = '0%';
    }

    // Renderiza o Banner oficial do Adsterra dentro de um iframe isolado (suporta document.write sem travar a página!)
    this.renderAdsterraBanner(adNumber, slotContainer);

    let elapsed = 0;
    let lastTick = performance.now();

    if (this.activeTimer) clearInterval(this.activeTimer);
    this.activeTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      elapsed += dt;
      const remaining = Math.max(0, duration - elapsed);
      const pct = Math.min(100, (elapsed / duration) * 100);

      if (progressFillEl) {
        progressFillEl.style.width = `${pct}%`;
      }

      const secsLeft = Math.ceil(remaining);
      if (timerTextEl) {
        if (adNumber < this.totalAds) {
          timerTextEl.textContent = `Anúncio ${adNumber}/${this.totalAds} • Próximo anúncio em ${secsLeft}s...`;
        } else {
          timerTextEl.textContent = `Anúncio ${adNumber}/${this.totalAds} • Próxima partida inicia em ${secsLeft}s...`;
        }
      }

      if (remaining <= 0) {
        clearInterval(this.activeTimer);
        this.activeTimer = null;
        onStepDone();
      }
    }, 80);
  }

  renderAdsterraBanner(adNumber, container) {
    if (!container) return;
    const adCfg =
      window.ADS_CONFIG && window.ADS_CONFIG.adsterra
        ? adNumber === 1
          ? window.ADS_CONFIG.adsterra.ad1
          : window.ADS_CONFIG.adsterra.ad2
        : null;

    container.innerHTML = '';

    if (!adCfg || !adCfg.key || !adCfg.scriptUrl) {
      container.innerHTML = `
        <div class="ad-clean-status">
          <div>📺 Intervalo Comercial — Anúncio ${adNumber} de ${this.totalAds}</div>
          <small>O jogo está pausado e retomará automaticamente.</small>
        </div>
      `;
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:260px;gap:8px;overflow:hidden;';

    const frame = document.createElement('iframe');
    frame.width = String(adCfg.width);
    frame.height = String(adCfg.height);
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('scrolling', 'no');
    frame.style.cssText = `border:0;overflow:hidden;max-width:100%;width:${adCfg.width}px;height:${adCfg.height}px;background:rgba(15,23,42,0.55);border-radius:10px;`;

    // Usa srcdoc para que o document.write() interno do Adsterra funcione em 100% das partidas,
    // mantendo a origem do domínio principal e 100% contido dentro do nosso modal (zero pop-up).
    frame.srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
</head>
<body>
<script>
  atOptions = {
    'key' : '${adCfg.key}',
    'format' : 'iframe',
    'height' : ${adCfg.height},
    'width' : ${adCfg.width},
    'params' : {}
  };
</script>
<script src="${adCfg.scriptUrl}"></script>
</body>
</html>`;

    wrapper.appendChild(frame);
    container.appendChild(wrapper);
  }

  finishAdBreak(onAllAdsFinished) {
    if (this.activeTimer) {
      clearInterval(this.activeTimer);
      this.activeTimer = null;
    }

    this.isPlayingAdBreak = false;

    const slotContainer = document.getElementById('intermission-stage-box');
    if (slotContainer) slotContainer.innerHTML = '';

    const modal = document.getElementById('ad-break-modal');
    if (modal) modal.classList.add('hidden');

    if (window.soundFX) {
      window.soundFX.enabled = this.wasSoundEnabled;
    }
    if (window.game) {
      window.game.lastFrameTime = performance.now();
    }

    if (onAllAdsFinished) {
      onAllAdsFinished(this.returnToMenuAfterAds);
    }
  }
}

window.adManager = new AdManager();
