import { DEFAULT_CATEGORIES, DEFAULT_COMMON_CONCEPTS } from './ontology'
import type {
  AppState,
  CategoryDefinition,
  SharedRuleDefinition,
  UserConceptDefinition,
  UserProfile,
  UserRule,
} from './types'

const defaultUser: UserProfile = {
  id: 'user-me',
  name: 'Me',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  locale: 'en',
  workingHours: {
    dayGroup: 'weekdays',
    start: '08:00',
    end: '16:00'
  },
  availability: {
    weekdays: {
      dayGroup: 'weekdays',
      start: '16:00',
      end: '23:59'
    },
    weekends: {
      dayGroup: 'weekends',
      start: '08:00',
      end: '23:59'
    }
  },
  workMode: 'away',
  isHomeNow: false,
  allowWorkdayMicroTasks: false,
  homeWifiNames: [],
  tirednessSensitivity: 0.6,
  recoveryPerHour: 0.08,
  forgiveness: 0.72,
  difficultyBias: 0.56
}

const defaultConceptOverrides: UserConceptDefinition[] = [
  {
    id: crypto.randomUUID(),
    userId: defaultUser.id,
    conceptId: 'time-workday',
    label: 'My workday',
    notes: 'Cognitive work is easier before 14:00. Light chores fit late afternoon.',
    intensity: 0.72,
    updatedAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    userId: defaultUser.id,
    conceptId: 'mood-good-enough',
    label: 'My good-enough mood',
    notes: 'When I do not feel bright, but I can still do one kind thing for the house.',
    intensity: 0.65,
    updatedAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    userId: defaultUser.id,
    conceptId: 'energy-light-effort',
    label: 'My light effort',
    notes: 'Five to ten minute chores are usually possible, even when I am tired.',
    intensity: 0.68,
    updatedAt: new Date().toISOString()
  }
]

const defaultCategories: CategoryDefinition[] = DEFAULT_CATEGORIES.map((category) => ({
  ...category,
  createdAt: new Date().toISOString()
}))

const defaultSharedRules: SharedRuleDefinition[] = []

function buildAdoptedRules(): UserRule[] {
  return []
}

export function createInitialState(roomId: string): AppState {
  return {
    space: {
      title: 'Garden',
      roomId
    },
    concepts: DEFAULT_COMMON_CONCEPTS,
    users: [defaultUser],
    userConceptDefinitions: defaultConceptOverrides,
    tasks: [],
    userTaskProfiles: [],
    categories: defaultCategories,
    sharedTaskCategories: [],
    userTaskCategories: [],
    sharedRules: defaultSharedRules,
    userRules: buildAdoptedRules(),
    logs: [],
    archives: [],
    selectedUserId: defaultUser.id
  }
}
