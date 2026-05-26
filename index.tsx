
import React from 'react';
import ReactDOM from 'react-dom/client';

// Garantir que process e process.env existam antes de qualquer importação de componente
if (typeof window !== 'undefined') {
  (window as any).process = (window as any).process || { env: {} };
}

import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Elemento root não encontrado.");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);