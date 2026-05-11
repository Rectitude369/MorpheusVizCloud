/**
 * RTK Query slice for diagnostics — log bundle list/collect/cancel and the
 * tail-start/stop control plane. Push events (bundle progress, log lines)
 * flow via the event bridge directly into pages, not through this slice.
 */

import { createApi } from '@reduxjs/toolkit/query/react';

import { IPC_CHANNELS } from '@shared/ipc/contract';
import type { BundleSummary, LogSourceId } from '@shared/types';

import { ipcBaseQuery } from './ipcBaseQuery';

export const diagnosticsApi = createApi({
  reducerPath: 'diagnosticsApi',
  baseQuery: ipcBaseQuery,
  tagTypes: ['Bundle', 'LogSource'],
  endpoints: (builder) => ({
    listBundles: builder.query<BundleSummary[], void>({
      query: () => ({ channel: IPC_CHANNELS.diagnosticsBundleList, args: undefined }),
      providesTags: ['Bundle'],
    }),
    collectBundle: builder.mutation<{ localPath: string; size: number }, string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.diagnosticsBundleCollect, args: { hostId } }),
      invalidatesTags: ['Bundle'],
    }),
    cancelBundle: builder.mutation<void, string>({
      query: (hostId) => ({ channel: IPC_CHANNELS.diagnosticsBundleCancel, args: { hostId } }),
    }),
    openBundleFolder: builder.mutation<void, void>({
      query: () => ({ channel: IPC_CHANNELS.diagnosticsBundleOpenFolder, args: undefined }),
    }),
    listLogSources: builder.query<LogSourceId[], void>({
      query: () => ({ channel: IPC_CHANNELS.diagnosticsLogSources, args: undefined }),
      providesTags: ['LogSource'],
    }),
    startTail: builder.mutation<void, { hostId: string; source: LogSourceId }>({
      query: (args) => ({ channel: IPC_CHANNELS.diagnosticsTailStart, args }),
    }),
    stopTail: builder.mutation<void, { hostId: string; source: LogSourceId }>({
      query: (args) => ({ channel: IPC_CHANNELS.diagnosticsTailStop, args }),
    }),
    saveBundleAs: builder.mutation<{ saved: boolean; destPath?: string }, string>({
      query: (fileName) => ({ channel: IPC_CHANNELS.diagnosticsBundleSaveAs, args: { fileName } }),
    }),
    revealBundle: builder.mutation<void, string>({
      query: (fileName) => ({ channel: IPC_CHANNELS.diagnosticsBundleReveal, args: { fileName } }),
    }),
    deleteBundle: builder.mutation<void, string>({
      query: (fileName) => ({ channel: IPC_CHANNELS.diagnosticsBundleDelete, args: { fileName } }),
      invalidatesTags: ['Bundle'],
    }),
  }),
});

export const {
  useListBundlesQuery,
  useCollectBundleMutation,
  useCancelBundleMutation,
  useOpenBundleFolderMutation,
  useListLogSourcesQuery,
  useStartTailMutation,
  useStopTailMutation,
  useSaveBundleAsMutation,
  useRevealBundleMutation,
  useDeleteBundleMutation,
} = diagnosticsApi;
