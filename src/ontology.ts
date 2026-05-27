import type { CategoryDefinition, CommonConcept } from './types'

export const DEFAULT_COMMON_CONCEPTS: CommonConcept[] = [
  {
    id: 'time-workday',
    scope: 'shared',
    kind: 'timeframe',
    label: 'Workday',
    description: 'Monday through Friday, 08:00–17:00.',
    definition: { type: 'and', children: [{ type: 'day-of-week', values: ['mon', 'tue', 'wed', 'thu', 'fri'] }, { type: 'between-time', start: '08:00', end: '17:00' }] },
    examples: ['weekdays 09:00-17:00', 'after coffee', 'between meetings']
  },
  {
    id: 'time-evening-reset',
    scope: 'shared',
    kind: 'timeframe',
    label: 'Evening reset',
    description: 'Evenings after 18:00 — a recovery window for light chores.',
    definition: { type: 'between-time', start: '18:00', end: '21:30' },
    examples: ['after dinner', 'before bed', 'low-demand cleanup']
  },
  {
    id: 'spring-season',
    scope: 'shared',
    kind: 'season',
    label: 'Spring season',
    description: 'March through May.',
    definition: { type: 'month-range', startMonth: 3, endMonth: 5 },
    examples: ['march to may', 'airing rooms', 'spring cleanup']
  },
  {
    id: 'spring-break',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Spring break',
    description: 'A short spring holiday window when routines and available time may change.',
    examples: ['school break', 'family travel week', 'staycation days']
  },
  {
    id: 'summer-holidays',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Summer holidays',
    description: 'June through August — longer holiday with altered structure.',
    definition: { type: 'month-range', startMonth: 6, endMonth: 8 },
    examples: ['july holidays', 'august break', 'summer vacation']
  },
  {
    id: 'new-year-season',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'New year season',
    description: 'Late December through early January.',
    definition: { type: 'month-range', startMonth: 12, endMonth: 1 },
    examples: ['new year week', 'year-end reset', 'january start']
  },
  {
    id: 'christmas-holidays',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Christmas holidays',
    description: 'Christmas and adjacent holidays — late December.',
    definition: { type: 'month-range', startMonth: 12, endMonth: 12 },
    examples: ['christmas week', 'holiday hosting', 'winter break']
  },
  {
    id: 'season-warm-months',
    scope: 'shared',
    kind: 'season',
    label: 'Warm months',
    description: 'April through September.',
    definition: { type: 'month-range', startMonth: 4, endMonth: 9 },
    examples: ['spring', 'summer', 'sunny weekends']
  },
  {
    id: 'weekend-morning',
    scope: 'shared',
    kind: 'timeframe',
    label: 'Weekend morning',
    description: 'Saturday and Sunday before noon.',
    definition: { type: 'and', children: [{ type: 'day-of-week', values: ['sat', 'sun'] }, { type: 'between-time', start: '08:00', end: '12:00' }] },
    examples: ['saturday morning', 'sunday brunch time']
  },
  {
    id: 'mood-good-enough',
    scope: 'shared',
    kind: 'mood',
    label: 'Good enough mood',
    description: 'Not amazing, not terrible, but sufficient for gentle progress.',
    examples: ['steady', 'okay', 'good enough to begin']
  },
  {
    id: 'energy-light-effort',
    scope: 'shared',
    kind: 'energy',
    label: 'Light effort',
    description: 'Tasks that can happen even with limited energy reserves.',
    examples: ['2-minute tidy', 'quick wipe', 'mailbox run']
  },
  {
    id: 'life-home-care',
    scope: 'shared',
    kind: 'life-context',
    label: 'Home care',
    description: 'Shared maintenance of a living space without moral judgment.',
    examples: ['cleaning', 'laundry', 'watering plants']
  },
  {
    id: 'social-shared-space',
    scope: 'shared',
    kind: 'social-pattern',
    label: 'Shared space agreement',
    description: 'Chores that matter because multiple people live with their effects.',
    examples: ['kitchen sink', 'trash', 'bathroom basics']
  }
]

export const CONCEPT_KIND_LABELS: Record<CommonConcept['kind'], string> = {
  timeframe: 'Timeframe',
  season: 'Season',
  mood: 'Mood',
  energy: 'Energy',
  'life-context': 'Life context',
  'social-pattern': 'Social pattern',
  'time-of-day': 'Time of day',
  'day-type': 'Day type',
  'calendar-window': 'Calendar window',
  'work-pattern': 'Work pattern',
  'comfort-state': 'Comfort state',
  'task-trait': 'Task trait',
  custom: 'Custom'
}

const now = new Date().toISOString()

export const DEFAULT_CATEGORIES: Omit<CategoryDefinition, 'createdAt'>[] = [
  {
    id: 'cat-basic-chores',
    createdBy: 'system',
    label: 'basic chores',
    definition: 'Routine household maintenance that keeps the space livable.',
    status: 'active'
  },
  {
    id: 'cat-washing',
    createdBy: 'system',
    label: 'washing',
    definition: 'Laundry, dishes, and anything that involves soap and water cycles.',
    status: 'active'
  },
  {
    id: 'cat-paying-bills',
    createdBy: 'system',
    label: 'paying bills',
    definition: 'Financial obligations and administrative paperwork.',
    status: 'active'
  },
  {
    id: 'cat-deep-cleaning',
    createdBy: 'system',
    label: 'deep cleaning',
    definition: 'Thorough cleaning tasks that go beyond daily maintenance.',
    status: 'active'
  },
  {
    id: 'cat-organizing',
    createdBy: 'system',
    label: 'organizing',
    definition: 'Decluttering, sorting, and maintaining order in storage and surfaces.',
    status: 'active'
  },
  {
    id: 'cat-kitchen',
    createdBy: 'system',
    label: 'kitchen',
    definition: 'Tasks centered around cooking spaces and appliances.',
    status: 'active'
  },
  {
    id: 'cat-bathroom',
    createdBy: 'system',
    label: 'bathroom',
    definition: 'Cleaning and maintaining bathroom spaces.',
    status: 'active'
  },
  {
    id: 'cat-plant-care',
    createdBy: 'system',
    label: 'plant care',
    definition: 'Watering, trimming, and general plant maintenance.',
    status: 'active'
  },
  {
    id: 'cat-seasonal',
    createdBy: 'system',
    label: 'seasonal',
    definition: 'Tasks that only make sense during certain times of year.',
    status: 'active'
  }
]
