import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './logo.css';
import './capture.css';
import './theme.css';
import './brand-theme.css';
import './channel-moderation.css';

document.documentElement.classList.toggle('starladder-desktop', Boolean(window.starladderDesktop));
try {
  const savedTheme = JSON.parse(localStorage.getItem('nexus-settings') || '{}').theme;
  document.documentElement.dataset.theme = savedTheme === 'night' ? 'night' : 'standard';
} catch {
  document.documentElement.dataset.theme = 'standard';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
