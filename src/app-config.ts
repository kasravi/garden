import type { CadenceUnit, DayGroup, WorkMode } from './types'

export type SkipScope = 'today-only' | 'special-task' | 'sort-of-task'
export type SubjectiveCategory = 'importance' | 'difficulty' | 'time' | 'focus'

export interface TaskCadenceOption {
	every: number
	unit: CadenceUnit
	label: string
	sentence: string
	hint: string
}

export interface WindowPresetOption {
	dayGroup: DayGroup
	start: string
	end: string
	label: string
	sentence: string
	hint: string
}

export interface ComposerChoiceOption<T> {
	value: T
	label: string
	sentence: string
	hint: string
}

export interface TaskSentenceModeOption {
	id: 'at-one-point' | 'every' | 'one-time' | 'at-least' | 'exactly' | 'more-than'
	label: string
}

export interface CountOption {
	id: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
	label: string
}

export interface OneTimeFrameOption {
	id: 'between'
	label: string
}

export interface FrequencyCountOption {
	id: '1' | '2' | '3' | '4' | '5' | '6' | '7'
	label: string
}

export interface TimeframeOption {
	id: string
	label: string
}

export interface TimeframeQualifierOption {
	id: 'none' | 'during' | 'before' | 'after'
	label: string
}

export interface FrequencyStarterOption {
	id: 'day' | 'week' | 'month'
	label: string
}

export interface TaskSentenceDraft {
	actionText: string
	sentenceMode: TaskSentenceModeOption['id']
	countChoice: CountOption['id']
	customCount: string
	oneTimeFrame: OneTimeFrameOption['id']
	frequencyCount: FrequencyCountOption['id']
	frequencyStarter: FrequencyStarterOption['id']
	timeframeQualifier: TimeframeQualifierOption['id']
	timeframe: TimeframeOption['id']
	every: number
	unit: CadenceUnit
	importance: number
	grandness: number
	subjectiveTime: number
	focus: number
	timeSensitive: boolean
	dayGroup: DayGroup
	start: string
	end: string
}

export interface PersonDraft {
	name: string
	weekStartsOn: string
	workStart: string
	workEnd: string
	weekdayAvailableStart: string
	weekdayAvailableEnd: string
	weekendAvailableStart: string
	weekendAvailableEnd: string
	workMode: WorkMode
	isHomeNow: boolean
	allowWorkdayMicroTasks: boolean
	homeWifiNames: string
	forgiveness: number
	tirednessSensitivity: number
	recoveryPerHour: number
	difficultyBias: number
}

export interface SubjectiveChoiceOption {
	id: string
	category: SubjectiveCategory
	label: string
	value: number
}

export const IMPORTANCE_OPTIONS = [
	{ value: 0.28, label: 'a little' },
	{ value: 0.5, label: 'normally' },
	{ value: 0.72, label: 'a lot' },
	{ value: 0.9, label: 'very much' },
]

export const GRANDNESS_OPTIONS = [
	{ value: 0.22, label: 'small' },
	{ value: 0.45, label: 'normal' },
	{ value: 0.68, label: 'big' },
	{ value: 0.9, label: 'huge' },
]

export const SUBJECTIVE_TIME_OPTIONS = [
	{ value: 0.2, label: 'quick' },
	{ value: 0.45, label: 'ordinary' },
	{ value: 0.7, label: 'long' },
	{ value: 0.92, label: 'very long' },
]

export const FOCUS_OPTIONS = [
	{ value: 0.2, label: 'light' },
	{ value: 0.45, label: 'some' },
	{ value: 0.7, label: 'deep' },
	{ value: 0.92, label: 'all-in' },
]

export const DEFAULT_SUBJECTIVE_VALUES = {
	importance: 0.5,
	difficulty: 0.45,
	time: 0.45,
	focus: 0.45,
}

