import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';

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
    if (__DEV__) console.warn('CLIENT_AVATAR_UPLOAD_NOT_CONFIGURED');
    return { ok: false, message: 'Non è stato possibile salvare l\'avatar. Riprova.' };
  }

  try {
    const extension = extensionFromAsset(asset);
    const contentType = asset.mimeType ?? contentTypeFromExtension(extension);
    const path = `${userId}/avatar.${extension}`;
    const fileBody = await readUploadBody(asset);

    const { error: uploadError } = await supabase.storage.from(CLIENT_AVATAR_BUCKET).upload(path, fileBody, {
      contentType,
      upsert: true,
    });
    if (uploadError) {
      if (__DEV__) console.warn('CLIENT_AVATAR_UPLOAD_ERROR', uploadError.message);
      return { ok: false, message: 'Non è stato possibile salvare l\'avatar. Riprova.' };
    }

    const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
    if (profileError) {
      if (__DEV__) console.warn('CLIENT_AVATAR_PROFILE_UPDATE_ERROR', profileError.message);
      return { ok: false, message: 'Non è stato possibile salvare l\'avatar. Riprova.' };
    }

    const signedUrl = await createClientAvatarSignedUrl(path, Date.now());
    return { ok: true, path, signedUrl };
  } catch (error) {
    if (__DEV__) console.warn('CLIENT_AVATAR_UPLOAD_THROW', getErrorMessage(error));
    return { ok: false, message: 'Non è stato possibile salvare l\'avatar. Riprova.' };
  }
}

export async function createClientAvatarSignedUrl(pathOrUrl: string | null | undefined, cacheKey?: string | number): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return appendCacheKey(pathOrUrl, cacheKey);
  if (!supabaseConfig.isConfigured || !supabase) return null;

  const storagePath = normalizeClientAvatarPath(pathOrUrl);
  if (!storagePath) return null;

  const { data, error } = await supabase.storage.from(CLIENT_AVATAR_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) {
    if (__DEV__) console.warn('CLIENT_AVATAR_SIGNED_URL_ERROR', { path: storagePath, message: error.message });
    return null;
  }
  return appendCacheKey(data.signedUrl, cacheKey);
}

export function normalizeClientAvatarPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed || null;
  const withoutLeadingSlash = trimmed.replace(/^\/+/, '');
  const bucketPrefix = `${CLIENT_AVATAR_BUCKET}/`;
  return withoutLeadingSlash.startsWith(bucketPrefix)
    ? withoutLeadingSlash.slice(bucketPrefix.length)
    : withoutLeadingSlash;
}

export async function saveClientAvatarPresetRemote(
  userId: string,
  preset: ClientAvatarPreset,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true };

  const { error } = await supabase.from('profiles').update({ avatar_preset: preset }).eq('id', userId);
  if (error) {
    if (__DEV__) console.warn('CLIENT_AVATAR_PRESET_SAVE_ERROR', error.message);
    return { ok: false, message: 'Non è stato possibile salvare l\'avatar. Riprova.' };
  }
  return { ok: true };
}

function extensionFromAsset(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType?.includes('png')) return 'png';
  if (asset.mimeType?.includes('webp')) return 'webp';
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName === 'png' || fromName === 'jpg' || fromName === 'jpeg' || fromName === 'webp') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return 'jpg';
}

function contentTypeFromExtension(extension: string) {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function readUploadBody(asset: ImagePicker.ImagePickerAsset): Promise<File | ArrayBuffer> {
  const webFile = (asset as ImagePicker.ImagePickerAsset & { file?: File; webFile?: File }).file
    ?? (asset as ImagePicker.ImagePickerAsset & { file?: File; webFile?: File }).webFile;
  if (Platform.OS === 'web' && webFile) return webFile;

  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return decode(base64);
}

function appendCacheKey(url: string, cacheKey?: string | number) {
  if (!cacheKey) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(cacheKey))}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'errore sconosciuto';
}
