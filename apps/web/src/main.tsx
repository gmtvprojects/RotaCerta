import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { StoreProvider } from './app/store';
import { PwaProvider } from './app/pwa';
import { TourProvider } from './app/tour';
import { installPressFeedback } from './app/motion';
import { AppTheme } from './app/theme';
import '@fontsource-variable/figtree';
import './tailwind.css'; // inclui o styles.css numa camada, abaixo dos utilitários

installPressFeedback();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
    <AppTheme>
    <PwaProvider>
      <StoreProvider>
        <HashRouter>
          <TourProvider>
            <App />
          </TourProvider>
        </HashRouter>
      </StoreProvider>
    </PwaProvider>
    </AppTheme>
    </MotionConfig>
  </StrictMode>,
);
