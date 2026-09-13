import type { Settings } from '../model/schema';

type Units = Settings['units'];

export function formatLengthIn(inches: number, units: Units): string {
  if (units === 'metric') {
    const cm = inches * 2.54;
    return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(0)} cm`;
  }
  if (inches >= 24) {
    const ft = Math.floor(inches / 12);
    const rem = Math.round(inches - ft * 12);
    return rem ? `${ft} ft ${rem} in` : `${ft} ft`;
  }
  return `${round(inches, 1)} in`;
}

export function formatLengthFt(feet: number, units: Units): string {
  return units === 'metric' ? `${round(feet * 0.3048, 1)} m` : `${round(feet, 1)} ft`;
}

/** Input helpers: the small unit shown next to length inputs and conversions to/from inches. */
export function smallUnit(units: Units) {
  return units === 'metric' ? 'cm' : 'in';
}
export function inchesToDisplay(inches: number, units: Units) {
  return units === 'metric' ? round(inches * 2.54, 1) : round(inches, 2);
}
export function displayToInches(value: number, units: Units) {
  return units === 'metric' ? value / 2.54 : value;
}
export function bigUnit(units: Units) {
  return units === 'metric' ? 'm' : 'ft';
}
export function feetToDisplay(feet: number, units: Units) {
  return units === 'metric' ? round(feet * 0.3048, 1) : round(feet, 1);
}
export function displayToFeet(value: number, units: Units) {
  return units === 'metric' ? value / 0.3048 : value;
}

export function formatTime(sec: number, decimals = 1): string {
  const sign = sec < 0 ? '-' : '';
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const restStr = rest.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0');
  return `${sign}${m}:${restStr}`;
}

export function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
