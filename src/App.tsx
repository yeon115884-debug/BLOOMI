import {useCallback, useEffect, useRef, useState} from 'react';
import {AboutTab} from './components/AboutTab';
import {AiCareTab} from './components/AiCareTab';
import {Header} from './components/Header';
import {ReportTab} from './components/ReportTab';
import {StudioTab} from './components/StudioTab';
import {
  PETAL_THEMES,
  ROUTINES,
  type BaselineMeasurement,
  type BaselineStatus,
  type PetalThemeKey,
  type RoutineKey,
  type SimScenario,
  type TabId,
  type ToastItem,
  type WellnessSessionLog,
} from './types/bloomi';
import {playPhaseChime} from './utils/audio';
import {
  clearStoredLogs,
  loadStoredLogs,
  loadStoredPetalTheme,
  saveStoredLogs,
  saveStoredPetalTheme,
} from './utils/storage';

interface SerialPortLike {
  open: (options: {baudRate: number}) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort: () => Promise<SerialPortLike>;
  };
}

const MAX_CYCLES = 4;
const BASELINE_DURATION_SECONDS = 30;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('studio');
  const [isBreathing, setIsBreathing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [routineKey, setRoutineKey] = useState<RoutineKey>('478');
  const [cycleCount, setCycleCount] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [petalTheme, setPetalTheme] = useState<PetalThemeKey>(() => loadStoredPetalTheme());

  // 30-second Initial GSR & BPM Intake State
  const [baselineStatus, setBaselineStatus] = useState<BaselineStatus>('idle');
  const [baselineRemaining, setBaselineRemaining] = useState(BASELINE_DURATION_SECONDS);
  const [baselineLiveAvg, setBaselineLiveAvg] = useState({bpm: 92, gsr: 68, count: 0});
  const [baselineResult, setBaselineResult] = useState<BaselineMeasurement | null>(null);
  const [autoStartAfterBaseline, setAutoStartAfterBaseline] = useState(true);

  // Biometrics & Hardware Serial State
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [simScenario, setSimScenario] = useState<SimScenario>('tense');
  const [bpm, setBpm] = useState(92);
  const [gsr, setGsr] = useState(68);
  const [gsrRaw, setGsrRaw] = useState(2410);
  const [pulseHighlight, setPulseHighlight] = useState(false);

  // Persisted Wellness Logs
  const [logs, setLogs] = useState<WellnessSessionLog[]>(() => loadStoredLogs());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Refs for real-time loops & Serial reader
  const hrHistoryRef = useRef<number[]>(Array.from({length: 90}, () => 0));
  const gsrHistoryRef = useRef<number[]>(Array.from({length: 60}, () => 68));
  const wavePhaseRef = useRef(0);
  const bpmRef = useRef(bpm);
  const gsrRef = useRef(gsr);
  const gsrRawRef = useRef(gsrRaw);
  const sessionStartBpmRef = useRef<number | null>(null);
  const sessionStartGsrRef = useRef<number | null>(null);
  const baselineSamplesRef = useRef<{bpms: number[]; gsrs: number[]; gsrRaws: number[]}>({
    bpms: [],
    gsrs: [],
    gsrRaws: [],
  });
  const isSerialRef = useRef(isSerialConnected);
  const isBreathingRef = useRef(isBreathing);
  const simScenarioRef = useRef(simScenario);
  const serialPortRef = useRef<SerialPortLike | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    gsrRef.current = gsr;
  }, [gsr]);

  useEffect(() => {
    gsrRawRef.current = gsrRaw;
  }, [gsrRaw]);

  useEffect(() => {
    isSerialRef.current = isSerialConnected;
  }, [isSerialConnected]);

  useEffect(() => {
    isBreathingRef.current = isBreathing;
  }, [isBreathing]);

  useEffect(() => {
    simScenarioRef.current = simScenario;
  }, [simScenario]);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, {id, message, type}]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const startBreathingSession = useCallback(
    (overrideRoutine?: RoutineKey) => {
      const targetKey = overrideRoutine ?? routineKey;
      setBaselineStatus((prev) => (prev === 'measuring' ? 'idle' : prev));
      setIsCompleted(false);
      if (cycleCount === 0 || isCompleted || overrideRoutine) {
        sessionStartBpmRef.current = baselineResult?.bpm ?? bpmRef.current;
        sessionStartGsrRef.current = baselineResult?.gsr ?? gsrRef.current;
        setCycleCount(1);
        setPhaseIndex(0);
        setPhaseElapsed(0);
      }
      setIsBreathing(true);
      const firstPhase = ROUTINES[targetKey].phases[0];
      void playPhaseChime(firstPhase.label, audioEnabled);
    },
    [audioEnabled, baselineResult, cycleCount, isCompleted, routineKey],
  );

  const stopBreathingSession = useCallback(() => {
    setIsBreathing(false);
  }, []);

  const toggleBreathingSession = useCallback(() => {
    if (isBreathingRef.current) {
      stopBreathingSession();
    } else {
      startBreathingSession();
    }
  }, [startBreathingSession, stopBreathingSession]);

  const resetBreathingSession = useCallback(() => {
    setIsBreathing(false);
    setIsCompleted(false);
    setCycleCount(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);
  }, []);

  const startBaselineMeasurement = useCallback(() => {
    setIsBreathing(false);
    setIsCompleted(false);
    setCycleCount(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);
    baselineSamplesRef.current = {
      bpms: [bpmRef.current],
      gsrs: [gsrRef.current],
      gsrRaws: [gsrRawRef.current],
    };
    setBaselineLiveAvg({bpm: bpmRef.current, gsr: gsrRef.current, count: 1});
    setBaselineRemaining(BASELINE_DURATION_SECONDS);
    setBaselineStatus('measuring');
    showToast('30초 동안 GSR과 BPM 생체신호를 입력받습니다.');
  }, [showToast]);

  const cancelBaselineMeasurement = useCallback(() => {
    setBaselineStatus('idle');
    setBaselineRemaining(BASELINE_DURATION_SECONDS);
    showToast('초기 생체신호 측정이 중단되었습니다.');
  }, [showToast]);

  const handleSelectRoutine = useCallback(
    (key: RoutineKey) => {
      setRoutineKey(key);
      if (isBreathingRef.current) {
        setIsCompleted(false);
        setCycleCount(1);
        setPhaseIndex(0);
        setPhaseElapsed(0);
        void playPhaseChime(ROUTINES[key].phases[0].label, audioEnabled);
      } else {
        showToast(`${ROUTINES[key].name} 리듬이 선택되었습니다.`);
      }
    },
    [audioEnabled, showToast],
  );

  const handleApplyAiRoutine = useCallback(
    (key: RoutineKey) => {
      setActiveTab('studio');
      setRoutineKey(key);
      sessionStartBpmRef.current = bpmRef.current;
      sessionStartGsrRef.current = gsrRef.current;
      setIsCompleted(false);
      setCycleCount(1);
      setPhaseIndex(0);
      setPhaseElapsed(0);
      setIsBreathing(true);
      void playPhaseChime(ROUTINES[key].phases[0].label, audioEnabled);
      showToast(`${ROUTINES[key].name} 루틴을 키링에 적용했습니다.`, 'success');
    },
    [audioEnabled, showToast],
  );

  const handleSetPetalTheme = useCallback(
    (theme: PetalThemeKey) => {
      setPetalTheme(theme);
      saveStoredPetalTheme(theme);
      showToast(`${PETAL_THEMES[theme].label} 커버 색상이 변경되었습니다.`);
    },
    [showToast],
  );

  const handleChangeScenario = useCallback(
    (scenario: SimScenario) => {
      setSimScenario(scenario);
      showToast('시뮬레이션 생체 시나리오가 변경되었습니다.');
    },
    [showToast],
  );

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);

  const handleLogSession = useCallback(
    (moodLabel: string) => {
      const now = new Date();
      const timeStr = `오늘 ${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes(),
      ).padStart(2, '0')}`;
      const beforeBpm = sessionStartBpmRef.current ?? bpmRef.current;
      const afterBpm = bpmRef.current;
      const beforeGsr = sessionStartGsrRef.current ?? gsrRef.current;
      const afterGsr = gsrRef.current;

      const entry: WellnessSessionLog = {
        id: `log-${Date.now()}`,
        time: timeStr,
        createdAt: now.getTime(),
        routine: ROUTINES[routineKey].name,
        routineKey,
        bpmBefore: beforeBpm,
        bpmAfter: afterBpm,
        gsrBefore: beforeGsr,
        gsrAfter: afterGsr,
        mood: moodLabel,
      };

      setLogs((prev) => {
        const updated = [entry, ...prev];
        saveStoredLogs(updated);
        return updated;
      });
      showToast(`'${moodLabel}' 상태가 웰니스 리포트에 저장되었습니다!`, 'success');
    },
    [routineKey, showToast],
  );

  const handleClearLogs = useCallback(() => {
    const empty = clearStoredLogs();
    setLogs(empty);
    showToast('저장된 웰니스 기록이 모두 삭제되었습니다.');
  }, [showToast]);

  // 30-second initial GSR & BPM measurement timer
  useEffect(() => {
    if (baselineStatus !== 'measuring') return;

    const timer = window.setInterval(() => {
      const samples = baselineSamplesRef.current;
      samples.bpms.push(bpmRef.current);
      samples.gsrs.push(gsrRef.current);
      samples.gsrRaws.push(gsrRawRef.current);

      const avgBpm = Math.round(
        samples.bpms.reduce((acc, v) => acc + v, 0) / samples.bpms.length,
      );
      const avgGsr = Math.round(
        samples.gsrs.reduce((acc, v) => acc + v, 0) / samples.gsrs.length,
      );
      const avgGsrRaw = Math.round(
        samples.gsrRaws.reduce((acc, v) => acc + v, 0) / samples.gsrRaws.length,
      );
      setBaselineLiveAvg({bpm: avgBpm, gsr: avgGsr, count: samples.bpms.length});

      setBaselineRemaining((prev) => {
        if (prev <= 1) {
          const now = new Date();
          const measuredAt = `${String(now.getHours()).padStart(2, '0')}:${String(
            now.getMinutes(),
          ).padStart(2, '0')}`;
          const recommendedRoutine: Exclude<RoutineKey, 'calm'> =
            avgBpm >= 85 || avgGsr < 58 ? (avgBpm >= 85 ? '478' : 'box') : '478';

          setBaselineResult({
            bpm: avgBpm,
            gsr: avgGsr,
            gsrRaw: avgGsrRaw,
            sampleCount: samples.bpms.length,
            measuredAt,
            recommendedRoutine,
          });
          setBaselineStatus('complete');
          sessionStartBpmRef.current = avgBpm;
          sessionStartGsrRef.current = avgGsr;
          setRoutineKey(recommendedRoutine);

          showToast(
            `30초 측정 완료 (평균 ${avgBpm} BPM · GSR ${avgGsr}). 초기 기준선이 저장되었습니다.`,
            'success',
          );

          if (autoStartAfterBaseline) {
            setIsCompleted(false);
            setCycleCount(1);
            setPhaseIndex(0);
            setPhaseElapsed(0);
            setIsBreathing(true);
            void playPhaseChime(ROUTINES[recommendedRoutine].phases[0].label, audioEnabled);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [audioEnabled, autoStartAfterBaseline, baselineStatus, showToast]);

  // Breathing 1-second timer engine
  useEffect(() => {
    if (!isBreathing) return;

    const timer = window.setInterval(() => {
      const routine = ROUTINES[routineKey];
      const currentPhase = routine.phases[phaseIndex] ?? routine.phases[0];

      if (phaseElapsed + 1 >= currentPhase.duration) {
        const nextPhaseIndex = phaseIndex + 1;
        if (nextPhaseIndex >= routine.phases.length) {
          if (cycleCount >= MAX_CYCLES) {
            setIsBreathing(false);
            setIsCompleted(true);
            setPhaseIndex(0);
            setPhaseElapsed(0);
            showToast('4사이클 호흡 완료! 심박과 긴장도가 완화되었습니다.', 'success');
            if (!isSerialRef.current) {
              setSimScenario('relaxed');
            }
            return;
          }
          const nextCycle = cycleCount + 1;
          setCycleCount(nextCycle);
          setPhaseIndex(0);
          setPhaseElapsed(0);
          void playPhaseChime(routine.phases[0].label, audioEnabled);
        } else {
          setPhaseIndex(nextPhaseIndex);
          setPhaseElapsed(0);
          void playPhaseChime(routine.phases[nextPhaseIndex].label, audioEnabled);
        }
      } else {
        setPhaseElapsed((prev) => prev + 1);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [audioEnabled, cycleCount, isBreathing, phaseElapsed, phaseIndex, routineKey, showToast]);

  // 600ms biometric telemetry simulator loop
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isSerialRef.current) {
        let targetBpm = 78;
        let targetGsr = 45;

        if (simScenarioRef.current === 'tense') {
          targetBpm = isBreathingRef.current ? 80 : 94;
          targetGsr = isBreathingRef.current ? 52 : 72;
        } else if (simScenarioRef.current === 'pressure') {
          targetBpm = isBreathingRef.current ? 75 : 82;
          targetGsr = isBreathingRef.current ? 46 : 74;
        } else if (simScenarioRef.current === 'normal') {
          targetBpm = isBreathingRef.current ? 72 : 78;
          targetGsr = isBreathingRef.current ? 38 : 46;
        } else if (simScenarioRef.current === 'relaxed') {
          targetBpm = 68;
          targetGsr = 28;
        }

        setBpm((prev) => {
          const next = Math.round(prev + (targetBpm - prev) * 0.15 + (Math.random() * 2 - 1));
          return Math.max(55, Math.min(140, next));
        });

        setGsr((prev) => {
          const next = Math.round(prev + (targetGsr - prev) * 0.15 + (Math.random() * 2 - 1));
          const clamped = Math.max(10, Math.min(100, next));
          setGsrRaw(Math.round(3000 - clamped * 14));
          gsrHistoryRef.current.push(clamped);
          if (gsrHistoryRef.current.length > 60) {
            gsrHistoryRef.current.shift();
          }
          return clamped;
        });
      }
    }, 600);

    return () => window.clearInterval(timer);
  }, []);

  // 60fps PPG pulse generator + green LED emitter sync
  useEffect(() => {
    let rafId = 0;
    let lastHighlight = false;

    const tick = () => {
      wavePhaseRef.current += (bpmRef.current / 60) * 0.14;
      const t = wavePhaseRef.current % (Math.PI * 2);
      let pulse = Math.sin(t) * 0.5;
      if (t > 0.5 && t < 1.3) pulse += Math.sin(((t - 0.5) * Math.PI) / 0.8) * 1.4;
      if (t > 1.5 && t < 2.2) pulse += Math.sin(((t - 1.5) * Math.PI) / 0.7) * 0.45;

      hrHistoryRef.current.push(pulse);
      if (hrHistoryRef.current.length > 90) {
        hrHistoryRef.current.shift();
      }

      const highlight = pulse > 0.9;
      if (highlight !== lastHighlight) {
        lastHighlight = highlight;
        setPulseHighlight(highlight);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Web Serial parser for XIAO ESP32-C3 ("BPM:78,GSR:45,BTN:1")
  const parseSerialData = useCallback(
    (line: string) => {
      if (!line) return;
      const parts = line.split(',');
      parts.forEach((part) => {
        const [k, v] = part.split(':');
        if (k === 'BPM' && !Number.isNaN(Number(v))) {
          setBpm(Number(v));
        }
        if (k === 'GSR' && !Number.isNaN(Number(v))) {
          const raw = Number(v);
          const normalized = Math.min(100, Math.max(0, Math.round((raw / 4095) * 100)));
          setGsrRaw(raw);
          setGsr(normalized);
          gsrHistoryRef.current.push(normalized);
          if (gsrHistoryRef.current.length > 60) {
            gsrHistoryRef.current.shift();
          }
        }
        if (k === 'BTN' && v === '1') {
          toggleBreathingSession();
        }
      });
    },
    [toggleBreathingSession],
  );

  const handleToggleWebSerial = useCallback(async () => {
    const nav = navigator as NavigatorWithSerial;
    if (!nav.serial) {
      showToast('현재 브라우저는 Web Serial을 지원하지 않습니다. Chrome/Edge에서 USB 연결이 가능합니다.');
      return;
    }

    if (isSerialRef.current && serialPortRef.current) {
      try {
        await serialReaderRef.current?.cancel();
      } catch {
        // Ignore reader cancel errors
      }
      try {
        await serialPortRef.current.close();
      } catch {
        // Ignore close errors
      }
      serialReaderRef.current = null;
      serialPortRef.current = null;
      setIsSerialConnected(false);
      showToast('XIAO ESP32-C3 연결이 해제되었습니다.');
      return;
    }

    try {
      const port = await nav.serial.requestPort();
      await port.open({baudRate: 115200});
      serialPortRef.current = port;
      setIsSerialConnected(true);
      isSerialRef.current = true;
      showToast('XIAO ESP32-C3 보드가 성공적으로 연결되었습니다!', 'success');

      if (port.readable) {
        const textDecoder = new TextDecoderStream();
        void port.readable.pipeTo(textDecoder.writable as unknown as WritableStream<Uint8Array>);
        const reader = textDecoder.readable.getReader();
        serialReaderRef.current = reader;

        let buffer = '';
        while (isSerialRef.current) {
          const {value, done} = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            parseSerialData(line.trim());
          }
        }
      }
    } catch {
      setIsSerialConnected(false);
      isSerialRef.current = false;
      showToast('USB 연결이 취소되었거나 포트를 열 수 없습니다.');
    }
  }, [parseSerialData, showToast]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toast Notification Box */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => {
          const bgClass =
            toast.type === 'success'
              ? 'bg-charcoal text-white'
              : toast.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-white text-charcoal border border-stone-200';
          return (
            <div
              key={toast.id}
              className={`${bgClass} px-4 py-3 rounded-2xl shadow-lg text-xs font-semibold flex items-center gap-2 transition-all duration-300`}
            >
              <span>🌸</span>
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>

      <Header
        activeTab={activeTab}
        onSwitchTab={setActiveTab}
        isSerialConnected={isSerialConnected}
        onToggleSerial={() => void handleToggleWebSerial()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'studio' && (
          <StudioTab
            isSerialConnected={isSerialConnected}
            isBreathing={isBreathing}
            isCompleted={isCompleted}
            routineKey={routineKey}
            cycleCount={cycleCount}
            maxCycles={MAX_CYCLES}
            phaseIndex={phaseIndex}
            phaseElapsed={phaseElapsed}
            audioEnabled={audioEnabled}
            simScenario={simScenario}
            petalTheme={petalTheme}
            bpm={bpm}
            gsr={gsr}
            gsrRaw={gsrRaw}
            baselineStatus={baselineStatus}
            baselineRemaining={baselineRemaining}
            baselineDuration={BASELINE_DURATION_SECONDS}
            baselineLiveAvg={baselineLiveAvg}
            baselineResult={baselineResult}
            autoStartAfterBaseline={autoStartAfterBaseline}
            hrHistoryRef={hrHistoryRef}
            gsrHistoryRef={gsrHistoryRef}
            pulseHighlight={pulseHighlight}
            onToggleAudio={handleToggleAudio}
            onChangeScenario={handleChangeScenario}
            onSetPetalTheme={handleSetPetalTheme}
            onTactilePress={toggleBreathingSession}
            onToggleBreathing={toggleBreathingSession}
            onResetBreathing={resetBreathingSession}
            onStartBaseline={startBaselineMeasurement}
            onCancelBaseline={cancelBaselineMeasurement}
            onToggleAutoStartAfterBaseline={() => setAutoStartAfterBaseline((prev) => !prev)}
            onSelectRoutine={handleSelectRoutine}
            onLogSession={handleLogSession}
          />
        )}

        {activeTab === 'ai' && (
          <AiCareTab bpm={bpm} gsr={gsr} onApplyRoutine={handleApplyAiRoutine} />
        )}

        {activeTab === 'report' && (
          <ReportTab
            logs={logs}
            onClearLogs={handleClearLogs}
            onGoToStudio={() => setActiveTab('studio')}
          />
        )}

        {activeTab === 'about' && <AboutTab />}
      </main>

      <footer className="border-t border-stone-200/70 py-5 px-4 text-center text-xs text-stone-400">
        BLOOMI (블루미) — Physical · AI · Data 기반 스마트 꽃잎 호흡 웰니스 키링 프로젝트
      </footer>
    </div>
  );
}
