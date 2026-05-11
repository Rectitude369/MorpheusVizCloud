import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiCpu,
  FiDownload,
  FiEye,
  FiFolder,
  FiPackage,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiSave,
  FiTerminal,
  FiTrash2,
  FiX,
} from 'react-icons/fi';

import { StatusBadge } from '../components/atoms';
import { formatBytes, formatDuration, formatRelativeTime } from '../lib/format';
import {
  useCancelBundleMutation,
  useCollectBundleMutation,
  useDeleteBundleMutation,
  useListBundlesQuery,
  useListLogSourcesQuery,
  useOpenBundleFolderMutation,
  useRevealBundleMutation,
  useSaveBundleAsMutation,
  useStartTailMutation,
  useStopTailMutation,
} from '../store/api/diagnosticsApi';
import { useGetHostsQuery } from '../store/api/hostsApi';
import { IPC_EVENTS } from '@shared/ipc/contract';
import type {
  BundleProgressPayload,
  BundleSummary,
  Host,
  LogLinePayload,
  LogSourceId,
} from '@shared/types';

const LOG_LABELS: Record<LogSourceId, string> = {
  morphd: 'morphd',
  pacemaker: 'pacemaker',
  corosync: 'corosync',
  pcsd: 'pcsd',
  libvirtd: 'libvirtd',
  syslog: 'syslog',
};

interface BundleState {
  phase: BundleProgressPayload['phase'];
  percent: number;
  message: string;
  updatedAt: number;
}

interface TailLine {
  id: number;
  source: LogSourceId;
  stream: 'stdout' | 'stderr';
  line: string;
  ts: number;
  /**
   * Count of consecutive identical lines collapsed into this entry.
   * libvirtd in particular re-emits the same line per VM per polling cycle
   * (e.g. "QEMU guest agent is not responding") — collapsing keeps the pane
   * readable without losing the signal that the message is being repeated.
   */
  count: number;
  /** Updated when a duplicate folds into this entry (for "X new repeats"). */
  lastTs: number;
}

interface HostDiagnosticPanelProps {
  host: Host;
  bundleState?: BundleState;
  tailLines: TailLine[];
  activeSource: LogSourceId | null;
  logSources: ReadonlyArray<LogSourceId>;
  filter: string;
  paused: boolean;
  onStartTail: (source: LogSourceId) => void;
  onStopTail: () => void;
  onCollectBundle: () => void;
  onCancelBundle: () => void;
  onClearLog: () => void;
  onFilterChange: (value: string) => void;
  onTogglePause: () => void;
}

