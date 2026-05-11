/**
 * VMService — discover and operate VMs across managed hosts.
 *
 * Replaces the previous SSH-shell-out implementation that:
 *   • interpolated VM names + host IPs into shell commands (SEC-002),
 *   • used `split('\\s+')` (literal string) so disks / NICs were never
 *     parsed (BUG-007),
 *   • fabricated disk source paths (`/var/lib/libvirt/images/<vm>/<t>.qcow2`)
 *     instead of consuming the real `virsh domblklist` output,
 *   • cast raw rows with `as VM[]` (DATA-003).
 *
 * Now uses the pooled `SshClient` and structured parsers for `virsh`
 * output. Lifecycle ops emit `event:vm-state-changed` so the renderer's
 * RTK Query cache stays current without polling.
 */

import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';
import { rowToVm, type VmRow } from '../db/mappers';
import { sshPool, type SshClient } from '../lib/ssh-client';
import {
    parseDomblklist,
    parseDomiflist,
    parseDominfo,
    parseVcpucount,
} from '../lib/parsers';
import { IPC_EVENTS } from '@shared/ipc/contract';
import type { VM, VMState } from '@shared/types';

import { ensureHostConnected } from './connection-manager';

export class VMService {
    private readonly logger = new LoggerService('VMService');

    public async initialize(): Promise<void> {
        this.logger.info('VMService initialized');
    }

    public async shutdown(): Promise<void> {
        this.logger.info('VMService shutdown complete');
    }

    // ========================================================================
    // Queries
    // ========================================================================

    public async getVM(vmId: string): Promise<VM | null> {
        const row = databaseService.queryGet<VmRow>('SELECT * FROM vms WHERE id = ?', vmId);
        return row ? rowToVm(row) : null;
    }

    public async getAllVMs(): Promise<VM[]> {
        const rows = databaseService.queryAll<VmRow>('SELECT * FROM vms ORDER BY name');
        return rows.map(rowToVm);
    }

    public async getVMsByHost(hostId: string): Promise<VM[]> {
        const rows = databaseService.queryAll<VmRow>('SELECT * FROM vms WHERE host_id = ? ORDER BY name', hostId);
        return rows.map(rowToVm);
    }

    public async getRunningVMs(): Promise<VM[]> {
        const rows = databaseService.queryAll<VmRow>("SELECT * FROM vms WHERE state = 'running' ORDER BY name");
        return rows.map(rowToVm);
    }

    // ========================================================================
    // Discovery
    // ========================================================================

    public async discoverVMs(hostId: string): Promise<VM[]> {
        const client = await ensureHostConnected(hostId);
        this.logger.info(`Discovering VMs on host ${hostId}`);

        const list = await client.runCommand(['virsh', 'list', '--all', '--name'], { timeoutMs: 30_000 });
        if (list.code !== 0) {
            throw new Error(`VM_DISCOVERY_FAILED: ${list.stderr.trim() || `exit ${list.code}`}`);
        }
        const names = list.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
        this.logger.info(`Found ${names.length} VM(s)`);

        const results: VM[] = [];
        for (const name of names) {
            try {
                results.push(await this.discoverOne(hostId, client, name));
            } catch (err) {
                this.logger.error(`Failed to discover VM ${name}`, err);
            }
        }
        return results;
    }

