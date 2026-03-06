export type NavTab = 'briefing' | 'logger' | 'patterns' | 'settings'

interface BottomNavProps {
  active: NavTab
  onChange: (tab: NavTab) => void
}

const tabs: { id: NavTab; label: string; icon: string }[] = [
  { id: 'briefing', label: 'Briefing',  icon: '🌅' },
  { id: 'logger',   label: 'Logger',    icon: '🎣' },
  { id: 'patterns', label: 'Patterns',  icon: '📊' },
  { id: 'settings', label: 'Settings',  icon: '⚙️' },
]

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 th-nav-bg border-t th-nav-border pb-safe">
      <div className="flex">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 min-h-[62px] text-xs font-semibold tracking-wide transition-colors relative ${
                isActive ? 'th-nav-active' : 'th-nav-inactive'
              }`}
            >
              {/* Active indicator bar at top */}
              {isActive && (
                <span
                  className="absolute top-0 inset-x-4 h-[2px] rounded-b-full"
                  style={{ backgroundColor: 'var(--th-accent-text)' }}
                />
              )}
              <span className="text-2xl mb-1 leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
