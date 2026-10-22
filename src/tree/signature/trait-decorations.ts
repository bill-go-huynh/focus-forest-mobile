import type { KnownTrait } from '../visual-state';
import type { Decoration } from './stages';

/**
 * How milestone traits look on the signature species (docs/03 §4, docs/07 §5: the server says
 * which traits a tree earned, the client decides how each looks). Visuals are mapped by exact
 * stable trait identifier, never by numeric approximation: the milestone values are server
 * configuration, so an id without authored art here (a future `streak-days:60`) is kept as data
 * and counted in the description, but nothing is drawn for it. Each decoration is drawn once.
 */
const TRAIT_LOOKS: Readonly<Record<string, TraitLook>> = {
  'streak-days:3': { decoration: 'hanging-bloom', name: 'a hanging bloom' },
  'streak-days:7': { decoration: 'songbird-nest', name: "a songbird's nest" },
  'streak-days:14': { decoration: 'vine-ribbon', name: 'a ribbon of vines' },
  'streak-days:30': { decoration: 'lantern-flower', name: 'a lantern-flower' },
  'monthly-focus-hours:10': { decoration: 'seedpod', name: 'a hanging seedpod' },
  'monthly-focus-hours:25': { decoration: 'heartwood-ring', name: 'a heartwood ring' },
  'monthly-focus-hours:40': { decoration: 'golden-leaf', name: 'a golden leaf' },
};

export interface TraitLook {
  decoration: Decoration;
  /** The decoration in words, for the tree's description. */
  name: string;
}

export function traitLook(trait: KnownTrait): TraitLook | null {
  return Object.hasOwn(TRAIT_LOOKS, trait.id) ? TRAIT_LOOKS[trait.id]! : null;
}
