import React from 'react';
import { Text, View } from 'react-native';

import { ExternalLink } from './ExternalLink';
import { MonoText } from './StyledText';

export default function EditScreenInfo({ path }: { path: string }) {
  return (
    <View>
      <View className="mx-12 items-center">
        <Text className="text-center text-[17px] leading-6 text-neutral-800">Open up the code for this screen:</Text>

        <View className="my-2 rounded-sm bg-neutral-200/80 px-1">
          <MonoText>{path}</MonoText>
        </View>

        <Text className="text-center text-[17px] leading-6 text-neutral-800">
          Change any of the text, save the file, and your app will automatically update.
        </Text>
      </View>

      <View className="mx-5 mt-4 items-center">
        <ExternalLink
          className="py-4"
          href="https://docs.expo.io/get-started/create-a-new-app/#opening-the-app-on-your-phonetablet"
        >
          <Text className="text-center text-emerald-600">Tap here if your app doesn&apos;t automatically update after making changes</Text>
        </ExternalLink>
      </View>
    </View>
  );
}
