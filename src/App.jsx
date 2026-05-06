import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { DrumDogScene } from "./DrumDogScene.jsx";
import { RHYTHM_PLAYLIST } from "./rhythmPlaylist.js";

const BG_PALETTE = [
  "#ff6b6b",
  "#4ecdc4",
  "#ffe66d",
  "#a29bfe",
  "#fd79a8",
  "#00cec9",
  "#fab1a0",
  "#6c5ce7",
  "#55efc4",
  "#fdcb6e",
  "#e17055",
  "#74b9ff",
];

function pickBackground(exclude) {
  let c = BG_PALETTE[Math.floor(Math.random() * BG_PALETTE.length)];
  if (BG_PALETTE.length > 1) {
    let guard = 0;
    while (c === exclude && guard++ < 12) {
      c = BG_PALETTE[Math.floor(Math.random() * BG_PALETTE.length)];
    }
  }
  return c;
}

const APPROACH_MS = 1450;
const HIT_WINDOW_MS = 170;
const CHART_LENGTH_MS = 120000;
const RHYTHM_HIGHSCORE_KEY = "drumdog-rhythm-highscore";
const RHYTHM_SYNC_KEY = "drumdog-rhythm-sync-ms";
const JUDGE_SCORE = {
  PERFECT: 300,
  GREAT: 180,
  GOOD: 100,
  MISS: 0,
};

