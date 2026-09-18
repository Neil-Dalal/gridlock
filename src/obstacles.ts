/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LaneIndex } from './types';

export type RoadwayHazardType =
  | 'construction_barricade'
  | 'detour_barricade'
  | 'heavy_blockade'
  | 'hazard_bollards'
  | 'oil_slick'
  | 'traffic_cones'
  | 'deep_pothole'
  | 'stalled_vehicle';

export interface RoadwayHazardTemplate {
  type: RoadwayHazardType;
  name: string;
  emoji: string;
  color: string;
  speedMult: number;
  width: number;
  height: number;
  isGroundTrap?: boolean; // oil slicks are ground traps that cause traction loss rather than instant fatal crash
}

export const ROADWAY_HAZARD_TEMPLATES: RoadwayHazardTemplate[] = [
  {
    type: 'construction_barricade',
    name: 'ROAD BARRICADE',
    emoji: '🚧',
    color: '#ffaa00',
    speedMult: 1.0,
    width: 76,
    height: 42,
  },
  {
    type: 'detour_barricade',
    name: 'DETOUR BLOCKADE',
    emoji: '🛑',
    color: '#ff3344',
    speedMult: 1.0,
    width: 76,
    height: 42,
  },
  {
    type: 'heavy_blockade',
    name: 'HEAVY BARRICADE',
    emoji: '⚠️',
    color: '#ff8800',
    speedMult: 1.0,
    width: 78,
    height: 44,
  },
  {
    type: 'hazard_bollards',
    name: 'BOLLARD GATE',
    emoji: '🚧',
    color: '#ffd000',
    speedMult: 1.0,
    width: 74,
    height: 40,
  },
  {
    type: 'oil_slick',
    name: 'OIL SLICK',
    emoji: '🛢️',
    color: '#382039',
    speedMult: 1.0,
    width: 66,
    height: 40,
    isGroundTrap: true,
  },
];

export class RoadwayObstacle {
  public id: number;
  public lane: LaneIndex;
  public visualX: number;
  public y: number;
  public speed: number;
  public speedMultiplier: number;
  public type: RoadwayHazardType;
  public name: string;
  public color: string;
  public width: number;
  public height: number;
  public isGroundTrap: boolean;
  public passed: boolean = false;
  public triggered: boolean = false; // for oil slick so it doesn't trigger multiple times in one drive-over
  public flashTimer: number = 0;
  public hazardBlink: boolean = false;

  constructor(
    id: number,
    lane: LaneIndex,
    x: number,
    y: number,
    speed: number,
    tmpl: RoadwayHazardTemplate
  ) {
    this.id = id;
    this.lane = lane;
    this.visualX = x;
    this.y = y;
    this.speed = speed;
    this.speedMultiplier = tmpl.speedMult;
    this.type = tmpl.type;
    this.name = tmpl.name;
    this.color = tmpl.color;
    this.width = tmpl.width;
    this.height = tmpl.height;
    this.isGroundTrap = !!tmpl.isGroundTrap;
  }

  public update(
    dt: number,
    baseSpeed: number,
    playerLane: LaneIndex,
    playerVisualX: number,
    pullTowardsPlayer: boolean
  ) {
    const effSpeed = baseSpeed * this.speedMultiplier;
    this.y += effSpeed * dt;

    // Flash timer for hazard lights on stalled cars and barricades
    this.flashTimer += dt * 4;
    this.hazardBlink = Math.sin(this.flashTimer * Math.PI) > 0;

    // MAGNET DEBUFF: Oncoming hazards are pulled slightly toward the player's current lane!
    if (pullTowardsPlayer && !this.passed && this.y < 500 && this.y > -20) {
      const pullDir = playerVisualX > this.visualX ? 1 : -1;
      const pullSpeed = 42 * dt;
      this.visualX += pullDir * pullSpeed;
    }
  }

  public getHitbox() {
    return {
      x: this.visualX - this.width / 2,
      y: this.y - this.height / 2,
      w: this.width,
      h: this.height,
    };
  }
}

/**
 * Handles the unique input-override logic for Oil Slick:
 * "If driven over or active, a single steering input counts as two lane shifts.
 * Special Rule: If the player is in the middle lane, the movement becomes cyclic
 * (e.g., steering left skips the left lane and instantly wraps the car over to the far right lane)."
 */
export function calculateOilSlickLaneShift(
  currentLane: LaneIndex,
  direction: 'left' | 'right'
): { targetLane: LaneIndex; wasCyclic: boolean } {
  // Middle Lane (Lane 1):
  // Cyclic rule: steering left skips left lane (0) and wraps to far right lane (2).
  // steering right skips right lane (2) and wraps to far left lane (0).
  if (currentLane === 1) {
    if (direction === 'left') {
      return { targetLane: 2, wasCyclic: true };
    } else {
      return { targetLane: 0, wasCyclic: true };
    }
  }

  // Left Lane (Lane 0):
  // Steering right counts as 2 lane shifts: 0 + 2 = 2 (Right lane).
  // Steering left: already at far left, cyclic wrap to Right lane (2).
  if (currentLane === 0) {
    if (direction === 'right') {
      return { targetLane: 2, wasCyclic: false };
    } else {
      return { targetLane: 2, wasCyclic: true };
    }
  }

  // Right Lane (Lane 2):
  // Steering left counts as 2 lane shifts: 2 - 2 = 0 (Left lane).
  // Steering right: already at far right, cyclic wrap to Left lane (0).
  if (currentLane === 2) {
    if (direction === 'left') {
      return { targetLane: 0, wasCyclic: false };
    } else {
      return { targetLane: 0, wasCyclic: true };
    }
  }

  return { targetLane: currentLane, wasCyclic: false };
}
