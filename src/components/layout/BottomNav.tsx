export type NavTab = 'briefing' | 'logger' | 'patterns' | 'settings'

interface BottomNavProps {
  active: NavTab
  onChange: (tab: NavTab) => void
}

const tabs: { id: NavTab; label: string; icon: string }[] = [
  { id: 'briefing', label: 'Briefing', icon: '🌅' },
  { id: 'logger',   label: 'Logger',   icon: '🎣' },
  { id: 'patterns', label: 'Patterns', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 th-nav-bg border-t th-nav-border pb-safe">
      <div className="flex">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] text-xs font-medium transition-colors ${
              active === tab.id ? 'th-nav-active' : 'th-nav-inactive'
            }`}
          >
            <span className="text-xl mb-0.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
