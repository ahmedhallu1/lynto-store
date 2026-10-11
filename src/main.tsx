import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
root.innerHTML = ''; // drop the server-rendered SEO snapshot before mounting
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
