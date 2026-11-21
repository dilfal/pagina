import { describe, expect, it } from 'vitest';
import it_ from './it.json';
import en from './en.json';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('traduzioni', () => {
  it('it.json ed en.json hanno le stesse chiavi', () => {
    const a = Object.keys(it_).sort();
    const b = Object.keys(en).sort();
    expect(a).toEqual(b);
  });

  it('i segnaposto {nome} coincidono in ogni chiave', () => {
    for (const k of Object.keys(it_) as (keyof typeof it_)[]) {
      expect(placeholders(en[k]), k).toEqual(placeholders(it_[k]));
    }
  });

  it('nessuna traduzione è vuota', () => {
    for (const d of [it_, en]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });
});
