import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { DrumDogScene } from "./DrumDogScene.jsx";

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

export default function App() {
  const [bg, setBg] = useState("#ffffff");
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const lastTapMs = useRef(0);
  const [celebrate, setCelebrate] = useState(null);
  const [celebrateLeaving, setCelebrateLeaving] = useState(false);
  const [showKeyHints, setShowKeyHints] = useState(false);
  const [flatTapButtons, setFlatTapButtons] = useState(false);
  const drumControlsRef = useRef(null);

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

  const onDrumHit = useCallback(() => {
    setCelebrate(null);
    setCelebrateLeaving(false);
    const now = Date.now();
    setCombo((c) => {
      if (lastTapMs.current > 0 && now - lastTapMs.current <= 1000) {
        lastTapMs.current = now;
        return c + 1;
      }
      lastTapMs.current = now;
      return 1;
    });
    setBg((prev) => pickBackground(prev));
  }, []);

  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);

  useEffect(() => {
    if (combo === 0) return;
    const id = window.setTimeout(() => {
      const final = comboRef.current;
      setCombo(0);
      lastTapMs.current = 0;
      if (final >= 2) {
        setCelebrateLeaving(false);
        setCelebrate({ count: final, id: Date.now() });
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [combo]);

  useEffect(() => {
    if (!celebrate) return;
    const fade = window.setTimeout(() => setCelebrateLeaving(true), 2200);
    const hide = window.setTimeout(() => {
      setCelebrate(null);
      setCelebrateLeaving(false);
    }, 2650);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [celebrate?.id]);

  const canvasDpr = useMemo(() => [1, 2], []);

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
        />
      </Canvas>

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

      {combo > 0 ? (
        <div className="comboHud" aria-live="polite" aria-atomic="true">
          <div className="comboHudBurst">
            <div className="comboHudRing" key={`ring-a-${combo}`} />
            <div className="comboHudRing" key={`ring-b-${combo}`} />
            <div className="comboHudRing" key={`ring-c-${combo}`} />
            <div key={combo} className="comboHudNumWrap">
              <span className="comboHudEmoji" aria-hidden>
                💥
              </span>
              <span className="comboHudNum">{combo}</span>
            </div>
          </div>
          <span className="comboHudLabel">연타</span>
        </div>
      ) : null}

      {celebrate ? (
        <div
          key={celebrate.id}
          className={`comboCelebrate${celebrateLeaving ? " comboCelebrateLeaving" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="comboCelebrateWow">WOW</span>
          <div className="comboCelebrateLine">{celebrate.count}회 연타!</div>
          <span className="comboCelebrateSub">멋진 리듬이에요 🎉</span>
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
              ←
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
              →
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
