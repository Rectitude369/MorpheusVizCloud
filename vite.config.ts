import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

/**
 * Vite config for the renderer + main + preload.
 *
 * `vite-plugin-electron` builds main-process and preload entries alongside
 * the renderer. Each entry gets its own Rollup config so we can control
 * output format (CJS for main + preload, ESM for renderer).
 */
const sharedAlias = {
    '@': resolve(__dirname, 'src/renderer'),
    '@main': resolve(__dirname, 'src/main'),
    '@shared': resolve(__dirname, 'src/shared'),
};

export default defineConfig(({ command }) => {
    const isDev = command === 'serve';

    return {
        plugins: [
            react(),
            electron([
                {
                    entry: 'src/main/main.ts',
                    vite: {
                        resolve: { alias: sharedAlias },
                        build: {
                            outDir: 'dist/main',
                            sourcemap: true,
                            minify: !isDev,
                            rollupOptions: {
                                external: [
                                    'electron',
                                    'better-sqlite3',
                                    'ssh2',
                                    'electron-log',
                                    'electron-window-state',
                                    'electron-updater',
                                ],
                                output: {
                                    format: 'cjs',
                                    entryFileNames: '[name].js',
                                    inlineDynamicImports: true,
                                },
                            },
                        },
                    },
                },
                {
                    entry: 'src/preload/preload.ts',
                    onstart({ reload }) {
                        // Reload the renderer when the preload changes in dev.
                        reload();
                    },
                    vite: {
                        resolve: { alias: sharedAlias },
                        build: {
                            outDir: 'dist/main/preload',
                            sourcemap: 'inline',
                            minify: !isDev,
                            rollupOptions: {
                                external: ['electron'],
                                output: {
                                    format: 'cjs',
                                    entryFileNames: '[name].js',
                                },
                            },
                        },
                    },
                },
            ]),
            renderer(),
        ],
        resolve: {
            alias: sharedAlias,
        },
        base: './',
        build: {
            outDir: 'dist/renderer',
            emptyOutDir: true,
            sourcemap: true,
            minify: 'esbuild',
            target: 'chrome120',
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'index.html'),
                },
            },
        },
        server: {
            port: 3000,
            strictPort: true,
        },
    };
});
