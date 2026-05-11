import React, { useMemo } from 'react';

import { useGetClustersQuery } from '../store/api/clustersApi';
import { useGetHostsQuery } from '../store/api/hostsApi';
import { useGetVMsQuery } from '../store/api/vmsApi';
import type { Cluster, Host, VM } from '@shared/types';

/**
 * SVG topology view with cluster-aware grouping.
 *
 * Layout:
 *   • Each cluster is a labeled "shelf" (rounded rect) at the top of the
 *     canvas containing its member hosts inside, connected by a soft ring
 *     so the relationship is visually obvious.
 *   • Standalone (cluster-less) hosts sit in a row below.
 *   • VMs orbit each host as small status-colored dots.
 *
 * The WebGL force-graph upgrade is tracked as REFACTOR-011 — this stays
 * deterministic + zero-dependency.
 */

interface HostNode {
    host: Host;
    x: number;
    y: number;
}
interface ClusterGroup {
    cluster: Cluster;
    hosts: HostNode[];
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
    centerX: number;
    centerY: number;
}

const HOST_R = 32;
const HALO_R = 56;
const VM_R = 5;
const VM_ORBIT = 70;
const CLUSTER_PADDING = 70;
const CLUSTER_HOST_GAP = 180;
const CLUSTER_BOX_PAD = 32;
const STANDALONE_GAP = 220;
const ROW_HEIGHT = 320;

function statusStroke(status: Host['status']): string {
    switch (status) {
        case 'online': return 'rgb(var(--color-success-rgb))';
        case 'degraded': return 'rgb(var(--color-warning-rgb))';
        case 'offline': return 'rgb(var(--color-muted-rgb))';
        case 'maintenance': return 'rgb(var(--color-info-rgb))';
        default: return 'rgb(var(--color-info-rgb))';
    }
}

function vmFill(state: VM['state']): string {
    return state === 'running' ? 'rgb(var(--color-success-rgb))'
        : state === 'paused' || state === 'pmsuspended' ? 'rgb(var(--color-warning-rgb))'
        : state === 'crashed' ? 'rgb(var(--color-error-rgb))'
        : 'rgb(var(--color-muted-rgb))';
}

function clusterAccent(cluster: Cluster): string {
    return cluster.status === 'healthy' ? 'rgb(var(--color-success-rgb))'
        : cluster.status === 'degraded' ? 'rgb(var(--color-warning-rgb))'
        : 'rgb(var(--color-error-rgb))';
}

function clusterDisplayName(cluster: Cluster): string {
    if (cluster.name.startsWith('pcs:')) {
        const nodes = cluster.name.slice(4).split(',').filter(Boolean);
        if (nodes.length > 0) return `${nodes.length}-node Pacemaker cluster`;
    }
    return cluster.name;
}

