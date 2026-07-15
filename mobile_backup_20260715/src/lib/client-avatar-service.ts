import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

import { supabase, supabaseConfig } from './supabase';

import type { ClientAvatarPreset } from '@/types/client';

export const CLIENT_AVATAR_BUCKET = 'client-avatars';

export type ClientAvatarUploadResult =
  | { ok: true; path: string; signedUrl: string | null }
  | { ok: false; message: string };

export async function pickClientAvatarImage() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}

export async function uploadClientAvatar(userId: string, asset: ImagePicker.ImagePickerAsset): Promise<ClientAvatarUploadResult> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: false, message: 'Supabase non configurato: la foto resta locale finche il backend non e attivo.' };
  }

  const extension = extensionFromAsset(asset);
  const contentType = asset.mimeType ?? (extension === 'png' ? 'image/png' : 'image/jpeg');
  const path = `${userId}/${Date.now()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });

  const { error: uploadError } = await supabase.storage.from(CLIENT_AVATAR_BUCKET).upload(path, decode(base64), {
    contentType,
    upsert: true,
  });
  if (uploadError) {
    return { ok: false, message: `Errore upload avatar: ${uploadError.message}` };
  }

  const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
  if (profileError) {
    return { ok: false, message: `Avatar caricato, ma profilo non aggiornato: ${profileError.message}` };
  }

  const signedUrl = await createClientAvatarSignedUrl(path);
  return { ok: true, path, signedUrl };
}

export async function createClientAvatarSignedUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!supabaseConfig.isConfigured || !supabase) return null;

  const { data, error } = await supabase.storage.from(CLIENT_AVATAR_BUCKET).createSignedUrl(pathOrUrl, 60 * 60);
  if (error) {
    if (__DEV__) console.warn('CLIENT_AVATAR_SIGNED_URL_ERROR', error.message);
    return null;
  }
  return data.signedUrl;
}

export async function saveClientAvatarPresetRemote(
  userId: string,
  preset: ClientAvatarPreset,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true };

  const { error } = await supabase.from('profiles').update({ avatar_preset: preset }).eq('id', userId);
  if (error) {
    if (__DEV__) console.warn('CLIENT_AVATAR_PRESET_SAVE_ERROR', error.message);
    return { ok: false, message: 'Avatar predefinito salvato localmente. Esegui la migrazione SQL per persisterlo su Supabase.' };
  }
  return { ok: true };
}

function extensionFromAsset(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType?.includes('png')) return 'png';
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName === 'png' || fromName === 'jpg' || fromName === 'jpeg' || fromName === 'webp') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return 'jpg';
}
