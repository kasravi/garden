# Chores Garden data model v2

This model separates five concerns:

1. shared task identity
2. subjective per-user interpretation
3. shared and personal categorization
4. rule/comfort language
5. execution history and analytics

## 1) Core task model

A task is the shared thing that exists in the room.

```ts
export interface TaskDefinition {
  id: string
  createdBy: UserId
  createdAt: IsoDateTime
  title: string
  definition: string
  desiredFrequency: DesiredFrequency
  archivedAt?: IsoDateTime
}
```

Mandatory fields:
- `title`
- `definition`
- `desiredFrequency`

`definition` should remain human and sentence-friendly.
Example:
- "Wipe kitchen counters so the cooking area stays pleasant."

## 2) Frequency model

Frequency needs to support both simple intervals and calendar-aware schedules.

```ts
export type DesiredFrequency =
  | IntervalFrequency
  | CalendarFrequency

export interface IntervalFrequency {
  kind: 'interval'
  finite: boolean
  every: number
  unit: 'hour' | 'day' | 'week' | 'month'
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

export interface ToleranceWindow {
  early?: DurationSpec
  late?: DurationSpec
}

export interface DurationSpec {
  value: number
  unit: 'minute' | 'hour' | 'day' | 'week'
}
```

Examples:
- every 2 days
- every week
- every first Tuesday of the month
- every last Friday in summer

Recommendation:
- keep the UI sentence-based
- compile the sentence to either `IntervalFrequency` or `CalendarFrequency`
- for `CalendarFrequency`, persist an RRULE-like canonical string

## 3) Subjective task interpretation per user

These properties are not part of the shared task itself.
They are one user's relationship to that task.

```ts
export interface UserTaskProfile {
  id: string
  taskId: TaskId
  userId: UserId
  basis: 'inherited' | 'accepted' | 'overridden'
  importance: Scalar
  grandness: Scalar
  subjectiveTime: Scalar
  focus: Scalar
  notes?: string
  updatedAt: IsoDateTime
}

export type Scalar = number // 0..1
```

Meaning:
- `importance`: how much I care if this drifts from desired frequency
- `grandness`: how psychologically big the task feels
- `subjectiveTime`: how long it feels, not clock time
- `focus`: how much attention it consumes, useful for parallel scheduling

Notes:
- creator provides an initial profile for themselves
- other users can accept those values or override them
- feed/ranking should use `UserTaskProfile`, not shared task defaults

## 4) Categories

Categories have both shared and personal layers.

### Shared category dictionary

```ts
export interface CategoryDefinition {
  id: string
  createdBy: UserId
  createdAt: IsoDateTime
  label: string
  definition?: string
  color?: string
  status: 'active' | 'merged' | 'archived'
  mergedIntoCategoryId?: CategoryId
}
```

### Shared category assignment on a task

```ts
export interface SharedTaskCategoryAssignment {
  id: string
  taskId: TaskId
  categoryId: CategoryId
  assignedBy: UserId
  createdAt: IsoDateTime
}
```

### Personal category assignment on a task

```ts
export interface UserTaskCategoryAssignment {
  id: string
  taskId: TaskId
  userId: UserId
  categoryId: CategoryId
  source: 'accepted-shared' | 'personal' | 'suggested-from-skip'
  createdAt: IsoDateTime
}
```

Result:
- one common category set per task
- one personal category set per user per task

This matches your requirement that users can see others' categories, accept them, or keep their own.

## 5) Rule engine vocabulary

The rule engine should not be free-form code first.
It should be a compiled sentence language.

### Vocabulary primitives

```ts
export interface ConceptDefinition {
  id: string
  scope: 'shared' | 'personal'
  ownerUserId?: UserId
  kind:
    | 'time-of-day'
    | 'day-type'
    | 'season'
    | 'calendar-window'
    | 'work-pattern'
    | 'comfort-state'
    | 'task-trait'
    | 'custom'
  label: string
  definition: ExpressionNode
  examples?: string[]
}
```

