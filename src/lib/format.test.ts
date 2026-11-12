import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from './format';

describe('parseTime', () => {
  it('reads minutes and seconds', () => {
    expect(parseTime('1:23')).toBe(83);
    expect(parseTime('1:23.5')).toBe(83.5);
    expect(parseTime('0:05')).toBe(5);
    expect(parseTime(' 2:00 ')).toBe(120);
  });

  it('reads plain seconds', () => {
    expect(parseTime('83')).toBe(83);
    expect(parseTime('7.25')).toBe(7.25);
    expect(parseTime('.5')).toBe(0.5);
  });

  it('reads negative and lead-in times', () => {
    expect(parseTime('-5')).toBe(-5);
    expect(parseTime('T-0:05')).toBe(-5);
    expect(parseTime('t-0:10.0')).toBe(-10);
  });

  it('reads back what formatTime writes', () => {
    for (const t of [0, 4.2, 59.9, 61.3, 754.1, -8.5]) expect(parseTime(formatTime(t))).toBeCloseTo(t, 5);
  });

  it('rejects anything else', () => {
    for (const s of ['', ':', 'abc', '1:2:3', '1:', '--5', '5s']) expect(parseTime(s)).toBeNull();
  });
});
