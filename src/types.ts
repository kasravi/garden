export type UserId = string
export type TaskId = string
export type CategoryId = string
export type ConceptId = string
export type RuleId = string
export type IsoDateTime = string

export type CadenceUnit = 'hour' | 'day' | 'week' | 'month'
export type DayGroup = 'weekdays' | 'weekends' | 'any day'
export type Scalar = number
export type RuleTargetType = 'task' | 'category' | 'concept' | 'all-tasks'
export type WorkMode = 'away' | 'home' | 'hybrid'

export type ConceptKind =
  | 'timeframe'
  | 'season'
  | 'mood'
  | 'energy'
  | 'life-context'
  | 'social-pattern'
  | 'time-of-day'
  | 'day-type'
  | 'calendar-window'
  | 'work-pattern'
  | 'comfort-state'
  | 'task-trait'
  | 'custom'

export interface TimePreference {
  dayGroup: DayGroup
  start: string
  end: string
}

export interface AvailabilityProfile {
  weekdays: TimePreference
  weekends: TimePreference
}

export interface DurationSpec {
  value: number
  unit: 'minute' | 'hour' | 'day' | 'week'
}

export interface ToleranceWindow {
  early?: DurationSpec
  late?: DurationSpec
}

export interface IntervalFrequency {
  kind: 'interval'
  finite: boolean
  every: number
  unit: CadenceUnit
  tolerance?: ToleranceWindow
  startsAt?: IsoDateTime
  endsAt?: IsoDateTime
  maxOccurrences?: number
}

export interface CalendarFrequency {
  kind: 'calendar'
  finite: boolean
  rruleText: string
  timezone: string
  tolerance?: ToleranceWindow
  startsAt?: IsoDateTime
  endsAt?: IsoDateTime
  maxOccurrences?: number
}

export type DesiredFrequency = IntervalFrequency | CalendarFrequency

export type ExpressionNode =
  | { type: 'concept-ref'; conceptId: ConceptId }
  | { type: 'between-time'; start: string; end: string }
  | { type: 'day-of-week'; values: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> }
  | { type: 'month-range'; startMonth: number; endMonth: number }
  | { type: 'not'; child: ExpressionNode }
  | { type: 'and'; children: ExpressionNode[] }
  | { type: 'or'; children: ExpressionNode[] }
  | { type: 'after-time'; value: string }
  | { type: 'before-time'; value: string }
  | { type: 'holiday-match'; calendarId?: string }
  | { type: 'category-match'; categoryId: CategoryId }
  | {
      type: 'task-profile-threshold'
      field: 'importance' | 'grandness' | 'subjectiveTime' | 'focus'
      op: '>=' | '<=' | '='
      value: number
    }
  | {
      type: 'primitive-clause'
      primitive: string
      operator: '=' | '>' | '<' | '>=' | '<=' | 'in'
      fuzzy: boolean
      value: string
      negated?: boolean
    }

export interface ConceptDefinition {
  id: ConceptId
  scope: 'shared' | 'personal'
  ownerUserId?: UserId
  kind: ConceptKind
  label: string
  description: string
  definition?: ExpressionNode
  examples: string[]
}

export interface UserConceptDefinition {
  id: string
  userId: UserId
  conceptId: ConceptId
  label: string
  notes: string
  intensity: Scalar
  updatedAt: IsoDateTime
}

export interface TaskDefinition {
  id: TaskId
  createdBy: UserId
  createdAt: IsoDateTime
  title: string
  definition: string
  desiredFrequency: DesiredFrequency
  defaultSubjectiveProfile: {
    importance: Scalar
    grandness: Scalar
    subjectiveTime: Scalar
    focus: Scalar
  }
  sharedConceptIds: ConceptId[]
  sharedContextLinks?: Array<{
    conceptId: ConceptId
    qualifier: string
  }>
  defaultTimePreference?: TimePreference
  archivedAt?: IsoDateTime
  sourceTaskId?: string
}

export interface UserProfile {
  id: UserId
  name: string
  timezone: string
  locale?: string
  weekStartsOn?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  workingHours: TimePreference
  availability: AvailabilityProfile
  workMode: WorkMode
  isHomeNow: boolean
  allowWorkdayMicroTasks: boolean
  homeWifiNames: string[]
  tirednessSensitivity: Scalar
  recoveryPerHour: Scalar
  forgiveness: Scalar
  difficultyBias: Scalar
}

export interface UserTaskProfile {
  id: string
  taskId: TaskId
  userId: UserId
  basis: 'created' | 'accepted' | 'overridden'
  active: boolean
  importance: Scalar
  grandness: Scalar
  subjectiveTime: Scalar
  focus: Scalar
  preferredTime?: TimePreference
  notes: string
  updatedAt: IsoDateTime
}

