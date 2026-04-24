export function navigate(path: string, state: unknown = null): void {
  history.pushState(state, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
}
