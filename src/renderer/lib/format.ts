/**
 * Formatting helpers shared across pages. Pure, no React imports.
 */

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

/** Bytes → "12.4 GB" */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= TB) return `${(bytes / TB).toFixed(fractionDigits)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(fractionDigits)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(fractionDigits)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(fractionDigits)} KB`;
  return `${bytes} B`;
}

/** Seconds → "12d 4h 30m" */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && days === 0) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${Math.round(seconds)}s`);
  return parts.join(' ');
}

/** ms-since-epoch → "2 min ago" / "yesterday" */
export function formatRelativeTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—';
  const delta = Date.now() - epochMs;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} hr ago`;
  return `${Math.round(delta / 86_400_000)} d ago`;
}

/** "12345" → "12,345" */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString();
}
