import React from 'react';
import { FiBell, FiHelpCircle, FiSearch } from 'react-icons/fi';
import { useLocation } from 'react-router-dom';

import { useAppDispatch, useAppSelector } from '../../store';
import { setSearchQuery, toggleNotifications } from '../../store/slices/uiSlice';

const ROUTE_LABEL: Record<string, string> = {
  '/':            'Dashboard',
  '/hosts':       'Hosts',
  '/vms':         'Virtual Machines',
  '/clusters':    'Clusters',
  '/migration':   'Live Migration',
  '/diagnostics': 'Diagnostics',
  '/storage':     'Storage',
  '/topology':    'Network Topology',
  '/settings':    'Settings',
};

function routeLabel(pathname: string): string {
  const exact = ROUTE_LABEL[pathname];
  if (exact) return exact;
  for (const path of Object.keys(ROUTE_LABEL)) {
    const candidate = ROUTE_LABEL[path];
    if (candidate && path !== '/' && pathname.startsWith(path)) return candidate;
  }
  return 'Dashboard';
}

export const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const searchQuery = useAppSelector((s) => s.ui.searchQuery);
  const location = useLocation();
  const label = routeLabel(location.pathname);

  return (
    <header className="h-14 bg-header border-b border-border flex items-center justify-between px-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <span className="text-muted">Home</span>
        <span className="text-muted/60" aria-hidden>/</span>
        <span className="text-foreground font-medium">{label}</span>
      </nav>

      <div className="flex items-center gap-3">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Search hosts, VMs, clusters…"
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            className="pl-10 pr-3 py-1.5 bg-search border border-border rounded-lg text-sm w-64 lg:w-80
              focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              placeholder:text-muted/60"
            aria-label="Search"
          />
        </div>
        <button
          type="button"
          onClick={() => dispatch(toggleNotifications())}
          className="relative p-2 rounded-lg hover:bg-sidebar-hover text-muted hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <FiBell className="w-5 h-5" />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-sidebar-hover text-muted hover:text-foreground transition-colors"
          aria-label="Help"
          onClick={() => window.vizcloud?.invoke('shell:open-external', { url: 'https://docs.vizcloud.example.com' })}
        >
          <FiHelpCircle className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
