export type TabId = 'studio' | 'ai' | 'report' | 'about';

export type RoutineKey = '478' | 'box' | 'calm';

export type PetalThemeKey = 'blush' | 'lavender' | 'sage' | 'pearl';

export type SimScenario = 'tense' | 'pressure' | 'normal' | 'relaxed';

export type BaselineStatus = 'idle' | 'measuring' | 'complete';

export interface BaselineMeasurement {
  bpm: number;
  gsr: number;
  gsrRaw: number;
  sampleCount: number;
  measuredAt: string;
}

export interface BreathingPhase {
  label: string;
  duration: number;
  scale: number;
  petalScale: number;
  color: string;
  halo: string;
  hint: string;
}

export interface BreathingRoutine {
  name: string;
  phases: BreathingPhase[];
}

export interface WellnessSessionLog {
  id: string;
  time: string;
  createdAt?: number;
  routine: string;
  routineKey?: RoutineKey;
  bpmBefore: number;
  bpmAfter: number;
  gsrBefore?: number;
  gsrAfter?: number;
  mood: string;
  situation?: 'interview' | 'study' | 'rest';
  completed?: boolean;
}

export interface AiPrescription {
  routineKey: RoutineKey;
  routineTitle: string;
  reason: string;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  prescription?: AiPrescription;
  isError?: boolean;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export const ROUTINES: Record<RoutineKey, BreathingRoutine> = {
  '478': {
    name: '4-7-8 호흡',
    phases: [
      {
        label: '들이마시기 (꽃 펴짐)',
        duration: 4,
        scale: 1.16,
        petalScale: 1.06,
        color: '#F4A6B8',
        halo: '#F4A6B8',
        hint: '4초 동안 코로 깊게 숨을 들이마시며 꽃잎이 활짝 펴집니다',
      },
      {
        label: '숨 참기 (꽃 닫힘)',
        duration: 7,
        scale: 0.86,
        petalScale: 0.84,
        color: '#B8B5E8',
        halo: '#B8B5E8',
        hint: '7초 동안 숨을 머금으며 꽃잎이 고요하게 오므라듭니다',
      },
      {
        label: '내쉬기 (꽃 다시 펴짐)',
        duration: 8,
        scale: 1.16,
        petalScale: 1.06,
        color: '#8FB996',
        halo: '#8FB996',
        hint: '8초 동안 긴장을 모두 내보내며 꽃잎이 다시 부드럽게 펴집니다',
      },
    ],
  },
  box: {
    name: '4-4-4-4 박스',
    phases: [
      {
        label: '들이마시기 (꽃 펴짐)',
        duration: 4,
        scale: 1.14,
        petalScale: 1.05,
        color: '#B8B5E8',
        halo: '#B8B5E8',
        hint: '4초 동안 일정한 속도로 숨을 채우며 꽃을 피웁니다',
      },
      {
        label: '머금기 (꽃 닫힘)',
        duration: 4,
        scale: 0.88,
        petalScale: 0.86,
        color: '#F4A6B8',
        halo: '#F4A6B8',
        hint: '4초 동안 꽃잎을 오므린 채 호흡을 유지합니다',
      },
      {
        label: '내쉬기 (꽃 다시 펴짐)',
        duration: 4,
        scale: 1.14,
        petalScale: 1.05,
        color: '#8FB996',
        halo: '#8FB996',
        hint: '4초 동안 어깨의 힘을 빼며 꽃잎을 활짝 폅니다',
      },
      {
        label: '비우기 (꽃 닫힘)',
        duration: 4,
        scale: 0.88,
        petalScale: 0.86,
        color: '#D6D3D1',
        halo: '#8FB996',
        hint: '다음 호흡 전 4초간 꽃봉오리 상태로 고요히 머무릅니다',
      },
    ],
  },
  calm: {
    name: '5-5 공명 호흡',
    phases: [
      {
        label: '들이마시기 (꽃 펴짐)',
        duration: 5,
        scale: 1.15,
        petalScale: 1.05,
        color: '#8FB996',
        halo: '#8FB996',
        hint: '5초 동안 깊게 들이마시며 꽃잎을 넓게 펼칩니다',
      },
      {
        label: '내쉬기 (꽃 닫힘)',
        duration: 5,
        scale: 0.88,
        petalScale: 0.86,
        color: '#F4A6B8',
        halo: '#F4A6B8',
        hint: '5초 동안 따뜻하게 내쉬며 꽃잎을 차분히 오므립니다',
      },
    ],
  },
};

export const PETAL_THEMES: Record<
  PetalThemeKey,
  {label: string; dotColor: string; outer: string; stroke: string; hasBorder?: boolean}
> = {
  blush: {
    label: '벚꽃 블러쉬',
    dotColor: '#F4A6B8',
    outer: '#F8C8D4',
    stroke: '#EFA6B8',
  },
  lavender: {
    label: '라벤더 미스트',
    dotColor: '#B8B5E8',
    outer: '#DCD9F8',
    stroke: '#B8B5E8',
  },
  sage: {
    label: '세이지 민트',
    dotColor: '#8FB996',
    outer: '#CBE3CF',
    stroke: '#8FB996',
  },
  pearl: {
    label: '문라이트 펄',
    dotColor: '#EFECE6',
    outer: '#F5F2EB',
    stroke: '#DCD6C8',
    hasBorder: true,
  },
};
