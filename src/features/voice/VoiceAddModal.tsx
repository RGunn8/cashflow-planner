import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Audio } from 'expo-av';

// Keep recordings short and low bitrate to reduce upload/transcription latency.
const MAX_RECORD_MS = 12_000;

export type VoiceIntent = 'transaction' | 'recurring' | 'unknown';

export type VoiceTransactionDraft = {
  description?: string;
  amount?: number;
  date?: string; // YYYY-MM-DD
  accountName?: string;
  accountId?: string;
  tags?: string[];
  isWhatIf?: boolean;
};

export type VoiceRecurringDraft = {
  kind: 'bill' | 'income' | 'transfer' | 'goal';
  name: string;
  amount: number;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  weeklyDow?: number;
  monthlyDay?: number;
  accountId?: string;
  toAccountId?: string;
};

export type VoiceParseResponse = {
  transcript: string;
  intent: VoiceIntent;
  transaction?: VoiceTransactionDraft;
  recurring?: VoiceRecurringDraft;
};

function voiceApiUrl(): string | null {
  return process.env.EXPO_PUBLIC_VOICE_API_URL ?? null;
}

export function VoiceAddModal(props: {
  open: boolean;
  onClose: () => void;
  onResult: (res: VoiceParseResponse) => void;
}) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const canStart = props.open && !isRecording && !isUploading;
  const canStop = props.open && isRecording && !isUploading;

  const apiUrl = useMemo(() => voiceApiUrl(), []);

  async function start() {
    if (!apiUrl) {
      Alert.alert('Voice not configured', 'Set EXPO_PUBLIC_VOICE_API_URL in .env.local');
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone permission', 'Microphone access is required for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Lower-quality audio is faster to upload/transcribe and is sufficient for speech.
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
      await rec.startAsync();

      recordingRef.current = rec;
      setRecording(rec);
      setIsRecording(true);

      // Auto-stop to keep uploads/transcription fast.
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = setTimeout(() => {
        // Fire-and-forget; stopAndUpload handles state + errors.
        void stopAndUpload(rec);
      }, MAX_RECORD_MS);
    } catch (e: any) {
      Alert.alert('Could not start recording', e?.message ?? 'Unknown error');
    }
  }

  async function stopAndUpload(recOverride?: Audio.Recording | null) {
    const rec = recOverride ?? recordingRef.current ?? recording;
    if (!rec) return;
    if (!apiUrl) return;

    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    try {
      setIsUploading(true);
      setIsRecording(false);

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      setRecording(null);

      if (!uri) throw new Error('No audio URI produced');

      const form = new FormData();
      form.append('audio', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);

      const res = await fetch(apiUrl.replace(/\/$/, '') + '/voice/parse', {
        method: 'POST',
        body: form,
        headers: {
          // Let fetch set multipart boundary automatically
        } as any,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Voice API error (${res.status}): ${txt || res.statusText}`);
      }

      const json = (await res.json()) as VoiceParseResponse;
      if (!json || typeof json.transcript !== 'string') {
        throw new Error('Invalid response from voice API');
      }

      props.onResult(json);
      props.onClose();
    } catch (e: any) {
      Alert.alert('Voice input failed', e?.message ?? 'Unknown error');
    } finally {
      setIsUploading(false);
    }
  }

  async function cancel() {
    try {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      const rec = recordingRef.current ?? recording;
      if (rec) {
        await rec.stopAndUnloadAsync().catch(() => {});
      }
    } finally {
      recordingRef.current = null;
      setRecording(null);
      setIsRecording(false);
      setIsUploading(false);
      props.onClose();
    }
  }

  if (!props.open) return null;

  return (
    <View className="absolute inset-0 bg-black/30">
      <View className="mx-4 mt-24 rounded-2xl bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-neutral-900">Voice add</Text>
          <Pressable onPress={cancel}>
            <Text className="text-sm font-semibold text-neutral-600">Close</Text>
          </Pressable>
        </View>

        <Text className="mt-3 text-xs leading-5 text-neutral-600">
          Speak naturally. We’ll detect whether it’s a transaction or a recurring bill/income, then prefill a form for you to confirm.
        </Text>

        <Text className="mt-2 text-[11px] text-neutral-500">Tip: keep it under ~10 seconds for the fastest results.</Text>

        <View className="mt-4 flex-row gap-2">
          <Pressable
            className={`flex-1 items-center justify-center rounded-xl bg-emerald-600 py-3 ${!canStart ? 'opacity-50' : 'active:opacity-90'}`}
            disabled={!canStart}
            onPress={start}
          >
            <Text className="text-sm font-semibold text-white">Record</Text>
          </Pressable>

          <Pressable
            className={`flex-1 items-center justify-center rounded-xl bg-neutral-900 py-3 ${!canStop ? 'opacity-50' : 'active:opacity-90'}`}
            disabled={!canStop}
            onPress={() => stopAndUpload()}
          >
            <Text className="text-sm font-semibold text-white">Stop</Text>
          </Pressable>
        </View>

        {isUploading ? <Text className="mt-3 text-xs font-semibold text-neutral-500">Transcribing…</Text> : null}
        {isRecording ? <Text className="mt-3 text-xs font-semibold text-rose-700">Recording…</Text> : null}
      </View>
    </View>
  );
}
