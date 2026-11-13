// Kinderseiten: eigenes Tier und Begrüßung nach Tageszeit

export const TIERE = ['🦊', '🐉', '🦁', '🐼', '🐯', '🦄', '🐸', '🐙', '🦖', '🐬', '🦉', '🐻', '🐱', '🐶', '🐰', '🦈'];

export function begruessung(name, tier, hour = new Date().getHours()) {
  const g = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 20 ? 'Guten Abend' : 'Schlaf gut';
  return `${g}, ${name}${tier ? ` ${tier}` : ''}`;
}
