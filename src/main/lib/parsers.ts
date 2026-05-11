/**
 * Pure parsers for output produced by remote-host commands.
 *
 * Centralized so services stay focused on orchestration and so each parser
 * is independently testable. Every function here is total: invalid input
 * returns sensible defaults rather than throwing, because remote SSH
 * output is regularly noisy (kernel messages on stderr, partial lines,
 * locale variation, etc.).
 */

import type { ClusterNodeStatus } from '@shared/types';

/**
 * Parse `uptime -p` output (e.g. `up 2 weeks, 3 days, 4 hours, 10 minutes`)
 * into seconds. Handles weeks (which the previous impl ignored).
 */
export function parseUptime(input: string): number {
    if (!input) return 0;
    const units: Array<{ pattern: RegExp; multiplier: number }> = [
        { pattern: /(\d+)\s+year/i,   multiplier: 365 * 86400 },
        { pattern: /(\d+)\s+month/i,  multiplier: 30 * 86400 },
        { pattern: /(\d+)\s+week/i,   multiplier: 7 * 86400 },
        { pattern: /(\d+)\s+day/i,    multiplier: 86400 },
        { pattern: /(\d+)\s+hour/i,   multiplier: 3600 },
        { pattern: /(\d+)\s+minute/i, multiplier: 60 },
        { pattern: /(\d+)\s+second/i, multiplier: 1 },
    ];
    let total = 0;
    for (const { pattern, multiplier } of units) {
        const m = input.match(pattern);
        if (m?.[1]) {
            total += parseInt(m[1], 10) * multiplier;
        }
    }
    return total;
}

/** Parse `cat /proc/loadavg` (or `uptime` averages) into a 3-tuple. */
export function parseLoadAverage(input: string): [number, number, number] {
    const parts = (input ?? '').trim().split(/\s+/);
    return [
        Number.parseFloat(parts[0] ?? '') || 0,
        Number.parseFloat(parts[1] ?? '') || 0,
        Number.parseFloat(parts[2] ?? '') || 0,
    ];
}

/**
 * Parse the body of `virsh dominfo <vm>`. Lines look like:
 *   Id:             3
 *   Name:           web01
 *   UUID:           f1e2d3c4-...
 *   State:          running
 *   Max memory:     4194304 KiB
 *   Used memory:    4194304 KiB
 *   Persistent:     yes
 *   Autostart:      enable
 */
export function parseDominfo(output: string): {
    id: string;
    name: string;
    uuid: string;
    state: string;
    maxMemoryBytes: number;
    usedMemoryBytes: number;
    persistent: boolean;
    autostart: boolean;
} {
    const map: Record<string, string> = {};
    for (const line of output.split('\n')) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        map[key] = value;
    }
    const parseKiB = (s: string | undefined): number => {
        if (!s) return 0;
        const m = s.match(/(\d+)/);
        return m?.[1] ? parseInt(m[1], 10) * 1024 : 0;
    };
    return {
        id: map['Id'] ?? '',
        name: map['Name'] ?? '',
        uuid: map['UUID'] ?? '',
        state: map['State'] ?? 'shut off',
        maxMemoryBytes: parseKiB(map['Max memory']),
        usedMemoryBytes: parseKiB(map['Used memory']),
        persistent: /yes|true/i.test(map['Persistent'] ?? ''),
        autostart: /(yes|enable)/i.test(map['Autostart'] ?? ''),
    };
}

/**
 * Parse `virsh vcpucount <vm>` which prints lines like
 *   maximum      config         8
 *   maximum      live           8
 *   current      config         4
 *   current      live           4
 * Returns the largest live values.
 */
export function parseVcpucount(output: string): { current: number; maximum: number } {
    let current = 0;
    let maximum = 0;
    for (const line of output.split('\n')) {
        const trimmed = line.trim();
        const match = trimmed.match(/^(maximum|current)\s+(config|live)\s+(\d+)/i);
        if (!match?.[1] || !match[3]) continue;
        const value = parseInt(match[3], 10);
        const kind = match[1].toLowerCase();
        if (kind === 'maximum' && value > maximum) maximum = value;
        if (kind === 'current' && value > current) current = value;
    }
    return { current, maximum };
}

/**
 * Parse `virsh domblklist <vm> --details` output. Format is a header line
 * (`Type   Device   Target   Source`), a separator, then rows.
 *
 * BUG-007: previous implementation used `split('\s+')` (literal) which
 * never matched whitespace. This parser uses a real regex and skips the
 * header/separator lines correctly.
 */
export function parseDomblklist(output: string): Array<{ device: string; target: string; source: string }> {
    const rows: Array<{ device: string; target: string; source: string }> = [];
    const lines = output.split('\n');
    let inBody = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // Match the separator row: either continuous dashes (`---------`) or
        // dash-runs separated by whitespace (`---- ---- ----`).
        if (/^-{3,}(\s+-+)*\s*$/.test(line)) { inBody = true; continue; }
        if (!inBody) continue;
        const parts = line.split(/\s+/);
        // Possible columns: type, device, target, source
        if (parts.length === 4) {
            rows.push({ device: parts[1] ?? '', target: parts[2] ?? '', source: parts[3] ?? '' });
        } else if (parts.length === 3) {
            // Older virsh format without `Type` column.
            rows.push({ device: parts[0] ?? '', target: parts[1] ?? '', source: parts[2] ?? '' });
        } else if (parts.length === 2) {
            rows.push({ device: 'disk', target: parts[0] ?? '', source: parts[1] ?? '' });
        }
    }
    return rows;
}

