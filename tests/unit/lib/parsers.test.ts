/**
 * Pure-function tests for `src/main/lib/parsers.ts`.
 *
 * Every fixture is a verbatim sample from the corresponding command on a
 * representative Linux host (CentOS 9 / Ubuntu 22.04). The parsers must
 * remain total — invalid input returns sensible defaults, never throws.
 */

import { describe, expect, it } from 'vitest';

import {
    parseDiskstats,
    parseDomblklist,
    parseDomiflist,
    parseDominfo,
    parseLoadAverage,
    parseMeminfo,
    parseNetDev,
    parsePcsStatusXml,
    parseProcStat,
    parseUptime,
    parseVcpucount,
} from '../../../src/main/lib/parsers';

describe('parseUptime', () => {
    it('handles "up X weeks, Y days, Z hours, W minutes"', () => {
        expect(parseUptime('up 2 weeks, 3 days, 4 hours, 10 minutes'))
            .toBe(2 * 7 * 86400 + 3 * 86400 + 4 * 3600 + 10 * 60);
    });
    it('handles fallback "N seconds" form', () => {
        expect(parseUptime('12345 seconds')).toBe(12345);
    });
    it('handles empty input', () => {
        expect(parseUptime('')).toBe(0);
    });
    it('does not double-count overlapping units', () => {
        expect(parseUptime('up 1 day')).toBe(86400);
    });
});

describe('parseLoadAverage', () => {
    it('parses /proc/loadavg-style triples', () => {
        expect(parseLoadAverage('0.40 0.32 0.21 1/512 1234')).toEqual([0.4, 0.32, 0.21]);
    });
    it('returns zeros on empty input', () => {
        expect(parseLoadAverage('')).toEqual([0, 0, 0]);
    });
});

describe('parseDominfo', () => {
    const fixture = `Id:             3
Name:           web01
UUID:           a1b2c3d4-aabb-ccdd-eeff-001122334455
OS Type:        hvm
State:          running
CPU(s):         4
Max memory:     4194304 KiB
Used memory:    4194304 KiB
Persistent:     yes
Autostart:      enable
`;
    it('extracts uuid / state / memory / flags', () => {
        const r = parseDominfo(fixture);
        expect(r.uuid).toBe('a1b2c3d4-aabb-ccdd-eeff-001122334455');
        expect(r.state).toBe('running');
        expect(r.maxMemoryBytes).toBe(4194304 * 1024);
        expect(r.usedMemoryBytes).toBe(4194304 * 1024);
        expect(r.persistent).toBe(true);
        expect(r.autostart).toBe(true);
    });
    it('returns shut-off default for empty input', () => {
        const r = parseDominfo('');
        expect(r.state).toBe('shut off');
        expect(r.maxMemoryBytes).toBe(0);
    });
});

describe('parseVcpucount', () => {
    const fixture = `maximum      config         8
maximum      live           8
current      config         4
current      live           4
`;
    it('returns the largest live values', () => {
        const r = parseVcpucount(fixture);
        expect(r.current).toBe(4);
        expect(r.maximum).toBe(8);
    });
});

describe('parseDomblklist', () => {
    it('parses --details output', () => {
        const fixture = ` Type   Device   Target   Source
-----------------------------------
 file   disk     vda      /var/lib/libvirt/images/web01.qcow2
 file   disk     vdb      /var/lib/libvirt/images/web01-data.qcow2
 file   cdrom    hdc      /var/lib/libvirt/iso/install.iso
`;
        const rows = parseDomblklist(fixture);
        expect(rows).toEqual([
            { device: 'disk', target: 'vda', source: '/var/lib/libvirt/images/web01.qcow2' },
            { device: 'disk', target: 'vdb', source: '/var/lib/libvirt/images/web01-data.qcow2' },
            { device: 'cdrom', target: 'hdc', source: '/var/lib/libvirt/iso/install.iso' },
        ]);
    });
    it('returns [] on header-only output', () => {
        expect(parseDomblklist(' Target  Source\n-----  -----\n')).toEqual([]);
    });
});

