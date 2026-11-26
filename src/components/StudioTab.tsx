import {useEffect, useRef, useState} from 'react';
import {
  Activity,
  CheckCircle2,
  HeartPulse,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import {
  PETAL_THEMES,
  ROUTINES,
  type BaselineMeasurement,
  type BaselineStatus,
  type PetalThemeKey,
  type RoutineKey,
  type SimScenario,
} from '../types/bloomi';

interface StudioTabProps {
  isSerialConnected: boolean;
  isBreathing: boolean;
  isCompleted: boolean;
  routineKey: RoutineKey;
  cycleCount: number;
  maxCycles: number;
  phaseIndex: number;
  phaseElapsed: number;
  audioEnabled: boolean;
  simScenario: SimScenario;
  petalTheme: PetalThemeKey;
  bpm: number;
  gsr: number;
  gsrRaw: number;
  baselineStatus: BaselineStatus;
  baselineRemaining: number;
  baselineDuration: number;
  baselineLiveAvg: {bpm: number; gsr: number; count: number};
  baselineResult: BaselineMeasurement | null;
  autoStartAfterBaseline: boolean;
  hrHistoryRef: React.MutableRefObject<number[]>;
  gsrHistoryRef: React.MutableRefObject<number[]>;
  pulseHighlight: boolean;
  onToggleAudio: () => void;
  onChangeScenario: (scenario: SimScenario) => void;
  onSetPetalTheme: (theme: PetalThemeKey) => void;
  onTactilePress: () => void;
  onToggleBreathing: () => void;
  onResetBreathing: () => void;
  onStartBaseline: () => void;
  onCancelBaseline: () => void;
  onToggleAutoStartAfterBaseline: () => void;
  onSelectRoutine: (key: RoutineKey) => void;
  onLogSession: (mood: string, situation: 'interview' | 'study' | 'rest') => void;
}

const LED_COORDINATES = [
  {id: 0, cx: 150, cy: 150},
  {id: 1, cx: 150, cy: 118},
  {id: 2, cx: 178, cy: 134},
  {id: 3, cx: 178, cy: 166},
  {id: 4, cx: 150, cy: 182},
  {id: 5, cx: 122, cy: 166},
  {id: 6, cx: 122, cy: 134},
];

export function StudioTab({
  isSerialConnected,
  isBreathing,
  isCompleted,
  routineKey,
  cycleCount,
  maxCycles,
  phaseIndex,
  phaseElapsed,
  audioEnabled,
  simScenario,
  petalTheme,
  bpm,
  gsr,
  gsrRaw,
  baselineStatus,
  baselineRemaining,
  baselineDuration,
  baselineLiveAvg,
  baselineResult,
  autoStartAfterBaseline,
  hrHistoryRef,
  gsrHistoryRef,
  pulseHighlight,
  onToggleAudio,
  onChangeScenario,
  onSetPetalTheme,
  onTactilePress,
  onToggleBreathing,
  onResetBreathing,
  onStartBaseline,
  onCancelBaseline,
  onToggleAutoStartAfterBaseline,
  onSelectRoutine,
  onLogSession,
}: StudioTabProps) {
  const hrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gsrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [btnPressed, setBtnPressed] = useState(false);
  const [logSituation, setLogSituation] = useState<'interview' | 'study' | 'rest'>('interview');

  const routine = ROUTINES[routineKey];
  const currentPhase = routine.phases[phaseIndex] ?? routine.phases[0];
  const activeTheme = PETAL_THEMES[petalTheme];

  const remaining = Math.max(1, currentPhase.duration - phaseElapsed);

  const isMeasuringBaseline = baselineStatus === 'measuring';
  const ledColor = isBreathing
    ? currentPhase.color
    : isMeasuringBaseline
      ? '#8FB996'
      : '#F4A6B8';
  const haloColor = isBreathing
    ? currentPhase.halo
    : isMeasuringBaseline
      ? '#8FB996'
      : '#F4A6B8';
  const flowerScale = isBreathing ? currentPhase.scale : 1;
  const outerPetalScale = isBreathing ? currentPhase.petalScale : 1;
  const innerPetalScale = isBreathing ? currentPhase.petalScale * 0.98 : 1;
  const transitionRule = isBreathing
    ? `transform ${currentPhase.duration}s cubic-bezier(0.4, 0, 0.2, 1)`
    : 'transform 0.8s ease';

  let phaseBadgeText = '대기 모드';
  let instructionText = '30초 측정 후 호흡을 시작하세요';
  let subHintText = '검지를 중앙 심박 센서에, 중지·약지에 GSR 스트랩을 착용해 주세요';

  if (isMeasuringBaseline) {
    phaseBadgeText = '초기 생체신호 입력';
    instructionText = `GSR · BPM 측정 중 · ${baselineRemaining}초`;
    subHintText = '손가락을 센서에 편안히 대고 30초 동안 움직이지 말아 주세요';
  } else if (isBreathing) {
    phaseBadgeText = routine.name;
    instructionText = `${currentPhase.label} · ${remaining}초`;
    subHintText = currentPhase.hint;
  } else if (isCompleted) {
    phaseBadgeText = '완료 ✨';
    instructionText = '4사이클 호흡을 모두 마쳤어요!';
    subHintText = '심박수와 긴장도가 한결 안정되었습니다. 아래에서 마음 상태를 기록해 보세요.';
  } else if (cycleCount > 0) {
    phaseBadgeText = routine.name;
    instructionText = '호흡이 일시정지되었습니다';
    subHintText = currentPhase.hint;
  } else if (baselineStatus === 'complete' && baselineResult) {
    phaseBadgeText = '기준선 설정 완료';
    instructionText = '실시간 생체신호 변동 모니터링 중';
    subHintText = `초기 기준(${baselineResult.bpm} BPM · GSR ${baselineResult.gsr}) 대비 일정 이상 변동 시 호흡을 추천합니다`;
  }

  // Draw live PPG + GSR waveforms smoothly on canvas
  useEffect(() => {
    let rafId = 0;

    const renderCanvases = () => {
      const hrCanvas = hrCanvasRef.current;
      if (hrCanvas) {
        const rect = hrCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dpr = window.devicePixelRatio || 1;
          hrCanvas.width = rect.width * dpr;
          hrCanvas.height = rect.height * dpr;
          const ctx = hrCanvas.getContext('2d');
          if (ctx) {
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.beginPath();
            ctx.strokeStyle = '#E07A94';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            const hist = hrHistoryRef.current;
            hist.forEach((val, idx) => {
              const x = (idx / Math.max(1, hist.length - 1)) * rect.width;
              const y = rect.height * 0.62 - val * (rect.height * 0.25);
              if (idx === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.stroke();
          }
        }
      }

      const gsrCanvas = gsrCanvasRef.current;
      if (gsrCanvas) {
        const rect = gsrCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dpr = window.devicePixelRatio || 1;
          gsrCanvas.width = rect.width * dpr;
          gsrCanvas.height = rect.height * dpr;
          const ctx = gsrCanvas.getContext('2d');
          if (ctx) {
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.beginPath();
            const hist = gsrHistoryRef.current;
            hist.forEach((val, idx) => {
              const x = (idx / Math.max(1, hist.length - 1)) * rect.width;
              const y = rect.height - (val / 100) * (rect.height * 0.8) - 6;
              if (idx === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = '#8C88CE';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineTo(rect.width, rect.height);
            ctx.lineTo(0, rect.height);
            ctx.closePath();
            ctx.fillStyle = 'rgba(184, 181, 232, 0.22)';
            ctx.fill();
          }
        }
      }

      rafId = requestAnimationFrame(renderCanvases);
    };

    rafId = requestAnimationFrame(renderCanvases);
    return () => cancelAnimationFrame(rafId);
  }, [hrHistoryRef, gsrHistoryRef]);

  const handlePhysicalTactileClick = () => {
    setBtnPressed(true);
    setTimeout(() => setBtnPressed(false), 180);
    onTactilePress();
  };

  // Heart rate status badge
  const hrBadge =
    bpm >= 88
      ? {text: '긴장·빠름', cls: 'bg-rose-100 text-rose-700'}
      : bpm >= 76
        ? {text: '보통', cls: 'bg-amber-100 text-amber-700'}
        : {text: '안정됨', cls: 'bg-emerald-100 text-emerald-700'};

  // GSR status badge
  const gsrBadge =
    gsr >= 60
      ? {text: '긴장 감지', cls: 'bg-rose-100 text-rose-700'}
      : gsr >= 40
        ? {text: '주의 집중', cls: 'bg-lavender-light text-lavender-dark'}
        : {text: '편안함', cls: 'bg-emerald-100 text-emerald-700'};

  return (
    <section className="space-y-6">
      {/* Mode & Status Banner */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 shadow-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sage-light text-sage-dark flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-base sm:text-lg text-charcoal">
                BLOOMI 실시간 호흡 & 생체신호 스튜디오
              </h1>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                  isSerialConnected
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-lavender-light text-lavender-dark'
                }`}
              >
                {isSerialConnected ? '실시간 하드웨어 수신 중' : '시뮬레이션 모드 활성'}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              키링의 <strong>택트 스위치(D8)</strong>를 누르거나 화면의 버튼을 클릭해 스마트폰 없이 바로 호흡을 시작하세요.
            </p>
          </div>
        </div>

        {/* Simulation Scenario Selector & Sound Toggle */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onToggleAudio}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-stone-100 hover:bg-stone-200 text-charcoal flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
          >
            {audioEnabled ? (
              <Volume2 className="w-4 h-4 text-sage-dark" />
            ) : (
              <VolumeX className="w-4 h-4 text-stone-500" />
            )}
            <span>{audioEnabled ? '사운드 안내 켜짐' : '사운드 안내 꺼짐'}</span>
          </button>
          <select
            aria-label="시뮬레이션 생체 시나리오"
            value={simScenario}
            onChange={(e) => onChangeScenario(e.target.value as SimScenario)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-stone-200 text-charcoal focus:outline-none focus:ring-2 focus:ring-blush cursor-pointer"
          >
            <option value="normal">🙂 시뮬레이션: 일상 업무 상태 (평상시 기준)</option>
            <option value="tense">😰 시뮬레이션: 시험·면접 직전 긴장 (+15 BPM 이상 급상승)</option>
            <option value="pressure">😓 시뮬레이션: 머리 복잡·초조함 (GSR +15 이상 상승)</option>
            <option value="relaxed">🌿 시뮬레이션: 호흡 후 깊은 이완</option>
          </select>
        </div>
      </div>

      {/* Step 1: 30-Second Initial GSR & BPM Measurement Card */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 shadow-soft border border-stone-200/70 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                baselineStatus === 'complete'
                  ? 'bg-emerald-100 text-emerald-700'
                  : isMeasuringBaseline
                    ? 'bg-sage-light text-sage-dark'
                    : 'bg-blush-light text-blush-dark'
              }`}
            >
              {baselineStatus === 'complete' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Timer className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-sm sm:text-base text-charcoal">
                  1단계 · 초기 30초 GSR &amp; BPM 생체신호 측정
                </h2>
                {baselineStatus === 'idle' && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                    측정 대기
                  </span>
                )}
                {isMeasuringBaseline && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark tabular-nums">
                    남은 시간 {baselineRemaining}초
                  </span>
                )}
                {baselineStatus === 'complete' && baselineResult && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    기준선 저장됨 ({baselineResult.measuredAt})
                  </span>
                )}
              </div>

              {baselineStatus === 'idle' && (
                <p className="text-xs text-stone-500 mt-0.5">
                  처음 30초 동안 평상시 GSR과 심박수(BPM) 기준선을 측정합니다. 초기 측정만으로 호흡을 추천하지 않으며, 이후 현재 센서 수치가 기준 대비 일정 이상 변동될 때만 호흡을 추천합니다.
                </p>
              )}

              {isMeasuringBaseline && (
                <p className="text-xs text-stone-600 mt-0.5 tabular-nums">
                  실시간 기준선 수집 중 ({baselineLiveAvg.count}개 샘플) · 현재 평균{' '}
                  <strong>{baselineLiveAvg.bpm} BPM</strong> · 평균 GSR{' '}
                  <strong>{baselineLiveAvg.gsr} / 100</strong>
                </p>
              )}

              {baselineStatus === 'complete' && baselineResult && (
                <p className="text-xs text-stone-600 mt-0.5 tabular-nums">
                  초기 30초 기준선: 평균 <strong>{baselineResult.bpm} BPM</strong> · GSR{' '}
                  <strong>{baselineResult.gsr} / 100</strong> (ADC {baselineResult.gsrRaw}) — 현재
                  실시간 측정치와 비교해 일정 이상 변동 시에만 호흡을 추천합니다.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto justify-end">
            <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoStartAfterBaseline}
                onChange={onToggleAutoStartAfterBaseline}
                className="rounded border-stone-300 text-charcoal focus:ring-blush cursor-pointer"
              />
              <span>측정 후 호흡 자동 시작</span>
            </label>

            {isMeasuringBaseline ? (
              <button
                type="button"
                onClick={onCancelBaseline}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-charcoal transition-all whitespace-nowrap cursor-pointer"
              >
                측정 중단
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartBaseline}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-charcoal hover:bg-stone-800 text-white transition-all whitespace-nowrap cursor-pointer shadow-xs"
              >
                {baselineStatus === 'complete' ? '다시 30초 측정' : '30초 측정 시작'}
              </button>
            )}
          </div>
        </div>

        {isMeasuringBaseline && (
          <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blush to-sage transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(4, ((baselineDuration - baselineRemaining) / baselineDuration) * 100),
                )}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Interactive BLOOMI Flower Keychain Hardware Simulator (5 cols) */}
        <div className="lg:col-span-5 glass-card rounded-3xl p-6 shadow-soft flex flex-col items-center justify-between relative overflow-hidden">
          {/* Ambient Background Halo */}
          <div
            className="absolute inset-0 opacity-35 transition-all duration-1000 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${haloColor} 0%, transparent 68%)`,
            }}
          />

          {/* Top Info & Petal Cover Customizer */}
          <div className="w-full flex items-center justify-between z-10 gap-2">
            <span className="text-xs font-semibold text-stone-500 flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-blush" />
              55mm × 26mm 웨어러블 키링
            </span>
            <div
              className="flex items-center gap-1.5 bg-white/85 px-2.5 py-1.5 rounded-full border border-stone-200/80 shadow-xs shrink-0"
              title="교체 가능한 꽃잎 커버 색상"
            >
              <span className="text-[11px] text-stone-500 mr-1">커버:</span>
              {(Object.keys(PETAL_THEMES) as PetalThemeKey[]).map((themeKey) => {
                const theme = PETAL_THEMES[themeKey];
                const isSelected = petalTheme === themeKey;
                return (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => onSetPetalTheme(themeKey)}
                    title={theme.label}
                    aria-label={`${theme.label} 커버 선택`}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                      theme.hasBorder ? 'border border-stone-300' : ''
                    } ${isSelected ? 'ring-2 ring-offset-1 ring-charcoal' : ''}`}
                    style={{backgroundColor: theme.dotColor}}
                  />
                );
              })}
            </div>
          </div>

          {/* Interactive 5-Petal Flower Keychain SVG + 7-Pixel WS2812 LED Ring */}
          <div className="relative my-3 flex flex-col items-center justify-center z-10 select-none">
            {/* Keyring Metal Chain Top */}
            <div className="w-7 h-7 rounded-full border-[3px] border-amber-300/90 shadow-xs -mb-2 z-0" />
            <div className="w-2.5 h-4 bg-amber-300/90 rounded-full -mb-2 z-0" />

            {/* Flower Body */}
            <div
              className="flower-container relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center animate-float"
              style={{
                transition: transitionRule,
                transform: `scale(${flowerScale})`,
              }}
            >
              <svg viewBox="0 0 300 300" className="w-full h-full drop-shadow-xl">
                <defs>
                  <filter id="ledGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Outer 5 Petals (Replaceable Housing) */}
                <g
                  fill={activeTheme.outer}
                  stroke={activeTheme.stroke}
                  strokeWidth="2"
                  className="petal-layer transition-colors duration-500"
                  style={{
                    transition: `${transitionRule}, fill 0.5s ease, stroke 0.5s ease`,
                    transform: `scale(${outerPetalScale})`,
                  }}
                >
                  <circle cx="150" cy="78" r="56" />
                  <circle cx="218" cy="128" r="56" />
                  <circle cx="192" cy="208" r="56" />
                  <circle cx="108" cy="208" r="56" />
                  <circle cx="82" cy="128" r="56" />
                  <circle cx="150" cy="150" r="68" stroke="none" />
                </g>

                {/* Micro Diffuser Gap Ring */}
                <circle
                  cx="150"
                  cy="150"
                  r="66"
                  fill="none"
                  stroke={ledColor}
                  strokeWidth="3"
                  opacity="0.85"
                  filter="url(#ledGlow)"
                />

                {/* Inner Translucent White Petals */}
                <g
                  fill="#FFFFFF"
                  opacity="0.92"
                  className="petal-layer"
                  style={{
                    transition: transitionRule,
                    transform: `scale(${innerPetalScale})`,
                  }}
                >
                  <circle cx="150" cy="106" r="32" />
                  <circle cx="192" cy="136" r="32" />
                  <circle cx="176" cy="185" r="32" />
                  <circle cx="124" cy="185" r="32" />
                  <circle cx="108" cy="136" r="32" />
                  <circle cx="150" cy="150" r="42" />
                </g>

                {/* 7 x WS2812 NeoPixel Ring (D0 / 5행) */}
                <g filter="url(#ledGlow)">
                  {LED_COORDINATES.map((led) => (
                    <circle
                      key={led.id}
                      className="led-pixel"
                      cx={led.cx}
                      cy={led.cy}
                      r="6.5"
                      fill={ledColor}
                    />
                  ))}
                </g>

                {/* Center Exposed Optical Heart Rate Sensor (A1 / 6행) */}
                <circle cx="150" cy="150" r="21" fill="#2C2A2E" stroke="#524E56" strokeWidth="2.5" />
                <circle cx="150" cy="150" r="13" fill="#18171A" />
                <circle
                  cx="150"
                  cy="150"
                  r="4.5"
                  fill="#34D399"
                  opacity={pulseHighlight ? 1 : 0.45}
                />
              </svg>

              {/* Side Physical Tactile Switch (D8 / 10행) */}
              <button
                type="button"
                onClick={handlePhysicalTactileClick}
                className={`tactile-btn ${btnPressed ? 'pressed' : ''} absolute -right-2 bottom-10 bg-stone-800 hover:bg-charcoal text-white px-2.5 py-2 rounded-xl shadow-md border border-stone-600 flex flex-col items-center gap-0.5 cursor-pointer`}
                title="키링 측면 택트 스위치(D8) 누르기"
              >
                <span className="w-3 h-3 rounded-full bg-blush border border-white/60" />
                <span className="text-[9px] font-bold tracking-tight whitespace-nowrap">D8 스위치</span>
              </button>
            </div>
          </div>

          {/* Breathing Phase Status Pill & Primary Action */}
          <div className="w-full z-10 text-center space-y-3">
            <div className="bg-white/90 rounded-2xl p-3.5 border border-stone-200/70 shadow-xs">
              <div className="flex items-center justify-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blush-light text-blush-dark">
                  {phaseBadgeText}
                </span>
                <span className="text-xs font-medium text-stone-500 tabular-nums">
                  {isMeasuringBaseline
                    ? `${baselineDuration - baselineRemaining} / ${baselineDuration}초`
                    : `${cycleCount} / ${maxCycles} 사이클`}
                </span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-charcoal mt-1.5 tabular-nums">
                {instructionText}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">{subHintText}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleBreathing}
                className={`flex-1 py-3 px-4 rounded-2xl text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isBreathing ? 'bg-blush-dark hover:opacity-95' : 'bg-charcoal hover:bg-stone-800'
                }`}
              >
                {isBreathing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>
                  {isBreathing
                    ? '호흡 일시정지'
                    : cycleCount > 0 && !isCompleted
                      ? '호흡 가이드 재개'
                      : '호흡 가이드 시작'}
                </span>
              </button>
              <button
                type="button"
                onClick={onResetBreathing}
                className="py-3 px-3.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-sm transition-all cursor-pointer"
                title="초기화"
                aria-label="호흡 세션 초기화"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Biometric Telemetry & Routine Selector (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Breathing Routine Selector Cards */}
          <div className="glass-card rounded-3xl p-5 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-bold text-sm sm:text-base text-charcoal flex items-center gap-2">
                <Wind className="w-4 h-4 text-blush-dark" />
                맞춤 호흡 리듬 선택
              </h2>
              <span className="text-xs text-stone-400">LED 색상과 속도가 자동으로 동기화됩니다</span>
            </div>

            {/* Compact Live Recommended Rhythm Indicator */}
            {(() => {
              if (!baselineResult) {
                return (
                  <div className="px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200/70 flex items-center justify-between gap-2 text-xs text-stone-500">
                    <span>
                      💡 초기 30초 기준선을 측정한 뒤, 현재 BPM·GSR이 기준 대비 일정 이상 변동될 때만{' '}
                      <strong>추천 호흡 리듬</strong>이 표시됩니다.
                    </span>
                  </div>
                );
              }

              const bpmDelta = bpm - baselineResult.bpm;
              const gsrPctDelta = baselineResult.gsrRaw > 0
                ? Math.round((baselineResult.gsrRaw - gsrRaw) * 100 / baselineResult.gsrRaw) : 0;

              let recKey: '478' | 'box' | null = null;
              let recTitle = '호흡 추천 없음 · 기준 범위 내 안정';
              let recSub = '일정 이상의 변동 미감지';
              let recReason = `현재 기준(${baselineResult.bpm} BPM · GSR ${baselineResult.gsr}) 대비 ${
                bpmDelta >= 0 ? '+' : ''
              }${bpmDelta} BPM · GSR ADC 감소 ${gsrPctDelta}%`;
              let bannerCls = 'bg-stone-50 border-stone-200/80 text-charcoal';
              let dotCls = 'bg-sage-dark';

              if (bpmDelta >= 15) {
                recKey = '478';
                recTitle = '4-7-8 호흡 추천';
                recSub = '급성 긴장·불안 진정';
                recReason = `초기 평균 대비 +${bpmDelta} BPM 급상승 (≥ +15 BPM)`;
                bannerCls = 'bg-blush-light/70 border-blush/40 text-charcoal';
                dotCls = 'bg-blush-dark';
              } else if (gsrPctDelta >= 8) {
                recKey = 'box';
                recTitle = '4-4-4-4 박스 추천';
                recSub = '집중력 회복·정신적 압박';
                recReason = `심박 ${bpmDelta >= 0 ? '+' : ''}${bpmDelta} BPM · 기준 ADC 대비 ${gsrPctDelta}% 감소`;
                bannerCls = 'bg-lavender-light/80 border-lavender/45 text-charcoal';
                dotCls = 'bg-lavender-dark';
              }

              return (
                <div
                  className={`px-3.5 py-2.5 rounded-2xl border ${bannerCls} flex items-center justify-between gap-3 flex-wrap`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold">{recTitle}</span>
                        <span className="text-[11px] text-stone-500">· {recSub}</span>
                      </div>
                      <p className="text-[11px] text-stone-600 tabular-nums truncate">{recReason}</p>
                    </div>
                  </div>
                  {recKey && routineKey !== recKey && (
                    <button
                      type="button"
                      onClick={() => onSelectRoutine(recKey)}
                      className="px-2.5 py-1 rounded-xl bg-charcoal hover:bg-stone-800 text-white text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                    >
                      리듬 적용
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(() => {
                const bpmDelta = baselineResult ? bpm - baselineResult.bpm : 0;
                const gsrPctDelta = baselineResult && baselineResult.gsrRaw > 0
                  ? Math.round((baselineResult.gsrRaw - gsrRaw) * 100 / baselineResult.gsrRaw) : 0;
                const is478Recommended = Boolean(baselineResult && bpmDelta >= 15);
                const isBoxRecommended = Boolean(
                  baselineResult &&
                    bpmDelta <= 14 &&
                    gsrPctDelta >= 8,
                );

                return (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectRoutine('478')}
                      className={`text-left p-3.5 rounded-2xl transition-all cursor-pointer ${
                        routineKey === '478'
                          ? 'border-2 border-blush bg-blush-light/40'
                          : 'border border-stone-200 bg-white hover:border-blush'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-blush-dark">긴장 완화</span>
                          {is478Recommended && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blush text-white">
                              추천
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white text-charcoal">
                          4-7-8 호흡
                        </span>
                      </div>
                      <p className="font-bold text-sm text-charcoal mt-1.5">시험·면접 직전 진정</p>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        4초 들이마시기 · 7초 멈춤 · 8초 내쉬기
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectRoutine('box')}
                      className={`text-left p-3.5 rounded-2xl transition-all cursor-pointer ${
                        routineKey === 'box'
                          ? 'border-2 border-blush bg-blush-light/40'
                          : 'border border-stone-200 bg-white hover:border-lavender'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-lavender-dark">집중 회복</span>
                          {isBoxRecommended && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-lavender-dark text-white">
                              추천
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-charcoal">
                          4-4-4-4 박스
                        </span>
                      </div>
                      <p className="font-bold text-sm text-charcoal mt-1.5">업무·학습 몰입 리셋</p>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        4초 흡기 · 4초 유지 · 4초 호기 · 4초 유지
                      </p>
                    </button>
                  </>
                );
              })()}
            </div>

            <p className="text-[11px] text-stone-400">
              추천 조건 (초기 30초 기준선 대비): +15 BPM↑ → 4-7-8 호흡 · 그 외 GSR ADC 8% 이상 감소 → 4-4-4-4 박스
            </p>
          </div>

          {/* Real-Time Sensor Telemetry Cards (Heart Rate A1 & GSR A2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Heart Rate Sensor Card */}
            <div className="glass-card rounded-3xl p-5 shadow-soft flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blush-light text-blush-dark flex items-center justify-center">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-charcoal">심박 측정 센서 (PPG)</h3>
                    <p className="text-[10px] text-stone-400">핀 A1 (6행) · 검지 접촉</p>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${hrBadge.cls}`}>
                  {hrBadge.text}
                </span>
              </div>

              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-charcoal tracking-tight tabular-nums">
                  {bpm}
                </span>
                <span className="text-xs font-semibold text-stone-500">BPM</span>
                <span className="text-xs font-medium text-sage-dark ml-auto tabular-nums">
                  목표: 68~75 BPM
                </span>
              </div>

              <div className="w-full h-20 bg-stone-50 rounded-2xl border border-stone-200/60 overflow-hidden p-1">
                <canvas ref={hrCanvasRef} className="w-full h-full" />
              </div>
            </div>

            {/* Grove GSR Sensor Card */}
            <div className="glass-card rounded-3xl p-5 shadow-soft flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-lavender-light text-lavender-dark flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-charcoal">GSR 피부 전기 반응</h3>
                    <p className="text-[10px] text-stone-400">핀 A2 (7행) · 중지·약지</p>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${gsrBadge.cls}`}>
                  {gsrBadge.text}
                </span>
              </div>

              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-charcoal tracking-tight tabular-nums">
                  {gsr}
                </span>
                <span className="text-xs font-semibold text-stone-500">/ 100 긴장도</span>
                <span className="text-[11px] text-stone-400 ml-auto font-mono tabular-nums">
                  ADC: {gsrRaw}
                </span>
              </div>

              <div className="w-full h-20 bg-stone-50 rounded-2xl border border-stone-200/60 overflow-hidden p-1">
                <canvas ref={gsrCanvasRef} className="w-full h-full" />
              </div>
            </div>
          </div>

          {/* Post-Session Subjective Mood Check-in Bar */}
          <div className="glass-card rounded-3xl p-5 shadow-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-charcoal">호흡 후 지금 마음 상태 기록하기</h3>
              <p className="text-xs text-stone-500">
                주관적 감정과 생체 데이터를 브라우저에 영구 저장해 웰니스 리포트를 업데이트합니다.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <select aria-label="호흡한 상황" value={logSituation} onChange={(event) => setLogSituation(event.target.value as 'interview' | 'study' | 'rest')} className="px-3 py-2 rounded-xl text-xs border border-stone-200 bg-white">
                <option value="interview">면접·발표 전</option>
                <option value="study">학습·업무 중</option>
                <option value="rest">휴식·취침 전</option>
              </select>
              <button
                type="button"
                onClick={() => onLogSession('긴장완화 😌', logSituation)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-sage-light hover:bg-sage text-sage-dark hover:text-white transition-all whitespace-nowrap cursor-pointer"
              >
                😌 한결 차분해짐
              </button>
              <button
                type="button"
                onClick={() => onLogSession('집중회복 💡', logSituation)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-lavender-light hover:bg-lavender text-lavender-dark hover:text-white transition-all whitespace-nowrap cursor-pointer"
              >
                💡 머리가 맑아짐
              </button>
              <button
                type="button"
                onClick={() => onLogSession('여전히떨림 💓', logSituation)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-blush-light hover:bg-blush text-blush-dark hover:text-white transition-all whitespace-nowrap cursor-pointer"
              >
                💓 조금 더 필요함
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
