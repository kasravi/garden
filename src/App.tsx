import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import {
  BASE_TIMEFRAME_OPTIONS,
  CADENCE_OPTIONS,
  COUNT_OPTIONS,
  DEFAULT_SUBJECTIVE_VALUES,
  DISCOMFORT_OPTIONS,
  FOCUS_OPTIONS,
  FREQUENCY_COUNT_OPTIONS,
  FREQUENCY_STARTER_OPTIONS,
  GRANDNESS_OPTIONS,
  IMPORTANCE_OPTIONS,
  NONE_ONLY_TIMEFRAME_IDS,
  ONE_TIME_FRAME_OPTIONS,
  SENTENCE_INLINE_SPINNER_CLASS,
  SKIP_SCOPE_OPTIONS,
  SUBJECTIVE_CATEGORY_ORDER,
  SUBJECTIVE_DEFAULT_CHOICES,
  SUBJECTIVE_OPTIONS_BY_CATEGORY,
  SUBJECTIVE_TIME_OPTIONS,
  SYSTEM_PRIMITIVES,
  TASK_SENTENCE_MODE_OPTIONS,
  TIMEFRAME_QUALIFIER_OPTIONS,
  TIMING_OPTIONS,
  WINDOW_PRESETS,
  defaultPersonDraft,
  defaultTaskDraft,
  exampleTaskDraft,
  getLocalProfileName,
  operatorsForPrimitive,
  setStoredLocalProfileName,
  type ComposerChoiceOption,
  type CountOption,
  type FrequencyCountOption,
  type FrequencyStarterOption,
  type OneTimeFrameOption,
  type PersonDraft,
  type SkipScope,
  type SubjectiveCategory,
  type SubjectiveChoiceOption,
  type TaskCadenceOption,
  type TaskSentenceDraft,
  type TaskSentenceModeOption,
  type TimeframeOption,
  type TimeframeQualifierOption,
  type WindowPresetOption,
} from './app-config'
import { formatCadence, getFeedCards, getWishHealth, MOOD_EMOJIS, timeAgo, toneLabel } from './engine'
import { CONCEPT_KIND_LABELS } from './ontology'
import { getRoomId, roomIdFromGardenCode, useCollaborativeState } from './collab.ts'
import { createInitialState } from './seed'
import { SentenceSpinner } from './components/SentenceSpinner'
import type {
  AppState,
  ArchiveEntry,
  CadenceUnit,
  CategoryDefinition,
  CommonConcept,
  DayGroup,
  ExpressionNode,
  SharedRuleDefinition,
  SharedTaskCategoryAssignment,
  TaskAction,
  TaskDefinition,
  TaskLogEntry,
  UserProfile,
  UserRule,
  UserTaskCategoryAssignment,
  UserTaskProfile,
  WorkMode,
} from './types'

type MenuSection = 'analytics' | 'sharing' | 'language' | 'heuristics' | 'archives' | 'settings'
type ScalarField = 'importance' | 'grandness' | 'subjectiveTime' | 'focus'
type TaskComposerOptionalPath = 'details' | 'categories' | 'context' | null
type TaskComposerStepId = 'name' | 'cadence' | 'importance' | 'grandness' | 'time' | 'focus' | 'timing' | 'window' | 'review'
type TaskComposerUiStepId = 'name' | 'mode' | 'frequency-starter' | 'frequency-count' | 'count' | 'timeframe' | 'timeframe-qualifier' | 'details' | 'importance' | 'difficulty' | 'time' | 'focus' | 'timing' | 'window' | 'category' | 'context'
type TaskAdjustmentUiStepId = 'summary' | 'title' | 'mode' | 'frequency-starter' | 'frequency-count' | 'count' | 'timeframe' | 'timeframe-qualifier' | 'importance' | 'difficulty' | 'time' | 'focus' | 'category' | 'context' | 'notes'
const ADJUSTMENT_DESCRIPTION_STEPS: TaskAdjustmentUiStepId[] = ['title', 'mode', 'frequency-starter', 'frequency-count', 'count', 'timeframe', 'timeframe-qualifier']
const ADJUSTMENT_DETAIL_STEPS: TaskAdjustmentUiStepId[] = ['importance', 'difficulty', 'time', 'focus']

interface TaskAdjustmentState {
  userTaskProfileId: string
  taskId: string
  title: string
  sentenceMode: TaskSentenceModeOption['id']
  frequencyCount: FrequencyCountOption['id']
  frequencyStarter: FrequencyStarterOption['id']
  countChoice: CountOption['id']
  timeframeQualifier: TimeframeQualifierOption['id']
  timeframe: TimeframeOption['id']
  importance: string
  grandness: string
  subjectiveTime: string
  focus: string
  selectedCategoryIds: string[]
  preferredContexts: Array<{ conceptId: string; qualifier: string }>
  contextConnector: 'and' | 'or'
  notes: string
}

interface ConceptDraft {
  label: string
  kind: CommonConcept['kind']
  description: string
  examples: string
  clauses: ExpressionClause[]
  connector: 'and' | 'or'
}

interface ExpressionClause {
  id: string
  primitive: string
  operator: '=' | '>' | '<' | '>=' | '<=' | 'in'
  fuzzy: boolean
  value: string
  negated: boolean
}

interface DefinitionDraft {
  conceptId: string
  label: string
  notes: string
  intensity: number
}

interface DoneFlowState {
  userTaskProfileId: string
  logId: string
  mood?: number
  note: string
}

interface ToastState {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

type SentenceCaretPart = 'name' | 'mode' | 'count' | 'one-time-frame' | 'frequency-count' | 'frequency-starter' | 'timeframe-qualifier' | 'timeframe'
type SkipSentenceCaret = 'scope' | 'discomfort' | 'category' | 'specifier' | 'concept'
type SkipUiStep = 'scope' | 'questions' | 'why' | 'categories' | 'when'

interface SkipFlowState {
  userTaskProfileId: string
  logId: string
  scope: SkipScope
  discomfort: string
  categoryIds: string[]
  categoryCursorId: string
  newCategoryLabel: string
  contextSpecifier: string
  conceptId: string
  extraNote: string
}

function clauseToText(clause: ExpressionClause): string {
  const prim = SYSTEM_PRIMITIVES.find((p) => p.id === clause.primitive)
  const prefix = clause.negated ? 'NOT ' : ''
  const fuzzyMark = clause.fuzzy ? '~' : ''
  return `${prefix}${prim?.label ?? clause.primitive} ${clause.operator}${fuzzyMark} ${clause.value}`
}

function clausesToExpressionNode(clauses: ExpressionClause[], connector: 'and' | 'or'): import('./types').ExpressionNode | undefined {
  if (clauses.length === 0) return undefined
  const nodes: import('./types').ExpressionNode[] = clauses.map((clause) => {
    const node: import('./types').ExpressionNode = {
      type: 'primitive-clause',
      primitive: clause.primitive,
      operator: clause.operator,
      fuzzy: clause.fuzzy,
      value: clause.value,
      negated: clause.negated,
    }
    return clause.negated ? { type: 'not', child: { ...node, negated: false } } : node
  })
  if (nodes.length === 1) return nodes[0]
  return connector === 'and' ? { type: 'and', children: nodes } : { type: 'or', children: nodes }
}

function singleNodeToClauses(node: import('./types').ExpressionNode): ExpressionClause[] {
  if (node.type === 'primitive-clause') {
    return [{ id: crypto.randomUUID(), primitive: node.primitive, operator: node.operator, fuzzy: node.fuzzy, value: node.value, negated: node.negated ?? false }]
  }
  if (node.type === 'day-of-week') {
    return [{ id: crypto.randomUUID(), primitive: 'wday', operator: 'in', fuzzy: false, value: node.values.join(','), negated: false }]
  }
  if (node.type === 'between-time') {
    return [
      { id: crypto.randomUUID(), primitive: 'tod', operator: '>=', fuzzy: false, value: node.start, negated: false },
      { id: crypto.randomUUID(), primitive: 'tod', operator: '<=', fuzzy: false, value: node.end, negated: false },
    ]
  }
  if (node.type === 'after-time') {
    return [{ id: crypto.randomUUID(), primitive: 'tod', operator: '>=', fuzzy: false, value: node.value, negated: false }]
  }
  if (node.type === 'before-time') {
    return [{ id: crypto.randomUUID(), primitive: 'tod', operator: '<=', fuzzy: false, value: node.value, negated: false }]
  }
  if (node.type === 'month-range') {
    return [
      { id: crypto.randomUUID(), primitive: 'month', operator: '>=', fuzzy: false, value: String(node.startMonth), negated: false },
      { id: crypto.randomUUID(), primitive: 'month', operator: '<=', fuzzy: false, value: String(node.endMonth), negated: false },
    ]
  }
  if (node.type === 'holiday-match') {
    return [{ id: crypto.randomUUID(), primitive: 'holiday', operator: '=', fuzzy: false, value: 'true', negated: false }]
  }
  if (node.type === 'not') {
    const inner = singleNodeToClauses(node.child)
    return inner.map((c) => ({ ...c, negated: true }))
  }
  return []
}

function expressionNodeToClauses(node: import('./types').ExpressionNode | undefined): { clauses: ExpressionClause[]; connector: 'and' | 'or' } {
  if (!node) return { clauses: [], connector: 'and' }
  if (node.type === 'and' || node.type === 'or') {
    const clauses: ExpressionClause[] = node.children.flatMap((child) => singleNodeToClauses(child))
    return { clauses, connector: node.type }
  }
  return { clauses: singleNodeToClauses(node), connector: 'and' }
}

function taskComposerSteps(draft: TaskSentenceDraft): TaskComposerStepId[] {
  return draft.timeSensitive
    ? ['name', 'cadence', 'importance', 'grandness', 'time', 'focus', 'timing', 'window', 'review']
    : ['name', 'cadence', 'importance', 'grandness', 'time', 'focus', 'timing', 'review']
}

function cadenceKey(every: number, unit: CadenceUnit): string {
  return `${every}-${unit}`
}

function findCadenceOption(draft: TaskSentenceDraft): TaskCadenceOption {
  return CADENCE_OPTIONS.find((option) => option.every === draft.every && option.unit === draft.unit) ?? CADENCE_OPTIONS[3]
}

function findWindowPreset(draft: TaskSentenceDraft): WindowPresetOption {
  return WINDOW_PRESETS.find((option) => option.dayGroup === draft.dayGroup && option.start === draft.start && option.end === draft.end) ?? WINDOW_PRESETS[2]
}

function taskPreviewSentence(draft: TaskSentenceDraft): string {
  const cadence = findCadenceOption(draft)
  const timing = draft.timeSensitive ? `${findWindowPreset(draft).sentence}` : 'when it best fits my normal capacity'
  return `I want to ${draft.actionText || '…'} ${cadence.sentence}. It matters ${selectLabel(IMPORTANCE_OPTIONS, draft.importance)}, feels ${selectLabel(GRANDNESS_OPTIONS, draft.grandness)}, takes ${selectLabel(SUBJECTIVE_TIME_OPTIONS, draft.subjectiveTime)}, needs ${selectLabel(FOCUS_OPTIONS, draft.focus)} focus, and should happen ${timing}.`
}

function rotateIndex(current: number, length: number, delta: number): number {
  if (!length) return 0
  return (current + delta + length) % length
}

function buildTaskWheelOptions(step: TaskComposerStepId): Array<ComposerChoiceOption<number | boolean> | TaskCadenceOption | WindowPresetOption> {
  if (step === 'cadence') return CADENCE_OPTIONS
  if (step === 'importance') return IMPORTANCE_OPTIONS.map((option) => ({ ...option, sentence: option.label, hint: 'How much it matters when it drifts.' }))
  if (step === 'grandness') return GRANDNESS_OPTIONS.map((option) => ({ ...option, sentence: option.label, hint: 'How big the task feels from the inside.' }))
  if (step === 'time') return SUBJECTIVE_TIME_OPTIONS.map((option) => ({ ...option, sentence: option.label, hint: 'Your personal sense of duration.' }))
  if (step === 'focus') return FOCUS_OPTIONS.map((option) => ({ ...option, sentence: option.label, hint: 'How much attention it asks for.' }))
  if (step === 'timing') return TIMING_OPTIONS
  if (step === 'window') return WINDOW_PRESETS
  return []
}

function taskAdjustmentFromState(state: AppState, userTaskProfileId: string): TaskAdjustmentState | null {
  const profile = state.userTaskProfiles.find((entry) => entry.id === userTaskProfileId)
  if (!profile) return null
  const task = state.tasks.find((entry) => entry.id === profile.taskId)
  if (!task) return null

  const categoryIds = [...new Set([
    ...state.sharedTaskCategories.filter((entry) => entry.taskId === task.id).map((entry) => entry.categoryId),
    ...state.userTaskCategories.filter((entry) => entry.userId === profile.userId && entry.taskId === task.id).map((entry) => entry.categoryId),
  ])]
  const freq = task.desiredFrequency

  // Determine sentence mode from stored frequency
  const every = freq.kind === 'interval' ? freq.every : 1
  const unit = freq.kind === 'interval' ? freq.unit : 'week'
  // Default to 'every' for interval tasks, but detect 'at-one-point' if finite with maxOccurrences === 1
  let sentenceMode: TaskSentenceModeOption['id'] = 'every'
  if (freq.finite && freq.maxOccurrences === 1) sentenceMode = 'one-time'
  else if (freq.finite && !freq.maxOccurrences) sentenceMode = 'at-one-point'

  const frequencyCount = FREQUENCY_COUNT_OPTIONS.find((o) => o.id === String(every))?.id ?? '1'
  const frequencyStarter = FREQUENCY_STARTER_OPTIONS.find((o) => o.id === unit)?.id ?? 'day'

  // Find closest subjective choice by value
  function closestChoice(category: SubjectiveCategory, value: number): string {
    const options = SUBJECTIVE_OPTIONS_BY_CATEGORY[category]
    let best = options[0]
    let bestDist = Math.abs(options[0].value - value)
    for (let i = 1; i < options.length; i++) {
      const dist = Math.abs(options[i].value - value)
      if (dist < bestDist) { best = options[i]; bestDist = dist }
    }
    return best.id
  }

  return {
    userTaskProfileId,
    taskId: task.id,
    title: task.title,
    sentenceMode,
    frequencyCount,
    frequencyStarter,
    countChoice: '1',
    timeframeQualifier: 'none',
    timeframe: 'in-general',
    importance: closestChoice('importance', profile.importance),
    grandness: closestChoice('difficulty', profile.grandness),
    subjectiveTime: closestChoice('time', profile.subjectiveTime),
    focus: closestChoice('focus', profile.focus),
    selectedCategoryIds: categoryIds,
    preferredContexts: task.sharedContextLinks?.length
      ? task.sharedContextLinks.map((entry) => ({ conceptId: entry.conceptId, qualifier: entry.qualifier }))
      : (task.sharedConceptIds ?? []).map((id) => ({ conceptId: id, qualifier: 'during' })),
    contextConnector: 'and',
    notes: profile.notes,
  }
}

function personDraftFromUser(user: AppState['users'][number]): PersonDraft {
  return {
    name: user.name,
    weekStartsOn: user.weekStartsOn || 'mon',
    workStart: user.workingHours.start,
    workEnd: user.workingHours.end,
    weekdayAvailableStart: user.availability.weekdays.start,
    weekdayAvailableEnd: user.availability.weekdays.end,
    weekendAvailableStart: user.availability.weekends.start,
    weekendAvailableEnd: user.availability.weekends.end,
    workMode: user.workMode,
    isHomeNow: user.isHomeNow,
    allowWorkdayMicroTasks: user.allowWorkdayMicroTasks,
    homeWifiNames: user.homeWifiNames.join(', '),
    forgiveness: user.forgiveness,
    tirednessSensitivity: user.tirednessSensitivity,
    recoveryPerHour: user.recoveryPerHour,
    difficultyBias: user.difficultyBias,
  }
}

function personDraftFromUserWithLocalName(user: AppState['users'][number], localName: string): PersonDraft {
  return {
    ...personDraftFromUser(user),
    name: localName,
  }
}

function defaultConceptDraft(): ConceptDraft {
  return {
    label: '',
    kind: 'timeframe',
    description: '',
    examples: '',
    clauses: [],
    connector: 'and',
  }
}

function defaultDefinitionDraft(conceptId = ''): DefinitionDraft {
  return {
    conceptId,
    label: '',
    notes: '',
    intensity: 0.6,
  }
}

function defaultSkipFlow(userTaskProfileId: string, logId: string): SkipFlowState {
  return {
    userTaskProfileId,
    logId,
    scope: 'today-only',
    discomfort: 'too draining',
    categoryIds: [],
    categoryCursorId: '',
    newCategoryLabel: '',
    contextSpecifier: 'during',
    conceptId: '',
    extraNote: '',
  }
}

function capitalize(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function selectLabel(options: Array<{ value: number; label: string }>, value: number): string {
  const closest = [...options].sort((left, right) => Math.abs(left.value - value) - Math.abs(right.value - value))[0]
  return closest?.label ?? String(value)
}

function labelForConceptIds(state: AppState, ids: string[]): string {
  const map = new Map(state.concepts.filter((concept) => concept.scope === 'shared').map((concept) => [concept.id, concept.label]))
  return ids.map((id) => map.get(id)).filter(Boolean).join(' · ')
}

function sentenceTitle(actionText: string): string {
  return capitalize(actionText || 'Untitled task')
}

function archiveEntityLabel(entry: ArchiveEntry): string {
  switch (entry.entityType) {
    case 'task':
      return 'Task'
    case 'category':
      return 'Category'
    case 'concept':
      return 'Concept'
    case 'user':
      return 'Profile'
    case 'userTaskProfile':
      return 'Task profile'
    case 'userConceptDefinition':
      return 'Personal concept'
    case 'sharedTaskCategory':
      return 'Shared category link'
    case 'userTaskCategory':
      return 'Personal category link'
    case 'sharedRule':
      return 'Shared rule'
    case 'userRule':
      return 'Rule'
    case 'log':
      return 'Log'
    default:
      return 'Item'
  }
}

function archiveSnapshotPreview(entry: ArchiveEntry): string {
  const snapshot = entry.snapshot as Record<string, unknown> | null
  if (!snapshot || typeof snapshot !== 'object') return 'Snapshot saved.'
  if (typeof snapshot.definition === 'string' && snapshot.definition.trim()) return snapshot.definition.trim()
  if (typeof snapshot.description === 'string' && snapshot.description.trim()) return snapshot.description.trim()
  if (typeof snapshot.notes === 'string' && snapshot.notes.trim()) return snapshot.notes.trim()
  if (typeof snapshot.note === 'string' && snapshot.note.trim()) return snapshot.note.trim()
  if (typeof snapshot.label === 'string' && snapshot.label.trim() && snapshot.label !== entry.summary) return snapshot.label.trim()
  if (typeof snapshot.action === 'string') return `Action: ${snapshot.action}`
  return 'Snapshot saved.'
}

function archiveEntryTaskId(entry: ArchiveEntry): string | null {
  const snapshot = entry.snapshot as Record<string, unknown> | null
  if (entry.entityType === 'task') {
    return typeof snapshot?.id === 'string' ? snapshot.id : entry.entityId
  }
  if (snapshot && typeof snapshot.taskId === 'string') {
    return snapshot.taskId
  }
  return null
}

function archiveRelatedSummary(entries: ArchiveEntry[]): string {
  if (entries.length === 0) return ''
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const label = archiveEntityLabel(entry)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([label, count]) => `${count} ${label}${count > 1 ? 's' : ''}`)
    .join(' · ')
}

function capacitySummary(state: AppState['users'][number] | undefined): string {
  if (!state) return ''
  return `weekdays ${state.availability.weekdays.start}-${state.availability.weekdays.end} · weekends/holidays ${state.availability.weekends.start}-${state.availability.weekends.end}`
}

function allowedTimeframeQualifiers(timeframeId: string): TimeframeQualifierOption['id'][] {
  return NONE_ONLY_TIMEFRAME_IDS.has(timeframeId) ? ['none'] : ['during', 'before', 'after']
}

function fallbackConceptSpecifiers(concept: CommonConcept): string[] {
  if (concept.kind === 'timeframe' || concept.kind === 'season' || concept.kind === 'calendar-window') {
    return ['during', 'before', 'after', 'between']
  }

  if (concept.kind === 'time-of-day') {
    return ['in', 'before', 'after']
  }

  if (concept.kind === 'day-type') {
    return ['on', 'before', 'after']
  }

  if (concept.kind === 'work-pattern' || concept.kind === 'life-context' || concept.kind === 'social-pattern') {
    return ['when', 'when not']
  }

  if (concept.kind === 'mood' || concept.kind === 'energy' || concept.kind === 'comfort-state') {
    return ['when in', 'when not in']
  }

  return ['during', 'when']
}

function conceptSpecifiers(concept: CommonConcept): string[] {
  const fromExamples = concept.examples
    .map((example) => example.trim().toLowerCase())
    .map((example) => example.match(/^(during|between|after|before|within|in|on|at)\b/)?.[1])
    .filter((value): value is string => Boolean(value))

  if (fromExamples.length) {
    return [...new Set(fromExamples)]
  }

  return fallbackConceptSpecifiers(concept)
}

function normalizeTagLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/^#+/, '')
}

function buildTaskDefinitionSentence(draft: TaskSentenceDraft, timeframeOptions: TimeframeOption[]): string {
  const countText = draft.countChoice
  const timeframeText = timeframeOptions.find((option) => option.id === draft.timeframe)?.label ?? 'in general'
  const timeframeQualifier = TIMEFRAME_QUALIFIER_OPTIONS.find((option) => option.id === draft.timeframeQualifier)?.id ?? 'none'
  const timeframePhrase = timeframeQualifier === 'none' ? timeframeText : `${timeframeQualifier} ${timeframeText}`
  const frequencyCountText = FREQUENCY_COUNT_OPTIONS.find((option) => option.id === draft.frequencyCount)?.label ?? 'nothing'
  const everyPhrase =
    frequencyCountText === 'nothing'
      ? `every ${draft.frequencyStarter}`
      : frequencyCountText === 'other'
        ? `every other ${draft.frequencyStarter}`
        : `every ${frequencyCountText} ${draft.frequencyStarter}`
  const quantifier =
    draft.sentenceMode === 'at-one-point'
      ? 'at one point'
      : draft.sentenceMode === 'one-time'
        ? `one time ${timeframePhrase}`
        : draft.sentenceMode === 'every'
          ? `${everyPhrase}, ${timeframePhrase}`
          : `${TASK_SENTENCE_MODE_OPTIONS.find((option) => option.id === draft.sentenceMode)?.label ?? draft.sentenceMode} ${countText} times, ${timeframePhrase}`
  const base = `I want to ${draft.actionText || 'do this task'} ${quantifier}`
  const timePart = draft.timeSensitive ? `, only when it is ${draft.dayGroup} between ${draft.start} and ${draft.end}` : ''
  return `${base}${timePart}.`
}

function frequencyCountStepLabel(option: FrequencyCountOption): string {
  return option.id === '1' ? 'every' : `every ${option.label}`
}

function everyProgressPhrase(frequencyStarter: FrequencyStarterOption['id'], frequencyCount: FrequencyCountOption['id'], completed: Set<string>): string {
  if (!completed.has('frequency-starter')) return 'every …'
  if (!completed.has('frequency-count') || frequencyCount === '1') return `every ${frequencyStarter}`
  const frequencyLabel = FREQUENCY_COUNT_OPTIONS.find((option) => option.id === frequencyCount)?.label ?? frequencyCount
  return `every ${frequencyLabel} ${frequencyStarter}`
}

function taskComposerFlowSteps(draft: TaskSentenceDraft, optionalPath: TaskComposerOptionalPath): TaskComposerUiStepId[] {
  const steps: TaskComposerUiStepId[] = ['name', 'mode']
  if (draft.sentenceMode === 'every') {
    steps.push('frequency-starter', 'frequency-count')
  } else if (['at-least', 'exactly', 'more-than'].includes(draft.sentenceMode)) {
    steps.push('count')
  }
  steps.push('details')
  if (optionalPath === 'details') {
    steps.push('importance', 'difficulty', 'time', 'focus')
  } else if (optionalPath === 'categories') {
    steps.push('category')
  } else if (optionalPath === 'context') {
    steps.push('context')
  }
  return steps
}

function taskAdjustmentFlowSteps(adjustment: TaskAdjustmentState): TaskAdjustmentUiStepId[] {
  const steps: TaskAdjustmentUiStepId[] = ['summary', 'title', 'mode']
  if (adjustment.sentenceMode === 'every') {
    steps.push('frequency-starter', 'frequency-count', 'timeframe')
  } else if (['at-least', 'exactly', 'more-than'].includes(adjustment.sentenceMode)) {
    steps.push('count', 'timeframe')
  } else if (adjustment.sentenceMode === 'one-time') {
    steps.push('timeframe')
  }
  if (adjustment.sentenceMode !== 'at-one-point' && allowedTimeframeQualifiers(adjustment.timeframe).some((option) => option !== 'none')) {
    steps.push('timeframe-qualifier')
  }
  steps.push('importance', 'difficulty', 'time', 'focus', 'category', 'context', 'notes')
  return steps
}

