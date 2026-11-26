/*
 * BLOOMI 펌웨어 v5 — 웹(Web Serial) 연동용
 * (v4 기능 그대로: 심박 + GSR 기준선, 버튼 짧게=호흡 / 2초=기준선 초기화·측정)
 *
 * ── 웹으로 보내는 것 ───────────────────────────────────────
 * ① 0.5초마다 JSON 한 줄 (웹 App.tsx 의 JSON 파서가 bpm·gsrRaw 를 바로 읽음)
 *    {"bpm":74,"gsrRaw":1820,"base":87,"gsrBase":2810,"gsrPct":-4.2,
 *     "hrPt":0,"gsrPt":1,"level":0,"state":"G","session":0,"calibrating":0,"calibSec":0}
 *      bpm      지금 심박 (0 = 측정 안 됨)        gsrRaw   GSR 원래 값 (0~4095)
 *      base     심박 기준선 (0 = 없음)            gsrBase  GSR 기준선 (0 = 없음)
 *      gsrPct   GSR 기준 대비 변화율 % (음수 = 땀 ↑ = 긴장)
 *      hrPt/gsrPt  각 점수 0~2      level  0 초록 / 1 노랑 / 2 빨강
 *      state    N 손가락없음 M 측정중 G 초록 Y 노랑 R 빨강 B 호흡 C 기준선측정
 *      session  호흡 중이면 1       calibrating  기준선 측정 중이면 1    calibSec  측정 진행 초
 *    ※ "gsr"(0~100 긴장도)는 일부러 안 보냄 → 웹이 gsrRaw 로 직접 환산 (기존 화면과 같은 기준)
 *    ※ "buttonPressed" 도 안 보냄 → 웹이 버튼을 두 번 처리하는 충돌 방지
 *
 * ② 일이 생길 때 한 줄 (웹의 기존 문구 인식과 똑같은 문장)
 *    >>> 호흡 세션 시작 / >>> 호흡 세션 종료
 *    >>> 기준선 측정 시작 / >>> 기준선 측정 취소 / >>> 기준선 측정 실패
 *    >>> 기준선 저장 완료: 87 BPM / GSR 2810
 *
 * ── 웹에서 받는 명령 (줄바꿈으로 끝나는 글자) ──
 *    start  호흡 시작      stop   호흡 종료
 *    calib  기준선 초기화 + 30초 측정      cancel 기준선 측정 취소
 *    pattern:초,밝기,색;초,밝기,색;...   호흡 패턴 바꾸기 (최대 6단계)
 *        예) pattern:4,100,F4A6B8;7,15,B8B5E8;8,100,8FB996   (4-7-8 호흡)
 *        초 = 그 단계 길이(1~30), 밝기 = 그 단계 끝에 도달할 밝기(0~100), 색 = RRGGBB(생략 가능)
 *        각 단계 동안 "이전 단계 끝 밝기·색 → 이 단계 밝기·색"으로 서서히 변함
 *        호흡 중에 받으면 첫 단계부터 다시 시작. 전원 끄면 기본(4-2-6 분홍)으로 돌아감
 *    sync:단계번호,경과초      웹 화면의 현재 위치로 꽃을 맞춤 (예: sync:1,3 = 2번째 단계 3초 지점)
 *        웹이 호흡 중 1초마다 보내서 화면과 꽃이 어긋나지 않게 함 (출력 없음)
 *    시리얼 모니터 입력창에 직접 쳐서 테스트해도 돼요.
 *
 * 필요 라이브러리: Adafruit NeoPixel  /  보드: XIAO_ESP32C3
 * 배선: LED IN→D0, 맥박 S→D1(A1), GSR SIG→D2(A2), 버튼 D8↔GND (대각선 다리)
 * ⚠ 웹과 연결할 때는 Arduino IDE 시리얼 모니터를 꼭 닫기 (포트는 한 프로그램만 사용 가능)
 */
#include <Adafruit_NeoPixel.h>
#include <Preferences.h>

