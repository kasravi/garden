import { useEffect, useMemo, useRef, useState } from 'react'
import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'
import { archiveStateRemovals, normalizeState } from './archive'
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
  instanceCount: number
}

type AwarenessUser = {
  sessionId: string
  deviceId: string
  name: string
}

type CollabSession = {
  doc: Y.Doc
  root: Y.Map<unknown>
  provider: WebrtcProvider
}

const DB_NAME = 'chores-garden'
const STORE_NAME = 'roomState'
const DB_VERSION = 1
const SESSION_STORAGE_KEY = 'chores-session-id'
const DEVICE_STORAGE_KEY = 'chores-device-id'
const DEFAULT_SIGNALING_URLS = ['wss://garden-signal.azurewebsites.net']

function getSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing
  const created = `session-${Math.random().toString(36).slice(2, 10)}`
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, created)
  return created
}

function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY)
  if (existing) return existing
  const created = `device-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(DEVICE_STORAGE_KEY, created)
  return created
}

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

function getSignalingUrls(): string[] | undefined {
  return DEFAULT_SIGNALING_URLS
}

function cloneState(state: AppState): AppState {
  return normalizeState(JSON.parse(JSON.stringify(state)) as AppState)
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

function normalizePresenceName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  return normalized || 'Someone'
}

export function useCollaborativeState(initialState: AppState, localPresenceName: string): {
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
  const sessionIdRef = useRef(getSessionId())
  const deviceIdRef = useRef(getDeviceId())
  const collabRef = useRef<CollabSession | null>(null)

  useEffect(() => {
    let active = true
    let collab: CollabSession | null = null
    bootstrappedRef.current = false
    setConnectionStatus('loading')
    setPeerCount(0)
    setOnlineUsers([])
    setLastConnectionError(null)

    if (realtimeEnabled) {
      const doc = new Y.Doc()
      const root = doc.getMap('chores-root')
      const signaling = getSignalingUrls()
      const provider = new WebrtcProvider(roomId, doc, {
        ...(signaling ? { signaling } : {}),
        maxConns: 8,
        filterBcConns: true,
      })
      collab = { doc, root, provider }
      collabRef.current = collab
    } else {
      collabRef.current = null
    }

    const applyState = (nextState: AppState, updatedAt: number) => {
      const archived = archiveStateRemovals(stateRef.current, normalizeState(nextState), 'sync-removed', 'remote')
      const cloned = cloneState(archived)
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
        setOnlineUsers([{ id: deviceIdRef.current, name: normalizePresenceName(localPresenceName), isSelf: true, instanceCount: 1 }])
        setPeerCount(0)
        return
      }

      const entries = Array.from(collab.provider.awareness.getStates().entries())
      const grouped = new Map<string, OnlineUser>()

      for (const [clientId, awarenessState] of entries) {
        const awarenessUser = awarenessState?.user as Partial<AwarenessUser> | undefined
        const sessionId = awarenessUser?.sessionId ?? `client-${clientId}`
        const deviceId = awarenessUser?.deviceId ?? sessionId
        const baseName = awarenessUser?.name?.trim() || 'Someone'
        const isSelf = deviceId === deviceIdRef.current
        const existing = grouped.get(deviceId)

        if (existing) {
          existing.instanceCount += 1
          if (isSelf) existing.isSelf = true
          continue
        }

        const suffix = baseName.toLowerCase() === 'me' ? ` · ${sessionId.slice(-4)}` : ''
        grouped.set(deviceId, {
          id: deviceId,
          name: `${baseName}${suffix}`,
          isSelf,
          instanceCount: 1,
        })
      }

      if (!grouped.has(deviceIdRef.current)) {
        grouped.set(deviceIdRef.current, {
          id: deviceIdRef.current,
          name: normalizePresenceName(localPresenceName),
          isSelf: true,
          instanceCount: 1,
        })
      }

      const users = Array.from(grouped.values()).sort((left, right) => {
        if (left.isSelf && !right.isSelf) return -1
        if (!left.isSelf && right.isSelf) return 1
        return left.name.localeCompare(right.name)
      })

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
          const detail = event?.error instanceof Error ? event.error.message.trim() : ''
          const message = detail
            ? `Could not reach signaling server ${conn.url}: ${detail}`
            : `Could not reach signaling server ${conn.url}. Peer discovery will not work until signaling is reachable.`
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
          stateRef.current = cloneState(normalizeState(persisted.state))
          updatedAtRef.current = persisted.updatedAt
          setState(cloneState(normalizeState(persisted.state)))
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
          sessionId: sessionIdRef.current,
          deviceId: deviceIdRef.current,
          name: normalizePresenceName(localPresenceName),
        })

        const remoteState = collab.root.get('state') as AppState | undefined
        const remoteUpdatedAt = Number(collab.root.get('updatedAt') ?? 0)
        if (remoteState && remoteUpdatedAt > updatedAtRef.current) {
          applyState(normalizeState(remoteState), remoteUpdatedAt)
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
          collab.provider.awareness.off('change', updatePeers)
          collab.provider.off('status', handleStatus)
          collab.provider.destroy()
          collab.doc.destroy()
          collabRef.current = null
      }
    }
  }, [initialState, realtimeEnabled, roomId])

  useEffect(() => {
    const collab = collabRef.current
    if (collab) {
      collab.provider.awareness.setLocalStateField('user', {
        sessionId: sessionIdRef.current,
        deviceId: deviceIdRef.current,
        name: normalizePresenceName(localPresenceName),
      })
    }
  }, [localPresenceName])

  const updateState = (updater: (previous: AppState) => AppState) => {
    const proposed = normalizeState(updater(cloneState(stateRef.current)))
    const next = archiveStateRemovals(stateRef.current, proposed, 'deleted', 'local')
    const updatedAt = Date.now()
    stateRef.current = next
    updatedAtRef.current = updatedAt
    setState(next)
    void writePersistedState(roomId, next, updatedAt).catch((error) => {
      console.warn('[chores] Failed to persist updated state', error)
    })
    const collab = collabRef.current
    if (collab) {
      collab.provider.awareness.setLocalStateField('user', {
        sessionId: sessionIdRef.current,
        deviceId: deviceIdRef.current,
        name: normalizePresenceName(localPresenceName),
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
