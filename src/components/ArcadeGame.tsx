/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { retroAudio } from '../audio';
import { GameStatus, LaneIndex, Collectible, Particle, FloatingText, Star, ActiveBuff, PowerUpType } from '../types';
import { PowerUpDrop, BuffManager, selectRandomPowerUp } from '../powerups';
import { ModifierDefinition, ModifierManager } from '../modifiers';
import { RoadwayObstacle, ROADWAY_HAZARD_TEMPLATES, calculateOilSlickLaneShift } from '../obstacles';
import { DraftModal } from './DraftModal';

interface ArcadeGameProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onScoreChange?: (score: number) => void;
}

const TOTAL_TIME = 45.0; // 45 seconds strict countdown
// Helper to get lane center for dynamic canvas width
export const getLaneCenter = (canvasWidth: number, lane: LaneIndex): number => {
  const laneW = canvasWidth / 3;
  return laneW * (lane + 0.5);
};

// INITIAL PACING & SPEED CONSTANTS (Manageable starting speed at 1.2x warp speed)
const INITIAL_BASE_SPEED = 420; // px/sec - relaxed, manageable velocity for the start of the run
const MAX_BASE_SPEED = 1180; // px/sec - frantic warp velocity near 60s
const INITIAL_SPAWN_INTERVAL = 0.95; // seconds between obstacle spawns (generous initial spacing)
const MIN_SPAWN_INTERVAL = 0.28; // frantic spawn interval in endgame
const HAZARD_START_DELAY = 3.5; // 3.5 seconds of breathing room before first hazard

/**
 * Draws an authentic construction road blockade / bollard-barrier:
 * Features upright cylindrical bollards with weighted bases, reflective bands,
 * amber strobe lights, and horizontal connections with crisp diagonal hazard warning stripes.
 */