// ===== 여기 숫자만 바꾸면 기준이 바뀌어요 =====
const int RED_DIFF = 15, YELLOW_DIFF = 7;          // 심박: 기준선보다 이만큼 높으면 2점 / 1점
const float GSR_RED_PCT = 8.0, GSR_YELLOW_PCT = 3.0;  // GSR: 기준보다 이만큼(%) 내려가면 2점 / 1점
const uint32_t CALIB_MS = 30000;                   // 기준선 측정 시간
const int FIXED_RED = 100, FIXED_YELLOW = 85;      // 기준선 없을 때 심박 고정값
const int PULSE_MIN_AMP = 80;                      // 맥박 파형 최소 크기 (안 잡히면 50까지)
const uint32_t SEND_MS = 500;                      // JSON 보내는 간격
// ============================================

const int PIN_LED = D0, PIN_PULSE = A1, PIN_GSR = A2, PIN_BTN = D8;
const int NUM_LED = 7;
Adafruit_NeoPixel ring(NUM_LED, PIN_LED, NEO_GRB + NEO_KHZ800);
Preferences prefs;

// ================= 심박 검출 =================
float peak = 2048, trough = 2048;
bool above = false;
uint32_t lastBeat = 0, lastValidBeat = 0, beatFlash = 0;
int intervals[5]; int nInt = 0, idx = 0;
int bpm = 0;

void processPulse(int v, uint32_t now) {
  if (v > peak)   peak = v;   else peak   -= (peak - v) * 0.005f;
  if (v < trough) trough = v; else trough += (v - trough) * 0.005f;
  float amp = peak - trough;
  float thHigh = trough + amp * 0.6f, thLow = trough + amp * 0.4f;
  bool sane = (v > 100 && v < 4000 && amp > PULSE_MIN_AMP);
  if (!above && sane && v > thHigh) {
    above = true;
    uint32_t dt = now - lastBeat;
    if (lastBeat && dt >= 330 && dt <= 1500) {
      intervals[idx] = dt; idx = (idx + 1) % 5; if (nInt < 5) nInt++;
      long s = 0; for (int i = 0; i < nInt; i++) s += intervals[i];
      bpm = 60000 / (s / nInt);
      lastValidBeat = now; beatFlash = now;
    }
    lastBeat = now;
  }
  if (above && v < thLow) above = false;
  if (now - lastValidBeat > 3000) { bpm = 0; nInt = 0; }
}
bool hrReady() { return bpm > 0 && nInt >= 3; }

// ================= LED =================
float cr = 0, cg = 0, cb = 0;
void showColor(float r, float g, float b, float level) {
  cr += (r - cr) * 0.06f; cg += (g - cg) * 0.06f; cb += (b - cb) * 0.06f;
  for (int i = 0; i < NUM_LED; i++) ring.setPixelColor(i, cr * level, cg * level, cb * level);
  ring.show();
}
void flashAll(uint8_t r, uint8_t g, uint8_t b, int times) {
  for (int k = 0; k < times; k++) {
    for (int i = 0; i < NUM_LED; i++) ring.setPixelColor(i, r, g, b);
    ring.show(); delay(250);
    ring.clear(); ring.show(); delay(200);
  }
  cr = cg = cb = 0;
}

// ================= 상태 =================
int baseline = 0, gsrBase = 0;
float gsrNow = 0;
bool session = false; uint32_t sessionStart = 0, sessionBeganAt = 0;
uint8_t selectedRoutine = 0;
uint32_t completedCounts[3] = {0, 0, 0};
bool calibrating = false; uint32_t calibValidMs = 0; long calibSum = 0; int calibN = 0; double calibGsrSum = 0;
// ---- 호흡 패턴 (웹이 pattern: 명령으로 바꿀 수 있음) ----
struct Phase { uint32_t ms; uint8_t lv; uint8_t r, g, b; };
const int MAX_PHASES = 6;
Phase phases[MAX_PHASES] = {                       // 기본: 들숨 4초 밝아짐 → 2초 유지 → 날숨 6초 어두워짐
  {4000, 100, 255, 90, 130}, {2000, 100, 255, 90, 130}, {6000, 10, 255, 90, 130}};
int nPhases = 3;
uint32_t cycleMs() { uint32_t t = 0; for (int i = 0; i < nPhases; i++) t += phases[i].ms; return t; }