Examples:
- `weekend`
- `summer time`
- `after work`
- `wet washing`
- `before guests come`
- `not before lunch`

### Expression tree

```ts
export type ExpressionNode =
  | { type: 'concept-ref'; conceptId: string }
  | { type: 'between-time'; start: string; end: string }
  | { type: 'day-of-week'; values: Array<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'> }
  | { type: 'month-range'; startMonth: number; endMonth: number }
  | { type: 'not'; child: ExpressionNode }
  | { type: 'and'; children: ExpressionNode[] }
  | { type: 'or'; children: ExpressionNode[] }
  | { type: 'after-time'; value: string }
  | { type: 'before-time'; value: string }
  | { type: 'holiday-match'; calendarId?: string }
  | { type: 'category-match'; categoryId: string }
  | { type: 'task-profile-threshold'; field: 'importance'|'grandness'|'subjectiveTime'|'focus'; op: '>='|'<='|'='; value: number }
```

This gives you the sentence-completion UX while keeping a structured backend.

## 6) Shared and personal rules / comfort engine

Rules should exist in two layers:

1. shared rule definitions that other users can browse and adopt
2. user rules that belong to a specific person and drive that person's feed

### Shared rule definitions

```ts
export interface SharedRuleDefinition {
  id: string
  createdBy: UserId
  createdAt: IsoDateTime
  label: string
  description: string
  target: RuleTarget
  condition: ExpressionNode
  effect: RuleEffect
  visibility: 'shared'
}
```

This is how one user says:
- "I made a useful comfort rule. Others may want to add it to their own rule book."

### Adopted / personal user rules

```ts
export interface UserRule {
  id: string
  userId: UserId
  createdAt: IsoDateTime
  enabled: boolean
  priority: number
  source: 'created' | 'adopted' | 'suggested-from-skip'
  sharedRuleId?: RuleId
  kind?: 'prefer' | 'avoid' | 'require' | 'penalize'
  target: RuleTarget
  condition: ExpressionNode
  effect: RuleEffect
  // for older migrations, `kind` may still exist; newer code can infer from effect
}

export type RuleTarget =
  | { type: 'task'; taskId: TaskId }
  | { type: 'category'; categoryId: CategoryId }
  | { type: 'concept'; conceptId: ConceptId }
  | { type: 'all-tasks' }

export interface RuleEffect {
  scoreDelta?: number
  scheduleBias?: number
  preferredWindow?: ExpressionNode
  parallelPenalty?: number
  reviewIfBroken?: boolean
}
```

Example:
- "I prefer wet washing things on weekends"
- compiled as:
  - target: category `wet washing`
  - condition: concept `weekend`
  - effect: positive score on weekends, negative score on weekdays

This now supports your requirement that:
- categories are visible to others
- category-based rules are visible to others
- another user can add that shared rule to their own rule set without being forced to use it

## 7) Review / impossibility detection

When rules and frequency cannot both be satisfied, create an explicit review object.

```ts
export interface TaskReviewFlag {
  id: string
  taskId: TaskId
  userId?: UserId
  createdAt: IsoDateTime
  status: 'open' | 'resolved' | 'dismissed'
  reason:
    | 'frequency-conflict'
    | 'rule-conflict'
    | 'insufficient-window'
    | 'too-many-skips'
    | 'unclear-category'
  explanation: string
  suggestedActions: string[]
}
```

This is better than silently degrading the schedule.

## 8) Task instances and logs

Separate planned opportunities from actual user reports.

```ts
export interface TaskOccurrence {
  id: string
  taskId: TaskId
  userId: UserId
  windowStart: IsoDateTime
  windowEnd: IsoDateTime
  status: 'pending' | 'done' | 'skipped' | 'expired'
  generatedBy: 'scheduler'
  reviewFlagId?: string
}

export interface TaskLogEntry {
  id: string
  occurrenceId?: string
  taskId: TaskId
  userId: UserId
  createdAt: IsoDateTime
  action: 'done' | 'skip' | 'snooze' | 'note'
  mood?: number
  note?: string
}
```

## 9) Skip intelligence model

