import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { unlockSoundOnFirstInteraction } from './audio/index.js';
import { applyDocumentLanguage } from './i18n/index.js';
import { loadMeasurementsOffer } from './telemetry/index.js';
import { applyDocumentTheme } from './theme/theme.js';

applyDocumentLanguage();
applyDocumentTheme();
unlockSoundOnFirstInteraction();
void loadMeasurementsOffer();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
