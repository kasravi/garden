import type { KeyboardEvent, MutableRefObject, TouchEvent, WheelEvent } from 'react'

const SPINNER_ROW_REM = 1.95
const SPINNER_PEEK_REM = 1.2

export interface SentenceSpinnerOption {
  id: string
  label: string
  disabled?: boolean
}

interface SentenceSpinnerProps {
  element?: 'button' | 'div'
  className: string
  active: boolean
  ariaLabel: string
  selectedIndex: number
  options: SentenceSpinnerOption[]
  spinnerRef?: MutableRefObject<HTMLElement | null>
  onRotate: (delta: number) => void
  onFocus?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  onTouchStart?: (event: TouchEvent<HTMLElement>) => void
  onTouchEnd?: (event: TouchEvent<HTMLElement>) => void
  onClick?: () => void
}

function optionClassName(selectedIndex: number, index: number, disabled: boolean): string {
  const base =
    index === selectedIndex
      ? 'minimal-cadence-option option-active'
      : Math.abs(index - selectedIndex) === 1
        ? 'minimal-cadence-option option-adjacent'
        : 'minimal-cadence-option option-faint'

  return disabled ? `${base} option-disabled` : base
}

export function SentenceSpinner({
  element = 'button',
  className,
  active,
  ariaLabel,
  selectedIndex,
  options,
  spinnerRef,
  onRotate,
  onFocus,
  onKeyDown,
  onTouchStart,
  onTouchEnd,
  onClick,
}: SentenceSpinnerProps) {
  const spinnerClassName = active ? `${className} active-spinner` : className

  const commonProps = {
    className: spinnerClassName,
    'aria-label': ariaLabel,
    onWheel: (event: WheelEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onRotate(event.deltaY > 0 ? 1 : -1)
    },
    onTouchStart,
    onTouchEnd,
    onFocus,
    onKeyDown,
    onClick,
  }

  const track = (
    <div
      className="minimal-cadence-track"
      style={{ transform: `translateY(${-selectedIndex * SPINNER_ROW_REM}rem)` }}
    >
      {options.map((option, index) => (
        <div key={option.id} className={optionClassName(selectedIndex, index, option.disabled ?? false)}>
          {option.label}
        </div>
      ))}
    </div>
  )

  if (element === 'div') {
    return (
      <div
        ref={(node) => {
          if (spinnerRef) {
            spinnerRef.current = node
          }
        }}
        {...commonProps}
        role="button"
        tabIndex={0}
      >
        {track}
      </div>
    )
  }

  return (
    <button
      ref={(node) => {
        if (spinnerRef) {
          spinnerRef.current = node
        }
      }}
      {...commonProps}
      type="button"
    >
      {track}
    </button>
  )
}