/** Parse `virsh domiflist <vm>` similarly. */
export function parseDomiflist(output: string): Array<{
    iface: string;
    type: string;
    source: string;
    model: string;
    macAddress: string;
}> {
    const rows: Array<{ iface: string; type: string; source: string; model: string; macAddress: string }> = [];
    const lines = output.split('\n');
    let inBody = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // Match the separator row: either continuous dashes (`---------`) or
        // dash-runs separated by whitespace (`---- ---- ----`).
        if (/^-{3,}(\s+-+)*\s*$/.test(line)) { inBody = true; continue; }
        if (!inBody) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
            const iface = parts[0] ?? '';
            const type = parts[1] ?? '';
            const source = parts[2] ?? '';
            const model = parts[3] ?? '';
            const mac = parts.slice(4).join(' ');
            rows.push({ iface, type, source, model, macAddress: mac });
        }
    }
    return rows;
}

/**
 * Parse `cat /proc/meminfo` into bytes-per-key. Values are in kB; the
 * file format is `MemTotal:      8123456 kB`.
 */
export function parseMeminfo(output: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const line of output.split('\n')) {
        const m = line.match(/^([A-Za-z()_]+):\s*(\d+)\s*(kB|KiB)?/i);
        if (!m) continue;
        const key = m[1];
        const numericText = m[2];
        if (!key || !numericText) continue;
        const value = parseInt(numericText, 10);
        const bytes = (m[3] ?? '').length > 0 ? value * 1024 : value;
        result[key] = bytes;
    }
    return result;
}

/** Parse `cat /proc/stat` first line: `cpu user nice sys idle iowait irq softirq steal guest gnice`. */
export function parseProcStat(output: string): { idle: number; total: number } {
    const line = output.split('\n').find((l) => l.startsWith('cpu '));
    if (!line) return { idle: 0, total: 0 };
    const parts = line.trim().split(/\s+/).slice(1).map((p) => parseInt(p, 10) || 0);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
}

/** Parse `cat /proc/diskstats` returning aggregate read/write sectors. */
export function parseDiskstats(output: string): { readBytes: number; writeBytes: number } {
    let reads = 0;
    let writes = 0;
    for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 14) continue;
        // Skip partitions; major.minor numbers + name then 11 fields. We only
        // count whole disks (sda, vda, nvme0n1, etc. — name without trailing digits).
        const name = parts[2] ?? '';
        if (/\d$/.test(name)) {
            // partitions like sda1 — skip (they're already in sda)
            continue;
        }
        reads  += (parseInt(parts[5] ?? '', 10) || 0) * 512; // sectors read × 512 bytes
        writes += (parseInt(parts[9] ?? '', 10) || 0) * 512;
    }
    return { readBytes: reads, writeBytes: writes };
}

/** Parse `cat /proc/net/dev` returning aggregate rx/tx bytes (excluding `lo`). */
export function parseNetDev(output: string): { rxBytes: number; txBytes: number; errors: number } {
    let rx = 0;
    let tx = 0;
    let errors = 0;
    for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const iface = trimmed.slice(0, colonIdx).trim();
        if (iface === 'lo' || iface === 'Inter-' || iface === 'face') continue;
        const parts = trimmed.slice(colonIdx + 1).trim().split(/\s+/).map((p) => parseInt(p, 10) || 0);
        // /proc/net/dev columns: rx_bytes, rx_packets, rx_errs, rx_drop, rx_fifo,
        // rx_frame, rx_compressed, rx_multicast, tx_bytes, tx_packets, tx_errs, ...
        rx     += parts[0] ?? 0;
        errors += (parts[2] ?? 0) + (parts[10] ?? 0);
        tx     += parts[8] ?? 0;
    }
    return { rxBytes: rx, txBytes: tx, errors };
}

/**
 * Parse `pcs status xml` — a structured XML document with <nodes>, <quorum>,
 * <current_dc>, etc. We use a minimal regex-based extractor rather than a
 * full XML parser to avoid pulling in a dependency for this single use.
 *
 * For production-grade parsing consider adopting `fast-xml-parser`.
 */
export function parsePcsStatusXml(xml: string): {
    quorate: boolean;
    nodes: ClusterNodeStatus[];
    dcName: string | null;
} {
    // `pcs status xml` contains <node> elements in multiple sections —
    // <nodes>, <node_history> under <resources>, sometimes inside resource
    // attributes — so a global match yields duplicates. Restrict the scan to
    // the top-level <nodes>…</nodes> block, then dedupe by name as a final
    // safety net.
    const nodesBlock = /<nodes\b[^>]*>([\s\S]*?)<\/nodes>/.exec(xml)?.[1] ?? '';
    const nodes: ClusterNodeStatus[] = [];
    const seen = new Set<string>();
    const nodeRegex = /<node\b([^>]*?)\/?>/g;
    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(nodesBlock)) !== null) {
        const attrs = match[1] ?? '';
        const name = /\bname="([^"]+)"/.exec(attrs)?.[1] ?? '';
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const onlineAttr = /\bonline="([^"]+)"/.exec(attrs)?.[1];
        const standbyAttr = /\bstandby="([^"]+)"/.exec(attrs)?.[1];
        let status: ClusterNodeStatus['status'] = 'Offline';
        if (standbyAttr === 'true') status = 'Standby';
        else if (onlineAttr === 'true') status = 'Online';
        const ringId = parseInt(/\bid="(\d+)"/.exec(attrs)?.[1] ?? '0', 10);
        nodes.push({ name, status, votes: 1, ringId });
    }
    const quorate = /\bwith_quorum="true"/.test(xml);
    const dcName = /\bcurrent_dc[^>]*\bname="([^"]+)"/.exec(xml)?.[1] ?? null;
    return { quorate, nodes, dcName };
}
