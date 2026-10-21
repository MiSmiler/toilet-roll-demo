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
}

export const RARITIES: readonly RarityLook[] = [
  {
    id: 'rare',
    label: '蓝',
    core: new THREE.Color('#9fd4ff'),
    glow: new THREE.Color('#3f8bff'),
    glowGain: 1.9,
  },
  {
    id: 'epic',
    label: '紫',
    core: new THREE.Color('#cfa6ff'),
    glow: new THREE.Color('#8a3bff'),
    glowGain: 2.6,
  },
  {
    id: 'legendary',
    label: '橙金',
    core: new THREE.Color('#ffd489'),
    glow: new THREE.Color('#ff9a26'),
    glowGain: 3.4,
  },
]

/** The look for a rarity; `RARITIES` above is the only source of these. */
export function findRarity(id: Rarity): RarityLook {
  const look = RARITIES.find((rarity) => rarity.id === id)
  if (!look) throw new Error(`Unknown rarity: ${id}`)
  return look
}
