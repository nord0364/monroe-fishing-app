export type NavTab = 'guide' | 'scout' | 'log' | 'trophy' | 'tackle'

interface BottomNavProps {
  active: NavTab
  onChange: (tab: NavTab) => void
}

const tabs: { id: NavTab; label: string; icon: string }[] = [
  { id: 'guide',  label: 'Guide',       icon: '🧭' },
  { id: 'scout',  label: 'Scout',       icon: '🌅' },
  { id: 'log',    label: 'Log',         icon: '🎣' },
  { id: 'trophy', label: 'Trophy Room', icon: '🏆' },
  { id: 'tackle', label: 'Tackle',      icon: '🧰' },
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
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[58px] text-[10px] font-semibold tracking-wide transition-colors relative ${
                isActive ? 'th-nav-active' : 'th-nav-inactive'
              }`}
            >
              {isActive && (
                <span
                  className="absolute top-0 inset-x-2 h-[2px] rounded-b-full"
                  style={{ backgroundColor: 'var(--th-accent-text)' }}
                />
              )}
              <span className="text-xl mb-0.5 leading-none">{tab.icon}</span>
              <span className="leading-tight">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
