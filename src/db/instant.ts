import 'react-native-get-random-values';

import { init } from '@instantdb/react-native';

import { schema } from './schema';

const appId = process.env.EXPO_PUBLIC_INSTANT_APP_ID;

export const isInstantConfigured = Boolean(appId);

export const db = isInstantConfigured
  ? init({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      appId: appId!,
      schema,
    })
  : null;

