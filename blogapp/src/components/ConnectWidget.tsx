import { useEffect } from 'react'
import Widget from 'remotestorage-widget'
import { rs } from '../lib/remotestorage'

let widgetAttached = false

export function ConnectWidget() {
  useEffect(() => {
    if (widgetAttached) return
    widgetAttached = true
    const widget = new Widget(rs)
    widget.attach()
  }, [])

  return null
}