describe('parseDomiflist', () => {
    it('parses iface rows', () => {
        const fixture = ` Interface  Type      Source     Model    MAC
-----------------------------------------------------------
 vnet0      bridge    br0        virtio   52:54:00:aa:bb:cc
 vnet1      network   default    virtio   52:54:00:dd:ee:ff
`;
        const rows = parseDomiflist(fixture);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ iface: 'vnet0', type: 'bridge', source: 'br0', model: 'virtio', macAddress: '52:54:00:aa:bb:cc' });
    });
});

describe('parseMeminfo', () => {
    it('returns bytes-per-key', () => {
        const r = parseMeminfo(`MemTotal:       8123456 kB
MemFree:        1024000 kB
MemAvailable:   2048000 kB
Cached:         512000 kB
`);
        expect(r['MemTotal']).toBe(8123456 * 1024);
        expect(r['MemAvailable']).toBe(2048000 * 1024);
    });
});

describe('parseProcStat', () => {
    it('computes idle + total', () => {
        const r = parseProcStat('cpu  100 0 200 1500 50 0 10 0 0 0\n');
        expect(r.idle).toBe(1500 + 50);
        expect(r.total).toBe(100 + 200 + 1500 + 50 + 10);
    });
    it('returns zeros when no `cpu ` row', () => {
        expect(parseProcStat('whatever')).toEqual({ idle: 0, total: 0 });
    });
});

describe('parseDiskstats', () => {
    it('aggregates whole disks (skipping partitions)', () => {
        const fixture = ` 8       0 sda 100 0 8000 0 50 0 4000 0 0 0 0
 8       1 sda1 50 0 4000 0 25 0 2000 0 0 0 0
 252     0 vda 200 0 16000 0 75 0 6000 0 0 0 0
`;
        const r = parseDiskstats(fixture);
        // sectors × 512: (8000 + 16000) reads, (4000 + 6000) writes
        expect(r.readBytes).toBe((8000 + 16000) * 512);
        expect(r.writeBytes).toBe((4000 + 6000) * 512);
    });
});

describe('parseNetDev', () => {
    it('aggregates rx/tx excluding lo', () => {
        const fixture = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 100      10    0    0    0     0          0         0        100     10    0    0    0     0       0          0
  eth0: 5000     50    1    0    0     0          0         0        2000    20    0    0    0     0       0          0
  eth1: 3000     30    0    0    0     0          0         0        1500    15    0    0    0     0       0          0
`;
        const r = parseNetDev(fixture);
        expect(r.rxBytes).toBe(5000 + 3000);
        expect(r.txBytes).toBe(2000 + 1500);
        expect(r.errors).toBeGreaterThanOrEqual(1);
    });
});

describe('parsePcsStatusXml', () => {
    it('extracts nodes, quorum, DC', () => {
        const fixture = `<?xml version="1.0"?>
<crm_mon>
  <quorum with_quorum="true" />
  <current_dc name="hv-01" with_quorum="true" />
  <nodes>
    <node name="hv-01" id="1" online="true" standby="false" />
    <node name="hv-02" id="2" online="true" standby="false" />
    <node name="hv-03" id="3" online="false" standby="false" />
  </nodes>
</crm_mon>`;
        const r = parsePcsStatusXml(fixture);
        expect(r.quorate).toBe(true);
        expect(r.dcName).toBe('hv-01');
        expect(r.nodes).toHaveLength(3);
        expect(r.nodes.find((n) => n.name === 'hv-03')?.status).toBe('Offline');
        expect(r.nodes.find((n) => n.name === 'hv-01')?.status).toBe('Online');
    });
    it('marks standby nodes correctly', () => {
        const r = parsePcsStatusXml(`<crm_mon><nodes><node name="x" id="1" online="true" standby="true" /></nodes></crm_mon>`);
        expect(r.nodes[0].status).toBe('Standby');
    });
});
