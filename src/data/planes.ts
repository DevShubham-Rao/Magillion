/**
 * The Planeswalk
 * ==============
 *
 * Your running score for the day carries your spark outward, plane by plane,
 * from Dominaria toward the Blind Eternities. `reach` is the total that
 * lands you on a plane. Seven commons stay near home; a run of forgotten
 * cards walks you off the edge of the Multiverse.
 */

export interface Plane {
  id: string;
  name: string;
  /** Running total (points) that reaches this plane. */
  reach: number;
  /** One line of flavor, shown when you arrive. */
  line: string;
  accent: string;
  /** Backdrop colors while you're here. */
  sky: { top: string; bottom: string; glow: string };
}

export const PLANES: readonly Plane[] = [
  {
    id: 'dominaria',
    name: 'Dominaria',
    reach: 0,
    line: 'Where every walk begins.',
    accent: '#C8AA6E',
    sky: { top: '#19160f', bottom: '#0b0d13', glow: 'rgba(200,170,110,0.16)' },
  },
  {
    id: 'ravnica',
    name: 'Ravnica',
    reach: 300,
    line: 'A city that covers the whole world.',
    accent: '#9BB3D6',
    sky: { top: '#131926', bottom: '#0a0c12', glow: 'rgba(155,179,214,0.16)' },
  },
  {
    id: 'theros',
    name: 'Theros',
    reach: 700,
    line: 'Where belief gives the gods their shape.',
    accent: '#E8C872',
    sky: { top: '#0f1430', bottom: '#090b17', glow: 'rgba(232,200,114,0.15)' },
  },
  {
    id: 'innistrad',
    name: 'Innistrad',
    reach: 1200,
    line: 'Bolt the door before the moon rises.',
    accent: '#B9C4D4',
    sky: { top: '#10141b', bottom: '#07090d', glow: 'rgba(185,196,212,0.12)' },
  },
  {
    id: 'zendikar',
    name: 'Zendikar',
    reach: 1800,
    line: 'Even the land is trying to kill you.',
    accent: '#6FBF8E',
    sky: { top: '#0c1914', bottom: '#060c0a', glow: 'rgba(111,191,142,0.15)' },
  },
  {
    id: 'kamigawa',
    name: 'Kamigawa',
    reach: 2500,
    line: 'Spirits, steel and neon light.',
    accent: '#E86F8E',
    sky: { top: '#1a0e1c', bottom: '#09060c', glow: 'rgba(232,111,142,0.15)' },
  },
  {
    id: 'kaldheim',
    name: 'Kaldheim',
    reach: 3300,
    line: 'Ten realms on the branches of the World Tree.',
    accent: '#8FD3E8',
    sky: { top: '#0a1720', bottom: '#050a0f', glow: 'rgba(143,211,232,0.15)' },
  },
  {
    id: 'new-phyrexia',
    name: 'New Phyrexia',
    reach: 4200,
    line: 'Everything here is being perfected.',
    accent: '#A4D65E',
    sky: { top: '#0e1409', bottom: '#060805', glow: 'rgba(164,214,94,0.13)' },
  },
  {
    id: 'ulgrotha',
    name: 'Ulgrotha',
    reach: 5200,
    line: 'Hardly anyone remembers this plane exists.',
    accent: '#C98A5A',
    sky: { top: '#1a100a', bottom: '#090605', glow: 'rgba(201,138,90,0.14)' },
  },
  {
    id: 'blind-eternities',
    name: 'The Blind Eternities',
    reach: 6300,
    line: 'Past every plane, where only the rarest sparks drift.',
    accent: '#F2D5FF',
    sky: { top: '#0c0716', bottom: '#030206', glow: 'rgba(242,213,255,0.15)' },
  },
];

export interface PlanarPosition {
  plane: Plane;
  index: number;
  next: Plane | null;
  /** 0–1 along the path from this plane to the next. */
  progress: number;
  /** 0–1 along the whole walk, for drawing the spark. */
  depth: number;
}

export function planarPosition(total: number): PlanarPosition {
  let index = 0;
  for (let i = 0; i < PLANES.length; i++) if (total >= (PLANES[i] as Plane).reach) index = i;
  const plane = PLANES[index] as Plane;
  const next = PLANES[index + 1] ?? null;
  const progress = next ? Math.min(1, Math.max(0, (total - plane.reach) / (next.reach - plane.reach))) : 1;
  const depth = Math.min(1, (index + (next ? progress : 0)) / (PLANES.length - 1));
  return { plane, index, next, progress, depth };
}
