/**
 * RTK Query slice for clusters.
 */

import { createApi } from '@reduxjs/toolkit/query/react';

import { IPC_CHANNELS } from '@shared/ipc/contract';
import type { Cluster } from '@shared/types';

import { ipcBaseQuery } from './ipcBaseQuery';

export const clustersApi = createApi({
  reducerPath: 'clustersApi',
  baseQuery: ipcBaseQuery,
  tagTypes: ['Cluster'],
  endpoints: (builder) => ({
    getClusters: builder.query<Cluster[], void>({
      query: () => ({ channel: IPC_CHANNELS.clustersList, args: undefined }),
      providesTags: (result) =>
        result
          ? [
              { type: 'Cluster', id: 'LIST' },
              ...result.map((c) => ({ type: 'Cluster' as const, id: c.id })),
            ]
          : [{ type: 'Cluster', id: 'LIST' }],
    }),

    getCluster: builder.query<Cluster | null, string>({
      query: (id) => ({ channel: IPC_CHANNELS.clustersGet, args: { id } }),
      providesTags: (_r, _e, id) => [{ type: 'Cluster', id }],
    }),

    discoverCluster: builder.mutation<Cluster | null, string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.clustersDiscover, args: { hostId } }),
      invalidatesTags: [{ type: 'Cluster', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetClustersQuery,
  useGetClusterQuery,
  useDiscoverClusterMutation,
} = clustersApi;
