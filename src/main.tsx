import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/motion-expressive.css'
import Splash from './components/Splash'
import AmbientMotion from './components/AmbientMotion'
// Dev builds only: simulated USB keyboards (Settings -> MIDI Keyboard), installed
// before the app first asks for MIDI access
import './utils/midiSimulator'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Splash />
    <AmbientMotion />
  </React.StrictMode>
)
