// Sistema de Monetização — Monetag (2 Anúncios por Partida — Online e Offline)
// Compatível com:
// 1. Monetag Vignette Banner / Interstitial / MultiTag (scripts por Zona)
// 2. Monetag Direct Link (SmartLink) opcional no intervalo comercial

window.ADS_CONFIG = {
  enabled: true,
  adsPerMatch: 2,               // Quantidade obrigatória de anúncios ao fim de cada partida (Anúncio 1/2 e 2/2)
  adDurationSeconds: 5,         // Duração mínima de exibição de cada etapa do intervalo comercial (segundos)
  scoreboardDelaySeconds: 3.5,  // Tempo que o placar final aparece antes de iniciar o Anúncio 1/2
  provider: 'monetag',

  // =========================================================================
  // CONFIGURAÇÃO MONETAG (Cole aqui os dados gerados no painel do Monetag):
  // =========================================================================
  monetag: {
    // URL do script gerado pelo Monetag para a Zona 1 (MultiTag / Vignette / Interstitial)
    zone1ScriptUrl: 'https://quge5.com/88/tag.min.js',
    zone1Id: '312297',

    // URL do script da Zona 2 (opcional: se deixar vazio, reutiliza a Zona 1 no 2º anúncio)
    zone2ScriptUrl: '',
    zone2Id: '',

    // Direct Link / SmartLink do Monetag (opcional — exibe um botão de patrocinador clicável no intervalo)
    directLinkUrl: ''
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
    this.injectedScripts = [];
  }

  // Retorna true enquanto o intervalo comercial estiver ativo.
  // Usado pelo game.js para congelar 100% da partida (cronômetro, contagem, IA e movimento).
  isAdActive() {
    return !!this.isPlayingAdBreak;
  }

  // Injeta dinamicamente o script da Zona do Monetag no momento do intervalo comercial
  // (assim os anúncios não interrompem a gameplay durante a partida!)
  triggerMonetagZone(adNumber) {
    const cfg = window.ADS_CONFIG && window.ADS_CONFIG.monetag;
    if (!cfg) return false;

    const isSecond = adNumber === 2;
    const scriptUrl = (isSecond && cfg.zone2ScriptUrl) ? cfg.zone2ScriptUrl : cfg.zone1ScriptUrl;
    const zoneId = (isSecond && cfg.zone2Id) ? cfg.zone2Id : cfg.zone1Id;

    // 1. Se o Monetag expor função programática show_<ZONE_ID>(), aciona diretamente
    if (zoneId && typeof window[`show_${zoneId}`] === 'function') {
      try {
        window[`show_${zoneId}`]();
        return true;
      } catch (e) {}
    }

    // 2. Caso contrário, injeta a tag oficial do Monetag (<script src="..." data-zone="...">)
    if (!scriptUrl) return false;

    try {
      // Remove script anterior do mesmo slot para forçar nova requisição no Anúncio 2/2
      const prevId = `monetag-ad-script-${adNumber}`;
      const existing = document.getElementById(prevId);
      if (existing) existing.remove();

      const s = document.createElement('script');
      s.id = prevId;
      s.async = true;
      s.setAttribute('data-cfasync', 'false');
      if (zoneId) {
        s.setAttribute('data-zone', String(zoneId));
      }
      // Cache-buster leve apenas se for re-disparo de tag sem parâmetro conflitante
      s.src = scriptUrl;
      (document.body || document.head).appendChild(s);
      this.injectedScripts.push(s);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Executa a sequência obrigatória de 2 anúncios ao final da partida (Anúncio 1/2 -> Anúncio 2/2)
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

    // Roda Anúncio 1 de 2 -> intervalo breve -> Anúncio 2 de 2 -> inicia próxima partida
    this.runSingleAdStep(1, () => {
      setTimeout(() => {
        this.runSingleAdStep(2, () => {
          this.finishAdBreak(onAllAdsFinished);
        });
      }, 450);
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

    this.renderAdContent(adNumber, slotContainer);

    if (cfg.provider === 'monetag') {
      this.triggerMonetagZone(adNumber);
    }

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

  renderAdContent(adNumber, container) {
    if (!container) return;
    const mCfg = (window.ADS_CONFIG && window.ADS_CONFIG.monetag) || {};
    const hasMonetagConfigured = !!(mCfg.zone1ScriptUrl || mCfg.directLinkUrl);

    const directLinkHtml = mCfg.directLinkUrl
      ? `<a href="${mCfg.directLinkUrl}" target="_blank" rel="noopener noreferrer" class="sponsor-cta" style="background:#f59e0b;margin-top:8px;">🔗 APOIAR O JOGO (VER OFERTA)</a>`
      : '';

    container.innerHTML = `
      <div class="ad-clean-status">
        <div>📺 Intervalo Comercial — Anúncio ${adNumber} de ${this.totalAds}</div>
        <small>${
          hasMonetagConfigured
            ? 'O jogo está pausado durante o anúncio. A próxima partida começará automaticamente.'
            : 'Aguardando configuração das Zonas do Monetag em js/ads.js. O jogo retomará automaticamente.'
        }</small>
        ${directLinkHtml}
      </div>
    `;
  }

  finishAdBreak(onAllAdsFinished) {
    if (this.activeTimer) {
      clearInterval(this.activeTimer);
      this.activeTimer = null;
    }

    this.isPlayingAdBreak = false;

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
