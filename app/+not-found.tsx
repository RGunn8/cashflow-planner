import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-lg font-semibold text-neutral-900">This screen doesn't exist.</Text>

        <Link href="/" className="mt-4">
          <Text className="text-sm font-semibold text-emerald-700">Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}
