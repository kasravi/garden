import type {
  AppState,
  ArchiveEntry,
  ArchiveEntityType,
  ArchiveReason,
  CategoryDefinition,
  ConceptDefinition,
  SharedRuleDefinition,
  SharedTaskCategoryAssignment,
  TaskDefinition,
  TaskLogEntry,
  UserConceptDefinition,
  UserProfile,
  UserRule,
  UserTaskCategoryAssignment,
  UserTaskProfile,
} from './types'

type CollectionKey =
  | 'concepts'
  | 'users'
  | 'userConceptDefinitions'
  | 'tasks'
  | 'userTaskProfiles'
  | 'categories'
  | 'sharedTaskCategories'
  | 'userTaskCategories'
  | 'sharedRules'
  | 'userRules'
  | 'logs'

type ArchivableEntity =
  | ConceptDefinition
  | UserProfile
  | UserConceptDefinition
  | TaskDefinition
  | UserTaskProfile
  | CategoryDefinition
  | SharedTaskCategoryAssignment
  | UserTaskCategoryAssignment
  | SharedRuleDefinition
  | UserRule
  | TaskLogEntry

const COLLECTION_TYPES: Array<{ key: CollectionKey; entityType: ArchiveEntityType }> = [
  { key: 'concepts', entityType: 'concept' },
  { key: 'users', entityType: 'user' },
  { key: 'userConceptDefinitions', entityType: 'userConceptDefinition' },
  { key: 'tasks', entityType: 'task' },
  { key: 'userTaskProfiles', entityType: 'userTaskProfile' },
  { key: 'categories', entityType: 'category' },
  { key: 'sharedTaskCategories', entityType: 'sharedTaskCategory' },
  { key: 'userTaskCategories', entityType: 'userTaskCategory' },
  { key: 'sharedRules', entityType: 'sharedRule' },
  { key: 'userRules', entityType: 'userRule' },
  { key: 'logs', entityType: 'log' },
]

function archiveSummary(entityType: ArchiveEntityType, entity: ArchivableEntity): string {
  switch (entityType) {
    case 'task':
      return (entity as TaskDefinition).title || 'Untitled task'
    case 'category':
      return (entity as CategoryDefinition).label || 'Unnamed category'
    case 'concept':
      return (entity as ConceptDefinition).label || 'Unnamed concept'
    case 'user':
      return (entity as UserProfile).name || 'Unnamed person'
    case 'sharedRule':
    case 'userRule':
      return (entity as SharedRuleDefinition | UserRule).label || 'Unnamed rule'
    case 'userTaskProfile':
      return `Task profile ${(entity as UserTaskProfile).id}`
    case 'sharedTaskCategory':
      return `Shared task-category link ${(entity as SharedTaskCategoryAssignment).id}`
    case 'userTaskCategory':
      return `Personal task-category link ${(entity as UserTaskCategoryAssignment).id}`
    case 'userConceptDefinition':
      return (entity as UserConceptDefinition).label || 'Personal concept override'
    case 'log':
      return `${(entity as TaskLogEntry).action} log ${(entity as TaskLogEntry).id}`
    default:
      return `${entityType} ${(entity as { id: string }).id}`
  }
}

function mergeArchives(base: ArchiveEntry[], added: ArchiveEntry[]): ArchiveEntry[] {
  const merged = [...base]
  const existingByKey = new Set(merged.map((entry) => `${entry.entityType}:${entry.entityId}`))
  for (const entry of added) {
    const key = `${entry.entityType}:${entry.entityId}`
    if (existingByKey.has(key)) continue
    merged.push(entry)
    existingByKey.add(key)
  }
  return normalizeArchives(merged)
}

function normalizeArchives(entries: ArchiveEntry[]): ArchiveEntry[] {
  const sorted = [...entries].sort((left, right) => new Date(right.archivedAt).getTime() - new Date(left.archivedAt).getTime())
  const seen = new Set<string>()
  return sorted.filter((entry) => {
    const key = `${entry.entityType}:${entry.entityId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeState(state: AppState): AppState {
  return {
    ...state,
    archives: normalizeArchives(Array.isArray(state.archives) ? state.archives : []),
  }
}

export function archiveStateRemovals(previous: AppState, next: AppState, reason: ArchiveReason, source: 'local' | 'remote'): AppState {
  const normalizedPrevious = normalizeState(previous)
  const normalizedNext = normalizeState(next)
  const archivedAt = new Date().toISOString()
  const newArchiveEntries: ArchiveEntry[] = []

  for (const { key, entityType } of COLLECTION_TYPES) {
    const previousItems = normalizedPrevious[key] as Array<ArchivableEntity>
    const nextItems = normalizedNext[key] as Array<ArchivableEntity>
    const nextIds = new Set(nextItems.map((item) => item.id))

    for (const item of previousItems) {
      if (nextIds.has(item.id)) continue
      newArchiveEntries.push({
        id: crypto.randomUUID(),
        entityType,
        entityId: item.id,
        archivedAt,
        reason,
        source,
        summary: archiveSummary(entityType, item),
        snapshot: JSON.parse(JSON.stringify(item)) as unknown,
      })
    }
  }

  const archiveBase = source === 'remote' && normalizedNext.archives.length === 0 && normalizedPrevious.archives.length > 0
    ? normalizedPrevious.archives
    : normalizedNext.archives

  return {
    ...normalizedNext,
    archives: mergeArchives(archiveBase, newArchiveEntries),
  }
}
