import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { WsProvider } from './context/WsContext.jsx';
import { LocationProvider } from './context/LocationContext.jsx';
import './i18n/index.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WsProvider>
          <LocationProvider>
            <App />
          </LocationProvider>
        </WsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