function progressTimeframePhrase(timeframeId: string, qualifier: TimeframeQualifierOption['id'], timeframeOptions: TimeframeOption[], completed: Set<string>): string {
  if (!completed.has('timeframe')) return ''
  const timeframeText = timeframeOptions.find((option) => option.id === timeframeId)?.label ?? 'in general'
  if (completed.has('timeframe-qualifier') && qualifier !== 'none') {
    return `${qualifier} ${timeframeText}`
  }
  return timeframeText
}

type PreviewStepId = 'name' | 'title' | 'mode' | 'frequency-starter' | 'frequency-count' | 'count' | 'timeframe' | 'timeframe-qualifier' | 'importance' | 'difficulty' | 'time' | 'focus' | 'timing' | 'window'

function sentenceChip(text: string, key: string, onClick?: () => void): ReactNode {
  if (!onClick) return <span key={key} className="entry-sentence-chip">{text}</span>
  return <button key={key} type="button" className="entry-sentence-chip entry-sentence-chip-btn" onClick={onClick}>{text}</button>
}

function renderSubjectiveProgressSentence(
  reached: Set<string>,
  values: {
    importance: string
    difficulty: string
    time: string
    focus: string
  },
  renderChip: (step: PreviewStepId, text: string, key: string) => ReactNode,
): ReactNode {
  if (!reached.has('importance')) return null
  return (
    <>
      {' '}
      <span>I think it is </span>
      {renderChip('importance', values.importance, 'importance')}
      {reached.has('difficulty') && (
        <>
          <span>, </span>
          {renderChip('difficulty', values.difficulty, 'difficulty')}
        </>
      )}
      {reached.has('time') && (
        <>
          <span>, </span>
          {renderChip('time', values.time, 'time')}
        </>
      )}
      {reached.has('focus') && (
        <>
          <span>, and needs </span>
          {renderChip('focus', values.focus, 'focus')}
        </>
      )}
      <span>.</span>
    </>
  )
}

function renderCadenceProgress(
  options: {
    sentenceMode: TaskSentenceModeOption['id']
    frequencyStarter: FrequencyStarterOption['id']
    frequencyCount: FrequencyCountOption['id']
    timeframe: string
    timeframeQualifier: TimeframeQualifierOption['id']
    countChoice: CountOption['id']
  },
  timeframeOptions: TimeframeOption[],
  reached: Set<string>,
  renderChip: (step: PreviewStepId, text: string, key: string) => ReactNode,
): ReactNode {
  if (!reached.has('mode')) return null
  const timeframeText = timeframeOptions.find((option) => option.id === options.timeframe)?.label ?? 'in general'

  if (options.sentenceMode === 'at-one-point') {
    return <>{' '}{renderChip('mode', 'at one point', 'mode')}</>
  }

  if (options.sentenceMode === 'every') {
    return (
      <>
        {' '}
        {renderChip('mode', 'every', 'every-mode')}
        {reached.has('frequency-count') && options.frequencyCount !== '1' && (
          <>
            {' '}
            {renderChip('frequency-count', FREQUENCY_COUNT_OPTIONS.find((option) => option.id === options.frequencyCount)?.label ?? options.frequencyCount, 'every-count')}
          </>
        )}
        {reached.has('frequency-starter') && (
          <>
            {' '}
            {renderChip('frequency-starter', options.frequencyStarter, 'every-starter')}
          </>
        )}
        {reached.has('timeframe') && (
          <>
            <span>, </span>
            {reached.has('timeframe-qualifier') && options.timeframeQualifier !== 'none' && (
              <>
                {renderChip('timeframe-qualifier', options.timeframeQualifier, 'every-qualifier')}
                {' '}
              </>
            )}
            {renderChip('timeframe', timeframeText, 'every-timeframe')}
          </>
        )}
      </>
    )
  }

  if (options.sentenceMode === 'one-time') {
    return (
      <>
        {' '}
        {renderChip('mode', 'one time', 'one-time-mode')}
        {reached.has('timeframe') && (
          <>
            {' '}
            {reached.has('timeframe-qualifier') && options.timeframeQualifier !== 'none' && (
              <>
                {renderChip('timeframe-qualifier', options.timeframeQualifier, 'one-time-qualifier')}
                {' '}
              </>
            )}
            {renderChip('timeframe', timeframeText, 'one-time-timeframe')}
          </>
        )}
      </>
    )
  }

  return (
    <>
      {' '}
      {renderChip('mode', TASK_SENTENCE_MODE_OPTIONS.find((option) => option.id === options.sentenceMode)?.label ?? options.sentenceMode, 'count-mode')}
      {' '}
      {renderChip('count', reached.has('count') ? options.countChoice : '…', 'count-value')}
      <span> times</span>
      {reached.has('timeframe') && (
        <>
          <span>, </span>
          {reached.has('timeframe-qualifier') && options.timeframeQualifier !== 'none' && (
            <>
              {renderChip('timeframe-qualifier', options.timeframeQualifier, 'count-qualifier')}
              {' '}
            </>
          )}
          {renderChip('timeframe', timeframeText, 'count-timeframe')}
        </>
      )}
    </>
  )
}

function renderTaskComposerProgressSentence(
  draft: TaskSentenceDraft,
  timeframeOptions: TimeframeOption[],
  flow: TaskComposerUiStepId[],
  stepIndex: number,
  subjectiveSelections: Record<SubjectiveCategory, SubjectiveChoiceOption>,
  hasDetailSummary: boolean,
  selectedCategories: string[],
  preferredContexts: Array<{ conceptId: string; qualifier: string }>,
  concepts: CommonConcept[],
  onStepClick: (stepIndex: number) => void,
  onOptionalPathClick: (path: Exclude<TaskComposerOptionalPath, null>) => void,
): ReactNode {
  const reached = new Set<string>(flow.slice(0, Math.max(0, stepIndex + 1)))
  if (stepIndex === 0 && draft.actionText.trim()) {
    reached.add('name')
  }
  const renderChip = (step: PreviewStepId, text: string, key: string) => {
    const targetIndex = taskComposerFlowStepIndex(flow, step)
    return sentenceChip(text, key, targetIndex >= 0 ? () => onStepClick(targetIndex) : undefined)
  }
  return (
    <>
      <span>I want to </span>
      {renderChip('name', draft.actionText.trim() || '…', 'task-name')}
      {renderCadenceProgress(draft, timeframeOptions, reached, renderChip)}
      {reached.has('timing') && draft.timeSensitive && (
        <>
          <span>, only when it is </span>
          {renderChip(reached.has('window') ? 'window' : 'timing', reached.has('window') ? `${draft.dayGroup} between ${draft.start} and ${draft.end}` : 'inside a preferred window', 'timing')}
        </>
      )}
      <span>.</span>
      {(reached.has('importance') || hasDetailSummary) && renderSubjectiveProgressSentence(new Set(['importance', 'difficulty', 'time', 'focus']), {
        importance: subjectiveSelections.importance.label,
        difficulty: subjectiveSelections.difficulty.label,
        time: subjectiveSelections.time.label,
        focus: subjectiveSelections.focus.label,
      }, (step, text, key) => sentenceChip(text, key, () => onOptionalPathClick('details')))}
      {selectedCategories.length > 0 && (
        <>
          {' '}
          <span>In </span>
          {selectedCategories.map((category, index) => (
            <span key={`category-wrap-${category}`}>
              {index > 0 && <span>, </span>}
              {sentenceChip(category, `category-${category}`, () => onOptionalPathClick('categories'))}
            </span>
          ))}
          <span>.</span>
        </>
      )}
      {preferredContexts.length > 0 && (
        <>
          {' '}
          <span>With </span>
          {preferredContexts.map((context, index) => {
            const concept = concepts.find((entry) => entry.id === context.conceptId)
            const label = concept ? `${context.qualifier} ${concept.label}` : `${context.qualifier} context`
            return (
              <span key={`context-wrap-${context.conceptId}-${context.qualifier}-${index}`}>
                {index > 0 && <span>, </span>}
                {sentenceChip(label, `context-${context.conceptId}-${context.qualifier}-${index}`, () => onOptionalPathClick('context'))}
              </span>
            )
          })}
          <span>.</span>
        </>
      )}
    </>
  )
}

function renderTaskAdjustmentProgressSentence(
  adjustment: TaskAdjustmentState,
  timeframeOptions: TimeframeOption[],
  flow: TaskAdjustmentUiStepId[],
  stepIndex: number,
  selectedCategoryLabels: string[],
  concepts: CommonConcept[],
  onStepClick: (step: Exclude<TaskAdjustmentUiStepId, 'summary'>) => void,
): ReactNode {
  const reached = stepIndex === 0 ? new Set<string>(flow.slice(1)) : new Set<string>(flow.slice(0, Math.max(0, stepIndex + 1)))
  const cadenceReached = new Set(reached)
  if (stepIndex === 0 && adjustment.title.trim()) {
    reached.add('title')
  }
  if (adjustment.timeframe === 'in-general' && adjustment.timeframeQualifier === 'none') {
    cadenceReached.delete('timeframe')
    cadenceReached.delete('timeframe-qualifier')
  }
  const renderChip = (step: PreviewStepId, text: string, key: string) => {
    const targetIndex = taskAdjustmentFlowStepIndex(flow, step)
    return sentenceChip(text, key, targetIndex >= 0 ? () => onStepClick(step as Exclude<TaskAdjustmentUiStepId, 'summary'>) : undefined)
  }
  return (
    <>
      <span>I want to </span>
      {renderChip('title', adjustment.title.trim() || '…', 'adjust-title')}
      {renderCadenceProgress(adjustment, timeframeOptions, cadenceReached, renderChip)}
      <span>.</span>
      {renderSubjectiveProgressSentence(reached, {
        importance: SUBJECTIVE_OPTIONS_BY_CATEGORY.importance.find((option) => option.id === adjustment.importance)?.label ?? 'important',
        difficulty: SUBJECTIVE_OPTIONS_BY_CATEGORY.difficulty.find((option) => option.id === adjustment.grandness)?.label ?? 'ok',
        time: SUBJECTIVE_OPTIONS_BY_CATEGORY.time.find((option) => option.id === adjustment.subjectiveTime)?.label ?? 'medium',
        focus: SUBJECTIVE_OPTIONS_BY_CATEGORY.focus.find((option) => option.id === adjustment.focus)?.label ?? 'some',
      }, renderChip)}
      {selectedCategoryLabels.length > 0 && (
        <>
          {' '}
          <span>In </span>
          {selectedCategoryLabels.map((category, index) => (
            <span key={`adjust-category-wrap-${category}`}>
              {index > 0 && <span>, </span>}
              {sentenceChip(category, `adjust-category-${category}`, () => onStepClick('category'))}
            </span>
          ))}
          <span>.</span>
        </>
      )}
      {adjustment.preferredContexts.length > 0 && (
        <>
          {' '}
          <span>With </span>
          {adjustment.preferredContexts.map((context, index) => {
            const concept = concepts.find((entry) => entry.id === context.conceptId)
            const label = concept ? `${context.qualifier} ${concept.label}` : `${context.qualifier} context`
            return (
              <span key={`adjust-context-wrap-${context.conceptId}-${context.qualifier}-${index}`}>
                {index > 0 && <span>, </span>}
                {sentenceChip(label, `adjust-context-${context.conceptId}-${context.qualifier}-${index}`, () => onStepClick('context'))}
              </span>
            )
          })}
          <span>.</span>
        </>
      )}
    </>
  )
}

function taskComposerFlowStepIndex(flow: TaskComposerUiStepId[], step: PreviewStepId): number {
  return flow.indexOf(step as TaskComposerUiStepId)
}

function taskAdjustmentFlowStepIndex(flow: TaskAdjustmentUiStepId[], step: PreviewStepId): number {
  return flow.indexOf(step as TaskAdjustmentUiStepId)
}

function taskAdjustmentRouteStep(step: Exclude<TaskAdjustmentUiStepId, 'summary'>, adjustment: TaskAdjustmentState): TaskAdjustmentUiStepId {
  if (step === 'frequency-starter' || step === 'frequency-count') {
    return adjustment.sentenceMode === 'every' ? step : 'mode'
  }
  if (step === 'count') {
    return ['at-least', 'exactly', 'more-than'].includes(adjustment.sentenceMode) ? 'count' : 'mode'
  }
  if (step === 'timeframe' || step === 'timeframe-qualifier') {
    return adjustment.sentenceMode === 'at-one-point' ? 'mode' : step
  }
  return step
}

function visibleSentenceParts(showTaskCadenceTeaser: boolean, draft: TaskSentenceDraft): SentenceCaretPart[] {
  const parts: SentenceCaretPart[] = ['name']
  if (!showTaskCadenceTeaser) return parts

  parts.push('mode')

  if (draft.sentenceMode === 'one-time') {
      parts.push('timeframe-qualifier', 'timeframe')
  }

  if (draft.sentenceMode === 'every') {
    parts.push('frequency-count', 'frequency-starter', 'timeframe-qualifier', 'timeframe')
  }

  if (['at-least', 'exactly', 'more-than'].includes(draft.sentenceMode)) {
    parts.push('count', 'timeframe-qualifier', 'timeframe')
  }

  return parts
}

function comfortExpression(skipFlow: SkipFlowState): ExpressionNode | undefined {
  if (!skipFlow.conceptId) return undefined
  return { type: 'concept-ref', conceptId: skipFlow.conceptId }
}

function comfortSentence(skipFlow: SkipFlowState, concepts: CommonConcept[]): string {
  const concept = concepts.find((entry) => entry.id === skipFlow.conceptId)
  return concept ? `${skipFlow.contextSpecifier} ${concept.label.toLowerCase()}` : 'in a different context'
}

function skipSentencePreview(skipFlow: SkipFlowState, categoryLabel: string | null, concepts: CommonConcept[], answeredSections: Set<'why' | 'categories' | 'when'> = new Set()): string {
  const selectedCategories = (categoryLabel ?? '').split(',').map((label) => label.trim()).filter(Boolean)
  if (skipFlow.scope === 'special-task') {
    let sentence = `I don't want to do this special task`
    if (answeredSections.has('why')) {
      sentence += ` because it feels ${skipFlow.discomfort}`
    }
    sentence += '.'
    if (answeredSections.has('when') && skipFlow.conceptId) {
      sentence += ` It would fit better ${comfortSentence(skipFlow, concepts)}.`
    }
    if (skipFlow.extraNote.trim()) {
      sentence += ` ${skipFlow.extraNote.trim()}`
    }
    return sentence
  }
  if (skipFlow.scope === 'sort-of-task') {
    let sentence = `I don't want to do this sort of tasks`
    if (answeredSections.has('why')) {
      sentence += ` because it feels ${skipFlow.discomfort}`
    }
    sentence += '.'
    if (answeredSections.has('categories') && selectedCategories.length) {
      sentence += ` I feel the same with tasks in ${selectedCategories.join(', ')}.`
    }
    if (answeredSections.has('when') && skipFlow.conceptId) {
      sentence += ` They would fit better ${comfortSentence(skipFlow, concepts)}.`
    }
    return sentence
  }
  if (skipFlow.scope === 'today-only') {
    return `I don't want to do this task this time${skipFlow.extraNote.trim() ? ` because ${skipFlow.extraNote.trim()}` : '.'}`
  }
  return `I don't want to do this task right now.`
}

