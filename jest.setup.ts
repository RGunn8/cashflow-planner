// Jest setup for Expo / React Native

// NOTE: @testing-library/jest-native is deprecated, but still useful; can be removed later
// in favor of @testing-library/react-native's built-in matchers.
import '@testing-library/jest-native/extend-expect';

// Required mocks for common RN libs
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Silence RN Animated warning noise (path varies by RN version)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react-native/Libraries/Animated/NativeAnimatedHelper');
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch {
  // ignore
}
