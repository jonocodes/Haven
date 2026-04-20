import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { router } from './routes/router'
import { initializeSettings } from './lib/db'
import './index.css'

initializeSettings().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
      <Toaster 
        position="bottom-center"
        expand={false}
        richColors
        closeButton
      />
    </StrictMode>,
  )
})