function App() {
  const [currentRoomId, setCurrentRoomId] = useState(() => getRoomId())
  const [localProfileName, setLocalProfileName] = useState(() => getLocalProfileName())
  const initialState = useMemo(() => createInitialState(currentRoomId), [currentRoomId])
  const { state, updateState, peerCount, connectionStatus, roomCode, shareUrl, onlineUsers, lastConnectionError } = useCollaborativeState(initialState, localProfileName)
  const hasSignalingProblem = Boolean(lastConnectionError)

  const sharedConcepts = useMemo(() => state.concepts.filter((concept) => concept.scope === 'shared'), [state.concepts])
  const timeframeOptions = useMemo<TimeframeOption[]>(() => {
    const baseIds = new Set(BASE_TIMEFRAME_OPTIONS.map((option) => option.id))
    const fromVocab = sharedConcepts
      .filter((concept) => ['timeframe', 'season', 'calendar-window'].includes(concept.kind))
      .map((concept) => ({ id: concept.id, label: concept.label.toLowerCase() }))
      .filter((option) => !baseIds.has(option.id))

    return [...BASE_TIMEFRAME_OPTIONS, ...fromVocab]
  }, [sharedConcepts])
  const selectedUser = useMemo(
    () => state.users.find((user) => user.id === state.selectedUserId) ?? state.users[0],
    [state.selectedUserId, state.users],
  )
  const selectedUserDisplayName = selectedUser ? localProfileName : 'right now'

  const feedCards = useMemo(() => (selectedUser ? getFeedCards(state, selectedUser.id) : []), [selectedUser, state])
  const analytics = useMemo(() => (selectedUser ? getWishHealth(state, selectedUser.id) : []), [selectedUser, state])
  const personalDefinitions = useMemo(
    () => (selectedUser ? state.userConceptDefinitions.filter((entry) => entry.userId === selectedUser.id) : []),
    [selectedUser, state.userConceptDefinitions],
  )

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuSection, setMenuSection] = useState<MenuSection>('analytics')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const deferredInstallPrompt = useRef<any>(null)
  const [canInstallPwa, setCanInstallPwa] = useState(false)
  const [taskComposerOpen, setTaskComposerOpen] = useState(false)
  const [taskComposerUiStepIndex, setTaskComposerUiStepIndex] = useState(0)
  const [taskComposerOptionalPath, setTaskComposerOptionalPath] = useState<TaskComposerOptionalPath>(null)
  const [taskDraft, setTaskDraft] = useState<TaskSentenceDraft>(() => defaultTaskDraft())
  const [debouncedTaskName, setDebouncedTaskName] = useState('')
  const [taskSentenceModeIndex, setTaskSentenceModeIndex] = useState(0)
  const [countOptionIndex, setCountOptionIndex] = useState(0)
  const [oneTimeFrameIndex, setOneTimeFrameIndex] = useState(0)
  const [frequencyCountIndex, setFrequencyCountIndex] = useState(0)
  const [frequencyStarterIndex, setFrequencyStarterIndex] = useState(1)
  const [timeframeQualifierIndex, setTimeframeQualifierIndex] = useState(0)
  const [timeframeIndex, setTimeframeIndex] = useState(0)
  const [sentenceCaret, setSentenceCaret] = useState<SentenceCaretPart>('name')
  const [skipSentenceCaret, setSkipSentenceCaret] = useState<SkipSentenceCaret>('scope')
  const [renderedSentenceMode, setRenderedSentenceMode] = useState<TaskSentenceModeOption['id']>('at-one-point')
  const [sentenceBranchPicked, setSentenceBranchPicked] = useState({
    frequency: false,
    oneTime: false,
    quantity: false,
  })
  const [showSubjectiveComposer, setShowSubjectiveComposer] = useState(false)
  const [subjectiveSelections, setSubjectiveSelections] = useState<Partial<Record<SubjectiveCategory, SubjectiveChoiceOption>>>({})
  const [subjectiveCaret, setSubjectiveCaret] = useState<SubjectiveCategory>('importance')
  const [categoryTagInput, setCategoryTagInput] = useState('')
  const [selectedCategoryTags, setSelectedCategoryTags] = useState<string[]>([])
  const [categorySuggestionIndex, setCategorySuggestionIndex] = useState(0)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [composerContextInput, setComposerContextInput] = useState('')
  const [composerPendingContextId, setComposerPendingContextId] = useState<string | null>(null)
  const [composerContextQualifier, setComposerContextQualifier] = useState('during')
  const [composerContextPickerOpen, setComposerContextPickerOpen] = useState(false)
  const [composerContextSuggestionIndex, setComposerContextSuggestionIndex] = useState(0)
  const [composerPreferredContexts, setComposerPreferredContexts] = useState<Array<{ conceptId: string; qualifier: string }>>([])
  const [taskInputWidthPx, setTaskInputWidthPx] = useState(220)
  const [personDraft, setPersonDraft] = useState<PersonDraft>(() => {
    const draft = defaultPersonDraft()
    draft.name = getLocalProfileName()
    return draft
  })
  const [conceptDraft, setConceptDraft] = useState<ConceptDraft>(defaultConceptDraft())
  const [definitionDraft, setDefinitionDraft] = useState<DefinitionDraft>(defaultDefinitionDraft(initialState.concepts.find((concept) => concept.scope === 'shared')?.id ?? ''))
  const [doneFlow, setDoneFlow] = useState<DoneFlowState | null>(null)
  const [doneNoteOpen, setDoneNoteOpen] = useState(false)
  const [skipFlow, setSkipFlow] = useState<SkipFlowState | null>(null)
  const [skipRevealedSections, setSkipRevealedSections] = useState<Set<'why' | 'categories' | 'when'>>(new Set())
  const [skipUiStep, setSkipUiStep] = useState<SkipUiStep>('scope')
  const [skipCategoryQuery, setSkipCategoryQuery] = useState('')
  const [skipCategorySuggestionIndex, setSkipCategorySuggestionIndex] = useState(0)
  const [skipCategoryDropdownOpen, setSkipCategoryDropdownOpen] = useState(false)
  const [skipContextInput, setSkipContextInput] = useState('')
  const [skipContextSuggestionIndex, setSkipContextSuggestionIndex] = useState(0)
  const [skipContextPickerOpen, setSkipContextPickerOpen] = useState(false)
  const [skipPendingContextId, setSkipPendingContextId] = useState<string | null>(null)
  const [taskAdjustment, setTaskAdjustment] = useState<TaskAdjustmentState | null>(null)
  const [taskAdjustmentUiStepIndex, setTaskAdjustmentUiStepIndex] = useState(0)
  const [adjustCategoryInput, setAdjustCategoryInput] = useState('')
  const [adjustCategoryPickerOpen, setAdjustCategoryPickerOpen] = useState(false)
  const [adjustCategorySuggestionIndex, setAdjustCategorySuggestionIndex] = useState(0)
  const [adjustContextInput, setAdjustContextInput] = useState('')
  const [adjustPendingContextId, setAdjustPendingContextId] = useState<string | null>(null)
  const [adjustContextQualifier, setAdjustContextQualifier] = useState('during')
  const [adjustContextPickerOpen, setAdjustContextPickerOpen] = useState(false)
  const [adjustContextSuggestionIndex, setAdjustContextSuggestionIndex] = useState(0)
  const [analyticsPlotRange, setAnalyticsPlotRange] = useState<'month' | 'all'>('month')
  const [analyticsFilter, setAnalyticsFilter] = useState('')
  const [vocabFilter, setVocabFilter] = useState('')
  const [vocabEditId, setVocabEditId] = useState<string | null>(null)
  const [vocabEditMode, setVocabEditMode] = useState<'objective' | 'subjective'>('objective')
  const [showAddConceptModal, setShowAddConceptModal] = useState(false)
  const [selfReportOpen, setSelfReportOpen] = useState(false)
  const [selfReportMood, setSelfReportMood] = useState(0.5)
  const [selfReportTiredness, setSelfReportTiredness] = useState(0.5)
  const [selfReportFocus, setSelfReportFocus] = useState(0.5)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const nameMeasureRef = useRef<HTMLSpanElement | null>(null)
  const modeSpinnerRef = useRef<HTMLElement | null>(null)
  const countSpinnerRef = useRef<HTMLElement | null>(null)
  const oneTimeSpinnerRef = useRef<HTMLElement | null>(null)
  const frequencyCountSpinnerRef = useRef<HTMLElement | null>(null)
  const frequencySpinnerRef = useRef<HTMLElement | null>(null)
  const timeframeQualifierSpinnerRef = useRef<HTMLElement | null>(null)
  const timeframeSpinnerRef = useRef<HTMLElement | null>(null)
  const skipScopeSpinnerRef = useRef<HTMLElement | null>(null)
  const skipDiscomfortSpinnerRef = useRef<HTMLElement | null>(null)
  const skipCategorySpinnerRef = useRef<HTMLElement | null>(null)
  const skipSpecifierSpinnerRef = useRef<HTMLElement | null>(null)
  const skipConceptSpinnerRef = useRef<HTMLElement | null>(null)
  const subjectiveImportanceSpinnerRef = useRef<HTMLElement | null>(null)
  const subjectiveDifficultySpinnerRef = useRef<HTMLElement | null>(null)
  const subjectiveTimeSpinnerRef = useRef<HTMLElement | null>(null)
  const subjectiveFocusSpinnerRef = useRef<HTMLElement | null>(null)
  const subjectiveTouchStartRef = useRef<number | null>(null)
  const skipTouchStartRef = useRef<number | null>(null)
  const categoryTagInputRef = useRef<HTMLInputElement | null>(null)
  const taskComposerTouchStartRef = useRef<number | null>(null)
  const sentenceTouchStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!selectedUser) return
    setPersonDraft(personDraftFromUserWithLocalName(selectedUser, localProfileName))
  }, [selectedUser, localProfileName])

  const showTaskCadenceTeaser = debouncedTaskName.trim().length > 0
  const branchComplete =
    taskDraft.sentenceMode === 'at-one-point'
      ? true
      : taskDraft.sentenceMode === 'every'
        ? sentenceBranchPicked.frequency
        : taskDraft.sentenceMode === 'one-time'
          ? sentenceBranchPicked.oneTime
          : sentenceBranchPicked.quantity
  const sentenceComplete = showTaskCadenceTeaser && taskDraft.actionText.trim().length > 0 && branchComplete
  const effectiveSubjectiveSelections: Record<SubjectiveCategory, SubjectiveChoiceOption> = {
    importance: subjectiveSelections.importance ?? SUBJECTIVE_DEFAULT_CHOICES.importance,
    difficulty: subjectiveSelections.difficulty ?? SUBJECTIVE_DEFAULT_CHOICES.difficulty,
    time: subjectiveSelections.time ?? SUBJECTIVE_DEFAULT_CHOICES.time,
    focus: subjectiveSelections.focus ?? SUBJECTIVE_DEFAULT_CHOICES.focus,
  }
  const subjectiveIndices: Record<SubjectiveCategory, number> = {
    importance: Math.max(0, SUBJECTIVE_OPTIONS_BY_CATEGORY.importance.findIndex((option) => option.id === effectiveSubjectiveSelections.importance.id)),
    difficulty: Math.max(0, SUBJECTIVE_OPTIONS_BY_CATEGORY.difficulty.findIndex((option) => option.id === effectiveSubjectiveSelections.difficulty.id)),
    time: Math.max(0, SUBJECTIVE_OPTIONS_BY_CATEGORY.time.findIndex((option) => option.id === effectiveSubjectiveSelections.time.id)),
    focus: Math.max(0, SUBJECTIVE_OPTIONS_BY_CATEGORY.focus.findIndex((option) => option.id === effectiveSubjectiveSelections.focus.id)),
  }
  const existingCategoryLabels = useMemo(
    () => state.categories.map((category) => String(category.label)).filter((label, index, labels) => labels.indexOf(label) === index),
    [state.categories],
  )
  const existingCategoryTags = useMemo<string[]>(() => {
    const tags = existingCategoryLabels
      .map((label) => normalizeTagLabel(label))
      .filter((label): label is string => Boolean(label))
    return Array.from(new Set<string>(tags))
  }, [existingCategoryLabels])
  const normalizedTagQuery = normalizeTagLabel(categoryTagInput)
  const categorySuggestions: string[] = normalizedTagQuery.length === 0
    ? existingCategoryTags.filter((label) => !selectedCategoryTags.includes(label)).slice(0, 8)
    : existingCategoryTags
        .filter((label) => !selectedCategoryTags.includes(label))
        .filter((label) => label.includes(normalizedTagQuery))
        .slice(0, 8)
  const topComposerCategories = existingCategoryTags.slice(0, 4)
  const visibleComposerCategoryOptions = normalizedTagQuery.length === 0
    ? [...topComposerCategories, ...existingCategoryTags.filter((label) => !topComposerCategories.includes(label))]
    : existingCategoryTags.filter((label) => label.includes(normalizedTagQuery))
  const composerPendingContext = composerPendingContextId
    ? sharedConcepts.find((concept) => concept.id === composerPendingContextId) ?? null
    : null
  const composerPendingContextQualifiers = composerPendingContext ? conceptSpecifiers(composerPendingContext) : []
  const composerContextSuggestions = sharedConcepts
    .filter((concept) => !composerContextInput || concept.label.toLowerCase().includes(composerContextInput.toLowerCase()))
  const topComposerContexts = sharedConcepts.slice(0, 4)
  const visibleComposerContexts = composerContextInput.trim().length === 0
    ? [...topComposerContexts, ...sharedConcepts.filter((concept) => !topComposerContexts.some((topConcept) => topConcept.id === concept.id))]
    : sharedConcepts.filter((concept) => concept.label.toLowerCase().includes(composerContextInput.toLowerCase()))
  const skipCategoryOptions = useMemo(() => {
    if (!skipFlow) {
      return [] as Array<{ id: string; label: string }>
    }

    const profile = state.userTaskProfiles.find((entry) => entry.id === skipFlow.userTaskProfileId)
    const taskId = profile?.taskId
    const taskCategoryIds = new Set<string>()
    if (taskId) {
      state.sharedTaskCategories
        .filter((entry) => entry.taskId === taskId)
        .forEach((entry) => taskCategoryIds.add(entry.categoryId))
      state.userTaskCategories
        .filter((entry) => entry.taskId === taskId)
        .forEach((entry) => taskCategoryIds.add(entry.categoryId))
    }

    return [...state.categories]
      .sort((left, right) => {
        const leftPriority = taskCategoryIds.has(left.id) ? 1 : 0
        const rightPriority = taskCategoryIds.has(right.id) ? 1 : 0
        if (leftPriority !== rightPriority) return rightPriority - leftPriority
        return left.label.localeCompare(right.label)
      })
      .map((category) => ({ id: category.id, label: category.label }))
  }, [skipFlow, state.categories, state.sharedTaskCategories, state.userTaskCategories, state.userTaskProfiles])
  const skipConceptOptions = useMemo(
    () => sharedConcepts.map((concept) => ({ id: concept.id, label: concept.label })),
    [sharedConcepts],
  )
  const selectedSkipConcept = useMemo(
    () => (skipFlow ? sharedConcepts.find((concept) => concept.id === skipFlow.conceptId) : undefined),
    [sharedConcepts, skipFlow],
  )
  const skipSpecifierOptions = useMemo(() => {
    if (!selectedSkipConcept) return ['during']
    return conceptSpecifiers(selectedSkipConcept)
  }, [selectedSkipConcept])

  const normalizedSkipCategoryQuery = normalizeTagLabel(skipCategoryQuery)
  const skipCategorySuggestions = normalizedSkipCategoryQuery.length === 0
    ? skipCategoryOptions.filter((option) => !skipFlow?.categoryIds.includes(option.id)).slice(0, 8)
    : skipCategoryOptions
      .filter((option) => !skipFlow?.categoryIds.includes(option.id))
      .filter((option) => normalizeTagLabel(option.label).includes(normalizedSkipCategoryQuery))
      .sort((left, right) => {
        const leftLabel = normalizeTagLabel(left.label)
        const rightLabel = normalizeTagLabel(right.label)
        const leftIndex = leftLabel.indexOf(normalizedSkipCategoryQuery)
        const rightIndex = rightLabel.indexOf(normalizedSkipCategoryQuery)
        if (leftIndex !== rightIndex) return leftIndex - rightIndex
        if (leftLabel.length !== rightLabel.length) return leftLabel.length - rightLabel.length
        return left.label.localeCompare(right.label)
      })
      .slice(0, 8)
  const visibleSkipCategoryOptions = normalizedSkipCategoryQuery.length === 0
    ? skipCategoryOptions
    : skipCategoryOptions
      .filter((option) => normalizeTagLabel(option.label).includes(normalizedSkipCategoryQuery))
      .sort((left, right) => {
        const leftLabel = normalizeTagLabel(left.label)
        const rightLabel = normalizeTagLabel(right.label)
        const leftIndex = leftLabel.indexOf(normalizedSkipCategoryQuery)
        const rightIndex = rightLabel.indexOf(normalizedSkipCategoryQuery)
        if (leftIndex !== rightIndex) return leftIndex - rightIndex
        if (leftLabel.length !== rightLabel.length) return leftLabel.length - rightLabel.length
        return left.label.localeCompare(right.label)
      })
  const skipPendingContext = skipPendingContextId
    ? sharedConcepts.find((concept) => concept.id === skipPendingContextId) ?? null
    : null
  const skipPendingContextQualifiers = skipPendingContext ? conceptSpecifiers(skipPendingContext) : []
  const skipContextSuggestions = sharedConcepts.filter((concept) => !skipContextInput || concept.label.toLowerCase().includes(skipContextInput.toLowerCase()))
  const topSkipContexts = sharedConcepts.slice(0, 4)
  const visibleSkipContexts = skipContextInput.trim().length === 0
    ? [...topSkipContexts, ...sharedConcepts.filter((concept) => !topSkipContexts.some((topConcept) => topConcept.id === concept.id))]
    : sharedConcepts.filter((concept) => concept.label.toLowerCase().includes(skipContextInput.toLowerCase()))
  const skipSelectedCategoryLabels = skipFlow
    ? skipFlow.categoryIds.map((id) => state.categories.find((category) => category.id === id)?.label).filter(Boolean) as string[]
    : []
  const skipProgressSentence = skipFlow
    ? skipSentencePreview(skipFlow, skipSelectedCategoryLabels.join(', ') || null, sharedConcepts, skipRevealedSections)
    : ''

  const skipScopeIndex = skipFlow ? Math.max(0, SKIP_SCOPE_OPTIONS.findIndex((option) => option.id === skipFlow.scope)) : 0
  const skipDiscomfortIndex = skipFlow ? Math.max(0, DISCOMFORT_OPTIONS.findIndex((option) => option === skipFlow.discomfort)) : 0
  const skipCategoryIndex = skipFlow ? Math.max(0, skipCategoryOptions.findIndex((option) => option.id === skipFlow.categoryCursorId)) : 0
  const skipSpecifierIndex = skipFlow ? Math.max(0, skipSpecifierOptions.findIndex((option) => option === skipFlow.contextSpecifier)) : 0
  const skipConceptIndex = skipFlow ? Math.max(0, skipConceptOptions.findIndex((option) => option.id === skipFlow.conceptId)) : 0

  // Adjust modal computed values
  const adjustSelectedCategoryLabels = taskAdjustment
    ? taskAdjustment.selectedCategoryIds.map((id) => state.categories.find((category) => category.id === id)?.label).filter(Boolean) as string[]
    : []
  const normalizedAdjustCategoryQuery = normalizeTagLabel(adjustCategoryInput)
  const adjustCategoryAllOptions = state.categories.map((category) => category.label)
  const adjustCategorySuggestions = normalizedAdjustCategoryQuery.length === 0
    ? adjustCategoryAllOptions.filter((label) => !adjustSelectedCategoryLabels.includes(label)).slice(0, 8)
    : adjustCategoryAllOptions
      .filter((label) => !adjustSelectedCategoryLabels.includes(label))
      .filter((label) => normalizeTagLabel(label).includes(normalizedAdjustCategoryQuery))
      .slice(0, 8)
  const topAdjustCategories = adjustCategoryAllOptions.slice(0, 4)
  const visibleAdjustCategoryOptions = normalizedAdjustCategoryQuery.length === 0
    ? [...topAdjustCategories, ...adjustCategoryAllOptions.filter((label) => !topAdjustCategories.includes(label))]
    : adjustCategoryAllOptions.filter((label) => normalizeTagLabel(label).includes(normalizedAdjustCategoryQuery))
  const adjustPendingContext = adjustPendingContextId
    ? sharedConcepts.find((concept) => concept.id === adjustPendingContextId) ?? null
    : null
  const adjustPendingContextQualifiers = adjustPendingContext ? conceptSpecifiers(adjustPendingContext) : []
  const adjustContextSuggestions = sharedConcepts.filter((concept) => !adjustContextInput || concept.label.toLowerCase().includes(adjustContextInput.toLowerCase()))
  const topAdjustContexts = sharedConcepts.slice(0, 4)
  const visibleAdjustContexts = adjustContextInput.trim().length === 0
    ? [...topAdjustContexts, ...sharedConcepts.filter((concept) => !topAdjustContexts.some((topConcept) => topConcept.id === concept.id))]
    : sharedConcepts.filter((concept) => concept.label.toLowerCase().includes(adjustContextInput.toLowerCase()))
  const taskComposerFlow = taskComposerFlowSteps(taskDraft, taskComposerOptionalPath)
  const taskComposerCurrentStepIndex = Math.min(taskComposerUiStepIndex, Math.max(0, taskComposerFlow.length - 1))
  const taskComposerCurrentStep = taskComposerFlow[taskComposerCurrentStepIndex] ?? 'name'
  const taskComposerRequiredFlow = taskComposerFlowSteps(taskDraft, null)
  const taskComposerRequiredLastStepIndex = Math.max(0, taskComposerRequiredFlow.length - 1)
  const taskComposerIsOptionalPath = taskComposerOptionalPath !== null
  const taskComposerHasDetails = Object.keys(subjectiveSelections).length > 0
  const taskComposerCanSave = taskDraft.actionText.trim().length > 0 && taskComposerCurrentStepIndex >= taskComposerRequiredLastStepIndex
  const taskComposerProgressSentence = renderTaskComposerProgressSentence(
    taskDraft,
    timeframeOptions,
    taskComposerFlow,
    taskComposerCurrentStepIndex,
    effectiveSubjectiveSelections,
    taskComposerHasDetails,
    selectedCategoryTags,
    composerPreferredContexts,
    sharedConcepts,
    goToComposerStep,
    openTaskComposerOptionalPath,
  )
  const taskAdjustmentFlow = taskAdjustment ? taskAdjustmentFlowSteps(taskAdjustment) : []
  const taskAdjustmentCurrentStepIndex = taskAdjustment
    ? Math.min(taskAdjustmentUiStepIndex, Math.max(0, taskAdjustmentFlow.length - 1))
    : 0
  const taskAdjustmentCurrentStep = taskAdjustment ? taskAdjustmentFlow[taskAdjustmentCurrentStepIndex] ?? 'title' : 'title'
  const taskAdjustmentProgressSentence = taskAdjustment
    ? renderTaskAdjustmentProgressSentence(taskAdjustment, timeframeOptions, taskAdjustmentFlow, taskAdjustmentCurrentStepIndex, adjustSelectedCategoryLabels, sharedConcepts, goToAdjustmentStepById)
    : ''

  function goToComposerStep(stepIndex: number): void {
    if (taskComposerOptionalPath && stepIndex <= taskComposerRequiredLastStepIndex) {
      setTaskComposerOptionalPath(null)
      setTaskComposerUiStepIndex(Math.max(0, Math.min(stepIndex, taskComposerRequiredFlow.length - 1)))
      return
    }
    setTaskComposerUiStepIndex(Math.max(0, Math.min(stepIndex, taskComposerFlow.length - 1)))
  }

  function openTaskComposerOptionalPath(path: Exclude<TaskComposerOptionalPath, null>): void {
    const nextFlow = taskComposerFlowSteps(taskDraft, path)
    const startStep = path === 'details' ? 'importance' : path === 'categories' ? 'category' : 'context'
    const nextIndex = Math.max(0, nextFlow.indexOf(startStep))
    setTaskComposerOptionalPath(path)
    setTaskComposerUiStepIndex(nextIndex)
  }

  function returnToTaskComposerMainPage(): void {
    const baseFlow = taskComposerFlowSteps(taskDraft, null)
    const detailsIndex = Math.max(0, baseFlow.indexOf('details'))
    setTaskComposerOptionalPath(null)
    setTaskComposerUiStepIndex(detailsIndex)
  }

  function advanceComposer(nextDraft: TaskSentenceDraft = taskDraft, fromStep: TaskComposerUiStepId = taskComposerCurrentStep): void {
    const nextFlow = taskComposerFlowSteps(nextDraft, taskComposerOptionalPath)
    const currentIndex = Math.max(0, nextFlow.indexOf(fromStep))
    setTaskComposerUiStepIndex(Math.min(currentIndex + 1, nextFlow.length - 1))
  }

  function goToAdjustmentStep(stepIndex: number): void {
    setTaskAdjustmentUiStepIndex(Math.max(0, Math.min(stepIndex, taskAdjustmentFlow.length - 1)))
  }

  function goToAdjustmentStepById(step: Exclude<TaskAdjustmentUiStepId, 'summary'>): void {
    if (!taskAdjustment) return
    const routed = taskAdjustmentRouteStep(step, taskAdjustment)
    const index = taskAdjustmentFlow.indexOf(routed)
    if (index >= 0) setTaskAdjustmentUiStepIndex(index)
  }

  function openAdjustmentBranch(step: Exclude<TaskAdjustmentUiStepId, 'summary'>): void {
    goToAdjustmentStepById(step)
  }

  function returnToAdjustmentMainPage(): void {
    setTaskAdjustmentUiStepIndex(0)
  }

  function closeTaskAdjustment(): void {
    setTaskAdjustment(null)
    setTaskAdjustmentUiStepIndex(0)
    setAdjustCategoryInput('')
    setAdjustCategoryPickerOpen(false)
    setAdjustContextInput('')
    setAdjustPendingContextId(null)
    setAdjustContextQualifier('during')
    setAdjustContextPickerOpen(false)
  }

  function advanceAdjustmentBranch(nextAdjustment: TaskAdjustmentState, fromStep: TaskAdjustmentUiStepId, branchSteps: TaskAdjustmentUiStepId[]): void {
    const nextFlow = taskAdjustmentFlowSteps(nextAdjustment)
    const currentBranch = nextFlow.filter((step) => branchSteps.includes(step))
    const currentIndex = currentBranch.indexOf(fromStep)
    const nextStep = currentBranch[currentIndex + 1]
    if (!nextStep) {
      returnToAdjustmentMainPage()
      return
    }
    const targetIndex = nextFlow.indexOf(nextStep)
    if (targetIndex >= 0) {
      setTaskAdjustmentUiStepIndex(targetIndex)
      return
    }
    returnToAdjustmentMainPage()
  }

  function addAdjustCategoryTag(label: string): void {
    const clean = normalizeTagLabel(label)
    if (!clean || !taskAdjustment || !selectedUser) return
    const existing = state.categories.find((category) => normalizeTagLabel(category.label) === clean)
    const willAdd = existing
      ? !taskAdjustment.selectedCategoryIds.includes(existing.id)
      : true
    if (existing) {
      if (!taskAdjustment.selectedCategoryIds.includes(existing.id)) {
        setTaskAdjustment((previous) => previous ? { ...previous, selectedCategoryIds: [...previous.selectedCategoryIds, existing.id] } : previous)
      }
    } else {
      const newCategory: CategoryDefinition = {
        id: crypto.randomUUID(),
        createdBy: selectedUser.id,
        createdAt: new Date().toISOString(),
        label: clean,
        definition: `User-created category for ${clean}.`,
        status: 'active',
      }
      updateState((previous) => ({ ...previous, categories: [...previous.categories, newCategory] }))
      setTaskAdjustment((previous) => previous ? { ...previous, selectedCategoryIds: [...previous.selectedCategoryIds, newCategory.id] } : previous)
    }
    setAdjustCategoryInput('')
    setAdjustCategoryPickerOpen(false)
    setAdjustCategorySuggestionIndex(0)
    if (willAdd) returnToAdjustmentMainPage()
  }

  function removeAdjustCategoryTag(label: string): void {
    const category = state.categories.find((entry) => entry.label === label)
    if (!category) return
    setTaskAdjustment((previous) => previous ? { ...previous, selectedCategoryIds: previous.selectedCategoryIds.filter((id) => id !== category.id) } : previous)
  }

  function addAdjustContext(conceptId: string, qualifier: string = adjustContextQualifier): void {
    if (!taskAdjustment) return
    const willAdd = !taskAdjustment.preferredContexts.some((context) => context.conceptId === conceptId && context.qualifier === qualifier)
    setTaskAdjustment((previous) => previous ? {
      ...previous,
      preferredContexts: previous.preferredContexts.some((context) => context.conceptId === conceptId && context.qualifier === qualifier)
        ? previous.preferredContexts
        : [...previous.preferredContexts, { conceptId, qualifier }],
    } : previous)
    setAdjustContextInput('')
    setAdjustPendingContextId(null)
    setAdjustContextPickerOpen(false)
    setAdjustContextSuggestionIndex(0)
    if (willAdd) returnToAdjustmentMainPage()
  }

  function removeAdjustContext(conceptId: string, qualifier: string): void {
    setTaskAdjustment((previous) => previous ? {
      ...previous,
      preferredContexts: previous.preferredContexts.filter((context) => !(context.conceptId === conceptId && context.qualifier === qualifier)),
    } : previous)
  }

  function handleAdjustCategoryKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAdjustCategorySuggestionIndex((current) => rotateIndex(current, Math.max(1, adjustCategorySuggestions.length), 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAdjustCategorySuggestionIndex((current) => rotateIndex(current, Math.max(1, adjustCategorySuggestions.length), -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = adjustCategorySuggestions[adjustCategorySuggestionIndex] ?? adjustCategoryInput
      if (picked) addAdjustCategoryTag(picked)
    } else if (event.key === 'Escape') {
      setAdjustCategoryPickerOpen(false)
    }
  }

  function handleAdjustContextKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAdjustContextSuggestionIndex((current) => rotateIndex(current, Math.max(1, adjustContextSuggestions.length), 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAdjustContextSuggestionIndex((current) => rotateIndex(current, Math.max(1, adjustContextSuggestions.length), -1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = adjustContextSuggestions[adjustContextSuggestionIndex]
      if (chosen) {
        setAdjustPendingContextId(chosen.id)
        setAdjustContextQualifier(conceptSpecifiers(chosen)[0] ?? 'during')
      }
      return
    }

    if (event.key === 'Escape') {
      setAdjustContextPickerOpen(false)
    }
  }

  function goBackFromAdjustment(): void {
    if (!taskAdjustment) return
    if (taskAdjustmentCurrentStep === 'summary') {
      closeTaskAdjustment()
      return
    }
    if (taskAdjustmentCurrentStep === 'title' || taskAdjustmentCurrentStep === 'importance' || taskAdjustmentCurrentStep === 'category' || taskAdjustmentCurrentStep === 'context' || taskAdjustmentCurrentStep === 'notes') {
      returnToAdjustmentMainPage()
      return
    }
    goToAdjustmentStep(taskAdjustmentCurrentStepIndex - 1)
  }

  function dismissToast(): void {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }
    setToast(null)
  }

  function showToast(message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }): void {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current)
    }

    setToast({
      id: Date.now(),
      message,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
    })

    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimeoutRef.current = null
    }, options?.duration ?? 3600)
  }

  function clearArchiveEntry(entryId: string): void {
    updateState((previous) => ({
      ...previous,
      archives: previous.archives.filter((entry) => entry.id !== entryId),
    }))
    showToast('Archive item removed.')
  }

  function clearArchiveTaskGroup(taskId: string): void {
    updateState((previous) => ({
      ...previous,
      archives: previous.archives.filter((entry) => archiveEntryTaskId(entry) !== taskId),
    }))
    showToast('Archived task removed.')
  }

  function recoverArchivedTask(taskId: string): void {
    const relatedEntries = state.archives.filter((entry) => archiveEntryTaskId(entry) === taskId)
    const taskEntry = relatedEntries.find((entry) => entry.entityType === 'task')
    if (!taskEntry) return

    const taskSnapshot = taskEntry.snapshot as TaskDefinition
    const profileSnapshots = relatedEntries
      .filter((entry) => entry.entityType === 'userTaskProfile')
      .map((entry) => entry.snapshot as UserTaskProfile)
    const sharedCategorySnapshots = relatedEntries
      .filter((entry) => entry.entityType === 'sharedTaskCategory')
      .map((entry) => entry.snapshot as SharedTaskCategoryAssignment)
    const userCategorySnapshots = relatedEntries
      .filter((entry) => entry.entityType === 'userTaskCategory')
      .map((entry) => entry.snapshot as UserTaskCategoryAssignment)
    const logSnapshots = relatedEntries
      .filter((entry) => entry.entityType === 'log')
      .map((entry) => entry.snapshot as TaskLogEntry)

    updateState((previous) => ({
      ...previous,
      tasks: previous.tasks.some((task) => task.id === taskSnapshot.id) ? previous.tasks : [...previous.tasks, taskSnapshot],
      userTaskProfiles: [
        ...previous.userTaskProfiles,
        ...profileSnapshots.filter((profile) => !previous.userTaskProfiles.some((entry) => entry.id === profile.id)),
      ],
      sharedTaskCategories: [
        ...previous.sharedTaskCategories,
        ...sharedCategorySnapshots.filter((assignment) => !previous.sharedTaskCategories.some((entry) => entry.id === assignment.id)),
      ],
      userTaskCategories: [
        ...previous.userTaskCategories,
        ...userCategorySnapshots.filter((assignment) => !previous.userTaskCategories.some((entry) => entry.id === assignment.id)),
      ],
      logs: [
        ...previous.logs,
        ...logSnapshots.filter((log) => !previous.logs.some((entry) => entry.id === log.id)),
      ],
      archives: previous.archives.filter((entry) => archiveEntryTaskId(entry) !== taskId),
    }))
    showToast('Task recovered from archive.')
  }

  function clearAllArchives(): void {
    if (state.archives.length === 0) return
    const confirmed = window.confirm('Clear the entire archive? This permanently removes all archived snapshots.')
    if (!confirmed) return
    updateState((previous) => ({
      ...previous,
      archives: [],
    }))
    showToast('Archive cleared.')
  }

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      deferredInstallPrompt.current = e
      setCanInstallPwa(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    setRoomCodeInput(roomCode)
  }, [roomCode])

  useEffect(() => {
    if (taskComposerOpen) {
      window.setTimeout(() => nameInputRef.current?.focus(), 120)
    }
  }, [taskComposerOpen])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedTaskName(taskDraft.actionText.trim())
    }, 950)

    return () => window.clearTimeout(handle)
  }, [taskDraft.actionText])

  useEffect(() => {
    const measureEl = nameMeasureRef.current
    if (!measureEl) return
    const text = taskDraft.actionText || 'clean the apartment'
    measureEl.textContent = text
    setTaskInputWidthPx(Math.ceil(measureEl.getBoundingClientRect().width) + 2)
  }, [taskDraft.actionText])

  useEffect(() => {
    if (!taskDraft.actionText.trim()) {
      setTaskSentenceModeIndex(0)
      setSentenceCaret('name')
    }
  }, [taskDraft.actionText])

  useEffect(() => {
    if (!showTaskCadenceTeaser) {
      setSentenceCaret('name')
      return
    }

    setSentenceCaret((current) => (current === 'name' ? 'mode' : current))
  }, [showTaskCadenceTeaser])

  useEffect(() => {
    if (!showTaskCadenceTeaser) {
      setRenderedSentenceMode('at-one-point')
      return
    }

    const handle = window.setTimeout(() => {
      setRenderedSentenceMode(taskDraft.sentenceMode)
    }, 130)

    return () => window.clearTimeout(handle)
  }, [showTaskCadenceTeaser, taskDraft.sentenceMode])

  useEffect(() => {
    if (categorySuggestionIndex < categorySuggestions.length) return
    setCategorySuggestionIndex(0)
  }, [categorySuggestionIndex, categorySuggestions.length])

  useEffect(() => {
    setTaskComposerUiStepIndex((current) => Math.min(current, Math.max(0, taskComposerFlow.length - 1)))
  }, [taskComposerFlow.length])

  useEffect(() => {
    setTaskAdjustmentUiStepIndex((current) => Math.min(current, Math.max(0, taskAdjustmentFlow.length - 1)))
  }, [taskAdjustmentFlow.length])

  useEffect(() => {
    if (!showSubjectiveComposer) return

    const focusMap: Record<SubjectiveCategory, HTMLElement | null> = {
      importance: subjectiveImportanceSpinnerRef.current,
      difficulty: subjectiveDifficultySpinnerRef.current,
      time: subjectiveTimeSpinnerRef.current,
      focus: subjectiveFocusSpinnerRef.current,
    }

    const nextTarget = focusMap[subjectiveCaret]
    if (nextTarget && document.activeElement !== nextTarget) {
      window.setTimeout(() => nextTarget.focus(), 0)
    }
  }, [showSubjectiveComposer, subjectiveCaret])

  useEffect(() => {
    if (!skipFlow) return

    const visibleParts = visibleSkipSentenceParts(skipFlow)
    if (visibleParts.includes(skipSentenceCaret)) return
    setSkipSentenceCaret(visibleParts[0] ?? 'scope')
  }, [skipFlow, skipSentenceCaret])

  useEffect(() => {
    if (!skipFlow) return
    if (!skipCategoryOptions.length) return
    if (skipFlow.categoryCursorId) return

    setSkipFlow((previous) => {
      if (!previous || previous.categoryCursorId) return previous
      return { ...previous, categoryCursorId: skipCategoryOptions[0]?.id ?? '' }
    })
  }, [skipFlow, skipCategoryOptions])

  useEffect(() => {
    if (!skipFlow) return
    if (!skipConceptOptions.length) return
    if (skipFlow.conceptId) return

    const firstConcept = skipConceptOptions[0]?.id
    const firstSpecifier = skipSpecifierOptions[0] ?? 'during'
    if (!firstConcept) return

    setSkipFlow((previous) => {
      if (!previous || previous.conceptId) return previous
      return {
        ...previous,
        conceptId: firstConcept,
        contextSpecifier: firstSpecifier,
      }
    })
  }, [skipFlow, skipConceptOptions, skipSpecifierOptions])

  useEffect(() => {
    if (!skipFlow) return
    if (!skipSpecifierOptions.length) return
    if (skipSpecifierOptions.includes(skipFlow.contextSpecifier)) return

    setSkipFlow((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        contextSpecifier: skipSpecifierOptions[0] ?? 'during',
      }
    })
  }, [skipFlow, skipSpecifierOptions])

  useEffect(() => {
    if (skipCategorySuggestionIndex < skipCategorySuggestions.length) return
    setSkipCategorySuggestionIndex(0)
  }, [skipCategorySuggestionIndex, skipCategorySuggestions.length])

  useEffect(() => {
    if (!skipFlow) return

    const focusMap: Record<SkipSentenceCaret, HTMLElement | null> = {
      scope: skipScopeSpinnerRef.current,
      discomfort: skipDiscomfortSpinnerRef.current,
      category: skipCategorySpinnerRef.current,
      specifier: skipSpecifierSpinnerRef.current,
      concept: skipConceptSpinnerRef.current,
    }

    const nextTarget = focusMap[skipSentenceCaret]
    if (nextTarget && document.activeElement !== nextTarget) {
      window.setTimeout(() => nextTarget.focus(), 0)
    }
  }, [skipFlow, skipSentenceCaret])

  useEffect(() => {
    if (!taskComposerOpen) return

    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [taskComposerOpen])

  useEffect(() => {
    if (!skipFlow) return

    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [skipFlow])

  useEffect(() => {
    setTaskDraft((previous) => ({
      ...previous,
      sentenceMode: TASK_SENTENCE_MODE_OPTIONS[taskSentenceModeIndex]?.id ?? 'at-one-point',
    }))
  }, [taskSentenceModeIndex])

  useEffect(() => {
    setTaskDraft((previous) => ({
      ...previous,
      countChoice: COUNT_OPTIONS[countOptionIndex]?.id ?? '1',
    }))
  }, [countOptionIndex])

  useEffect(() => {
    setTaskDraft((previous) => ({
      ...previous,
      oneTimeFrame: ONE_TIME_FRAME_OPTIONS[oneTimeFrameIndex]?.id ?? 'between',
    }))
  }, [oneTimeFrameIndex])

  useEffect(() => {
    setTaskDraft((previous) => ({
      ...previous,
      frequencyCount: FREQUENCY_COUNT_OPTIONS[frequencyCountIndex]?.id ?? '1',
    }))
  }, [frequencyCountIndex])

  useEffect(() => {
    const nextFrequency = FREQUENCY_STARTER_OPTIONS[frequencyStarterIndex]?.id ?? 'week'
    const nextEvery = Number(FREQUENCY_COUNT_OPTIONS[frequencyCountIndex]?.id ?? '1')
    setTaskDraft((previous) => ({
      ...previous,
      frequencyStarter: nextFrequency,
      every: nextEvery,
      unit: nextFrequency,
    }))
  }, [frequencyStarterIndex, frequencyCountIndex])

  useEffect(() => {
    setTaskDraft((previous) => ({
      ...previous,
      timeframeQualifier: TIMEFRAME_QUALIFIER_OPTIONS[timeframeQualifierIndex]?.id ?? 'none',
    }))
  }, [timeframeQualifierIndex])

  useEffect(() => {
    if (!timeframeOptions.length) return
    if (timeframeIndex < timeframeOptions.length) return
    setTimeframeIndex(0)
  }, [timeframeIndex, timeframeOptions])

  useEffect(() => {
    setTaskDraft((previous) => ({
      ...previous,
      timeframe: timeframeOptions[timeframeIndex]?.id ?? 'in-general',
    }))
  }, [timeframeIndex, timeframeOptions])

  useEffect(() => {
    const selectedTimeframe = timeframeOptions[timeframeIndex]?.id ?? 'in-general'
    const selectedQualifier = TIMEFRAME_QUALIFIER_OPTIONS[timeframeQualifierIndex]?.id ?? 'none'
    const allowed = allowedTimeframeQualifiers(selectedTimeframe)
    if (allowed.includes(selectedQualifier)) return
    const nextQualifierIndex = TIMEFRAME_QUALIFIER_OPTIONS.findIndex((option) => option.id === allowed[0])
    setTimeframeQualifierIndex(nextQualifierIndex >= 0 ? nextQualifierIndex : 0)
  }, [timeframeIndex, timeframeQualifierIndex, timeframeOptions])

  useEffect(() => {
    const focusMap: Record<SentenceCaretPart, HTMLElement | null> = {
      name: nameInputRef.current,
      mode: modeSpinnerRef.current,
      count: countSpinnerRef.current,
      'one-time-frame': oneTimeSpinnerRef.current,
      'frequency-count': frequencyCountSpinnerRef.current,
      'frequency-starter': frequencySpinnerRef.current,
      'timeframe-qualifier': timeframeQualifierSpinnerRef.current,
      timeframe: timeframeSpinnerRef.current,
    }

    const nextTarget = focusMap[sentenceCaret]
    if (nextTarget && document.activeElement !== nextTarget) {
      window.setTimeout(() => nextTarget.focus(), 0)
    }
  }, [sentenceCaret])

  function patchLog(logId: string, patch: Partial<TaskAction>): void {
    updateState((previous) => ({
      ...previous,
      logs: previous.logs.map((log) => (log.id === logId ? { ...log, ...patch } : log)),
    }))
  }

  function addLog(userTaskProfileId: string, action: TaskAction['action']): string | null {
    if (!selectedUser) return null
    const profile = state.userTaskProfiles.find((entry) => entry.id === userTaskProfileId)
    if (!profile) return null

    const id = crypto.randomUUID()
    updateState((previous) => ({
      ...previous,
      logs: [
        ...previous.logs,
        {
          id,
          userTaskProfileId,
          taskId: profile.taskId,
          userId: selectedUser.id,
          action,
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    return id
  }

  function openDoneFlow(userTaskProfileId: string): void {
    const logId = addLog(userTaskProfileId, 'done')
    if (!logId) return
    showToast('Done recorded.', {
      actionLabel: 'Add feeling',
      onAction: () => {
        dismissToast()
        setDoneFlow({ userTaskProfileId, logId, note: '' })
      },
      duration: 4200,
    })
  }

  function openSkipFlow(userTaskProfileId: string): void {
    const logId = addLog(userTaskProfileId, 'skip')
    if (!logId) return
    showToast('Skip recorded.', {
      actionLabel: 'Add reason',
      onAction: () => {
        dismissToast()
        setSkipSentenceCaret('scope')
        setSkipUiStep('scope')
        setSkipCategoryQuery('')
        setSkipCategorySuggestionIndex(0)
        setSkipContextInput('')
        setSkipContextSuggestionIndex(0)
        setSkipContextPickerOpen(false)
        setSkipPendingContextId(null)
        setSkipFlow(defaultSkipFlow(userTaskProfileId, logId))
      },
      duration: 4200,
    })
  }

  function saveDoneFlow(): void {
    if (!doneFlow) return
    patchLog(doneFlow.logId, {
      mood: doneFlow.mood,
      note: doneFlow.note.trim() || undefined,
    })
    setDoneFlow(null)
    setDoneNoteOpen(false)
    showToast('Done recorded.')
  }

  function openTaskComposer(): void {
    clearTaskComposer()
    setTaskComposerUiStepIndex(0)
    setTaskComposerOpen(true)
  }

  function clearTaskComposer(): void {
    setTaskDraft(defaultTaskDraft())
    setDebouncedTaskName('')
    setTaskSentenceModeIndex(0)
    setCountOptionIndex(0)
    setOneTimeFrameIndex(0)
    setFrequencyCountIndex(0)
    setFrequencyStarterIndex(1)
    setTimeframeQualifierIndex(0)
    setTimeframeIndex(0)
    setSentenceBranchPicked({
      frequency: false,
      oneTime: false,
      quantity: false,
    })
    setShowSubjectiveComposer(false)
    setSubjectiveSelections({})
    setSubjectiveCaret('importance')
    setCategoryTagInput('')
    setSelectedCategoryTags([])
    setCategorySuggestionIndex(0)
    setTagPickerOpen(false)
    setComposerContextInput('')
    setComposerPendingContextId(null)
    setComposerContextQualifier('during')
    setComposerContextPickerOpen(false)
    setComposerContextSuggestionIndex(0)
    setComposerPreferredContexts([])
    setSentenceCaret('name')
    setTaskComposerUiStepIndex(0)
    setTaskComposerOptionalPath(null)
  }

  function moveSentenceCaret(delta: number): void {
    const parts = visibleSentenceParts(showTaskCadenceTeaser, taskDraft)
    const currentIndex = Math.max(0, parts.indexOf(sentenceCaret))
    const nextIndex = Math.max(0, Math.min(parts.length - 1, currentIndex + delta))
    setSentenceCaret(parts[nextIndex] ?? 'name')
  }

  function rotateTaskSentenceMode(delta: number): void {
    setTaskSentenceModeIndex((current) => rotateIndex(current, TASK_SENTENCE_MODE_OPTIONS.length, delta))
  }

  function rotateCountOption(delta: number): void {
    setSentenceBranchPicked((current) => ({ ...current, quantity: true }))
    setCountOptionIndex((current) => rotateIndex(current, COUNT_OPTIONS.length, delta))
  }

  function rotateOneTimeFrame(delta: number): void {
    setSentenceBranchPicked((current) => ({ ...current, oneTime: true }))
    setOneTimeFrameIndex((current) => rotateIndex(current, ONE_TIME_FRAME_OPTIONS.length, delta))
  }

  function rotateFrequencyCount(delta: number): void {
    setSentenceBranchPicked((current) => ({ ...current, frequency: true }))
    setFrequencyCountIndex((current) => rotateIndex(current, FREQUENCY_COUNT_OPTIONS.length, delta))
  }

  function rotateFrequencyStarter(delta: number): void {
    setSentenceBranchPicked((current) => ({ ...current, frequency: true }))
    setFrequencyStarterIndex((current) => rotateIndex(current, FREQUENCY_STARTER_OPTIONS.length, delta))
  }

  function rotateTimeframe(delta: number): void {
    if (taskDraft.sentenceMode === 'every') {
      setSentenceBranchPicked((current) => ({ ...current, frequency: true }))
    }
    if (taskDraft.sentenceMode === 'one-time') {
      setSentenceBranchPicked((current) => ({ ...current, oneTime: true }))
    }
    if (['at-least', 'exactly', 'more-than'].includes(taskDraft.sentenceMode)) {
      setSentenceBranchPicked((current) => ({ ...current, quantity: true }))
    }
    setTimeframeIndex((current) => rotateIndex(current, timeframeOptions.length, delta))
  }

  function rotateTimeframeQualifier(delta: number): void {
    const selectedTimeframe = timeframeOptions[timeframeIndex]?.id ?? 'in-general'
    const allowed = allowedTimeframeQualifiers(selectedTimeframe)
    const allowedIndices = TIMEFRAME_QUALIFIER_OPTIONS
      .map((option, index) => (allowed.includes(option.id) ? index : -1))
      .filter((index) => index >= 0)
    if (!allowedIndices.length) return

    const currentAllowedPosition = Math.max(0, allowedIndices.indexOf(timeframeQualifierIndex))
    const nextAllowedPosition = rotateIndex(currentAllowedPosition, allowedIndices.length, delta)
    setTimeframeQualifierIndex(allowedIndices[nextAllowedPosition] ?? allowedIndices[0])

    if (taskDraft.sentenceMode === 'every') {
      setSentenceBranchPicked((current) => ({ ...current, frequency: true }))
    }
    if (taskDraft.sentenceMode === 'one-time') {
      setSentenceBranchPicked((current) => ({ ...current, oneTime: true }))
    }
    if (['at-least', 'exactly', 'more-than'].includes(taskDraft.sentenceMode)) {
      setSentenceBranchPicked((current) => ({ ...current, quantity: true }))
    }
  }

  function rotateSubjectiveCategory(category: SubjectiveCategory, delta: number): void {
    const options = SUBJECTIVE_OPTIONS_BY_CATEGORY[category]
    if (!options.length) return
    const currentId = effectiveSubjectiveSelections[category].id
    const currentIndex = Math.max(0, options.findIndex((option) => option.id === currentId))
    const nextIndex = rotateIndex(currentIndex, options.length, delta)
    const nextOption = options[nextIndex]
    if (!nextOption) return

    setSubjectiveSelections((previous) => ({
      ...previous,
      [category]: nextOption,
    }))
  }

  function moveSubjectiveCaret(delta: number): void {
    const currentIndex = Math.max(0, SUBJECTIVE_CATEGORY_ORDER.indexOf(subjectiveCaret))
    const nextIndex = Math.max(0, Math.min(SUBJECTIVE_CATEGORY_ORDER.length - 1, currentIndex + delta))
    setSubjectiveCaret(SUBJECTIVE_CATEGORY_ORDER[nextIndex] ?? 'importance')
  }

  function handleSubjectiveSpinnerKeyDown(event: KeyboardEvent<HTMLElement>, category: SubjectiveCategory): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      rotateSubjectiveCategory(category, 1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      rotateSubjectiveCategory(category, -1)
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault()
      moveSubjectiveCaret(1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveSubjectiveCaret(-1)
    }
  }

  function handleSubjectiveTouchStart(event: TouchEvent<HTMLElement>): void {
    subjectiveTouchStartRef.current = event.touches[0]?.clientY ?? null
  }

  function handleSubjectiveTouchEnd(event: TouchEvent<HTMLElement>, category: SubjectiveCategory): void {
    const start = subjectiveTouchStartRef.current
    const end = event.changedTouches[0]?.clientY
    subjectiveTouchStartRef.current = null
    if (start == null || end == null) return
    const delta = start - end
    if (Math.abs(delta) < 14) return
    rotateSubjectiveCategory(category, delta > 0 ? 1 : -1)
  }

  function visibleSkipSentenceParts(flow: SkipFlowState): SkipSentenceCaret[] {
    const parts: SkipSentenceCaret[] = ['scope']
    if (flow.scope === 'today-only') {
      return parts
    }

    parts.push('discomfort')

    if (flow.scope === 'sort-of-task') {
      parts.push('category')
    }

    if (skipConceptOptions.length > 0) {
      parts.push('specifier', 'concept')
    }
    return parts
  }

  function moveSkipSentenceCaret(delta: number): void {
    if (!skipFlow) return
    const parts = visibleSkipSentenceParts(skipFlow)
    const currentIndex = Math.max(0, parts.indexOf(skipSentenceCaret))
    const nextIndex = Math.max(0, Math.min(parts.length - 1, currentIndex + delta))
    setSkipSentenceCaret(parts[nextIndex] ?? 'scope')
  }

  function rotateSkipScope(delta: number): void {
    setSkipFlow((previous) => {
      if (!previous) return previous
      const currentIndex = Math.max(0, SKIP_SCOPE_OPTIONS.findIndex((option) => option.id === previous.scope))
      const nextIndex = rotateIndex(currentIndex, SKIP_SCOPE_OPTIONS.length, delta)
      return {
        ...previous,
        scope: SKIP_SCOPE_OPTIONS[nextIndex]?.id ?? previous.scope,
        conceptId: SKIP_SCOPE_OPTIONS[nextIndex]?.id === 'today-only' ? '' : previous.conceptId,
      }
    })
  }

  function selectSkipScope(scope: SkipScope): void {
    setSkipFlow((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        scope,
        categoryIds: scope === 'sort-of-task' ? previous.categoryIds : [],
        categoryCursorId: scope === 'sort-of-task' ? previous.categoryCursorId : '',
        conceptId: scope === 'today-only' ? '' : previous.conceptId,
      }
    })
    setSkipUiStep('questions')
    if (scope === 'today-only') {
      setSkipPendingContextId(null)
      setSkipContextInput('')
      setSkipContextPickerOpen(false)
      setSkipRevealedSections(new Set())
      return
    }
    setSkipRevealedSections(new Set())
  }

  function rotateSkipDiscomfort(delta: number): void {
    setSkipFlow((previous) => {
      if (!previous) return previous
      const currentIndex = Math.max(0, DISCOMFORT_OPTIONS.findIndex((option) => option === previous.discomfort))
      const nextIndex = rotateIndex(currentIndex, DISCOMFORT_OPTIONS.length, delta)
      return { ...previous, discomfort: DISCOMFORT_OPTIONS[nextIndex] ?? previous.discomfort }
    })
  }

  function rotateSkipCategory(delta: number): void {
    if (!skipFlow) return
    const options = skipCategoryOptions
    setSkipFlow((previous) => {
      if (!previous) return previous
      if (!options.length) return previous
      const currentIndex = Math.max(0, options.findIndex((option) => option.id === previous.categoryCursorId))
      const nextIndex = rotateIndex(currentIndex, options.length, delta)
      return { ...previous, categoryCursorId: options[nextIndex]?.id ?? previous.categoryCursorId }
    })
  }

  function rotateSkipConcept(delta: number): void {
    if (!skipFlow) return
    const options = skipConceptOptions
    setSkipFlow((previous) => {
      if (!previous) return previous
      if (!options.length) return previous
      const currentIndex = Math.max(0, options.findIndex((option) => option.id === previous.conceptId))
      const nextIndex = rotateIndex(currentIndex, options.length, delta)
      const nextConceptId = options[nextIndex]?.id ?? previous.conceptId
      const nextConcept = sharedConcepts.find((concept) => concept.id === nextConceptId)
      const allowedSpecifiers = nextConcept ? conceptSpecifiers(nextConcept) : ['during']
      return {
        ...previous,
        conceptId: nextConceptId,
        contextSpecifier: allowedSpecifiers.includes(previous.contextSpecifier)
          ? previous.contextSpecifier
          : (allowedSpecifiers[0] ?? 'during'),
      }
    })
  }

  function rotateSkipSpecifier(delta: number): void {
    setSkipFlow((previous) => {
      if (!previous) return previous
      if (!skipSpecifierOptions.length) return previous
      const currentIndex = Math.max(0, skipSpecifierOptions.findIndex((option) => option === previous.contextSpecifier))
      const nextIndex = rotateIndex(currentIndex, skipSpecifierOptions.length, delta)
      return {
        ...previous,
        contextSpecifier: skipSpecifierOptions[nextIndex] ?? previous.contextSpecifier,
      }
    })
  }

  function addSkipCategoryFromCursor(): void {
    setSkipFlow((previous) => {
      if (!previous || !previous.categoryCursorId) return previous
      if (previous.categoryIds.includes(previous.categoryCursorId)) return previous
      return { ...previous, categoryIds: [...previous.categoryIds, previous.categoryCursorId] }
    })
  }

  function addSkipCategoryByLabel(rawLabel: string): void {
    const query = rawLabel.trim()
    if (!query) return

    const normalizedQuery = normalizeTagLabel(query)
    const matchedCategory = state.categories.find((category) => normalizeTagLabel(category.label) === normalizedQuery)

    if (matchedCategory) {
      setSkipFlow((previous) => {
        if (!previous) return previous
        if (previous.categoryIds.includes(matchedCategory.id)) return previous
        return {
          ...previous,
          categoryIds: [...previous.categoryIds, matchedCategory.id],
          categoryCursorId: matchedCategory.id,
          newCategoryLabel: '',
        }
      })
    } else {
      const newId = crypto.randomUUID()
      const newCategory: CategoryDefinition = {
        id: newId,
        createdBy: selectedUser?.id ?? 'user-me',
        createdAt: new Date().toISOString(),
        label: query,
        definition: 'Created from skip reflection.',
        status: 'active',
      }
      updateState((previous) => ({
        ...previous,
        categories: [...previous.categories, newCategory],
      }))
      setSkipFlow((previous) => previous ? {
        ...previous,
        categoryIds: previous.categoryIds.includes(newId) ? previous.categoryIds : [...previous.categoryIds, newId],
        categoryCursorId: newId,
        newCategoryLabel: query,
      } : previous)
    }

    setSkipCategoryQuery('')
    setSkipCategorySuggestionIndex(0)
    setSkipCategoryDropdownOpen(false)
    setSkipRevealedSections((previous) => new Set(previous).add('categories'))
    setSkipUiStep('questions')
  }

  function addSkipContext(conceptId: string, qualifier: string): void {
    setSkipFlow((previous) => previous ? {
      ...previous,
      conceptId,
      contextSpecifier: qualifier,
    } : previous)
    setSkipPendingContextId(null)
    setSkipContextInput('')
    setSkipContextSuggestionIndex(0)
    setSkipContextPickerOpen(false)
    setSkipRevealedSections((previous) => new Set(previous).add('when'))
    setSkipUiStep('questions')
  }

  function openSkipQuestion(step: Exclude<SkipUiStep, 'scope' | 'questions'>): void {
    setSkipUiStep(step)
    if (step === 'categories') {
      setSkipCategoryDropdownOpen(true)
      return
    }
    if (step === 'when') {
      setSkipContextPickerOpen(true)
    }
  }

  function chooseSkipWhy(option: string): void {
    setSkipFlow((previous) => previous ? { ...previous, discomfort: option } : previous)
    setSkipRevealedSections((previous) => new Set(previous).add('why'))
    setSkipUiStep('questions')
  }

  function goBackFromSkip(): void {
    if (skipUiStep === 'scope' || skipUiStep === 'questions') {
      closeSkipFlowWithoutReflection()
      return
    }
    setSkipUiStep('questions')
  }

  function removeSkipContext(): void {
    setSkipFlow((previous) => previous ? {
      ...previous,
      conceptId: '',
      contextSpecifier: 'during',
    } : previous)
    setSkipPendingContextId(null)
  }

  function handleSkipContextKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSkipContextSuggestionIndex((current) => rotateIndex(current, Math.max(1, skipContextSuggestions.length), 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSkipContextSuggestionIndex((current) => rotateIndex(current, Math.max(1, skipContextSuggestions.length), -1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = skipContextSuggestions[skipContextSuggestionIndex]
      if (chosen) {
        setSkipPendingContextId(chosen.id)
        setSkipFlow((previous) => previous ? {
          ...previous,
          contextSpecifier: conceptSpecifiers(chosen)[0] ?? 'during',
        } : previous)
      }
      return
    }

    if (event.key === 'Escape') {
      setSkipContextPickerOpen(false)
    }
  }

  function handleSkipCategoryQueryKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      setSkipCategoryDropdownOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSkipCategoryDropdownOpen(true)
      setSkipCategorySuggestionIndex((current) => rotateIndex(current, Math.max(1, skipCategorySuggestions.length), 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSkipCategoryDropdownOpen(true)
      setSkipCategorySuggestionIndex((current) => rotateIndex(current, Math.max(1, skipCategorySuggestions.length), -1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const picked = skipCategorySuggestions[skipCategorySuggestionIndex]
      if (picked) {
        addSkipCategoryByLabel(picked.label)
      } else if (skipCategoryQuery.trim()) {
        addSkipCategoryByLabel(skipCategoryQuery)
      }
    }
  }

  function closeSkipFlowWithoutReflection(): void {
    if (!skipFlow) return
    const hasSkipLog = state.logs.some((log) => log.id === skipFlow.logId && log.action === 'skip')
    if (!hasSkipLog) {
      addLog(skipFlow.userTaskProfileId, 'skip')
    }
    setSkipFlow(null)
    setSkipRevealedSections(new Set())
    setSkipUiStep('scope')
    setSkipCategoryQuery('')
    setSkipCategorySuggestionIndex(0)
    setSkipCategoryDropdownOpen(false)
    setSkipContextInput('')
    setSkipContextSuggestionIndex(0)
    setSkipContextPickerOpen(false)
    setSkipPendingContextId(null)
  }

  function removeSkipCategory(categoryId: string): void {
    setSkipFlow((previous) => {
      if (!previous) return previous
      return { ...previous, categoryIds: previous.categoryIds.filter((id) => id !== categoryId) }
    })
  }

  function handleSkipSpinnerKeyDown(event: KeyboardEvent<HTMLElement>, rotate: (delta: number) => void): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      rotate(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      rotate(-1)
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault()
      moveSkipSentenceCaret(1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveSkipSentenceCaret(-1)
    }
  }

  function handleSkipTouchStart(event: TouchEvent<HTMLElement>): void {
    skipTouchStartRef.current = event.touches[0]?.clientY ?? null
  }

  function handleSkipTouchEnd(event: TouchEvent<HTMLElement>, rotate: (delta: number) => void): void {
    const start = skipTouchStartRef.current
    const end = event.changedTouches[0]?.clientY
    skipTouchStartRef.current = null
    if (start == null || end == null) return
    const delta = start - end
    if (Math.abs(delta) < 14) return
    rotate(delta > 0 ? 1 : -1)
  }

  function addCategoryTag(rawValue: string): void {
    const cleanLabel = normalizeTagLabel(rawValue)
    if (!cleanLabel) return
    const willAdd = !selectedCategoryTags.includes(cleanLabel)

    setSelectedCategoryTags((previous) => {
      if (previous.includes(cleanLabel)) return previous
      return [...previous, cleanLabel]
    })
    setCategoryTagInput('')
    setCategorySuggestionIndex(0)
    if (willAdd && taskComposerOptionalPath === 'categories') {
      returnToTaskComposerMainPage()
    }
  }

  function removeCategoryTag(label: string): void {
    setSelectedCategoryTags((previous) => previous.filter((entry) => entry !== label))
  }

  function commitCategoryTagInput(): void {
    if (!categoryTagInput.trim()) return
    const exactMatch = existingCategoryTags.find((label) => label === normalizedTagQuery)
    addCategoryTag(exactMatch ?? categoryTagInput)
  }

  function addComposerContext(conceptId: string, qualifier: string = composerContextQualifier): void {
    const willAdd = !composerPreferredContexts.some((context) => context.conceptId === conceptId && context.qualifier === qualifier)
    setComposerPreferredContexts((previous) => {
      if (previous.some((context) => context.conceptId === conceptId && context.qualifier === qualifier)) return previous
      return [...previous, { conceptId, qualifier }]
    })
    setComposerContextInput('')
    setComposerPendingContextId(null)
    setComposerContextPickerOpen(false)
    setComposerContextSuggestionIndex(0)
    if (willAdd && taskComposerOptionalPath === 'context') {
      returnToTaskComposerMainPage()
    }
  }

  function removeComposerContext(conceptId: string, qualifier: string): void {
    setComposerPreferredContexts((previous) => previous.filter((context) => !(context.conceptId === conceptId && context.qualifier === qualifier)))
  }

  function handleComposerContextKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setComposerContextSuggestionIndex((current) => rotateIndex(current, Math.max(1, composerContextSuggestions.length), 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setComposerContextSuggestionIndex((current) => rotateIndex(current, Math.max(1, composerContextSuggestions.length), -1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = composerContextSuggestions[composerContextSuggestionIndex]
      if (chosen) {
        setComposerPendingContextId(chosen.id)
        setComposerContextQualifier(conceptSpecifiers(chosen)[0] ?? 'during')
      }
      return
    }

    if (event.key === 'Escape') {
      setComposerContextPickerOpen(false)
    }
  }

  function handleCategoryTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCategorySuggestionIndex((current) => rotateIndex(current, Math.max(1, categorySuggestions.length), 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCategorySuggestionIndex((current) => rotateIndex(current, Math.max(1, categorySuggestions.length), -1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = categorySuggestions[categorySuggestionIndex] ?? categoryTagInput
      addCategoryTag(chosen)
      return
    }

    if (event.key === 'Backspace' && categoryTagInput.length === 0 && selectedCategoryTags.length > 0) {
      event.preventDefault()
      setSelectedCategoryTags((previous) => previous.slice(0, Math.max(0, previous.length - 1)))
    }
  }

  function adjustSentenceCaretValue(delta: number): void {
    if (sentenceCaret === 'mode') {
      rotateTaskSentenceMode(delta)
      return
    }
    if (sentenceCaret === 'count') {
      rotateCountOption(delta)
      return
    }
    if (sentenceCaret === 'one-time-frame') {
      rotateOneTimeFrame(delta)
      return
    }
    if (sentenceCaret === 'frequency-count') {
      rotateFrequencyCount(delta)
      return
    }
    if (sentenceCaret === 'frequency-starter') {
      rotateFrequencyStarter(delta)
      return
    }
    if (sentenceCaret === 'timeframe-qualifier') {
      rotateTimeframeQualifier(delta)
      return
    }
    if (sentenceCaret === 'timeframe') {
      rotateTimeframe(delta)
    }
  }

  function handleTaskComposerKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && showTaskCadenceTeaser) {
      event.preventDefault()
      moveSentenceCaret(1)
      return
    }

    if (!showTaskCadenceTeaser) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (sentenceCaret !== 'name') {
        adjustSentenceCaretValue(1)
      }
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (sentenceCaret !== 'name') {
        adjustSentenceCaretValue(-1)
      }
    }
    if (event.key === 'ArrowRight') {
      const isInput = event.currentTarget instanceof HTMLInputElement
      const caretAtEnd = isInput && event.currentTarget.selectionStart === event.currentTarget.value.length && event.currentTarget.selectionEnd === event.currentTarget.value.length
      if (caretAtEnd) {
        event.preventDefault()
        moveSentenceCaret(1)
      }
    }
    if (event.key === 'ArrowLeft') {
      const isInput = event.currentTarget instanceof HTMLInputElement
      const caretAtStart = isInput && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0
      if (caretAtStart && sentenceCaret !== 'name') {
        event.preventDefault()
        moveSentenceCaret(-1)
      }
    }
  }

  function handleSpinnerKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      adjustSentenceCaretValue(1)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      adjustSentenceCaretValue(-1)
    }
    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault()
      moveSentenceCaret(1)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveSentenceCaret(-1)
    }
  }

  function handleTaskComposerTouchStart(event: TouchEvent<HTMLElement>): void {
    taskComposerTouchStartRef.current = event.touches[0]?.clientY ?? null
    sentenceTouchStartRef.current = {
      x: event.touches[0]?.clientX ?? 0,
      y: event.touches[0]?.clientY ?? 0,
    }
  }

  function handleTaskComposerTouchEnd(event: TouchEvent<HTMLElement>): void {
    const start = sentenceTouchStartRef.current
    const endX = event.changedTouches[0]?.clientX
    const endY = event.changedTouches[0]?.clientY
    taskComposerTouchStartRef.current = null
    sentenceTouchStartRef.current = null
    if (!start || endX == null || endY == null) return
    const deltaX = start.x - endX
    const deltaY = start.y - endY

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= 18) {
      moveSentenceCaret(deltaX > 0 ? 1 : -1)
      return
    }

    if (Math.abs(deltaY) >= 18 && sentenceCaret !== 'name') {
      adjustSentenceCaretValue(deltaY > 0 ? 1 : -1)
    }
  }

  function saveTask(): void {
    if (!selectedUser || !taskDraft.actionText.trim()) return

    const taskId = crypto.randomUUID()
    const definition = buildTaskDefinitionSentence(taskDraft, timeframeOptions)
    const effectiveImportance = effectiveSubjectiveSelections.importance.value ?? DEFAULT_SUBJECTIVE_VALUES.importance
    const effectiveDifficulty = effectiveSubjectiveSelections.difficulty.value ?? DEFAULT_SUBJECTIVE_VALUES.difficulty
    const effectiveTime = effectiveSubjectiveSelections.time.value ?? DEFAULT_SUBJECTIVE_VALUES.time
    const effectiveFocus = effectiveSubjectiveSelections.focus.value ?? DEFAULT_SUBJECTIVE_VALUES.focus
    const categoryLabels = [...new Set([
      ...selectedCategoryTags,
      ...(categoryTagInput.trim() ? [normalizeTagLabel(categoryTagInput)] : []),
    ])]

    updateState((previous) => {
      const existingByTag = new Map<string, CategoryDefinition>(
        previous.categories.map((category) => [normalizeTagLabel(category.label), category]),
      )
      const createdCategories: CategoryDefinition[] = categoryLabels
        .filter((label) => !existingByTag.has(label))
        .map((label) => ({
          id: crypto.randomUUID(),
          createdBy: selectedUser.id,
          createdAt: new Date().toISOString(),
          label,
          definition: `User-created category for ${label}.`,
          status: 'active' as const,
        }))

      const categoryIds = [...new Set(categoryLabels.map((label) => {
        const existing = existingByTag.get(label)
        if (existing) return existing.id
        const created = createdCategories.find((category) => normalizeTagLabel(category.label) === label)
        return created?.id
      }).filter(Boolean) as string[])]

      return {
        ...previous,
        tasks: [
          ...previous.tasks,
          {
            id: taskId,
            createdBy: selectedUser.id,
            createdAt: new Date().toISOString(),
            title: sentenceTitle(taskDraft.actionText),
            definition,
            desiredFrequency: {
              kind: 'interval',
              finite: false,
              every: Math.max(1, Math.round(taskDraft.every)),
              unit: taskDraft.unit,
            },
            defaultSubjectiveProfile: {
              importance: effectiveImportance,
              grandness: effectiveDifficulty,
              subjectiveTime: effectiveTime,
              focus: effectiveFocus,
            },
            sharedConceptIds: composerPreferredContexts.map((context) => context.conceptId),
            sharedContextLinks: composerPreferredContexts.map((context) => ({
              conceptId: context.conceptId,
              qualifier: context.qualifier,
            })),
            defaultTimePreference: taskDraft.timeSensitive
              ? {
                  dayGroup: taskDraft.dayGroup,
                  start: taskDraft.start,
                  end: taskDraft.end,
                }
              : undefined,
          },
        ],
        userTaskProfiles: [
          ...previous.userTaskProfiles,
          {
            id: crypto.randomUUID(),
            taskId,
            userId: selectedUser.id,
            basis: 'created',
            active: true,
            importance: effectiveImportance,
            grandness: effectiveDifficulty,
            subjectiveTime: effectiveTime,
            focus: effectiveFocus,
            preferredTime: taskDraft.timeSensitive
              ? { dayGroup: taskDraft.dayGroup, start: taskDraft.start, end: taskDraft.end }
              : undefined,
            notes: '',
            updatedAt: new Date().toISOString(),
          },
        ],
        categories: createdCategories.length ? [...previous.categories, ...createdCategories] : previous.categories,
        userTaskCategories: [
          ...previous.userTaskCategories,
          ...categoryIds.map((categoryId) => ({
            id: crypto.randomUUID(),
            taskId,
            userId: selectedUser.id,
            categoryId,
            source: 'personal' as const,
            createdAt: new Date().toISOString(),
          })),
        ],
      }
    })

    clearTaskComposer()
    setTaskComposerOpen(false)
    showToast('Task sentence saved.')
  }

  function openTaskAdjustment(userTaskProfileId: string): void {
    const next = taskAdjustmentFromState(state, userTaskProfileId)
    if (!next) return
    setTaskAdjustmentUiStepIndex(0)
    setAdjustContextInput('')
    setAdjustPendingContextId(null)
    setAdjustContextQualifier('during')
    setTaskAdjustment(next)
  }

  function saveTaskAdjustment(): void {
    if (!taskAdjustment || !selectedUser) return

    const profile = state.userTaskProfiles.find((entry) => entry.id === taskAdjustment.userTaskProfileId)
    if (!profile) return

    const categoryIds = [...new Set(taskAdjustment.selectedCategoryIds)]

    // Resolve subjective option IDs to numeric values
    const importanceValue = SUBJECTIVE_OPTIONS_BY_CATEGORY.importance.find((o) => o.id === taskAdjustment.importance)?.value ?? DEFAULT_SUBJECTIVE_VALUES.importance
    const grandnessValue = SUBJECTIVE_OPTIONS_BY_CATEGORY.difficulty.find((o) => o.id === taskAdjustment.grandness)?.value ?? DEFAULT_SUBJECTIVE_VALUES.difficulty
    const subjectiveTimeValue = SUBJECTIVE_OPTIONS_BY_CATEGORY.time.find((o) => o.id === taskAdjustment.subjectiveTime)?.value ?? DEFAULT_SUBJECTIVE_VALUES.time
    const focusValue = SUBJECTIVE_OPTIONS_BY_CATEGORY.focus.find((o) => o.id === taskAdjustment.focus)?.value ?? DEFAULT_SUBJECTIVE_VALUES.focus

    // Determine frequency from sentence mode
    const isFiniteOneTime = taskAdjustment.sentenceMode === 'one-time'
    const isAtOnePoint = taskAdjustment.sentenceMode === 'at-one-point'
    const every = Number(taskAdjustment.frequencyCount) || 1
    const unit = (taskAdjustment.frequencyStarter || 'day') as 'hour' | 'day' | 'week' | 'month'

    updateState((previous) => ({
      ...previous,
      tasks: previous.tasks.map((task) => task.id === taskAdjustment.taskId
        ? {
            ...task,
            title: taskAdjustment.title.trim() || task.title,
            sharedConceptIds: taskAdjustment.preferredContexts.map((c) => c.conceptId),
            sharedContextLinks: taskAdjustment.preferredContexts
              .map((context) => ({ conceptId: context.conceptId, qualifier: context.qualifier })),
            desiredFrequency: {
              ...task.desiredFrequency,
              kind: 'interval' as const,
              finite: isFiniteOneTime || isAtOnePoint,
              every: isAtOnePoint ? 1 : every,
              unit: isAtOnePoint ? 'week' : unit,
              maxOccurrences: isFiniteOneTime ? 1 : undefined,
            },
          }
        : task),
      userTaskProfiles: previous.userTaskProfiles.map((entry) => entry.id === taskAdjustment.userTaskProfileId
        ? {
            ...entry,
            importance: importanceValue,
            grandness: grandnessValue,
            subjectiveTime: subjectiveTimeValue,
            focus: focusValue,
            notes: taskAdjustment.notes.trim(),
            updatedAt: new Date().toISOString(),
          }
        : entry),
      userTaskCategories: [
        ...previous.userTaskCategories.filter((entry) => !(entry.userId === selectedUser.id && entry.taskId === profile.taskId)),
        ...categoryIds.map((categoryId) => ({
          id: crypto.randomUUID(),
          taskId: profile.taskId,
          userId: selectedUser.id,
          categoryId,
          source: 'personal' as const,
          createdAt: new Date().toISOString(),
        })),
      ],
    }))

    closeTaskAdjustment()
    showToast('Task adjustment saved.')
  }

  function deleteTaskAdjustment(): void {
    if (!taskAdjustment) return
    const confirmed = window.confirm('Delete this task? This removes it for everyone in the garden.')
    if (!confirmed) return

    const taskId = taskAdjustment.taskId
    const profileIds = state.userTaskProfiles.filter((entry) => entry.taskId === taskId).map((entry) => entry.id)

    updateState((previous) => ({
      ...previous,
      tasks: previous.tasks.filter((task) => task.id !== taskId),
      userTaskProfiles: previous.userTaskProfiles.filter((entry) => entry.taskId !== taskId),
      sharedTaskCategories: previous.sharedTaskCategories.filter((entry) => entry.taskId !== taskId),
      userTaskCategories: previous.userTaskCategories.filter((entry) => entry.taskId !== taskId),
      logs: previous.logs.filter((entry) => entry.taskId !== taskId && !profileIds.includes(entry.userTaskProfileId)),
    }))

    closeTaskAdjustment()
    showToast('Task deleted.')
  }

  function saveConcept(): void {
    if (!conceptDraft.label.trim() || !conceptDraft.description.trim()) return
    const definition = clausesToExpressionNode(conceptDraft.clauses, conceptDraft.connector)
    updateState((previous) => ({
      ...previous,
      concepts: [
        ...previous.concepts,
        {
          id: crypto.randomUUID(),
          scope: 'shared',
          kind: conceptDraft.kind,
          label: conceptDraft.label.trim(),
          description: conceptDraft.description.trim(),
          definition,
          examples: conceptDraft.examples.split(',').map((entry) => entry.trim()).filter(Boolean),
        },
      ],
    }))
    setConceptDraft(defaultConceptDraft())
    showToast('Shared vocabulary expanded.')
  }

  function saveDefinition(): void {
    if (!selectedUser || !definitionDraft.conceptId || !definitionDraft.label.trim()) return
    updateState((previous) => ({
      ...previous,
      userConceptDefinitions: [
        ...previous.userConceptDefinitions,
        {
          id: crypto.randomUUID(),
          userId: selectedUser.id,
          conceptId: definitionDraft.conceptId,
          label: definitionDraft.label.trim(),
          notes: definitionDraft.notes.trim(),
          intensity: definitionDraft.intensity,
          updatedAt: new Date().toISOString(),
        },
      ],
    }))
    setDefinitionDraft(defaultDefinitionDraft(definitionDraft.conceptId))
    showToast('Personal meaning saved.')
  }

  function savePerson(asUpdate = false): void {
    if (!personDraft.name.trim()) return

    const nextLocalName = personDraft.name.trim()
    setStoredLocalProfileName(nextLocalName)
    setLocalProfileName(nextLocalName)

    const nextUser = {
      id: asUpdate && selectedUser ? selectedUser.id : crypto.randomUUID(),
      name: asUpdate && selectedUser ? selectedUser.name : nextLocalName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: 'en',
      weekStartsOn: personDraft.weekStartsOn as UserProfile['weekStartsOn'],
      workingHours: { dayGroup: 'weekdays' as const, start: personDraft.workStart, end: personDraft.workEnd },
      availability: {
        weekdays: { dayGroup: 'weekdays' as const, start: personDraft.weekdayAvailableStart, end: personDraft.weekdayAvailableEnd },
        weekends: { dayGroup: 'weekends' as const, start: personDraft.weekendAvailableStart, end: personDraft.weekendAvailableEnd },
      },
      workMode: personDraft.workMode,
      isHomeNow: personDraft.isHomeNow,
      allowWorkdayMicroTasks: personDraft.allowWorkdayMicroTasks,
      homeWifiNames: personDraft.homeWifiNames.split(',').map((entry) => entry.trim()).filter(Boolean),
      forgiveness: personDraft.forgiveness,
      tirednessSensitivity: personDraft.tirednessSensitivity,
      recoveryPerHour: personDraft.recoveryPerHour,
      difficultyBias: personDraft.difficultyBias,
    }

    if (asUpdate && selectedUser) {
      updateState((previous) => ({
        ...previous,
        users: previous.users.map((user) => user.id === selectedUser.id ? nextUser : user),
      }))
      showToast('Perspective updated.')
      return
    }

    const userId = nextUser.id
    updateState((previous) => ({
      ...previous,
      users: [
        ...previous.users,
        nextUser,
      ],
      userTaskProfiles: [
        ...previous.userTaskProfiles,
        ...previous.tasks.map((task) => ({
          id: crypto.randomUUID(),
          taskId: task.id,
          userId,
          basis: 'accepted' as const,
          active: true,
          importance: task.defaultSubjectiveProfile.importance,
          grandness: task.defaultSubjectiveProfile.grandness,
          subjectiveTime: task.defaultSubjectiveProfile.subjectiveTime,
          focus: task.defaultSubjectiveProfile.focus,
          preferredTime: task.defaultTimePreference,
          notes: 'Accepted from the shared room.',
          updatedAt: new Date().toISOString(),
        })),
      ],
      userTaskCategories: [
        ...previous.userTaskCategories,
        ...previous.sharedTaskCategories.map((assignment) => ({
          id: crypto.randomUUID(),
          taskId: assignment.taskId,
          userId,
          categoryId: assignment.categoryId,
          source: 'accepted-shared' as const,
          createdAt: new Date().toISOString(),
        })),
      ],
    }))
    setPersonDraft(defaultPersonDraft())
    showToast('Perspective added.')
  }

  function switchUser(userId: string): void {
    updateState((previous) => ({ ...previous, selectedUserId: userId }))
    showToast('Perspective changed.')
  }

  function loadCurrentPerspective(): void {
    if (!selectedUser) return
    setPersonDraft(personDraftFromUserWithLocalName(selectedUser, localProfileName))
    showToast('Current perspective loaded into the editor.')
  }

  function adoptSharedRule(rule: SharedRuleDefinition): void {
    if (!selectedUser) return
    const exists = state.userRules.some((entry) => entry.userId === selectedUser.id && entry.sharedRuleId === rule.id)
    if (exists) {
      showToast('Rule already added.')
      return
    }
    updateState((previous) => ({
      ...previous,
      userRules: [
        ...previous.userRules,
        {
          id: crypto.randomUUID(),
          userId: selectedUser.id,
          createdAt: new Date().toISOString(),
          enabled: true,
          priority: previous.userRules.filter((entry) => entry.userId === selectedUser.id).length + 1,
          source: 'adopted',
          sharedRuleId: rule.id,
          label: rule.label,
          description: rule.description,
          target: rule.target,
          condition: rule.condition,
          effect: rule.effect,
        },
      ],
    }))
    showToast('Shared rule added to this perspective.')
  }

  function saveSkipReflection(): void {
    if (!skipFlow || !selectedUser) return

    const selectedCategoryLabels = skipFlow.categoryIds
      .map((id) => state.categories.find((category) => category.id === id)?.label)
      .filter(Boolean) as string[]
    const categoryLabel = selectedCategoryLabels.join(', ') || skipFlow.newCategoryLabel.trim() || ''
    const note = skipSentencePreview(skipFlow, categoryLabel || null, sharedConcepts, skipRevealedSections)
    const profile = state.userTaskProfiles.find((entry) => entry.id === skipFlow.userTaskProfileId)
    if (!profile) {
      setSkipFlow(null)
      return
    }

    const selectedCategoryIds = skipFlow.scope === 'sort-of-task'
      ? [...new Set(skipFlow.categoryIds)]
      : []

    const condition = comfortExpression(skipFlow)
    const personalRules: UserRule[] = skipFlow.scope === 'sort-of-task' && selectedCategoryIds.length && condition
      ? selectedCategoryIds.map((categoryId, index) => ({
          id: crypto.randomUUID(),
          userId: selectedUser.id,
          createdAt: new Date().toISOString(),
          enabled: true,
          priority: state.userRules.filter((rule) => rule.userId === selectedUser.id).length + 1 + index,
          source: 'suggested-from-skip',
          label: `Make ${state.categories.find((category) => category.id === categoryId)?.label || 'this category'} easier ${comfortSentence(skipFlow, sharedConcepts)}`,
          description: `Personal comfort rule from skip reflection: ${note}`,
          target: { type: 'category', categoryId },
          condition,
          effect: { scoreDelta: 0.18, scheduleBias: 0.22, reviewIfBroken: true },
        }))
      : []

    updateState((previous) => ({
      ...previous,
      logs: previous.logs.map((log) => (log.id === skipFlow.logId ? { ...log, note } : log)),
      tasks: skipFlow.conceptId
        ? previous.tasks.map((task) => (
            task.id === profile.taskId
              ? { ...task, sharedConceptIds: [...new Set([...task.sharedConceptIds, skipFlow.conceptId])] }
              : task
          ))
        : previous.tasks,
      userTaskCategories: [
        ...previous.userTaskCategories,
        ...selectedCategoryIds
          .filter((categoryId) => !previous.userTaskCategories.some((assignment) => assignment.userId === selectedUser.id && assignment.taskId === profile.taskId && assignment.categoryId === categoryId))
          .map((categoryId) => ({
            id: crypto.randomUUID(),
            taskId: profile.taskId,
            userId: selectedUser.id,
            categoryId,
            source: 'adopted-from-other-user' as const,
            createdAt: new Date().toISOString(),
          })),
      ],
      userRules: personalRules.length ? [...previous.userRules, ...personalRules] : previous.userRules,
    }))

    setSkipFlow(null)
    setSkipRevealedSections(new Set())
    setSkipUiStep('scope')
    setSkipCategoryQuery('')
    setSkipCategorySuggestionIndex(0)
    setSkipContextInput('')
    setSkipContextSuggestionIndex(0)
    setSkipContextPickerOpen(false)
    setSkipPendingContextId(null)
    showToast('Skip reflection saved.')
  }

  async function copyShareLink(): Promise<void> {
    await navigator.clipboard.writeText(shareUrl)
    showToast('Share link copied.')
  }

  async function copyGardenCode(): Promise<void> {
    await navigator.clipboard.writeText(roomCode)
    showToast('Garden code copied.')
  }

  function connectToGarden(): void {
    const cleaned = roomCodeInput.trim()
    if (!cleaned) {
      showToast('Enter a garden code first.')
      return
    }

    const nextRoomId = roomIdFromGardenCode(cleaned)
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('garden', cleaned.toLowerCase())
    nextUrl.searchParams.set('sync', 'webrtc')
    nextUrl.searchParams.delete('room')
    window.history.pushState({}, '', nextUrl.toString())
    setCurrentRoomId(nextRoomId)
    showToast(`Connecting to garden ${cleaned.toLowerCase()}…`)
  }

  const doneToday = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()
    return state.logs.filter((log) => log.action === 'done' && log.createdAt >= todayIso).length
  }, [state.logs])

  const archiveTaskGroups = useMemo(() => {
    const grouped = new Map<string, ArchiveEntry[]>()
    for (const entry of state.archives) {
      const taskId = archiveEntryTaskId(entry)
      if (!taskId) continue
      const current = grouped.get(taskId) ?? []
      current.push(entry)
      grouped.set(taskId, current)
    }

    return Array.from(grouped.entries())
      .map(([taskId, entries]) => {
        const sortedEntries = [...entries].sort((left, right) => new Date(right.archivedAt).getTime() - new Date(left.archivedAt).getTime())
        const taskEntry = sortedEntries.find((entry) => entry.entityType === 'task') ?? sortedEntries[0]
        const relatedEntries = sortedEntries.filter((entry) => entry.id !== taskEntry.id)
        return { taskEntry, taskId, relatedEntries }
      })
      .sort((left, right) => new Date(right.taskEntry.archivedAt).getTime() - new Date(left.taskEntry.archivedAt).getTime())
  }, [state.archives])

  const standaloneArchiveEntries = useMemo(() => {
    const bundledIds = new Set<string>()
    archiveTaskGroups.forEach(({ taskEntry, relatedEntries }) => {
      bundledIds.add(taskEntry.id)
      relatedEntries.forEach((entry) => bundledIds.add(entry.id))
    })
    return state.archives.filter((entry) => !bundledIds.has(entry.id))
  }, [archiveTaskGroups, state.archives])

  const archiveVisibleCount = archiveTaskGroups.length + standaloneArchiveEntries.length

  const summary = feedCards.length
    ? `${feedCards.length} tasks feel relevant for ${selectedUserDisplayName}`
    : 'No task is asking loudly for attention right now.'

  if (connectionStatus === 'loading') {
    return (
      <main className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <p className="subtle-text">Loading your garden…</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="feed-header">
        <span className="done-today-count">{doneToday} done today</span>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          ☰
        </button>
      </header>

      <section className="feed" aria-label="Task feed">
        {feedCards.length === 0 ? (
          <article className="empty-card">
            <h2>Feed is calm ✨</h2>
            <p>Nothing needs action right now.</p>
          </article>
        ) : (
          feedCards.map((card) => (
            <article
              key={card.userTaskProfile.id}
              className={`feed-task-card tone-${card.healthTone}`}
              onContextMenu={(event) => {
                event.preventDefault()
                openTaskAdjustment(card.userTaskProfile.id)
              }}
            >
              <h3 className="feed-task-title">{card.task.title}</h3>
              <div className="feed-task-actions">
                <button className="feed-done-btn" onClick={() => openDoneFlow(card.userTaskProfile.id)}>Done</button>
                <button className="feed-skip-btn" onClick={() => openSkipFlow(card.userTaskProfile.id)}>Skip</button>
              </div>
            </article>
          ))
        )}
      </section>

      <button className="fab" onClick={openTaskComposer} aria-label="Add task sentence">
        +
      </button>

      <button className="fab fab-left" onClick={() => setSelfReportOpen(true)} aria-label="Self report">
        ☀
      </button>

      {selfReportOpen && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelfReportOpen(false)
        }}>
          <div className="modal sentence-composer-modal">
            <h2 style={{ marginBottom: 12 }}>How are you right now?</h2>

            <div className="self-report-section">
              <label className="field-label">Mood</label>
              <div className="emoji-row">
                {['😫', '😕', '😐', '🙂', '😊'].map((emoji, idx) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-option emoji-large${selfReportMood === idx + 1 ? ' emoji-selected' : ''}`}
                    onClick={() => setSelfReportMood(idx + 1)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="self-report-section">
              <label className="field-label">Tiredness</label>
              <div className="emoji-row">
                {['⚡', '🙂', '😴'].map((emoji, idx) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-option emoji-large${selfReportTiredness === idx + 1 ? ' emoji-selected' : ''}`}
                    onClick={() => setSelfReportTiredness(idx + 1)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="self-report-section">
              <label className="field-label">Focus</label>
              <div className="emoji-row">
                {['💭', '👀', '🎯'].map((emoji, idx) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-option emoji-large${selfReportFocus === idx + 1 ? ' emoji-selected' : ''}`}
                    onClick={() => setSelfReportFocus(idx + 1)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="minimal-composer-actions">
              <button className="secondary-btn" onClick={() => setSelfReportOpen(false)}>Cancel</button>
              <button className="primary-btn" onClick={() => {
                updateState((prev) => ({
                  ...prev,
                  logs: [...prev.logs, {
                    id: crypto.randomUUID(),
                    userTaskProfileId: '__self_report__',
                    taskId: '__self_report__',
                    userId: selectedUser?.id ?? '',
                    action: 'self-report' as any,
                    createdAt: new Date().toISOString(),
                    mood: selfReportMood,
                    note: `tiredness:${selfReportTiredness} focus:${selfReportFocus}`,
                  }],
                }))
                showToast('Self-report logged.')
                setSelfReportOpen(false)
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          <div className="toast-actions">
            {toast.actionLabel && toast.onAction && <button className="toast-btn" onClick={toast.onAction}>{toast.actionLabel}</button>}
            <button className="toast-close" onClick={dismissToast} aria-label="Dismiss toast">✕</button>
          </div>
        </div>
      )}

      {doneFlow && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            saveDoneFlow()
          }
        }}>
          <div className="sheet">
            <p className="done-sentence">
              <span>I did it and it felt</span>
              {MOOD_EMOJIS.map((emoji, index) => (
                <button
                  key={emoji}
                  type="button"
                  className={`done-mood-btn${doneFlow.mood === index + 1 ? ' selected' : ''}`}
                  onClick={() => setDoneFlow((previous) => previous ? { ...previous, mood: previous.mood === index + 1 ? undefined : index + 1 } : previous)}
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
              .
            </p>

            {!doneNoteOpen && (
              <button type="button" className="done-note-toggle" onClick={() => setDoneNoteOpen(true)}>
                + add a note
              </button>
            )}

            {doneNoteOpen && (
              <textarea
                className="text-input note-box"
                placeholder="Optional note…"
                value={doneFlow.note}
                onChange={(event) => setDoneFlow((previous) => previous ? { ...previous, note: event.target.value } : previous)}
                autoFocus
              />
            )}

            <div className="modal-actions">
              <button className="primary-btn" onClick={saveDoneFlow}>Save</button>
            </div>
          </div>
        </div>
      )}

      {skipFlow && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeSkipFlowWithoutReflection()
          }
        }}>
          <div className="modal sentence-composer-modal entry-modal-narrow">
            <div className="entry-shell">
              <div className="entry-header">
                <p className="entry-sentence">{skipProgressSentence}</p>
              </div>

              <div className="entry-body entry-body-compact">
                {skipUiStep === 'scope' && (
                  <div className="entry-section">
                    <div className="entry-option-grid compact-option-grid">
                      {SKIP_SCOPE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={`entry-option-card${skipFlow.scope === option.id ? ' selected' : ''}`}
                          onClick={() => selectSkipScope(option.id)}
                        >
                          <strong>{option.label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {skipUiStep === 'questions' && skipFlow.scope !== 'today-only' && (
                  <div className="entry-section">
                    <div className="entry-option-grid compact-option-grid">
                      <button type="button" className="entry-option-card" onClick={() => openSkipQuestion('why')}>
                        <strong>why?</strong>
                      </button>
                      {skipFlow.scope === 'sort-of-task' && (
                        <button type="button" className="entry-option-card" onClick={() => openSkipQuestion('categories')}>
                          <strong>which categories?</strong>
                        </button>
                      )}
                      {sharedConcepts.length > 0 && (
                        <button type="button" className="entry-option-card" onClick={() => openSkipQuestion('when')}>
                          <strong>when?</strong>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {skipUiStep === 'why' && skipFlow.scope !== 'today-only' && (
                  <div className="entry-section">
                    <div className="entry-option-grid compact-option-grid">
                      {DISCOMFORT_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`entry-option-card${skipFlow.discomfort === option ? ' selected' : ''}`}
                          onClick={() => chooseSkipWhy(option)}
                        >
                          <strong>{option}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {skipUiStep === 'categories' && skipFlow.scope === 'sort-of-task' && (
                  <div className="entry-section">
                    <input
                      className={`sentence-dropdown-input${skipCategoryQuery ? ' has-query' : ''}`}
                      value={skipCategoryQuery}
                      onChange={(event) => {
                        setSkipCategoryQuery(event.target.value)
                        setSkipCategorySuggestionIndex(0)
                        setSkipCategoryDropdownOpen(true)
                      }}
                      onKeyDown={handleSkipCategoryQueryKeyDown}
                      onFocus={() => setSkipCategoryDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSkipCategoryDropdownOpen(false), 150)}
                      placeholder={skipCategoryOptions.length > 0 ? 'Search categories' : 'Add a category'}
                      autoFocus
                    />
                    {(skipCategoryDropdownOpen || !skipCategoryQuery) && skipCategoryOptions.length > 0 && (
                      <div className="entry-option-scroll">
                        <div className="entry-option-grid compact-option-grid">
                          {visibleSkipCategoryOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={`entry-option-card${skipFlow.categoryIds.includes(option.id) ? ' selected' : ''}`}
                              onClick={() => addSkipCategoryByLabel(option.label)}
                            >
                              <strong>{option.label}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {skipCategoryQuery.trim().length > 0 && !state.categories.some((category) => normalizeTagLabel(category.label) === normalizeTagLabel(skipCategoryQuery)) && (
                      <button type="button" className="entry-option-card" onClick={() => addSkipCategoryByLabel(skipCategoryQuery)}>
                        <strong>Create “{skipCategoryQuery.trim()}”</strong>
                      </button>
                    )}
                    {skipCategoryOptions.length === 0 && !skipCategoryQuery.trim() && (
                      <p className="subtle-text">This task has no categories yet. Add one.</p>
                    )}
                    <div className="entry-inline-row">
                      {skipSelectedCategoryLabels.map((label) => {
                        const categoryId = state.categories.find((category) => category.label === label)?.id
                        if (!categoryId) return null
                        return (
                          <span key={categoryId} className="tag-chip-inline">
                            {label}
                            <button type="button" className="tag-remove-btn" onClick={() => removeSkipCategory(categoryId)} aria-label={`Remove ${label}`}>
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {skipUiStep === 'when' && skipFlow.scope !== 'today-only' && sharedConcepts.length > 0 && (
                  <div className="entry-section">
                    {!skipPendingContext && (
                      <>
                        <input
                          className={`sentence-dropdown-input${skipContextInput ? ' has-query' : ''}`}
                          value={skipContextInput}
                          onChange={(event) => {
                            setSkipContextInput(event.target.value)
                            setSkipContextSuggestionIndex(0)
                            setSkipContextPickerOpen(true)
                          }}
                          onKeyDown={handleSkipContextKeyDown}
                          onFocus={() => setSkipContextPickerOpen(true)}
                          onBlur={() => setTimeout(() => setSkipContextPickerOpen(false), 150)}
                          placeholder="Search preferred context"
                          autoFocus
                        />
                        {(skipContextPickerOpen || !skipContextInput) && (
                          <div className="entry-option-scroll">
                            <div className="entry-option-grid compact-option-grid">
                              {visibleSkipContexts.map((concept) => (
                                <button
                                  key={concept.id}
                                  type="button"
                                  className={`entry-option-card${skipFlow.conceptId === concept.id ? ' selected' : ''}`}
                                  onClick={() => {
                                    setSkipPendingContextId(concept.id)
                                    setSkipFlow((previous) => previous ? {
                                      ...previous,
                                      contextSpecifier: conceptSpecifiers(concept)[0] ?? 'during',
                                    } : previous)
                                  }}
                                >
                                  <strong>{concept.label}</strong>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {skipPendingContext && (
                      <div className="entry-stack">
                        <button type="button" className="secondary-btn" onClick={() => setSkipPendingContextId(null)}>
                          {skipPendingContext.label}
                        </button>
                        <div className="entry-option-grid compact-option-grid">
                          {skipPendingContextQualifiers.map((qualifier) => (
                            <button
                              key={`${skipPendingContext.id}-${qualifier}`}
                              type="button"
                              className={`entry-option-card${skipFlow.conceptId === skipPendingContext.id && skipFlow.contextSpecifier === qualifier ? ' selected' : ''}`}
                              onClick={() => addSkipContext(skipPendingContext.id, qualifier)}
                            >
                              <strong>{qualifier}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="entry-inline-row">
                      {skipFlow.conceptId && (() => {
                        const concept = sharedConcepts.find((entry) => entry.id === skipFlow.conceptId)
                        if (!concept) return null
                        return (
                          <span className="tag-chip-inline">
                            {skipFlow.contextSpecifier} {concept.label}
                            <button type="button" className="tag-remove-btn" onClick={removeSkipContext} aria-label={`Remove ${concept.label}`}>
                              ×
                            </button>
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="entry-footer">
                <button className="secondary-btn" onClick={goBackFromSkip}>
                  {skipUiStep === 'scope' || skipUiStep === 'questions' ? 'Cancel' : 'Back'}
                </button>
                <div className="entry-footer-actions">
                  {skipUiStep === 'questions' && (
                    <button className="primary-btn" onClick={saveSkipReflection}>Done</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {taskAdjustment && (
        <div className="overlay" role="dialog" aria-modal="true" style={{ zIndex: 25 }} onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeTaskAdjustment()
          }
        }}>
          <div className="modal sentence-composer-modal entry-modal-narrow">
            <div className="entry-shell">
              <div className="entry-header">
                <p className="entry-sentence">{taskAdjustmentProgressSentence}</p>
              </div>

              <div className="entry-body entry-body-compact">
                {taskAdjustmentCurrentStep === 'summary' && (
                  <div className="entry-stack">
                    <div className="entry-option-grid compact-option-grid">
                      <button type="button" className="entry-option-card" onClick={() => openAdjustmentBranch('title')}>
                        <strong>Description</strong>
                      </button>
                      <button type="button" className="entry-option-card" onClick={() => openAdjustmentBranch('importance')}>
                        <strong>Details</strong>
                      </button>
                      <button type="button" className="entry-option-card" onClick={() => openAdjustmentBranch('category')}>
                        <strong>Categories</strong>
                      </button>
                      <button type="button" className="entry-option-card" onClick={() => openAdjustmentBranch('context')}>
                        <strong>Context</strong>
                      </button>
                      <button type="button" className="entry-option-card" onClick={() => openAdjustmentBranch('notes')}>
                        <strong>Notes</strong>
                      </button>
                    </div>
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'title' && (
                  <input
                    className="entry-title-input"
                    value={taskAdjustment.title}
                    onChange={(event) => setTaskAdjustment((previous) => previous ? { ...previous, title: event.target.value } : previous)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && taskAdjustment.title.trim()) {
                        event.preventDefault()
                        advanceAdjustmentBranch(taskAdjustment, 'title', ADJUSTMENT_DESCRIPTION_STEPS)
                      }
                    }}
                    placeholder="clean the apartment"
                    autoFocus
                  />
                )}

                {taskAdjustmentCurrentStep === 'mode' && (
                  <div className="entry-option-grid">
                    {TASK_SENTENCE_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.sentenceMode === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, sentenceMode: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'mode', ADJUSTMENT_DESCRIPTION_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'frequency-starter' && (
                  <div className="entry-option-grid compact-option-grid">
                    {FREQUENCY_STARTER_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.frequencyStarter === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, frequencyStarter: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'frequency-starter', ADJUSTMENT_DESCRIPTION_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'frequency-count' && (
                  <div className="entry-option-grid compact-option-grid">
                    {FREQUENCY_COUNT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.frequencyCount === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, frequencyCount: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'frequency-count', ADJUSTMENT_DESCRIPTION_STEPS)
                        }}
                      >
                        <strong>{frequencyCountStepLabel(option)}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'count' && (
                  <div className="entry-option-grid compact-option-grid">
                    {COUNT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.countChoice === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, countChoice: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'count', ADJUSTMENT_DESCRIPTION_STEPS)
                        }}
                      >
                        <strong>{option.label} times</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'timeframe' && (
                  <div className="entry-option-grid">
                    {timeframeOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.timeframe === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const allowed = allowedTimeframeQualifiers(option.id)
                          const nextAdjustment = {
                            ...taskAdjustment,
                            timeframe: option.id,
                            timeframeQualifier: allowed.includes(taskAdjustment.timeframeQualifier) ? taskAdjustment.timeframeQualifier : allowed[0] ?? 'none',
                          }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'timeframe', ADJUSTMENT_DESCRIPTION_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'timeframe-qualifier' && (
                  <div className="entry-option-grid compact-option-grid">
                    {TIMEFRAME_QUALIFIER_OPTIONS.filter((option) => allowedTimeframeQualifiers(taskAdjustment.timeframe).includes(option.id)).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.timeframeQualifier === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, timeframeQualifier: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'timeframe-qualifier', ADJUSTMENT_DESCRIPTION_STEPS)
                        }}
                      >
                        <strong>{option.id === 'none' ? 'anytime' : option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'importance' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.importance.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.importance === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, importance: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'importance', ADJUSTMENT_DETAIL_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'difficulty' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.difficulty.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.grandness === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, grandness: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'difficulty', ADJUSTMENT_DETAIL_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'time' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.time.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.subjectiveTime === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, subjectiveTime: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'time', ADJUSTMENT_DETAIL_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'focus' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.focus.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskAdjustment.focus === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextAdjustment = { ...taskAdjustment, focus: option.id }
                          setTaskAdjustment(nextAdjustment)
                          advanceAdjustmentBranch(nextAdjustment, 'focus', ADJUSTMENT_DETAIL_STEPS)
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'category' && (
                  <div className="entry-section">
                    <input
                      className={`sentence-dropdown-input${adjustCategoryInput ? ' has-query' : ''}`}
                      value={adjustCategoryInput}
                      onChange={(event) => {
                        setAdjustCategoryInput(event.target.value)
                        setAdjustCategorySuggestionIndex(0)
                        setAdjustCategoryPickerOpen(true)
                      }}
                      onKeyDown={handleAdjustCategoryKeyDown}
                      onFocus={() => setAdjustCategoryPickerOpen(true)}
                      onBlur={() => setTimeout(() => setAdjustCategoryPickerOpen(false), 150)}
                      placeholder="Search categories"
                      autoFocus
                    />
                    {(adjustCategoryPickerOpen || !adjustCategoryInput) && (
                      <div className="entry-option-scroll">
                        <div className="entry-option-grid compact-option-grid">
                          {visibleAdjustCategoryOptions.map((label) => (
                            <button
                              key={label}
                              type="button"
                              className={`entry-option-card${adjustSelectedCategoryLabels.includes(label) ? ' selected' : ''}`}
                              onClick={() => addAdjustCategoryTag(label)}
                            >
                              <strong>{label}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="entry-inline-row">
                      {adjustSelectedCategoryLabels.map((tag) => (
                        <span key={tag} className="tag-chip-inline">
                          {tag}
                          <button type="button" className="tag-remove-btn" onClick={() => removeAdjustCategoryTag(tag)} aria-label={`Remove ${tag}`}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'context' && (
                  <div className="entry-section">
                    {!adjustPendingContext && (
                      <>
                        <input
                          className={`sentence-dropdown-input${adjustContextInput ? ' has-query' : ''}`}
                          value={adjustContextInput}
                          onChange={(event) => {
                            setAdjustContextInput(event.target.value)
                            setAdjustContextSuggestionIndex(0)
                            setAdjustContextPickerOpen(true)
                          }}
                          onKeyDown={handleAdjustContextKeyDown}
                          onFocus={() => setAdjustContextPickerOpen(true)}
                          onBlur={() => setTimeout(() => setAdjustContextPickerOpen(false), 150)}
                          placeholder="Search context"
                          autoFocus
                        />
                        {(adjustContextPickerOpen || !adjustContextInput) && (
                          <div className="entry-option-scroll">
                            <div className="entry-option-grid compact-option-grid">
                              {visibleAdjustContexts.map((concept) => (
                                <button
                                  key={concept.id}
                                  type="button"
                                  className="entry-option-card"
                                  onClick={() => {
                                    setAdjustPendingContextId(concept.id)
                                    setAdjustContextQualifier(conceptSpecifiers(concept)[0] ?? 'during')
                                  }}
                                >
                                  <strong>{concept.label}</strong>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {adjustPendingContext && (
                      <div className="entry-stack">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            setAdjustPendingContextId(null)
                            setAdjustContextQualifier(conceptSpecifiers(adjustPendingContext)[0] ?? 'during')
                          }}
                        >
                          {adjustPendingContext.label}
                        </button>
                        <div className="entry-option-grid compact-option-grid">
                          {adjustPendingContextQualifiers.map((qualifier) => {
                            const isSelected = taskAdjustment.preferredContexts.some((context) => context.conceptId === adjustPendingContext.id && context.qualifier === qualifier)
                            return (
                              <button
                                key={`${adjustPendingContext.id}-${qualifier}`}
                                type="button"
                                className={`entry-option-card${isSelected ? ' selected' : ''}`}
                                onClick={() => addAdjustContext(adjustPendingContext.id, qualifier)}
                              >
                                <strong>{qualifier}</strong>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div className="entry-inline-row">
                      {taskAdjustment.preferredContexts.map((context, index) => {
                        const concept = sharedConcepts.find((entry) => entry.id === context.conceptId)
                        if (!concept) return null
                        return (
                          <span key={`${context.conceptId}-${context.qualifier}-${index}`} className="tag-chip-inline">
                            {context.qualifier} {concept.label}
                            <button type="button" className="tag-remove-btn" onClick={() => removeAdjustContext(context.conceptId, context.qualifier)} aria-label={`Remove ${concept.label}`}>
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                    {taskAdjustment.preferredContexts.length > 1 && (
                      <button
                        type="button"
                        className="choice-pill"
                        onClick={() => setTaskAdjustment((previous) => previous ? {
                          ...previous,
                          contextConnector: previous.contextConnector === 'and' ? 'or' : 'and',
                        } : previous)}
                      >
                        {taskAdjustment.contextConnector}
                      </button>
                    )}
                  </div>
                )}

                {taskAdjustmentCurrentStep === 'notes' && (
                  <div className="entry-stack">
                    <textarea
                      className="text-input note-box"
                      placeholder="Note about what good enough means for this task"
                      value={taskAdjustment.notes}
                      onChange={(event) => setTaskAdjustment((previous) => previous ? { ...previous, notes: event.target.value } : previous)}
                      autoFocus
                    />
                    {(() => {
                      const skipNotes = state.logs
                        .filter((log) => log.userTaskProfileId === taskAdjustment.userTaskProfileId && log.action === 'skip' && log.note)
                        .slice(-5)
                      return skipNotes.length > 0 ? (
                        <div className="skip-reasons" style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(254,243,199,0.3)', borderRadius: 6 }}>
                          {skipNotes.map((log) => (
                            <p key={log.id} className="subtle-text" style={{ margin: '2px 0', fontStyle: 'italic' }}>↩ {log.note} <span style={{ opacity: 0.5 }}>({timeAgo(log.createdAt)})</span></p>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                )}
              </div>

              <div className="entry-footer">
                <button
                  className={taskAdjustmentCurrentStep === 'summary' ? 'secondary-btn danger-btn' : 'secondary-btn'}
                  onClick={taskAdjustmentCurrentStep === 'summary' ? deleteTaskAdjustment : goBackFromAdjustment}
                >
                  {taskAdjustmentCurrentStep === 'summary' ? 'Delete' : 'Back'}
                </button>
                <div className="entry-footer-actions">
                  {taskAdjustmentCurrentStep === 'summary' && (
                    <button className="primary-btn" onClick={saveTaskAdjustment}>Done</button>
                  )}
                  {taskAdjustmentCurrentStep === 'notes' && (
                    <button className="primary-btn" onClick={returnToAdjustmentMainPage}>Done</button>
                  )}
                  {taskAdjustmentCurrentStep === 'title' && (
                    <button className="primary-btn" onClick={() => advanceAdjustmentBranch(taskAdjustment, 'title', ADJUSTMENT_DESCRIPTION_STEPS)} disabled={!taskAdjustment.title.trim()}>Continue</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel-shell">
            <div className="panel-nav">
              <div>
                <h2>Menu</h2>
                <p className="subtle-text">Shared structures live here. The daily workflow stays in the feed.</p>
              </div>
              <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
            </div>

            <div className="tab-row">
              <button className={menuSection === 'analytics' ? 'tab active-tab' : 'tab'} onClick={() => setMenuSection('analytics')}>Analytics</button>
              <button className={menuSection === 'sharing' ? 'tab active-tab' : 'tab'} onClick={() => setMenuSection('sharing')}>Profile</button>
              <button className={menuSection === 'language' ? 'tab active-tab' : 'tab'} onClick={() => setMenuSection('language')}>Vocabulary</button>
              <button className={menuSection === 'heuristics' ? 'tab active-tab' : 'tab'} onClick={() => setMenuSection('heuristics')}>Heuristics</button>
              <button className={menuSection === 'archives' ? 'tab active-tab' : 'tab'} onClick={() => setMenuSection('archives')}>Archives</button>
              <button className={menuSection === 'settings' ? 'tab active-tab' : 'tab'} onClick={() => setMenuSection('settings')}>Settings</button>
            </div>

            {menuSection === 'analytics' && (
              <section className="panel-section">
                <article className="soft-card eagle-eye-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Eagle-eye view</h3>
                    <div className="tab-row" style={{ margin: 0 }}>
                      <button className={analyticsPlotRange === 'month' ? 'tab active-tab' : 'tab'} onClick={() => setAnalyticsPlotRange('month')}>Month</button>
                      <button className={analyticsPlotRange === 'all' ? 'tab active-tab' : 'tab'} onClick={() => setAnalyticsPlotRange('all')}>All</button>
                    </div>
                  </div>
                  <div className="analytics-grid">
                    <p>tasks <strong>{analytics.length}</strong></p>
                    <p>healthy <strong>{analytics.filter((entry) => entry.tone === 'green').length}</strong></p>
                    <p>watch <strong>{analytics.filter((entry) => entry.tone === 'amber').length}</strong></p>
                    <p>needs care <strong>{analytics.filter((entry) => entry.tone === 'red').length}</strong></p>
                  </div>
                  <div className="analytics-grid">
                    <p>avg health <strong>{analytics.length ? Math.round(analytics.reduce((sum, entry) => sum + entry.health, 0) / analytics.length * 100) : 0}%</strong></p>
                    <p>avg completion <strong>{analytics.length ? Math.round(analytics.reduce((sum, entry) => sum + entry.completionRate, 0) / analytics.length * 100) : 0}%</strong></p>
                    <p>avg skip rate <strong>{analytics.length ? Math.round(analytics.reduce((sum, entry) => sum + entry.skipRate, 0) / analytics.length * 100) : 0}%</strong></p>
                    <p>avg fatigue <strong>{analytics.length ? Math.round(analytics.reduce((sum, entry) => sum + entry.fatigue, 0) / analytics.length * 100) : 0}%</strong></p>
                  </div>
                </article>

                <input
                  className="text-input"
                  placeholder="Search tasks..."
                  value={analyticsFilter}
                  onChange={(event) => setAnalyticsFilter(event.target.value)}
                  style={{ marginBottom: 8 }}
                />

                <div className="analytics-list">
                  {analytics.filter((entry) => !analyticsFilter || entry.task.title.toLowerCase().includes(analyticsFilter.toLowerCase())).map((entry) => {
                    const taskLogs = state.logs.filter((log) => log.userTaskProfileId === entry.userTaskProfile.id)
                    const doneLogs = taskLogs.filter((log) => log.action === 'done').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    const skipLogs = taskLogs.filter((log) => log.action === 'skip')
                    const lastDone = doneLogs.length > 0 ? doneLogs[doneLogs.length - 1] : undefined
                    const streak = (() => {
                      let count = 0
                      for (let i = taskLogs.length - 1; i >= 0; i--) {
                        if (taskLogs[i].action === 'done') count++
                        else break
                      }
                      return count
                    })()
                    const categoryLabels = [...new Set([
                      ...state.sharedTaskCategories.filter((a) => a.taskId === entry.task.id).map((a) => state.categories.find((c) => c.id === a.categoryId)?.label),
                      ...state.userTaskCategories.filter((a) => a.userId === selectedUser?.id && a.taskId === entry.task.id).map((a) => state.categories.find((c) => c.id === a.categoryId)?.label),
                    ].filter(Boolean))]

                    return (
                      <article
                        key={entry.userTaskProfile.id}
                        className={`analytic-card tone-${entry.tone}`}
                        onContextMenu={(event) => { event.preventDefault(); openTaskAdjustment(entry.userTaskProfile.id) }}
                        onTouchStart={(event) => {
                          const timer = setTimeout(() => { openTaskAdjustment(entry.userTaskProfile.id) }, 600)
                          const clear = () => clearTimeout(timer)
                          event.currentTarget.addEventListener('touchend', clear, { once: true })
                          event.currentTarget.addEventListener('touchmove', clear, { once: true })
                        }}
                      >
                        <div className="task-head">
                          <div>
                            <h4>{entry.task.title}</h4>
                            <p className="subtle-text">{formatCadence(entry.task)}</p>
                          </div>
                          <span className={`status-pill status-${entry.tone}`}>{Math.round(entry.health * 100)}%</span>
                        </div>

                        {doneLogs.length > 0 && (() => {
                          const now = new Date()
                          const rangeStart = analyticsPlotRange === 'month'
                            ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
                            : new Date(doneLogs[0].createdAt)
                          const totalDays = Math.max(1, Math.ceil((now.getTime() - rangeStart.getTime()) / 86400000))
                          const filteredDones = doneLogs.filter((l) => new Date(l.createdAt) >= rangeStart)
                          const filteredSkips = skipLogs.filter((l) => new Date(l.createdAt) >= rangeStart)
                          const dayWidth = Math.max(2, Math.min(6, Math.floor(200 / totalDays)))
                          return (
                            <div style={{ position: 'relative', height: 28, marginTop: 6, marginBottom: 4, background: 'rgba(148,163,184,0.12)', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(148,163,184,0.15)' }}>
                              {filteredDones.map((log) => {
                                const dayOffset = Math.floor((new Date(log.createdAt).getTime() - rangeStart.getTime()) / 86400000)
                                const pct = (dayOffset / totalDays) * 100
                                return <span key={log.id} style={{ position: 'absolute', left: `${pct}%`, bottom: 0, width: dayWidth, height: '100%', background: '#22c55e', borderRadius: 1, opacity: 0.8 }} title={new Date(log.createdAt).toLocaleDateString()} />
                              })}
                              {filteredSkips.map((log) => {
                                const dayOffset = Math.floor((new Date(log.createdAt).getTime() - rangeStart.getTime()) / 86400000)
                                const pct = (dayOffset / totalDays) * 100
                                return <span key={log.id} style={{ position: 'absolute', left: `${pct}%`, top: 0, width: dayWidth, height: '40%', background: '#f59e0b', borderRadius: 1, opacity: 0.7 }} title={new Date(log.createdAt).toLocaleDateString()} />
                              })}
                              {filteredDones.length === 0 && filteredSkips.length === 0 && (
                                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'rgba(148,163,184,0.6)' }}>no activity in range</span>
                              )}
                            </div>
                          )
                        })()}
                        {doneLogs.length === 0 && (
                          <div style={{ position: 'relative', height: 28, marginTop: 6, marginBottom: 4, background: 'rgba(148,163,184,0.12)', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(148,163,184,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(148,163,184,0.6)' }}>no completions yet</span>
                          </div>
                        )}

                        <div className="analytics-grid">
                          <p>completion <strong>{Math.round(entry.completionRate * 100)}%</strong></p>
                          <p>skips <strong>{Math.round(entry.skipRate * 100)}%</strong></p>
                          <p>streak <strong>{streak}</strong></p>
                          <p>fatigue <strong>{Math.round(entry.fatigue * 100)}%</strong></p>
                        </div>
                        <div className="analytics-grid">
                          <p>pressure <strong>{Math.round(entry.duePressure * 100)}%</strong></p>
                          <p>last done <strong>{lastDone ? timeAgo(lastDone.createdAt) : 'never'}</strong></p>
                          {categoryLabels.length > 0 && <p>categories <strong>{categoryLabels.join(', ')}</strong></p>}
                        </div>
                        <p className="support-line">{entry.suggestion}</p>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            {menuSection === 'sharing' && (
              <section className="panel-section sharing-grid">
                <article className="soft-card">
                  <h3>My profile</h3>
                  <div className="person-list">
                    {state.users.map((user) => (
                      <button key={user.id} className={user.id === state.selectedUserId ? 'person-chip active-person' : 'person-chip'} onClick={() => switchUser(user.id)}>
                        {user.id === state.selectedUserId ? localProfileName : user.name}
                      </button>
                    ))}
                  </div>
                  <div className="form-grid compact-grid">
                    <input className="text-input" placeholder="Name" value={personDraft.name} onChange={(event) => setPersonDraft((previous) => ({ ...previous, name: event.target.value }))} />
                    <select className="text-input" value={personDraft.workMode} onChange={(event) => setPersonDraft((previous) => ({ ...previous, workMode: event.target.value as WorkMode }))}>
                      <option value="away">mostly away from home</option>
                      <option value="home">mostly work from home</option>
                      <option value="hybrid">hybrid</option>
                    </select>
                    <label className="field-label">Week starts on</label>
                    <select className="text-input" value={personDraft.weekStartsOn} onChange={(event) => setPersonDraft((previous) => ({ ...previous, weekStartsOn: event.target.value }))}>
                      <option value="mon">Monday</option>
                      <option value="tue">Tuesday</option>
                      <option value="wed">Wednesday</option>
                      <option value="thu">Thursday</option>
                      <option value="fri">Friday</option>
                      <option value="sat">Saturday</option>
                      <option value="sun">Sunday</option>
                    </select>
                    <label className="field-label">Structured work window</label>
                    <div className="inline-fields">
                      <input className="text-input" type="time" value={personDraft.workStart} onChange={(event) => setPersonDraft((previous) => ({ ...previous, workStart: event.target.value }))} />
                      <input className="text-input" type="time" value={personDraft.workEnd} onChange={(event) => setPersonDraft((previous) => ({ ...previous, workEnd: event.target.value }))} />
                    </div>
                    <label className="field-label">Weekday available</label>
                    <div className="inline-fields">
                      <input className="text-input" type="time" value={personDraft.weekdayAvailableStart} onChange={(event) => setPersonDraft((previous) => ({ ...previous, weekdayAvailableStart: event.target.value }))} />
                      <input className="text-input" type="time" value={personDraft.weekdayAvailableEnd} onChange={(event) => setPersonDraft((previous) => ({ ...previous, weekdayAvailableEnd: event.target.value }))} />
                    </div>
                    <label className="field-label">Weekend available</label>
                    <div className="inline-fields">
                      <input className="text-input" type="time" value={personDraft.weekendAvailableStart} onChange={(event) => setPersonDraft((previous) => ({ ...previous, weekendAvailableStart: event.target.value }))} />
                      <input className="text-input" type="time" value={personDraft.weekendAvailableEnd} onChange={(event) => setPersonDraft((previous) => ({ ...previous, weekendAvailableEnd: event.target.value }))} />
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button className="primary-btn" onClick={() => savePerson(true)}>Save</button>
                  </div>
                </article>
              </section>
            )}

            {menuSection === 'settings' && (
              <section className="panel-section">
                <article className="soft-card">
                  <h3>Garden connection</h3>
                  <p className="subtle-text">Share the link or just send the garden code. Others can paste the code and press Connect.</p>
                  <div className="form-grid compact-grid" style={{ marginBottom: 10 }}>
                    <div>
                      <label className="field-label">This garden code</label>
                      <div className="share-row">
                        <input className="text-input" readOnly value={roomCode} />
                        <button className="secondary-btn" onClick={() => void copyGardenCode()}>Copy code</button>
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Join a garden</label>
                      <div className="share-row">
                        <input className="text-input" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value)} placeholder="garden code" />
                        <button className="primary-btn" onClick={connectToGarden}>Connect</button>
                      </div>
                    </div>
                  </div>
                  <div className="share-row">
                    <input className="text-input" readOnly value={shareUrl} />
                    <button className="secondary-btn" onClick={() => void copyShareLink()}>Copy</button>
                  </div>
                  <div className="metrics-row">
                    <span className="metric-chip">status {connectionStatus}</span>
                    <span className="metric-chip">peers {peerCount}</span>
                    <span className="metric-chip">online {onlineUsers.length}</span>
                    {hasSignalingProblem ? <span className="metric-chip" style={{ color: '#b91c1c' }}>signaling problem</span> : null}
                  </div>
                  {onlineUsers.some((user) => user.isSelf && user.instanceCount > 1) ? (
                    <p className="subtle-text" style={{ marginTop: 8 }}>
                      Multiple tabs or windows on this device are grouped together to keep presence quieter.
                    </p>
                  ) : null}
                  {lastConnectionError && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                      <strong>Signaling server issue.</strong>
                      <div style={{ marginTop: 4 }}>{lastConnectionError}</div>
                      <div style={{ marginTop: 4, fontSize: '0.92rem' }}>
                        Without a reachable signaling server, other browsers will not discover each other, even if the room code matches.
                      </div>
                    </div>
                  )}
                  <div className="concept-list" style={{ marginTop: 10 }}>
                    {onlineUsers.length > 0 ? onlineUsers.map((user) => (
                      <div key={user.id} className="concept-card" style={{ padding: '8px 10px' }}>
                        <div className="task-head">
                          <strong>{user.name}</strong>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {user.instanceCount > 1 ? <span className="metric-chip">{user.instanceCount} tabs</span> : null}
                            <span className="metric-chip">{user.isSelf ? 'you' : 'online'}</span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="subtle-text">No one is online yet.</p>
                    )}
                  </div>
                </article>

                <article className="soft-card">
                  <h3>Install app</h3>
                  <p className="subtle-text">Install this app to your home screen for a native-like experience.</p>
                  {canInstallPwa ? (
                    <button className="primary-btn" onClick={() => {
                      const prompt = deferredInstallPrompt.current
                      if (prompt) { prompt.prompt(); prompt.userChoice.then(() => { setCanInstallPwa(false); deferredInstallPrompt.current = null }) }
                    }}>Install</button>
                  ) : (
                    <p className="subtle-text" style={{ fontStyle: 'italic' }}>Already installed or not available in this browser.</p>
                  )}
                </article>
              </section>
            )}

            {menuSection === 'language' && (
              <section className="panel-section language-grid">
                <input
                  className="text-input"
                  placeholder="Search concepts..."
                  value={vocabFilter}
                  onChange={(event) => setVocabFilter(event.target.value)}
                  style={{ marginBottom: 8 }}
                />

                <div className="concept-list">
                  {sharedConcepts
                    .filter((concept) => !vocabFilter || concept.label.toLowerCase().includes(vocabFilter.toLowerCase()) || concept.kind.toLowerCase().includes(vocabFilter.toLowerCase()))
                    .map((concept) => {
                      const myDefinition = personalDefinitions.find((d) => d.conceptId === concept.id)
                      const isEditing = vocabEditId === concept.id
                      return (
                        <div
                          key={concept.id}
                          className={`concept-card${isEditing ? ' concept-card-editing' : ''}`}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setVocabEditId(concept.id)
                            setVocabEditMode('objective')
                            const { clauses, connector } = expressionNodeToClauses(concept.definition)
                            setConceptDraft({ label: concept.label, kind: concept.kind, description: concept.description, examples: concept.examples.join(', '), clauses, connector })
                          }}
                          onTouchStart={(event) => {
                            const timer = setTimeout(() => {
                              setVocabEditId(concept.id)
                              setVocabEditMode('objective')
                              const { clauses: c2, connector: cn2 } = expressionNodeToClauses(concept.definition)
                              setConceptDraft({ label: concept.label, kind: concept.kind, description: concept.description, examples: concept.examples.join(', '), clauses: c2, connector: cn2 })
                            }, 600)
                            const clear = () => clearTimeout(timer)
                            event.currentTarget.addEventListener('touchend', clear, { once: true })
                            event.currentTarget.addEventListener('touchmove', clear, { once: true })
                          }}
                        >
                          <div className="task-head">
                            <strong>{concept.label}</strong>
                            {myDefinition && <span className="metric-chip" style={{ background: '#dbeafe' }}>overridden</span>}
                          </div>
                          <p className="subtle-text">{concept.description}</p>
                          {concept.definition && (
                            <p className="context-line primitive-binding">
                              {(() => {
                                const { clauses, connector } = expressionNodeToClauses(concept.definition)
                                if (clauses.length === 0) return `Bound to: ${concept.definition.type}`
                                return clauses.map((c) => clauseToText(c)).join(` ${connector} `)
                              })()}
                            </p>
                          )}
                          {!concept.definition && concept.examples.length > 0 && <p className="context-line">{concept.examples.join(' · ')}</p>}
                          {myDefinition && (
                            <p className="support-line">My view: <strong>{myDefinition.label}</strong> — {myDefinition.notes || 'no notes'} (intensity {Math.round(myDefinition.intensity * 100)}%)</p>
                          )}

                          {isEditing && (
                            <div className="form-grid compact-grid" style={{ borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: 8, marginTop: 8 }}>
                              <div className="tab-row" style={{ marginBottom: 8 }}>
                                <button className={vocabEditMode === 'objective' ? 'tab active-tab' : 'tab'} onClick={() => setVocabEditMode('objective')}>For everyone</button>
                                <button className={vocabEditMode === 'subjective' ? 'tab active-tab' : 'tab'} onClick={() => {
                                  setVocabEditMode('subjective')
                                  if (myDefinition) {
                                    setDefinitionDraft({ conceptId: concept.id, label: myDefinition.label, notes: myDefinition.notes, intensity: myDefinition.intensity })
                                  } else {
                                    setDefinitionDraft({ conceptId: concept.id, label: concept.label, notes: '', intensity: 0.5 })
                                  }
                                }}>For me</button>
                              </div>
                              {vocabEditMode === 'objective' && (
                                <>
                                  <input className="text-input" placeholder="Label" value={conceptDraft.label} onChange={(event) => setConceptDraft((prev) => ({ ...prev, label: event.target.value }))} />

                                  <div className="expression-builder">
                                    <label className="field-label">Definition (from primitives)</label>
                                    {conceptDraft.clauses.length > 0 && (
                                      <div className="expression-summary">
                                        {conceptDraft.clauses.map((clause, idx) => (
                                          <span key={clause.id}>
                                            {idx > 0 && <span className="expr-connector">{conceptDraft.connector}</span>}
                                            <span className="expr-clause">{clauseToText(clause)}</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {conceptDraft.clauses.map((clause, idx) => (
                                      <div key={clause.id} className="clause-row">
                                        {idx > 0 && (
                                          <button type="button" className="expr-connector-btn" onClick={() => setConceptDraft((prev) => ({ ...prev, connector: prev.connector === 'and' ? 'or' : 'and' }))}>
                                            {conceptDraft.connector}
                                          </button>
                                        )}
                                        <button type="button" className={`clause-neg-btn${clause.negated ? ' active' : ''}`} onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, negated: !c.negated } : c) }))}>NOT</button>
                                        <select className="clause-select" value={clause.primitive} onChange={(e) => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, primitive: e.target.value, operator: operatorsForPrimitive(e.target.value)[0] as any, value: '' } : c) }))}>
                                          {SYSTEM_PRIMITIVES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                        </select>
                                        <select className="clause-select clause-op" value={clause.operator} onChange={(e) => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, operator: e.target.value as any } : c) }))}>
                                          {operatorsForPrimitive(clause.primitive).map((op) => <option key={op} value={op}>{op}</option>)}
                                        </select>
                                        <button type="button" className={`clause-fuzzy-btn${clause.fuzzy ? ' active' : ''}`} onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, fuzzy: !c.fuzzy } : c) }))}>~</button>
                                        <input className="clause-value" placeholder={SYSTEM_PRIMITIVES.find((p) => p.id === clause.primitive)?.valueType === 'enum' ? SYSTEM_PRIMITIVES.find((p) => p.id === clause.primitive)?.values?.join(',') : 'value'} value={clause.value} onChange={(e) => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, value: e.target.value } : c) }))} />
                                        <button type="button" className="clause-remove-btn" onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.filter((_, i) => i !== idx) }))}>×</button>
                                      </div>
                                    ))}
                                    <button type="button" className="secondary-btn" style={{ marginTop: 4 }} onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: [...prev.clauses, { id: crypto.randomUUID(), primitive: 'wday', operator: '=', fuzzy: false, value: '', negated: false }] }))}>+ Add clause</button>
                                  </div>

                                  <div className="modal-actions">
                                    <button className="secondary-btn" onClick={() => setVocabEditId(null)}>Cancel</button>
                                    <button className="primary-btn" onClick={() => {
                                      const definition = clausesToExpressionNode(conceptDraft.clauses, conceptDraft.connector)
                                      updateState((prev) => ({
                                        ...prev,
                                        concepts: prev.concepts.map((c) => c.id === concept.id ? {
                                          ...c,
                                          label: conceptDraft.label.trim() || c.label,
                                          kind: conceptDraft.kind,
                                          description: conceptDraft.description.trim() || c.description,
                                          examples: conceptDraft.examples.split(',').map((e) => e.trim()).filter(Boolean),
                                          definition,
                                        } : c),
                                      }))
                                      setVocabEditId(null)
                                      showToast('Concept updated.')
                                    }}>Save</button>
                                  </div>
                                </>
                              )}
                              {vocabEditMode === 'subjective' && (
                                <>
                                  <input className="text-input" placeholder="My label for this concept" value={definitionDraft.label} onChange={(event) => setDefinitionDraft((prev) => ({ ...prev, label: event.target.value }))} />
                                  <textarea className="text-input note-box" placeholder="How this feels different to me" value={definitionDraft.notes} onChange={(event) => setDefinitionDraft((prev) => ({ ...prev, notes: event.target.value }))} />
                                  <label className="field-label">Intensity</label>
                                  <input className="range-input" type="range" min="0.1" max="1" step="0.01" value={definitionDraft.intensity} onChange={(event) => setDefinitionDraft((prev) => ({ ...prev, intensity: Number(event.target.value) }))} />
                                  <div className="modal-actions">
                                    <button className="secondary-btn" onClick={() => setVocabEditId(null)}>Cancel</button>
                                    <button className="primary-btn" onClick={() => {
                                      saveDefinition()
                                      setVocabEditId(null)
                                    }}>Save my view</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>

                <button className="primary-btn" style={{ marginTop: 12, width: '100%' }} onClick={() => { setConceptDraft(defaultConceptDraft()); setShowAddConceptModal(true) }}>+ Add concept</button>

                {showAddConceptModal && (
                  <div className="modal-overlay" onClick={() => setShowAddConceptModal(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                      <h3>Add new concept</h3>
                      <div className="form-grid compact-grid">
                        <input className="text-input" placeholder="Label (e.g. Workday)" value={conceptDraft.label} onChange={(event) => setConceptDraft((previous) => ({ ...previous, label: event.target.value }))} />
                      </div>

                      <div className="expression-builder">
                        <label className="field-label">Definition (from primitives)</label>
                        {conceptDraft.clauses.length > 0 && (
                          <div className="expression-summary">
                            {conceptDraft.clauses.map((clause, idx) => (
                              <span key={clause.id}>
                                {idx > 0 && <span className="expr-connector">{conceptDraft.connector}</span>}
                                <span className="expr-clause">{clauseToText(clause)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {conceptDraft.clauses.map((clause, idx) => (
                          <div key={clause.id} className="clause-row">
                            {idx > 0 && (
                              <button type="button" className="expr-connector-btn" onClick={() => setConceptDraft((prev) => ({ ...prev, connector: prev.connector === 'and' ? 'or' : 'and' }))}>
                                {conceptDraft.connector}
                              </button>
                            )}
                            <button type="button" className={`clause-neg-btn${clause.negated ? ' active' : ''}`} onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, negated: !c.negated } : c) }))}>NOT</button>
                            <select className="clause-select" value={clause.primitive} onChange={(e) => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, primitive: e.target.value, operator: operatorsForPrimitive(e.target.value)[0] as any, value: '' } : c) }))}>
                              {SYSTEM_PRIMITIVES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <select className="clause-select clause-op" value={clause.operator} onChange={(e) => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, operator: e.target.value as any } : c) }))}>
                              {operatorsForPrimitive(clause.primitive).map((op) => <option key={op} value={op}>{op}</option>)}
                            </select>
                            <button type="button" className={`clause-fuzzy-btn${clause.fuzzy ? ' active' : ''}`} onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, fuzzy: !c.fuzzy } : c) }))}>~</button>
                            <input className="clause-value" placeholder={SYSTEM_PRIMITIVES.find((p) => p.id === clause.primitive)?.valueType === 'enum' ? SYSTEM_PRIMITIVES.find((p) => p.id === clause.primitive)?.values?.join(',') : 'value'} value={clause.value} onChange={(e) => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.map((c, i) => i === idx ? { ...c, value: e.target.value } : c) }))} />
                            <button type="button" className="clause-remove-btn" onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: prev.clauses.filter((_, i) => i !== idx) }))}>×</button>
                          </div>
                        ))}
                        <button type="button" className="secondary-btn" style={{ marginTop: 4 }} onClick={() => setConceptDraft((prev) => ({ ...prev, clauses: [...prev.clauses, { id: crypto.randomUUID(), primitive: 'wday', operator: '=' as const, fuzzy: false, value: '', negated: false }] }))}>+ Add clause</button>
                      </div>

                      <div className="modal-actions">
                        <button className="secondary-btn" onClick={() => setShowAddConceptModal(false)}>Cancel</button>
                        <button className="primary-btn" onClick={() => { saveConcept(); setShowAddConceptModal(false) }}>Add concept</button>
                      </div>
                    </div>
                  </div>
                )}

                <details style={{ marginTop: 16 }}>
                  <summary className="field-label" style={{ cursor: 'pointer', userSelect: 'none' }}>Primitives</summary>
                  <p className="subtle-text" style={{ marginTop: 4 }}>System-defined measurable facts used to compose concepts.</p>
                  <div className="concept-list">
                    {SYSTEM_PRIMITIVES.map((prim) => (
                      <div key={prim.id} className="concept-card primitive-card">
                        <div className="task-head">
                          <strong>{prim.label}</strong>
                          <span className="metric-chip">{prim.valueType}</span>
                        </div>
                        <p className="subtle-text">
                          {prim.valueType === 'enum' && `Values: ${prim.values!.join(', ')}`}
                          {prim.valueType === 'time' && 'Format: HH:MM (e.g. 08:00, 17:30)'}
                          {prim.valueType === 'number' && `Range: ${prim.min}–${prim.max}`}
                          {prim.valueType === 'boolean' && 'Values: true, false'}
                        </p>
                        <p className="context-line">Operators: {operatorsForPrimitive(prim.id).join(', ')} {prim.valueType !== 'boolean' && '· supports ~ (fuzzy)'}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            )}

            {menuSection === 'heuristics' && (
              <section className="panel-section">
                <article className="soft-card">
                  <h3>My heuristics</h3>
                  <p className="subtle-text">Context preferences for tasks — inferred from patterns or manually added. These decide when a task is proposed to you.</p>
                  <div className="concept-list">
                    {analytics.map((entry) => {
                      const taskLogs = state.logs.filter((log) => log.userTaskProfileId === entry.userTaskProfile.id && log.action === 'done')
                      const skipLogs = state.logs.filter((log) => log.userTaskProfileId === entry.userTaskProfile.id && log.action === 'skip' && log.note)
                      if (taskLogs.length < 2 && entry.task.sharedConceptIds.length === 0 && skipLogs.length === 0) return null
                      const linkedConcepts = entry.task.sharedConceptIds.map((id) => sharedConcepts.find((c) => c.id === id)?.label).filter(Boolean)
                      if (linkedConcepts.length === 0 && taskLogs.length < 2 && skipLogs.length === 0) return null

                      const hours = taskLogs.length >= 2 ? taskLogs.map((log) => new Date(log.createdAt).getHours()) : []
                      const avgHour = hours.length > 0 ? Math.round(hours.reduce((sum, h) => sum + h, 0) / hours.length) : null
                      const days = taskLogs.map((log) => new Date(log.createdAt).getDay())
                      const weekdayCount = days.filter((d) => d >= 1 && d <= 5).length
                      const weekendCount = days.filter((d) => d === 0 || d === 6).length
                      const dayPref = taskLogs.length >= 2
                        ? (weekendCount > weekdayCount * 0.8 ? 'weekends' : weekdayCount > weekendCount * 0.8 ? 'weekdays' : null)
                        : null
                      const recentSkipNotes = skipLogs.slice(-3).map((log) => log.note!)

                      return (
                        <div key={entry.userTaskProfile.id} className="concept-card">
                          <div className="task-head">
                            <strong>{entry.task.title}</strong>
                            {dayPref && <span className="metric-chip">{dayPref}</span>}
                            {skipLogs.length > 0 && <span className="metric-chip" style={{ background: '#fef3c7' }}>skipped {skipLogs.length}×</span>}
                            {linkedConcepts.length > 0 && <span className="metric-chip" style={{ background: '#dbeafe' }}>manual</span>}
                          </div>
                          {avgHour !== null && <p className="subtle-text">Pattern: usually around {avgHour}:00 · {taskLogs.length} completions</p>}
                          {linkedConcepts.length > 0 && <p className="context-line">Contexts: {linkedConcepts.join(', ')}</p>}
                          {recentSkipNotes.length > 0 && (
                            <div className="skip-reasons">
                              {recentSkipNotes.map((reason, i) => <p key={i} className="subtle-text" style={{ margin: '2px 0', fontStyle: 'italic' }}>↩ {reason}</p>)}
                            </div>
                          )}
                        </div>
                      )
                    }).filter(Boolean)}

                    {state.userRules.filter((rule) => rule.userId === selectedUser?.id).map((userRule) => {
                      const shared = state.sharedRules.find((r) => r.id === userRule.sharedRuleId)
                      return (
                        <div key={userRule.id} className="concept-card">
                          <div className="task-head">
                            <strong>{shared?.label ?? userRule.label}</strong>
                            <span className="metric-chip">comfort rule</span>
                          </div>
                          <p className="subtle-text">{shared?.description ?? userRule.description}</p>
                        </div>
                      )
                    })}

                    {analytics.every((entry) => state.logs.filter((log) => log.userTaskProfileId === entry.userTaskProfile.id && log.action === 'done').length < 2 && entry.task.sharedConceptIds.length === 0 && !state.logs.some((log) => log.userTaskProfileId === entry.userTaskProfile.id && log.action === 'skip' && log.note)) && state.userRules.filter((rule) => rule.userId === selectedUser?.id).length === 0 && (
                      <p className="subtle-text">No heuristics yet. Complete tasks or add context preferences below.</p>
                    )}
                  </div>
                </article>

                <article className="soft-card">
                  <h3>Add heuristic</h3>
                  <p className="subtle-text">I prefer doing a task</p>
                  <div className="form-grid compact-grid">
                    <select className="text-input" id="heuristic-task-select">
                      <option value="">Select task or category...</option>
                      <optgroup label="Tasks">
                        {state.tasks.map((task) => <option key={task.id} value={`task:${task.id}`}>{task.title}</option>)}
                      </optgroup>
                      <optgroup label="Categories">
                        {state.categories.map((cat) => <option key={cat.id} value={`cat:${cat.id}`}>{cat.label}</option>)}
                      </optgroup>
                    </select>
                    <div className="heuristic-qualifier-row">
                      <select className="text-input" id="heuristic-qualifier-select" style={{ flex: '0 0 auto', width: 'auto' }}>
                        {TIMEFRAME_QUALIFIER_OPTIONS.filter((o) => o.id !== 'none').map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                      <select className="text-input" id="heuristic-concept-select" style={{ flex: 1 }}>
                        <option value="">Select context...</option>
                        {sharedConcepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <button className="primary-btn" style={{ marginTop: 8 }} onClick={() => {
                    const taskSelect = document.getElementById('heuristic-task-select') as HTMLSelectElement
                    const qualifierSelect = document.getElementById('heuristic-qualifier-select') as HTMLSelectElement
                    const conceptSelect = document.getElementById('heuristic-concept-select') as HTMLSelectElement
                    const target = taskSelect?.value
                    const conceptId = conceptSelect?.value
                    const qualifier = qualifierSelect?.value || 'during'
                    if (!target || !conceptId) { showToast('Select both a task/category and a context.'); return }
                    // Note: qualifier is stored conceptually — the system uses the concept link
                    if (target.startsWith('task:')) {
                      const taskId = target.replace('task:', '')
                      updateState((prev) => ({
                        ...prev,
                        tasks: prev.tasks.map((t) => t.id === taskId
                          ? { ...t, sharedConceptIds: [...new Set([...t.sharedConceptIds, conceptId])] }
                          : t),
                      }))
                    } else if (target.startsWith('cat:')) {
                      const categoryId = target.replace('cat:', '')
                      const tasksInCategory = [...new Set([
                        ...state.sharedTaskCategories.filter((a) => a.categoryId === categoryId).map((a) => a.taskId),
                        ...state.userTaskCategories.filter((a) => a.categoryId === categoryId).map((a) => a.taskId),
                      ])]
                      updateState((prev) => ({
                        ...prev,
                        tasks: prev.tasks.map((t) => tasksInCategory.includes(t.id)
                          ? { ...t, sharedConceptIds: [...new Set([...t.sharedConceptIds, conceptId])] }
                          : t),
                      }))
                    }
                    showToast(`Heuristic added: ${qualifier} ${sharedConcepts.find((c) => c.id === conceptId)?.label ?? 'context'}`)
                    taskSelect.value = ''
                    conceptSelect.value = ''
                  }}>Add heuristic</button>
                </article>
              </section>
            )}

            {menuSection === 'archives' && (
              <section className="panel-section">
                <article className="soft-card">
                  <div className="section-head">
                    <div>
                      <h3>Archives</h3>
                      <p className="subtle-text">Anything that disappears from state is copied here first, including sync-related removals.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span className="metric-chip">{archiveVisibleCount} items</span>
                      {state.archives.length > 0 && (
                        <button className="secondary-btn danger-btn" onClick={clearAllArchives}>Clear all</button>
                      )}
                    </div>
                  </div>
                  <div className="concept-list" style={{ marginTop: 10 }}>
                    {archiveVisibleCount > 0 ? (
                      <>
                        {archiveTaskGroups.map(({ taskEntry, taskId, relatedEntries }) => (
                          <article key={taskEntry.id} className="concept-card">
                            <div className="task-head">
                              <div>
                                <strong>{taskEntry.summary}</strong>
                                <p className="subtle-text" style={{ marginTop: 4 }}>{archiveEntityLabel(taskEntry)} · {taskEntry.reason === 'sync-removed' ? 'removed during sync' : 'deleted locally'}</p>
                              </div>
                              <span className="metric-chip">{timeAgo(taskEntry.archivedAt)}</span>
                            </div>
                            <p className="context-line">{archiveSnapshotPreview(taskEntry)}</p>
                            {relatedEntries.length > 0 && (
                              <p className="subtle-text" style={{ marginTop: 6 }}>Also saved: {archiveRelatedSummary(relatedEntries)}</p>
                            )}
                            <div className="section-head" style={{ marginTop: 8 }}>
                              <p className="subtle-text">source {taskEntry.source} · task id {taskId}</p>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="primary-btn" onClick={() => recoverArchivedTask(taskId)}>Recover</button>
                                <button className="secondary-btn danger-btn" onClick={() => clearArchiveTaskGroup(taskId)}>Remove</button>
                              </div>
                            </div>
                          </article>
                        ))}

                        {standaloneArchiveEntries.map((entry) => (
                          <article key={entry.id} className="concept-card">
                            <div className="task-head">
                              <div>
                                <strong>{entry.summary}</strong>
                                <p className="subtle-text" style={{ marginTop: 4 }}>{archiveEntityLabel(entry)} · {entry.reason === 'sync-removed' ? 'removed during sync' : 'deleted locally'}</p>
                              </div>
                              <span className="metric-chip">{timeAgo(entry.archivedAt)}</span>
                            </div>
                            <p className="context-line">{archiveSnapshotPreview(entry)}</p>
                            <div className="section-head" style={{ marginTop: 8 }}>
                              <p className="subtle-text">source {entry.source} · id {entry.entityId}</p>
                              <button className="secondary-btn danger-btn" onClick={() => clearArchiveEntry(entry.id)}>Remove</button>
                            </div>
                          </article>
                        ))}
                      </>
                    ) : (
                      <p className="subtle-text">Nothing archived yet.</p>
                    )}
                  </div>
                </article>
              </section>
            )}
          </div>
        </div>
      )}

      {taskComposerOpen && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setTaskComposerOpen(false)
            setTaskComposerUiStepIndex(0)
            setTaskComposerOptionalPath(null)
          }
        }}>
          <div className="modal sentence-composer-modal entry-modal-narrow">
            <div className="entry-shell">
              <div className="entry-header">
                <p className="entry-sentence">{taskComposerProgressSentence}</p>
              </div>

              <div className="entry-body entry-body-compact">
                {taskComposerCurrentStep === 'name' && (
                  <input
                    ref={nameInputRef}
                    className="entry-title-input"
                    value={taskDraft.actionText}
                    onChange={(event) => setTaskDraft((previous) => ({ ...previous, actionText: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && taskDraft.actionText.trim()) {
                        event.preventDefault()
                        advanceComposer(taskDraft, 'name')
                      }
                    }}
                    placeholder="clean the apartment"
                    autoFocus
                  />
                )}

                {taskComposerCurrentStep === 'mode' && (
                  <div className="entry-option-grid">
                    {TASK_SENTENCE_MODE_OPTIONS.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskDraft.sentenceMode === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextDraft = { ...taskDraft, sentenceMode: option.id }
                          setTaskSentenceModeIndex(index)
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'mode')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'frequency-starter' && (
                  <div className="entry-option-grid compact-option-grid">
                    {FREQUENCY_STARTER_OPTIONS.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskDraft.frequencyStarter === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextDraft = { ...taskDraft, frequencyStarter: option.id, unit: option.id, every: Number(taskDraft.frequencyCount) || 1 }
                          setFrequencyStarterIndex(index)
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'frequency-starter')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'frequency-count' && (
                  <div className="entry-option-grid compact-option-grid">
                    {FREQUENCY_COUNT_OPTIONS.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskDraft.frequencyCount === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextDraft = { ...taskDraft, frequencyCount: option.id, every: Number(option.id) || 1 }
                          setFrequencyCountIndex(index)
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'frequency-count')
                        }}
                      >
                        <strong>{frequencyCountStepLabel(option)}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'count' && (
                  <div className="entry-option-grid compact-option-grid">
                    {COUNT_OPTIONS.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskDraft.countChoice === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextDraft = { ...taskDraft, countChoice: option.id }
                          setCountOptionIndex(index)
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'count')
                        }}
                      >
                        <strong>{option.label} times</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'timeframe' && (
                  <div className="entry-option-grid">
                    {timeframeOptions.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskDraft.timeframe === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const allowed = allowedTimeframeQualifiers(option.id)
                          const nextDraft = {
                            ...taskDraft,
                            timeframe: option.id,
                            timeframeQualifier: allowed.includes(taskDraft.timeframeQualifier) ? taskDraft.timeframeQualifier : allowed[0] ?? 'none',
                          }
                          setTimeframeIndex(index)
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'timeframe')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'timeframe-qualifier' && (
                  <div className="entry-option-grid compact-option-grid">
                    {TIMEFRAME_QUALIFIER_OPTIONS.filter((option) => allowedTimeframeQualifiers(taskDraft.timeframe).includes(option.id)).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${taskDraft.timeframeQualifier === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          const nextDraft = { ...taskDraft, timeframeQualifier: option.id }
                          setTimeframeQualifierIndex(Math.max(0, TIMEFRAME_QUALIFIER_OPTIONS.findIndex((entry) => entry.id === option.id)))
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'timeframe-qualifier')
                        }}
                      >
                        <strong>{option.id === 'none' ? 'anytime' : option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'details' && (
                  <div className="entry-option-grid compact-option-grid">
                    <button type="button" className="entry-option-card" onClick={() => openTaskComposerOptionalPath('details')}>
                      <strong>Details</strong>
                    </button>
                    <button type="button" className="entry-option-card" onClick={() => openTaskComposerOptionalPath('categories')}>
                      <strong>Categories</strong>
                    </button>
                    <button type="button" className="entry-option-card" onClick={() => openTaskComposerOptionalPath('context')}>
                      <strong>Context</strong>
                    </button>
                  </div>
                )}

                {taskComposerCurrentStep === 'importance' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.importance.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${effectiveSubjectiveSelections.importance.id === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          setSubjectiveSelections((previous) => ({ ...previous, importance: option }))
                          advanceComposer(taskDraft, 'importance')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'difficulty' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.difficulty.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${effectiveSubjectiveSelections.difficulty.id === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          setSubjectiveSelections((previous) => ({ ...previous, difficulty: option }))
                          advanceComposer(taskDraft, 'difficulty')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'time' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.time.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${effectiveSubjectiveSelections.time.id === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          setSubjectiveSelections((previous) => ({ ...previous, time: option }))
                          advanceComposer(taskDraft, 'time')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'focus' && (
                  <div className="entry-option-grid compact-option-grid">
                    {SUBJECTIVE_OPTIONS_BY_CATEGORY.focus.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`entry-option-card${effectiveSubjectiveSelections.focus.id === option.id ? ' selected' : ''}`}
                        onClick={() => {
                          setSubjectiveSelections((previous) => ({ ...previous, focus: option }))
                          returnToTaskComposerMainPage()
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'timing' && (
                  <div className="entry-option-grid compact-option-grid">
                    {[{ value: false, label: 'any time' }, { value: true, label: 'pick a window' }].map((option) => (
                      <button
                        key={String(option.value)}
                        type="button"
                        className={`entry-option-card${taskDraft.timeSensitive === option.value ? ' selected' : ''}`}
                        onClick={() => {
                          const nextDraft = { ...taskDraft, timeSensitive: option.value }
                          setTaskDraft(nextDraft)
                          advanceComposer(nextDraft, 'timing')
                        }}
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {taskComposerCurrentStep === 'window' && (
                  <div className="entry-section entry-inline-grid">
                    <div className="entry-choice-options">
                      {(['weekdays', 'weekends', 'any day'] as DayGroup[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`choice-pill${taskDraft.dayGroup === option ? ' active' : ''}`}
                          onClick={() => setTaskDraft((previous) => ({ ...previous, dayGroup: option }))}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <div className="entry-inline-row">
                      <input className="text-input" type="time" value={taskDraft.start} onChange={(event) => setTaskDraft((previous) => ({ ...previous, start: event.target.value }))} />
                      <input className="text-input" type="time" value={taskDraft.end} onChange={(event) => setTaskDraft((previous) => ({ ...previous, end: event.target.value }))} />
                    </div>
                  </div>
                )}

                {taskComposerCurrentStep === 'category' && (
                  <div className="entry-section">
                    <input
                      ref={categoryTagInputRef}
                      className={`sentence-dropdown-input${categoryTagInput ? ' has-query' : ''}`}
                      value={categoryTagInput}
                      onChange={(event) => {
                        setCategoryTagInput(event.target.value)
                        setCategorySuggestionIndex(0)
                        setTagPickerOpen(true)
                      }}
                      onKeyDown={handleCategoryTagInputKeyDown}
                      onFocus={() => setTagPickerOpen(true)}
                      onBlur={() => setTimeout(() => setTagPickerOpen(false), 150)}
                      placeholder="Search categories"
                      autoFocus
                    />
                    <div className="entry-option-scroll">
                      <div className="entry-option-grid compact-option-grid">
                        {visibleComposerCategoryOptions.map((label) => (
                          <button
                            key={label}
                            type="button"
                            className={`entry-option-card${selectedCategoryTags.includes(label) ? ' selected' : ''}`}
                            onClick={() => addCategoryTag(label)}
                          >
                            <strong>{label}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="entry-inline-row">
                      {selectedCategoryTags.map((tag) => (
                        <span key={tag} className="tag-chip-inline">
                          {tag}
                          <button type="button" className="tag-remove-btn" onClick={() => removeCategoryTag(tag)} aria-label={`Remove ${tag}`}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {taskComposerCurrentStep === 'context' && (
                  <div className="entry-section">
                    {!composerPendingContext && (
                      <>
                        <input
                          className={`sentence-dropdown-input${composerContextInput ? ' has-query' : ''}`}
                          value={composerContextInput}
                          onChange={(event) => {
                            setComposerContextInput(event.target.value)
                            setComposerContextSuggestionIndex(0)
                            setComposerContextPickerOpen(true)
                          }}
                          onKeyDown={handleComposerContextKeyDown}
                          onFocus={() => setComposerContextPickerOpen(true)}
                          onBlur={() => setTimeout(() => setComposerContextPickerOpen(false), 150)}
                          placeholder="Search context"
                          autoFocus
                        />
                        <div className="entry-option-scroll">
                          <div className="entry-option-grid compact-option-grid">
                            {visibleComposerContexts.map((concept) => (
                              <button
                                key={concept.id}
                                type="button"
                                className="entry-option-card"
                                onClick={() => {
                                  setComposerPendingContextId(concept.id)
                                  setComposerContextQualifier(conceptSpecifiers(concept)[0] ?? 'during')
                                }}
                              >
                                <strong>{concept.label}</strong>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    {composerPendingContext && (
                      <div className="entry-stack">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            setComposerPendingContextId(null)
                            setComposerContextQualifier(conceptSpecifiers(composerPendingContext)[0] ?? 'during')
                          }}
                        >
                          {composerPendingContext.label}
                        </button>
                        <div className="entry-option-grid compact-option-grid">
                          {composerPendingContextQualifiers.map((qualifier) => {
                            const isSelected = composerPreferredContexts.some((context) => context.conceptId === composerPendingContext.id && context.qualifier === qualifier)
                            return (
                              <button
                                key={`${composerPendingContext.id}-${qualifier}`}
                                type="button"
                                className={`entry-option-card${isSelected ? ' selected' : ''}`}
                                onClick={() => addComposerContext(composerPendingContext.id, qualifier)}
                              >
                                <strong>{qualifier}</strong>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div className="entry-inline-row">
                      {composerPreferredContexts.map((context, index) => {
                        const concept = sharedConcepts.find((entry) => entry.id === context.conceptId)
                        if (!concept) return null
                        return (
                          <span key={`${context.conceptId}-${context.qualifier}-${index}`} className="tag-chip-inline">
                            {context.qualifier} {concept.label}
                            <button type="button" className="tag-remove-btn" onClick={() => removeComposerContext(context.conceptId, context.qualifier)} aria-label={`Remove ${concept.label}`}>
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="entry-footer">
                <button
                  className="secondary-btn"
                  onClick={() => {
                    if (taskComposerCurrentStepIndex === 0) {
                      setTaskComposerOpen(false)
                      setTaskComposerUiStepIndex(0)
                      setTaskComposerOptionalPath(null)
                      return
                    }
                    goToComposerStep(taskComposerCurrentStepIndex - 1)
                  }}
                >
                  {taskComposerCurrentStepIndex === 0 ? 'Cancel' : 'Back'}
                </button>
                <div className="entry-footer-actions">
                  {taskComposerCurrentStep === 'name' && (
                    <button className="primary-btn" onClick={() => advanceComposer(taskDraft, 'name')} disabled={!taskDraft.actionText.trim()}>Continue</button>
                  )}
                  {taskComposerCanSave && !taskComposerIsOptionalPath && (
                    <button className="primary-btn" onClick={saveTask}>Done</button>
                  )}
                  {taskComposerCurrentStep === 'window' && (
                    <button className="primary-btn" onClick={() => goToComposerStep(taskComposerCurrentStepIndex + 1)}>Continue</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
