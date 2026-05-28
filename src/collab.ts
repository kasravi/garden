import { useEffect, useMemo, useRef, useState } from 'react'
import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'
import type { AppState } from './types'

type PersistedRoomState = {
  roomId: string
  updatedAt: number
  state: AppState
}

const DB_NAME = 'chores-garden'
const STORE_NAME = 'roomState'
const DB_VERSION = 1

function shouldEnableRealtimeSync(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('sync') !== 'off'
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState
}

function openPersistenceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'roomId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

async function readPersistedState(roomId: string): Promise<PersistedRoomState | null> {
  const db = await openPersistenceDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(roomId)

    request.onsuccess = () => resolve((request.result as PersistedRoomState | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Failed to read room state'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
    tx.onabort = () => db.close()
  })
}

async function writePersistedState(roomId: string, state: AppState, updatedAt: number): Promise<void> {
  const db = await openPersistenceDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ roomId, state: cloneState(state), updatedAt } satisfies PersistedRoomState)

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('Failed to write room state'))
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error ?? new Error('Aborted writing room state'))
    }
  })
}

export function getRoomId(): string {
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('room')
  if (fromUrl) {
    window.localStorage.setItem('chores-room-id', fromUrl)
    return fromUrl
  }

  const persisted = window.localStorage.getItem('chores-room-id')
  if (persisted) {
    return persisted
  }

  const generated = `chores-${Math.random().toString(36).slice(2, 8)}`
  window.localStorage.setItem('chores-room-id', generated)
  return generated
}

export function buildShareUrl(roomId: string): string {
  const next = new URL(window.location.href)
  next.searchParams.set('room', roomId)
  next.searchParams.set('sync', 'webrtc')
  return next.toString()
}

export function useCollaborativeState(initialState: AppState): {
  state: AppState
  updateState: (updater: (previous: AppState) => AppState) => void
  peerCount: number
  connectionStatus: string
  shareUrl: string
} {
  const roomId = initialState.space.roomId
  const realtimeEnabled = useMemo(() => shouldEnableRealtimeSync(), [])
  const [state, setState] = useState<AppState>(initialState)
  const [peerCount, setPeerCount] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<string>('loading')
  const stateRef = useRef<AppState>(initialState)
  const updatedAtRef = useRef(0)
  const bootstrappedRef = useRef(false)

  const collab = useMemo(() => {
    if (!realtimeEnabled) return null
    const doc = new Y.Doc()
    const root = doc.getMap('chores-root')
    const provider = new WebrtcProvider(roomId, doc, {
      signaling: ['wss://signaling.yjs.dev'],
      maxConns: 8,
      filterBcConns: true,
    })
    return { doc, root, provider }
  }, [realtimeEnabled, roomId])

  useEffect(() => {
    let active = true

    const applyState = (nextState: AppState, updatedAt: number) => {
      const cloned = cloneState(nextState)
      stateRef.current = cloned
      updatedAtRef.current = updatedAt
      setState(cloned)
      void writePersistedState(roomId, cloned, updatedAt).catch((error) => {
        console.warn('[chores] Failed to persist state', error)
      })
    }

    const updatePeers = () => {
      if (!active || !collab) return
      setPeerCount(Math.max(0, collab.provider.awareness.getStates().size - 1))
    }

    const handleStatus = (event: { connected: boolean }) => {
      if (!active) return
      setConnectionStatus(event.connected ? 'connected' : 'connecting')
    }

    const syncFromDoc = () => {
      if (!active || !collab || !bootstrappedRef.current) return
      const next = collab.root.get('state') as AppState | undefined
      const remoteUpdatedAt = Number(collab.root.get('updatedAt') ?? 0)
      if (!next || remoteUpdatedAt < updatedAtRef.current) return
      applyState(next, remoteUpdatedAt)
    }

    const bootstrap = async () => {
      try {
        const persisted = await readPersistedState(roomId)
        if (!active) return

        if (persisted?.state) {
          stateRef.current = cloneState(persisted.state)
          updatedAtRef.current = persisted.updatedAt
          setState(cloneState(persisted.state))
        } else {
          updatedAtRef.current = Date.now()
          stateRef.current = cloneState(initialState)
          setState(cloneState(initialState))
          await writePersistedState(roomId, initialState, updatedAtRef.current)
        }

        if (!active) return

        if (!collab) {
          bootstrappedRef.current = true
          setConnectionStatus('local-only')
          return
        }

        collab.root.observe(syncFromDoc)
        collab.provider.awareness.on('change', updatePeers)
        collab.provider.on('status', handleStatus)
        collab.provider.awareness.setLocalStateField('user', {
          name: stateRef.current.users.find((person) => person.id === stateRef.current.selectedUserId)?.name ?? 'Someone',
        })

        const remoteState = collab.root.get('state') as AppState | undefined
        const remoteUpdatedAt = Number(collab.root.get('updatedAt') ?? 0)
        if (remoteState && remoteUpdatedAt > updatedAtRef.current) {
          applyState(remoteState, remoteUpdatedAt)
        } else {
          collab.doc.transact(() => {
            collab.root.set('state', cloneState(stateRef.current))
            collab.root.set('updatedAt', updatedAtRef.current || Date.now())
          })
        }

        bootstrappedRef.current = true
        setConnectionStatus(collab.provider.connected ? 'connected' : 'connecting')
        updatePeers()
      } catch (error) {
        console.warn('[chores] Failed to bootstrap persistence', error)
        if (!active) return
        bootstrappedRef.current = true
        stateRef.current = cloneState(initialState)
        updatedAtRef.current = Date.now()
        setState(cloneState(initialState))
        setConnectionStatus(collab ? 'connecting' : 'local-only')
      }
    }

    void bootstrap()

    return () => {
      active = false
      if (collab) {
        collab.root.unobserve(syncFromDoc)
        collab.provider.awareness.off('change', updatePeers)
        collab.provider.off('status', handleStatus)
        collab.provider.destroy()
        collab.doc.destroy()
      }
    }
  }, [collab, initialState, roomId])

  const updateState = (updater: (previous: AppState) => AppState) => {
    const next = updater(cloneState(stateRef.current))
    const updatedAt = Date.now()
    stateRef.current = next
    updatedAtRef.current = updatedAt
    setState(next)
    void writePersistedState(roomId, next, updatedAt).catch((error) => {
      console.warn('[chores] Failed to persist updated state', error)
    })
    if (collab) {
      collab.doc.transact(() => {
        collab.root.set('state', cloneState(next))
        collab.root.set('updatedAt', updatedAt)
      })
    }
  }

  return {
    state,
    updateState,
    peerCount,
    connectionStatus,
    shareUrl: buildShareUrl(roomId),
  }
}
