import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartledger.app',
  appName: 'SmartLedger',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
