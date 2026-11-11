import { readLocalData, type GraphicsChoice } from './localData';

/** A phone is a narrow touch screen, or a device that reports little memory.
 * The physical screen is included so Safari's desktop-site layout (a wide
 * viewport on a phone) is still a phone. */
export function deviceIsPhone(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const viewport = Math.min(window.innerWidth, window.innerHeight);
  const panel = typeof screen === 'undefined' ? viewport : Math.min(screen.width, screen.height);
  const narrow = Math.min(viewport, panel) <= 820;
  const touch = navigator.maxTouchPoints > 0;
  return narrow && (touch || (memory != null && memory <= 4));
}

export function resolvedGraphics(choice: GraphicsChoice = readLocalData().graphics): 'phone' | 'desktop' {
  if (choice === 'phone' || choice === 'desktop') return choice;
  return deviceIsPhone() ? 'phone' : 'desktop';
}
