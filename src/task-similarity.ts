import type { TaskDefinition } from './types'

export type SimilarTaskMatch = {
  task: TaskDefinition
  score: number
  exact: boolean
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'for', 'my', 'our', 'in', 'on'])

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function jaccard(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  let intersection = 0
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1
  })
  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 0 : intersection / union
}

function similarityScore(query: string, candidate: TaskDefinition): number {
  const normalizedQuery = normalizeText(query)
  const normalizedTitle = normalizeText(candidate.title)
  const normalizedDefinition = normalizeText(candidate.definition)
  if (!normalizedQuery || !normalizedTitle) return 0

  if (normalizedQuery === normalizedTitle) return 1
  if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) return 0.92

  const queryTokens = tokenize(normalizedQuery)
  const titleTokens = tokenize(normalizedTitle)
  const definitionTokens = tokenize(normalizedDefinition)
  const titleOverlap = jaccard(queryTokens, titleTokens)
  const definitionOverlap = jaccard(queryTokens, definitionTokens)
  const firstTokenBoost = queryTokens.length > 0 && titleTokens.some((token) => token.startsWith(queryTokens[0])) ? 0.08 : 0

  return Math.max(titleOverlap * 0.85 + definitionOverlap * 0.35 + firstTokenBoost, 0)
}

export function getSimilarTasks(tasks: TaskDefinition[], query: string, limit = 5): SimilarTaskMatch[] {
  const normalizedQuery = normalizeText(query)
  if (normalizedQuery.length < 3) return []

  return tasks
    .map((task) => {
      const score = similarityScore(normalizedQuery, task)
      return {
        task,
        score,
        exact: normalizeText(task.title) === normalizedQuery,
      }
    })
    .filter((match) => match.score >= 0.34)
    .sort((left, right) => right.score - left.score || left.task.title.localeCompare(right.task.title))
    .slice(0, limit)
}
