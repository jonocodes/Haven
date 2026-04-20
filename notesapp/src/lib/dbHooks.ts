import { useEffect, useState, type DependencyList } from 'react'
import type { Observable, Subscription } from 'rxjs'
import type { Note, SyncMetadata } from './notes'
import {
  observeNote,
  observeSetting,
  observeSyncMeta,
  observeVisibleNotes,
} from './db'

function useAsyncObservableValue<T>(
  factory: () => Promise<Observable<T>>,
  deps: DependencyList,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let subscription: Subscription | undefined

    void factory().then((observable) => {
      if (cancelled) return
      subscription = observable.subscribe((nextValue) => {
        setValue(nextValue)
      })
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, deps)

  return value
}

export function useNote(noteId: string) {
  return useAsyncObservableValue(() => observeNote(noteId), [noteId])
}

export function useSyncMeta(noteId: string) {
  return useAsyncObservableValue<SyncMetadata | null>(() => observeSyncMeta(noteId), [noteId])
}

export function useVisibleNotes() {
  return useAsyncObservableValue<Note[]>(() => observeVisibleNotes(), [])
}

export function useSetting(key: string) {
  return useAsyncObservableValue<string | undefined>(() => observeSetting(key), [key])
}
