import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowRight, Loader2, RotateCcw, Send, Sparkles} from 'lucide-react';
import {ROUTINES, type AiChatMessage, type BaselineMeasurement, type RoutineKey, type WellnessSessionLog} from '../types/bloomi';

interface AiCareTabProps {
  bpm: number;
  gsr: number;
  gsrRaw: number;
  baseline: BaselineMeasurement | null;
  recentSessions: WellnessSessionLog[];
  onApplyRoutine: (routineKey: RoutineKey) => void;
}

interface ChatMessageWithRetry extends AiChatMessage {
  retryPrompt?: string;
}

const PRESET_CONCERNS = [
  {
    emoji: '🎓',
    label: '"내일 중요한 면접이 있어서 심장이 너무 빨리 뛰어요"',
    prompt: '내일 중요한 면접이 있어서 심장이 너무 빨리 뛰고 손에 땀이 나요.',
    hoverClass: 'hover:bg-blush-light/60',
  },
  {
    emoji: '💼',
    label: '"업무가 몰려서 머리가 복잡하고 집중이 안 돼요"',
    prompt: '업무가 한꺼번에 몰려서 머리가 복잡하고 집중이 전혀 안 돼요.',
    hoverClass: 'hover:bg-lavender-light/60',
  },
  {
    emoji: '🌙',
    label: '"인간관계로 마음이 지치고 쉽게 진정이 안 돼요"',
    prompt: '인간관계 때문에 마음이 지치고 밤에 잠이 잘 오지 않아요.',
    hoverClass: 'hover:bg-sage-light/60',
  },
];

const INITIAL_WELCOME: ChatMessageWithRetry = {
  id: 'welcome-1',
  sender: 'ai',
  text: '안녕하세요! 당신의 작은 호흡 메이트 BLOOMI예요. 오늘 하루 어떤 순간에 긴장하거나 마음이 지치셨나요? 편하게 이야기해 주시면 지금 가장 필요한 호흡 리듬을 찾아드릴게요.',
};

async function fetchCareWithRetry(
  payload: {
    message: string;
    biometrics: {bpm: number; gsr: number; gsrRaw: number};
    baseline: BaselineMeasurement | null;
    recentSessions: Array<{routineKey?: RoutineKey; situation?: string; completed?: boolean; mood: string}>;
    history: Array<{sender: 'user' | 'ai'; text: string}>;
  },
): Promise<{ok: boolean; status: number; data: Record<string, unknown> | null}> {
  const attempt = async () => {
    const response = await fetch('/api/ai/care', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const rawText = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    return {ok: response.ok, status: response.status, data: parsed};
  };

  try {
    const first = await attempt();
    if (!first.ok && (first.status >= 502 || first.status === 0 || !first.data)) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return await attempt();
    }
    return first;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return await attempt();
  }
}

