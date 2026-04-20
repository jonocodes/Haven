declare module 'remotestorage-widget' {
  import type RemoteStorage from 'remotestoragejs'
  
  interface WidgetOptions {
    leaveOpen?: boolean
    autoCloseAfter?: number
    skipInitial?: boolean
    logging?: boolean
    modalBackdrop?: boolean | string
  }
  
  export default class Widget {
    constructor(remoteStorage: RemoteStorage, options?: WidgetOptions)
    attach(elementId?: string | HTMLElement): void
    close(): void
    open(): void
    toggle(): void
  }
}
