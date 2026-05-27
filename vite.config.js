var _a, _b;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
var repositoryName = (_b = (_a = process.env.GITHUB_REPOSITORY) === null || _a === void 0 ? void 0 : _a.split('/')[1]) !== null && _b !== void 0 ? _b : '';
var isUserOrOrgPages = repositoryName.endsWith('.github.io');
var base = process.env.GITHUB_ACTIONS
    ? (isUserOrOrgPages ? '/' : "/".concat(repositoryName, "/"))
    : '/';
export default defineConfig({
    base: base,
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
                name: 'Chores Garden',
                short_name: 'Chores',
                description: 'A collaborative, humane, ontology-first chores tracker with local-first sync.',
                theme_color: '#0f172a',
                background_color: '#f8fafc',
                display: 'standalone',
                start_url: base,
                scope: base,
                icons: [
                    {
                        src: "".concat(base, "icon.svg"),
                        sizes: '512x512',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    }
                ]
            },
            devOptions: {
                enabled: false
            }
        })
    ]
});
