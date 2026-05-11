/**
 * Preload bridge.
 *
 * Runs in an isolated world with `contextIsolation: true` and exposes a
 * single, typed object on `window.vizcloud`. The renderer never has direct
 * access to Electron internals; every operation flows through `invoke` /
 * `subscribe` defined here.
 *
 * Output: compiled to `dist/main/preload/preload.cjs` (referenced from
 * `src/main/main.ts` via `webPreferences.preload`).
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
    IPC_CHANNELS,
    type IpcChannel,
    type IpcEvent,
    type IpcEventPayloads,
    type IpcMap,
    type VizCloudApi,
} from '../shared/ipc/contract';

const api: VizCloudApi = {
    invoke<C extends IpcChannel>(channel: C, args: IpcMap[C]['req']): Promise<IpcMap[C]['res']> {
        // Stripped of `IpcRendererEvent` — preload calls don't include the
        // sender. The main-process handlers see the canonical payload.
        return ipcRenderer.invoke(channel as string, args) as Promise<IpcMap[C]['res']>;
    },

    subscribe<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayloads[E]) => void): () => void {
        const wrapped = (_evt: IpcRendererEvent, payload: IpcEventPayloads[E]): void => {
            listener(payload);
        };
        ipcRenderer.on(event as string, wrapped);
        return (): void => {
            ipcRenderer.off(event as string, wrapped);
        };
    },

    log: {
        debug: (message, data) =>
            ipcRenderer.invoke(IPC_CHANNELS.logDebug, { message, data }) as Promise<void>,
        info: (message, data) =>
            ipcRenderer.invoke(IPC_CHANNELS.logInfo, { message, data }) as Promise<void>,
        warn: (message, data) =>
            ipcRenderer.invoke(IPC_CHANNELS.logWarn, { message, data }) as Promise<void>,
        error: (message, data) =>
            ipcRenderer.invoke(IPC_CHANNELS.logError, { message, data }) as Promise<void>,
    },
};

contextBridge.exposeInMainWorld('vizcloud', api);
