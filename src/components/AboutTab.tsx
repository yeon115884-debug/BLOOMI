export function AboutTab() {
  return (
    <section className="space-y-8">
      {/* 1.1 기획 배경 및 문제 정의 */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-soft space-y-6">
        <div className="max-w-3xl">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-blush-light text-blush-dark">
            1.1 기획 배경 및 문제 정의
          </span>
          <h2 className="text-2xl font-bold text-charcoal mt-3">
            스마트폰 화면을 보지 않고도, 손끝에서 피어나는 호흡 리듬
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed mt-3">
            시험·면접을 앞둔 수험생뿐 아니라 현대인들은 업무 스트레스, 인간관계, 미래에 대한 고민 등으로 일상에서 지속적인 긴장과 심리적 부담을 경험합니다. 기존 명상 및 호흡 관리 서비스는 대부분 스마트폰 앱 기반이어서{' '}
            <strong>직접 앱을 실행해야 하는 번거로움</strong>과{' '}
            <strong>화면 알림에 의한 주의 분산</strong>이 발생합니다.
          </p>
        </div>

        {/* 3 Core Pillars: Physical, AI, Data */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-5 rounded-2xl bg-blush-light/45 border border-blush/30 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-blush text-white flex items-center justify-center font-bold">
              P
            </div>
            <h3 className="font-bold text-base text-charcoal">Physical (촉각·시각 디바이스)</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              꽃 형태의 소형 LED 키링 디바이스로 스마트폰 없이 버튼 한 번만 눌러 호흡 리듬을 직관적으로 안내합니다.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-lavender-light/55 border border-lavender/40 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-lavender-dark text-white flex items-center justify-center font-bold">
              AI
            </div>
            <h3 className="font-bold text-base text-charcoal">AI (감정 공감 & 맞춤 처방)</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              사용자의 고민을 듣고 현재 심리·생체 상태에 가장 적합한 호흡 리듬과 휴식 루틴을 제안합니다.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-sage-light/55 border border-sage/40 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-sage-dark text-white flex items-center justify-center font-bold">
              D
            </div>
            <h3 className="font-bold text-base text-charcoal">Data (생체신호 & 습관 리포트)</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              심박(PPG)·피부전기반응(GSR) 측정값과 주관적 마음 상태를 분석해 개인화된 웰니스 경험을 제공합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 1.2 핵심 가치 5가지 */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-soft">
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-sage-light text-sage-dark">
          1.2 BLOOMI 핵심 가치
        </span>
        <h2 className="text-xl font-bold text-charcoal mt-3 mb-5">
          일상 속 지속 가능한 웰니스를 위한 5가지 설계 원칙
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-2xl bg-white border border-stone-200/80">
            <span className="text-xs font-bold text-blush-dark">01. 접근성</span>
            <p className="font-bold text-sm text-charcoal mt-1">원터치 즉시 호흡</p>
            <p className="text-xs text-stone-500 mt-1">
              스마트폰을 켜지 않고 측면 버튼만 눌러 즉시 호흡 시작
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-stone-200/80">
            <span className="text-xs font-bold text-lavender-dark">02. 개인화</span>
            <p className="font-bold text-sm text-charcoal mt-1">감정 맞춤 루틴</p>
            <p className="text-xs text-stone-500 mt-1">
              입력한 감정과 생체 기록에 최적화된 호흡 주기 추천
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-stone-200/80">
            <span className="text-xs font-bold text-sage-dark">03. 휴대성</span>
            <p className="font-bold text-sm text-charcoal mt-1">초소형 키링 폼팩터</p>
            <p className="text-xs text-stone-500 mt-1">
              지름 55mm 내외로 가방·파우치에 가볍게 부착
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-stone-200/80">
            <span className="text-xs font-bold text-amber-600">04. 감성적 가치</span>
            <p className="font-bold text-sm text-charcoal mt-1">교체형 꽃잎 커버</p>
            <p className="text-xs text-stone-500 mt-1">
              취향에 따라 꽃잎 하우징을 바꾸는 패션 액세서리
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-stone-200/80">
            <span className="text-xs font-bold text-charcoal">05. 지속성</span>
            <p className="font-bold text-sm text-charcoal mt-1">AI + 데이터 습관화</p>
            <p className="text-xs text-stone-500 mt-1">
              일회성 안내를 넘어 AI 대화와 기록 기반 습관 형성
            </p>
          </div>
        </div>
      </div>

      {/* Team Breadboard & Pinout Reference Card */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-soft grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 space-y-4">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-lavender-light text-lavender-dark">
            Hardware Prototype Architecture
          </span>
          <h2 className="text-xl font-bold text-charcoal">
            Seeed Studio XIAO ESP32-C3 브레드보드 & 키링 배선 사양
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            우리 팀의 브레드보드 회로 설계를 그대로 반영하여 Web Serial 통신 시 아래 핀 맵과 1:1로 연동됩니다.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2.5 px-3">부품명</th>
                  <th className="py-2.5 px-3">브레드보드 위치</th>
                  <th className="py-2.5 px-3">XIAO 핀</th>
                  <th className="py-2.5 px-3">역할</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr>
                  <td className="py-2.5 px-3 font-bold">7 × WS2812 RGB LED 링</td>
                  <td className="py-2.5 px-3">5행 a (파랑 DIN)</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-600">D0</td>
                  <td className="py-2.5 px-3 text-stone-600">미세 틈새 확산 호흡 LED</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">심박 측정 센서 (PPG)</td>
                  <td className="py-2.5 px-3">6행 a (보라 S)</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-purple-600">D1 / A1</td>
                  <td className="py-2.5 px-3 text-stone-600">꽃잎 중앙 노출 검지 심박 측정</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">Grove - GSR 센서</td>
                  <td className="py-2.5 px-3">7행 a (노랑 SIG)</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-amber-600">D2 / A2</td>
                  <td className="py-2.5 px-3 text-stone-600">중지·약지 피부 전기 반응(긴장도)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">택트 스위치</td>
                  <td className="py-2.5 px-3">20행 j → 10행 j</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">D8</td>
                  <td className="py-2.5 px-3 text-stone-600">원터치 호흡 모드 시작/전환</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SVG Breadboard Mini Diagram */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-4 border border-stone-200/80 flex flex-col items-center">
          <p className="text-xs font-bold text-charcoal mb-2">
            팀 회로 배선 요약도 (XIAO ESP32-C3)
          </p>
          <svg viewBox="0 0 320 220" className="w-full max-w-xs" aria-label="XIAO ESP32-C3 회로 배선도">
            <rect
              x="95"
              y="15"
              width="130"
              height="190"
              rx="12"
              fill="#F5F3EF"
              stroke="#D6D1C9"
              strokeWidth="2"
            />
            <rect x="156" y="15" width="8" height="190" fill="#E5E0D8" />
            <rect x="115" y="35" width="90" height="85" rx="8" fill="#2C2A2E" />
            <rect x="145" y="27" width="30" height="14" rx="3" fill="#B8B2AA" />
            <text x="160" y="76" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
              XIAO
            </text>
            <text x="160" y="90" textAnchor="middle" fill="#A8A29E" fontSize="8">
              ESP32-C3
            </text>

            <circle cx="35" cy="48" r="16" fill="#FDECEF" stroke="#F4A6B8" strokeWidth="2" />
            <text x="35" y="51" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#2C2A2E">
              LED
            </text>
            <path d="M51 48 Q85 48 115 48" stroke="#3B82F6" strokeWidth="2.5" fill="none" />
            <text x="82" y="42" fontSize="8" fill="#2563EB" fontWeight="bold">
              D0 (5행)
            </text>

            <circle cx="35" cy="95" r="16" fill="#EDF5EE" stroke="#8FB996" strokeWidth="2" />
            <text x="35" y="98" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#2C2A2E">
              심박
            </text>
            <path d="M51 95 Q85 75 115 66" stroke="#8B5CF6" strokeWidth="2.5" fill="none" />
            <text x="76" y="72" fontSize="8" fill="#7C3AED" fontWeight="bold">
              A1 (6행)
            </text>

            <circle cx="35" cy="145" r="16" fill="#F2F1FC" stroke="#B8B5E8" strokeWidth="2" />
            <text x="35" y="148" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#2C2A2E">
              GSR
            </text>
            <path d="M51 145 Q85 110 115 84" stroke="#EAB308" strokeWidth="2.5" fill="none" />
            <text x="76" y="128" fontSize="8" fill="#CA8A04" fontWeight="bold">
              A2 (7행)
            </text>

            <rect
              x="138"
              y="145"
              width="44"
              height="32"
              rx="6"
              fill="#E7E5E4"
              stroke="#78716C"
              strokeWidth="1.5"
            />
            <circle cx="160" cy="161" r="8" fill="#FFFFFF" stroke="#78716C" strokeWidth="1.5" />
            <path d="M182 161 Q235 161 205 102" stroke="#10B981" strokeWidth="2.5" fill="none" />
            <text x="235" y="135" fontSize="8" fill="#059669" fontWeight="bold">
              D8 (10행)
            </text>
          </svg>
          <p className="text-[11px] text-stone-500 text-center mt-1">
            시리얼 출력 포맷 예시:{' '}
            <code className="bg-stone-100 px-1.5 py-0.5 rounded text-charcoal font-mono">
              BPM:76,GSR:42,BTN:1
            </code>
          </p>
        </div>
      </div>
    </section>
  );
}
