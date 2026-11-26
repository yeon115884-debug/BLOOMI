import {useEffect, useMemo, useRef} from 'react';
import {Trash2} from 'lucide-react';
import type {WellnessSessionLog} from '../types/bloomi';

interface ReportTabProps {
  logs: WellnessSessionLog[];
  deviceCompleted: [number, number, number] | null;
  onClearLogs: () => void;
  onGoToStudio: () => void;
}

const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export function ReportTab({logs, deviceCompleted, onClearLogs, onGoToStudio}: ReportTabProps) {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const stats = useMemo(() => {
    const totalCount = logs.length;
    if (totalCount === 0) {
      return {
        totalCount: 0,
        avgBefore: null as number | null,
        avgAfter: null as number | null,
        avgDelta: null as number | null,
        gsrReductionPct: null as number | null,
        topRoutine: null as string | null,
        topRoutineCount: 0,
        dailyAverages: WEEK_DAYS.map(() => ({before: null as number | null, after: null as number | null})),
      };
    }

    const avgBefore = Math.round(
      logs.reduce((acc, item) => acc + item.bpmBefore, 0) / totalCount,
    );
    const avgAfter = Math.round(
      logs.reduce((acc, item) => acc + item.bpmAfter, 0) / totalCount,
    );
    const avgDelta = avgAfter - avgBefore;

    const gsrLogs = logs.filter(
      (item) =>
        typeof item.gsrBefore === 'number' &&
        typeof item.gsrAfter === 'number' &&
        item.gsrBefore > 0,
    );
    const gsrReductionPct =
      gsrLogs.length > 0
        ? Math.round(
            gsrLogs.reduce(
              (acc, item) =>
                acc + (((item.gsrAfter ?? 0) - (item.gsrBefore ?? 1)) / (item.gsrBefore ?? 1)) * 100,
              0,
            ) / gsrLogs.length,
          )
        : null;

    const routineCounts = new Map<string, number>();
    logs.forEach((item) => {
      routineCounts.set(item.routine, (routineCounts.get(item.routine) ?? 0) + 1);
    });
    let topRoutine: string | null = null;
    let topRoutineCount = 0;
    routineCounts.forEach((count, name) => {
      if (count > topRoutineCount) {
        topRoutineCount = count;
        topRoutine = name;
      }
    });

    // Aggregate real logs by weekday (Mon=0 ... Sun=6)
    const buckets: Array<{beforeSum: number; afterSum: number; count: number}> = WEEK_DAYS.map(
      () => ({beforeSum: 0, afterSum: 0, count: 0}),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    logs.forEach((item) => {
      if (!item.createdAt) return;
      const date = new Date(item.createdAt);
      if (date < weekStart || date.getTime() >= today.getTime() + 86400000) return;
      const jsDay = date.getDay(); // 0=Sun, 1=Mon ... 6=Sat
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      buckets[idx].beforeSum += item.bpmBefore;
      buckets[idx].afterSum += item.bpmAfter;
      buckets[idx].count += 1;
    });

    const dailyAverages = buckets.map((b) =>
      b.count > 0
        ? {
            before: Math.round(b.beforeSum / b.count),
            after: Math.round(b.afterSum / b.count),
          }
        : {before: null, after: null},
    );

    return {
      totalCount,
      avgBefore,
      avgAfter,
      avgDelta,
      gsrReductionPct,
      topRoutine,
      topRoutineCount,
      dailyAverages,
    };
  }, [logs]);

  useEffect(() => {
    const drawWeeklyChart = () => {
      const canvas = chartCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const padding = 28;
      const chartW = w - padding * 2;
      const chartH = h - padding * 1.6;
      const groupW = chartW / WEEK_DAYS.length;
      const barW = Math.min(16, groupW * 0.28);

      // Baseline
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, h - padding);
      ctx.lineTo(w - padding, h - padding);
      ctx.stroke();

      WEEK_DAYS.forEach((day, i) => {
        const cx = padding + i * groupW + groupW / 2;
        const entry = stats.dailyAverages[i];

        if (entry.before !== null && entry.after !== null) {
          const hBefore = Math.max(8, Math.min(chartH, ((entry.before - 45) / 70) * chartH));
          ctx.fillStyle = '#F4A6B8';
          ctx.beginPath();
          ctx.roundRect(cx - barW - 2, h - padding - hBefore, barW, hBefore, 5);
          ctx.fill();

          const hAfter = Math.max(8, Math.min(chartH, ((entry.after - 45) / 70) * chartH));
          ctx.fillStyle = '#8FB996';
          ctx.beginPath();
          ctx.roundRect(cx + 2, h - padding - hAfter, barW, hAfter, 5);
          ctx.fill();
        }

        ctx.fillStyle = '#78716C';
        ctx.font = '11px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day, cx, h - 8);
      });
    };

    drawWeeklyChart();
    window.addEventListener('resize', drawWeeklyChart);
    return () => window.removeEventListener('resize', drawWeeklyChart);
  }, [stats.dailyAverages]);

  return (
    <section className="space-y-6">
      {deviceCompleted && (
        <div className="glass-card rounded-3xl p-5 shadow-soft text-sm text-charcoal">
          키링에 저장된 완료 횟수: {deviceCompleted.reduce((sum, count) => sum + count, 0)}회
          <span className="block text-xs text-stone-500 mt-1">
            4-7-8 {deviceCompleted[0]}회 · 박스 {deviceCompleted[1]}회 · 5-5 {deviceCompleted[2]}회. 기기 단독 사용도 포함하며, 시각·전후 센서값이 없어 아래 웹 기록과 별도로 표시합니다.
          </span>
        </div>
      )}
      {/* Top Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-3xl p-5 shadow-soft">
          <span className="text-xs font-medium text-stone-500">누적 호흡 연습</span>
          <p className="text-2xl sm:text-3xl font-bold text-charcoal mt-1 tabular-nums">
            {stats.totalCount}회
          </p>
          <span className="text-[11px] font-semibold text-sage-dark mt-1 inline-block">
            {stats.totalCount > 0 ? '실시간 기록 누적 중' : '기록을 시작해 보세요'}
          </span>
        </div>

        <div className="glass-card rounded-3xl p-5 shadow-soft">
          <span className="text-xs font-medium text-stone-500">평균 심박수 안정 효과</span>
          <p className="text-2xl sm:text-3xl font-bold text-blush-dark mt-1 tabular-nums">
            {stats.avgDelta !== null ? `${stats.avgDelta > 0 ? '+' : ''}${stats.avgDelta} BPM` : '-'}
          </p>
          <span className="text-[11px] text-stone-500 mt-1 inline-block tabular-nums">
            {stats.avgBefore !== null && stats.avgAfter !== null
              ? `호흡 전 ${stats.avgBefore} → 후 ${stats.avgAfter} BPM`
              : '기록 후 자동 계산됩니다'}
          </span>
        </div>

        <div className="glass-card rounded-3xl p-5 shadow-soft">
          <span className="text-xs font-medium text-stone-500">GSR 긴장도 변화율</span>
          <p className="text-2xl sm:text-3xl font-bold text-lavender-dark mt-1 tabular-nums">
            {stats.gsrReductionPct !== null
              ? `${stats.gsrReductionPct > 0 ? '+' : ''}${stats.gsrReductionPct}%`
              : '-'}
          </p>
          <span className="text-[11px] text-stone-500 mt-1 inline-block">
            {stats.gsrReductionPct !== null ? '피부 전기 반응 기준' : '기록 후 자동 계산됩니다'}
          </span>
        </div>

        <div className="glass-card rounded-3xl p-5 shadow-soft">
          <span className="text-xs font-medium text-stone-500">가장 자주 사용한 루틴</span>
          <p className="text-xl sm:text-2xl font-bold text-charcoal mt-1">
            {stats.topRoutine ?? '기록 없음'}
          </p>
          <span className="text-[11px] text-sage-dark mt-1 inline-block">
            {stats.topRoutineCount > 0 ? `${stats.topRoutineCount}회 기록됨` : '루틴 실행 후 표시'}
          </span>
        </div>
      </div>

      {/* Weekly Chart & Session Log Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Trend Chart (6 cols) */}
        <div className="lg:col-span-6 glass-card rounded-3xl p-6 shadow-soft flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-base text-charcoal">
              주간 호흡 전·후 심박수 변화
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              최근 7일 호흡 전(분홍)과 기록 시점(세이지 민트)의 요일별 평균 심박수 비교
            </p>
          </div>
          <div className="relative w-full h-56 mt-4">
            <canvas ref={chartCanvasRef} className="w-full h-full" />
            {logs.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-6">
                <p className="text-xs text-stone-400 bg-white/85 px-3 py-1.5 rounded-xl border border-stone-200/60">
                  기록된 세션이 추가되면 요일별 그래프가 표시됩니다
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-6 mt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blush" />
              호흡 전 평균 BPM
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-sage" />
              호흡 후 안정 BPM
            </span>
          </div>
        </div>

        {/* Recent Session History List (6 cols) */}
        <div className="lg:col-span-6 glass-card rounded-3xl p-6 shadow-soft flex flex-col">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h3 className="font-bold text-base text-charcoal">최근 호흡 & 감정 체크인 기록</h3>
              <p className="text-xs text-stone-500">
                실시간 스튜디오에서 기록한 내역이 브라우저에 영구 저장됩니다
              </p>
            </div>
            {logs.length > 0 && (
              <button
                type="button"
                onClick={onClearLogs}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-stone-100 hover:bg-rose-50 hover:text-rose-700 text-stone-600 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                title="저장된 기록 모두 삭제"
              >
                <Trash2 className="w-3 h-3" />
                <span>전체 삭제</span>
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 rounded-2xl bg-stone-50/80 border border-dashed border-stone-200 space-y-3">
              <p className="text-sm font-semibold text-charcoal">아직 저장된 호흡 기록이 없어요</p>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                실시간 호흡 스튜디오에서 호흡을 마친 뒤 아래 마음 상태 버튼을 누르면 나만의 기록이 차곡차곡 쌓입니다.
              </p>
              <button
                type="button"
                onClick={onGoToStudio}
                className="px-4 py-2 rounded-xl bg-charcoal hover:bg-stone-800 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                호흡 스튜디오로 이동하기
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
              {logs.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/70 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-charcoal">{item.routine}</span>
                      <span className="text-[11px] text-stone-400 tabular-nums">{item.time}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 tabular-nums">
                      심박 변화: <strong>{item.bpmBefore}</strong> →{' '}
                      <strong className="text-sage-dark">{item.bpmAfter} BPM</strong>
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cream border border-stone-200 text-charcoal shrink-0 whitespace-nowrap">
                    {item.mood}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