export function AiCareTab({bpm, gsr, gsrRaw, baseline, recentSessions, onApplyRoutine}: AiCareTabProps) {
  const [messages, setMessages] = useState<ChatMessageWithRetry[]>([INITIAL_WELCOME]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const submitMessage = async (rawText: string, appendUserBubble = true) => {
    const trimmed = rawText.trim();
    if (!trimmed || isLoading) return;

    const historySource = appendUserBubble
      ? [
          ...messages,
          {
            id: `user-${Date.now()}`,
            sender: 'user' as const,
            text: trimmed,
          },
        ]
      : messages;

    if (appendUserBubble) {
      setMessages(historySource);
      setInputValue('');
    }
    setIsLoading(true);

    try {
      const {ok, status, data} = await fetchCareWithRetry({
        message: trimmed,
        biometrics: {bpm, gsr, gsrRaw},
        baseline,
        recentSessions: recentSessions.slice(0, 8).map(({routineKey, situation, completed, mood}) => ({routineKey, situation, completed, mood})),
        history: historySource
          .filter((m) => !m.isError)
          .slice(-6)
          .map((m) => ({
            sender: m.sender,
            text: m.text,
          })),
      });

      if (!ok || !data) {
        const serverMessage = typeof data?.message === 'string' ? data.message : null;
        const fallbackMessage =
          status === 503 || status === 403
            ? 'Gemini API 키 설정이 필요합니다. AI Studio의 Settings > Secrets 패널에서 GEMINI_API_KEY를 확인해 주세요.'
            : '서버 연결에 일시적인 문제가 발생했습니다. 아래 [다시 시도] 버튼을 눌러 주세요.';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'ai',
            text: serverMessage ?? fallbackMessage,
            isError: true,
            retryPrompt: trimmed,
          },
        ]);
        return;
      }

      const routineKey: RoutineKey =
        data.routineKey === '478' || data.routineKey === 'box' || data.routineKey === 'calm'
          ? data.routineKey
          : 'calm';

      const aiMsg: ChatMessageWithRetry = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text:
          typeof data.empathy === 'string'
            ? data.empathy
            : '마음이 많이 쓰이셨겠어요. 잠시 호흡을 가다듬어 볼까요?',
        prescription: {
          routineKey,
          routineTitle:
            typeof data.routineTitle === 'string'
              ? data.routineTitle
              : ROUTINES[routineKey].name,
          reason:
            typeof data.reason === 'string'
              ? data.reason
              : '안정적인 호흡 리듬은 심박과 긴장을 가라앉히는 데 도움을 줍니다.',
        },
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: '서버가 응답을 준비 중이거나 네트워크 연결이 불안정합니다. 잠시 후 [다시 시도]를 눌러 주세요.',
          isError: true,
          retryPrompt: trimmed,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitMessage(inputValue);
  };

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: AI Companion Intro & Quick Prompts (4 cols) */}
        <div className="lg:col-span-4 glass-card rounded-3xl p-6 shadow-soft flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blush to-lavender text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-blush-dark">AI 마음 케어 파트너</span>
              <h2 className="text-xl font-bold text-charcoal mt-1">
                지금 어떤 고민이 마음을 무겁게 하나요?
              </h2>
              <p className="text-xs text-stone-500 leading-relaxed mt-2">
                시험·면접 앞의 떨림, 업무 압박, 인간관계 고민을 편하게 털어놓으세요. BLOOMI AI가 현재 마음 상태와 생체신호에 딱 맞는{' '}
                <strong>맞춤 호흡 루틴</strong>과 <strong>LED 컬러 테라피</strong>를 키링에 바로 적용해 드립니다.
              </p>
            </div>

            {/* Situation Preset Chips */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-stone-600">자주 찾는 상황별 빠른 상담</p>
              {PRESET_CONCERNS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void submitMessage(preset.prompt)}
                  className={`w-full text-left p-3 rounded-2xl bg-stone-50 ${preset.hoverClass} border border-stone-200/80 text-xs font-medium text-charcoal transition-all cursor-pointer disabled:opacity-50`}
                >
                  {preset.emoji} {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-cream border border-stone-200/80 text-xs text-stone-600 space-y-1">
            <p className="font-bold text-charcoal">💡 AI → 디바이스 즉시 연동</p>
            <p>
              AI가 추천한 루틴 카드의 <strong>[키링으로 바로 실행]</strong> 버튼을 누르면 호흡 스튜디오와 LED 색상이 자동 세팅됩니다.
            </p>
          </div>
        </div>

        {/* Right: Interactive AI Chat Window (8 cols) */}
        <div className="lg:col-span-8 glass-card rounded-3xl shadow-soft flex flex-col h-[580px] overflow-hidden">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-stone-200/70 flex items-center justify-between bg-white/60">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sage" />
              <span className="font-bold text-sm text-charcoal">BLOOMI 마음 상담소</span>
            </div>
            <span className="text-[11px] text-stone-400">
              Gemini AI 감정 분석 · 현재 {bpm} BPM 연동
            </span>
          </div>

          {/* Chat Messages Feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg) => {
              if (msg.sender === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-charcoal text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-md text-sm leading-relaxed shadow-2xs">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blush-light text-blush-dark flex items-center justify-center shrink-0 font-bold text-xs">
                    🌸
                  </div>
                  <div
                    className={`rounded-2xl rounded-tl-none p-4 max-w-xl shadow-2xs space-y-3 border ${
                      msg.isError
                        ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                        : 'bg-white border-stone-200/80 text-charcoal'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.text}</p>

                    {msg.isError && msg.retryPrompt && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => void submitMessage(msg.retryPrompt!, false)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-rose-200 hover:bg-rose-100/70 text-rose-900 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>다시 시도</span>
                      </button>
                    )}

                    {msg.prescription && (
                      <div className="p-3.5 rounded-2xl bg-cream border border-stone-200/80 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-blush-dark">✨ 추천 루틴 처방</span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white text-charcoal">
                            {ROUTINES[msg.prescription.routineKey].name}
                          </span>
                        </div>
                        <p className="font-bold text-sm text-charcoal">
                          {msg.prescription.routineTitle}
                        </p>
                        <p className="text-xs text-stone-500">{msg.prescription.reason}</p>
                        <button
                          type="button"
                          onClick={() => onApplyRoutine(msg.prescription!.routineKey)}
                          className="mt-1 w-full py-2.5 px-4 rounded-xl bg-charcoal hover:bg-stone-800 text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>키링으로 바로 실행하기</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blush-light text-blush-dark flex items-center justify-center shrink-0 font-bold text-xs">
                  🌸
                </div>
                <div className="bg-white border border-stone-200/80 rounded-2xl rounded-tl-none px-4 py-3 shadow-2xs flex items-center gap-2 text-xs text-stone-500">
                  <Loader2 className="w-4 h-4 animate-spin text-blush-dark" />
                  <span>마음 상태를 살피고 맞춤 호흡 리듬을 처방하고 있어요...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={handleFormSubmit}
            className="p-4 border-t border-stone-200/70 bg-white/80 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
              maxLength={1000}
              placeholder="예: 발표 직전이라 너무 떨려요 / 마음이 답답해요..."
              className="flex-1 px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-blush disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-5 py-3 rounded-2xl bg-charcoal hover:bg-stone-800 disabled:bg-stone-300 text-white text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
            >
              <span>상담하기</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
