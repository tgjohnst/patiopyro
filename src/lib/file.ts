import { parseShow, type Show } from '../model/schema';

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string, ext: string) {
  const base = name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'show';
  return `${base}.${ext}`;
}

export function saveShowFile(show: Show) {
  const blob = new Blob([JSON.stringify(show, null, 2)], { type: 'application/json' });
  downloadBlob(safeFilename(show.meta.name, 'patiopyro.json'), blob);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function openShowFile(): Promise<Show | null> {
  const file = await pickFile('.json,application/json');
  if (!file) return null;
  return parseShow(JSON.parse(await file.text()));
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
