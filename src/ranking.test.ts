import { describe, expect, it } from 'vitest'

import { getFeedCards, rankFeedCards } from './engine'
import { DEFAULT_COMMON_CONCEPTS } from './ontology.ts'
import { buildRankingContext, evaluateExpression } from './ranking.ts'
import type { AppState, CategoryDefinition, ExpressionNode, TaskDefinition, UserProfile, UserTaskProfile } from './types'

const baseUser: UserProfile = {
  id: 'user-me',
  name: 'Me',
  timezone: 'UTC',
  locale: 'en',
  workingHours: { dayGroup: 'weekdays', start: '08:00', end: '16:00' },
  availability: {
    weekdays: { dayGroup: 'weekdays', start: '16:00', end: '23:00' },
    weekends: { dayGroup: 'weekends', start: '08:00', end: '23:00' },
  },
  workMode: 'home',
  isHomeNow: true,
  allowWorkdayMicroTasks: true,
  homeWifiNames: [],
  tirednessSensitivity: 0.2,
  recoveryPerHour: 0.08,
  forgiveness: 0.75,
  difficultyBias: 0.3,
}

function makeTask(id: string, title: string, conceptId?: string): TaskDefinition {
  return {
    id,
    createdBy: baseUser.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    title,
    definition: title,
    desiredFrequency: { kind: 'interval', finite: false, every: 7, unit: 'day' },
    defaultSubjectiveProfile: { importance: 0.55, grandness: 0.3, subjectiveTime: 0.2, focus: 0.2 },
    sharedConceptIds: conceptId ? [conceptId] : [],
    sharedContextLinks: conceptId ? [{ conceptId, qualifier: 'during' }] : [],
  }
}

