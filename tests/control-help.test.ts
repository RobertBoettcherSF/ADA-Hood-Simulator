import { describe, expect, it } from 'vitest';
import { CONTROL_SELECTOR, controlHelp, controlHelpFor } from '../src/ui/controlHelp';

const el = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null }) as unknown as Element;

describe('left lieutenant panel help', () => {
  it('badges and lines get help through data-help', () => {
    expect(CONTROL_SELECTOR).toContain('[data-help]');
    expect(CONTROL_SELECTOR).toContain('[data-person-id]');
    for (const name of ['loyalty', 'wanted', 'pay line', 'crew roster', 'skill stars', 'week assigned', 'order queue', 'gang details', 'gang assets'])
      expect(controlHelpFor(el({ 'data-help': name }), 'whatever')?.body, name).toBeTruthy();
  });
  it('every button on the panel has an entry', () => {
    for (const label of ['Sack', 'Kill', 'Demote', 'Skills', 'Team', 'Pay', 'Territory · 4', 'Business Orders', 'Personnel Orders', 'Minor Crimes',
      'Violent Crimes', 'Orders', 'Reports', 'Clipboard', 'Hoods · 2', 'Weapons', 'Vehicles', 'Recruitment · 1', 'Edit', 'Repeat order', 'Interrogate', 'Release'])
      expect(controlHelp(label), label).toBeTruthy();
  });
});