    private async discoverOne(hostId: string, client: SshClient, vmName: string): Promise<VM> {
        const [info, vcpus, disks, ifaces] = await Promise.all([
            client.runCommand(['virsh', 'dominfo', vmName]),
            client.runCommand(['virsh', 'vcpucount', vmName]),
            client.runCommand(['virsh', 'domblklist', vmName, '--details']),
            client.runCommand(['virsh', 'domiflist', vmName]),
        ]);
        const dominfo = parseDominfo(info.stdout);
        const vcpu = parseVcpucount(vcpus.stdout);
        const diskRows = parseDomblklist(disks.stdout);
        const ifaceRows = parseDomiflist(ifaces.stdout);

        // Only match by uuid when virsh actually returned one; otherwise an
        // empty `dominfo.uuid` would silently match any row whose stored uuid
        // is also empty (a previous bad discovery).
        const existing = dominfo.uuid
            ? databaseService.queryGet<VmRow>(
                  'SELECT * FROM vms WHERE uuid = ? OR (host_id = ? AND name = ?)',
                  dominfo.uuid, hostId, vmName,
              )
            : databaseService.queryGet<VmRow>(
                  'SELECT * FROM vms WHERE host_id = ? AND name = ?',
                  hostId, vmName,
              );
        const id = existing?.id ?? uuidv4();
        const now = Date.now();
        const state = (dominfo.state || 'shut off') as VMState;

        databaseService.transaction(() => {
            databaseService.get().prepare(
                `INSERT INTO vms (
                    id, name, host_id, uuid, state, state_string,
                    vcpus_current, vcpus_maximum, memory_current, memory_maximum,
                    autostart, persistent, snapshot_count,
                    migrating, migration_progress,
                    os_type, os_version, description, tags,
                    created_at, started_at, updated_at
                ) VALUES (
                    @id, @name, @host_id, @uuid, @state, @state,
                    @vcpus_current, @vcpus_maximum, @memory_current, @memory_maximum,
                    @autostart, @persistent, 0,
                    0, 0,
                    '', '', '', '[]',
                    @created_at, @started_at, @updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    host_id = excluded.host_id,
                    uuid = excluded.uuid,
                    state = excluded.state,
                    state_string = excluded.state_string,
                    vcpus_current = excluded.vcpus_current,
                    vcpus_maximum = excluded.vcpus_maximum,
                    memory_current = excluded.memory_current,
                    memory_maximum = excluded.memory_maximum,
                    autostart = excluded.autostart,
                    persistent = excluded.persistent,
                    -- Preserve the original start time across re-discoveries while
                    -- the VM is running, and clear it once the VM stops.
                    started_at = CASE
                        WHEN excluded.state = 'running' THEN COALESCE(vms.started_at, excluded.started_at)
                        ELSE NULL
                    END,
                    updated_at = excluded.updated_at`,
            ).run({
                id,
                name: vmName,
                host_id: hostId,
                uuid: dominfo.uuid || `unknown-${id}`,
                state,
                vcpus_current: vcpu.current,
                vcpus_maximum: vcpu.maximum,
                memory_current: dominfo.usedMemoryBytes,
                memory_maximum: dominfo.maxMemoryBytes,
                autostart: dominfo.autostart ? 1 : 0,
                persistent: dominfo.persistent ? 1 : 0,
                created_at: existing?.created_at ?? now,
                started_at: state === 'running' ? now : null,
                updated_at: now,
            });

            // Replace child rows in the same transaction so partial failures
            // don't leave orphaned disk / iface records.
            databaseService.run('DELETE FROM vm_disks WHERE vm_id = ?', id);
            const insertDisk = databaseService.get().prepare(
                `INSERT INTO vm_disks (id, vm_id, device, target, source, format, bus, capacity, allocation, readonly, snapshot, bus_type)
                 VALUES (@id, @vm_id, @device, @target, @source, @format, @bus, 0, 0, 0, 0, @bus_type)`,
            );
            for (const disk of diskRows) {
                insertDisk.run({
                    id: uuidv4(),
                    vm_id: id,
                    device: disk.device,
                    target: disk.target,
                    source: disk.source,
                    format: detectFormat(disk.source),
                    bus: bestEffortBus(disk.target),
                    bus_type: bestEffortBus(disk.target),
                });
            }

            databaseService.run('DELETE FROM vm_interfaces WHERE vm_id = ?', id);
            const insertIface = databaseService.get().prepare(
                `INSERT INTO vm_interfaces (id, vm_id, iface, source, target, mac_address, model, type, ip_addresses)
                 VALUES (@id, @vm_id, @iface, @source, '', @mac, @model, @type, '[]')`,
            );
            for (const ifc of ifaceRows) {
                insertIface.run({
                    id: uuidv4(),
                    vm_id: id,
                    iface: ifc.iface,
                    source: ifc.source,
                    mac: ifc.macAddress,
                    model: ifc.model,
                    type: ifc.type,
                });
            }
        });

        const fresh = await this.getVM(id);
        if (!fresh) {
            throw new Error(`DISCOVERY_INCONSISTENT: VM ${id} missing after upsert`);
        }
        return fresh;
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    public async startVM(vmId: string): Promise<void>     { await this.runOp(vmId, 'start'); }
    public async stopVM(vmId: string): Promise<void>      { await this.runOp(vmId, 'shutdown'); }
    public async rebootVM(vmId: string): Promise<void>    { await this.runOp(vmId, 'reboot'); }
    public async resetVM(vmId: string): Promise<void>     { await this.runOp(vmId, 'reset'); }
    public async suspendVM(vmId: string): Promise<void>   { await this.runOp(vmId, 'suspend'); }
    public async resumeVM(vmId: string): Promise<void>    { await this.runOp(vmId, 'resume'); }
    public async destroyVM(vmId: string): Promise<void>   { await this.runOp(vmId, 'destroy'); }

    private async runOp(vmId: string, op: 'start' | 'shutdown' | 'reboot' | 'reset' | 'suspend' | 'resume' | 'destroy'): Promise<void> {
        const vm = await this.getVM(vmId);
        if (!vm) throw new Error(`VM_NOT_FOUND: ${vmId}`);
        const client = await ensureHostConnected(vm.hostId);
        const result = await client.runCommand(['virsh', op, vm.name], { timeoutMs: 60_000 });
        if (result.code !== 0) {
            throw new Error(`VM_OP_FAILED: virsh ${op} ${vm.name}: ${result.stderr.trim() || `exit ${result.code}`}`);
        }
        await this.refreshState(vmId);
    }

    public async refreshState(vmId: string): Promise<void> {
        const vm = await this.getVM(vmId);
        if (!vm) return;
        const client = sshPool.get(vm.hostId);
        if (!client) return;
        try {
            const r = await client.runCommand(['virsh', 'domstate', vm.name], { timeoutMs: 10_000 });
            const state = (r.stdout.trim() || 'shut off') as VMState;
            databaseService.run('UPDATE vms SET state = ?, state_string = ?, updated_at = ? WHERE id = ?',
                state, state, Date.now(), vmId);
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send(IPC_EVENTS.vmStateChanged, { vmId, state });
            }
        } catch (err) {
            this.logger.error(`refreshState failed for ${vm.name}`, err);
        }
    }

}

function detectFormat(source: string): string {
    if (/\.qcow2$/i.test(source)) return 'qcow2';
    if (/\.raw$/i.test(source)) return 'raw';
    if (/\.iso$/i.test(source)) return 'iso';
    if (/^\/dev\//.test(source)) return 'raw';
    return '';
}

function bestEffortBus(target: string): string {
    if (target.startsWith('vd')) return 'virtio';
    if (target.startsWith('sd')) return 'scsi';
    if (target.startsWith('hd')) return 'ide';
    return 'virtio';
}
