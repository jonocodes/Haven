import { createRouter, createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { Outlet } from '@tanstack/react-router'
import { Gallery } from '../components/Gallery'
import { Capture } from '../components/Capture'
import { MediaDetail } from '../components/MediaDetail'
import { Settings } from '../components/Settings'

const rootRoute = createRootRoute({
  component: () => (
    <div className="app-container">
      <nav className="app-nav">
        <a href="/gallery">Gallery</a>
        <a href="/capture">Capture</a>
        <a href="/settings">Settings</a>
      </nav>
      <hr />
      <Outlet />
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/gallery' })
  },
})

const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gallery',
  component: Gallery,
})

const captureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/capture',
  component: Capture,
})

const mediaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/media/$mediaId',
  component: MediaDetail,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  galleryRoute,
  captureRoute,
  mediaRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
