import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi';

import { LoadingSpinner, Modal, StatusBadge } from '../components/atoms';
import { formatBytes, formatDuration, formatRelativeTime } from '../lib/format';
import {
  useConnectHostMutation,
  useDeleteHostMutation,
  useGetHostsQuery,
} from '../store/api/hostsApi';
import { useDiscoverVMsMutation } from '../store/api/vmsApi';
import type { HostConnection } from '@shared/types';

const DEFAULT_FORM: HostConnection & { password?: string } = {
  id: '',
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authMethod: 'agent',
  keyPath: '',
  password: '',
  lastConnected: 0,
  tags: [],
};

const HostsPage: React.FC = () => {
  const { data: hosts = [], isLoading, isError, error } = useGetHostsQuery();
  const [connect, connectState] = useConnectHostMutation();
  const [deleteHost] = useDeleteHostMutation();
  const [discoverVMs, discoverState] = useDiscoverVMsMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const handleAdd = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!form.host || !form.username) {
      toast.error('Host and username are required');
      return;
    }
    try {
      const candidate: HostConnection & { password?: string } = {
        ...form,
        id: form.id || crypto.randomUUID(),
        port: Number(form.port) || 22,
        keyPath: form.keyPath || undefined,
        password: form.password || undefined,
      };
      await connect(candidate).unwrap();
      toast.success(`Connected to ${form.host}`);
      setShowAdd(false);
      setForm(DEFAULT_FORM);
    } catch (err) {
      // RTK Query's unwrap() throws the IpcQueryError shape from
      // ipcBaseQuery (`{ code, message, channel, cause }`) — which is a plain
      // object, not an Error instance. Pull the message out explicitly so the
      // user sees the actual SSH/host failure rather than a generic toast.
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Connection failed';
      toast.error(message);
    }
  };

  const handleDelete = async (id: string, hostname: string): Promise<void> => {
    if (!confirm(`Remove ${hostname}? This stops monitoring but does not affect the host itself.`)) return;
    try {
      await deleteHost(id).unwrap();
      toast.success(`Removed ${hostname}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove host');
    }
  };

  const handleDiscover = async (id: string, hostname: string): Promise<void> => {
    try {
      const vms = await discoverVMs(id).unwrap();
      toast.success(`Discovered ${vms.length} VM(s) on ${hostname}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Discovery failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Hosts</h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
          onClick={() => setShowAdd(true)}
        >
          <FiPlus className="w-4 h-4" /> Add host
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : isError ? (
        <div className="bg-page border border-error rounded-xl p-6 text-error">
          Failed to load hosts: {error && 'message' in error ? String((error as { message: string }).message) : 'unknown error'}
        </div>
      ) : hosts.length === 0 ? (
        <div className="bg-page border border-border rounded-xl p-12 text-center">
          <p className="text-muted">No hosts connected yet.</p>
          <p className="text-muted text-sm mt-2">Click <strong>Add host</strong> to connect your first hypervisor.</p>
        </div>
      ) : (
        <div className="bg-page border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sidebar/40 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Hostname</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">CPU</th>
                <th className="text-right px-4 py-3">Memory</th>
                <th className="text-right px-4 py-3">Uptime</th>
                <th className="text-right px-4 py-3">Last seen</th>
                <th className="text-right px-4 py-3">VMs</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((host) => (
                <tr key={host.id} className="border-t border-border hover:bg-sidebar-hover/40">
                  <td className="px-4 py-3 font-medium text-foreground">{host.hostname}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{host.ipAddress}</td>
                  <td className="px-4 py-3"><StatusBadge status={host.status} /></td>
                  <td className="px-4 py-3 text-right text-muted">{host.cpuCores ? `${host.cpuCores} cores` : '—'}</td>
                  <td className="px-4 py-3 text-right text-muted">{formatBytes(host.memoryTotal)}</td>
                  <td className="px-4 py-3 text-right text-muted">{formatDuration(host.uptime)}</td>
                  <td className="px-4 py-3 text-right text-muted">{formatRelativeTime(host.lastHeartbeat)}</td>
                  <td className="px-4 py-3 text-right text-muted">{host.vmRunningCount}/{host.vmCount}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      className="text-muted hover:text-primary disabled:opacity-50"
                      disabled={discoverState.isLoading}
                      onClick={() => handleDiscover(host.id, host.hostname)}
                      title="Discover VMs"
                      aria-label={`Discover VMs on ${host.hostname}`}
                    >
                      <FiRefreshCw className="w-4 h-4 inline" />
                    </button>
                    <button
                      type="button"
                      className="text-muted hover:text-error"
                      onClick={() => handleDelete(host.id, host.hostname)}
                      title="Remove"
                      aria-label={`Remove host ${host.hostname}`}
                    >
                      <FiTrash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add host">
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted">Display name</span>
              <input
                type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                placeholder="lab-hv-01"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted">Hostname or IP</span>
              <input
                type="text" required value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                placeholder="10.0.0.10 or hv-01.lab"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted">Port</span>
              <input
                type="number" min={1} max={65535} value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })}
                className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm"
              />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs uppercase tracking-wider text-muted">Username</span>
              <input
                type="text" required value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm"
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-muted">Auth method</span>
            <select
              value={form.authMethod}
              onChange={(e) => setForm({ ...form, authMethod: e.target.value as HostConnection['authMethod'] })}
              className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm"
            >
              <option value="agent">SSH agent (recommended)</option>
              <option value="key">Private key on disk</option>
              <option value="password">Password (encrypted via OS keychain)</option>
            </select>
          </label>
          {form.authMethod === 'key' && (
            <label className="space-y-1 block">
              <span className="text-xs uppercase tracking-wider text-muted">Private key path</span>
              <input
                type="text" required={form.authMethod === 'key'} value={form.keyPath ?? ''}
                onChange={(e) => setForm({ ...form, keyPath: e.target.value })}
                className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm font-mono"
                placeholder="~/.ssh/id_ed25519"
              />
            </label>
          )}
          {form.authMethod === 'password' && (
            <label className="space-y-1 block">
              <span className="text-xs uppercase tracking-wider text-muted">Password</span>
              <input
                type="password" required={form.authMethod === 'password'} value={form.password ?? ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm"
              />
              <span className="text-xs text-muted">Encrypted at rest with your OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux).</span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 text-sm text-muted hover:text-foreground" onClick={() => setShowAdd(false)}>Cancel</button>
            <button
              type="submit"
              disabled={connectState.isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-sm disabled:opacity-50"
            >
              {connectState.isLoading ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HostsPage;
