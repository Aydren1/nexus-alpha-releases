import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './logo.css';
import './capture.css';
import './theme.css';
import './brand-theme.css';

document.documentElement.classList.toggle('nexus-desktop', Boolean(window.nexusDesktop));
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
