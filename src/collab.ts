import { useEffect, useMemo, useRef, useState } from 'react'
import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'
import type { AppState } from './types'

type PersistedRoomState = {
  roomId: string
  updatedAt: number
  state: AppState
}

export type OnlineUser = {
  id: string
  name: string
  isSelf: boolean
}

const DB_NAME = 'chores-garden'
const STORE_NAME = 'roomState'
const DB_VERSION = 1
const DEFAULT_SIGNALING_SERVERS = [
  'wss://y-webrtc-eu.fly.dev',
  'wss://signaling.yjs.dev',
]

function normalizeGardenCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
}

export function roomIdFromGardenCode(code: string): string {
  const normalized = normalizeGardenCode(code)
  return normalized.startsWith('chores-') ? normalized : `chores-${normalized}`
}

export function gardenCodeFromRoomId(roomId: string): string {
  return roomId.replace(/^chores-/, '')
}

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
  const gardenCode = params.get('garden')
  if (gardenCode) {
    const roomId = roomIdFromGardenCode(gardenCode)
    window.localStorage.setItem('chores-room-id', roomId)
    return roomId
  }
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
  next.searchParams.set('garden', gardenCodeFromRoomId(roomId))
  next.searchParams.delete('room')
  next.searchParams.set('sync', 'webrtc')
  return next.toString()
}

export function useCollaborativeState(initialState: AppState): {
  state: AppState
  updateState: (updater: (previous: AppState) => AppState) => void
  peerCount: number
  connectionStatus: string
  roomCode: string
  shareUrl: string
  onlineUsers: OnlineUser[]
  lastConnectionError: string | null
} {
  const roomId = initialState.space.roomId
  const realtimeEnabled = useMemo(() => shouldEnableRealtimeSync(), [])
  const [state, setState] = useState<AppState>(initialState)
  const [peerCount, setPeerCount] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<string>('loading')
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [lastConnectionError, setLastConnectionError] = useState<string | null>(null)
  const stateRef = useRef<AppState>(initialState)
  const updatedAtRef = useRef(0)
  const bootstrappedRef = useRef(false)

  const collab = useMemo(() => {
    if (!realtimeEnabled) return null
    const doc = new Y.Doc()
    const root = doc.getMap('chores-root')
    const provider = new WebrtcProvider(roomId, doc, {
      signaling: DEFAULT_SIGNALING_SERVERS,
      maxConns: 8,
      filterBcConns: true,
    })
    return { doc, root, provider }
  }, [realtimeEnabled, roomId])

  useEffect(() => {
    let active = true
    bootstrappedRef.current = false
    setConnectionStatus('loading')
    setPeerCount(0)
    setOnlineUsers([])
    setLastConnectionError(null)

    const applyState = (nextState: AppState, updatedAt: number) => {
      const cloned = cloneState(nextState)
      stateRef.current = cloned
      updatedAtRef.current = updatedAt
      setState(cloned)
      void writePersistedState(roomId, cloned, updatedAt).catch((error) => {
        console.warn('[chores] Failed to persist state', error)
      })
    }

    const syncOnlineUsers = () => {
      if (!active) return
      if (!collab) {
        const localUser = stateRef.current.users.find((person) => person.id === stateRef.current.selectedUserId)
        setOnlineUsers(localUser ? [{ id: localUser.id, name: localUser.name, isSelf: true }] : [])
        setPeerCount(0)
        return
      }

      const selfClientId = collab.provider.awareness.clientID
      const entries = Array.from(collab.provider.awareness.getStates().entries())
      const seen = new Set<string>()
      const users: OnlineUser[] = entries.map(([clientId, awarenessState]) => {
        const awarenessUser = awarenessState?.user as { name?: string; id?: string } | undefined
        const id = awarenessUser?.id ?? String(clientId)
        const name = awarenessUser?.name ?? 'Someone'
        seen.add(id)
        return { id, name, isSelf: clientId === selfClientId }
      })

      const localSelectedUser = stateRef.current.users.find((person) => person.id === stateRef.current.selectedUserId)
      if (localSelectedUser && !seen.has(localSelectedUser.id)) {
        users.unshift({ id: localSelectedUser.id, name: localSelectedUser.name, isSelf: true })
      }

      setOnlineUsers(users)
      setPeerCount(Math.max(0, users.filter((user) => !user.isSelf).length))
    }

    const updatePeers = () => {
      if (!active) return
      syncOnlineUsers()
    }

    const handleStatus = (event: { connected: boolean }) => {
      if (!active) return
      setConnectionStatus(event.connected ? 'connected' : 'connecting')
    }

    const signalingListeners: Array<{ conn: any; onConnect: () => void; onDisconnect: (event: { error?: unknown }) => void }> = []

    const attachSignalingListeners = () => {
      if (!collab) return
      collab.provider.signalingConns.forEach((conn: any) => {
        const onConnect = () => {
          if (!active) return
          setLastConnectionError(null)
        }
        const onDisconnect = (event: { error?: unknown }) => {
          if (!active) return
          const message = event?.error instanceof Error
            ? event.error.message
            : `Could not reach signaling server: ${conn.url}`
          setLastConnectionError(message)
        }
        conn.on('connect', onConnect)
        conn.on('disconnect', onDisconnect)
        signalingListeners.push({ conn, onConnect, onDisconnect })
      })
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
        attachSignalingListeners()
        collab.provider.awareness.setLocalStateField('user', {
          id: stateRef.current.selectedUserId,
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
        syncOnlineUsers()
      }
    }

    void bootstrap()

    return () => {
      active = false
      if (collab) {
        signalingListeners.forEach(({ conn, onConnect, onDisconnect }) => {
          conn.off('connect', onConnect)
          conn.off('disconnect', onDisconnect)
        })
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
      collab.provider.awareness.setLocalStateField('user', {
        id: next.selectedUserId,
        name: next.users.find((person) => person.id === next.selectedUserId)?.name ?? 'Someone',
      })
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
    roomCode: gardenCodeFromRoomId(roomId),
    shareUrl: buildShareUrl(roomId),
    onlineUsers,
    lastConnectionError,
  }
}
