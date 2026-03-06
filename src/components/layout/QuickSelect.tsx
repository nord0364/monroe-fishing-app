interface QuickSelectProps<T extends string> {
  options: readonly T[]
  value: T | null
  onChange: (val: T) => void
  label?: string
  columns?: number
  autoDetected?: boolean
}

export default function QuickSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  columns = 2,
  autoDetected = false,
}: QuickSelectProps<T>) {
  const colClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[columns] ?? 'grid-cols-2'

  return (
    <div>
      {label && (
        <div className="flex items-center gap-2 mb-1.5">
          <label className="block text-xs th-text-muted font-medium uppercase tracking-wide">{label}</label>
          {autoDetected && (
            <span className="text-xs th-accent-text bg-opacity-10 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--th-accent-subtle)' }}>
              auto · tap to override
            </span>
          )}
        </div>
      )}
      <div className={`grid ${colClass} gap-2`}>
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-3 rounded-lg text-sm font-medium text-left transition-all min-h-[48px] border ${
              value === opt
                ? 'th-btn-selected border-transparent text-white'
                : 'th-surface th-text border-opacity-60'
            }`}
            style={value !== opt ? { borderColor: 'var(--th-border)' } : {}}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
