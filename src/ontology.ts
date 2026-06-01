import type { CategoryDefinition, CommonConcept } from './types'

export const DEFAULT_COMMON_CONCEPTS: CommonConcept[] = [
  {
    id: 'context-spring',
    scope: 'shared',
    kind: 'season',
    label: 'Spring',
    description: 'The spring part of the year.',
    definition: { type: 'month-range', startMonth: 3, endMonth: 5 },
    examples: ['march', 'april', 'may']
  },
  {
    id: 'context-summer',
    scope: 'shared',
    kind: 'season',
    label: 'Summer',
    description: 'The summer part of the year.',
    definition: { type: 'month-range', startMonth: 6, endMonth: 8 },
    examples: ['june', 'july', 'august']
  },
  {
    id: 'context-autumn',
    scope: 'shared',
    kind: 'season',
    label: 'Autumn',
    description: 'The autumn part of the year.',
    definition: { type: 'month-range', startMonth: 9, endMonth: 11 },
    examples: ['september', 'october', 'november']
  },
  {
    id: 'context-winter',
    scope: 'shared',
    kind: 'season',
    label: 'Winter',
    description: 'The winter part of the year.',
    definition: {
      type: 'or',
      children: [
        { type: 'month-range', startMonth: 12, endMonth: 12 },
        { type: 'month-range', startMonth: 1, endMonth: 2 },
      ],
    },
    examples: ['december', 'january', 'february']
  },
  {
    id: 'context-warmer-time-of-year',
    scope: 'shared',
    kind: 'season',
    label: 'Warmer time of year',
    description: 'The warmer part of the year.',
    definition: { type: 'month-range', startMonth: 4, endMonth: 9 },
    examples: ['warmer months', 'milder weather', 'outdoor season']
  },
  {
    id: 'context-colder-time-of-year',
    scope: 'shared',
    kind: 'season',
    label: 'Colder time of year',
    description: 'The colder part of the year.',
    definition: {
      type: 'or',
      children: [
        { type: 'month-range', startMonth: 10, endMonth: 12 },
        { type: 'month-range', startMonth: 1, endMonth: 3 },
      ],
    },
    examples: ['cold months', 'heating season', 'winter weather']
  },
  {
    id: 'context-lighter-part-of-year',
    scope: 'shared',
    kind: 'season',
    label: 'Lighter part of the year',
    description: 'The brighter months with longer daylight.',
    definition: { type: 'month-range', startMonth: 4, endMonth: 9 },
    examples: ['long daylight', 'brighter evenings', 'sunny season']
  },
  {
    id: 'context-darker-part-of-year',
    scope: 'shared',
    kind: 'season',
    label: 'Darker part of the year',
    description: 'The darker months with shorter daylight.',
    definition: {
      type: 'or',
      children: [
        { type: 'month-range', startMonth: 10, endMonth: 12 },
        { type: 'month-range', startMonth: 1, endMonth: 3 },
      ],
    },
    examples: ['short daylight', 'dark evenings', 'winter darkness']
  },
  {
    id: 'context-work-time',
    scope: 'shared',
    kind: 'work-pattern',
    label: 'Work time',
    description: 'The usual work block during weekdays.',
    definition: { type: 'and', children: [{ type: 'day-of-week', values: ['mon', 'tue', 'wed', 'thu', 'fri'] }, { type: 'between-time', start: '08:00', end: '17:00' }] },
    examples: ['during work hours', 'weekday work block', 'office time']
  },
  {
    id: 'context-morning',
    scope: 'shared',
    kind: 'time-of-day',
    label: 'Morning',
    description: 'The morning part of the day.',
    definition: { type: 'primitive-clause', primitive: 'tod', operator: '=', fuzzy: true, value: '08:00' },
    examples: ['early day', 'after waking', 'before noon']
  },
  {
    id: 'context-noon',
    scope: 'shared',
    kind: 'time-of-day',
    label: 'Noon',
    description: 'The middle part of the day around lunch time.',
    definition: { type: 'primitive-clause', primitive: 'tod', operator: '=', fuzzy: true, value: '12:30' },
    examples: ['lunch time', 'midday', 'around noon']
  },
  {
    id: 'context-afternoon',
    scope: 'shared',
    kind: 'time-of-day',
    label: 'Afternoon',
    description: 'The afternoon part of the day.',
    definition: { type: 'primitive-clause', primitive: 'tod', operator: '=', fuzzy: true, value: '15:30' },
    examples: ['late day', 'after lunch', 'before evening']
  },
  {
    id: 'context-evening',
    scope: 'shared',
    kind: 'time-of-day',
    label: 'Evening',
    description: 'The evening part of the day.',
    definition: { type: 'primitive-clause', primitive: 'tod', operator: '=', fuzzy: true, value: '19:30' },
    examples: ['after dinner', 'after work', 'end of day']
  },
  {
    id: 'context-night',
    scope: 'shared',
    kind: 'time-of-day',
    label: 'Night',
    description: 'The late-night part of the day.',
    definition: { type: 'primitive-clause', primitive: 'tod', operator: '=', fuzzy: true, value: '00:30' },
    examples: ['late night', 'after 22:00', 'before dawn']
  },
  {
    id: 'context-beginning-of-week',
    scope: 'shared',
    kind: 'day-type',
    label: 'Beginning of week',
    description: 'The start of the week.',
    definition: { type: 'primitive-clause', primitive: 'wday', operator: '=', fuzzy: true, value: 'tue' },
    examples: ['monday', 'tuesday', 'start of week']
  },
  {
    id: 'context-middle-of-week',
    scope: 'shared',
    kind: 'day-type',
    label: 'Middle of week',
    description: 'The middle of the week.',
    definition: { type: 'primitive-clause', primitive: 'wday', operator: '=', fuzzy: true, value: 'thu' },
    examples: ['wednesday', 'thursday', 'midweek']
  },
  {
    id: 'context-end-of-week',
    scope: 'shared',
    kind: 'day-type',
    label: 'End of week',
    description: 'The end of the working week.',
    definition: { type: 'primitive-clause', primitive: 'wday', operator: '=', fuzzy: true, value: 'sat' },
    examples: ['friday', 'week wrap-up', 'before weekend']
  },
  {
    id: 'context-weekend',
    scope: 'shared',
    kind: 'day-type',
    label: 'Weekend',
    description: 'Saturday and Sunday.',
    definition: { type: 'day-of-week', values: ['sat', 'sun'] },
    examples: ['saturday', 'sunday', 'weekend']
  },
  {
    id: 'context-beginning-of-month',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Beginning of month',
    description: 'The opening stretch of the month.',
    definition: { type: 'primitive-clause', primitive: 'dom', operator: '=', fuzzy: true, value: '6' },
    examples: ['first week of month', 'month start', 'early month']
  },
  {
    id: 'context-middle-of-month',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Middle of month',
    description: 'The middle stretch of the month.',
    definition: { type: 'primitive-clause', primitive: 'dom', operator: '=', fuzzy: true, value: '16' },
    examples: ['mid-month', 'second half of week two', 'middle weeks']
  },
  {
    id: 'context-end-of-month',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'End of month',
    description: 'The closing stretch of the month.',
    definition: { type: 'primitive-clause', primitive: 'dom', operator: '=', fuzzy: true, value: '26' },
    examples: ['last week of month', 'month end', 'late month']
  },
  {
    id: 'context-beginning-of-year',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Beginning of year',
    description: 'The opening stretch of the year.',
    definition: { type: 'primitive-clause', primitive: 'doy', operator: '=', fuzzy: true, value: '61' },
    examples: ['early year', 'first third of year', 'year start']
  },
  {
    id: 'context-middle-of-year',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Middle of year',
    description: 'The middle stretch of the year.',
    definition: { type: 'primitive-clause', primitive: 'doy', operator: '=', fuzzy: true, value: '183' },
    examples: ['mid-year', 'middle of the year', 'summer stretch']
  },
  {
    id: 'context-end-of-year',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'End of year',
    description: 'The closing stretch of the year.',
    definition: { type: 'primitive-clause', primitive: 'doy', operator: '=', fuzzy: true, value: '305' },
    examples: ['late year', 'final third of year', 'year end']
  },
  {
    id: 'context-sleep-time',
    scope: 'shared',
    kind: 'comfort-state',
    label: 'Sleep time',
    description: 'The time that is usually reserved for sleep.',
    definition: { type: 'or', children: [{ type: 'after-time', value: '23:00' }, { type: 'before-time', value: '06:30' }] },
    examples: ['bed time', 'overnight', 'sleep hours']
  },
  {
    id: 'context-holidays',
    scope: 'shared',
    kind: 'calendar-window',
    label: 'Holidays',
    description: 'Holiday periods. This is listed now even before calendar wiring exists.',
    examples: ['public holidays', 'vacation days', 'holiday time']
  },
  {
    id: 'context-at-home',
    scope: 'shared',
    kind: 'life-context',
    label: 'At home',
    description: 'When you are physically at home.',
    definition: { type: 'primitive-clause', primitive: 'home', operator: '=', fuzzy: false, value: 'true' },
    examples: ['at home', 'indoors at home', 'home day']
  },
  {
    id: 'context-mood',
    scope: 'shared',
    kind: 'mood',
    label: 'Mood',
    description: 'A mood-related context that can be personalized per person.',
    definition: { type: 'primitive-clause', primitive: 'mood', operator: '>=', fuzzy: true, value: '3' },
    examples: ['good mood', 'okay mood', 'settled mood']
  },
  {
    id: 'context-energy',
    scope: 'shared',
    kind: 'energy',
    label: 'Energy',
    description: 'An energy-related context that can be personalized per person.',
    definition: { type: 'primitive-clause', primitive: 'tiredness', operator: '<=', fuzzy: true, value: '2' },
    examples: ['enough energy', 'low energy', 'steady energy']
  },
  {
    id: 'context-focus',
    scope: 'shared',
    kind: 'comfort-state',
    label: 'Focus',
    description: 'A focus-related context that can be personalized per person.',
    definition: { type: 'primitive-clause', primitive: 'focus', operator: '>=', fuzzy: true, value: '2' },
    examples: ['focused', 'some focus', 'deep focus']
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
