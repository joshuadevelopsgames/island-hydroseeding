import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.islandhydroseeding.ops',
  appName: 'Island Hydroseeding',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