Skip should open a learning flow.

```ts
export interface SkipReflection {
  id: string
  logEntryId: string
  userId: UserId
  scope: 'this-task' | 'this-kind-of-task' | 'this-time-window' | 'today-only'
  selectedCategoryIds: CategoryId[]
  newCategoryLabel?: string
  comfortRuleDraft?: UserRule
  comment?: string
}
```

Flow:
1. user skips
2. ask whether problem is:
   - this task
   - this kind of task
   - this time/window
   - today only
3. if kind-of-task, show existing personal/shared categories
4. let them accept one or create one
5. generate a rule draft sentence from the answer

## 10) Analytics model

Analytics should focus on growth, drift, and browseable qualitative context.

```ts
export interface TaskAnalyticsSnapshot {
  taskId: TaskId
  userId: UserId
  completionRate: number
  skipRate: number
  driftScore: number
  growthScore: number
  burdenScore: number
  reviewStatus: 'healthy' | 'watch' | 'needs-review'
  lastCalculatedAt: IsoDateTime
}
```

Derived views:
- done vs skipped trend
- growth curve
- note timeline
- mood timeline
- rule conflict count
- categories most correlated with skipping

## 11) Suggested app state shape

```ts
export interface AppStateV2 {
  space: SpaceMeta
  users: UserProfile[]
  tasks: TaskDefinition[]
  userTaskProfiles: UserTaskProfile[]
  categories: CategoryDefinition[]
  sharedTaskCategoryAssignments: SharedTaskCategoryAssignment[]
  userTaskCategoryAssignments: UserTaskCategoryAssignment[]
  concepts: ConceptDefinition[]
  userRules: UserRule[]
  occurrences: TaskOccurrence[]
  logs: TaskLogEntry[]
  skipReflections: SkipReflection[]
  reviewFlags: TaskReviewFlag[]
  selectedUserId: UserId
}

export interface UserProfile {
  id: string
  name: string
  timezone: string
  locale?: string
}

export interface SpaceMeta {
  title: string
  roomId: string
}

export type UserId = string
export type TaskId = string
export type CategoryId = string
export type ConceptId = string
export type IsoDateTime = string
```

## 12) Important modeling decisions

### Shared vs personal
- `TaskDefinition` is shared
- `UserTaskProfile` is personal
- `SharedTaskCategoryAssignment` is shared
- `UserTaskCategoryAssignment` is personal
- `ConceptDefinition` can be shared or personal
- `SharedRuleDefinition` is shared and discoverable by everyone
- `UserRule` is personal

### Sentence-first UX
The UI can remain sentence completion everywhere.
But the stored data should be compiled into structured objects.

### Frequency storage
Use canonical machine-readable frequency storage, not only prose.
The sentence is for UX; the rule object is for scheduling.

### Notes and mood
Do not store these on the task.
Store them on log entries so analytics stays chronological.

## 13) Migration from current model

Current model is too small for your clarified requirements.
Main migration path:

- `WishTemplate` -> `TaskDefinition`
- `PersonalWish` -> `UserTaskProfile` + possibly `TaskOccurrence` preferences
- `CommonConcept` -> `ConceptDefinition`
- `TaskAction` -> `TaskLogEntry`
- add entirely new layers for:
  - categories
  - rules
  - occurrences
  - skip reflections
  - review flags

## 14) Recommendation for implementation order

1. refactor core types to `TaskDefinition`, `UserTaskProfile`, `CategoryDefinition`, `TaskLogEntry`
2. add `DesiredFrequency` with `interval` and `calendar`
3. add shared/personal category assignment layers
4. add `ConceptDefinition` + `ExpressionNode`
5. add `UserRule`
6. add `TaskOccurrence` and `TaskReviewFlag`
7. add skip reflection flow
8. add analytics projections

---

Short version:
- task = shared identity
- task profile = subjective user interpretation
- categories = both shared and personal
- concepts = vocabulary for sentence building
- rules = personal comfort engine
- occurrences/logs = history and analytics
- review flags = explicit unresolved conflicts
