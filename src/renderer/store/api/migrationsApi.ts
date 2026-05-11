/**
 * RTK Query slice for live VM migrations.
 *
 * The page is expected to subscribe to the `event:migration-progress` push
 * stream (via `window.vizcloud.subscribe`) and dispatch
 * `migrationsApi.util.updateQueryData('getMigration', id, ...)` to keep
 * the cache hot without polling. The subscription helper lives in
 * `src/renderer/lib/migration-events.ts`.
 */

import { createApi } from '@reduxjs/toolkit/query/react';

import { IPC_CHANNELS } from '@shared/ipc/contract';
import type { Migration } from '@shared/types';

import { ipcBaseQuery } from './ipcBaseQuery';

export const migrationsApi = createApi({
  reducerPath: 'migrationsApi',
  baseQuery: ipcBaseQuery,
  tagTypes: ['Migration', 'VM'],
  endpoints: (builder) => ({
    getMigrations: builder.query<Migration[], void>({
      query: () => ({ channel: IPC_CHANNELS.migrationsList, args: undefined }),
      providesTags: (result) =>
        result
          ? [
              { type: 'Migration', id: 'LIST' },
              ...result.map((m) => ({ type: 'Migration' as const, id: m.id })),
            ]
          : [{ type: 'Migration', id: 'LIST' }],
    }),

    getActiveMigrations: builder.query<Migration[], void>({
      query: () => ({ channel: IPC_CHANNELS.migrationsListActive, args: undefined }),
      providesTags: [{ type: 'Migration', id: 'ACTIVE' }],
    }),

    getMigration: builder.query<Migration | null, string>({
      query: (id) => ({ channel: IPC_CHANNELS.migrationsGet, args: { id } }),
      providesTags: (_r, _e, id) => [{ type: 'Migration', id }],
    }),

    startMigration: builder.mutation<
      Migration,
      { vmId: string; sourceHostId: string; targetHostId: string; mode: 'live' | 'cold' }
    >({
      query: (args) => ({ channel: IPC_CHANNELS.migrationsStart, args }),
      invalidatesTags: (_r, _e, { vmId }) => [
        { type: 'Migration', id: 'LIST' },
        { type: 'Migration', id: 'ACTIVE' },
        { type: 'VM', id: vmId },
      ],
    }),

    cancelMigration: builder.mutation<void, string>({
      query: (id) => ({ channel: IPC_CHANNELS.migrationsCancel, args: { id } }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'Migration', id },
        { type: 'Migration', id: 'ACTIVE' },
        { type: 'Migration', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetMigrationsQuery,
  useGetActiveMigrationsQuery,
  useGetMigrationQuery,
  useStartMigrationMutation,
  useCancelMigrationMutation,
} = migrationsApi;
