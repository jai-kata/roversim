import type { Requirement } from '../lang/analysis';
import type { Cell, Pose } from '../sim/world';

export type { Requirement } from '../lang/analysis';

// Shape of the JSON files in this folder.
export interface LevelVariant {
  start: Pose;
  goal: Cell | null;
  walls: [number, number][];
  checkpoints: Cell[];
}

export interface Level {
  id: number;
  title: string;
  concept: string;
  instructions: string;
  note?: string; // extra line under the instructions, in pencil
  starterCode: string;
  grid: { w: number; h: number };
  variants: LevelVariant[];
  maxCommands: number | null;
  requires: Requirement[];
  hint: string;
  solution: string;
}
