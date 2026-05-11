/**
 * RTK Query slice for metrics.
 *
 * `getMetrics` accepts a host + time range; a separate `collectMetrics`
 * mutation forces an immediate sample. Live updates are pushed via the
 * `event:metrics-tick` event (subscribed in `src/renderer/lib/metrics-events.ts`).
 */

import { createApi } from '@reduxjs/toolkit/query/react';

import { IPC_CHANNELS } from '@shared/ipc/contract';
import type { SystemMetrics } from '@shared/types';

import { ipcBaseQuery } from './ipcBaseQuery';

export interface MetricsRangeArgs {
  hostId: string;
  startTime: number;
  endTime: number;
}

export const metricsApi = createApi({
  reducerPath: 'metricsApi',
  baseQuery: ipcBaseQuery,
  tagTypes: ['Metrics'],
  endpoints: (builder) => ({
    getMetrics: builder.query<SystemMetrics[], MetricsRangeArgs>({
      query: (range) => ({ channel: IPC_CHANNELS.metricsGet, args: range }),
      providesTags: (_r, _e, { hostId }) => [{ type: 'Metrics', id: hostId }],
    }),

    collectMetrics: builder.mutation<SystemMetrics, string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.metricsCollect, args: { hostId } }),
      invalidatesTags: (_r, _e, hostId) => [{ type: 'Metrics', id: hostId }],
    }),

    startMetricsCollection: builder.mutation<void, string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.metricsStartCollection, args: { hostId } }),
    }),

    stopMetricsCollection: builder.mutation<void, string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.metricsStopCollection, args: { hostId } }),
    }),
  }),
});

export const {
  useGetMetricsQuery,
  useCollectMetricsMutation,
  useStartMetricsCollectionMutation,
  useStopMetricsCollectionMutation,
} = metricsApi;
