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
  writable: WritableStream<Uint8Array> | null;
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort: () => Promise<SerialPortLike>;
  };
}

const MAX_CYCLES = 4;

// 웹 호흡 루틴 → 꽃 LED 패턴 명령
// 각 단계: "초,밝기,색"  (꽃이 펴지는 단계 scale ≥ 1 → 밝게 100, 오므라드는 단계 → 어둡게 15)
// 예) 4-7-8 → "pattern:4,100,F4A6B8;7,15,B8B5E8;8,100,8FB996"
const buildPatternCommand = (key: RoutineKey) =>
  `pattern:${ROUTINES[key].phases
    .map((phase) => `${phase.duration},${phase.scale >= 1 ? 100 : 15},${phase.color.replace('#', '')}`)
    .join(';')}`;
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
  const [baselineLiveAvg, setBaselineLiveAvg] = useState({bpm: 75, gsr: 45, count: 0});
  const [baselineResult, setBaselineResult] = useState<BaselineMeasurement | null>(null);
  const [autoStartAfterBaseline, setAutoStartAfterBaseline] = useState(false);

  // Biometrics & Hardware Serial State
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [simScenario, setSimScenario] = useState<SimScenario>('normal');
  const [bpm, setBpm] = useState(75);
  const [gsr, setGsr] = useState(45);
  const [gsrRaw, setGsrRaw] = useState(2370);
  const [pulseHighlight, setPulseHighlight] = useState(false);

  // Persisted Wellness Logs
  const [logs, setLogs] = useState<WellnessSessionLog[]>(() => loadStoredLogs());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Refs for real-time loops & Serial reader
  const hrHistoryRef = useRef<number[]>(Array.from({length: 90}, () => 0));
  const gsrHistoryRef = useRef<number[]>(Array.from({length: 60}, () => 45));
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
  const routineKeyRef = useRef(routineKey);
  const baselineResultRef = useRef(baselineResult);
  const simScenarioRef = useRef(simScenario);
  const serialPortRef = useRef<SerialPortLike | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  // 웹 → 꽃(기기) 명령 전송용 (start / stop / calib / cancel)
  const serialWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  // 꽃 LED가 지금 보여주는 판단 (0 초록 / 1 노랑 / 2 빨강, null = 아직 없음)
  const [deviceLevel, setDeviceLevel] = useState<number | null>(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceCompleted, setDeviceCompleted] = useState<[number, number, number] | null>(null);
  const deviceReadyRef = useRef(false);
  const lastPatternKeyRef = useRef<RoutineKey | null>(null);
  const sessionEndRef = useRef<{bpm: number; gsr: number} | null>(null);
  const baselineStatusRef = useRef(baselineStatus);
  const autoStartAfterBaselineRef = useRef(autoStartAfterBaseline);
  const lastSentBreathingRef = useRef<boolean | null>(null);

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
    routineKeyRef.current = routineKey;
  }, [routineKey]);

  useEffect(() => {
    baselineResultRef.current = baselineResult;
  }, [baselineResult]);

  useEffect(() => {
    simScenarioRef.current = simScenario;
  }, [simScenario]);

  useEffect(() => {
    baselineStatusRef.current = baselineStatus;
  }, [baselineStatus]);

  useEffect(() => {
    autoStartAfterBaselineRef.current = autoStartAfterBaseline;
  }, [autoStartAfterBaseline]);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, {id, message, type}]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // 꽃(기기)으로 명령 한 줄 보내기. 연결 안 됐으면 아무것도 안 함.
  const sendSerialCommand = useCallback(async (command: string) => {
    const writer = serialWriterRef.current;
    if (!writer) return;
    try {
      await writer.write(new TextEncoder().encode(`${command}\n`));
    } catch {
      // 케이블이 빠진 경우 등은 읽기 루프 쪽에서 연결 해제로 처리됨
    }
  }, []);

  const startBreathingSession = useCallback(
    (overrideRoutine?: RoutineKey) => {
      const targetKey = overrideRoutine ?? routineKey;
      setBaselineStatus((prev) => (prev === 'measuring' ? 'idle' : prev));
      setIsCompleted(false);
      if (cycleCount === 0 || isCompleted || overrideRoutine) {
        sessionStartBpmRef.current = bpmRef.current;
        sessionStartGsrRef.current = gsrRef.current;
        sessionEndRef.current = null;
        setCycleCount(1);
        setPhaseIndex(0);
        setPhaseElapsed(0);
      }
      setIsBreathing(true);
      const firstPhase = ROUTINES[targetKey].phases[0];
      void playPhaseChime(firstPhase.label, audioEnabled);
    },
    [audioEnabled, cycleCount, isCompleted, routineKey],
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
    setBaselineResult(null);
    baselineResultRef.current = null;
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

  // 화면의 '기준선 측정' 버튼: 꽃이 연결돼 있으면 꽃이 직접 재도록 calib 전송
  // (꽃이 ">>> 기준선 측정 시작"을 보내면 아래 파서가 화면 상태를 맞춤)
  const handleStartBaseline = useCallback(() => {
    if (isSerialRef.current && serialWriterRef.current) {
      void sendSerialCommand('calib');
      showToast('꽃에서 30초 기준선 측정을 시작합니다. 검지와 GSR 전극을 그대로 두세요.');
      return;
    }
    startBaselineMeasurement();
  }, [sendSerialCommand, showToast, startBaselineMeasurement]);

  const handleCancelBaseline = useCallback(() => {
    if (isSerialRef.current && serialWriterRef.current) {
      void sendSerialCommand('cancel');
    }
    cancelBaselineMeasurement();
  }, [cancelBaselineMeasurement, sendSerialCommand]);

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
      sessionEndRef.current = null;
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
    (moodLabel: string, situation: 'interview' | 'study' | 'rest') => {
      const now = new Date();
      const timeStr = `오늘 ${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes(),
      ).padStart(2, '0')}`;
      const beforeBpm = sessionStartBpmRef.current ?? bpmRef.current;
      const afterBpm = sessionEndRef.current?.bpm ?? bpmRef.current;
      const beforeGsr = sessionStartGsrRef.current ?? gsrRef.current;
      const afterGsr = sessionEndRef.current?.gsr ?? gsrRef.current;

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
        situation,
        completed: isCompleted,
      };

      setLogs((prev) => {
        const updated = [entry, ...prev];
        saveStoredLogs(updated);
        return updated;
      });
      showToast(`'${moodLabel}' 상태가 웰니스 리포트에 저장되었습니다!`, 'success');
    },
    [routineKey, isCompleted, showToast],
  );

  const handleClearLogs = useCallback(() => {
    const empty = clearStoredLogs();
    setLogs(empty);
    showToast('저장된 웰니스 기록이 모두 삭제되었습니다.');
  }, [showToast]);

  // 30-second initial GSR & BPM measurement timer
  useEffect(() => {
    if (baselineStatus !== 'measuring' || isSerialConnected) return;

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

      // 꽃이 연결돼 있으면 꽃이 측정·저장을 담당 (남은 시간은 JSON calibSec, 완료는 "기준선 저장 완료" 문장)
      if (isSerialRef.current) return;

      setBaselineRemaining((prev) => {
        if (prev <= 1) {
          const now = new Date();
          const measuredAt = `${String(now.getHours()).padStart(2, '0')}:${String(
            now.getMinutes(),
          ).padStart(2, '0')}`;
          setBaselineResult({
            bpm: avgBpm,
            gsr: avgGsr,
            gsrRaw: avgGsrRaw,
            sampleCount: samples.bpms.length,
            measuredAt,
          });
          setBaselineStatus('complete');
          sessionStartBpmRef.current = avgBpm;
          sessionStartGsrRef.current = avgGsr;

          showToast(
            `30초 기준선 저장 완료 (${avgBpm} BPM · GSR ${avgGsr}). 이후 실시간 변동 감지 시 호흡을 추천합니다.`,
            'success',
          );

          if (autoStartAfterBaseline) {
            const currentKey = routineKeyRef.current;
            setIsCompleted(false);
            setCycleCount(1);
            setPhaseIndex(0);
            setPhaseElapsed(0);
            setIsBreathing(true);
            void playPhaseChime(ROUTINES[currentKey].phases[0].label, audioEnabled);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [audioEnabled, autoStartAfterBaseline, baselineStatus, isSerialConnected, showToast]);

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
            if (isSerialRef.current) void sendSerialCommand('complete');
            sessionEndRef.current = {bpm: bpmRef.current, gsr: gsrRef.current};
            setIsBreathing(false);
            setIsCompleted(true);
            setPhaseIndex(0);
            setPhaseElapsed(0);
            showToast('4사이클 호흡 완료! 전후 측정값을 기록에서 확인해 보세요.', 'success');
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
  }, [audioEnabled, cycleCount, isBreathing, phaseElapsed, phaseIndex, routineKey, sendSerialCommand, showToast]);

  // 루틴이 바뀌거나 막 연결됐을 때 꽃에 호흡 패턴 전송
  // (아래 start 전송 효과보다 먼저 선언 → 같은 순간에 바뀌면 pattern → start 순서로 나감.
  //  호흡 중에 루틴을 바꾸면 꽃도 첫 단계부터 다시 시작해 화면과 맞춰짐)
  useEffect(() => {
    if (!isSerialConnected || !deviceReady || lastPatternKeyRef.current === routineKey) return;
    lastPatternKeyRef.current = routineKey;
    void sendSerialCommand(`routine:${routineKey}`);
    void sendSerialCommand(buildPatternCommand(routineKey));
  }, [isSerialConnected, deviceReady, routineKey, sendSerialCommand]);

  // 화면 호흡 상태 → 꽃 LED 동기화 (꽃 버튼으로 시작한 경우엔 꽃이 이미 같은 상태라 무시됨)
  useEffect(() => {
    if (!isSerialConnected) {
      lastSentBreathingRef.current = null;
      return;
    }
    if (lastSentBreathingRef.current === null && !isBreathing) {
      lastSentBreathingRef.current = false; // 연결 직후엔 꽃 상태를 건드리지 않음
      return;
    }
    if (lastSentBreathingRef.current === isBreathing) return;
    lastSentBreathingRef.current = isBreathing;
    void sendSerialCommand(isBreathing ? 'start' : 'stop');
  }, [isBreathing, isSerialConnected, sendSerialCommand]);

  // 호흡 중 1초마다 화면의 현재 단계·경과 시간을 꽃에 알려 타이밍을 맞춤
  // (일시정지 후 이어서 하기, 타이머 오차 모두 여기서 바로잡힘)
  useEffect(() => {
    if (!isSerialConnected || !isBreathing) return;
    void sendSerialCommand(`sync:${phaseIndex},${phaseElapsed}`);
  }, [isBreathing, isSerialConnected, phaseElapsed, phaseIndex, sendSerialCommand]);

  // 600ms biometric telemetry simulator loop
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isSerialRef.current) {
        const baseBpm = baselineResultRef.current?.bpm ?? 75;
        const baseGsr = baselineResultRef.current?.gsr ?? 45;
        let targetBpm = 75;
        let targetGsr = 45;

        if (simScenarioRef.current === 'tense') {
          targetBpm = isBreathingRef.current
            ? Math.max(75, baseBpm + 4)
            : Math.min(132, Math.max(96, baseBpm + 20));
          targetGsr = isBreathingRef.current ? Math.max(38, baseGsr) : Math.min(92, baseGsr + 10);
        } else if (simScenarioRef.current === 'pressure') {
          targetBpm = isBreathingRef.current ? Math.max(72, baseBpm) : Math.min(115, baseBpm + 6);
          targetGsr = isBreathingRef.current
            ? Math.max(36, baseGsr)
            : Math.min(96, Math.max(72, baseGsr + 22));
        } else if (simScenarioRef.current === 'normal') {
          targetBpm = isBreathingRef.current ? 71 : 75;
          targetGsr = isBreathingRef.current ? 36 : 45;
        } else if (simScenarioRef.current === 'relaxed') {
          targetBpm = 66;
          targetGsr = 26;
        }

        setBpm((prev) => {
          const next = Math.round(prev + (targetBpm - prev) * 0.25 + (Math.random() * 2 - 1));
          return Math.max(55, Math.min(140, next));
        });

        setGsr((prev) => {
          const next = Math.round(prev + (targetGsr - prev) * 0.25 + (Math.random() * 2 - 1));
          const clamped = Math.max(10, Math.min(100, next));
          setGsrRaw(Math.round(4095 * (1 - clamped / 100)));
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

  // Web Serial 파서 (JSON, "BPM:78,GSR:1820,BTN:1", 및 기존 bloomi_v1.ino 로그 모두 지원)
  const parseSerialData = useCallback(
    (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;

      const applyGsrRaw = (raw: number) => {
        if (!Number.isFinite(raw)) return;
        const clampedRaw = Math.min(4095, Math.max(0, Math.round(raw)));
        // Grove GSR은 긴장 시 저항(ADC)이 낮아지므로 반비례로 0~100 긴장도 환산
        const normalized = Math.min(
          100,
          Math.max(0, Math.round(100 - (clampedRaw / 4095) * 100)),
        );
        setGsrRaw(clampedRaw);
        setGsr(normalized);
        gsrHistoryRef.current.push(normalized);
        if (gsrHistoryRef.current.length > 60) {
          gsrHistoryRef.current.shift();
        }
      };

      // 1) JSON 포맷 처리: {"bpm":78,"gsr":45,"gsrRaw":1820,"buttonPressed":true}
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          const data = JSON.parse(line) as {
            bpm?: unknown;
            gsr?: unknown;
            gsrRaw?: unknown;
            buttonPressed?: unknown;
            session?: unknown;
            calibrating?: unknown;
            calibSec?: unknown;
            level?: unknown;
            base?: unknown;
            gsrBase?: unknown;
            routine?: unknown;
            done478?: unknown;
            doneBox?: unknown;
            doneCalm?: unknown;
          };

          if (!deviceReadyRef.current && typeof data.routine === 'number' && data.routine >= 0 && data.routine <= 2) {
            deviceReadyRef.current = true;
            const savedKey = (['478', 'box', 'calm'] as const)[data.routine];
            lastPatternKeyRef.current = savedKey;
            setRoutineKey(savedKey);
            setDeviceReady(true);
          }
          if ([data.done478, data.doneBox, data.doneCalm].every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0)) {
            setDeviceCompleted([data.done478 as number, data.doneBox as number, data.doneCalm as number]);
          }

          if (typeof data.base === 'number' && data.base >= 40 && data.base <= 180 &&
              typeof data.gsrBase === 'number' && data.gsrBase > 0 && data.gsrBase <= 4095 &&
              (baselineResultRef.current?.bpm !== data.base || baselineResultRef.current?.gsrRaw !== data.gsrBase)) {
            const raw = Math.round(data.gsrBase);
            const result: BaselineMeasurement = {
              bpm: Math.round(data.base), gsrRaw: raw,
              gsr: Math.round(100 - raw / 4095 * 100),
              sampleCount: 60, measuredAt: new Date().toLocaleTimeString('ko-KR'),
            };
            baselineResultRef.current = result;
            setBaselineResult(result);
            setBaselineStatus('complete');
          }

          // 꽃 LED 판단 (0 초록 / 1 노랑 / 2 빨강)
          if (typeof data.level === 'number' && Number.isFinite(data.level)) {
            setDeviceLevel(data.level);
          }
          // 꽃이 기준선을 재는 중이면 남은 시간을 꽃 기준으로 표시
          if (
            data.calibrating === 1 &&
            typeof data.calibSec === 'number' &&
            baselineStatusRef.current === 'measuring'
          ) {
            setBaselineRemaining(Math.max(0, BASELINE_DURATION_SECONDS - data.calibSec));
          }

          if (typeof data.bpm === 'number' && Number.isFinite(data.bpm)) {
            setBpm(data.bpm >= 40 && data.bpm <= 180 ? Math.round(data.bpm) : 0);
          }
          if (typeof data.gsrRaw === 'number' && Number.isFinite(data.gsrRaw)) {
            if (typeof data.gsr === 'number' && Number.isFinite(data.gsr)) {
              const clampedGsr = Math.min(100, Math.max(0, Math.round(data.gsr)));
              setGsrRaw(Math.round(data.gsrRaw));
              setGsr(clampedGsr);
              gsrHistoryRef.current.push(clampedGsr);
              if (gsrHistoryRef.current.length > 60) gsrHistoryRef.current.shift();
            } else {
              applyGsrRaw(data.gsrRaw);
            }
          } else if (typeof data.gsr === 'number' && Number.isFinite(data.gsr)) {
            const clampedGsr = Math.min(100, Math.max(0, Math.round(data.gsr)));
            setGsr(clampedGsr);
            gsrHistoryRef.current.push(clampedGsr);
            if (gsrHistoryRef.current.length > 60) gsrHistoryRef.current.shift();
          }

          if (data.buttonPressed === true) {
            toggleBreathingSession();
          }
          return;
        } catch {
          // JSON 파싱 실패 시 아래 텍스트 파서로 계속 진행
        }
      }

      // 2) "BPM:78,GSR:1820,BTN:1" 포맷 처리
      if (line.includes('BPM:') || line.includes('GSR:') || line.includes('BTN:')) {
        const parts = line.split(',');
        parts.forEach((part) => {
          const [rawKey, rawVal] = part.split(':');
          const k = rawKey?.trim();
          const v = rawVal?.trim();
          if (k === 'BPM' && v && !Number.isNaN(Number(v))) {
            setBpm(Math.max(0, Math.round(Number(v))));
          }
          if (k === 'GSR' && v && !Number.isNaN(Number(v))) {
            applyGsrRaw(Number(v));
          }
          if (k === 'BTN' && v === '1') {
            toggleBreathingSession();
          }
        });
        return;
      }

      // 3) 기존 bloomi_v1.ino 시리얼 로그 포맷 처리
      // 예: "BPM= 72  기준선= 68  차이= +4  | 초록(평소)  | GSR=1820"
      const bpmMatch = line.match(/BPM\s*=\s*(\d+)/i);
      if (bpmMatch) {
        setBpm(Number(bpmMatch[1]));
      }

      const gsrMatch = line.match(/GSR\s*=\s*(\d+)/i);
      if (gsrMatch) {
        applyGsrRaw(Number(gsrMatch[1]));
      }

      // 보드 물리 버튼(D8) 이벤트 동기화
      if (line.includes('호흡 세션 시작')) {
        if (!isBreathingRef.current) startBreathingSession();
      } else if (line.includes('호흡 세션 종료')) {
        if (isBreathingRef.current) {
          sessionEndRef.current = {bpm: bpmRef.current, gsr: gsrRef.current};
          stopBreathingSession();
          if (line.includes('완료')) setIsCompleted(true);
        }
      } else if (line.includes('기준선 측정 시작')) {
        startBaselineMeasurement();
      } else if (line.includes('기준선 측정 취소') || line.includes('기준선 측정 실패')) {
        if (baselineStatusRef.current === 'measuring') cancelBaselineMeasurement();
      } else if (line.includes('기준선 저장 완료')) {
        const baseMatch = line.match(/기준선 저장 완료:\s*(\d+)\s*BPM\s*\/\s*GSR\s*(\d+)/);
        if (baseMatch) {
          const savedBpm = Number(baseMatch[1]);
          const savedRaw = Number(baseMatch[2]);
          const now = new Date();
          const measuredAt = `${String(now.getHours()).padStart(2, '0')}:${String(
            now.getMinutes(),
          ).padStart(2, '0')}`;
          setBaselineResult({
            bpm: savedBpm,
            gsr: Math.round(100 - savedRaw / 4095 * 100),
            gsrRaw: savedRaw,
            sampleCount: 60,
            measuredAt,
          });
          setBaselineStatus('complete');
          sessionStartBpmRef.current = savedBpm;
          showToast(`꽃에서 기준선 저장 완료 (${savedBpm} BPM)`, 'success');
          if (autoStartAfterBaselineRef.current && !isBreathingRef.current) {
            startBreathingSession();
          }
        }
      }
    },
    [
      cancelBaselineMeasurement,
      showToast,
      startBaselineMeasurement,
      startBreathingSession,
      stopBreathingSession,
      toggleBreathingSession,
    ],
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
      try {
        await serialWriterRef.current?.close();
      } catch {
        // Ignore writer close errors
      }
      serialWriterRef.current = null;
      serialReaderRef.current = null;
      serialPortRef.current = null;
      setDeviceLevel(null);
      deviceReadyRef.current = false;
      lastPatternKeyRef.current = null;
      setDeviceReady(false);
      setDeviceCompleted(null);
      setIsSerialConnected(false);
      showToast('XIAO ESP32-C3 연결이 해제되었습니다.');
      return;
    }

    try {
      const port = await nav.serial.requestPort();
      await port.open({baudRate: 115200});
      serialPortRef.current = port;
      serialWriterRef.current = port.writable ? port.writable.getWriter() : null;
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
      serialWriterRef.current = null;
      setDeviceLevel(null);
      deviceReadyRef.current = false;
      lastPatternKeyRef.current = null;
      setDeviceReady(false);
      setDeviceCompleted(null);
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
        deviceLevel={deviceLevel}
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
            onStartBaseline={handleStartBaseline}
            onCancelBaseline={handleCancelBaseline}
            onToggleAutoStartAfterBaseline={() => setAutoStartAfterBaseline((prev) => !prev)}
            onSelectRoutine={handleSelectRoutine}
            onLogSession={handleLogSession}
          />
        )}

        {activeTab === 'ai' && (
          <AiCareTab bpm={bpm} gsr={gsr} gsrRaw={gsrRaw} baseline={baselineResult} recentSessions={logs} onApplyRoutine={handleApplyAiRoutine} />
        )}

        {activeTab === 'report' && (
          <ReportTab
            logs={logs}
            deviceCompleted={deviceCompleted}
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
