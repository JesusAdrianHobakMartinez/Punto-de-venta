import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.laesquinita.tienda',
  appName: 'La Esquinita',
  webDir: 'dist/tienda/browser',
  android: {
    allowMixedContent: true,
  },
};

export default config;