export const SUBJECTIVE_CHOICE_OPTIONS: SubjectiveChoiceOption[] = [
	{ id: 'importance-essential', category: 'importance', label: 'essential', value: 0.84 },
	{ id: 'importance-worthwhile', category: 'importance', label: 'worthwhile', value: 0.66 },
	{ id: 'importance-optional', category: 'importance', label: 'optional', value: 0.38 },
	{ id: 'difficulty-easy', category: 'difficulty', label: 'easy', value: 0.24 },
	{ id: 'difficulty-moderate', category: 'difficulty', label: 'ok', value: 0.45 },
	{ id: 'difficulty-demanding', category: 'difficulty', label: 'hard', value: 0.72 },
	{ id: 'time-quick', category: 'time', label: 'quick', value: 0.24 },
	{ id: 'time-medium', category: 'time', label: 'medium', value: 0.48 },
	{ id: 'time-time-consuming', category: 'time', label: 'long', value: 0.78 },
	{ id: 'focus-no-focus', category: 'focus', label: 'no focus', value: 0.18 },
	{ id: 'focus-some-focus', category: 'focus', label: 'some focus', value: 0.5 },
	{ id: 'focus-deep-focus', category: 'focus', label: 'deep focus', value: 0.78 },
]

export const SUBJECTIVE_CATEGORY_ORDER: SubjectiveCategory[] = ['importance', 'difficulty', 'time', 'focus']

export function subjectiveChoiceById(id: string): SubjectiveChoiceOption {
	const option = SUBJECTIVE_CHOICE_OPTIONS.find((entry) => entry.id === id)
	if (!option) {
		throw new Error(`Unknown subjective choice id: ${id}`)
	}
	return option
}

export const SUBJECTIVE_OPTIONS_BY_CATEGORY: Record<SubjectiveCategory, SubjectiveChoiceOption[]> = {
	importance: SUBJECTIVE_CHOICE_OPTIONS.filter((option) => option.category === 'importance'),
	difficulty: SUBJECTIVE_CHOICE_OPTIONS.filter((option) => option.category === 'difficulty'),
	time: SUBJECTIVE_CHOICE_OPTIONS.filter((option) => option.category === 'time'),
	focus: SUBJECTIVE_CHOICE_OPTIONS.filter((option) => option.category === 'focus'),
}

export const SUBJECTIVE_DEFAULT_CHOICES: Record<SubjectiveCategory, SubjectiveChoiceOption> = {
	importance: subjectiveChoiceById('importance-worthwhile'),
	difficulty: subjectiveChoiceById('difficulty-easy'),
	time: subjectiveChoiceById('time-quick'),
	focus: subjectiveChoiceById('focus-no-focus'),
}

export const SENTENCE_INLINE_SPINNER_CLASS = 'minimal-cadence-teaser minimal-inline-spinner subjective-inline-spinner'

