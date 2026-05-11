/**
 * RTK Query slice for VMs.
 *
 * Lifecycle mutations (start/stop/reboot/...) invalidate just the VM and
 * its host's running count. Discovery refreshes the list under that host.
 */

import { createApi } from '@reduxjs/toolkit/query/react';

import { IPC_CHANNELS } from '@shared/ipc/contract';
import type { VM } from '@shared/types';

import { ipcBaseQuery } from './ipcBaseQuery';

type LifecycleOp =
  | typeof IPC_CHANNELS.vmsStart
  | typeof IPC_CHANNELS.vmsStop
  | typeof IPC_CHANNELS.vmsReboot
  | typeof IPC_CHANNELS.vmsReset
  | typeof IPC_CHANNELS.vmsSuspend
  | typeof IPC_CHANNELS.vmsResume
  | typeof IPC_CHANNELS.vmsDestroy;

export const vmsApi = createApi({
  reducerPath: 'vmsApi',
  baseQuery: ipcBaseQuery,
  tagTypes: ['VM', 'Host'],
  endpoints: (builder) => ({
    getVMs: builder.query<VM[], void>({
      query: () => ({ channel: IPC_CHANNELS.vmsList, args: undefined }),
      providesTags: (result) =>
        result
          ? [
              { type: 'VM', id: 'LIST' },
              ...result.map((v) => ({ type: 'VM' as const, id: v.id })),
            ]
          : [{ type: 'VM', id: 'LIST' }],
    }),

    getVM: builder.query<VM | null, string>({
      query: (id) => ({ channel: IPC_CHANNELS.vmsGet, args: { id } }),
      providesTags: (_r, _e, id) => [{ type: 'VM', id }],
    }),

    getVMsByHost: builder.query<VM[], string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.vmsListByHost, args: { hostId } }),
      providesTags: (result, _err, hostId) =>
        result
          ? [
              { type: 'VM', id: `HOST:${hostId}` },
              ...result.map((v) => ({ type: 'VM' as const, id: v.id })),
            ]
          : [{ type: 'VM', id: `HOST:${hostId}` }],
    }),

    discoverVMs: builder.mutation<VM[], string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.vmsDiscover, args: { hostId } }),
      invalidatesTags: (_r, _e, hostId) => [
        { type: 'VM', id: 'LIST' },
        { type: 'VM', id: `HOST:${hostId}` },
        { type: 'Host', id: hostId },
      ],
    }),

    runLifecycle: builder.mutation<void, { id: string; op: LifecycleOp }>({
      query: ({ id, op }) => ({ channel: op, args: { id } }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'VM', id },
        { type: 'VM', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetVMsQuery,
  useGetVMQuery,
  useGetVMsByHostQuery,
  useDiscoverVMsMutation,
  useRunLifecycleMutation,
} = vmsApi;
