import type { AppState, CadenceUnit, FeedCard, TaskDefinition, TaskHealth, TaskLogEntry, UserProfile, UserTaskProfile } from './types'
import { buildRankingContext, evaluateRuleSignals, evaluateTaskContexts, FEED_RELEVANCE_THRESHOLD } from './ranking.ts'

export const MOOD_EMOJIS = ['😮‍💨', '😕', '😐', '🙂', '🤩']

const HOUR_MS = 60 * 60 * 1000

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function cadenceToMs(every: number, unit: CadenceUnit): number {
  const base = unit === 'hour' ? HOUR_MS : unit === 'day' ? 24 * HOUR_MS : unit === 'week' ? 7 * 24 * HOUR_MS : 30 * 24 * HOUR_MS
  return Math.max(HOUR_MS, every * base)
}

function cadenceParts(task: TaskDefinition): { every: number; unit: CadenceUnit } {
  if (task.desiredFrequency.kind === 'interval') {
    return {
      every: task.desiredFrequency.every,
      unit: task.desiredFrequency.unit
    }
  }

  return {
    every: 1,
    unit: 'month'
  }
}

export function formatCadence(task: TaskDefinition): string {
  if (task.desiredFrequency.kind === 'calendar') {
    return task.desiredFrequency.rruleText
  }

  return `every ${task.desiredFrequency.every} ${task.desiredFrequency.unit}${task.desiredFrequency.every > 1 ? 's' : ''}`
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function isWeekend(now: Date): boolean {
  const day = now.getDay()
  return day === 0 || day === 6
}

function matchesDayGroup(group: UserTaskProfile['preferredTime']['dayGroup'], now: Date): boolean {
  if (group === 'any day') return true
  return group === 'weekends' ? isWeekend(now) : !isWeekend(now)
}

function currentAvailability(profile: UserProfile, now: Date) {
  return isWeekend(now) ? profile.availability.weekends : profile.availability.weekdays
}

function isLightEnoughForWorkStretch(userTaskProfile: UserTaskProfile): boolean {
  return userTaskProfile.subjectiveTime <= 0.35 && userTaskProfile.focus <= 0.42
}

function logsForUserTaskProfile(logs: TaskLogEntry[], userTaskProfileId: string): TaskLogEntry[] {
  return logs
    .filter((entry) => entry.userTaskProfileId === userTaskProfileId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function lastActionOfKind(actions: TaskLogEntry[], kind: TaskLogEntry['action']): TaskLogEntry | undefined {
  return [...actions].reverse().find((action) => action.action === kind)
}

function computeDueScore(task: TaskDefinition, actions: TaskLogEntry[], now: Date): number {
  const lastDone = lastActionOfKind(actions, 'done')
  const { every, unit } = cadenceParts(task)
  const interval = cadenceToMs(every, unit)

  if (!lastDone) {
    return 0.92
  }

  const elapsed = now.getTime() - new Date(lastDone.createdAt).getTime()
  return clamp(elapsed / interval, 0, 1.65)
}

function computeAvailabilityScore(userTaskProfile: UserTaskProfile, profile: UserProfile, now: Date): number {
  const minute = now.getHours() * 60 + now.getMinutes()
  const availability = currentAvailability(profile, now)
  const preferredWindow = userTaskProfile.preferredTime
  const activeWindow = preferredWindow ?? availability
  const personalWindowStart = timeToMinutes(activeWindow.start)
  const personalWindowEnd = timeToMinutes(activeWindow.end)
  const workWindowStart = timeToMinutes(profile.workingHours.start)
  const workWindowEnd = timeToMinutes(profile.workingHours.end)
  const availabilityStart = timeToMinutes(availability.start)
  const availabilityEnd = timeToMinutes(availability.end)
  const withinPersonal = minute >= personalWindowStart && minute <= personalWindowEnd
  const withinAvailability = minute >= availabilityStart && minute <= availabilityEnd
  const withinWork = minute >= workWindowStart && minute <= workWindowEnd
  const groupMatch = matchesDayGroup(activeWindow.dayGroup, now)
  const workdayStretchOkay =
    !isWeekend(now) &&
    withinWork &&
    profile.allowWorkdayMicroTasks &&
    (profile.workMode === 'home' || (profile.workMode === 'hybrid' && profile.isHomeNow)) &&
    isLightEnoughForWorkStretch(userTaskProfile)

  if (!groupMatch) {
    return 0.1
  }

  if (withinPersonal) {
    return 1
  }

  if (!preferredWindow && withinAvailability) {
    return 0.96
  }

  if (preferredWindow && withinAvailability) {
    return 0.74
  }

  if (workdayStretchOkay) {
    return 0.82
  }

  if (withinWork) {
    return 0.65
  }

  const distance = Math.min(Math.abs(minute - personalWindowStart), Math.abs(minute - personalWindowEnd))
  return clamp(1 - distance / 600, 0.2, 0.8)
}

function computeFatigue(state: AppState, profile: UserProfile, now: Date): number {
  const currentUserActions = state.logs.filter((action) => action.userId === profile.id && action.action === 'done')
  if (!currentUserActions.length) {
    return 0
  }

  const profileIndex = new Map(state.userTaskProfiles.map((entry) => [entry.id, entry]))

  let fatigue = 0
  for (const action of currentUserActions) {
    const ageHours = Math.max(0, (now.getTime() - new Date(action.createdAt).getTime()) / HOUR_MS)
    if (ageHours > 48) {
      continue
    }

    const userTaskProfile = profileIndex.get(action.userTaskProfileId)
    if (!userTaskProfile) {
      continue
    }

    const taskWeight = clamp((userTaskProfile.grandness + userTaskProfile.subjectiveTime + userTaskProfile.focus) / 3, 0.1, 1)
    const difficultyWeight = clamp((profile.difficultyBias + taskWeight) / 2, 0.1, 1)
    const load = ((userTaskProfile.focus + difficultyWeight) / 2) * profile.tirednessSensitivity
    fatigue += load * Math.exp(-profile.recoveryPerHour * ageHours)
  }

  return clamp(fatigue, 0, 1.25)
}

function computeCompassion(userTaskProfile: UserTaskProfile, profile: UserProfile, actions: TaskLogEntry[]): number {
  const recentSkips = actions.filter((action) => action.action === 'skip').slice(-3).length
  const compassionBase = clamp(profile.forgiveness - userTaskProfile.importance * 0.22 + (1 - userTaskProfile.grandness) * 0.12, 0.2, 1)
  return clamp(compassionBase + recentSkips * 0.05, 0.2, 1)
}

function computeHealthFromSignals(completionRate: number, skipRate: number, fatigue: number, duePressure: number, compassion: number): number {
  const score =
    completionRate * 0.42 +
    (1 - skipRate) * 0.18 +
    (1 - clamp(fatigue, 0, 1)) * 0.14 +
    (1 - clamp(duePressure - 1, 0, 1)) * 0.12 +
    compassion * 0.14

  return clamp(score, 0, 1)
}

function toneFromHealth(health: number): 'green' | 'amber' | 'red' {
  if (health >= 0.7) return 'green'
  if (health >= 0.42) return 'amber'
  return 'red'
}

function expectedCountWithinDays(task: TaskDefinition, days: number): number {
  const totalMs = days * 24 * HOUR_MS
  const { every, unit } = cadenceParts(task)
  return Math.max(1, totalMs / cadenceToMs(every, unit))
}

function computeCompletionRate(task: TaskDefinition, actions: TaskLogEntry[], days = 30): number {
  const windowStart = Date.now() - days * 24 * HOUR_MS
  const relevant = actions.filter((action) => new Date(action.createdAt).getTime() >= windowStart)
  const done = relevant.filter((action) => action.action === 'done').length
  const expected = expectedCountWithinDays(task, days)
  return clamp(done / expected, 0, 1.2)
}

function computeSkipRate(actions: TaskLogEntry[], days = 30): number {
  const windowStart = Date.now() - days * 24 * HOUR_MS
  const relevant = actions.filter((action) => new Date(action.createdAt).getTime() >= windowStart)
  if (!relevant.length) {
    return 0
  }
  const skips = relevant.filter((action) => action.action === 'skip').length
  return clamp(skips / relevant.length, 0, 1)
}

function inferSuggestedMood(card: FeedCard): string {
  if (card.fatigue > 0.8) return 'low battery'
  if (card.dueScore > 1.1) return 'kind urgency'
  if (card.contextScore > 0.8) return 'good enough'
  return 'gentle focus'
}

export function rankFeedCards(state: AppState, personId: string, now = new Date()): FeedCard[] {
  const profile = state.users.find((entry) => entry.id === personId)
  if (!profile) {
    return []
  }

  const taskIndex = new Map(state.tasks.map((task) => [task.id, task]))
  const categoryIndex = new Map(state.categories.map((category) => [category.id, category]))
  const conceptIndex = new Map(state.concepts.map((concept) => [concept.id, concept]))
  const sharedCategoryIndex = new Map<string, string[]>()
  for (const assignment of state.sharedTaskCategories) {
    sharedCategoryIndex.set(assignment.taskId, [...(sharedCategoryIndex.get(assignment.taskId) ?? []), assignment.categoryId])
  }
  const userCategoryIndex = new Map<string, string[]>()
  for (const assignment of state.userTaskCategories.filter((entry) => entry.userId === personId)) {
    userCategoryIndex.set(assignment.taskId, [...(userCategoryIndex.get(assignment.taskId) ?? []), assignment.categoryId])
  }
  const fatigue = computeFatigue(state, profile, now)

  return state.userTaskProfiles
    .filter((userTaskProfile) => userTaskProfile.userId === personId && userTaskProfile.active)
    .map((userTaskProfile) => {
      const task = taskIndex.get(userTaskProfile.taskId)
      if (!task) {
        return null
      }

      const actions = logsForUserTaskProfile(state.logs, userTaskProfile.id)
      const dueScore = computeDueScore(task, actions, now)
      const compassion = computeCompassion(userTaskProfile, profile, actions)
      const perceivedDifficulty = clamp(
        userTaskProfile.grandness * 0.32 + userTaskProfile.subjectiveTime * 0.3 + userTaskProfile.focus * 0.22 + profile.difficultyBias * 0.16,
        0.1,
        1
      )
      const personalFatigue = clamp(fatigue + userTaskProfile.focus * 0.16 + userTaskProfile.subjectiveTime * 0.14 + perceivedDifficulty * 0.1, 0, 1.3)
      const categoryIds = [...new Set([...(sharedCategoryIndex.get(task.id) ?? []), ...(userCategoryIndex.get(task.id) ?? [])])]
      const availabilityScore = computeAvailabilityScore(userTaskProfile, profile, now)
      const rankingContext = buildRankingContext(profile, userTaskProfile, now, personalFatigue, categoryIds)
      const taskContextSignal = evaluateTaskContexts(task, rankingContext, conceptIndex)
      const ruleSignal = evaluateRuleSignals(state, personId, task, rankingContext, conceptIndex)
      const contextScore = taskContextSignal.hasContexts
        ? clamp(availabilityScore * 0.25 + taskContextSignal.score * 0.75, 0, 1)
        : availabilityScore
      const contextGate = taskContextSignal.hasContexts ? clamp(0.08 + taskContextSignal.score * 0.92, 0.08, 1) : 1
      const health = computeHealthFromSignals(
        computeCompletionRate(task, actions),
        computeSkipRate(actions),
        personalFatigue,
        dueScore,
        compassion
      )
      const lastDone = lastActionOfKind(actions, 'done')
      const lastSkip = lastActionOfKind(actions, 'skip')
      const relevanceBase =
        dueScore * (0.24 + userTaskProfile.importance * 0.12) +
        contextScore * 0.28 +
        availabilityScore * 0.08 +
        (1 - clamp(personalFatigue, 0, 1)) * 0.16 +
        compassion * 0.12 +
        (1 - perceivedDifficulty) * 0.08 +
        ruleSignal.scoreDelta
      const relevance = clamp(relevanceBase * contextGate, 0, 2)

      const card: FeedCard = {
        userTaskProfile,
        task,
        user: profile,
        dueScore,
        contextScore,
        availabilityScore,
        taskContextScore: taskContextSignal.score,
        ruleScore: ruleSignal.scoreDelta,
        fatigue: personalFatigue,
        compassion,
        relevance,
        health,
        healthTone: toneFromHealth(health),
        lastAction: actions.at(-1),
        lastDoneAt: lastDone?.createdAt,
        lastSkipAt: lastSkip?.createdAt,
        suggestedMood: '',
        categoryLabels: categoryIds.map((id) => categoryIndex.get(id)?.label ?? id),
        adoptedRuleLabels: ruleSignal.matchingLabels
      }

      card.suggestedMood = inferSuggestedMood(card)
      return card
    })
    .filter((entry): entry is FeedCard => Boolean(entry))
    .sort((left, right) => right.relevance - left.relevance)
}

export function getFeedCards(state: AppState, personId: string, now = new Date()): FeedCard[] {
  return rankFeedCards(state, personId, now)
    .filter((card) => {
      const lastAction = card.lastAction
      if (lastAction) {
        const { every, unit } = cadenceParts(card.task)
        const interval = cadenceToMs(every, unit)
        const elapsed = now.getTime() - new Date(lastAction.createdAt).getTime()
        if (elapsed < interval * 0.3) return false
      }
      return card.relevance >= FEED_RELEVANCE_THRESHOLD
    })
    .slice(0, 8)
}

export function getWishHealth(state: AppState, personId: string, now = new Date()): TaskHealth[] {
  const profile = state.users.find((entry) => entry.id === personId)
  if (!profile) {
    return []
  }

  const taskIndex = new Map(state.tasks.map((task) => [task.id, task]))
  const fatigue = computeFatigue(state, profile, now)

  return state.userTaskProfiles
    .filter((userTaskProfile) => userTaskProfile.userId === personId && userTaskProfile.active)
    .map((userTaskProfile) => {
      const task = taskIndex.get(userTaskProfile.taskId)
      if (!task) {
        return null
      }

      const actions = logsForUserTaskProfile(state.logs, userTaskProfile.id)
      const completionRate = clamp(computeCompletionRate(task, actions), 0, 1)
      const skipRate = computeSkipRate(actions)
      const duePressure = computeDueScore(task, actions, now)
      const compassion = computeCompassion(userTaskProfile, profile, actions)
      const perceivedDifficulty = clamp(
        userTaskProfile.grandness * 0.32 + userTaskProfile.subjectiveTime * 0.3 + userTaskProfile.focus * 0.22 + profile.difficultyBias * 0.16,
        0.1,
        1
      )
      const personalFatigue = clamp(fatigue + userTaskProfile.focus * 0.14 + userTaskProfile.subjectiveTime * 0.12 + perceivedDifficulty * 0.12, 0, 1.2)
      const health = computeHealthFromSignals(completionRate, skipRate, personalFatigue, duePressure, compassion)
      const tone = toneFromHealth(health)

      let suggestion = 'Keep the rhythm. This task looks supported.'
      if (tone === 'amber') {
        suggestion = personalFatigue > 0.7
          ? 'This task may need a softer window or lower energy expectation.'
          : 'Fine tune the cadence or split the task into smaller acts.'
      }
      if (tone === 'red') {
        suggestion = skipRate > 0.35
          ? 'Consider breaking this into a smaller task or making the window more forgiving.'
          : 'It may be too heavy for the current energy model. Lower the burden or pair it with a kinder context.'
      }

      return {
        userTaskProfile,
        task,
        user: profile,
        health,
        tone,
        completionRate,
        skipRate,
        fatigue: personalFatigue,
        duePressure,
        suggestion
      }
    })
    .filter((entry): entry is TaskHealth => Boolean(entry))
    .sort((left, right) => left.health - right.health)
}

export function timeAgo(iso?: string): string {
  if (!iso) return 'not yet'
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffHours = Math.round(diffMs / HOUR_MS)
  if (diffHours < 1) return 'just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

export function toneLabel(tone: 'green' | 'amber' | 'red'): string {
  if (tone === 'green') return 'green'
  if (tone === 'amber') return 'watch'
  return 'needs care'
}