bool parsePattern(const char* text) {              // "4,100,F4A6B8;7,15,B8B5E8;8,100,8FB996"
  Phase tmp[MAX_PHASES]; int n = 0;
  char copy[160]; strncpy(copy, text, sizeof(copy) - 1); copy[sizeof(copy) - 1] = 0;
  char* save = nullptr;
  for (char* tok = strtok_r(copy, ";", &save); tok && n < MAX_PHASES; tok = strtok_r(nullptr, ";", &save)) {
    int sec = 0, lv = 0; unsigned int rgb = 0xFF5A82;   // 색 생략 시 분홍
    int got = sscanf(tok, "%d,%d,%x", &sec, &lv, &rgb);
    if (got < 2 || sec < 1 || sec > 30 || lv < 0 || lv > 100) return false;
    tmp[n++] = {(uint32_t)sec * 1000, (uint8_t)lv, (uint8_t)(rgb >> 16), (uint8_t)(rgb >> 8), (uint8_t)rgb};
  }
  if (n == 0) return false;
  for (int i = 0; i < n; i++) phases[i] = tmp[i];
  nPhases = n;
  prefs.putUChar("nphase", nPhases);
  prefs.putBytes("phases", phases, sizeof(Phase) * nPhases);
  return true;
}

void startSession() {
  if (session) return;
  calibrating = false;
  session = true; sessionStart = sessionBeganAt = millis();
  Serial.println(">>> 호흡 세션 시작");
}
void endSession(bool completed = false) {
  if (!session) return;
  session = false;
  if (completed) {
    completedCounts[selectedRoutine]++;
    prefs.putUInt(selectedRoutine == 0 ? "done478" : selectedRoutine == 1 ? "donebox" : "donecalm", completedCounts[selectedRoutine]);
  }
  Serial.println(completed ? ">>> 호흡 세션 종료 (완료)" : ">>> 호흡 세션 종료");
}
void startCalib() {
  Serial.printf(">>> 기준선 초기화 (이전 값: 심박 %d / GSR %d)\n", baseline, gsrBase);
  baseline = 0; gsrBase = 0;
  prefs.remove("base"); prefs.remove("gbase");
  flashAll(255, 255, 255, 2);                         // 흰색 2번 = 초기화
  session = false; calibrating = true;
  calibValidMs = 0; calibSum = 0; calibN = 0; calibGsrSum = 0;
  Serial.println(">>> 기준선 측정 시작 (30초, 검지는 심박 센서·중지/약지는 GSR 전극)");
}
void cancelCalib() {
  if (!calibrating) return;
  calibrating = false;
  Serial.println(">>> 기준선 측정 취소 (기준선 없음 → 고정값 85/100 사용)");
}
void finishCalib() {
  calibrating = false;
  if (calibN < 20) {
    Serial.println(">>> 기준선 측정 실패 (손가락이 자주 떨어짐) → 버튼 2초로 다시");
    flashAll(255, 30, 30, 2);
    return;
  }
  baseline = calibSum / calibN;
  gsrBase  = (int)(calibGsrSum / calibN);
  prefs.putInt("base", baseline); prefs.putInt("gbase", gsrBase);
  Serial.printf(">>> 기준선 저장 완료: %d BPM / GSR %d\n", baseline, gsrBase);   // 웹이 이 문장으로 기준선 인식
  flashAll(30, 220, 80, 3);
}

