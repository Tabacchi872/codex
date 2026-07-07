// Registro dei suoni di recupero. A differenza dei video (nessun file reale ancora
// disponibile), questi 4 toni sono generati proceduralmente (mobile/assets/sounds/*.wav)
// e quindi realmente presenti e riproducibili, non placeholder. "Sirena" (aggiunta
// 2026-07-06) è un tono con frequenza oscillante 650-1300Hz, stessa tecnica di
// generazione degli altri tre — vedi docs/DECISIONS.md.
import type { SelectedSound } from '@/types/training';

export const SOUND_REGISTRY: Record<SelectedSound, number> = {
  beep: require('../../assets/sounds/beep.wav'),
  'double-beep': require('../../assets/sounds/double-beep.wav'),
  chime: require('../../assets/sounds/chime.wav'),
  sirena: require('../../assets/sounds/sirena.wav'),
};

export const SOUND_LABELS: Record<SelectedSound, string> = {
  beep: 'Beep singolo',
  'double-beep': 'Doppio beep',
  chime: 'Chime (3 toni)',
  sirena: 'Sirena',
};