function drawBollardBarrier(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  variant: 'yellow' | 'red' | 'orange' | 'tri',
  label: string,
  hazardBlink: boolean,
  timestamp: number
) {
  ctx.save();
  ctx.translate(ox, oy);

  // 1. Ground Drop Shadows on Asphalt
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(-28, 20, 13, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(28, 20, 13, 5, 0, 0, Math.PI * 2);
  if (variant === 'tri') {
    ctx.ellipse(0, 20, 12, 4.5, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  // Shadow under horizontal crossbeams
  ctx.fillRect(-34, 17, 68, 4);

  // Styling attributes per variant
  const stripeColor =
    variant === 'red' ? '#d91e18' : variant === 'orange' ? '#ff6600' : '#141414';
  const boardBg =
    variant === 'red' ? '#ffffff' : variant === 'orange' ? '#ffffff' : '#ffd000';
  const bollardBodyColor =
    variant === 'red' ? '#f0f0f5' : variant === 'orange' ? '#ff6600' : '#ff9900';

  // 2. Horizontal Striped Connection Boards (Behind Bollard Posts)
  const beamW = 68;
  const beamH = 13;
  const beamY = -9;

  const lowerBeamW = 64;
  const lowerBeamH = 9;
  const lowerBeamY = 9;

  const drawStripedBeam = (bx: number, by: number, bw: number, bh: number, stripeW: number) => {
    // Board plank base
    ctx.fillStyle = boardBg;
    ctx.fillRect(bx, by, bw, bh);

    // Board outline
    ctx.strokeStyle = '#1a1a24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Diagonal hazard stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.fillStyle = stripeColor;
    for (let sx = bx - bh * 2; sx < bx + bw + bh * 2; sx += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, by);
      ctx.lineTo(sx + stripeW, by);
      ctx.lineTo(sx + stripeW - bh, by + bh);
      ctx.lineTo(sx - bh, by + bh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  // Draw upper and lower horizontal connection beams
  drawStripedBeam(-beamW / 2, beamY, beamW, beamH, 8);
  drawStripedBeam(-lowerBeamW / 2, lowerBeamY, lowerBeamW, lowerBeamH, 7);

  // Vertical structural bracing struts connecting upper and lower boards
  ctx.fillStyle = '#2a2636';
  ctx.fillRect(-16, beamY + beamH, 4, lowerBeamY - (beamY + beamH));
  ctx.fillRect(12, beamY + beamH, 4, lowerBeamY - (beamY + beamH));

  // 3. Upright Bollard Posts
  const bollardXPositions = variant === 'tri' ? [-28, 0, 28] : [-28, 28];

  for (const bx of bollardXPositions) {
    // Base plinth (weighted rubber/steel foundation)
    ctx.fillStyle = '#1c1a24';
    ctx.fillRect(bx - 9, 16, 18, 7);
    ctx.fillStyle = '#3c3850';
    ctx.fillRect(bx - 7, 16, 14, 2); // bevel highlight

    // Bollard cylindrical stem
    const colW = 12;
    const colH = 34;
    const colY = -15;

    // Body
    ctx.fillStyle = bollardBodyColor;
    ctx.fillRect(bx - colW / 2, colY, colW, colH);

    // 3D cylindrical highlight and shadow
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(bx - colW / 2, colY, 2.5, colH);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(bx + colW / 2 - 2.5, colY, 2.5, colH);

    // Reflective white collars on bollard
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - colW / 2, colY + 5, colW, 4);
    ctx.fillRect(bx - colW / 2, colY + 14, colW, 4);

    // Bollard head cap
    ctx.fillStyle = '#1c1a24';
    ctx.beginPath();
    ctx.ellipse(bx, colY, colW / 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Steel mounting bracket connecting bollard to horizontal beam
    ctx.fillStyle = '#4a4658';
    ctx.fillRect(bx - 3, beamY + 4, 6, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 1.5, beamY + 5.5, 3, 2); // metallic bolt rivet

    // Amber Hazard Strobe Beacon on top of bollard
    const isFlashing = hazardBlink;
    ctx.fillStyle = '#222228';
    ctx.fillRect(bx - 4, colY - 5, 8, 5); // beacon base

    ctx.save();
    ctx.fillStyle = isFlashing ? '#fff275' : '#885500';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = isFlashing ? 16 : 2;
    ctx.beginPath();
    ctx.arc(bx, colY - 6, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Central Stencil Road Sign Plaque
  ctx.save();
  ctx.fillStyle = 'rgba(15, 12, 25, 0.92)';
  ctx.strokeStyle = variant === 'red' ? '#ff3344' : '#ffaa00';
  ctx.lineWidth = 1;
  const badgeW = Math.min(54, beamW - 14);
  const badgeH = 10;
  ctx.fillRect(-badgeW / 2, beamY + 1.5, badgeW, badgeH);
  ctx.strokeRect(-badgeW / 2, beamY + 1.5, badgeW, badgeH);

  ctx.font = '5.5px "Press Start 2P", monospace';
  ctx.fillStyle = variant === 'red' ? '#ff4455' : '#ffd700';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, beamY + 7);
  ctx.restore();

  ctx.restore();
}

export const ArcadeGame: React.FC<ArcadeGameProps> = ({ isMuted, onToggleMute, onScoreChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  // Responsive Viewport & Canvas Layout State (Aspect-Ratio adapts to fill screen dynamically)
  const [viewportSize, setViewportSize] = useState({
    width: 420,
    height: 650,
  });

  // High score from localStorage
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('retro_dodger_highscore') || '0', 10);
    } catch {
      return 0;
    }
  });

  // React state for HUD
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState<number>(0);
  const [dodgedCount, setDodgedCount] = useState<number>(0);
  const [coinsCount, setCoinsCount] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(TOTAL_TIME);

  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [activeLane, setActiveLane] = useState<LaneIndex>(1);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuff[]>([]);

  // Active Run Modifier HUD state
  const [activeModifier, setActiveModifier] = useState<ModifierDefinition | null>(null);
  const [armorIntact, setArmorIntact] = useState<boolean>(false);
  const [scorePausedRemaining, setScorePausedRemaining] = useState<number>(0);
  const [oilTractionLossTime, setOilTractionLossTime] = useState<number>(0);
  const isShieldActive = activeBuffs.some((b) => b.type === 'shield');

  // Managers in refs
  const buffManagerRef = useRef<BuffManager>(new BuffManager());
  const modifierManagerRef = useRef<ModifierManager>(new ModifierManager());

  // Mutable game state held in refs for high-performance 60fps loop
  const gameStateRef = useRef({
    status: 'idle' as GameStatus,
    score: 0,
    dodged: 0,
    coins: 0,
    timeLeft: TOTAL_TIME,
    lane: 1 as LaneIndex,
    canvasWidth: 420,
    canvasHeight: 650,
    playerVisualX: 210,
    targetX: 210,
    obstacles: [] as RoadwayObstacle[],
    collectibles: [] as Collectible[],
    powerups: [] as PowerUpDrop[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    stars: [] as Star[],
    roadOffset: 0,
    gridOffset: 0,
    lastSpawnTime: 0,
    lastCoinSpawnTime: 0,
    lastPowerUpSpawnTime: 0,
    spawnInterval: INITIAL_SPAWN_INTERVAL,
    coinSpawnInterval: 1.8,
    powerUpSpawnInterval: 3.8,
    currentSpeed: INITIAL_BASE_SPEED,
    lastFrameTime: 0,
    lastWarningSecond: 45,
    shakeDuration: 0,
    lastExhaustSpawn: 0,
    shieldAngle: 0,
    oilSlickTimer: 0, // seconds remaining of loss-of-traction
    speedBoostTimer: 0, // seconds remaining for speed boost
    speedMultiplier: 1.0,
    shockwaveRadius: 0,
    shockwaveActive: false,
  });

  // Previous HUD values to avoid unnecessary state updates
  const prevScore = useRef<number>(0);
  const prevDodged = useRef<number>(0);
  const prevCoins = useRef<number>(0);
  const prevTimeLeft = useRef<number>(TOTAL_TIME);
  const prevSpeedMultiplier = useRef<number>(1.0);

  // 1. DYNAMIC RESPONSIVE SCREEN LAYOUT:
  // Dynamically fits the browser window instead of using a fixed 16:9 or 400:650 aspect ratio.
  // The canvas automatically resizes to fill the available space whenever the window is adjusted.
  useEffect(() => {
    const handleResize = () => {
      const wrapper = canvasWrapperRef.current;
      const windowW = window.innerWidth;
      const windowH = window.innerHeight;

      let newWidth = wrapper && wrapper.clientWidth > 0 ? wrapper.clientWidth : Math.min(windowW - 340, 480);
      let newHeight = wrapper && wrapper.clientHeight > 0 ? wrapper.clientHeight : Math.max(520, windowH - 30);

      newWidth = Math.max(280, Math.min(520, Math.floor(newWidth)));
      newHeight = Math.max(500, Math.floor(newHeight));

      setViewportSize((prev) => {
        if (prev.width === newWidth && prev.height === newHeight) return prev;
        return { width: newWidth, height: newHeight };
      });

      const s = gameStateRef.current;
      const oldW = s.canvasWidth;
      s.canvasWidth = newWidth;
      s.canvasHeight = newHeight;

      const newTargetX = getLaneCenter(newWidth, s.lane);
      s.targetX = newTargetX;

      if (oldW !== newWidth) {
        s.playerVisualX = newTargetX;
        for (const obs of s.obstacles) {
          obs.visualX = getLaneCenter(newWidth, obs.lane);
        }
        for (const c of s.collectibles) {
          c.visualX = getLaneCenter(newWidth, c.lane);
        }
        for (const p of s.powerups) {
          p.visualX = getLaneCenter(newWidth, p.lane);
        }
      }

      for (const star of s.stars) {
        if (star.x > newWidth) star.x = Math.random() * newWidth;
        if (star.y > newHeight) star.y = Math.random() * newHeight;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvasWrapperRef.current) {
      ro = new ResizeObserver(() => handleResize());
      ro.observe(canvasWrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (ro) ro.disconnect();
    };
  }, []);

  // Initialize synthwave stars background
  useEffect(() => {
    const stars: Star[] = [];
    const w = gameStateRef.current.canvasWidth || 420;
    const h = gameStateRef.current.canvasHeight || 650;
    for (let i = 0; i < 55; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: Math.random() * 0.75 + 0.4,
        size: Math.random() * 2 + 1,
        color: ['#00f0ff', '#ff007f', '#ffffff', '#ffff00'][Math.floor(Math.random() * 4)],
      });
    }
    gameStateRef.current.stars = stars;
  }, []);

  // 2. SPEED PACING & DYNAMIC DIFFICULTY SCALING:
  // Starts at a calm, manageable 1.2x warp speed and scales smoothly over 60 seconds
  const getDifficulty = (remaining: number) => {
    const elapsedRatio = Math.min(1.0, Math.max(0.0, (TOTAL_TIME - remaining) / TOTAL_TIME));
    const modSpeedMult = modifierManagerRef.current.getSpeedMultiplier();

    // Base speed starts at a gentle, manageable 420 px/s (1.2x warp speed) and scales up
    const baseSpeed = INITIAL_BASE_SPEED + Math.pow(elapsedRatio, 1.25) * (MAX_BASE_SPEED - INITIAL_BASE_SPEED);
    const speed = baseSpeed * modSpeedMult;

    // Spawning interval starts relaxed at 0.95s, gradually accelerating to 0.28s
    const spawnInterval = Math.max(
      MIN_SPAWN_INTERVAL,
      (INITIAL_SPAWN_INTERVAL - Math.pow(elapsedRatio, 1.15) * (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL)) / modSpeedMult
    );

    // Warp speed starts cleanly at 1.2X as requested, scaling to ~3.8X
    const multiplier = +( (1.2 + elapsedRatio * 2.6) * modSpeedMult ).toFixed(1);
    return { speed, spawnInterval, multiplier };
  };

  // Switch lane function with Oil Slick Input-Override Logic
  const moveCar = useCallback((direction: 'left' | 'right') => {
    const s = gameStateRef.current;
    if (s.status !== 'playing') return;

    // ICE CUBE DEBUFF: Freeze car in current lane
    if (buffManagerRef.current.isFrozen()) {
      s.floatingTexts.push({
        id: Date.now() + Math.random(),
        x: s.playerVisualX,
        y: s.canvasHeight - 120,
        text: '🧊 FROZEN!',
        color: '#80e5ff',
        life: 0.35,
      });
      retroAudio.playFreeze();
      return;
    }

    let newLane: LaneIndex = s.lane;

    // OIL SLICK INPUT-OVERRIDE CHECK:
    // Single steering input counts as two lane shifts.
    // If in middle lane, cyclic shift skips adjacent lane and wraps over.
    if (s.oilSlickTimer > 0) {
      const shiftResult = calculateOilSlickLaneShift(s.lane, direction);
      newLane = shiftResult.targetLane;

      retroAudio.playOilSkid();

      // Spawn slick skid trail & warning
      s.floatingTexts.push({
        id: Date.now() + Math.random(),
        x: s.playerVisualX,
        y: s.canvasHeight - 125,
        text: shiftResult.wasCyclic ? '🔄 CYCLIC SKID!' : '⚠️ DOUBLE SHIFT!',
        color: '#ffcc00',
        life: 0.45,
      });

      // Oil skid particles
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 120 + 40;
        s.particles.push({
          x: s.playerVisualX,
          y: s.canvasHeight - 60,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color: i % 2 === 0 ? '#382039' : '#ffaa00',
          size: Math.random() * 5 + 2,
          life: 0.4,
          maxLife: 0.4,
          shape: 'pixel',
        });
      }
    } else {
      // Standard Steering
      if (direction === 'left' && s.lane > 0) {
        newLane = (s.lane - 1) as LaneIndex;
      } else if (direction === 'right' && s.lane < 2) {
        newLane = (s.lane + 1) as LaneIndex;
      }
    }

    if (newLane !== s.lane) {
      s.lane = newLane;
      s.targetX = getLaneCenter(s.canvasWidth, newLane);
      setActiveLane(newLane);
      retroAudio.playLaneSwitch();

      // Exhaust smoke & nitro flame burst trailing behind the car
      const carY = s.canvasHeight - 88;
      const dirMult = direction === 'left' ? -1 : 1;
      const colorList = ['#ffffff', '#bbbbbb', '#ffcc00', '#ff3300', '#00f0ff', '#ff007f'];
      for (let i = 0; i < 24; i++) {
        const angle = Math.PI / 2 + dirMult * (Math.random() * 0.7 + 0.2);
        const spd = Math.random() * 160 + 60;
        s.particles.push({
          x: s.playerVisualX + (Math.random() * 16 - 8),
          y: carY + 62 + Math.random() * 8,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd + s.currentSpeed * 0.25,
          color: colorList[Math.floor(Math.random() * colorList.length)],
          size: Math.random() * 5 + 2,
          life: 0.45,
          maxLife: 0.45,
          shape: 'pixel',
        });
      }
    }
  }, []);

  // Jump to specific lane directly (touch / mouse click on lanes)
  const setLane = useCallback((laneIndex: LaneIndex) => {
    const s = gameStateRef.current;
    if (s.status !== 'playing') return;
    if (s.lane !== laneIndex) {
      const dir = laneIndex < s.lane ? 'left' : 'right';
      moveCar(dir);
    }
  }, [moveCar]);

  // Start / Restart Game with selected modifier
  const startGame = useCallback((selectedMod: ModifierDefinition) => {
    const s = gameStateRef.current;

    // Initialize Run Modifier in Manager
    modifierManagerRef.current.initRun(selectedMod.id);
    setActiveModifier(selectedMod);
    setArmorIntact(selectedMod.id === 'armor');

    s.status = 'playing';
    s.score = 0;
    s.dodged = 0;
    s.coins = 0;
    s.timeLeft = TOTAL_TIME;
    s.lane = 1;
    const initialCenter = getLaneCenter(s.canvasWidth, 1);
    s.playerVisualX = initialCenter;
    s.targetX = initialCenter;
    s.obstacles = [];
    s.collectibles = [];
    s.powerups = [];
    s.particles = [];
    s.floatingTexts = [];
    s.roadOffset = 0;
    s.gridOffset = 0;
    // 3 to 4-second delay at run start before first hazards appear
    s.lastSpawnTime = performance.now() + HAZARD_START_DELAY * 1000;
    s.lastCoinSpawnTime = 0;
    s.lastPowerUpSpawnTime = performance.now() + 1000;
    s.lastFrameTime = performance.now();
    s.lastWarningSecond = 60;
    s.shakeDuration = 0;
    s.shieldAngle = 0;
    s.oilSlickTimer = 0;
    s.shockwaveActive = false;
    s.shockwaveRadius = 0;

    buffManagerRef.current.reset();

    const diff = getDifficulty(TOTAL_TIME);
    s.currentSpeed = diff.speed;
    s.spawnInterval = diff.spawnInterval;

    setGameStatus('playing');
    setScore(0);
    setDodgedCount(0);
    setCoinsCount(0);
    setTimeLeft(TOTAL_TIME);
    // notify parent of score reset
    onScoreChange?.(0);
    setSpeedMultiplier(diff.multiplier);
    setActiveLane(1);
    setActiveBuffs([]);
    setScorePausedRemaining(0);
    setOilTractionLossTime(0);

    retroAudio.playDraftSelect();
  }, []);

  // Return to Draft screen when game over or restart
  const returnToDraft = useCallback(() => {
    modifierManagerRef.current.reset();
    setActiveModifier(null);
    setGameStatus('idle');
  }, []);

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (gameStateRef.current.status === 'playing') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          moveCar('left');
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          moveCar('right');
        }
      } else if (['gameover', 'win'].includes(gameStateRef.current.status)) {
        if (e.key === ' ' || e.key === 'Enter') {
          returnToDraft();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveCar, returnToDraft]);

  // Main 60FPS Game Loop
  useEffect(() => {
    let animationFrameId: number;

    const loop = (timestamp: number) => {
      const s = gameStateRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (s.lastFrameTime === 0) s.lastFrameTime = timestamp;
      const dt = Math.min((timestamp - s.lastFrameTime) / 1000, 0.1);
      s.lastFrameTime = timestamp;

      // High-DPI scale factor for crisp rendering on any screen
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

      // UPDATE GAME LOGIC IF PLAYING
      if (s.status === 'playing') {
        s.timeLeft = Math.max(0, s.timeLeft - dt);

        // Update buff timers
        buffManagerRef.current.update(dt);
        const currentBuffs = buffManagerRef.current.getActiveBuffs();
        setActiveBuffs(currentBuffs);

        // Update modifier manager
        modifierManagerRef.current.update(dt);
        setScorePausedRemaining(Math.max(modifierManagerRef.current.scorePausedTimer, buffManagerRef.current.scorePausedTimer));
        setArmorIntact(modifierManagerRef.current.armorCharge);

        // Update oil slick loss-of-traction timer
        if (s.oilSlickTimer > 0) {
          s.oilSlickTimer = Math.max(0, s.oilSlickTimer - dt);
          setOilTractionLossTime(s.oilSlickTimer);
        } else {
          setOilTractionLossTime(0);
        }

        // Shockwave expansion animation
        if (s.shockwaveActive) {
          s.shockwaveRadius += dt * 1050;
          if (s.shockwaveRadius > 750) {
            s.shockwaveActive = false;
            s.shockwaveRadius = 0;
          }
        }

        // Update difficulty based on timeLeft & run modifier (Higher Initial Base Speed)
        const { speed, spawnInterval, multiplier } = getDifficulty(s.timeLeft);
        s.currentSpeed = speed;
        s.spawnInterval = spawnInterval;

        // Base survival score increments (unless score generation is paused by Clear EMP)
        if (modifierManagerRef.current.scorePausedTimer <= 0 && !buffManagerRef.current.isScorePaused()) {
          const delta = Math.floor(dt * 12 * multiplier);
          s.score += delta;
          // setScore(s.score); // removed to prevent excessive re‑renders
          onScoreChange?.(s.score);
        }

        // Warning sound when time <= 10s
        const currentWholeSec = Math.ceil(s.timeLeft);
        if (currentWholeSec <= 10 && currentWholeSec > 0 && currentWholeSec < s.lastWarningSecond) {
          s.lastWarningSecond = currentWholeSec;
          retroAudio.playWarning();
        }

        // Fast Road movement & Synthwave Grid Scrolling
        s.roadOffset = (s.roadOffset + s.currentSpeed * dt) % 60;
        s.gridOffset = (s.gridOffset + s.currentSpeed * 0.85 * dt) % 40;
        s.shieldAngle += dt * 3.8;

        // Steering response (tuned to match the increased pacing):
        let steerLerpSpeed = 28;
        if (modifierManagerRef.current.isSteeringTwitchy()) {
          steerLerpSpeed = 58;
        } else if (modifierManagerRef.current.isSteeringHeavy()) {
          steerLerpSpeed = 13;
        }

        // Smoothly interpolate car position towards target lane (unless frozen)
        if (!buffManagerRef.current.isFrozen()) {
          s.playerVisualX += (s.targetX - s.playerVisualX) * Math.min(1.0, steerLerpSpeed * dt);
        }

        const carY = s.canvasHeight - 88;
        const isFrozen = buffManagerRef.current.isFrozen();
        const isShieldActive =
          buffManagerRef.current.isShieldActive() ||
          modifierManagerRef.current.activeModifier === 'shield';
        const isMagnetActive =
          buffManagerRef.current.isMagnetActive() ||
          modifierManagerRef.current.isMagnetPermanent();
        const isMini = modifierManagerRef.current.isMini();

        // Hitbox scaled by half for Mini modifier
        const carHitbox = isMini
          ? { x: s.playerVisualX - 10, y: carY + 18, w: 20, h: 32 }
          : { x: s.playerVisualX - 18, y: carY + 8, w: 36, h: 58 };

        // Continuous exhaust particles trailing behind car
        if (timestamp - s.lastExhaustSpawn > 35) {
          s.lastExhaustSpawn = timestamp;
          if (!isFrozen) {
            s.particles.push({
              x: s.playerVisualX + (Math.random() * 12 - 6),
              y: carY + 66,
              vx: (Math.random() - 0.5) * 20,
              vy: s.currentSpeed * 0.35 + Math.random() * 35,
              color: Math.random() > 0.4 ? '#ffaa00' : '#ff0055',
              size: Math.random() * 3 + 2,
              life: 0.25,
              maxLife: 0.25,
              shape: 'pixel',
            });
          }
        }

        // 1. SPAWN COLLECTIBLES (Gold Rings / Coins)
        if (timestamp - s.lastCoinSpawnTime > s.coinSpawnInterval * 1000) {
          s.lastCoinSpawnTime = timestamp;
          s.coinSpawnInterval = Math.random() * 1.2 + 1.8;

          const candidateLanes: LaneIndex[] = [0, 1, 2];
          const chosenLane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
          const isRing = Math.random() > 0.5;

          s.collectibles.push({
            id: Date.now() + Math.random(),
            lane: chosenLane,
            visualX: getLaneCenter(s.canvasWidth, chosenLane),
            y: -40,
            speed: s.currentSpeed * 0.95,
            type: isRing ? 'ring' : 'coin',
            emoji: isRing ? '💍' : '🪙',
            color: '#ffd700',
            rotation: 0,
            collected: false,
            value: 500,
          });
        }

        // 2. SPAWN IN-GAME MYSTERY ITEM BOX (Question Mark Cube)
        if (timestamp - s.lastPowerUpSpawnTime > s.powerUpSpawnInterval * 1000) {
          s.lastPowerUpSpawnTime = timestamp;
          s.powerUpSpawnInterval = Math.random() * 1.8 + 3.2;

          const chosenLane: LaneIndex = Math.floor(Math.random() * 3) as LaneIndex;

          s.powerups.push(
            new PowerUpDrop(
              Date.now() + Math.random(),
              chosenLane,
              getLaneCenter(s.canvasWidth, chosenLane),
              s.currentSpeed * 0.9,
              'mystery_box'
            )
          );
        }

        // 3. SPAWN ROADWAY HAZARDS (3.5s breathing room buffer at start of run)
        const elapsedRunSeconds = TOTAL_TIME - s.timeLeft;
        const isHazardDelayActive = elapsedRunSeconds < HAZARD_START_DELAY;

        if (!isHazardDelayActive && timestamp - s.lastSpawnTime > s.spawnInterval * 1000) {
          s.lastSpawnTime = timestamp;

          const topObstacleLanes = s.obstacles
            .filter((o) => o.y < 200)
            .map((o) => o.lane);

          let candidateLanes: LaneIndex[] = [0, 1, 2];
          if (topObstacleLanes.length >= 2) {
            candidateLanes = candidateLanes.filter((l) => !topObstacleLanes.includes(l));
            if (candidateLanes.length === 0) candidateLanes = [0, 1, 2];
          }

          const chosenLane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
          const tmpl = ROADWAY_HAZARD_TEMPLATES[Math.floor(Math.random() * ROADWAY_HAZARD_TEMPLATES.length)];

          s.obstacles.push(
            new RoadwayObstacle(
              Date.now() + Math.random(),
              chosenLane,
              getLaneCenter(s.canvasWidth, chosenLane),
              -55,
              s.currentSpeed,
              tmpl
            )
          );

          // Second hazard during intense velocity (< 20s remaining)
          if (s.timeLeft < 20 && Math.random() < 0.48 && candidateLanes.length >= 2) {
            const remainingCandidates = candidateLanes.filter((l) => l !== chosenLane);
            if (remainingCandidates.length > 0) {
              const secondLane = remainingCandidates[Math.floor(Math.random() * remainingCandidates.length)];
              const secondTmpl = ROADWAY_HAZARD_TEMPLATES[Math.floor(Math.random() * ROADWAY_HAZARD_TEMPLATES.length)];
              s.obstacles.push(
                new RoadwayObstacle(
                  Date.now() + Math.random() + 1,
                  secondLane,
                  getLaneCenter(s.canvasWidth, secondLane),
                  -70,
                  s.currentSpeed,
                  secondTmpl
                )
              );
            }
          }
        }

        // 4. UPDATE POWER-UPS & PLAYER PICKUP
        for (let i = s.powerups.length - 1; i >= 0; i--) {
          const pu = s.powerups[i];
          pu.update(dt);

          const puHitbox = {
            x: pu.visualX - 18,
            y: pu.y - 18,
            w: 36,
            h: 36,
          };

          if (
            !pu.collected &&
            carHitbox.x < puHitbox.x + puHitbox.w &&
            carHitbox.x + carHitbox.w > puHitbox.x &&
            carHitbox.y < puHitbox.y + puHitbox.h &&
            carHitbox.y + carHitbox.h > puHitbox.y
          ) {
            pu.collected = true;

            // When the player collides with a power‑up item
            // duplicate pu.collected removed

            // Use the unified question‑mark item box: pick a random power‑up
            const grantedType: PowerUpType = selectRandomPowerUp();

            // Activate the power‑up effect and get its duration (in seconds)
            const duration = buffManagerRef.current.activate(grantedType);

            // Trigger UI notification panel by updating active buffs state
            setActiveBuffs(buffManagerRef.current.getActiveBuffs());

            // Start screen shake for visual feedback (0.5 s) - Disabled as requested
            // s.shakeDuration = 0.5;

            // Speed boost power-up removed

            // Shard explosion particles on item pickup
            for (let p = 0; p < 28; p++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = Math.random() * 260 + 50;
              s.particles.push({
                x: pu.visualX,
                y: pu.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                color: p % 3 === 0 ? '#ffd700' : p % 3 === 1 ? '#00f0ff' : '#ff007f',
                size: Math.random() * 5 + 2,
                life: 0.5,
                maxLife: 0.5,
                shape: 'pixel',
              });
            }

            // Play sound and floating text per granted type
            if (grantedType === 'shield') {
              retroAudio.playShieldActivate();
              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: pu.visualX,
                y: pu.y - 12,
                text: '❓ ➔ 🛡️ SHIELD (1‑HIT CHARGED)!',
                color: '#00f0ff',
                life: 1.2,
              });
            }

            // duplicate particle loop removed

            if (grantedType === 'shield') {
              retroAudio.playShieldActivate();
              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: pu.visualX,
                y: pu.y - 12,
                text: '❓ ➔ 🛡️ SHIELD (1-HIT CHARGED)!',
                color: '#00f0ff',
                life: 1.2,
              });
              s.floatingTexts.push({
                id: Date.now() + Math.random() + 1,
                x: pu.visualX,
                y: pu.y + 14,
                text: '🚫 RINGS LOCKED WHILE ACTIVE',
                color: '#ff3366',
                life: 1.2,
              });
            } else if (grantedType === 'clear') {
              retroAudio.playEmpClear();
              s.shockwaveActive = true;
              s.shockwaveRadius = 10;
              let clearedCount = 0;
              for (let oIdx = s.obstacles.length - 1; oIdx >= 0; oIdx--) {
                const obs = s.obstacles[oIdx];
                clearedCount++;
                for (let p = 0; p < 25; p++) {
                  const angle = Math.random() * Math.PI * 2;
                  const spd = Math.random() * 260 + 60;
                  s.particles.push({
                    x: obs.visualX,
                    y: obs.y,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    color: p % 2 === 0 ? '#ff007f' : '#00f0ff',
                    size: Math.random() * 6 + 2,
                    life: 0.6,
                    maxLife: 0.6,
                    shape: 'sparkle',
                  });
                }
                s.obstacles.splice(oIdx, 1);
              }
              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: s.playerVisualX,
                y: s.canvasHeight / 2 - 30,
                text: `❓ ➔ 💥 EMP CLEAR! (${clearedCount} HAZARDS DESTROYED)`,
                color: '#ff007f',
                life: 1.3,
              });
              s.floatingTexts.push({
                id: Date.now() + Math.random() + 1,
                x: s.playerVisualX,
                y: s.canvasHeight / 2 + 10,
                text: '⚡ SCORE PAUSED (3.0s)',
                color: '#ffdd00',
                life: 1.3,
              });
            } else if (grantedType === 'magnet') {
              retroAudio.playMagnetActivate();
              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: pu.visualX,
                y: pu.y,
                text: '❓ ➔ 🧲 MAGNET (6s)!',
                color: '#ff00ff',
                life: 1.2,
              });
            } else {
              retroAudio.playFreeze();
              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: pu.visualX,
                y: pu.y,
                text: '🧊 FROZEN 1.5s!',
                color: '#80e5ff',
                life: 0.9,
              });
            }

            s.powerups.splice(i, 1);
            continue;
          }

          if (pu.y > s.canvasHeight + 60) {
            s.powerups.splice(i, 1);
          }
        }

        // 5. UPDATE COLLECTIBLES (With Magnet pull & Shield Ring-Disable check)
        const canCollectRings = modifierManagerRef.current.canCollectRings();
        for (let i = s.collectibles.length - 1; i >= 0; i--) {
          const coin = s.collectibles[i];
          if (coin.visualX === undefined) coin.visualX = getLaneCenter(s.canvasWidth, coin.lane);
          coin.y += coin.speed * dt;
          coin.rotation += dt * 3.5;

          // MAGNET EFFECT: Automatically vacuums up nearby rings
          if (isMagnetActive) {
            const dx = s.playerVisualX - coin.visualX;
            const dy = (carY + 30) - coin.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 480) {
              const pullFactor = Math.min(1.0, (480 - dist) / 480);
              const pullSpeed = 480 * pullFactor;
              coin.visualX += (dx / dist) * pullSpeed * dt;
              if (dy > 0) {
                coin.y += (dy / dist) * (pullSpeed * 0.4) * dt;
              }
            }
          }

          const coinX = coin.visualX;
          const coinHitbox = {
            x: coinX - 16,
            y: coin.y - 16,
            w: 32,
            h: 32,
          };

          // Check if colliding with player
          if (
            !coin.collected &&
            carHitbox.x < coinHitbox.x + coinHitbox.w &&
            carHitbox.x + carHitbox.w > coinHitbox.x &&
            carHitbox.y < coinHitbox.y + coinHitbox.h &&
            carHitbox.y + carHitbox.h > coinHitbox.y
          ) {
            // SHIELD EFFECT: When shield is active, player cannot collect rings!
            if (buffManagerRef.current.isShieldActive() || !canCollectRings) {
              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: coinX,
                y: coin.y,
                text: '🚫 RING BLOCKED (SHIELD ACTIVE)',
                color: '#ff3366',
                life: 0.5,
              });
              s.collectibles.splice(i, 1);
              continue;
            }

            coin.collected = true;
            s.coins += 1;
            const ringPts = buffManagerRef.current.isScorePaused()
              ? 0
              : Math.round(coin.value * modifierManagerRef.current.getScoreMultiplier());
            s.score += ringPts;
            retroAudio.playCoin();

            // Golden sparkling pixel particles
            for (let p = 0; p < 20; p++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = Math.random() * 220 + 70;
              s.particles.push({
                x: coinX,
                y: coin.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                color: p % 2 === 0 ? '#ffd700' : '#ffffff',
                size: Math.random() * 4 + 2,
                life: 0.5,
                maxLife: 0.5,
                shape: 'sparkle',
              });
            }

            s.floatingTexts.push({
              id: Date.now() + Math.random(),
              x: coinX,
              y: coin.y,
              text: `+${ringPts} ★`,
              color: '#ffd700',
              life: 0.8,
            });

            s.collectibles.splice(i, 1);
            continue;
          }

          if (coin.y > s.canvasHeight + 60) {
            s.collectibles.splice(i, 1);
          }
        }

        // 6. UPDATE ROADWAY HAZARDS (Obstacles)
        const magnetPullsObstacles = modifierManagerRef.current.doesMagnetPullObstacles();

        for (let i = s.obstacles.length - 1; i >= 0; i--) {
          const obs = s.obstacles[i];
          obs.update(dt, s.currentSpeed, s.lane, s.playerVisualX, magnetPullsObstacles);

          const obsBox = obs.getHitbox();

          // Check collision with player car
          if (
            carHitbox.x < obsBox.x + obsBox.w &&
            carHitbox.x + carHitbox.w > obsBox.x &&
            carHitbox.y < obsBox.y + obsBox.h &&
            carHitbox.y + carHitbox.h > obsBox.y
          ) {
            // A. OIL SLICK INTERACTION:
            if (obs.type === 'oil_slick') {
              if (!obs.triggered) {
                obs.triggered = true;
                s.oilSlickTimer = 3.2; // 3.2s of loss of traction
                setOilTractionLossTime(3.2);
                retroAudio.playOilSkid();

                s.floatingTexts.push({
                  id: Date.now() + Math.random(),
                  x: obs.visualX,
                  y: obs.y,
                  text: '⚠️ OIL SLICK! TRACTION LOSS 🔄',
                  color: '#ffcc00',
                  life: 1.1,
                });

                // Oil splatter particles
                for (let p = 0; p < 24; p++) {
                  const angle = Math.random() * Math.PI * 2;
                  const spd = Math.random() * 170 + 60;
                  s.particles.push({
                    x: obs.visualX,
                    y: obs.y,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    color: p % 2 === 0 ? '#382039' : '#1a1020',
                    size: Math.random() * 5 + 3,
                    life: 0.5,
                    maxLife: 0.5,
                    shape: 'pixel',
                  });
                }
              }
              continue;
            }

            // B. SHIELD COLLISION BLOCK: When active, blocks the next obstacle collision!
            if (buffManagerRef.current.isShieldActive()) {
              buffManagerRef.current.consumeShield();
              s.score += buffManagerRef.current.isScorePaused() ? 0 : 250;
              s.dodged += 1;
              retroAudio.playShieldDeflect();

              for (let p = 0; p < 28; p++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = Math.random() * 260 + 100;
                s.particles.push({
                  x: obs.visualX,
                  y: obs.y,
                  vx: Math.cos(angle) * spd,
                  vy: Math.sin(angle) * spd,
                  color: p % 2 === 0 ? '#00f0ff' : '#ffd700',
                  size: Math.random() * 5 + 3,
                  life: 0.6,
                  maxLife: 0.6,
                  shape: 'sparkle',
                });
              }

              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: obs.visualX,
                y: obs.y,
                text: '🛡️ SHIELD BLOCKED HAZARD!',
                color: '#00f0ff',
                life: 0.85,
              });

              s.obstacles.splice(i, 1);
              continue;
            }

            // C. ARMOR ONE-TIME SURVIVAL:
            if (modifierManagerRef.current.consumeArmor()) {
              setArmorIntact(false);
              retroAudio.playArmorBreak();
              s.shakeDuration = 0.45;

              // Heavy metallic spark blast
              for (let p = 0; p < 35; p++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = Math.random() * 270 + 80;
                s.particles.push({
                  x: obs.visualX,
                  y: obs.y,
                  vx: Math.cos(angle) * spd,
                  vy: Math.sin(angle) * spd,
                  color: p % 2 === 0 ? '#ffaa00' : '#ffffff',
                  size: Math.random() * 6 + 3,
                  life: 0.7,
                  maxLife: 0.7,
                  shape: 'sparkle',
                });
              }

              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: s.playerVisualX,
                y: carY - 20,
                text: '🔰 ARMOR BROKEN! (SAVED)',
                color: '#ff9900',
                life: 1.2,
              });

              s.obstacles.splice(i, 1);
              continue;
            }

            // D. FATAL CRASH: Game Over
            s.status = 'gameover';
            s.shakeDuration = 0.6;
            retroAudio.playCrash();

            for (let p = 0; p < 55; p++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = Math.random() * 300 + 70;
              const colors = ['#ff0033', '#ff3300', '#ff9900', '#ffff00', '#ffffff'];
              s.particles.push({
                x: s.playerVisualX,
                y: carY + 30,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                color: colors[p % colors.length],
                size: Math.random() * 6 + 3,
                life: 0.9,
                maxLife: 0.9,
                shape: 'pixel',
              });
            }

            setGameStatus('gameover');
            setScore(s.score);
            setDodgedCount(s.dodged);
            setCoinsCount(s.coins);
            setTimeLeft(s.timeLeft);

            if (s.score > highScore) {
              setHighScore(s.score);
              try {
                localStorage.setItem('retro_dodger_highscore', s.score.toString());
              } catch {}
            }
            break;
          }

          // Safely dodged past car
          if (!obs.passed && obs.y > carY + 60) {
            obs.passed = true;
            if (obs.type !== 'oil_slick') {
              s.dodged += 1;
              const pointsGained = buffManagerRef.current.isScorePaused() ? 0 : Math.round(100 * multiplier);
              s.score += pointsGained;
              retroAudio.playDodge();

              s.floatingTexts.push({
                id: Date.now() + Math.random(),
                x: obs.visualX,
                y: carY,
                text: `+${pointsGained}`,
                color: '#39ff14',
                life: 0.7,
              });
            }
          }

          if (obs.y > s.canvasHeight + 70) {
            s.obstacles.splice(i, 1);
          }
        }

        // Check WIN condition (survived 60 seconds!)
        if (s.timeLeft <= 0) {
          s.status = 'win';
          s.timeLeft = 0;
          s.score += 5000; // Perfect Survival Bonus
          retroAudio.playWin();

          for (let p = 0; p < 80; p++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * 340 + 50;
            s.particles.push({
              x: s.canvasWidth / 2,
              y: s.canvasHeight / 2,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd,
              color: ['#00f0ff', '#ff007f', '#39ff14', '#ffd700', '#ffffff'][p % 5],
              size: Math.random() * 6 + 2,
              life: 1.5,
              maxLife: 1.5,
              shape: 'pixel',
            });
          }

          setGameStatus('win');
          setScore(s.score);
          setDodgedCount(s.dodged);
          setCoinsCount(s.coins);
          setTimeLeft(0);

          if (s.score > highScore) {
            setHighScore(s.score);
            try {
              localStorage.setItem('retro_dodger_highscore', s.score.toString());
            } catch {}
          }
        }

        // Sync React HUD state
        if (s.score !== prevScore.current) { setScore(s.score); prevScore.current = s.score; }
        if (s.dodged !== prevDodged.current) { setDodgedCount(s.dodged); prevDodged.current = s.dodged; }
        if (s.coins !== prevCoins.current) { setCoinsCount(s.coins); prevCoins.current = s.coins; }
        if (s.timeLeft !== prevTimeLeft.current) { setTimeLeft(s.timeLeft); prevTimeLeft.current = s.timeLeft; }
        if (s.speedMultiplier !== prevSpeedMultiplier.current) { setSpeedMultiplier(s.speedMultiplier); prevSpeedMultiplier.current = s.speedMultiplier; }
      }

      // Update Starfield with energetic initial warp velocity
      const starSpeedFactor = s.currentSpeed / 240;
      for (const star of s.stars) {
        star.y += star.speed * starSpeedFactor * 300 * dt;
        if (star.y > s.canvasHeight) {
          star.y = -5;
          star.x = Math.random() * s.canvasWidth;
        }
      }

      // Update particles
      for (let p = s.particles.length - 1; p >= 0; p--) {
        const pt = s.particles[p];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) {
          s.particles.splice(p, 1);
        }
      }

      // Update floating texts
      for (let f = s.floatingTexts.length - 1; f >= 0; f--) {
        const ft = s.floatingTexts[f];
        ft.y -= 50 * dt;
        ft.life -= dt;
        if (ft.life <= 0) {
          s.floatingTexts.splice(f, 1);
        }
      }

      // Screen shake
      let shakeX = 0;
      let shakeY = 0;
      if (s.shakeDuration > 0) {
        s.shakeDuration -= dt;
        shakeX = (Math.random() - 0.5) * 15;
        shakeY = (Math.random() - 0.5) * 15;
      }


      // ==================== RENDERING ====================
      ctx.save();
      // Setup High-DPI transform so that logical coordinates map to physical canvas
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(shakeX, shakeY);

      const laneW = s.canvasWidth / 3;

      // 1. Canvas background
      ctx.fillStyle = '#0a0518';
      ctx.fillRect(0, 0, s.canvasWidth, s.canvasHeight);

      // 2. Asphalt Lanes (darker, less distracting)
      for (let lane = 0; lane < 3; lane++) {
        const lx = lane * laneW;
        ctx.fillStyle = lane % 2 === 0 ? '#0c0620' : '#10082a';
        ctx.fillRect(lx, 0, laneW, s.canvasHeight);
      }

      // 3. Subtle Starfield
      for (const star of s.stars) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = star.color;
        const streakLength = Math.max(star.size * 1.5, (s.currentSpeed / 180) * 5);
        ctx.fillRect(star.x, star.y, star.size * 0.7, streakLength);
        ctx.restore();
      }

      // 4. Subtle Neon Grid (muted for less distraction)
      ctx.save();
      const gridSpacing = 50;
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.08)';
      ctx.lineWidth = 0.5;
      for (let y = s.gridOffset; y < s.canvasHeight; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s.canvasWidth, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 0.5;
      for (let x = laneW * 0.25; x < s.canvasWidth; x += laneW * 0.5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, s.canvasHeight);
      }
      ctx.stroke();
      ctx.restore();

      // Road Lane Dividers with fast scrolling (muted teal)
      ctx.shadowColor = 'rgba(0, 200, 220, 0.4)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(0, 200, 220, 0.55)';
      ctx.lineWidth = 2;

      const dividerX1 = laneW;
      const dividerX2 = laneW * 2;

      ctx.beginPath();
      const dashLength = 40;
      const gapLength = 35;
      const patternHeight = dashLength + gapLength;

      for (let y = -patternHeight + (s.roadOffset % patternHeight); y < s.canvasHeight + patternHeight; y += patternHeight) {
        ctx.moveTo(dividerX1, y);
        ctx.lineTo(dividerX1, y + dashLength);
        ctx.moveTo(dividerX2, y);
        ctx.lineTo(dividerX2, y + dashLength);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 5. DRAW POWER-UP DROPS (Mario Kart Mystery Question Mark Box / Generic Drops)
      for (const pu of s.powerups) {
        ctx.save();
        ctx.translate(pu.visualX, pu.y);

        // Floating / bobbing animation
        const bob = Math.sin(pu.pulsePhase * 1.2) * 5;
        ctx.translate(0, bob);

        if (pu.type === 'mystery_box') {
          const size = 36;
          const half = size / 2;
          const wobble = Math.sin(pu.pulsePhase * 2.5) * 0.08;
          ctx.rotate(wobble);

          // Glowing Aura
          const glowPulse = 14 + Math.sin(pu.pulsePhase * 3) * 6;
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = glowPulse;

          // Outer Cube Dark Bevel
          ctx.fillStyle = '#995c00';
          ctx.fillRect(-half - 2, -half - 2, size + 4, size + 4);

          // Main Cube Face (Golden Amber Gradient)
          const cubeGrad = ctx.createLinearGradient(-half, -half, half, half);
          cubeGrad.addColorStop(0, '#ffe566');
          cubeGrad.addColorStop(0.4, '#ffb700');
          cubeGrad.addColorStop(1, '#ff8800');
          ctx.fillStyle = cubeGrad;
          ctx.fillRect(-half, -half, size, size);

          // Neon Border
          ctx.strokeStyle = '#fff8db';
          ctx.lineWidth = 2;
          ctx.strokeRect(-half + 1, -half + 1, size - 2, size - 2);

          // 4 Corner Rivets / Studs (Classic Mario Question Block look)
          ctx.fillStyle = '#553300';
          const rOffset = half - 5;
          ctx.fillRect(-rOffset, -rOffset, 3, 3);
          ctx.fillRect(rOffset - 3, -rOffset, 3, 3);
          ctx.fillRect(-rOffset, rOffset - 3, 3, 3);
          ctx.fillRect(rOffset - 3, rOffset - 3, 3, 3);

          // Inner Question Mark '?' with white/gold glow
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 8;
          ctx.font = 'bold 18px "Press Start 2P", monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', 0, 1);

          // Top Subtitle Badge
          ctx.shadowBlur = 0;
          ctx.font = '6px "Press Start 2P", monospace';
          ctx.fillStyle = '#ffd700';
          ctx.fillText('? ITEM BOX ?', 0, -half - 7);
        } else {
          const pulse = 1.0 + Math.sin(pu.pulsePhase) * 0.18;
          ctx.shadowColor = pu.color;
          ctx.shadowBlur = 18;
          ctx.fillStyle = 'rgba(10, 5, 24, 0.85)';
          ctx.beginPath();
          ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = pu.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 18, 0, Math.PI * 2);
          ctx.stroke();

          ctx.font = '6.5px "Press Start 2P", monospace';
          ctx.fillStyle = pu.color;
          ctx.textAlign = 'center';
          ctx.fillText(pu.name, 0, -24);

          ctx.font = '22px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pu.emoji, 0, 2);
        }

        ctx.restore();
      }

      // 6. DRAW COLLECTIBLES (Gold Rings / Coins)
      for (const coin of s.collectibles) {
        const cx = coin.visualX ?? getLaneCenter(s.canvasWidth, coin.lane);
        ctx.save();
        ctx.translate(cx, coin.y);

        // If Shield modifier is active, render rings slightly transparent/locked
        if (!modifierManagerRef.current.canCollectRings()) {
          ctx.globalAlpha = 0.45;
        }

        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const spinScale = Math.abs(Math.cos(coin.rotation));
        ctx.scale(Math.max(0.25, spinScale), 1);

        ctx.font = '22px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(coin.emoji, 0, 2);

        ctx.restore();
      }

      // 7. DRAW ROADWAY HAZARDS (Detailed Roadway Assets)
      for (const obs of s.obstacles) {
        const ox = obs.visualX;
        const oy = obs.y;

        ctx.save();

        if (obs.type === 'oil_slick') {
          // A. OIL SLICK GROUND TRAP (high-visibility iridescent)
          ctx.save();
          ctx.translate(ox, oy);

          const oilPulse = 1.0 + Math.sin(timestamp * 0.004) * 0.12;

          // Bright iridescent gradient fill
          const oilGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 36 * oilPulse);
          oilGrad.addColorStop(0, 'rgba(180, 0, 255, 0.9)');
          oilGrad.addColorStop(0.4, 'rgba(255, 0, 180, 0.6)');
          oilGrad.addColorStop(0.7, 'rgba(0, 200, 255, 0.4)');
          oilGrad.addColorStop(1, 'rgba(120, 0, 200, 0.15)');
          ctx.fillStyle = oilGrad;
          ctx.beginPath();
          ctx.ellipse(0, 0, 34 * oilPulse, 20 * oilPulse, 0, 0, Math.PI * 2);
          ctx.fill();

          // Bright magenta outer glow ring
          ctx.shadowColor = '#ff00ff';
          ctx.shadowBlur = 18;
          ctx.strokeStyle = '#ff00ff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, 36 * oilPulse, 22 * oilPulse, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Inner highlight ring
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, 24 * oilPulse, 14 * oilPulse, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Warning label
          ctx.shadowColor = '#ff00ff';
          ctx.shadowBlur = 8;
          ctx.font = 'bold 7px "Press Start 2P", monospace';
          ctx.fillStyle = '#ff44ff';
          ctx.textAlign = 'center';
          ctx.fillText('⚠ OIL', 0, -26);

          ctx.restore();
        } else {
          // B. BOLLARD-BARRIERS WITH HORIZONTAL STRIPED CONNECTIONS
          // Clearly distinguishable construction road blockades featuring upright bollards and striped crossbeams
          let variant: 'yellow' | 'red' | 'orange' | 'tri' = 'yellow';
          let label = 'ROAD BLOCK';

          if (obs.type === 'detour_barricade') {
            variant = 'red';
            label = 'DETOUR ➔';
          } else if (obs.type === 'heavy_blockade') {
            variant = 'orange';
            label = 'BARRICADE';
          } else if (obs.type === 'hazard_bollards') {
            variant = 'tri';
            label = 'CAUTION';
          } else if (obs.type === 'traffic_cones') {
            variant = 'orange';
            label = 'WORK ZONE';
          } else if (obs.type === 'stalled_vehicle') {
            variant = 'red';
            label = 'ROAD CLOSED';
          } else if (obs.type === 'deep_pothole') {
            variant = 'yellow';
            label = 'HAZARD';
          }

          drawBollardBarrier(ctx, ox, oy, variant, label, obs.hazardBlink, timestamp);
        }

        ctx.restore();
      }

      // 8. DRAW PLAYER CAR
      if (s.status !== 'gameover') {
        const px = s.playerVisualX;
        const py = s.canvasHeight - 88;
        const isMini = modifierManagerRef.current.isMini();
        const isShieldActive =
          buffManagerRef.current.isShieldActive() ||
          modifierManagerRef.current.activeModifier === 'shield';
        const isMagnetActive =
          buffManagerRef.current.isMagnetActive() ||
          modifierManagerRef.current.isMagnetPermanent();

        ctx.save();

        // If Mini modifier is active, shrink car by half
        if (isMini) {
          ctx.translate(px, py + 28);
          ctx.scale(0.55, 0.55);
          ctx.translate(-px, -(py + 28));
        }

        // Headlight beams
        const beamGrad = ctx.createLinearGradient(px, py, px, py - 140);
        beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0.45)');
        beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(px - 14, py);
        ctx.lineTo(px - 36, py - 130);
        ctx.lineTo(px + 36, py - 130);
        ctx.lineTo(px + 14, py);
        ctx.closePath();
        ctx.fill();

        // Neon Underglow
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(px - 18, py + 12, 36, 48);

        // Pixel-art sports car chassis
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff0055';

        ctx.fillStyle = '#e60049';
        ctx.fillRect(px - 18, py + 10, 36, 52);

        ctx.fillStyle = '#ff3366';
        ctx.fillRect(px - 14, py + 2, 28, 12);
        ctx.fillRect(px - 10, py - 4, 20, 6);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px - 4, py - 4, 3, 66);
        ctx.fillRect(px + 1, py - 4, 3, 66);

        ctx.fillStyle = '#0a0a20';
        ctx.fillRect(px - 12, py + 16, 24, 16);
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(px - 10, py + 18, 5, 12);

        ctx.fillStyle = '#1a052e';
        ctx.fillRect(px - 22, py + 58, 44, 8);
        ctx.fillStyle = '#ff007f';
        ctx.fillRect(px - 20, py + 56, 40, 4);

        ctx.fillStyle = '#111118';
        ctx.fillRect(px - 22, py + 8, 5, 16);
        ctx.fillRect(px + 17, py + 8, 5, 16);
        ctx.fillRect(px - 22, py + 42, 5, 16);
        ctx.fillRect(px + 17, py + 42, 5, 16);

        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px - 14, py - 2, 6, 4);
        ctx.fillRect(px + 8, py - 2, 6, 4);

        // Boost flames
        if (s.status === 'playing' && !buffManagerRef.current.isFrozen()) {
          ctx.shadowColor = '#ff6600';
          ctx.shadowBlur = 14;
          ctx.fillStyle = Math.random() > 0.5 ? '#ffaa00' : '#ff3300';
          const flameHeight = 10 + Math.random() * (s.currentSpeed / 45);
          ctx.beginPath();
          ctx.moveTo(px - 8, py + 66);
          ctx.lineTo(px, py + 66 + flameHeight);
          ctx.lineTo(px + 8, py + 66);
          ctx.closePath();
          ctx.fill();
        }

        // --- SHIELD INVINCIBILITY BUBBLE ---
        if (isShieldActive) {
          ctx.save();
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 24;
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 3;
          ctx.fillStyle = 'rgba(0, 240, 255, 0.18)';

          ctx.beginPath();
          ctx.ellipse(px, py + 32, 34, 46, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          for (let a = 0; a < 6; a++) {
            const rot = s.shieldAngle + (a * Math.PI) / 3;
            const sx = px + Math.cos(rot) * 34;
            const sy = py + 32 + Math.sin(rot) * 46;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - 2, sy - 2, 4, 4);
          }
          ctx.restore();
        }

        // --- ARMOR REINFORCED CHASSIS ---
        if (modifierManagerRef.current.armorCharge) {
          ctx.save();
          ctx.shadowColor = '#ffaa00';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2.5;
          ctx.fillStyle = 'rgba(255, 170, 0, 0.15)';

          ctx.beginPath();
          ctx.rect(px - 25, py - 8, 50, 78);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffaa00';
          ctx.fillRect(px - 26, py - 9, 8, 8);
          ctx.fillRect(px + 18, py - 9, 8, 8);
          ctx.fillRect(px - 26, py + 61, 8, 8);
          ctx.fillRect(px + 18, py + 61, 8, 8);

          ctx.restore();
        }

        // --- MAGNET ARCS ---
        if (isMagnetActive) {
          ctx.save();
          ctx.shadowColor = '#ff00ff';
          ctx.shadowBlur = 16;
          ctx.strokeStyle = 'rgba(255, 0, 255, 0.7)';
          ctx.lineWidth = 2;

          const wavePhase = (timestamp * 0.005) % 1;
          for (let w = 0; w < 3; w++) {
            const r = 24 + ((w + wavePhase) % 3) * 16;
            ctx.beginPath();
            ctx.arc(px, py - 4, r, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          }
          ctx.restore();
        }

        // --- FROZEN ENCASEMENT ---
        if (buffManagerRef.current.isFrozen()) {
          ctx.save();
          ctx.shadowColor = '#80e5ff';
          ctx.shadowBlur = 22;
          ctx.fillStyle = 'rgba(128, 229, 255, 0.45)';
          ctx.strokeStyle = '#e0f9ff';
          ctx.lineWidth = 3;

          ctx.fillRect(px - 26, py - 10, 52, 86);
          ctx.strokeRect(px - 26, py - 10, 52, 86);

          ctx.font = '8px "Press Start 2P", monospace';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 8;
          ctx.textAlign = 'center';
          ctx.fillText('FROZEN!', px, py - 18);
          ctx.restore();
        }

        ctx.restore();
      }

      // 9. EMP SHOCKWAVE EFFECT (Clear Modifier)
      if (s.shockwaveActive) {
        ctx.save();
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(s.playerVisualX, s.canvasHeight - 88 + 30, s.shockwaveRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 10. DRAW PARTICLES
      for (const pt of s.particles) {
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = pt.life / pt.maxLife;

        if (pt.shape === 'sparkle') {
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - pt.size);
          ctx.lineTo(pt.x + pt.size, pt.y);
          ctx.lineTo(pt.x, pt.y + pt.size);
          ctx.lineTo(pt.x - pt.size, pt.y);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        }
        ctx.restore();
      }

      // 11. DRAW FLOATING POPUP TEXTS
      for (const ft of s.floatingTexts) {
        ctx.save();
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1.0, ft.life * 1.8);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // 12. SLOW-MO DARK PERIPHERAL VIGNETTE OVERLAY
      if (modifierManagerRef.current.hasSlowMoVignette()) {
        ctx.save();
        const vigGrad = ctx.createRadialGradient(
          s.canvasWidth / 2,
          s.canvasHeight * 0.65,
          s.canvasWidth * 0.18,
          s.canvasWidth / 2,
          s.canvasHeight * 0.65,
          s.canvasWidth * 0.68
        );
        vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vigGrad.addColorStop(0.5, 'rgba(4, 1, 10, 0.65)');
        vigGrad.addColorStop(0.85, 'rgba(3, 0, 8, 0.93)');
        vigGrad.addColorStop(1, 'rgba(2, 0, 6, 0.98)');

        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, s.canvasWidth, s.canvasHeight);
        ctx.restore();
      }

      // 13. Critical Velocity Warning (< 10s)
      if (s.status === 'playing' && s.timeLeft <= 10 && Math.floor(timestamp / 250) % 2 === 0) {
        ctx.save();
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillStyle = '#ff0055';
        ctx.shadowColor = '#ff0055';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText('⚠ MAXIMUM VELOCITY ⚠', s.canvasWidth / 2, 85);
        ctx.restore();
      }

      // 14. Initial Hazard Delay Breathing Room Overlay (< HAZARD_START_DELAY elapsed)
      const elapsedRunSeconds = TOTAL_TIME - s.timeLeft;
      if (s.status === 'playing' && elapsedRunSeconds < HAZARD_START_DELAY) {
        const remDelay = Math.max(0, HAZARD_START_DELAY - elapsedRunSeconds);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const boxW = Math.min(s.canvasWidth - 36, 320);
        const boxH = 58;
        const boxX = (s.canvasWidth - boxW) / 2;
        const boxY = s.canvasHeight * 0.36;

        ctx.fillStyle = 'rgba(10, 4, 25, 0.88)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#00f0ff';
        ctx.fillText('⚡ GET READY!', s.canvasWidth / 2, boxY + 18);

        ctx.font = '7.5px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
        ctx.fillText(`BLOCKADES IN ${remDelay.toFixed(1)}s`, s.canvasWidth / 2, boxY + 38);

        ctx.restore();
      }

      ctx.restore(); // restore shake & transform

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [highScore]);

  // Format time
  const formatTime = (seconds: number) => {
    const s = Math.max(0, seconds);
    const whole = Math.floor(s);
    const ms = Math.floor((s - whole) * 10);
    const displaySec = whole < 10 ? `0${whole}` : `${whole}`;
    return `${displaySec}.${ms}s`;
  };

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col md:flex-row items-stretch select-none w-full h-full min-h-0 transition-all gap-2.5 overflow-hidden justify-center max-w-6xl"
    >
      {/* 1. DEDICATED LEFT-SIDE SCOREBOARD & STATUS EFFECTS SIDEBAR */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0 flex flex-col justify-between bg-[#110826] border-2 border-[#00f0ff] p-2.5 sm:p-3 rounded-lg shadow-[0_0_18px_rgba(0,240,255,0.25)] overflow-y-auto max-h-full">
        <div>
          {/* Header Title / Sound Toggle */}
          <div className="flex items-center justify-between border-b border-[#29134d] pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🏎️</span>
              <div>
                <h2 className="text-[10px] font-bold text-[#00f0ff] tracking-wider drop-shadow-[0_0_6px_#00f0ff]">
                  RETRO DODGER
                </h2>
                <span className="text-[7px] text-[#ff007f] block font-mono">SCOREBOARD HUD</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleMute}
              className="text-[8px] bg-[#1a0c3b] hover:bg-[#2e1564] border border-gray-500 text-gray-300 px-2 py-1 rounded transition-all cursor-pointer font-bold"
              title="Toggle Sound"
            >
              {isMuted ? '🔇 MUTE' : '🔊 SFX'}
            </button>
          </div>

          {/* Strict 60s Countdown Timer & Multiplier */}
          <div className="bg-[#180a36] border border-[#2f145c] rounded p-2 mb-2">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="text-[7.5px] text-[#00f0ff] tracking-wider block">TIME REMAINING</span>
                <div
                  className={`text-base sm:text-lg font-bold tracking-wider ${
                    timeLeft <= 10
                      ? 'text-[#ff0055] animate-pulse drop-shadow-[0_0_8px_#ff0055]'
                      : timeLeft <= 25
                      ? 'text-[#ffff00]'
                      : 'text-[#39ff14]'
                  }`}
                >
                  ⏱ {formatTime(timeLeft)}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[7.5px] text-[#ff007f] tracking-wider block">WARP SPEED</span>
                <div className="text-sm font-bold text-[#ff007f] drop-shadow-[0_0_6px_#ff007f]">
                  {speedMultiplier.toFixed(1)}X
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#200d3d] h-1.5 rounded overflow-hidden border border-[#441d80]">
              <div
                className={`h-full transition-all duration-100 ${
                  timeLeft <= 10
                    ? 'bg-[#ff0055] shadow-[0_0_10px_#ff0055]'
                    : timeLeft <= 25
                    ? 'bg-[#ffff00]'
                    : 'bg-[#00f0ff]'
                }`}
                style={{ width: `${(timeLeft / TOTAL_TIME) * 100}%` }}
              />
            </div>
          </div>

          {/* Primary Scoreboard Display */}
          <div className="bg-[#180a36] border-2 border-[#00f0ff] rounded p-2 mb-2 text-center shadow-[0_0_12px_rgba(0,240,255,0.2)]">
            <span className="text-gray-400 block text-[7.5px] tracking-widest mb-0.5">SCORE</span>
            <div className="text-[#00f0ff] font-bold text-xl sm:text-2xl drop-shadow-[0_0_8px_#00f0ff]">
              {score}
            </div>
          </div>

          {/* Secondary Stats Grid */}
          <div className="grid grid-cols-3 gap-1 text-center text-[8px] mb-2">
            <div className="bg-[#1a0c3b] p-1.5 rounded border border-[#3b177d]">
              <span className="text-gray-400 block text-[6.5px]">RINGS 🪙</span>
              <span className="text-[#ffd700] font-bold text-xs">{coinsCount}</span>
            </div>
            <div className="bg-[#1a0c3b] p-1.5 rounded border border-[#3b177d]">
              <span className="text-gray-400 block text-[6.5px]">DODGED</span>
              <span className="text-[#39ff14] font-bold text-xs">{dodgedCount}</span>
            </div>
            <div className="bg-[#1a0c3b] p-1.5 rounded border border-[#3b177d]">
              <span className="text-gray-400 block text-[6.5px]">HIGH</span>
              <span className="text-[#ffdd00] font-bold text-xs">{highScore}</span>
            </div>
          </div>

          {/* ACTIVE SHIELD STATUS INDICATOR */}
          <div
            className={`p-2 rounded border transition-all mb-2 ${
              isShieldActive
                ? 'bg-cyan-950/80 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'bg-[#150a2b] border-[#2c1452] text-gray-400'
            }`}
          >
            <div className="flex items-center justify-between text-[8px] font-bold">
              <span className="flex items-center gap-1">🛡️ SHIELD STATUS</span>
              <span className={isShieldActive ? 'text-[#00f0ff] animate-pulse' : 'text-gray-500'}>
                {isShieldActive ? 'CHARGED (1-HIT)' : 'INACTIVE'}
              </span>
            </div>
            {isShieldActive ? (
              <div className="text-[7px] text-cyan-200 mt-1 leading-tight">
                ✓ Absorbs next hazard collision!
                <br />
                <span className="text-pink-400">⚠️ Rings disabled while active</span>
              </div>
            ) : (
              <div className="text-[6.5px] text-gray-500 mt-0.5">Collect Mystery Box to roll shield</div>
            )}
          </div>

          {/* SCORE-PAUSE DOWNTIME INDICATOR */}
          <div
            className={`p-2 rounded border transition-all mb-2 ${
              scorePausedRemaining > 0
                ? 'bg-amber-950/80 border-[#ffcc00] text-[#ffcc00] shadow-[0_0_12px_rgba(255,204,0,0.4)]'
                : 'bg-[#150a2b] border-[#2c1452] text-gray-400'
            }`}
          >
            <div className="flex items-center justify-between text-[8px] font-bold">
              <span className="flex items-center gap-1">⚡ SCORE PAUSE</span>
              <span className={scorePausedRemaining > 0 ? 'text-[#ffcc00] animate-pulse' : 'text-[#39ff14]'}>
                {scorePausedRemaining > 0 ? `${scorePausedRemaining.toFixed(1)}s LEFT` : 'ACCUMULATING'}
              </span>
            </div>
            {scorePausedRemaining > 0 ? (
              <div className="text-[7px] text-amber-200 mt-1 leading-tight">
                EMP Clear recovery: points temporarily frozen!
              </div>
            ) : (
              <div className="text-[6.5px] text-gray-500 mt-0.5">+Points awarded continuously</div>
            )}
          </div>

          {/* OTHER ACTIVE STATUS BUFFS (Magnet, Frozen) */}
          {activeBuffs.filter((b) => b.type !== 'shield' && b.type !== 'clear').length > 0 && (
            <div className="space-y-1 mb-2">
              {activeBuffs
                .filter((b) => b.type !== 'shield' && b.type !== 'clear')
                .map((buff) => (
                  <div
                    key={buff.type}
                    className="flex items-center justify-between bg-[#170a30] border px-2 py-1 rounded shadow-md text-[7.5px]"
                    style={{ borderColor: buff.color }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{buff.emoji}</span>
                      <span className="font-bold" style={{ color: buff.color }}>
                        {buff.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-white font-mono">{buff.remaining.toFixed(1)}s</span>
                      <div className="w-10 bg-[#25104d] h-1 rounded-full overflow-hidden border border-[#3d1875]">
                        <div
                          className="h-full"
                          style={{
                            width: `${(buff.remaining / buff.totalDuration) * 100}%`,
                            backgroundColor: buff.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* ACTIVE RUN MODIFIER BANNER (Permanent for this Run) */}
          {activeModifier && (
            <div
              className="mb-2 p-1.5 rounded border text-[7.5px] shadow-sm"
              style={{
                borderColor: activeModifier.borderColor,
                backgroundColor: `${activeModifier.color}15`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{activeModifier.emoji}</span>
                  <div>
                    <span className="font-bold font-mono" style={{ color: activeModifier.color }}>
                      {activeModifier.name}
                    </span>
                    <span className="text-[6.5px] text-gray-300 block">
                      {activeModifier.description}
                    </span>
                  </div>
                </div>

                {activeModifier.id === 'armor' && (
                  <span
                    className={`text-[6.5px] px-1 py-0.5 rounded font-bold font-mono border ${
                      armorIntact
                        ? 'bg-emerald-900/60 border-emerald-500 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-600 text-rose-400 line-through'
                    }`}
                  >
                    {armorIntact ? 'ARMOR OK' : 'BROKEN'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Warnings (Hazard Delay / Oil Slick) */}
          {TOTAL_TIME - timeLeft < HAZARD_START_DELAY && gameStatus === 'playing' && (
            <div className="mb-2 py-1 px-2 rounded bg-cyan-950/80 border border-cyan-400 text-cyan-300 text-[7px] font-mono text-center animate-pulse">
              ⚡ GET READY • HAZARDS IN {(HAZARD_START_DELAY - (TOTAL_TIME - timeLeft)).toFixed(1)}s
            </div>
          )}

          {oilTractionLossTime > 0 && (
            <div className="mb-2 py-1 px-2 rounded bg-purple-950/80 border border-[#ff00ff] text-[#00f0ff] text-[7px] font-mono text-center animate-bounce">
              ⚠️ OIL SLICK ({oilTractionLossTime.toFixed(1)}s): STEER SKIPS 2 LANES!
            </div>
          )}
        </div>

        {/* Sidebar Footer Controls */}
        <div className="pt-2 border-t border-[#2a134d] mt-auto">
          <div className="text-[7px] text-yellow-400 mb-1.5 text-center font-bold">
            ❓ MYSTERY BOX: SHIELD / EMP / MAGNET
          </div>
          <div className="flex gap-1.5 mb-1.5">
            <button
              type="button"
              onClick={() => moveCar('left')}
              className="flex-1 bg-[#170a30] hover:bg-[#25124c] active:bg-[#ff007f] active:text-white border border-[#00f0ff] text-[#00f0ff] py-2 rounded text-center text-[9px] font-bold cursor-pointer transition-colors"
            >
              ◀ LEFT [A]
            </button>
            <button
              type="button"
              onClick={() => moveCar('right')}
              className="flex-1 bg-[#170a30] hover:bg-[#25124c] active:bg-[#ff007f] active:text-white border border-[#00f0ff] text-[#00f0ff] py-2 rounded text-center text-[9px] font-bold cursor-pointer transition-colors"
            >
              RIGHT [D] ▶
            </button>
          </div>
          <div className="text-[6.5px] text-gray-400 text-center">
            STEER: [A]/[D] or [←]/[→] • TAP LANES
          </div>
        </div>
      </aside>

      {/* 2. RIGHT-SIDE MAXIMIZED PLAYABLE ROAD CANVAS */}
      <div className="relative flex-1 h-full min-h-0 w-full flex items-center justify-center">
        <div
          ref={canvasWrapperRef}
          className="relative w-full h-full max-w-[520px] rounded-lg overflow-hidden border-4 border-[#ff007f] shadow-[0_0_25px_rgba(255,0,127,0.4)] bg-black transition-all duration-100 flex items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            width={viewportSize.width * dpr}
            height={viewportSize.height * dpr}
            style={{
              width: `${viewportSize.width}px`,
              height: `${viewportSize.height}px`,
              imageRendering: 'pixelated',
            }}
            className="block"
          />

          {/* CRT Scanline Overlay */}
          <div className="absolute inset-0 crt-overlay pointer-events-none opacity-35" />

          {/* CLICKABLE / TOUCHABLE LANE ZONES (Scales perfectly with responsive canvas) */}
          <div className="absolute inset-0 flex z-10">
            <button
              type="button"
              aria-label="Left Lane"
              onClick={() => setLane(0)}
              className="flex-1 h-full bg-transparent active:bg-cyan-500/10 transition-colors focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              aria-label="Center Lane"
              onClick={() => setLane(1)}
              className="flex-1 h-full bg-transparent active:bg-cyan-500/10 transition-colors focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              aria-label="Right Lane"
              onClick={() => setLane(2)}
              className="flex-1 h-full bg-transparent active:bg-cyan-500/10 transition-colors focus:outline-none cursor-pointer"
            />
          </div>

          {/* PRE-GAME MODIFIER DRAFT SCREEN */}
          {gameStatus === 'idle' && (
            <DraftModal onSelectModifier={startGame} highScore={highScore} />
          )}

          {/* GAME OVER OVERLAY SCREEN */}
          {gameStatus === 'gameover' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-3 text-center backdrop-blur-xs">
              <div className="text-3xl mb-1.5 animate-pulse">💥</div>
              <h2 className="text-xl sm:text-2xl text-[#ff0055] drop-shadow-[0_0_15px_#ff0055] mb-1 font-bold">
                GAME OVER
              </h2>
              <p className="text-[9px] text-gray-400 mb-3">
                CRASHED AT {formatTime(TOTAL_TIME - timeLeft)}!
              </p>

              <div className="bg-[#170a30] border-2 border-[#ff0055] p-2.5 rounded-lg w-full max-w-[270px] mb-3 space-y-1 text-[9px]">
                <div className="flex justify-between text-gray-300">
                  <span>FINAL SCORE:</span>
                  <span className="text-[#00f0ff] font-bold text-xs">{score}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>RINGS COLLECTED:</span>
                  <span className="text-[#ffd700] font-bold">{coinsCount} (+{coinsCount * 500})</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>HAZARDS DODGED:</span>
                  <span className="text-[#39ff14] font-bold">{dodgedCount}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>TIME SURVIVED:</span>
                  <span className="text-[#ffff00] font-bold">{formatTime(TOTAL_TIME - timeLeft)}</span>
                </div>
                {activeModifier && (
                  <div className="border-t border-[#3b177d] pt-1 flex justify-between text-[8px]">
                    <span className="text-gray-400">MODIFIER USED:</span>
                    <span style={{ color: activeModifier.color }} className="font-bold">
                      {activeModifier.emoji} {activeModifier.name}
                    </span>
                  </div>
                )}
                <div className="border-t border-[#3b177d] pt-1 flex justify-between text-gray-300">
                  <span>HIGH SCORE:</span>
                  <span className="text-[#ffdd00] font-bold">{highScore}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={returnToDraft}
                className="bg-[#00f0ff] hover:bg-[#33f3ff] active:scale-95 text-black font-bold py-2 px-5 rounded border-2 border-white shadow-[0_0_20px_#00f0ff] text-xs cursor-pointer transition-all duration-150"
              >
                NEW RUN (DRAFT)
              </button>
              <span className="text-[8px] text-gray-400 mt-1.5">Press SPACE or ENTER</span>
            </div>
          )}

          {/* YOU WIN OVERLAY SCREEN */}
          {gameStatus === 'win' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-3 text-center backdrop-blur-xs">
              <div className="text-3xl mb-1.5 animate-bounce">🏆</div>
              <h2 className="text-xl sm:text-2xl text-[#39ff14] drop-shadow-[0_0_15px_#39ff14] mb-1 font-bold">
                YOU WIN!
              </h2>
              <p className="text-[9px] text-[#00f0ff] mb-2.5">
                45 SECONDS SURVIVED!
              </p>

              <div className="bg-[#170a30] border-2 border-[#39ff14] p-2.5 rounded-lg w-full max-w-[270px] mb-3 space-y-1 text-[9px]">
                <div className="flex justify-between text-gray-300">
                  <span>SURVIVAL BONUS:</span>
                  <span className="text-[#ff007f] font-bold">+5000</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>RINGS BONUS:</span>
                  <span className="text-[#ffd700] font-bold">+{coinsCount * 500} ({coinsCount} rings)</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>FINAL SCORE:</span>
                  <span className="text-[#39ff14] font-bold text-xs">{score}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>TOTAL DODGED:</span>
                  <span className="text-[#00f0ff] font-bold">{dodgedCount}</span>
                </div>
                {activeModifier && (
                  <div className="border-t border-[#3b177d] pt-1 flex justify-between text-[8px]">
                    <span className="text-gray-400">MODIFIER:</span>
                    <span style={{ color: activeModifier.color }} className="font-bold">
                      {activeModifier.emoji} {activeModifier.name}
                    </span>
                  </div>
                )}
                <div className="border-t border-[#3b177d] pt-1 flex justify-between text-gray-300">
                  <span>HIGH SCORE:</span>
                  <span className="text-[#ffdd00] font-bold">{highScore}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={returnToDraft}
                className="bg-[#39ff14] hover:bg-[#5aff38] active:scale-95 text-black font-bold py-2 px-5 rounded border-2 border-white shadow-[0_0_20px_#39ff14] text-xs cursor-pointer transition-all duration-150"
              >
                PLAY AGAIN (DRAFT)
              </button>
              <span className="text-[8px] text-gray-400 mt-1.5">Press SPACE or ENTER</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