const TopologyPage: React.FC = () => {
    const { data: hosts = [] } = useGetHostsQuery();
    const { data: vms = [] } = useGetVMsQuery();
    const { data: clusters = [] } = useGetClustersQuery();

    const layout = useMemo(() => buildLayout(hosts, clusters), [hosts, clusters]);

    if (hosts.length === 0) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold text-foreground">Network Topology</h1>
                <div className="bg-page border border-border rounded-xl p-12 text-center">
                    <p className="text-muted">No hosts to visualize. Add a host first.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Network Topology</h1>
                    <p className="text-sm text-muted">
                        {hosts.length} host(s), {vms.length} VM(s)
                        {clusters.length ? `, ${clusters.length} cluster(s)` : ''}.
                        Cluster-grouped layout — members share a ring.
                    </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                    <Legend swatch="bg-success" label="Online / Running" />
                    <Legend swatch="bg-warning" label="Degraded / Paused" />
                    <Legend swatch="bg-error" label="Crashed / Failed" />
                    <Legend swatch="bg-muted" label="Offline" />
                </div>
            </div>

            <div className="bg-page border border-border rounded-2xl p-4 overflow-auto">
                <svg
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    role="img"
                    aria-label="Network topology"
                    className="w-full h-auto"
                >
                    <defs>
                        <radialGradient id="topo-halo" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgb(var(--color-primary-rgb) / 0.35)" />
                            <stop offset="100%" stopColor="rgb(var(--color-primary-rgb) / 0)" />
                        </radialGradient>
                        <linearGradient id="cluster-fade" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgb(var(--bg-sidebar-rgb))" />
                            <stop offset="100%" stopColor="rgb(var(--bg-page-rgb))" />
                        </linearGradient>
                    </defs>

                    {/* Cluster shelves */}
                    {layout.groups.map((group) => (
                        <g key={group.cluster.id}>
                            <rect
                                x={group.boxX}
                                y={group.boxY}
                                width={group.boxW}
                                height={group.boxH}
                                rx={20}
                                ry={20}
                                fill="url(#cluster-fade)"
                                stroke={clusterAccent(group.cluster)}
                                strokeOpacity={0.5}
                                strokeWidth={1.5}
                                strokeDasharray="6 4"
                            />
                            {/* Ring connecting cluster members */}
                            {group.hosts.length > 1 && (
                                <ClusterRing
                                    nodes={group.hosts}
                                    accent={clusterAccent(group.cluster)}
                                />
                            )}
                            {/* Cluster label */}
                            <text
                                x={group.boxX + 18}
                                y={group.boxY + 22}
                                className="fill-foreground"
                                style={{ fontSize: 13, fontWeight: 600 }}
                            >
                                {clusterDisplayName(group.cluster)}
                            </text>
                            <text
                                x={group.boxX + 18}
                                y={group.boxY + 38}
                                className="fill-muted"
                                style={{ fontSize: 11 }}
                            >
                                Quorum {group.cluster.quorumVotes}/{group.cluster.quorumThreshold}
                                {group.cluster.quorum ? ' · healthy' : ' · loss'}
                            </text>
                            <circle
                                cx={group.boxX + group.boxW - 18}
                                cy={group.boxY + 24}
                                r={6}
                                fill={clusterAccent(group.cluster)}
                            />
                        </g>
                    ))}

                    {/* Hosts (both clustered and standalone) */}
                    {layout.allHostNodes.map((node) => {
                        const hostVms = vms.filter((v) => v.hostId === node.host.id);
                        const totalAngle = Math.min(Math.PI * 1.6, hostVms.length * 0.32);
                        const startAngle = -totalAngle / 2 + Math.PI / 2;
                        return (
                            <g key={node.host.id}>
                                <circle cx={node.x} cy={node.y} r={HALO_R} fill="url(#topo-halo)" />
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={HOST_R}
                                    fill="rgb(var(--bg-page-rgb))"
                                    stroke={statusStroke(node.host.status)}
                                    strokeWidth={2.5}
                                />
                                <text
                                    x={node.x}
                                    y={node.y + 4}
                                    textAnchor="middle"
                                    className="fill-foreground"
                                    style={{ fontSize: 12, fontWeight: 600 }}
                                >
                                    {truncate(node.host.hostname, 14)}
                                </text>
                                <text
                                    x={node.x}
                                    y={node.y + HOST_R + 16}
                                    textAnchor="middle"
                                    className="fill-muted"
                                    style={{ fontSize: 10 }}
                                >
                                    {hostVms.filter((v) => v.state === 'running').length}/{hostVms.length} VMs
                                </text>
                                {hostVms.slice(0, 12).map((vm, j) => {
                                    const va = startAngle + (j / Math.max(1, Math.min(hostVms.length, 12) - 1 || 1)) * totalAngle;
                                    const vx = node.x + Math.cos(va) * VM_ORBIT;
                                    const vy = node.y + Math.sin(va) * VM_ORBIT;
                                    return (
                                        <g key={vm.id}>
                                            <line
                                                x1={node.x}
                                                y1={node.y}
                                                x2={vx}
                                                y2={vy}
                                                stroke="rgb(var(--border-default-rgb))"
                                                strokeDasharray="2 3"
                                                opacity={0.7}
                                            />
                                            <circle cx={vx} cy={vy} r={VM_R} fill={vmFill(vm.state)}>
                                                <title>{vm.name} · {vm.state}</title>
                                            </circle>
                                        </g>
                                    );
                                })}
                                {hostVms.length > 12 && (
                                    <text
                                        x={node.x}
                                        y={node.y + HOST_R + 30}
                                        textAnchor="middle"
                                        className="fill-muted"
                                        style={{ fontSize: 9 }}
                                    >
                                        +{hostVms.length - 12} more
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

const Legend: React.FC<{ swatch: string; label: string }> = ({ swatch, label }) => (
    <span className="inline-flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${swatch}`} aria-hidden />
        {label}
    </span>
);

const ClusterRing: React.FC<{ nodes: HostNode[]; accent: string }> = ({ nodes, accent }) => {
    if (nodes.length < 2) return null;
    const path = nodes
        .map((n, i) => {
            if (i === 0) return `M ${n.x} ${n.y}`;
            const prev = nodes[i - 1]!;
            // Soft curve between neighbors using the midpoint as a control bias.
            const mx = (prev.x + n.x) / 2;
            const my = (prev.y + n.y) / 2 - 10;
            return `Q ${mx} ${my} ${n.x} ${n.y}`;
        })
        .concat([`Q ${(nodes[nodes.length - 1]!.x + nodes[0]!.x) / 2} ${(nodes[nodes.length - 1]!.y + nodes[0]!.y) / 2 - 10} ${nodes[0]!.x} ${nodes[0]!.y}`])
        .join(' ');
    return (
        <path
            d={path}
            fill="none"
            stroke={accent}
            strokeOpacity={0.45}
            strokeWidth={2}
        />
    );
};

function truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return `${s.slice(0, n - 1)}…`;
}

interface Layout {
    width: number;
    height: number;
    groups: ClusterGroup[];
    allHostNodes: HostNode[];
}

function buildLayout(hosts: ReadonlyArray<Host>, clusters: ReadonlyArray<Cluster>): Layout {
    const hostById = new Map(hosts.map((h) => [h.id, h]));
    const placed = new Set<string>();

    // Group cluster member hosts.
    const groups: ClusterGroup[] = [];
    let cursorX = CLUSTER_PADDING;
    let cursorY = CLUSTER_PADDING;
    let rowMaxH = 0;
    const maxRowWidth = 1280;

    for (const cluster of clusters) {
        const memberHosts = cluster.hostIds
            .map((id) => hostById.get(id))
            .filter((h): h is Host => Boolean(h));
        if (memberHosts.length === 0) continue;

        const cols = Math.min(memberHosts.length, 3);
        const rows = Math.ceil(memberHosts.length / cols);
        const innerW = (cols - 1) * CLUSTER_HOST_GAP + HOST_R * 2 + 60;
        const innerH = (rows - 1) * CLUSTER_HOST_GAP * 0.7 + HOST_R * 2 + 80;
        const boxW = innerW + CLUSTER_BOX_PAD * 2;
        const boxH = innerH + CLUSTER_BOX_PAD * 2 + 30; // +30 for label

        // Wrap row if we'd overflow.
        if (cursorX + boxW > maxRowWidth) {
            cursorX = CLUSTER_PADDING;
            cursorY += rowMaxH + CLUSTER_PADDING;
            rowMaxH = 0;
        }

        const boxX = cursorX;
        const boxY = cursorY;
        const innerStartX = boxX + CLUSTER_BOX_PAD + HOST_R;
        const innerStartY = boxY + CLUSTER_BOX_PAD + 50; // leave room for label

        const hostNodes: HostNode[] = memberHosts.map((host, idx) => {
            const c = idx % cols;
            const r = Math.floor(idx / cols);
            return {
                host,
                x: innerStartX + c * CLUSTER_HOST_GAP,
                y: innerStartY + r * CLUSTER_HOST_GAP * 0.7 + HOST_R,
            };
        });
        for (const node of hostNodes) placed.add(node.host.id);

        groups.push({
            cluster,
            hosts: hostNodes,
            boxX, boxY, boxW, boxH,
            centerX: boxX + boxW / 2,
            centerY: boxY + boxH / 2,
        });
        cursorX += boxW + CLUSTER_PADDING;
        rowMaxH = Math.max(rowMaxH, boxH);
    }

    // Move to a new row for standalone hosts if any cluster groups placed.
    if (groups.length > 0) {
        cursorX = CLUSTER_PADDING;
        cursorY += rowMaxH + CLUSTER_PADDING;
    }

    const standalone = hosts.filter((h) => !placed.has(h.id));
    const standaloneNodes: HostNode[] = standalone.map((host, idx) => {
        const col = idx % 5;
        const row = Math.floor(idx / 5);
        return {
            host,
            x: CLUSTER_PADDING + HOST_R + col * STANDALONE_GAP,
            y: cursorY + row * ROW_HEIGHT + HOST_R + 30,
        };
    });
    if (standalone.length > 0) {
        cursorY += Math.ceil(standalone.length / 5) * ROW_HEIGHT;
    }

    const width = Math.max(960, maxRowWidth);
    const height = Math.max(520, cursorY + CLUSTER_PADDING);

    return {
        width,
        height,
        groups,
        allHostNodes: [...groups.flatMap((g) => g.hosts), ...standaloneNodes],
    };
}

export default TopologyPage;
