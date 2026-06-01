import { SYSTEM_PRIMITIVES } from './app-config'
import type {
  AppState,
  CategoryId,
  CommonConcept,
  ConceptDefinition,
  ExpressionNode,
  RuleTarget,
  TaskDefinition,
  UserProfile,
  UserTaskProfile,
} from './types'

type PrimitiveValue = string | number | boolean

export interface RankingEvaluationContext {
  now: Date
  profile: UserProfile
  userTaskProfile: UserTaskProfile
  fatigue: number
  categoryIds: CategoryId[]
  primitives: Record<string, PrimitiveValue>
}

export interface TaskContextSignal {
  hasContexts: boolean
  score: number
  matchedLabels: string[]
}

export interface RuleSignal {
  scoreDelta: number
  matchingLabels: string[]
}

const PRIMITIVE_BY_ID = new Map(SYSTEM_PRIMITIVES.map((primitive) => [primitive.id, primitive]))
const WEEK_DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export const FEED_RELEVANCE_THRESHOLD = 0.56

const FUZZY_BANDWIDTHS: Record<string, number> = {
  wday: 1,
  tod: 180,
  dom: 6,
  doy: 45,
  month: 1.5,
  mood: 1,
  tiredness: 0.8,
  focus: 0.8,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function gaussianMembership(distance: number, sigma: number): number {
  if (sigma <= 0) return distance === 0 ? 1 : 0
  return Math.exp(-((distance ** 2) / (2 * sigma ** 2)))
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function dayIdFromDate(now: Date): (typeof WEEK_DAY_IDS)[number] {
  const day = now.getDay()
  return WEEK_DAY_IDS[(day + 6) % 7]
}

function dayOfYear(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return Math.floor(diff / (24 * 60 * 60 * 1000))
}

function yearLength(now: Date): number {
  const year = now.getFullYear()
  const start = new Date(year, 0, 1)
  const end = new Date(year + 1, 0, 1)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
}

function primitiveBandwidth(primitiveId: string): number {
  return FUZZY_BANDWIDTHS[primitiveId] ?? 1
}

function circularDistance(left: number, right: number, modulus: number): number {
  const raw = Math.abs(left - right)
  return Math.min(raw, modulus - raw)
}

function parseBoolean(value: PrimitiveValue): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return value === 'true'
}

function numericValueForPrimitive(primitiveId: string, value: PrimitiveValue): number | null {
  if (primitiveId === 'tod') {
    return typeof value === 'string' ? timeToMinutes(value) : null
  }
  if (primitiveId === 'wday') {
    const index = WEEK_DAY_IDS.indexOf(String(value).toLowerCase() as (typeof WEEK_DAY_IDS)[number])
    return index >= 0 ? index : null
  }
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function equalityScore(primitiveId: string, actual: PrimitiveValue, expected: string, fuzzy: boolean, now: Date): number {
  const primitive = PRIMITIVE_BY_ID.get(primitiveId)
  if (!fuzzy || primitive?.valueType === 'boolean') {
    return String(actual).toLowerCase() === expected.toLowerCase() ? 1 : 0
  }

  const actualNumeric = numericValueForPrimitive(primitiveId, actual)
  const expectedNumeric = numericValueForPrimitive(primitiveId, expected)
  if (actualNumeric == null || expectedNumeric == null) {
    return String(actual).toLowerCase() === expected.toLowerCase() ? 1 : 0
  }

  const sigma = primitiveBandwidth(primitiveId)
  const distance = primitiveId === 'wday'
    ? circularDistance(actualNumeric, expectedNumeric, 7)
    : primitiveId === 'tod'
      ? circularDistance(actualNumeric, expectedNumeric, 24 * 60)
      : primitiveId === 'month'
        ? circularDistance(actualNumeric, expectedNumeric, 12)
        : primitiveId === 'doy'
          ? circularDistance(actualNumeric, expectedNumeric, yearLength(now))
          : Math.abs(actualNumeric - expectedNumeric)

  return gaussianMembership(distance, sigma)
}

function comparisonScore(operator: '>' | '<' | '>=' | '<=', primitiveId: string, actual: PrimitiveValue, expected: string, fuzzy: boolean): number {
  const actualNumeric = numericValueForPrimitive(primitiveId, actual)
  const expectedNumeric = numericValueForPrimitive(primitiveId, expected)
  if (actualNumeric == null || expectedNumeric == null) return 0

  const exactSatisfied =
    operator === '>' ? actualNumeric > expectedNumeric
      : operator === '<' ? actualNumeric < expectedNumeric
        : operator === '>=' ? actualNumeric >= expectedNumeric
          : actualNumeric <= expectedNumeric

  if (exactSatisfied) return 1
  if (!fuzzy) return 0

  const sigma = primitiveBandwidth(primitiveId)
  const shortfall = operator === '>' || operator === '>='
    ? expectedNumeric - actualNumeric
    : actualNumeric - expectedNumeric

  return gaussianMembership(Math.max(0, shortfall), sigma)
}

function inScore(primitiveId: string, actual: PrimitiveValue, expected: string, fuzzy: boolean, now: Date): number {
  const candidates = expected.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (!candidates.length) return 0
  return Math.max(...candidates.map((candidate) => equalityScore(primitiveId, actual, candidate, fuzzy, now)))
}

function qualifierScore(score: number, qualifier: string): number {
  const normalized = qualifier.trim().toLowerCase()
  if (normalized.includes('not')) return 1 - score
  return score
}

function conceptTargetMatch(target: RuleTarget, task: TaskDefinition, categoryIds: string[]): boolean {
  if (target.type === 'all-tasks') return true
  if (target.type === 'task') return target.taskId === task.id
  if (target.type === 'category') return Boolean(target.categoryId && categoryIds.includes(target.categoryId))
  if (target.type === 'concept') {
    const conceptIds = new Set([
      ...task.sharedConceptIds,
      ...(task.sharedContextLinks?.map((entry) => entry.conceptId) ?? []),
    ])
    return Boolean(target.conceptId && conceptIds.has(target.conceptId))
  }
  return false
}

export function buildRankingContext(
  profile: UserProfile,
  userTaskProfile: UserTaskProfile,
  now: Date,
  fatigue: number,
  categoryIds: string[],
  overrides: Partial<Record<string, PrimitiveValue>> = {}
): RankingEvaluationContext {
  const tiredness = clamp(Math.round(1 + fatigue * 2), 1, 3)
  const focus = clamp(Math.round(3 - fatigue * 2), 1, 3)

  return {
    now,
    profile,
    userTaskProfile,
    fatigue,
    categoryIds,
    primitives: {
      wday: dayIdFromDate(now),
      tod: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      dom: now.getDate(),
      doy: dayOfYear(now),
      month: now.getMonth() + 1,
      mood: 3,
      tiredness,
      focus,
      holiday: false,
      home: profile.workMode === 'home' || profile.isHomeNow,
      ...overrides,
    },
  }
}

export function evaluateExpression(
  node: ExpressionNode | undefined,
  context: RankingEvaluationContext,
  conceptIndex: Map<string, ConceptDefinition>,
  seen = new Set<string>()
): number {
  if (!node) return 0.5

  switch (node.type) {
    case 'concept-ref': {
      if (seen.has(node.conceptId)) return 0
      const concept = conceptIndex.get(node.conceptId)
      if (!concept?.definition) return 0.5
      const nextSeen = new Set(seen)
      nextSeen.add(node.conceptId)
      return evaluateExpression(concept.definition, context, conceptIndex, nextSeen)
    }
    case 'between-time': {
      const value = numericValueForPrimitive('tod', context.primitives.tod)
      if (value == null) return 0
      const start = timeToMinutes(node.start)
      const end = timeToMinutes(node.end)
      return value >= start && value <= end ? 1 : 0
    }
    case 'day-of-week':
      return node.values.includes(String(context.primitives.wday) as typeof node.values[number]) ? 1 : 0
    case 'month-range': {
      const month = Number(context.primitives.month)
      return month >= node.startMonth && month <= node.endMonth ? 1 : 0
    }
    case 'not':
      return 1 - evaluateExpression(node.child, context, conceptIndex, seen)
    case 'and':
      return node.children.length ? Math.min(...node.children.map((child) => evaluateExpression(child, context, conceptIndex, seen))) : 0
    case 'or':
      return node.children.length ? Math.max(...node.children.map((child) => evaluateExpression(child, context, conceptIndex, seen))) : 0
    case 'after-time': {
      const value = numericValueForPrimitive('tod', context.primitives.tod)
      return value != null && value >= timeToMinutes(node.value) ? 1 : 0
    }
    case 'before-time': {
      const value = numericValueForPrimitive('tod', context.primitives.tod)
      return value != null && value <= timeToMinutes(node.value) ? 1 : 0
    }
    case 'holiday-match':
      return parseBoolean(context.primitives.holiday) ? 1 : 0
    case 'category-match':
      return context.categoryIds.includes(node.categoryId) ? 1 : 0
    case 'task-profile-threshold': {
      const actual = context.userTaskProfile[node.field]
      if (node.op === '=') return actual === node.value ? 1 : 0
      if (node.op === '>=') return actual >= node.value ? 1 : gaussianMembership(node.value - actual, 0.2)
      return actual <= node.value ? 1 : gaussianMembership(actual - node.value, 0.2)
    }
    case 'primitive-clause': {
      const actual = context.primitives[node.primitive]
      if (actual == null) return 0
      const score = node.operator === '='
        ? equalityScore(node.primitive, actual, node.value, node.fuzzy, context.now)
        : node.operator === 'in'
          ? inScore(node.primitive, actual, node.value, node.fuzzy, context.now)
          : comparisonScore(node.operator, node.primitive, actual, node.value, node.fuzzy)
      return node.negated ? 1 - score : score
    }
    default:
      return 0
  }
}

export function evaluateTaskContexts(
  task: TaskDefinition,
  context: RankingEvaluationContext,
  conceptIndex: Map<string, CommonConcept>
): TaskContextSignal {
  const links = task.sharedContextLinks?.length
    ? task.sharedContextLinks
    : (task.sharedConceptIds ?? []).map((conceptId) => ({ conceptId, qualifier: 'during' }))

  if (!links.length) {
    return {
      hasContexts: false,
      score: 1,
      matchedLabels: [],
    }
  }

  const values = links.map((link) => {
    const concept = conceptIndex.get(link.conceptId)
    const raw = concept?.definition ? evaluateExpression(concept.definition, context, conceptIndex) : 0.5
    const adjusted = qualifierScore(raw, link.qualifier)
    return {
      label: concept ? `${link.qualifier} ${concept.label}` : `${link.qualifier} context`,
      score: clamp(adjusted, 0, 1),
    }
  })

  const score = Math.pow(values.reduce((product, entry) => product * Math.max(0.01, entry.score), 1), 1 / values.length)

  return {
    hasContexts: true,
    score: clamp(score, 0, 1),
    matchedLabels: values.filter((entry) => entry.score >= 0.5).map((entry) => entry.label),
  }
}

export function evaluateRuleSignals(
  state: AppState,
  personId: string,
  task: TaskDefinition,
  context: RankingEvaluationContext,
  conceptIndex: Map<string, CommonConcept>
): RuleSignal {
  const candidateRules = state.userRules
    .filter((rule) => rule.userId === personId && rule.enabled)
    .sort((left, right) => left.priority - right.priority)

  let scoreDelta = 0
  const matchingLabels: string[] = []

  for (const rule of candidateRules) {
    if (!conceptTargetMatch(rule.target, task, context.categoryIds)) continue
    const credence = evaluateExpression(rule.condition, context, conceptIndex)
    if (credence <= 0.12) continue

    const scheduleBias = clamp(rule.effect.scheduleBias ?? 0, -1, 1)
    const directScore = clamp(rule.effect.scoreDelta ?? 0, -1, 1)
    const delta = credence * (scheduleBias * 0.16 + directScore * 0.12)
    scoreDelta += delta

    if (credence >= 0.35) {
      matchingLabels.push(rule.label)
    }
  }

  return {
    scoreDelta: clamp(scoreDelta, -0.45, 0.45),
    matchingLabels,
  }
}