function makeUserTaskProfile(taskId: string, overrides: Partial<UserTaskProfile> = {}): UserTaskProfile {
  return {
    id: `utp-${taskId}`,
    taskId,
    userId: baseUser.id,
    basis: 'created',
    active: true,
    importance: 0.6,
    grandness: 0.25,
    subjectiveTime: 0.2,
    focus: 0.2,
    preferredTime: { dayGroup: 'any day', start: '00:00', end: '23:59' },
    notes: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function baseState(): AppState {
  return {
    space: { title: 'Garden', roomId: 'test-room' },
    concepts: DEFAULT_COMMON_CONCEPTS,
    users: [baseUser],
    userConceptDefinitions: [],
    tasks: [],
    userTaskProfiles: [],
    categories: [],
    sharedTaskCategories: [],
    userTaskCategories: [],
    sharedRules: [],
    userRules: [],
    logs: [],
    archives: [],
    selectedUserId: baseUser.id,
  }
}

describe('fuzzy expression evaluation', () => {
  it('uses weekday proximity for fuzzy equality', () => {
    const conceptIndex = new Map(DEFAULT_COMMON_CONCEPTS.map((concept) => [concept.id, concept]))
    const clause: ExpressionNode = { type: 'primitive-clause', primitive: 'wday', operator: '=', fuzzy: true, value: 'tue' }
    const profile = makeUserTaskProfile('task-a')

    const tuesday = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-06-02T10:00:00.000Z'), 0.2, []), conceptIndex)
    const monday = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-06-01T10:00:00.000Z'), 0.2, []), conceptIndex)
    const saturday = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-06-06T10:00:00.000Z'), 0.2, []), conceptIndex)

    expect(tuesday).toBeCloseTo(1, 5)
    expect(monday).toBeGreaterThan(0.55)
    expect(saturday).toBeLessThan(0.05)
  })

  it('uses day-of-month bandwidth for fuzzy month parts', () => {
    const conceptIndex = new Map(DEFAULT_COMMON_CONCEPTS.map((concept) => [concept.id, concept]))
    const clause: ExpressionNode = { type: 'primitive-clause', primitive: 'dom', operator: '=', fuzzy: true, value: '6' }
    const profile = makeUserTaskProfile('task-a')

    const near = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-06-03T10:00:00.000Z'), 0.2, []), conceptIndex)
    const mid = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-06-11T10:00:00.000Z'), 0.2, []), conceptIndex)
    const late = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-06-24T10:00:00.000Z'), 0.2, []), conceptIndex)

    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(late)
    expect(late).toBeLessThan(0.1)
  })

  it('uses day-of-year bandwidth for fuzzy year parts', () => {
    const conceptIndex = new Map(DEFAULT_COMMON_CONCEPTS.map((concept) => [concept.id, concept]))
    const clause: ExpressionNode = { type: 'primitive-clause', primitive: 'doy', operator: '=', fuzzy: true, value: '305' }
    const profile = makeUserTaskProfile('task-a')

    const autumn = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-10-31T10:00:00.000Z'), 0.2, []), conceptIndex)
    const midsummer = evaluateExpression(clause, buildRankingContext(baseUser, profile, new Date('2026-07-01T10:00:00.000Z'), 0.2, []), conceptIndex)

    expect(autumn).toBeGreaterThan(0.9)
    expect(midsummer).toBeLessThan(0.1)
  })
})

describe('context-based ranking', () => {
  it('moves a task to the beginning-of-week context and away from the end-of-week context', () => {
    const state = baseState()
    const startTask = makeTask('task-start', 'Kitchen reset', 'context-beginning-of-week')
    const endTask = makeTask('task-end', 'Weekend reset', 'context-end-of-week')
    state.tasks = [startTask, endTask]
    state.userTaskProfiles = [makeUserTaskProfile(startTask.id), makeUserTaskProfile(endTask.id)]

    const tuesdayCards = rankFeedCards(state, baseUser.id, new Date('2026-06-02T10:00:00.000Z'))
    const saturdayCards = rankFeedCards(state, baseUser.id, new Date('2026-06-06T10:00:00.000Z'))

    expect(tuesdayCards[0]?.task.id).toBe('task-start')
    expect(saturdayCards[0]?.task.id).toBe('task-end')
    expect(tuesdayCards.find((card) => card.task.id === 'task-start')?.relevance ?? 0)
      .toBeGreaterThan(tuesdayCards.find((card) => card.task.id === 'task-end')?.relevance ?? 0)
    expect(saturdayCards.find((card) => card.task.id === 'task-end')?.relevance ?? 0)
      .toBeGreaterThan(saturdayCards.find((card) => card.task.id === 'task-start')?.relevance ?? 0)
  })

  it('can produce an empty feed when no task crosses the credence threshold', () => {
    const state = baseState()
    const task = makeTask('task-start', 'Tuesday admin', 'context-beginning-of-week')
    state.tasks = [task]
    state.userTaskProfiles = [makeUserTaskProfile(task.id, { importance: 0.35, grandness: 0.4, subjectiveTime: 0.4, focus: 0.45 })]

    const feed = getFeedCards(state, baseUser.id, new Date('2026-06-07T10:00:00.000Z'))
    expect(feed).toEqual([])
  })

  it('applies rule conditions as ranking boosts when they match', () => {
    const state = baseState()
    const kitchenCategory: CategoryDefinition = {
      id: 'cat-kitchen',
      createdBy: baseUser.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      label: 'kitchen',
      status: 'active',
      definition: 'Kitchen work',
    }
    state.categories = [kitchenCategory]

    const boostedTask = makeTask('task-boosted', 'Kitchen reset', 'context-beginning-of-week')
    const neutralTask = makeTask('task-neutral', 'Hallway reset', 'context-beginning-of-week')
    state.tasks = [boostedTask, neutralTask]
    state.userTaskProfiles = [makeUserTaskProfile(boostedTask.id), makeUserTaskProfile(neutralTask.id)]
    state.sharedTaskCategories = [
      { id: 'stc-1', taskId: boostedTask.id, categoryId: kitchenCategory.id, assignedBy: baseUser.id, createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    state.userRules = [
      {
        id: 'rule-1',
        userId: baseUser.id,
        createdAt: '2026-01-01T00:00:00.000Z',
        enabled: true,
        priority: 1,
        source: 'created',
        label: 'Tuesday kitchen bias',
        description: 'Prefer kitchen resets near Tuesday.',
        target: { type: 'category', categoryId: kitchenCategory.id },
        condition: { type: 'primitive-clause', primitive: 'wday', operator: '=', fuzzy: true, value: 'tue' },
        effect: { scheduleBias: 1 },
      },
    ]

    const cards = rankFeedCards(state, baseUser.id, new Date('2026-06-02T10:00:00.000Z'))
    expect(cards[0]?.task.id).toBe('task-boosted')
    expect(cards.find((card) => card.task.id === 'task-boosted')?.ruleScore ?? 0).toBeGreaterThan(0)
  })
})
