import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// 首帧之前定好主题，避免深色闪一下再变浅
const stored = localStorage.getItem('chief-theme')
const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
const initialTheme = stored === 'light' || stored === 'dark' ? stored : prefersLight ? 'light' : 'dark'

document.documentElement.dataset['theme'] = initialTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
