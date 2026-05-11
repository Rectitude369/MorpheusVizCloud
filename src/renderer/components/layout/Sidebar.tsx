import React from 'react';
import {
  FiActivity, FiBox, FiGlobe, FiHardDrive, FiHome, FiLayers,
  FiMonitor, FiServer, FiSettings, FiSidebar, FiTrendingUp,
} from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAppDispatch, useAppSelector } from '../../store';
import { toggleSidebar } from '../../store/slices/uiSlice';

interface NavItem {
  readonly path: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { path: '/',            icon: FiHome,        label: 'Dashboard' },
  { path: '/hosts',       icon: FiServer,      label: 'Hosts' },
  { path: '/vms',         icon: FiBox,         label: 'VMs' },
  { path: '/clusters',    icon: FiLayers,      label: 'Clusters' },
  { path: '/migration',   icon: FiTrendingUp,  label: 'Migration' },
  { path: '/topology',    icon: FiGlobe,       label: 'Topology' },
  { path: '/diagnostics', icon: FiActivity,    label: 'Diagnostics' },
  { path: '/storage',     icon: FiHardDrive,   label: 'Storage' },
  { path: '/settings',    icon: FiSettings,    label: 'Settings' },
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} bg-sidebar border-r border-border flex flex-col transition-[width] duration-200`}
      aria-label="Primary navigation"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <FiMonitor className="w-5 h-5 text-white" aria-hidden />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground leading-none">VizCloud</h1>
              <p className="text-xs text-muted leading-tight mt-0.5">HVM Manager</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => dispatch(toggleSidebar())}
          className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <FiSidebar className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group
                ${isActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted hover:bg-sidebar-hover hover:text-foreground'}`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-primary' : 'text-muted group-hover:text-foreground'}`} />
              {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
              {!collapsed && isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" aria-hidden />
          {!collapsed && <span>System Operational</span>}
        </div>
        {!collapsed && (
          <div className="mt-1 text-xs text-muted/60">v1.0.0-alpha.1</div>
        )}
      </div>
    </aside>
  );
};
