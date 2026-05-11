/**
 * Custom RTK Query baseQuery that calls into the Electron main process via
 * `window.vizcloud.invoke(channel, args)` instead of HTTP.
 *
 * Why a custom baseQuery instead of `fetchBaseQuery`?
 *   • This is an Electron app — there is no HTTP server to call.
 *   • The IPC bridge gives us strong typing across processes (see
 *     `@shared/ipc/contract`).
 *   • A typed error envelope lets every page render structured failures
 *     with consistent UX.
 *
 * Each endpoint specifies its IPC channel in the `query()` return value:
 *
 *     getHosts: builder.query<Host[], void>({
 *       query: () => ({ channel: IPC_CHANNELS.hostsList, args: undefined }),
 *       providesTags: ['Host'],
 *     }),
 */

import type { BaseQueryFn } from '@reduxjs/toolkit/query';

import type { IpcChannel, IpcMap } from '@shared/ipc/contract';

export interface IpcQueryArgs<C extends IpcChannel = IpcChannel> {
    channel: C;
    args: IpcMap[C]['req'];
}

export interface IpcQueryError {
    code: string;
    message: string;
    channel?: IpcChannel;
    cause?: unknown;
}

/**
 * RTK Query base query backed by the IPC bridge.
 *
 * Errors from main are surfaced as `Error` instances (see
 * `src/main/core/ipc.handlers.ts`). We unpack them into a
 * structured `IpcQueryError` so reducers and components can render them
 * without ad-hoc string parsing.
 */
export const ipcBaseQuery: BaseQueryFn<IpcQueryArgs, unknown, IpcQueryError> = async ({ channel, args }) => {
    if (typeof window === 'undefined' || !window.vizcloud) {
        return {
            error: {
                code: 'BRIDGE_UNAVAILABLE',
                message:
                    'Electron preload bridge is unavailable. This typically means the renderer is being run outside of Electron (e.g., in a plain browser test).',
                channel,
            },
        };
    }

    try {
        const data = await window.vizcloud.invoke(channel, args);
        return { data };
    } catch (raw) {
        const err = raw instanceof Error ? raw : new Error(String(raw));
        return {
            error: {
                code: extractErrorCode(err),
                message: err.message,
                channel,
                cause: err,
            },
        };
    }
};

/**
 * Extracts a structured code from an `Error`'s message. Electron strips
 * stack frames across IPC but preserves message; main process throws use
 * `code: NAME — description` patterns when we want a recognizable tag.
 */
function extractErrorCode(error: Error): string {
    const match = /^([A-Z][A-Z0-9_]+):\s/.exec(error.message);
    return match?.[1] ?? 'IPC_ERROR';
}
