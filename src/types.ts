export type LaneIndex = 0 | 1 | 2; // 0 = Left, 1 = Center, 2 = Right

export type GameStatus = 'idle' | 'playing' | 'gameover' | 'win';

export type ModifierId =
  | 'rush'
  | 'magnet'
  | 'mini'
  | 'armor'
  | 'slowmo';

export type RoadwayHazardType =
  | 'oil_slick'
  | 'construction_barricade'
  | 'traffic_cones'
  | 'deep_pothole'
  | 'stalled_vehicle';

export type PowerUpType = 'mystery_box' | 'shield' | 'clear' | 'magnet' | 'freeze';

export interface PowerUp {
  id: number;
  lane: LaneIndex;
  visualX: number;
  y: number;
  speed: number;
  type: PowerUpType;
  emoji: string;
  name: string;
  color: string;
  duration: number; // shield is 1-hit/block, clear is EMP burst, magnet 6s, freeze 1.5s
  pulsePhase: number;
  collected: boolean;
}

export interface ActiveBuff {
  type: PowerUpType;
  name: string;
  emoji: string;
  color: string;
  remaining: number;
  totalDuration: number;
}

export interface Obstacle {
  id: number;
  lane: LaneIndex;
  visualX: number;
  targetX: number;
  y: number;
  speed: number;
  speedMultiplier: number; // e.g. 1.5 for sonic
  type: 'sonic' | 'ghost' | 'invader' | 'mushroom' | 'ufo';
  emoji: string;
  name: string;
  color: string;
  size: number;
  passed: boolean;
  hasDrifted?: boolean;
  driftProgress?: number;
  originalLane?: LaneIndex;
  wobblePhase?: number;
}

export interface Collectible {
  id: number;
  lane: LaneIndex;
  visualX?: number;
  y: number;
  speed: number;
  type: 'ring' | 'coin';
  emoji: string;
  color: string;
  rotation: number;
  collected: boolean;
  value: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  alpha?: number;
  shape?: 'pixel' | 'sparkle' | 'circle';
}

export interface TireMark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

export interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  color: string;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}
