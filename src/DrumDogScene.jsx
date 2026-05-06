import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { playDrumHit } from "./drumAudio.js";

function HitSpark({ at, color = "#ffd166", startAt, life = 0.26, seed = 0 }) {
  const root = useRef(null);

  useFrame(({ clock }) => {
    const g = root.current;
    if (!g) return;
    const t = clock.getElapsedTime() - startAt;
    const p = THREE.MathUtils.clamp(t / Math.max(0.001, life), 0, 1);
    const ease = 1 - (1 - p) * (1 - p);
    const sc = 0.12 + ease * 0.75;
    g.scale.setScalar(sc);
    g.rotation.z = seed + ease * 1.25;
    g.position.set(at[0], at[1], at[2]);
    const m = g.children?.[0]?.material;
    if (m) m.opacity = 0.75 * (1 - p);
  });

  return (
    <group ref={root} position={at}>
      <mesh>
        <ringGeometry args={[0.16, 0.26, 28]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.75}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ResponsiveCameraRig() {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aw = size.width / Math.max(1, size.height);
    const baseZ = 4.35;
    const baseY = 0.38;
    const baseFov = 42;
    if (aw >= 1) {
      const t = Math.min(1, (aw - 1) / 1.35);
      camera.position.z = baseZ - t * 1.25;
      camera.position.y = baseY + t * 0.05;
      camera.fov = baseFov - t * 4;
    } else {
      const t = Math.min(1, (1 - aw) / 0.55);
      camera.position.z = baseZ + t * 0.55;
      camera.position.y = baseY;
      camera.fov = baseFov + t * 3.2;
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function SceneScale({ children }) {
  const { viewport, size } = useThree();
  const aw = size.width / Math.max(1, size.height);
  const minV = Math.max(
    Math.min(viewport.width, viewport.height),
    0.001
  );
  let s;
  if (aw >= 1) {
    s = 3.95 / minV;
    s *= 1.08 + Math.min(0.28, (aw - 1) * 0.16);
    s = THREE.MathUtils.clamp(s, 1.08, 1.95);
  } else {
    s = 2.5 / minV;
    s *= 0.9 + Math.min(0.1, (1 - aw) * 0.08);
    s = THREE.MathUtils.clamp(s, 0.72, 1.15);
  }
  if (!Number.isFinite(s)) s = 1;
  return <group scale={s}>{children}</group>;
}

function useCornerTapLayout() {
  const { viewport, size } = useThree();
  return useMemo(() => {
    const aw = size.width / Math.max(1, size.height);
    const deep =
      aw >= 1 ? 2.08 : THREE.MathUtils.clamp(1.95 + (1 - aw) * 0.35, 1.92, 2.35);
    const insetX =
      aw >= 1
        ? Math.min(0.52, 0.34 + (aw - 1) * 0.08)
        : Math.min(0.42, 0.26 + (1 - aw) * 0.12);
    const insetY =
      aw >= 1
        ? Math.min(0.55, 0.34 + (aw - 1) * 0.06)
        : Math.min(1.05, 0.72 + (1 - aw) * 0.35);
    const xL = -viewport.width / 2 + insetX;
    const xR = viewport.width / 2 - insetX;
    const y = -viewport.height / 2 + insetY;
    const effAw = Math.max(aw, 1);
    const btnScale = THREE.MathUtils.clamp(0.62 + effAw * 0.12, 0.72, 0.95);
    return {
      left: [xL, y, deep],
      right: [xR, y, deep],
      btnScale,
    };
  }, [viewport.width, viewport.height, size.width, size.height]);
}

const TAN = "#e7a24a";
const WHITE = "#f4f4f4";
const DARK = "#2b2b2b";
const STICK = "#d9cbb8";
const DRUM_SHELL = "#6b4a38";
const DRUM_HEAD = "#fff8e7";
const DRUM_HOOP = "#4a4a52";
const DRUM_LUG = "#9aa0ab";
const BTN_A = "#7c6cff";
const BTN_B = "#ff6ba8";

function StrikeArm({
  side,
  strikeRef,
  shoulder,
  restRotation,
  stickOffset,
}) {
  const group = useRef(null);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    let t = strikeRef.current;
    if (t < 1) {
      t = Math.min(1, t + delta * 7.2);
      strikeRef.current = t;
    }
    const wave = Math.sin(t * Math.PI);
    const extra = wave * 1.05;
    const sign = side === "left" ? 1 : -1;
    g.rotation.x = restRotation[0] - extra * 0.85;
    g.rotation.y = restRotation[1] + sign * extra * 0.12;
    g.rotation.z = restRotation[2] + sign * extra * 0.18;
  });

  const sx = side === "left" ? 1 : -1;

  return (
    <group ref={group} position={shoulder}>
      <mesh position={[sx * 0.06, -0.13, 0.12]} castShadow>
        <boxGeometry args={[0.11, 0.14, 0.36]} />
        <meshStandardMaterial color={TAN} flatShading />
      </mesh>
      <group position={stickOffset}>
        <mesh rotation={[Math.PI / 2.2, 0, sx * 0.12]} castShadow>
          <cylinderGeometry args={[0.016, 0.02, 0.5, 12]} />
          <meshStandardMaterial color={STICK} flatShading />
        </mesh>
        <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#eeeeee" flatShading />
        </mesh>
      </group>
    </group>
  );
}

function LowPolyCorgi({ leftStrike, rightStrike }) {
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: TAN, flatShading: true }),
    []
  );
  const whiteMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: WHITE, flatShading: true }),
    []
  );
  const eyeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DARK, flatShading: false }),
    []
  );
  const noseMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DARK, flatShading: false }),
    []
  );

  const leftRest = useMemo(() => [0.05, 0.18, 0.22], []);
  const rightRest = useMemo(() => [0.05, -0.18, -0.22], []);

  return (
    <group position={[0, -0.52, -0.05]}>
      <mesh position={[0, 0.26, 0.06]} material={bodyMat} castShadow>
        <boxGeometry args={[0.46, 0.34, 0.48]} />
      </mesh>
      <mesh position={[0, 0.07, 0.05]} material={whiteMat} castShadow>
        <boxGeometry args={[0.3, 0.22, 0.34]} />
      </mesh>

      <group position={[0, 0.52, 0.12]}>
        <mesh material={bodyMat} castShadow>
          <boxGeometry args={[0.36, 0.32, 0.34]} />
        </mesh>
        <mesh position={[0.22, 0.18, 0.02]} rotation={[0, 0, -0.35]} material={bodyMat}>
          <coneGeometry args={[0.12, 0.2, 4]} />
        </mesh>
        <mesh position={[-0.22, 0.18, 0.02]} rotation={[0, 0, 0.35]} material={bodyMat}>
          <coneGeometry args={[0.12, 0.2, 4]} />
        </mesh>

        <mesh position={[0.09, 0.06, 0.176]} material={eyeMat}>
          <sphereGeometry args={[0.052, 24, 18]} />
        </mesh>
        <mesh position={[-0.09, 0.06, 0.176]} material={eyeMat}>
          <sphereGeometry args={[0.052, 24, 18]} />
        </mesh>
        <mesh position={[0, -0.02, 0.205]} material={noseMat}>
          <sphereGeometry args={[0.046, 18, 14]} />
        </mesh>
      </group>

      <mesh position={[0.15, -0.05, 0.18]} rotation={[0.2, 0, -0.08]} material={bodyMat} castShadow>
        <boxGeometry args={[0.12, 0.14, 0.28]} />
      </mesh>
      <mesh position={[-0.15, -0.05, 0.18]} rotation={[0.2, 0, 0.08]} material={bodyMat} castShadow>
        <boxGeometry args={[0.12, 0.14, 0.28]} />
      </mesh>

      <mesh position={[0.18, -0.18, -0.08]} rotation={[1.05, 0, -0.12]} material={bodyMat} castShadow>
        <boxGeometry args={[0.13, 0.12, 0.26]} />
      </mesh>
      <mesh position={[-0.18, -0.18, -0.08]} rotation={[1.05, 0, 0.12]} material={bodyMat} castShadow>
        <boxGeometry args={[0.13, 0.12, 0.26]} />
      </mesh>

      <mesh position={[0, -0.04, -0.28]} rotation={[0.85, 0, 0]} material={bodyMat} castShadow>
        <coneGeometry args={[0.08, 0.14, 5]} />
      </mesh>

      <StrikeArm
        side="left"
        strikeRef={leftStrike}
        shoulder={[0.26, 0.05, 0.03]}
        restRotation={leftRest}
        stickOffset={[0.04, -0.28, 0.24]}
      />
      <StrikeArm
        side="right"
        strikeRef={rightStrike}
        shoulder={[-0.26, 0.05, 0.03]}
        restRotation={rightRest}
        stickOffset={[-0.04, -0.28, 0.24]}
      />
    </group>
  );
}

