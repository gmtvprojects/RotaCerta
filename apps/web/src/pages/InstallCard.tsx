import { useState } from 'react';
import { usePwa } from '../app/pwa';
import { Modal } from './ui';

/** Instalação no celular, estado offline e atualização — usado no login e no perfil. */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const pwa = usePwa();
  const [guide, setGuide] = useState(false);

  const status = !pwa.secure ? 'Instalação disponível após publicar por HTTPS.'
    : pwa.offlineReady ? (pwa.online ? 'Disponível offline neste navegador.' : 'Sem internet · versão local disponível.')
    : pwa.online ? 'Preparando para uso offline neste dispositivo…' : 'Sem internet · abra online antes de usar.';

  const onInstall = () => (pwa.canInstall ? void pwa.install() : setGuide(true));

  return (
    <div className={compact ? 'pwa pwa-compact' : 'card pwa'}>
      {!compact && <><h2>RotaCerta no celular</h2><p className="muted small">Instale para abrir em tela cheia, como um aplicativo. Os dados continuam sendo uma demonstração local.</p></>}
      <div className="actions">
        {!pwa.standalone && <button type="button" className={compact ? 'textbtn' : 'primary'} onClick={onInstall}>Instalar no celular</button>}
        {pwa.updateAvailable && <button type="button" className="primary" onClick={pwa.applyUpdate}>Atualizar agora</button>}
      </div>
      <p className="muted small" role="status">{status}{pwa.updateAvailable ? ' Há uma nova versão pronta.' : ''}</p>
      {guide && (
        <Modal title="Instalar o RotaCerta" onClose={() => setGuide(false)} footer={<button type="button" className="primary" onClick={() => setGuide(false)}>Entendi</button>}>
          {!pwa.secure ? (
            <p>A instalação precisa do aplicativo publicado por <strong>HTTPS</strong>. Em desenvolvimento local, use <code>localhost</code>.</p>
          ) : pwa.isIOS ? (
            <><p>No <strong>Safari do iPhone</strong>:</p>
              <ol><li>Abra o menu de compartilhamento.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol></>
          ) : (
            <><p>No <strong>Chrome do Android</strong>:</p>
              <ol><li>Abra o menu <strong>⋮</strong>.</li><li>Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme.</li></ol>
              <p className="muted small">Se a opção não aparecer, o navegador ainda não considera o app instalável; tente recarregar a página online.</p></>
          )}
        </Modal>
      )}
    </div>
  );
}
