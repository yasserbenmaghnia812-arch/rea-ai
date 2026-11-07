import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './AuthGate'
import './styles.css'
import './rea.css'
import './ai.css'
import './agent.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider><App /></AuthProvider>
  </React.StrictMode>,
)