function Drum({ pulse }) {
  const root = useRef(null);

  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    let t = pulse.current;
    if (t < 1) {
      t = Math.min(1, t + delta * 6.5);
      pulse.current = t;
    }
    const sc = 1 + Math.sin(t * Math.PI) * 0.065;
    g.scale.setScalar(sc);
  });

  const shellMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DRUM_SHELL,
        flatShading: true,
      }),
    []
  );
  const headMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DRUM_HEAD,
        flatShading: true,
      }),
    []
  );
  const hoopMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DRUM_HOOP,
        flatShading: true,
        metalness: 0.35,
        roughness: 0.42,
      }),
    []
  );
  const lugMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DRUM_LUG,
        flatShading: true,
        metalness: 0.28,
        roughness: 0.48,
      }),
    []
  );

  const R = 0.48;
  const depth = 0.26;
  const half = depth / 2;
  const hoopMinor = 0.026;
  const lugAngles = useMemo(() => {
    const n = 8;
    return Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
  }, []);

  return (
    <group ref={root} position={[0, -0.52, 1.05]}>
      {/* 축을 X로 두어 정면(+Z 카메라)에서 원통 측면(쉘)이 보이게 함 */}
      <mesh rotation={[0, 0, -Math.PI / 2]} material={shellMat} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, depth, 18, 1, true]} />
      </mesh>

      <mesh position={[half, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={headMat} castShadow receiveShadow>
        <circleGeometry args={[R, 28]} />
      </mesh>

      <mesh position={[-half, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={headMat}>
        <circleGeometry args={[R, 28]} />
      </mesh>

      <mesh position={[half + hoopMinor * 0.45, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={hoopMat} castShadow>
        <torusGeometry args={[R + hoopMinor * 0.35, hoopMinor, 10, 32]} />
      </mesh>

      <mesh position={[-half - hoopMinor * 0.45, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={hoopMat} castShadow>
        <torusGeometry args={[R + hoopMinor * 0.35, hoopMinor, 10, 32]} />
      </mesh>

      {lugAngles.map((a, i) => {
        const y = Math.cos(a) * R * 0.9;
        const z = Math.sin(a) * R * 0.9;
        return (
          <mesh
            key={i}
            position={[0, y, z]}
            rotation={[Math.PI / 2, 0, a + Math.PI / 2]}
            material={lugMat}
            castShadow
          >
            <boxGeometry args={[0.045, 0.07, 0.055]} />
          </mesh>
        );
      })}
    </group>
  );
}

function TapButton3D({ position, color, onTap, scale: btnScale = 1 }) {
  const down = useRef(false);

  const trigger = useCallback(
    (e) => {
      e.stopPropagation();
      onTap();
    },
    [onTap]
  );

  return (
    <group position={position} scale={btnScale}>
      <RoundedBox
        args={[1.25, 0.52, 0.22]}
        radius={0.12}
        smoothness={3}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation();
          down.current = true;
          trigger(e);
        }}
        onPointerUp={() => {
          down.current = false;
        }}
        onPointerLeave={() => {
          down.current = false;
        }}
      >
        <meshStandardMaterial
          color={color}
          flatShading
          metalness={0.18}
          roughness={0.45}
        />
      </RoundedBox>
      <Suspense fallback={null}>
        <Text
          position={[0, 0, 0.14]}
          fontSize={0.19}
          letterSpacing={0.04}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.018}
          outlineColor="#1a1a1a"
        >
          TAP!
        </Text>
      </Suspense>
    </group>
  );
}

function DrumStage({ onDrumHit, flatTapButtons, onControlsReady, onLaneInput }) {
  const leftStrike = useRef(1);
  const rightStrike = useRef(1);
  const drumPulse = useRef(1);
  const layout = useCornerTapLayout();
  const [sparks, setSparks] = useState([]);

  // Clean up expired sparks
  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    setSparks((prev) => prev.filter((s) => now - s.startAt <= s.life));
  });

  const spawnSpark = useCallback((side) => {
    // Approximate hit point near drum head; slight side offset.
    const sx = side === "left" ? 1 : -1;
    setSparks((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        at: [sx * 0.12, -0.52, 1.05],
        startAt: performance.now() / 1000,
        life: 0.26,
        color: side === "left" ? "#a29bfe" : "#fd79a8",
        seed: Math.random() * Math.PI * 2,
      },
    ]);
  }, []);

  const hitLeft = useCallback(() => {
    playDrumHit();
    leftStrike.current = 0;
    drumPulse.current = 0;
    spawnSpark("left");
    onDrumHit?.();
  }, [onDrumHit, spawnSpark]);

  const hitRight = useCallback(() => {
    playDrumHit();
    rightStrike.current = 0;
    drumPulse.current = 0;
    spawnSpark("right");
    onDrumHit?.();
  }, [onDrumHit, spawnSpark]);

  const triggerLeftControl = useCallback(() => {
    hitRight();
    onLaneInput?.("left");
  }, [hitRight, onLaneInput]);

  const triggerRightControl = useCallback(() => {
    hitLeft();
    onLaneInput?.("right");
  }, [hitLeft, onLaneInput]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      // Keyboard controls (desktop): A / L
      // NOTE: Don't block when focus is on the canvas/root; only skip when actively typing.
      const el = e.target;
      const tag = el && el.tagName ? String(el.tagName).toLowerCase() : "";
      const isTypingTarget = tag === "input" || tag === "textarea" || (el && el.isContentEditable);
      if (isTypingTarget) return;

      const code = e.code || "";
      const key = (e.key || "").toLowerCase();
      const isLeft = code === "KeyA" || key === "a";
      const isRight = code === "KeyL" || key === "l";

      if (isLeft) {
        e.preventDefault();
        triggerLeftControl();
      } else if (isRight) {
        e.preventDefault();
        triggerRightControl();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerLeftControl, triggerRightControl]);

  useEffect(() => {
    onControlsReady?.({
      leftTap: triggerLeftControl,
      rightTap: triggerRightControl,
    });
    return () => onControlsReady?.(null);
  }, [triggerLeftControl, triggerRightControl, onControlsReady]);

  return (
    <>
      <SceneScale>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial transparent opacity={0} />
        </mesh>

        <LowPolyCorgi leftStrike={leftStrike} rightStrike={rightStrike} />
        <Drum pulse={drumPulse} />
        {sparks.map((s) => (
          <HitSpark
            key={s.id}
            at={s.at}
            color={s.color}
            startAt={s.startAt}
            life={s.life}
            seed={s.seed}
          />
        ))}
      </SceneScale>

      {!flatTapButtons ? (
        <>
          <TapButton3D
            position={layout.left}
            color={BTN_A}
            onTap={triggerLeftControl}
            scale={layout.btnScale}
          />
          <TapButton3D
            position={layout.right}
            color={BTN_B}
            onTap={triggerRightControl}
            scale={layout.btnScale}
          />
        </>
      ) : null}
    </>
  );
}

export function DrumDogScene({
  onDrumHit,
  flatTapButtons = false,
  onControlsReady,
  onLaneInput,
}) {
  return (
    <>
      <ResponsiveCameraRig />
      <DrumStage
        onDrumHit={onDrumHit}
        flatTapButtons={flatTapButtons}
        onControlsReady={onControlsReady}
        onLaneInput={onLaneInput}
      />
    </>
  );
}
