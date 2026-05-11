import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiSave } from 'react-icons/fi';

import { LoadingSpinner } from '../components/atoms';
import { IPC_CHANNELS, type SettingEntry } from '@shared/ipc/contract';

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SettingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.vizcloud.invoke(IPC_CHANNELS.settingsGetAll, undefined);
        if (!cancelled) setSettings(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleChange = (key: string, value: string): void => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await Promise.all(
        settings.map((s) => window.vizcloud.invoke(IPC_CHANNELS.settingsSet, { key: s.key, value: s.value })),
      );
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-sm disabled:opacity-50"
        >
          <FiSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {loading ? (
        <div className="py-16 flex items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="bg-page border border-border rounded-xl divide-y divide-border">
          {settings.map((s) => (
            <div key={s.key} className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div>
                <code className="text-sm font-mono text-foreground">{s.key}</code>
                {s.description && <p className="text-xs text-muted mt-1">{s.description}</p>}
              </div>
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={s.value}
                  onChange={(e) => handleChange(s.key, e.target.value)}
                  className="w-full px-3 py-2 bg-search border border-border rounded-md text-sm font-mono"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