export interface CategoryDefinition {
  id: CategoryId
  createdBy: UserId
  createdAt: IsoDateTime
  label: string
  definition?: string
  color?: string
  status: 'active' | 'merged' | 'archived'
  mergedIntoCategoryId?: CategoryId
}

export interface SharedTaskCategoryAssignment {
  id: string
  taskId: TaskId
  categoryId: CategoryId
  assignedBy: UserId
  createdAt: IsoDateTime
}

export interface UserTaskCategoryAssignment {
  id: string
  taskId: TaskId
  userId: UserId
  categoryId: CategoryId
  source: 'accepted-shared' | 'personal' | 'suggested-from-skip' | 'adopted-from-other-user'
  createdAt: IsoDateTime
}

export interface RuleTarget {
  type: RuleTargetType
  taskId?: TaskId
  categoryId?: CategoryId
  conceptId?: ConceptId
}

export interface RuleEffect {
  scoreDelta?: number
  scheduleBias?: number
  preferredWindow?: ExpressionNode
  parallelPenalty?: number
  reviewIfBroken?: boolean
}

export interface SharedRuleDefinition {
  id: RuleId
  createdBy: UserId
  createdAt: IsoDateTime
  label: string
  description: string
  target: RuleTarget
  condition: ExpressionNode
  effect: RuleEffect
  visibility: 'shared'
}

export interface UserRule {
  id: RuleId
  userId: UserId
  createdAt: IsoDateTime
  enabled: boolean
  priority: number
  source: 'created' | 'adopted' | 'suggested-from-skip'
  sharedRuleId?: RuleId
  label: string
  description: string
  target: RuleTarget
  condition: ExpressionNode
  effect: RuleEffect
}

export type TaskActionKind = 'done' | 'skip' | 'snooze' | 'note'

export interface TaskLogEntry {
  id: string
  userTaskProfileId: string
  taskId: TaskId
  userId: UserId
  action: TaskActionKind
  createdAt: IsoDateTime
  mood?: number
  note?: string
}

export type ArchiveEntityType =
  | 'concept'
  | 'user'
  | 'userConceptDefinition'
  | 'task'
  | 'userTaskProfile'
  | 'category'
  | 'sharedTaskCategory'
  | 'userTaskCategory'
  | 'sharedRule'
  | 'userRule'
  | 'log'

export type ArchiveReason = 'deleted' | 'sync-removed'

export interface ArchiveEntry {
  id: string
  entityType: ArchiveEntityType
  entityId: string
  archivedAt: IsoDateTime
  reason: ArchiveReason
  source: 'local' | 'remote'
  summary: string
  snapshot: unknown
}

export interface SpaceMeta {
  title: string
  roomId: string
}

export interface AppState {
  space: SpaceMeta
  concepts: ConceptDefinition[]
  users: UserProfile[]
  userConceptDefinitions: UserConceptDefinition[]
  tasks: TaskDefinition[]
  userTaskProfiles: UserTaskProfile[]
  categories: CategoryDefinition[]
  sharedTaskCategories: SharedTaskCategoryAssignment[]
  userTaskCategories: UserTaskCategoryAssignment[]
  sharedRules: SharedRuleDefinition[]
  userRules: UserRule[]
  logs: TaskLogEntry[]
  archives: ArchiveEntry[]
  selectedUserId: UserId
}

export interface FeedCard {
  userTaskProfile: UserTaskProfile
  task: TaskDefinition
  user: UserProfile
  dueScore: number
  contextScore: number
  fatigue: number
  compassion: number
  relevance: number
  health: number
  healthTone: 'green' | 'amber' | 'red'
  lastAction?: TaskLogEntry
  lastDoneAt?: string
  lastSkipAt?: string
  suggestedMood?: string
  categoryLabels: string[]
  adoptedRuleLabels: string[]
}

export interface TaskHealth {
  userTaskProfile: UserTaskProfile
  task: TaskDefinition
  user: UserProfile
  health: number
  tone: 'green' | 'amber' | 'red'
  completionRate: number
  skipRate: number
  fatigue: number
  duePressure: number
  suggestion: string
}

export type CommonConcept = ConceptDefinition
export type PersonProfile = UserProfile
export type PersonalDefinition = UserConceptDefinition
export type WishTemplate = TaskDefinition
export type PersonalWish = UserTaskProfile
export type TaskAction = TaskLogEntry
export type WishHealth = TaskHealth
