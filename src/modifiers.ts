/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModifierId =
  | 'rush'
  | 'magnet'
  | 'mini'
  | 'armor'
  | 'slowmo';

export interface ModifierDefinition {
  id: ModifierId;
  name: string;
  emoji: string;
  description: string;
  color: string;
  borderColor: string;
}

export const MODIFIER_POOL: Record<ModifierId, ModifierDefinition> = {
  rush: {
    id: 'rush',
    name: 'RUSH',
    emoji: '⚡',
    description: 'Score triples; game speed +40%;',
    color: '#ffdd00',
    borderColor: '#ffaa00',
  },
  magnet: {
    id: 'magnet',
    name: 'MAGNET',
    emoji: '🧲',
    description: 'Collect rings automatically; hazards are attracted to you.',
    color: '#ff00ff',
    borderColor: '#d400d4',
  },
  mini: {
    id: 'mini',
    name: 'MINI',
    emoji: '🔬',
    description: 'Hitbox half size; steering becomes twitchy.',
    color: '#39ff14',
    borderColor: '#2ecc71',
  },
  armor: {
    id: 'armor',
    name: 'ARMOR',
    emoji: '🔰',
    description: 'One‑time crash protection; lane switching feels heavy.',
    color: '#ff9900',
    borderColor: '#e67e22',
  },
  slowmo: {
    id: 'slowmo',
    name: 'SLOW-MO',
    emoji: '⏳',
    description: 'Play at 0.65× speed; peripheral vision darkened.',
    color: '#a78bfa',
    borderColor: '#8b5cf6',
  },
};

export const ALL_MODIFIER_IDS: ModifierId[] = [
  'rush',
  'magnet',
  'mini',
  'armor',
  'slowmo',
];

/**
 * Draw exactly 3 unique modifiers randomly from the pool of 5 (Rush, Magnet, Mini, Armor, Slow-Mo)
 */
export function drawDraftModifiers(): ModifierDefinition[] {
  const pool = [...ALL_MODIFIER_IDS];
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [MODIFIER_POOL[pool[0]], MODIFIER_POOL[pool[1]], MODIFIER_POOL[pool[2]]];
}

export class ModifierManager {
  public activeModifier: ModifierId | null = null;
  public armorCharge: boolean = false;
  public scorePausedTimer: number = 0;
  public clearCooldownTimer: number = 0;
  public shockwaveRadius: number = 0;
  public shockwaveActive: boolean = false;

  public initRun(id: ModifierId) {
    this.activeModifier = id;
    this.armorCharge = id === 'armor';
    this.scorePausedTimer = 0;
    this.clearCooldownTimer = 0;
    this.shockwaveRadius = 0;
    this.shockwaveActive = false;
  }

  public reset() {
    this.activeModifier = null;
    this.armorCharge = false;
    this.scorePausedTimer = 0;
    this.clearCooldownTimer = 0;
    this.shockwaveRadius = 0;
    this.shockwaveActive = false;
  }

  public getActiveDefinition(): ModifierDefinition | null {
    if (!this.activeModifier) return null;
    return MODIFIER_POOL[this.activeModifier];
  }

  // --- BUFF / DEBUFF QUERY HELPERS ---
  public getScoreMultiplier(): number {
    if (this.scorePausedTimer > 0) return 0;
    if (this.activeModifier === 'rush') return 3.0;
    return 1.0;
  }

  public getSpeedMultiplier(): number {
    if (this.activeModifier === 'rush') return 1.4;
    if (this.activeModifier === 'slowmo') return 0.65;
    return 1.0;
  }

  public canCollectRings(): boolean {
    return true;
  }

  public isMagnetPermanent(): boolean {
    return this.activeModifier === 'magnet';
  }

  public doesMagnetPullObstacles(): boolean {
    return this.activeModifier === 'magnet';
  }

  public isMini(): boolean {
    return this.activeModifier === 'mini';
  }

  public hasSlowMoVignette(): boolean {
    return this.activeModifier === 'slowmo';
  }

  public isSteeringHeavy(): boolean {
    return this.activeModifier === 'armor';
  }

  public isSteeringTwitchy(): boolean {
    return this.activeModifier === 'mini';
  }

  public canUseClear(): boolean {
    return false;
  }

  /**
   * Triggers Clear EMP ability.
   * Returns true if successful.
   */
  public triggerClear(): boolean {
    if (!this.canUseClear()) return false;
    this.scorePausedTimer = 3.0;
    this.clearCooldownTimer = 4.0; // 4s cooldown
    this.shockwaveActive = true;
    this.shockwaveRadius = 10;
    return true;
  }

  /**
   * Checks if armor can absorb a lethal crash.
   * Returns true if saved by armor.
   */
  public consumeArmor(): boolean {
    if (this.activeModifier === 'armor' && this.armorCharge) {
      this.armorCharge = false;
      return true;
    }
    return false;
  }

  public update(dt: number) {
    if (this.scorePausedTimer > 0) {
      this.scorePausedTimer = Math.max(0, this.scorePausedTimer - dt);
    }
    if (this.clearCooldownTimer > 0) {
      this.clearCooldownTimer = Math.max(0, this.clearCooldownTimer - dt);
    }
    if (this.shockwaveActive) {
      this.shockwaveRadius += dt * 900;
      if (this.shockwaveRadius > 750) {
        this.shockwaveActive = false;
        this.shockwaveRadius = 0;
      }
    }
  }
}
