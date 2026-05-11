/**
 * Type augmentation for the renderer.
 *
 * Declares the global `window.vizcloud` surface that the preload script
 * (`src/preload/preload.ts`) exposes via `contextBridge`. Importing this
 * file is not necessary — TypeScript picks it up via the project's
 * `include` glob.
 */

import type { VizCloudApi } from '@shared/ipc/contract';

declare global {
    interface Window {
        readonly vizcloud: VizCloudApi;
    }
}

export {};
