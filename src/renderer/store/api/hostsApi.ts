/**
 * RTK Query slice for hosts.
 *
 * Tag strategy:
 *   • The list is tagged with `{ type: 'Host', id: 'LIST' }`; mutations that
 *     change the set of hosts (connect / delete / update) invalidate the
 *     list.
 *   • Each entity is also tagged by id so granular re-fetches work.
 *   • Connection records have their own `HostConnection` tag bucket.
 */

import { createApi } from '@reduxjs/toolkit/query/react';

import { IPC_CHANNELS } from '@shared/ipc/contract';
import type { Host, HostConnection } from '@shared/types';

import { ipcBaseQuery } from './ipcBaseQuery';

export const hostsApi = createApi({
  reducerPath: 'hostsApi',
  baseQuery: ipcBaseQuery,
  tagTypes: ['Host', 'HostConnection'],
  endpoints: (builder) => ({
    getHosts: builder.query<Host[], void>({
      query: () => ({ channel: IPC_CHANNELS.hostsList, args: undefined }),
      providesTags: (result) =>
        result
          ? [
              { type: 'Host', id: 'LIST' },
              ...result.map((h) => ({ type: 'Host' as const, id: h.id })),
            ]
          : [{ type: 'Host', id: 'LIST' }],
    }),

    getHost: builder.query<Host | null, string>({
      query: (id) => ({ channel: IPC_CHANNELS.hostsGet, args: { id } }),
      providesTags: (_result, _err, id) => [{ type: 'Host', id }],
    }),

    connectHost: builder.mutation<Host, HostConnection & { password?: string }>({
      query: (conn) => ({ channel: IPC_CHANNELS.hostsConnect, args: conn }),
      invalidatesTags: [{ type: 'Host', id: 'LIST' }, 'HostConnection'],
    }),

    disconnectHost: builder.mutation<void, string>({
      query: (id) => ({ channel: IPC_CHANNELS.hostsDisconnect, args: { id } }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Host', id }, { type: 'Host', id: 'LIST' }],
    }),

    updateHost: builder.mutation<Host, { id: string; patch: Partial<Host> }>({
      query: ({ id, patch }) => ({ channel: IPC_CHANNELS.hostsUpdate, args: { id, patch } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Host', id }, { type: 'Host', id: 'LIST' }],
    }),

    deleteHost: builder.mutation<void, string>({
      query: (id) => ({ channel: IPC_CHANNELS.hostsDelete, args: { id } }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Host', id }, { type: 'Host', id: 'LIST' }],
    }),

    listHostConnections: builder.query<HostConnection[], void>({
      query: () => ({ channel: IPC_CHANNELS.hostsListConnections, args: undefined }),
      providesTags: ['HostConnection'],
    }),

    saveHostConnection: builder.mutation<HostConnection, HostConnection & { password?: string }>({
      query: (conn) => ({ channel: IPC_CHANNELS.hostsSaveConnection, args: conn }),
      invalidatesTags: ['HostConnection'],
    }),

    removeHostConnection: builder.mutation<void, string>({
      query: (id) => ({ channel: IPC_CHANNELS.hostsRemoveConnection, args: { id } }),
      invalidatesTags: ['HostConnection'],
    }),
  }),
});

export const {
  useGetHostsQuery,
  useGetHostQuery,
  useConnectHostMutation,
  useDisconnectHostMutation,
  useUpdateHostMutation,
  useDeleteHostMutation,
  useListHostConnectionsQuery,
  useSaveHostConnectionMutation,
  useRemoveHostConnectionMutation,
} = hostsApi;
