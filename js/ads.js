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
    // MultiTag removida para evitar Pop-up / OnClick / In-Page Push durante o jogo.
    // Usar apenas zona controlada (ex: Banner Display / Direct Link) dentro do intervalo comercial.
    zone1ScriptUrl: '',
    zone1Id: '',

    zone2ScriptUrl: '',
    zone2Id: '',

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

  // Injeta o script de Zona do Monetag apenas se ainda NÃO estiver carregado na página
  // (evita empilhar múltiplas instâncias da MultiTag que travam o botão de fechar!)
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

    // 2. Se a MultiTag (tag.min.js) já foi carregada no <head> do index.html,
    // NÃO re-injetamos o mesmo script (re-injetar MultiTag duplica overlays e impede fechar o anúncio!)
    if (!scriptUrl) return false;
    const alreadyLoaded = Array.from(document.scripts).some(
      (sc) => sc.src && sc.src.includes(scriptUrl) && (!zoneId || sc.getAttribute('data-zone') === String(zoneId))
    );
    if (alreadyLoaded) {
      return true;
    }

    try {
      const s = document.createElement('script');
      s.id = `monetag-ad-script-${zoneId || adNumber}`;
      s.async = true;
      s.setAttribute('data-cfasync', 'false');
      if (zoneId) {
        s.setAttribute('data-zone', String(zoneId));
      }
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
