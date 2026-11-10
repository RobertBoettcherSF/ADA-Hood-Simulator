import { readLocalData, type GraphicsChoice } from './localData';

/** A phone is a narrow touch screen, or a device that reports little memory. */
export function deviceIsPhone(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 820;
  const touch = navigator.maxTouchPoints > 0;
  return narrow && (touch || (memory != null && memory <= 4));
}

export function resolvedGraphics(choice: GraphicsChoice = readLocalData().graphics): 'phone' | 'desktop' {
  if (choice === 'phone' || choice === 'desktop') return choice;
  return deviceIsPhone() ? 'phone' : 'desktop';
}