const HostDiagnosticPanel: React.FC<HostDiagnosticPanelProps> = ({
  host,
  bundleState,
  tailLines,
  activeSource,
  logSources,
  filter,
  paused,
  onStartTail,
  onStopTail,
  onCollectBundle,
  onCancelBundle,
  onClearLog,
  onFilterChange,
  onTogglePause,
}) => {
  const logBoxRef = useRef<HTMLDivElement>(null);

  const filteredLines = useMemo(() => {
    if (!filter) return tailLines;
    const needle = filter.toLowerCase();
    return tailLines.filter((l) => l.line.toLowerCase().includes(needle));
  }, [tailLines, filter]);

  // Auto-scroll on new lines (unless paused).
  useEffect(() => {
    if (paused) return;
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [filteredLines, paused]);

  const isCollecting = bundleState && bundleState.phase !== 'complete' && bundleState.phase !== 'failed';

  const totalLineCount = tailLines.reduce((acc, l) => acc + l.count, 0);
  const dedupedCount = tailLines.length;

  return (
    <article className="bg-page border border-border rounded-2xl shadow-md overflow-hidden">
      <header className="flex items-start justify-between gap-4 p-5 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{host.hostname}</h2>
            <StatusBadge status={host.status} size="sm" />
          </div>
          <div className="text-xs font-mono text-muted mt-0.5">{host.ipAddress}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isCollecting ? (
            <button
              type="button"
              onClick={onCollectBundle}
              disabled={host.status !== 'online'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Run HPE Support's collect.sh, download the resulting tar.gz"
            >
              <FiPackage className="w-3.5 h-3.5" /> Collect bundle
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelBundle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-error/10 text-error border border-error/30 hover:bg-error/20"
            >
              <FiX className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4 border-b border-border">
        <Tile label="Uptime" value={formatDuration(host.uptime)} icon={<FiClock />} />
        <Tile label="Last seen" value={formatRelativeTime(host.lastHeartbeat)} icon={<FiActivity />} />
        <Tile label="Load 1m" value={host.loadAverage[0].toFixed(2)} icon={<FiCpu />} />
        <Tile label="VMs running" value={`${host.vmRunningCount}/${host.vmCount}`} icon={<FiPlay />} />
        <Tile label="libvirt" value={host.libvirtVersion || '—'} />
        <Tile label="QEMU" value={host.qemuVersion || '—'} />
        <Tile label="PCS" value={host.pcsConnected ? 'connected' : '—'} />
        <Tile label="Corosync" value={host.corosyncConnected ? 'connected' : '—'} />
      </section>

      {bundleState && (
        <section className="px-5 py-3 border-b border-border bg-search/40">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="uppercase tracking-wider text-muted">Bundle</span>
            <span className={`font-medium ${
              bundleState.phase === 'complete' ? 'text-success' :
              bundleState.phase === 'failed' ? 'text-error' :
              'text-foreground'
            }`}>
              {bundleState.phase} · {bundleState.percent}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 bg-search rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                bundleState.phase === 'failed' ? 'bg-error' :
                bundleState.phase === 'complete' ? 'bg-success' :
                'bg-primary'
              }`}
              style={{ width: `${Math.max(2, bundleState.percent)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted truncate" title={bundleState.message}>{bundleState.message}</p>
        </section>
      )}

      <section className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-muted flex items-center gap-1.5">
          <FiTerminal className="w-3 h-3" /> Live tail
        </span>
        {logSources.map((src) => {
          const active = activeSource === src;
          return (
            <button
              key={src}
              type="button"
              onClick={() => active ? onStopTail() : onStartTail(src)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                active
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-search border-border text-muted hover:text-foreground hover:border-muted'
              }`}
              title={active ? `Stop tailing ${src}` : `tail -F ${src}`}
            >
              {active ? <span className="inline-flex items-center gap-1.5"><FiPause className="w-3 h-3" /> {LOG_LABELS[src]}</span> : LOG_LABELS[src]}
            </button>
          );
        })}
        {activeSource && (
          <div className="ml-auto flex items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="filter…"
              className="px-2 py-1 text-xs rounded-md bg-search border border-border text-foreground placeholder:text-muted/60 focus:outline-none focus:border-primary w-40"
              aria-label="Filter log lines"
            />
            <button
              type="button"
              onClick={onTogglePause}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                paused
                  ? 'bg-warning/15 text-warning border-warning/40'
                  : 'bg-search border-border text-muted hover:text-foreground hover:border-muted'
              }`}
              title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll (lines still arrive)'}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              type="button"
              onClick={onClearLog}
              className="text-xs text-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </section>

      {activeSource && (
        <>
          <div
            ref={logBoxRef}
            className="font-mono text-[11px] leading-relaxed bg-search/30 max-h-72 overflow-auto px-5 py-3"
          >
            {filteredLines.length === 0 ? (
              <div className="text-muted">
                {tailLines.length === 0
                  ? <>Waiting for log lines from <code className="text-primary">{activeSource}</code>…</>
                  : <>No lines match <code className="text-primary">{filter}</code>. Clear the filter to see all {dedupedCount} entries.</>}
              </div>
            ) : (
              filteredLines.map((l) => (
                <div key={l.id} className={l.stream === 'stderr' ? 'text-warning' : 'text-foreground/90'}>
                  <span className="text-muted mr-2 select-none">{new Date(l.ts).toLocaleTimeString()}</span>
                  {l.line}
                  {l.count > 1 && (
                    <span
                      className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-warning/15 text-warning text-[10px] font-semibold tabular-nums"
                      title={`Last repeat ${new Date(l.lastTs).toLocaleTimeString()}`}
                    >
                      ×{l.count}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="px-5 py-1.5 border-t border-border bg-search/20 flex items-center justify-between text-[10px] text-muted">
            <span>
              {totalLineCount === dedupedCount
                ? `${dedupedCount} line${dedupedCount === 1 ? '' : 's'}`
                : `${dedupedCount} unique · ${totalLineCount} total (deduped)`}
              {filter && ` · ${filteredLines.length} matching`}
            </span>
            {tailLines.length >= 1000 && (
              <span className="text-warning">capped at 1000 entries — older lines dropped</span>
            )}
          </div>
        </>
      )}
    </article>
  );
};

interface TileProps { label: string; value: string; icon?: React.ReactNode }

const Tile: React.FC<TileProps> = ({ label, value, icon }) => (
  <div>
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
      {icon && <span className="text-primary">{icon}</span>}
      {label}
    </div>
    <div className="mt-0.5 text-sm text-foreground font-medium tabular-nums truncate">{value}</div>
  </div>
);

interface BundleListSectionProps {
  bundles: ReadonlyArray<BundleSummary>;
  onOpenFolder: () => void;
  onSaveAs: (fileName: string) => void;
  onReveal: (fileName: string) => void;
  onDelete: (fileName: string) => void;
}

const BundleListSection: React.FC<BundleListSectionProps> = ({ bundles, onOpenFolder, onSaveAs, onReveal, onDelete }) => {
  if (bundles.length === 0) {
    return (
      <div className="bg-page border border-border rounded-2xl p-6 text-center">
        <FiPackage className="w-8 h-8 text-muted mx-auto mb-2" />
        <p className="text-foreground font-medium">No bundles collected yet</p>
        <p className="text-xs text-muted mt-1">
          Click <strong>Collect bundle</strong> on a host to run HPE Support&apos;s <code>collect.sh</code> and download the archive.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-page border border-border rounded-2xl overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <FiDownload className="text-primary" /> Saved bundles
        </h2>
        <button
          type="button"
          onClick={onOpenFolder}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-search border border-border text-muted hover:text-foreground hover:border-muted"
        >
          <FiFolder className="w-3.5 h-3.5" /> Open folder
        </button>
      </header>
      <ul className="divide-y divide-border">
        {bundles.map((b) => (
          <li key={b.fullPath} className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-sidebar/40 transition-colors">
            <FiCheckCircle className="text-success flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-foreground truncate" title={b.fullPath}>{b.fileName}</div>
              <div className="text-[11px] text-muted">
                {formatBytes(b.size)} · {formatRelativeTime(b.createdAt)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSaveAs(b.fileName)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md text-primary hover:bg-primary/10"
                title="Save a copy somewhere else"
              >
                <FiSave className="w-3.5 h-3.5" /> Save as…
              </button>
              <button
                type="button"
                onClick={() => onReveal(b.fileName)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted hover:text-foreground hover:bg-search"
                title="Reveal in Finder / Explorer"
              >
                <FiEye className="w-3.5 h-3.5" /> Reveal
              </button>
              <button
                type="button"
                onClick={() => onDelete(b.fileName)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md text-error/70 hover:text-error hover:bg-error/10"
                title="Delete this bundle"
              >
                <FiTrash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DiagnosticsPage: React.FC = () => {
  const { data: hosts = [], refetch, isFetching } = useGetHostsQuery();
  const { data: bundles = [], refetch: refetchBundles } = useListBundlesQuery();
  const { data: logSources = [] } = useListLogSourcesQuery();
  const [collectBundle] = useCollectBundleMutation();
  const [cancelBundle] = useCancelBundleMutation();
  const [openBundleFolder] = useOpenBundleFolderMutation();
  const [startTail] = useStartTailMutation();
  const [stopTail] = useStopTailMutation();
  const [saveBundleAs] = useSaveBundleAsMutation();
  const [revealBundle] = useRevealBundleMutation();
  const [deleteBundle] = useDeleteBundleMutation();

  const [bundleStates, setBundleStates] = useState<Record<string, BundleState>>({});
  const [activeTails, setActiveTails] = useState<Record<string, LogSourceId | null>>({});
  const [tailLines, setTailLines] = useState<Record<string, TailLine[]>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const lineCounter = useRef(0);

  // Subscribe to push events from main.
  useEffect(() => {
    if (!window.vizcloud) return undefined;
    const offBundle = window.vizcloud.subscribe(IPC_EVENTS.bundleProgress, (payload) => {
      setBundleStates((prev) => ({
        ...prev,
        [payload.hostId]: {
          phase: payload.phase,
          percent: payload.percent,
          message: payload.message,
          updatedAt: payload.timestamp,
        },
      }));
      if (payload.phase === 'complete' || payload.phase === 'failed') {
        void refetchBundles();
      }
    });
    const offLog = window.vizcloud.subscribe(IPC_EVENTS.logLine, (payload: LogLinePayload) => {
      setTailLines((prev) => {
        const list = prev[payload.hostId] ?? [];
        // Collapse consecutive identical lines (same source + stream + body)
        // into a single entry with a `count`. Common case: libvirtd polling
        // every VM per cycle re-emits "QEMU guest agent is not responding"
        // N times per heartbeat — without dedupe the pane fills with noise.
        const tail = list[list.length - 1];
        if (
          tail
          && tail.source === payload.source
          && tail.stream === payload.stream
          && tail.line === payload.line
        ) {
          const updated: TailLine = {
            ...tail,
            count: tail.count + 1,
            lastTs: payload.timestamp,
          };
          return { ...prev, [payload.hostId]: [...list.slice(0, -1), updated] };
        }
        const next: TailLine = {
          id: ++lineCounter.current,
          source: payload.source,
          stream: payload.stream,
          line: payload.line,
          ts: payload.timestamp,
          count: 1,
          lastTs: payload.timestamp,
        };
        const trimmed = list.length >= 1000 ? list.slice(-999) : list;
        return { ...prev, [payload.hostId]: [...trimmed, next] };
      });
    });
    return () => {
      offBundle();
      offLog();
    };
  }, [refetchBundles]);

  const handleCollect = useCallback(async (hostId: string, hostname: string) => {
    try {
      await collectBundle(hostId).unwrap();
      toast.success(`Bundle collected for ${hostname}`);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Bundle collection failed';
      toast.error(message);
    }
  }, [collectBundle]);

  const handleCancel = useCallback(async (hostId: string) => {
    try {
      await cancelBundle(hostId).unwrap();
    } catch {
      // best effort
    }
  }, [cancelBundle]);

  const handleStartTail = useCallback(async (hostId: string, source: LogSourceId) => {
    // If a different source was active, stop it first.
    const current = activeTails[hostId] ?? null;
    if (current && current !== source) {
      await stopTail({ hostId, source: current });
    }
    setActiveTails((prev) => ({ ...prev, [hostId]: source }));
    setTailLines((prev) => ({ ...prev, [hostId]: [] }));
    try {
      await startTail({ hostId, source }).unwrap();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Tail failed';
      toast.error(message);
      setActiveTails((prev) => ({ ...prev, [hostId]: null }));
    }
  }, [startTail, stopTail, activeTails]);

  const handleStopTail = useCallback(async (hostId: string) => {
    const current = activeTails[hostId];
    if (!current) return;
    setActiveTails((prev) => ({ ...prev, [hostId]: null }));
    try {
      await stopTail({ hostId, source: current }).unwrap();
    } catch {
      /* best effort */
    }
  }, [stopTail, activeTails]);

  const handleClearLog = useCallback((hostId: string) => {
    setTailLines((prev) => ({ ...prev, [hostId]: [] }));
    setFilters((prev) => ({ ...prev, [hostId]: '' }));
  }, []);

  const handleFilterChange = useCallback((hostId: string, value: string) => {
    setFilters((prev) => ({ ...prev, [hostId]: value }));
  }, []);

  const handleTogglePause = useCallback((hostId: string) => {
    setPaused((prev) => ({ ...prev, [hostId]: !prev[hostId] }));
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      await openBundleFolder().unwrap();
    } catch {
      toast.error('Could not open bundles folder');
    }
  }, [openBundleFolder]);

  const handleSaveAs = useCallback(async (fileName: string) => {
    try {
      const result = await saveBundleAs(fileName).unwrap();
      if (result.saved) {
        toast.success(`Saved to ${result.destPath ?? 'destination'}`);
      }
    } catch {
      toast.error('Save failed');
    }
  }, [saveBundleAs]);

  const handleReveal = useCallback(async (fileName: string) => {
    try {
      await revealBundle(fileName).unwrap();
    } catch {
      toast.error('Could not reveal bundle');
    }
  }, [revealBundle]);

  const handleDelete = useCallback(async (fileName: string) => {
    if (!confirm(`Delete ${fileName}? This cannot be undone.`)) return;
    try {
      await deleteBundle(fileName).unwrap();
      toast.success('Bundle deleted');
    } catch {
      toast.error('Delete failed');
    }
  }, [deleteBundle]);

  const sortedHosts = useMemo(
    () => [...hosts].sort((a, b) => a.hostname.localeCompare(b.hostname)),
    [hosts],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Diagnostics</h1>
          <p className="text-sm text-muted">
            Live log tail and HPE Support bundle collection (replicates the <code className="text-primary">collect.sh</code> + MorphLogGrabber flow).
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-sm disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {hosts.length === 0 ? (
        <div className="bg-page border border-border rounded-2xl p-12 text-center">
          <p className="text-muted">No hosts to diagnose. Add a host first.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {sortedHosts.map((host) => (
              <HostDiagnosticPanel
                key={host.id}
                host={host}
                bundleState={bundleStates[host.id]}
                tailLines={tailLines[host.id] ?? []}
                activeSource={activeTails[host.id] ?? null}
                logSources={logSources}
                filter={filters[host.id] ?? ''}
                paused={paused[host.id] ?? false}
                onStartTail={(src) => void handleStartTail(host.id, src)}
                onStopTail={() => void handleStopTail(host.id)}
                onCollectBundle={() => void handleCollect(host.id, host.hostname)}
                onCancelBundle={() => void handleCancel(host.id)}
                onClearLog={() => handleClearLog(host.id)}
                onFilterChange={(value) => handleFilterChange(host.id, value)}
                onTogglePause={() => handleTogglePause(host.id)}
              />
            ))}
          </div>
          <BundleListSection
            bundles={bundles}
            onOpenFolder={() => void handleOpenFolder()}
            onSaveAs={(name) => void handleSaveAs(name)}
            onReveal={(name) => void handleReveal(name)}
            onDelete={(name) => void handleDelete(name)}
          />
        </>
      )}

      {hosts.length === 0 && bundles.length > 0 && (
        <BundleListSection
          bundles={bundles}
          onOpenFolder={() => void handleOpenFolder()}
          onSaveAs={(name) => void handleSaveAs(name)}
          onReveal={(name) => void handleReveal(name)}
          onDelete={(name) => void handleDelete(name)}
        />
      )}
    </div>
  );
};

export default DiagnosticsPage;
