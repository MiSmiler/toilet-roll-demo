import * as THREE from 'three'

/** The three looks a cut can wear, plainest first. There is no drop table yet. */
export type Rarity = 'rare' | 'epic' | 'legendary'

export type RarityLook = {
  id: Rarity
  /** Short name for the lab's radio buttons. */
  label: string
  /** The hairline's colour once the pull is strained all the way. */
  core: THREE.Color
  /** The colour of the light spilling off the line. */
  glow: THREE.Color
  /** How much brighter than the plain white beam the spill burns at full strain. */
  glowGain: number
  /**
   * How far the light is split into a spectrum. Zero for every rarity but the
   * one that has to be worth the wait, so the cheaper looks are left alone.
   */
  spectrum: number
}

export const RARITIES: readonly RarityLook[] = [
  {
    id: 'rare',
    label: '蓝',
    core: new THREE.Color('#9fd4ff'),
    glow: new THREE.Color('#3f8bff'),
    glowGain: 1.9,
    spectrum: 0,
  },
  {
    id: 'epic',
    label: '紫',
    core: new THREE.Color('#cfa6ff'),
    glow: new THREE.Color('#8a3bff'),
    glowGain: 2.6,
    spectrum: 0,
  },
  {
    id: 'legendary',
    label: '橙金',
    core: new THREE.Color('#ffd489'),
    glow: new THREE.Color('#ff9a26'),
    glowGain: 3.4,
    spectrum: 1,
  },
]

/** The look for a rarity; `RARITIES` above is the only source of these. */
export function findRarity(id: Rarity): RarityLook {
  const look = RARITIES.find((rarity) => rarity.id === id)
  if (!look) throw new Error(`Unknown rarity: ${id}`)
  return look
}
