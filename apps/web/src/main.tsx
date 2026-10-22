import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { StoreProvider } from './app/store';
import { PwaProvider } from './app/pwa';
import { TourProvider } from './app/tour';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaProvider>
      <StoreProvider>
        <HashRouter>
          <TourProvider>
            <App />
          </TourProvider>
        </HashRouter>
      </StoreProvider>
    </PwaProvider>
  </StrictMode>,
);