// ---- 시리얼로 들어온 명령 (웹 or 시리얼 모니터) ----
void readCommands() {
  static char buf[160]; static uint8_t n = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c != '\n') { if (n < sizeof(buf) - 1) buf[n++] = c; continue; }
    buf[n] = 0; n = 0;
    if      (!strcmp(buf, "start")) startSession();
    else if (!strcmp(buf, "stop"))  endSession();
    else if (!strcmp(buf, "complete")) endSession(true);
    else if (!strcmp(buf, "calib")) startCalib();
    else if (!strcmp(buf, "cancel")) cancelCalib();
    else if (!strcmp(buf, "routine:478")) { selectedRoutine = 0; prefs.putUChar("routine", 0); }
    else if (!strcmp(buf, "routine:box")) { selectedRoutine = 1; prefs.putUChar("routine", 1); }
    else if (!strcmp(buf, "routine:calm")) { selectedRoutine = 2; prefs.putUChar("routine", 2); }
    else if (!strncmp(buf, "sync:", 5)) {
      int ph = 0, el = 0;
      if (session && sscanf(buf + 5, "%d,%d", &ph, &el) == 2 && ph >= 0 && ph < nPhases && el >= 0) {
        uint32_t offset = 0;
        for (int i = 0; i < ph; i++) offset += phases[i].ms;
        offset += (uint32_t)el * 1000;
        if (offset < cycleMs()) sessionStart = millis() - offset;
      }
    }
    else if (!strncmp(buf, "pattern:", 8)) {
      if (parsePattern(buf + 8)) {
        if (session) sessionStart = sessionBeganAt = millis();
        Serial.printf("# 호흡 패턴 적용: %d단계, 한 바퀴 %lu초\n", nPhases, (unsigned long)(cycleMs() / 1000));
      } else {
        Serial.println("# 호흡 패턴 형식 오류 (예: pattern:4,100,F4A6B8;7,15,B8B5E8;8,100,8FB996)");
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(PIN_BTN, INPUT_PULLUP);
  ring.begin(); ring.setBrightness(90); ring.show();
  prefs.begin("bloomi", false);
  selectedRoutine = prefs.getUChar("routine", 0);
  if (selectedRoutine > 2) selectedRoutine = 0;
  completedCounts[0] = prefs.getUInt("done478", 0);
  completedCounts[1] = prefs.getUInt("donebox", 0);
  completedCounts[2] = prefs.getUInt("donecalm", 0);
  uint8_t savedPhaseCount = prefs.getUChar("nphase", 0);
  if (savedPhaseCount > 0 && savedPhaseCount <= MAX_PHASES &&
      prefs.getBytesLength("phases") == sizeof(Phase) * savedPhaseCount) {
    prefs.getBytes("phases", phases, sizeof(Phase) * savedPhaseCount);
    nPhases = savedPhaseCount;
  }
  baseline = prefs.getInt("base", 0);
  gsrBase  = prefs.getInt("gbase", 0);
  gsrNow   = analogRead(PIN_GSR);
  delay(1500);
  Serial.println("# BLOOMI 펌웨어 v5 (웹 연동 JSON)");
  if (baseline) Serial.printf("# 저장된 기준선: 심박 %d / GSR %d\n", baseline, gsrBase);
  else          Serial.println("# 기준선 없음 → 버튼 2초로 측정 (그 전엔 심박 85/100 고정값)");
}

void loop() {
  uint32_t now = millis();
  readCommands();
  if (session && now - sessionBeganAt >= cycleMs() * 4) endSession(true);

  // ---- 버튼 (50ms 동안 같은 값이어야 인정) : 짧게 = 호흡, 2초 = 기준선 ----
  static bool rawLast = false, pressed = false; static uint32_t rawFlipAt = 0;
  bool raw = digitalRead(PIN_BTN) == LOW;
  if (raw != rawLast) { rawLast = raw; rawFlipAt = now; }
  if (now - rawFlipAt > 50) pressed = raw;
  static bool btnDown = false, longFired = false; static uint32_t downAt = 0;
  if (pressed && !btnDown) { btnDown = true; downAt = now; longFired = false; }
  if (pressed && btnDown && !longFired && now - downAt >= 2000) { longFired = true; startCalib(); }
  if (!pressed && btnDown) {
    btnDown = false;
    if (!longFired) {
      if (calibrating) cancelCalib();
      else if (session) endSession();
      else startSession();
    }
  }

  // ---- 센서 (초당 100번, 잡음 필터) ----
  static uint32_t lastSample = 0; static float lp = 2048;
  if (now - lastSample >= 10) {
    lastSample = now;
    lp += (analogRead(PIN_PULSE) - lp) * 0.25f; processPulse((int)lp, now);
    gsrNow += (analogRead(PIN_GSR) - gsrNow) * 0.05f;
  }

  // ---- 기준선 측정: 0.5초마다 유효할 때만 모음 (손가락 떼면 시간 멈춤) ----
  static uint32_t lastCalibTick = 0;
  if (calibrating && now - lastCalibTick >= 500) {
    lastCalibTick = now;
    if (hrReady()) { calibSum += bpm; calibGsrSum += gsrNow; calibN++; calibValidMs += 500; }
    if (calibValidMs >= CALIB_MS) finishCalib();
  }

  // ---- 판단 + LED ----
  char st; int hrPt = 0, gsrPt = 0, level = 0, curPhase = -1; float gsrPct = 0;
  if (gsrBase > 0) gsrPct = (gsrNow - gsrBase) * 100.0f / gsrBase;
  if (calibrating) {
    st = 'C';
    int lit = (int)((float)calibValidMs / CALIB_MS * NUM_LED + 0.999f);
    bool blink = !hrReady() && (now / 400) % 2;
    for (int i = 0; i < NUM_LED; i++) {
      if (i < lit && !blink) ring.setPixelColor(i, 150, 40, 255);
      else if (i < lit)      ring.setPixelColor(i, 30, 8, 50);
      else                   ring.setPixelColor(i, 8, 2, 12);
    }
    ring.show();
  } else if (session) {
    st = 'B';
    // 지금 몇 번째 단계인지 찾고, 이전 단계 끝 → 이번 단계 목표로 서서히 변화
    uint32_t t = (now - sessionStart) % cycleMs();
    int i = 0;
    while (i < nPhases - 1 && t >= phases[i].ms) { t -= phases[i].ms; i++; }
    const Phase& cur = phases[i];
    const Phase& prev = phases[(i + nPhases - 1) % nPhases];
    float p = (float)t / cur.ms;
    float lv = (prev.lv + (cur.lv - prev.lv) * p) / 100.0f;
    float r = prev.r + (cur.r - prev.r) * p, g = prev.g + (cur.g - prev.g) * p, b = prev.b + (cur.b - prev.b) * p;
    curPhase = i;
    showColor(r, g, b, lv < 0.03f ? 0.03f : lv);  // 완전히 꺼지진 않게
  } else if (bpm == 0 && nInt == 0 && now - lastBeat > 3000) {
    st = 'N'; showColor(255, 255, 255, 0.12f);
  } else if (!hrReady()) {
    st = 'M'; showColor(40, 100, 255, (now / 300) % 2 ? 0.6f : 0.15f);
  } else {
    if (baseline) {
      int d = bpm - baseline;
      hrPt  = d >= RED_DIFF ? 2 : (d >= YELLOW_DIFF ? 1 : 0);
      float drop = -gsrPct;
      gsrPt = gsrBase ? (drop >= GSR_RED_PCT ? 2 : (drop >= GSR_YELLOW_PCT ? 1 : 0)) : 0;
      int total = hrPt + gsrPt;
      level = total >= 3 ? 2 : (total == 2 ? 1 : 0);
    } else {
      level = bpm >= FIXED_RED ? 2 : (bpm >= FIXED_YELLOW ? 1 : 0);
    }
    float lv = (now - beatFlash < 120) ? 1.0f : 0.55f;
    if (level == 2)      { st = 'R'; showColor(255, 25, 25, lv); }
    else if (level == 1) { st = 'Y'; showColor(255, 160, 0, lv); }
    else                 { st = 'G'; showColor(30, 220, 80, lv); }
  }

  // ---- 0.5초마다 JSON 한 줄 ----
  static uint32_t lastSend = 0;
  if (now - lastSend >= SEND_MS) {
    lastSend = now;
    Serial.printf("{\"bpm\":%d,\"gsrRaw\":%d,\"base\":%d,\"gsrBase\":%d,\"gsrPct\":%.1f,"
                  "\"hrPt\":%d,\"gsrPt\":%d,\"level\":%d,\"state\":\"%c\","
                  "\"session\":%d,\"calibrating\":%d,\"calibSec\":%d,\"phase\":%d,\"routine\":%u,\"done478\":%lu,\"doneBox\":%lu,\"doneCalm\":%lu}\n",
                  bpm, (int)gsrNow, baseline, gsrBase, gsrPct,
                  hrPt, gsrPt, level, st,
                  session ? 1 : 0, calibrating ? 1 : 0, (int)(calibValidMs / 1000), curPhase, selectedRoutine,
                  (unsigned long)completedCounts[0], (unsigned long)completedCounts[1], (unsigned long)completedCounts[2]);
  }
  delay(2);
}
