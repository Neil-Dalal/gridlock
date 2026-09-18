import { LaneIndex, PowerUpType, PowerUp, ActiveBuff } from './types';

export class PowerUpDrop implements PowerUp {
  id: number;
  lane: LaneIndex;
  visualX: number;
  y: number;
  speed: number;
  type: PowerUpType;
  emoji: string;
  name: string;
  color: string;
  duration: number;
  pulsePhase: number = 0;
  collected: boolean = false;

  constructor(id: number, lane: LaneIndex, x: number, speed: number, type: PowerUpType) {
    this.id = id;
    this.lane = lane;
    this.visualX = x;
    this.y = -45;
    this.speed = speed;
    this.type = type;

    if (type === 'mystery_box') {
      this.emoji = '❓';
      this.name = 'ITEM BOX';
      this.color = '#ffcc00';
      this.duration = 0;
    } else if (type === 'shield') {
      this.emoji = '🛡️';
      this.name = 'SHIELD';
      this.color = '#00f0ff';
      this.duration = 0; // Active until next collision
    } else if (type === 'clear') {
      this.emoji = '💥';
      this.name = 'EMP CLEAR';
      this.color = '#ff007f';
      this.duration = 3.0; // 3.0s score pause
    } else if (type === 'magnet') {
      this.emoji = '🧲';
      this.name = 'MAGNET';
      this.color = '#ff00ff';
      this.duration = 6.0; // 6 seconds ring magnet
    } else {
      this.emoji = '🧊';
      this.name = 'FREEZE';
      this.color = '#80e5ff';
      this.duration = 1.5; // 1.5 seconds frozen in lane
    }
  }

  update(dt: number) {
    this.y += this.speed * dt;
    this.pulsePhase += dt * 5.5;
  }
}

export class BuffManager {
  hasShieldCharge: boolean = false;
  scorePausedTimer: number = 0;
  magnetTimer: number = 0;
  freezeTimer: number = 0;

  activate(type: PowerUpType): number {
    if (type === 'shield') {
      this.hasShieldCharge = true;
      return 1;
    } else if (type === 'clear') {
      this.scorePausedTimer = 3.0;
      return 3.0;
    } else if (type === 'magnet') {
      this.magnetTimer = 6.0;
      return 6.0;
    } else if (type === 'freeze') {
      this.freezeTimer = 1.5;
      return 1.5;
    }
    return 0;
  }

  update(dt: number) {
    if (this.scorePausedTimer > 0) this.scorePausedTimer = Math.max(0, this.scorePausedTimer - dt);
    if (this.magnetTimer > 0) this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);
  }

  isShieldActive(): boolean {
    return this.hasShieldCharge;
  }

  consumeShield(): boolean {
    if (this.hasShieldCharge) {
      this.hasShieldCharge = false;
      return true;
    }
    return false;
  }

  isMagnetActive(): boolean {
    return this.magnetTimer > 0;
  }

  isFrozen(): boolean {
    return this.freezeTimer > 0;
  }

  isScorePaused(): boolean {
    return this.scorePausedTimer > 0;
  }

  getActiveBuffs(): ActiveBuff[] {
    const buffs: ActiveBuff[] = [];
    if (this.hasShieldCharge) {
      buffs.push({
        type: 'shield',
        name: 'SHIELD (1-HIT)',
        emoji: '🛡️',
        color: '#00f0ff',
        remaining: 1,
        totalDuration: 1,
      });
    }
    if (this.scorePausedTimer > 0) {
      buffs.push({
        type: 'clear',
        name: 'SCORE PAUSED',
        emoji: '⚡',
        color: '#ffcc00',
        remaining: this.scorePausedTimer,
        totalDuration: 3.0,
      });
    }
    if (this.magnetTimer > 0) {
      buffs.push({
        type: 'magnet',
        name: 'MAGNET',
        emoji: '🧲',
        color: '#ff00ff',
        remaining: this.magnetTimer,
        totalDuration: 6.0,
      });
    }
    if (this.freezeTimer > 0) {
      buffs.push({
        type: 'freeze',
        name: 'FROZEN',
        emoji: '🧊',
        color: '#80e5ff',
        remaining: this.freezeTimer,
        totalDuration: 1.5,
      });
    }
    return buffs;
  }

  reset() {
    this.hasShieldCharge = false;
    this.scorePausedTimer = 0;
    this.magnetTimer = 0;
    this.freezeTimer = 0;
  }
}

export function selectRandomPowerUp(): PowerUpType {
  const options: PowerUpType[] = ['magnet', 'clear', 'shield'];
  return options[Math.floor(Math.random() * options.length)];
}