const DIFFICULTY = {
  EASY: "easy",
  NORMAL: "normal",
  HARD: "hard",
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function trackUrl(t) {
  if (!t) return "";
  const base = import.meta.env.BASE_URL || "/";
  const baseFixed = base.endsWith("/") ? base : `${base}/`;
  if (t.url) return t.url;
  if (t.fileName) return `${baseFixed}music/${encodeURIComponent(t.fileName)}`;
  return "";
}

function buildChartForTrack({ bpm, offsetMs = 900, title }, difficulty) {
  const beatMs = 60000 / Math.max(40, bpm || 120);
  const seed = hashStringToSeed(`${title}|${bpm}|${difficulty}`);
  const rnd = mulberry32(seed);

  // "SuperStar-like" feel: quantized grid + strong downbeats + repeating motifs.
  // We can't extract melody from audio here, so we bias patterns to musically common placements.
  const notes = [];
  let id = 0;
  const t0 = Math.max(0, offsetMs);

  const gridBeats =
    difficulty === DIFFICULTY.EASY ? 1 : difficulty === DIFFICULTY.NORMAL ? 1 / 2 : 1 / 2; // 1/4 or 1/8
  const baseStep = beatMs * gridBeats;

  const motifSet =
    difficulty === DIFFICULTY.EASY
      ? [
          // 4 steps (quarters)
          "x---",
          "x-x-",
          "xx--",
        ]
      : [
          // 8 steps (8ths) per bar
          "x---x---", // strong beats
          "x-x-x-x-", // steady groove
          "x--x--x-", // sync-ish
          "x-xx-xx-", // chorus-ish
          "x---xx--", // small fill
        ];

  const densityBoost =
    difficulty === DIFFICULTY.EASY ? 0.0 : difficulty === DIFFICULTY.NORMAL ? 0.08 : 0.16;
  const doubleChance =
    difficulty === DIFFICULTY.EASY ? 0.0 : difficulty === DIFFICULTY.NORMAL ? 0.035 : 0.06;

  let lane = "left";
  const bars = Math.ceil((CHART_LENGTH_MS - t0) / (beatMs * 4));

  for (let b = 0; b < bars; b += 1) {
    const barStart = t0 + b * beatMs * 4;
    const motif = motifSet[Math.floor(rnd() * motifSet.length)];
    const steps = motif.length;
    const stepMs = (beatMs * 4) / steps;

    // Occasionally make the bar denser on non-easy to mimic chorus sections.
    const isHotBar = difficulty !== DIFFICULTY.EASY && rnd() < 0.22;
    const extraKeep = isHotBar ? 0.12 + densityBoost : densityBoost;

    for (let s = 0; s < steps; s += 1) {
      const ch = motif[s];
      const t = barStart + s * stepMs;
      if (t < 0 || t > CHART_LENGTH_MS) continue;

      const isStrongStep = s === 0 || s === Math.floor(steps / 2);
      const keep = ch === "x" || (isStrongStep && rnd() < 0.9) || rnd() < extraKeep;
      if (!keep) continue;

      // Mostly alternate lanes; occasionally repeat for "hold-ish" feel.
      const flipBias = difficulty === DIFFICULTY.EASY ? 0.92 : difficulty === DIFFICULTY.NORMAL ? 0.86 : 0.78;
      if (rnd() < flipBias) lane = lane === "left" ? "right" : "left";

      notes.push({ id: id++, lane, time: Math.round(t) });

      // Small doubles (like quick tap) on hot bars / hard
      if (rnd() < doubleChance) {
        notes.push({
          id: id++,
          lane,
          time: Math.round(t + Math.min(95, baseStep * 0.35)),
        });
      }
    }

    // Tiny breath between some bars (keeps it musical)
    if (difficulty !== DIFFICULTY.EASY && rnd() < 0.06) {
      // skip one 8th
      const skipT = barStart + beatMs * 4 + baseStep;
      // no-op: the next bar start handles it; this just changes feel via missed placements
      void skipT;
    }
  }

  return notes;
}

export default function App() {
  const [bg, setBg] = useState("#ffffff");
  const [showKeyHints, setShowKeyHints] = useState(false);
  const [flatTapButtons, setFlatTapButtons] = useState(false);
  const drumControlsRef = useRef(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(DIFFICULTY.NORMAL);
  const [track, setTrack] = useState(() => RHYTHM_PLAYLIST[0] || null);
  const chart = useMemo(() => {
    if (!track) return [];
    return buildChartForTrack(track, selectedDifficulty);
  }, [selectedDifficulty, track]);
  const hitSetRef = useRef(new Set());
  const missCursorRef = useRef(0);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStartedRef = useRef(false);
  const rhythmBgmRef = useRef(null);
  const [bgmTrackTitle, setBgmTrackTitle] = useState(null);
  const [timeMs, setTimeMs] = useState(0);
  const startAtRef = useRef(0);
  const nowRef = useRef(0);
  const [score, setScore] = useState(0);
  const [maxRhythmCombo, setMaxRhythmCombo] = useState(0);
  const [rhythmCombo, setRhythmCombo] = useState(0);
  const [judge, setJudge] = useState(null);
  const judgeTimerRef = useRef(0);
  const [laneFx, setLaneFx] = useState({ left: 0, right: 0 });
  const [rhythmResult, setRhythmResult] = useState(null);
  const idleEndHandledRef = useRef(false);
  const lastPickRef = useRef(null);
  const scoreRef = useRef(0);
  const maxRhythmComboRef = useRef(0);
  const [syncMs, setSyncMs] = useState(() => {
    try {
      return Number(localStorage.getItem(RHYTHM_SYNC_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const syncMsRef = useRef(0);
  const [rhythmHighScore, setRhythmHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem(RHYTHM_HIGHSCORE_KEY) || 0);
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    return () => {
      rhythmBgmRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    syncMsRef.current = syncMs;
    try {
      localStorage.setItem(RHYTHM_SYNC_KEY, String(syncMs));
    } catch {
      // ignore
    }
  }, [syncMs]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const sync = () => setShowKeyHints(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setFlatTapButtons(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onDrumControlsReady = useCallback((api) => {
    drumControlsRef.current = api;
  }, []);

  const stopRhythmBgm = useCallback(() => {
    const a = rhythmBgmRef.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
      a.currentTime = 0;
    }
    setBgmTrackTitle(null);
  }, []);

  const endRhythmGame = useCallback(() => {
    if (idleEndHandledRef.current) return;
    idleEndHandledRef.current = true;
    if (judgeTimerRef.current) {
      clearTimeout(judgeTimerRef.current);
      judgeTimerRef.current = 0;
    }
    setJudge(null);
    gameStartedRef.current = false;
    stopRhythmBgm();
    setRhythmResult({
      score: scoreRef.current,
      maxCombo: maxRhythmComboRef.current,
      id: Date.now(),
    });
    setGameStarted(false);
  }, [stopRhythmBgm]);

  const resetRhythmGame = useCallback(() => {
    gameStartedRef.current = false;
    idleEndHandledRef.current = false;
    lastPickRef.current = null;
    stopRhythmBgm();
    setScore(0);
    setRhythmCombo(0);
    setMaxRhythmCombo(0);
    setJudge(null);
    setTimeMs(0);
    nowRef.current = 0;
    startAtRef.current = 0;
    missCursorRef.current = 0;
    hitSetRef.current.clear();
    setGameStarted(false);
    setRhythmResult(null);
    idleEndHandledRef.current = false;
    if (judgeTimerRef.current) {
      clearTimeout(judgeTimerRef.current);
      judgeTimerRef.current = 0;
    }
  }, [stopRhythmBgm]);

  const startRhythmRun = useCallback(
    (pick) => {
      const resolved = pick || track || RHYTHM_PLAYLIST[0];
      if (!resolved) return;
      lastPickRef.current = resolved;
      if (resolved) setTrack(resolved);

      stopRhythmBgm();
      hitSetRef.current.clear();
      missCursorRef.current = 0;
      setScore(0);
      setRhythmCombo(0);
      setMaxRhythmCombo(0);
      setJudge(null);
      setRhythmResult(null);
      idleEndHandledRef.current = false;
      setTimeMs(0);
      nowRef.current = 0;

      if (!rhythmBgmRef.current) rhythmBgmRef.current = new Audio();
      const a = rhythmBgmRef.current;
      a.src = trackUrl(resolved);
      a.volume = 0.34;
      a.loop = false;
      a.onended = () => endRhythmGame();
      a.onerror = () => {
        setBgmTrackTitle("음악 파일을 public/music/에 넣어줘!");
      };
      setBgmTrackTitle(resolved.title || null);

      // Start the timer when audio actually starts (reduces A/V drift).
      const begin = () => {
        const t0 = performance.now();
        startAtRef.current = t0;
        gameStartedRef.current = true;
        setGameStarted(true);
      };
      a.onplay = () => begin();
      void a.play()
        .then(() => {
          // Some browsers may not fire onplay reliably; ensure start.
          if (!gameStartedRef.current) begin();
        })
        .catch(() => {
          // If autoplay is blocked, still start so user can test lanes.
          if (!gameStartedRef.current) begin();
        });
    },
    [endRhythmGame, stopRhythmBgm, track]
  );

  const retryRhythmRun = useCallback(() => {
    const pick = lastPickRef.current || track || RHYTHM_PLAYLIST[0];
    setRhythmResult(null);
    startRhythmRun(pick);
  }, [startRhythmRun, track]);

  const backToSongSelect = useCallback(() => {
    resetRhythmGame();
  }, [resetRhythmGame]);

  const onDrumHit = useCallback(() => {
    if (!gameStartedRef.current) {
      setBg((prev) => pickBackground(prev));
      return;
    }
    setBg((prev) => pickBackground(prev));
  }, []);

  const flashLane = useCallback((lane) => {
    setLaneFx((prev) => ({ ...prev, [lane]: Date.now() }));
  }, []);

  const showJudge = useCallback((kind, deltaMs = 0) => {
    if (judgeTimerRef.current) {
      clearTimeout(judgeTimerRef.current);
    }
    const abs = Math.abs(deltaMs);
    const text =
      kind === "PERFECT"
        ? "PERFECT!"
        : kind === "GREAT"
          ? "GREAT!"
          : kind === "GOOD"
            ? "GOOD!"
            : "MISS";
    setJudge({ kind, text, delta: abs, id: Date.now() });
    judgeTimerRef.current = window.setTimeout(() => setJudge(null), 520);
  }, []);

  const onLaneInput = useCallback(
    (lane) => {
      flashLane(lane);
      if (!gameStarted) {
        startRhythmRun(track || RHYTHM_PLAYLIST[0]);
        return;
      }

      const t = nowRef.current + syncMsRef.current;
      let bestNote = null;
      let bestDelta = Infinity;
      for (let i = 0; i < chart.length; i += 1) {
        const n = chart[i];
        if (n.lane !== lane) continue;
        if (hitSetRef.current.has(n.id)) continue;
        const delta = n.time - t;
        const abs = Math.abs(delta);
        if (abs <= HIT_WINDOW_MS && abs < bestDelta) {
          bestDelta = abs;
          bestNote = n;
        }
      }

      if (!bestNote) {
        showJudge("MISS");
        setRhythmCombo(0);
        return;
      }

      hitSetRef.current.add(bestNote.id);
      const abs = Math.abs(bestNote.time - t);
      let kind = "GOOD";
      if (abs <= 55) kind = "PERFECT";
      else if (abs <= 105) kind = "GREAT";
      setScore((s) => s + JUDGE_SCORE[kind]);
      setRhythmCombo((c) => {
        const next = c + 1;
        setMaxRhythmCombo((m) => Math.max(m, next));
        return next;
      });
      showJudge(kind, bestNote.time - t);
    },
    [chart, flashLane, gameStarted, showJudge, startRhythmRun, track]
  );

  useEffect(() => {
    if (!rhythmResult) return;
    try {
      const prev = Number(localStorage.getItem(RHYTHM_HIGHSCORE_KEY) || 0);
      const next = Math.max(prev, rhythmResult.score);
      localStorage.setItem(RHYTHM_HIGHSCORE_KEY, String(next));
      setRhythmHighScore(next);
    } catch {
      setRhythmHighScore((h) => Math.max(h, rhythmResult.score));
    }
  }, [rhythmResult?.id]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    maxRhythmComboRef.current = maxRhythmCombo;
  }, [maxRhythmCombo]);

  useEffect(() => {
    if (!gameStarted) return;
    let rafId = 0;
    const tick = () => {
      const wall = performance.now();
      const elapsed = wall - startAtRef.current;
      nowRef.current = elapsed;
      setTimeMs(elapsed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [gameStarted]);

  useEffect(() => {
    if (!gameStarted) return;
    while (missCursorRef.current < chart.length) {
      const note = chart[missCursorRef.current];
      if (note.time > timeMs + syncMs - HIT_WINDOW_MS) break;
      missCursorRef.current += 1;
      if (hitSetRef.current.has(note.id)) continue;
      hitSetRef.current.add(note.id);
      setRhythmCombo(0);
      showJudge("MISS");
    }

    if (timeMs > CHART_LENGTH_MS + 1200) {
      endRhythmGame();
    }
  }, [chart, endRhythmGame, gameStarted, showJudge, syncMs, timeMs]);

  const canvasDpr = useMemo(() => [1, 2], []);
  const visibleNotes = useMemo(
    () =>
      chart.filter((n) => {
        if (hitSetRef.current.has(n.id)) return false;
        const dt = n.time - (timeMs + syncMs);
        return dt <= APPROACH_MS && dt >= -HIT_WINDOW_MS;
      }),
    [chart, syncMs, timeMs]
  );

  const confettiPieces = useMemo(() => {
    if (!rhythmResult) return [];
    const rnd = mulberry32((rhythmResult.id || Date.now()) >>> 0);
    const colors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a29bfe", "#fd79a8", "#74b9ff", "#55efc4"];
    const pieces = [];
    const count = 120;
    for (let i = 0; i < count; i += 1) {
      const size = 6 + Math.floor(rnd() * 8);
      pieces.push({
        id: i,
        left: `${Math.floor(rnd() * 100)}%`,
        delay: `${(rnd() * 0.55).toFixed(2)}s`,
        duration: `${(1.7 + rnd() * 1.25).toFixed(2)}s`,
        drift: `${(-24 + rnd() * 48).toFixed(1)}vw`,
        rot: `${Math.floor(rnd() * 720)}deg`,
        color: colors[Math.floor(rnd() * colors.length)],
        size: `${size}px`,
        opacity: (0.75 + rnd() * 0.25).toFixed(2),
      });
    }
    return pieces;
  }, [rhythmResult]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100dvh",
        height: "100%",
        backgroundColor: bg,
        transition: "background-color 0.12s ease-out",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        position: "relative",
      }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0.38, 4.35], fov: 42, near: 0.1, far: 80 }}
        dpr={canvasDpr}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          inset: 0,
        }}
      >
        <ambientLight intensity={0.72} />
        <directionalLight
          castShadow
          position={[3, 6, 4]}
          intensity={1.05}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.5}
          shadow-camera-far={40}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[-4, 2, -2]} intensity={0.35} />
        <DrumDogScene
          onDrumHit={onDrumHit}
          flatTapButtons={flatTapButtons}
          onControlsReady={onDrumControlsReady}
          onLaneInput={onLaneInput}
        />
      </Canvas>

      <div className={`rhythmHud${rhythmResult ? " rhythmHudBehindResult" : ""}`}>
        <div className="rhythmTopRow">
          <div className="rhythmPill rhythmPillFire">
            🔥 최고 {Math.max(rhythmHighScore, score).toLocaleString("ko-KR")}
          </div>
          <div className="rhythmPill">SCORE {score.toLocaleString("ko-KR")}</div>
          <div className="rhythmPill">MAX COMBO {maxRhythmCombo}</div>
          {bgmTrackTitle ? (
            <div className="rhythmPill rhythmPillTrack" title={bgmTrackTitle}>
              ♪ {bgmTrackTitle}
            </div>
          ) : null}
          {gameStarted ? (
            <button
              type="button"
              className="rhythmStopBtn"
              onPointerDown={(e) => {
                e.preventDefault();
                endRhythmGame();
              }}
            >
              멈추기
            </button>
          ) : null}
        </div>
        <div className="rhythmLanes">
          <div className={`rhythmLane${Date.now() - laneFx.left < 120 ? " rhythmLaneHit" : ""}`}>
            <div className="rhythmHitLine" />
          </div>
          <div className={`rhythmLane${Date.now() - laneFx.right < 120 ? " rhythmLaneHit" : ""}`}>
            <div className="rhythmHitLine" />
          </div>
          {visibleNotes.map((n) => {
            const progress = 1 - (n.time - timeMs) / APPROACH_MS;
            const top = Math.max(0, Math.min(84, progress * 84));
            const proximity = Math.max(0, Math.min(1, progress));
            const g = proximity ** 1.35;
            const glowA =
              n.lane === "left"
                ? `rgba(175, 165, 255, ${0.28 + g * 0.62})`
                : `rgba(255, 155, 200, ${0.3 + g * 0.58})`;
            const glowB =
              n.lane === "left"
                ? `rgba(120, 90, 255, ${0.15 + g * 0.45})`
                : `rgba(255, 95, 160, ${0.18 + g * 0.48})`;
            return (
              <div
                key={n.id}
                className={`rhythmNote rhythmNote${n.lane === "left" ? "Left" : "Right"}`}
                style={{
                  top: `${top}%`,
                  left: n.lane === "left" ? "30%" : "70%",
                  boxShadow: `
                    0 6px 10px rgba(0, 0, 0, 0.22),
                    inset 0 -3px 8px rgba(0, 0, 0, 0.2),
                    0 0 ${6 + g * 44}px ${glowA},
                    0 0 ${3 + g * 22}px ${glowB}
                  `,
                }}
              />
            );
          })}
          {!gameStarted && !rhythmResult ? (
            <div className="rhythmStart">
              <div className="rhythmStartTitle">탭해서 리듬게임 시작!</div>
              <div className="rhythmStartSub">난이도 선택</div>
              <div className="rhythmStartSub" style={{ marginTop: 10 }}>곡 선택</div>
              <div className="rhythmStartSub" style={{ marginTop: 10 }}>싱크 보정 (ms)</div>
              <div className="rhythmTrackRow" style={{ gap: 10 }}>
                <input
                  type="range"
                  min={-200}
                  max={200}
                  step={5}
                  value={syncMs}
                  onChange={(e) => setSyncMs(Number(e.target.value))}
                  style={{ width: "min(72vw, 260px)", pointerEvents: "auto" }}
                  aria-label="싱크 보정 (ms)"
                />
              </div>
              <div className="rhythmStartHint" style={{ marginTop: 6 }}>
                현재: {syncMs}ms (음이 늦게 들리면 +, 빠르면 -)
              </div>
              <div className="rhythmTrackRow">
                <select
                  className="rhythmTrackSelect"
                  value={track?.fileName || track?.url || ""}
                  onChange={(e) => {
                    const next =
                      RHYTHM_PLAYLIST.find((t) => (t.fileName || t.url) === e.target.value) || null;
                    setTrack(next);
                  }}
                >
                  {RHYTHM_PLAYLIST.map((t) => (
                    <option key={t.fileName || t.url} value={t.fileName || t.url}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rhythmDifficultyRow">
                <button
                  type="button"
                  className={`rhythmDiffBtn${selectedDifficulty === DIFFICULTY.EASY ? " rhythmDiffBtnOn" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setSelectedDifficulty(DIFFICULTY.EASY);
                  }}
                >
                  EASY
                </button>
                <button
                  type="button"
                  className={`rhythmDiffBtn${selectedDifficulty === DIFFICULTY.NORMAL ? " rhythmDiffBtnOn" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setSelectedDifficulty(DIFFICULTY.NORMAL);
                  }}
                >
                  NORMAL
                </button>
                <button
                  type="button"
                  className={`rhythmDiffBtn${selectedDifficulty === DIFFICULTY.HARD ? " rhythmDiffBtnOn" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setSelectedDifficulty(DIFFICULTY.HARD);
                  }}
                >
                  HARD
                </button>
              </div>
              <div className="rhythmStartHint">선택 후 아무 레인이나 탭하면 시작해요</div>
            </div>
          ) : null}
          {judge ? (
            <div key={judge.id} className={`rhythmJudge rhythmJudge${judge.kind}`}>
              {judge.text}
            </div>
          ) : null}
        </div>
      </div>

      {rhythmResult ? (
        <div className="rhythmResultBackdrop" role="presentation">
          <div className="rhythmConfettiLayer" aria-hidden>
            {confettiPieces.map((p) => (
              <span
                key={p.id}
                className="rhythmConfettiPiece"
                style={{
                  left: p.left,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  opacity: p.opacity,
                  animationDelay: p.delay,
                  animationDuration: p.duration,
                  "--confetti-drift": p.drift,
                  "--confetti-rot": p.rot,
                }}
              />
            ))}
          </div>
          <div
            className="rhythmResultCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rhythm-result-title"
          >
            <div className="rhythmResultHigh">
              <span className="rhythmResultFire" aria-hidden>
                🔥
              </span>
              <p className="rhythmResultHighLabel">
                최고기록{" "}
                <strong className="rhythmResultHighNum">
                  {Math.max(rhythmHighScore, rhythmResult.score).toLocaleString("ko-KR")}
                </strong>
              </p>
              <span className="rhythmResultFire" aria-hidden>
                🔥
              </span>
            </div>
            <h2 id="rhythm-result-title" className="rhythmResultTitle">
              <span aria-hidden>🔥 </span>결과<span aria-hidden> 🔥</span>
            </h2>
            <p className="rhythmResultReason">게임종료!</p>
            <dl className="rhythmResultStats">
              <div>
                <dt>점수</dt>
                <dd>{rhythmResult.score.toLocaleString("ko-KR")}</dd>
              </div>
              <div>
                <dt>MAX 콤보</dt>
                <dd>{rhythmResult.maxCombo}</dd>
              </div>
            </dl>
            <div className="rhythmResultActions">
              <button type="button" className="rhythmResultBtnSecondary" onClick={backToSongSelect}>
                다른 곡
              </button>
              <button type="button" className="rhythmResultBtnPrimary" onClick={retryRhythmRun}>
                다시 도전
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {flatTapButtons ? (
        <div className="mobileTapOverlay">
          <div className="mobileTapCol mobileTapColLeft">
            <button
              type="button"
              className="mobileTapBtn"
              aria-label="왼쪽 탭"
              onPointerDown={(e) => {
                e.preventDefault();
                drumControlsRef.current?.leftTap?.();
              }}
            >
              ←
            </button>
            <span className="mobileTapLabel">왼쪽 TAP!</span>
          </div>
          <div className="mobileTapCol mobileTapColRight">
            <button
              type="button"
              className="mobileTapBtn"
              aria-label="오른쪽 탭"
              onPointerDown={(e) => {
                e.preventDefault();
                drumControlsRef.current?.rightTap?.();
              }}
            >
              →
            </button>
            <span className="mobileTapLabel">오른쪽 TAP!</span>
          </div>
        </div>
      ) : null}

      {rhythmCombo > 0 ? (
        <div className="comboHud" aria-live="polite" aria-atomic="true">
          <div className="comboHudBurst">
            <div className="comboHudRing" key={`ring-a-${rhythmCombo}`} />
            <div className="comboHudRing" key={`ring-b-${rhythmCombo}`} />
            <div className="comboHudRing" key={`ring-c-${rhythmCombo}`} />
            <div key={rhythmCombo} className="comboHudNumWrap">
              <span className="comboHudEmoji" aria-hidden>
                💥
              </span>
              <span className="comboHudNum">{rhythmCombo}</span>
            </div>
          </div>
          <span className="comboHudLabel">연타</span>
        </div>
      ) : null}

      {showKeyHints ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "max(12px, env(safe-area-inset-left))",
              bottom: "max(14px, env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              color: "rgba(30, 30, 30, 0.82)",
            }}
          >
            <kbd
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "2px solid rgba(30, 30, 30, 0.35)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(245,245,245,0.92) 100%)",
                boxShadow:
                  "0 3px 0 rgba(0,0,0,0.18), 0 6px 16px rgba(0,0,0,0.12)",
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              A
            </kbd>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.02 }}>
              왼쪽 TAP!
            </span>
          </div>
          <div
            style={{
              position: "absolute",
              right: "max(12px, env(safe-area-inset-right))",
              bottom: "max(14px, env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              color: "rgba(30, 30, 30, 0.82)",
            }}
          >
            <kbd
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "2px solid rgba(30, 30, 30, 0.35)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(245,245,245,0.92) 100%)",
                boxShadow:
                  "0 3px 0 rgba(0,0,0,0.18), 0 6px 16px rgba(0,0,0,0.12)",
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              L
            </kbd>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.02 }}>
              오른쪽 TAP!
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
