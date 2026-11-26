import type {TabId} from '../types/bloomi';

interface HeaderProps {
  activeTab: TabId;
  onSwitchTab: (tab: TabId) => void;
  isSerialConnected: boolean;
  /** 꽃 LED 판단: 0 초록 / 1 노랑 / 2 빨강 (연결 전이거나 아직 없으면 null) */
  deviceLevel?: number | null;
  onToggleSerial: () => void;
}

const DESKTOP_TABS: Array<{id: TabId; label: string}> = [
  {id: 'studio', label: '🌸 실시간 호흡 스튜디오'},
  {id: 'ai', label: '✨ AI 마음 케어'},
  {id: 'report', label: '📊 웰니스 기록 & 리포트'},
  {id: 'about', label: '🔌 기획 & 하드웨어 구조'},
];

const MOBILE_TABS: Array<{id: TabId; label: string}> = [
  {id: 'studio', label: '🌸 호흡 스튜디오'},
  {id: 'ai', label: '✨ AI 마음 케어'},
  {id: 'report', label: '📊 웰니스 리포트'},
  {id: 'about', label: '🔌 하드웨어 & 기획'},
];

export function Header({
  activeTab,
  onSwitchTab,
  isSerialConnected,
  deviceLevel = null,
  onToggleSerial,
}: HeaderProps) {
  const levelInfo =
    deviceLevel === 2
      ? {dot: 'bg-rose-500', label: '빨강'}
      : deviceLevel === 1
        ? {dot: 'bg-amber-400', label: '노랑'}
        : deviceLevel === 0
          ? {dot: 'bg-emerald-400', label: '초록'}
          : null;
  return (
    <header className="sticky top-0 z-40 glass-card border-b border-stone-200/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={() => onSwitchTab('studio')}
          className="flex items-center gap-3 text-left cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush rounded-2xl"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blush to-lavender flex items-center justify-center shadow-sm shrink-0">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M12 2C13.8 2 15.2 3.6 15 5.4C16.8 4.8 18.8 5.9 19.3 7.7C19.8 9.5 18.7 11.4 16.9 11.9C18.5 12.9 19 15 18 16.6C17 18.2 14.9 18.7 13.3 17.7C13.3 19.6 11.8 21.1 9.9 21.1C8 21.1 6.5 19.6 6.5 17.7C4.9 18.7 2.8 18.2 1.8 16.6C0.8 15 1.3 12.9 2.9 11.9C1.1 11.4 0 9.5 0.5 7.7C1 5.9 3 4.8 4.8 5.4C4.6 3.6 6 2 7.8 2C9.2 2 10.4 2.8 10.9 4C11.4 2.8 12.6 2 14 2H12Z"
                transform="translate(2, 0.5) scale(0.92)"
              />
              <circle cx="12" cy="11.5" r="2.6" fill="#FAF8F5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-charcoal whitespace-nowrap">BLOOMI</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blush-light text-blush-dark whitespace-nowrap">
                CALM KEY
              </span>
            </div>
            <p className="text-[11px] text-stone-500 hidden sm:block whitespace-nowrap">
              Physical · AI · Data 기반 스마트 호흡 키링
            </p>
          </div>
        </button>

        {/* Desktop Navigation Tabs */}
        <nav
          aria-label="주 메뉴"
          className="hidden md:flex items-center gap-1 bg-stone-100/80 p-1 rounded-2xl border border-stone-200/60"
        >
          {DESKTOP_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSwitchTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white text-charcoal shadow-sm font-semibold'
                    : 'font-medium text-stone-600 hover:text-charcoal'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Hardware Connection Status Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleSerial}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-charcoal text-white hover:bg-stone-800 transition-all shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSerialConnected
                  ? (levelInfo?.dot ?? 'bg-emerald-400')
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span>
              {isSerialConnected
                ? levelInfo
                  ? `XIAO 연결됨 · 꽃 ${levelInfo.label}`
                  : 'XIAO 연결됨'
                : 'XIAO USB 연결'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden flex overflow-x-auto gap-1.5 px-4 py-2 border-t border-stone-200/60 bg-white/60">
        {MOBILE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSwitchTab(tab.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'font-semibold bg-charcoal text-white'
                  : 'font-medium bg-stone-100 text-stone-600'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
