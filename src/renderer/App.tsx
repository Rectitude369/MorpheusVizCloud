import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

import { ErrorBoundary, LoadingSpinner } from './components/atoms';
import { AppLayout } from './components/layout/AppLayout';

// Lazy load pages for code splitting
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const HostsPage = React.lazy(() => import('./pages/HostsPage'));
const VMsPage = React.lazy(() => import('./pages/VMsPage'));
const ClustersPage = React.lazy(() => import('./pages/ClustersPage'));
const MigrationPage = React.lazy(() => import('./pages/MigrationPage'));
const DiagnosticsPage = React.lazy(() => import('./pages/DiagnosticsPage'));
const StoragePage = React.lazy(() => import('./pages/StoragePage'));
const TopologyPage = React.lazy(() => import('./pages/TopologyPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppLayout>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/hosts" element={<HostsPage />} />
            <Route path="/hosts/:id" element={<HostsPage />} />
            <Route path="/vms" element={<VMsPage />} />
            <Route path="/vms/:id" element={<VMsPage />} />
            <Route path="/clusters" element={<ClustersPage />} />
            <Route path="/clusters/:id" element={<ClustersPage />} />
            <Route path="/migration" element={<MigrationPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/topology" element={<TopologyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </ErrorBoundary>
  );
};

export default App;
