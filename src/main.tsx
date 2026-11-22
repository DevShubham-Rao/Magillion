import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { ManaSymbolProvider } from './hooks/useManaSymbols';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ManaSymbolProvider>
        <App />
      </ManaSymbolProvider>
    </MotionConfig>
  </StrictMode>,
);