export const SYSTEM_PRIMITIVES = [
	{ id: 'wday', label: 'Day of week', valueType: 'enum' as const, values: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
	{ id: 'tod', label: 'Time of day', valueType: 'time' as const },
	{ id: 'month', label: 'Month', valueType: 'number' as const, min: 1, max: 12 },
	{ id: 'mood', label: 'Mood', valueType: 'number' as const, min: 1, max: 5 },
	{ id: 'tiredness', label: 'Tiredness', valueType: 'number' as const, min: 1, max: 3 },
	{ id: 'focus', label: 'Focus', valueType: 'number' as const, min: 1, max: 3 },
	{ id: 'holiday', label: 'Holiday', valueType: 'boolean' as const },
	{ id: 'home', label: 'At home', valueType: 'boolean' as const },
]

export function operatorsForPrimitive(primitiveId: string): string[] {
	const prim = SYSTEM_PRIMITIVES.find((p) => p.id === primitiveId)
	if (!prim) return ['=']
	if (prim.valueType === 'enum') return ['=', 'in']
	if (prim.valueType === 'time' || prim.valueType === 'number') return ['=', '>', '<', '>=', '<=']
	if (prim.valueType === 'boolean') return ['=']
	return ['=']
}

export const DISCOMFORT_OPTIONS = ['too long', 'not that important', 'too much effort', 'too draining', 'too messy']

export const SKIP_SCOPE_OPTIONS: Array<{ id: SkipScope; label: string }> = [
	{ id: 'today-only', label: 'this task this time' },
	{ id: 'special-task', label: 'this special task' },
	{ id: 'sort-of-task', label: 'this sort of tasks' },
]

export const TASK_SENTENCE_MODE_OPTIONS: TaskSentenceModeOption[] = [
	{ id: 'at-one-point', label: 'at one point' },
	{ id: 'every', label: 'every' },
	{ id: 'one-time', label: 'one time' },
	{ id: 'at-least', label: 'at least' },
	{ id: 'exactly', label: 'exactly' },
	{ id: 'more-than', label: 'more than' },
]

export const COUNT_OPTIONS: CountOption[] = [
	{ id: '1', label: '1' },
	{ id: '2', label: '2' },
	{ id: '3', label: '3' },
	{ id: '4', label: '4' },
	{ id: '5', label: '5' },
	{ id: '6', label: '6' },
	{ id: '7', label: '7' },
	{ id: '8', label: '8' },
	{ id: '9', label: '9' },
	{ id: '10', label: '10' },
]

export const ONE_TIME_FRAME_OPTIONS: OneTimeFrameOption[] = [
	{ id: 'between', label: 'between' },
]

export const FREQUENCY_COUNT_OPTIONS: FrequencyCountOption[] = [
	{ id: '1', label: '' },
	{ id: '2', label: 'other' },
	{ id: '3', label: 'third' },
	{ id: '4', label: 'fourth' },
	{ id: '5', label: 'fifth' },
	{ id: '6', label: 'sixth' },
	{ id: '7', label: 'seventh' },
]

export const FREQUENCY_STARTER_OPTIONS: FrequencyStarterOption[] = [
	{ id: 'day', label: 'day' },
	{ id: 'week', label: 'week' },
	{ id: 'month', label: 'month' },
]

export const TIMEFRAME_QUALIFIER_OPTIONS: TimeframeQualifierOption[] = [
	{ id: 'none', label: '' },
	{ id: 'during', label: 'during' },
	{ id: 'before', label: 'before' },
	{ id: 'after', label: 'after' },
]

export const BASE_TIMEFRAME_OPTIONS: TimeframeOption[] = [
	{ id: 'in-general', label: 'in general' },
	{ id: 'this-week', label: 'this coming week' },
	{ id: 'this-month', label: 'this coming month' },
]

export const NONE_ONLY_TIMEFRAME_IDS = new Set(['in-general', 'at-all-times', 'this-week'])

export const CADENCE_OPTIONS: TaskCadenceOption[] = [
	{ every: 1, unit: 'day', label: 'Daily', sentence: 'every day', hint: 'For things that stay lighter when done often.' },
	{ every: 2, unit: 'day', label: 'Every 2 days', sentence: 'every two days', hint: 'A gentle every-other-day rhythm.' },
	{ every: 3, unit: 'day', label: 'Twice a week-ish', sentence: 'every three days', hint: 'Useful for medium-drift chores.' },
	{ every: 1, unit: 'week', label: 'Weekly', sentence: 'every week', hint: 'A classic household rhythm.' },
	{ every: 2, unit: 'week', label: 'Every 2 weeks', sentence: 'every two weeks', hint: 'For deeper resets.' },
	{ every: 1, unit: 'month', label: 'Monthly', sentence: 'every month', hint: 'For maintenance work that can wait.' },
]

export const TIMING_OPTIONS: ComposerChoiceOption<boolean>[] = [
	{ value: false, label: 'Use my default capacity', sentence: 'whenever it fits inside my normal capacity', hint: 'No special window. The app will choose.' },
	{ value: true, label: 'Give it a preferred window', sentence: 'inside a narrower preferred window', hint: 'Only for truly time-sensitive chores.' },
]

export const WINDOW_PRESETS: WindowPresetOption[] = [
	{ dayGroup: 'weekdays', start: '07:30', end: '09:00', label: 'Weekday morning', sentence: 'on weekday mornings', hint: 'Before the day properly starts.' },
	{ dayGroup: 'weekdays', start: '12:00', end: '14:00', label: 'Weekday mid-break', sentence: 'on weekday mid-breaks', hint: 'Good for tiny chores when at home.' },
	{ dayGroup: 'weekdays', start: '18:00', end: '21:00', label: 'Weekday evening', sentence: 'on weekday evenings', hint: 'After the main work block.' },
	{ dayGroup: 'weekends', start: '09:00', end: '12:00', label: 'Weekend morning', sentence: 'on weekend mornings', hint: 'High energy and clean start.' },
	{ dayGroup: 'weekends', start: '13:00', end: '17:00', label: 'Weekend afternoon', sentence: 'on weekend afternoons', hint: 'Good for bigger resets.' },
	{ dayGroup: 'any day', start: '19:00', end: '21:30', label: 'After dinner', sentence: 'after dinner', hint: 'A calm universal default.' },
]

export function defaultTaskDraft(): TaskSentenceDraft {
	return {
		actionText: '',
		sentenceMode: 'at-one-point',
		countChoice: '1',
		customCount: '',
		oneTimeFrame: 'between',
		frequencyCount: '1',
		frequencyStarter: 'week',
		timeframeQualifier: 'none',
		timeframe: 'in-general',
		every: 1,
		unit: 'week',
		importance: 0.5,
		grandness: 0.45,
		subjectiveTime: 0.45,
		focus: 0.45,
		timeSensitive: false,
		dayGroup: 'weekdays',
		start: '10:00',
		end: '17:00',
	}
}

export function exampleTaskDraft(): TaskSentenceDraft {
	return {
		actionText: 'clean the toilet thoroughly',
		sentenceMode: 'every',
		countChoice: '1',
		customCount: '',
		oneTimeFrame: 'between',
		frequencyCount: '1',
		frequencyStarter: 'week',
		timeframeQualifier: 'none',
		timeframe: 'in-general',
		every: 1,
		unit: 'week',
		importance: 0.72,
		grandness: 0.68,
		subjectiveTime: 0.7,
		focus: 0.7,
		timeSensitive: false,
		dayGroup: 'weekdays',
		start: '10:00',
		end: '17:00',
	}
}

export function defaultPersonDraft(): PersonDraft {
	return {
		name: '',
		workStart: '08:00',
		workEnd: '16:00',
		weekdayAvailableStart: '16:00',
		weekdayAvailableEnd: '23:59',
		weekendAvailableStart: '08:00',
		weekendAvailableEnd: '23:59',
		workMode: 'away',
		isHomeNow: false,
		allowWorkdayMicroTasks: false,
		homeWifiNames: '',
		forgiveness: 0.7,
		tirednessSensitivity: 0.6,
		recoveryPerHour: 0.08,
		difficultyBias: 0.5,
		weekStartsOn: '',
	}
}

const LOCAL_PROFILE_NAME_STORAGE_KEY = 'chores-local-profile-name'
const FUN_NAME_ADJECTIVES = ['Mossy', 'Sunny', 'Bouncy', 'Cozy', 'Wiggly', 'Sparkly', 'Sleepy', 'Peppy', 'Zippy', 'Cheery']
const FUN_NAME_NOUNS = ['Radish', 'Fox', 'Turnip', 'Robin', 'Bean', 'Otter', 'Sprout', 'Badger', 'Pear', 'Pumpkin']

function randomItem<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)]
}

function createFunProfileName(): string {
	return `${randomItem(FUN_NAME_ADJECTIVES)} ${randomItem(FUN_NAME_NOUNS)}`
}

export function getLocalProfileName(): string {
	const existing = window.localStorage.getItem(LOCAL_PROFILE_NAME_STORAGE_KEY)?.trim()
	if (existing) return existing
	const generated = createFunProfileName()
	window.localStorage.setItem(LOCAL_PROFILE_NAME_STORAGE_KEY, generated)
	return generated
}

export function setStoredLocalProfileName(name: string): void {
	window.localStorage.setItem(LOCAL_PROFILE_NAME_STORAGE_KEY, name.trim())
}
