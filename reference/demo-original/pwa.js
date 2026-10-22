/* RotaCerta PWA shell. No API, analytics, credential collection or remote writes. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const mode = window.matchMedia('(display-mode: standalone)');
  let deferredInstall = null;
  let registration = null;
  let offlineReady = false;
  let updating = false;
  let checking = false;
  let updateTimer = 0;
  let workerError = false;
  const isStandalone = () => mode.matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isLocalFile = () => location.protocol === 'file:' || location.protocol === 'content:';

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }
  function feedback(message, type = 'info') {
    if (typeof window.toast === 'function') window.toast(message, type);
  }
  function showInfo(title, html, footer) {
    if (typeof window.showModal === 'function') {
      window.showModal(title, '<div class="rc-pwa-info">' + html + '</div>',
        footer || '<button type="button" class="btn primary" data-action="close">Entendi</button>');
    }
  }
  function statusMessage() {
    if (isLocalFile()) return 'Instalação disponível após publicar por HTTPS.';
    if (workerError) return 'Modo offline não disponível neste navegador. Use com internet.';
    if (offlineReady) return navigator.onLine
      ? 'Demonstração disponível offline neste navegador.'
      : 'Sem internet · demonstração local disponível.';
    return navigator.onLine ? 'Preparando a demonstração neste dispositivo…' : 'Sem internet · abra online antes de apresentar.';
  }
  function syncUI() {
    const root = document.documentElement;
    root.dataset.pwaStandalone = String(isStandalone());
    root.dataset.pwaUpdateAvailable = String(!!registration?.waiting);
    root.dataset.pwaOfflineReady = String(offlineReady);
    document.querySelectorAll('[data-pwa-status]').forEach(el => setText(el, statusMessage()));
    document.querySelectorAll('[data-pwa-update]').forEach(el => {
      const hidden = !registration?.waiting;
      if (el.hidden !== hidden) el.hidden = hidden;
    });
  }
  function showInstallGuide() {
    if (isStandalone()) {
      showInfo('RotaCerta no celular', '<p>Você já abriu o aplicativo em modo independente.</p><p>A operação continua sendo uma demonstração local, com dados fictícios.</p>');
      return;
    }
    if (isLocalFile() || !window.isSecureContext) {
      showInfo('Abra o link publicado', '<p>A instalação precisa do aplicativo publicado por <strong>HTTPS</strong>. Este arquivo local serve apenas para pré-visualização.</p><p>Depois da publicação, abra o endereço no navegador do celular e use a opção de instalar.</p>');
      return;
    }
    const steps = isIOS()
      ? '<p>No <strong>Safari do iPhone</strong>:</p><ol><li>Abra o menu de compartilhamento.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Ative <strong>Abrir como App</strong>, quando essa opção aparecer, e confirme.</li><li>Abra o RotaCerta pelo ícone criado.</li></ol>'
      : '<p>No <strong>Chrome do Android</strong>:</p><ol><li>Abra o menu <strong>⋮</strong>.</li><li>Escolha <strong>Instalar e criar atalho → Instalar</strong>. Em algumas versões aparece <strong>Adicionar à tela inicial</strong>.</li><li>Confirme e abra o RotaCerta pelo novo ícone.</li></ol><p>No computador, use a opção de instalar na barra de endereço ou no menu do navegador, quando disponível.</p>';
    showInfo('Instalar o RotaCerta', steps + '<p>O navegador decide quando oferecer a instalação. Se estiver em um navegador interno de outro aplicativo, abra o link no Chrome ou Safari.</p>');
  }
  async function install() {
    if (!deferredInstall) { showInstallGuide(); return; }
    const prompt = deferredInstall;
    deferredInstall = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') feedback('Pedido de instalação aceito. Conclua as instruções do navegador.');
    } catch (_) { showInstallGuide(); }
    syncUI();
  }
  function showAbout() {
    const state = offlineReady ? 'Disponível neste navegador' : 'Ainda não disponível';
    showInfo('Sobre esta demonstração',
      '<p><strong>RotaCerta · PWA ' + VERSION + '</strong><br>Atendimento, expedição e motorista no design aprovado.</p>' +
      '<p><strong>Modo offline:</strong> ' + state + '. As telas podem funcionar sem internet depois do primeiro carregamento completo. O armazenamento pode ser removido pelo navegador ou pelo usuário.</p>' +
      '<p><strong>Dados locais:</strong> cada dispositivo mantém sua própria demonstração. Não existe sincronização entre os celulares da equipe. Para mostrar o fluxo completo, troque os perfis no mesmo aparelho.</p>' +
      '<p><strong>Integrações simuladas:</strong> não há autenticação real, OCR real do Google Cloud Vision, rastreamento nem envio automático real de WhatsApp. O atalho de contato abre o WhatsApp externo e depende dele.</p>' +
      '<p>Não use senhas, fotos ou dados de clientes reais. Nenhuma foto ou formulário é enviado a um servidor por este protótipo.</p>' +
      '<p>Instalar este PWA não equivale a publicar um aplicativo nativo nas lojas. O visual independente depende do navegador e da forma como o aplicativo foi aberto.</p>');
  }
  function requestUpdate() {
    if (!registration?.waiting) { feedback('Nenhuma atualização pendente.'); return; }
    showInfo('Atualizar o aplicativo?',
      '<p>A atualização vai reabrir a tela de login. <strong>Salve ou conclua o que estiver preenchendo antes de continuar.</strong></p><p>Cadastros já salvos permanecem neste dispositivo. A atualização não reinicia os dados de demonstração.</p>',
      '<button type="button" class="btn" data-action="close">Agora não</button><button type="button" class="btn primary" data-pwa-apply-update>Atualizar e reabrir</button>');
  }
  function monitorRegistration(reg) {
    registration = reg;
    syncUI();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          syncUI();
          if (reg.waiting && navigator.serviceWorker.controller) feedback('Nova versão disponível em Perfil. Atualize depois da apresentação.');
        }
      });
    });
  }
  async function registerWorker() {
    if (isLocalFile() || !window.isSecureContext || !('serviceWorker' in navigator)) {
      workerError = !isLocalFile();
      syncUI();
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
      monitorRegistration(reg);
      await navigator.serviceWorker.ready;
      offlineReady = true;
      syncUI();
    } catch (error) {
      workerError = true;
      console.warn('RotaCerta: preparação offline indisponível.', error);
      syncUI();
    }
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    syncUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    feedback('RotaCerta instalado. Abra pelo ícone da tela inicial.', 'checkcircle');
    syncUI();
  });
  mode.addEventListener?.('change', syncUI);
  for (const event of ['online', 'offline']) window.addEventListener(event, () => {
    syncUI();
    if (event === 'offline') feedback(offlineReady ? 'Sem internet. Você pode continuar a demonstração local.' : 'Sem internet. A demonstração ainda não foi preparada para uso offline.', 'info');
  });
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (updating) window.location.reload();
    else syncUI();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-pwa-install],[data-pwa-about],[data-pwa-update],[data-pwa-apply-update]') : null;
    if (!target) return;
    event.preventDefault();
    if (target.hasAttribute('data-pwa-install')) { void install(); return; }
    if (target.hasAttribute('data-pwa-about')) { showAbout(); return; }
    if (target.hasAttribute('data-pwa-update')) { requestUpdate(); return; }
    if (registration?.waiting && !updating) {
      updating = true;
      registration.waiting.postMessage({type:'ROTACERTA_ACTIVATE_UPDATE'});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !registration || !navigator.onLine || checking || Date.now()-updateTimer<60000) return;
    checking = true;
    updateTimer = Date.now();
    registration.update().catch(() => {}).finally(() => {checking = false; syncUI();});
  });
  // The existing prototype replaces #app on navigation. Refresh only the tiny
  // installation/status controls and never re-render operational forms.
  const app = document.getElementById('app');
  if (app) new MutationObserver(syncUI).observe(app, {childList:true,subtree:true});
  syncUI();
  void registerWorker();
  window.RotaCertaPWA = Object.freeze({
    version: VERSION,
    getStatus: () => ({offlineReady,standalone:isStandalone(),updateAvailable:!!registration?.waiting,workerError}),
    install, showAbout
  });
})();
