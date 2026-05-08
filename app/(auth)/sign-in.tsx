import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { db, isInstantConfigured } from '@/src/db/instant';

type Step = 'email' | 'code';

export default function SignInScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const isValidEmail = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const canSend = isInstantConfigured && Boolean(db) && isValidEmail && !busy;
  const canVerify = isInstantConfigured && Boolean(db) && isValidEmail && code.trim().length >= 4 && !busy;

  if (!isInstantConfigured || !db) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-base font-semibold text-neutral-900">InstantDB isn’t configured.</Text>
        <Text className="mt-2 text-center text-sm text-neutral-600">
          Set <Text className="font-mono font-semibold">EXPO_PUBLIC_INSTANT_APP_ID</Text> and restart the dev server.
        </Text>
      </View>
    );
  }

  const instant = db;

  async function sendCode() {
    try {
      setBusy(true);
      await instant.auth.sendMagicCode({ email: email.trim().toLowerCase() });
      setStep('code');
    } catch (e: any) {
      Alert.alert('Could not send code', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    try {
      setBusy(true);
      await instant.auth.signInWithMagicCode({
        email: email.trim().toLowerCase(),
        code: code.trim(),
      });
    } catch (e: any) {
      Alert.alert('Could not sign in', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 justify-center bg-neutral-100 px-6">
      <Text className="text-3xl font-bold text-neutral-900">Sign in</Text>
      <Text className="mt-2 text-sm text-neutral-600">We’ll email you a one-time code.</Text>

      <View className="mt-6">
        <Text className="mb-2 text-sm font-medium text-neutral-700">Email</Text>
        <TextInput
          className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
        />
      </View>

      {step === 'code' ? (
        <View className="mt-4">
          <Text className="mb-2 text-sm font-medium text-neutral-700">Code</Text>
          <TextInput
            className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
          />
        </View>
      ) : null}

      <View className="mt-6">
        {step === 'email' ? (
          <Pressable
            className={`h-12 items-center justify-center rounded-xl bg-emerald-600 ${!canSend ? 'opacity-50' : 'active:opacity-90'}`}
            disabled={!canSend}
            onPress={sendCode}
          >
            {busy ? <ActivityIndicator color="white" /> : <Text className="text-base font-semibold text-white">Send code</Text>}
          </Pressable>
        ) : (
          <Pressable
            className={`h-12 items-center justify-center rounded-xl bg-emerald-600 ${!canVerify ? 'opacity-50' : 'active:opacity-90'}`}
            disabled={!canVerify}
            onPress={verifyCode}
          >
            {busy ? <ActivityIndicator color="white" /> : <Text className="text-base font-semibold text-white">Verify</Text>}
          </Pressable>
        )}
      </View>

      {step === 'code' ? (
        <Pressable
          className="mt-4 items-center"
          disabled={busy}
          onPress={() => {
            setCode('');
            setStep('email');
          }}
        >
          <Text className="text-sm font-medium text-neutral-700">Use a different email</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
