import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import {GoogleGenAI, Type} from '@google/genai';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RoutineKey = '478' | 'box' | 'calm';

interface CareRequestBody {
  message?: unknown;
  biometrics?: {
    bpm?: unknown;
    gsr?: unknown;
    gsrRaw?: unknown;
  };
  baseline?: {bpm?: unknown; gsrRaw?: unknown};
  recentSessions?: Array<{routineKey?: unknown; situation?: unknown; completed?: unknown; mood?: unknown}>;
  history?: Array<{
    sender?: unknown;
    text?: unknown;
  }>;
}

interface AiPrescriptionPayload {
  empathy: string;
  routineKey: RoutineKey;
  routineTitle: string;
  reason: string;
}

const DEFAULT_TITLES: Record<RoutineKey, string> = {
  '478': '4-7-8 긴장 완화 호흡 (벚꽃 블러쉬 LED)',
  box: '4-4-4-4 박스 집중 호흡 (라벤더 미스트 LED)',
  calm: '5-5 공명 밸런스 호흡 (세이지 민트 LED)',
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeRoutineKey(value: unknown): RoutineKey {
  if (value === '478' || value === 'box' || value === 'calm') {
    return value;
  }
  return 'calm';
}

async function createApp() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({limit: '32kb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(getGeminiClient()),
    });
  });

  app.post('/api/ai/care', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as CareRequestBody;
    const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';

    if (!rawMessage) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: '마음 상태나 고민 내용을 입력해 주세요.',
      });
      return;
    }

    if (rawMessage.length > 1000) {
      res.status(400).json({
        error: 'MESSAGE_TOO_LONG',
        message: '메시지는 1,000자 이하로 입력해 주세요.',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY_MISSING',
        message:
          'Gemini API 키가 설정되지 않았습니다. AI Studio의 Settings > Secrets 패널에서 GEMINI_API_KEY를 등록해 주세요.',
      });
      return;
    }

    const bpm =
      typeof body.biometrics?.bpm === 'number' && Number.isFinite(body.biometrics.bpm)
        ? Math.round(body.biometrics.bpm)
        : null;
    const gsr =
      typeof body.biometrics?.gsr === 'number' && Number.isFinite(body.biometrics.gsr)
        ? Math.round(body.biometrics.gsr)
        : null;

    const safeHistory = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .filter(
            (item) =>
              item &&
              (item.sender === 'user' || item.sender === 'ai') &&
              typeof item.text === 'string' &&
              item.text.trim().length > 0,
          )
          .map((item) => ({
            sender: item.sender === 'user' ? '사용자' : 'BLOOMI',
            text: String(item.text).trim().slice(0, 400),
          }))
      : [];

    const contextLines: string[] = [];
    if (bpm !== null || gsr !== null) {
      contextLines.push(
        `현재 키링 생체 측정치: 심박수 ${bpm ?? '-'} BPM, GSR 긴장도 ${gsr ?? '-'}/100`,
      );
    }
    const baselineBpm = body.baseline?.bpm;
    const baselineRaw = body.baseline?.gsrRaw;
    const currentRaw = body.biometrics?.gsrRaw;
    if (typeof baselineBpm === 'number' && baselineBpm >= 40 && baselineBpm <= 180 &&
        typeof baselineRaw === 'number' && baselineRaw > 0 && baselineRaw <= 4095 &&
        typeof currentRaw === 'number' && currentRaw >= 0 && currentRaw <= 4095) {
      contextLines.push(`개인 기준선: ${baselineBpm} BPM, GSR ADC ${baselineRaw}. 현재 기준 대비 심박 ${bpm === null ? '측정 안 됨' : `${bpm - baselineBpm} BPM`}, GSR ADC 감소율 ${Math.round((baselineRaw - currentRaw) * 100 / baselineRaw)}%. 측정값만으로 심리 상태를 단정하지 마세요.`);
    }
    if (Array.isArray(body.recentSessions)) {
      const labels: Record<string, string> = {interview: '면접·발표', study: '학습·업무', rest: '휴식·취침'};
      const sessionLines = body.recentSessions.slice(0, 8).filter((item) =>
        item && (item.routineKey === '478' || item.routineKey === 'box' || item.routineKey === 'calm')
      ).map((item) => `${labels[String(item.situation)] ?? '상황 미기록'}: ${item.routineKey}, ${item.completed === true ? '완료' : '미완료'}, ${typeof item.mood === 'string' ? item.mood.slice(0, 30) : ''}`);
      if (sessionLines.length) contextLines.push(`최근 호흡 사용 기록:\n${sessionLines.join('\n')}`);
    }
    if (safeHistory.length > 0) {
      contextLines.push(
        '최근 대화 맥락:\n' +
          safeHistory.map((turn) => `- ${turn.sender}: ${turn.text}`).join('\n'),
      );
    }
    contextLines.push(`사용자 고민: ${rawMessage}`);

    const callGemini = async () =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contextLines.join('\n\n'),
        config: {
          systemInstruction: [
            '당신은 스마트 꽃잎 호흡 키링 BLOOMI(블루미)의 다정하고 전문적인 AI 마음 케어 파트너입니다.',
            '사용자의 감정과 고민에 따뜻하게 공감하고, 현재 심리 상태와 생체신호에 가장 알맞은 호흡 루틴 1가지를 처방하세요.',
            '선택 가능한 routineKey는 반드시 다음 세 가지 중 하나여야 합니다:',
            '- "478": 시험·면접·발표 직전 강한 긴장, 심장 두근거림, 불안 완화가 필요할 때 (4초 들숨 - 7초 멈춤 - 8초 날숨, 벚꽃 블러쉬 LED)',
            '- "box": 업무 과부하, 산만함, 머리 복잡함, 집중력 회복이 필요할 때 (4-4-4-4 박스 호흡, 라벤더 미스트 LED)',
            '- "calm": 일상적 피로, 인간관계 스트레스, 수면 전 이완, 전반적 균형 회복이 필요할 때 (5초 들숨 - 5초 날숨 공명 호흡, 세이지 민트 LED)',
            '응답 작성 규칙:',
            '- empathy: 한국어로 따뜻하고 진심 어린 공감 메시지 2~3문장 (과장되거나 기계적이지 않게).',
            '- routineKey: "478", "box", "calm" 중 정확히 하나.',
            '- routineTitle: 선택한 루틴과 LED 색상을 담은 간결한 한국어 제목.',
            '- reason: 이 호흡 리듬이 지금 몸과 마음을 어떻게 도와주는지 생리학적/실용적 이유 1~2문장.',
            '의학적 진단이나 처방이라는 표현은 피하고, 호흡 웰니스 가이드로 안내하세요.',
            '개인 기준선이 주어지면 현재 변화와 사용자의 설명을 함께 고려하세요. 기준선은 유효 센서 측정값으로 계산하며 임의로 바꾸지 않습니다.',
            '최근 사용 기록이 있으면 같은 상황에서 완료하고 편안했다고 기록한 루틴을 우선 고려하세요. 데이터가 적으면 개인화 효과를 단정하지 마세요.',
          ].join('\n'),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              empathy: {
                type: Type.STRING,
                description: '사용자의 고민에 대한 따뜻한 한국어 공감 메시지 (2~3문장)',
              },
              routineKey: {
                type: Type.STRING,
                description: '반드시 "478", "box", "calm" 중 하나',
              },
              routineTitle: {
                type: Type.STRING,
                description: '처방된 호흡 루틴과 LED 컬러 제목',
              },
              reason: {
                type: Type.STRING,
                description: '추천 루틴이 도움이 되는 이유 1~2문장',
              },
            },
            required: ['empathy', 'routineKey', 'routineTitle', 'reason'],
          },
        },
      });

    try {
      let response;
      try {
        response = await callGemini();
      } catch (firstErr: unknown) {
        const firstStatus = (firstErr as {status?: number})?.status;
        if (firstStatus === 400 || firstStatus === 403 || firstStatus === 429) {
          throw firstErr;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        response = await callGemini();
      }

      const rawJson = (response.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(rawJson) as Partial<AiPrescriptionPayload>;
      const routineKey = normalizeRoutineKey(parsed.routineKey);

      const payload: AiPrescriptionPayload = {
        empathy:
          typeof parsed.empathy === 'string' && parsed.empathy.trim()
            ? parsed.empathy.trim()
            : '마음이 많이 쓰이셨겠어요. 잠시 꽃잎의 리듬에 맞춰 천천히 호흡하며 긴장을 내려놓아 볼까요?',
        routineKey,
        routineTitle:
          typeof parsed.routineTitle === 'string' && parsed.routineTitle.trim()
            ? parsed.routineTitle.trim()
            : DEFAULT_TITLES[routineKey],
        reason:
          typeof parsed.reason === 'string' && parsed.reason.trim()
            ? parsed.reason.trim()
            : '일정한 호흡 리듬은 자율신경계의 균형을 되찾아 심박과 긴장을 안정시키는 데 도움을 줍니다.',
      };

      res.json(payload);
    } catch (err: unknown) {
      const errorObj = err as {status?: number; message?: string};
      const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
      const errMessage = typeof errorObj?.message === 'string' ? errorObj.message : '';

      if (
        status === 400 ||
        status === 403 ||
        errMessage.includes('API_KEY_INVALID') ||
        errMessage.includes('PERMISSION_DENIED')
      ) {
        res.status(403).json({
          error: 'GEMINI_AUTH_ERROR',
          message:
            'Gemini API 키가 유효하지 않거나 권한이 없습니다. Settings > Secrets 패널에서 GEMINI_API_KEY를 확인해 주세요.',
        });
        return;
      }

      if (status === 429 || errMessage.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'GEMINI_QUOTA_EXCEEDED',
          message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      res.status(502).json({
        error: 'GEMINI_UPSTREAM_ERROR',
        message: 'AI 마음 케어 응답을 생성하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'API_NOT_FOUND',
      message: '요청한 API 경로를 찾을 수 없습니다.',
    });
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`BLOOMI server listening on http://0.0.0.0:${port}`);
  });
}

createApp();
