import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Modal as RNModal,
  Dimensions,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X, Trash2, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  JOB_PHOTOS_BUCKET,
  MAX_PHOTOS_PER_JOB,
  jobPhotoPath,
  jobPhotoFilename,
  nextRotation,
  type JobPhoto,
} from '@amixos/shared/lib/jobPhotos';
import { useSignedUrls } from '@amixos/shared/lib/storageUrls';
import { queuedUpload } from '@/lib/offline/mutate';
import { useOutboxStore } from '@/lib/offline/outbox';
import { isOnlineNow } from '@/lib/offline/network';

interface Props {
  jobId: string;
  businessId: string;
  /** Office+ writers can add/remove; viewers see a read-only gallery. */
  canWrite: boolean;
}

const GAP = 8;
const COLS = 3;

export function JobPhotosSection({ jobId, businessId, canWrite }: Props) {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.jobs.detail.photos;
  const tc = full.common;
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  // Photos captured offline live in the outbox until they upload — render them
  // as pending tiles (from their durable local file) so they show immediately.
  const pending = useOutboxStore(s =>
    s.ops.filter(o => o.op === 'upload' && o.table === 'job_photos' && (o.payload as { job_id?: string }).job_id === jobId),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerListRef = useRef<FlatList<JobPhoto>>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setPhotos((data as JobPhoto[] | null) ?? []);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickAndUpload = async (source: 'camera' | 'library') => {
    setPickerOpen(false);
    if (photos.length + pending.length >= MAX_PHOTOS_PER_JOB) {
      setError(t.limitHit.replace('{{max}}', String(MAX_PHOTOS_PER_JOB)));
      return;
    }
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    // Compress at the picker (quality 0.6) — this is a pure-JS path, no
    // native module, so it works in the current dev client. It recompresses
    // to JPEG but keeps full pixel dimensions; a 12 MP phone photo lands
    // around ~1 MB. (For a smaller ~300–500 KB downscale we'd need
    // expo-image-manipulator, which requires a dev-client rebuild — the web
    // side already does that downscale via canvas.)
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6,
          });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    setError('');
    try {
      const path = jobPhotoPath(businessId, jobId, jobPhotoFilename('jpg'));
      // Offline: copy the image into the document dir so the queued upload
      // survives an app restart (the picker's temp uri can be cleared).
      let uploadUri = asset.uri;
      if (!isOnlineNow()) {
        try {
          const FileSystem = require('expo-file-system');
          const durable = `${FileSystem.documentDirectory}offline_photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
          await FileSystem.copyAsync({ from: asset.uri, to: durable });
          uploadUri = durable;
        } catch {
          /* expo-file-system not present yet — fall back to the temp uri */
        }
      }
      const { queued } = await queuedUpload({
        table: 'job_photos',
        payload: {
          business_id: businessId,
          job_id: jobId,
          storage_path: path,
          sort_order: photos.length + pending.length,
          created_by: user?.id ?? null,
        },
        businessId,
        label: t.addBtn,
        localUri: uploadUri,
        bucket: JOB_PHOTOS_BUCKET,
        storagePath: path,
        contentType: 'image/jpeg',
      });
      // Online write lands immediately → refresh. Offline → the pending tile
      // (from the outbox) shows it until it syncs.
      if (!queued) await load();
    } catch {
      setError(t.uploadError);
    }
    setUploading(false);
  };

  const removePhoto = (photo: JobPhoto) => {
    Alert.alert('', t.deleteConfirm, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: tc.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          // Deleting the row fires the AFTER DELETE trigger (057, hardened in
          // 073) which removes the storage object. Surface failures instead of
          // swallowing them — a silent error here looked like "delete does
          // nothing" because load() just re-showed the still-present row.
          // .select() so we can tell a real delete (returns the row) from an
          // RLS no-op (returns [] with no error) — both used to look like
          // success and just re-show the photo on reload.
          const { data: deleted, error: delErr } = await supabase
            .from('job_photos').delete().eq('id', photo.id).select('id');
          if (delErr || !deleted?.length) {
            setError(t.deleteError);
            return;
          }
          setError('');
          setViewerIndex(null);
          await load();
        },
      },
    ]);
  };

  const { width: screenW, height: screenH } = Dimensions.get('window');

  const rotateCurrent = async () => {
    if (viewerIndex === null) return;
    const photo = photos[viewerIndex];
    if (!photo) return;
    const rotation = nextRotation(photo.rotation ?? 0);
    // Optimistic local update so the rotation feels instant, then persist.
    setPhotos(prev => prev.map(p => (p.id === photo.id ? { ...p, rotation } : p)));
    await supabase.from('job_photos').update({ rotation }).eq('id', photo.id);
  };

  const goTo = (delta: number) => {
    if (viewerIndex === null) return;
    const next = Math.min(Math.max(viewerIndex + delta, 0), photos.length - 1);
    if (next === viewerIndex) return;
    setViewerIndex(next);
    viewerListRef.current?.scrollToIndex({ index: next, animated: true });
  };

  // Swipe sync — round the paged offset to the nearest page index.
  const onViewerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
    setViewerIndex(prev => (prev === idx ? prev : idx));
  };

  // Section sits inside the detail ScrollView's px-5 (20px) padding.
  const tileSize = Math.floor((screenW - 40 - GAP * (COLS - 1)) / COLS);
  const atLimit = photos.length + pending.length >= MAX_PHOTOS_PER_JOB;

  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;
  // Photos live in a private bucket — resolve short-lived signed URLs.
  const photoUrls = useSignedUrls(supabase, photos.map((p) => p.storage_path));
  // Available height for the image area (screen minus header/footer/safe-areas).
  const availH = screenH - insets.top - insets.bottom - 120;

  // One swipeable page per photo, each with rotation-aware sizing: when
  // rotated 90/270 the on-screen footprint is the box's swapped dimensions,
  // so size the box swapped to keep the rotated image inside the viewport.
  const renderViewerPage = ({ item }: { item: JobPhoto }) => {
    const r = (item.rotation ?? 0) % 360;
    const swap = r === 90 || r === 270;
    return (
      <View style={{ width: screenW, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={{ uri: photoUrls[item.storage_path] }}
          style={{
            width: swap ? availH : screenW,
            height: swap ? screenW : availH,
            transform: [{ rotate: `${r}deg` }],
          }}
          resizeMode="contain"
        />
      </View>
    );
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-xs text-gray-400">
          {t.countLabel.replace('{{count}}', String(photos.length)).replace('{{max}}', String(MAX_PHOTOS_PER_JOB))}
        </Text>
      </View>

      {error ? (
        <View className="px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <Text className="text-sm text-red-600">{error}</Text>
        </View>
      ) : null}

      {photos.length === 0 && pending.length === 0 && !canWrite ? (
        <View className="py-8 items-center">
          <ImagePlus size={28} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-2">{t.empty}</Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap" style={{ gap: GAP }}>
          {photos.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => setViewerIndex(i)}
              style={{ width: tileSize, height: tileSize }}
              className="rounded-xl overflow-hidden bg-gray-100"
            >
              <Image
                source={{ uri: photoUrls[p.storage_path] }}
                style={{ width: tileSize, height: tileSize, transform: [{ rotate: `${p.rotation ?? 0}deg` }] }}
                resizeMode="cover"
              />
            </Pressable>
          ))}

          {/* Pending (queued offline) photos — shown from their local file with
              a spinner overlay until they upload. */}
          {pending.map(op => (
            <View
              key={op.id}
              style={{ width: tileSize, height: tileSize }}
              className="rounded-xl overflow-hidden bg-gray-100"
            >
              <Image source={{ uri: op.localUri }} style={{ width: tileSize, height: tileSize }} resizeMode="cover" />
              <View className="absolute inset-0 items-center justify-center bg-black/30">
                <ActivityIndicator color="#FFFFFF" />
              </View>
            </View>
          ))}

          {canWrite && !atLimit ? (
            <Pressable
              onPress={() => setPickerOpen(true)}
              disabled={uploading}
              style={{ width: tileSize, height: tileSize }}
              className="rounded-xl border-2 border-dashed border-gray-200 items-center justify-center active:bg-gray-50"
            >
              {uploading ? (
                <>
                  <ActivityIndicator color="#4F46E5" />
                  <Text className="text-[11px] text-gray-400 mt-1.5">{t.uploading}</Text>
                </>
              ) : (
                <>
                  <ImagePlus size={22} color="#9CA3AF" />
                  <Text className="text-[11px] text-gray-500 mt-1.5 font-medium">{t.addBtn}</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Camera / library chooser */}
      <RNModal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable onPress={() => setPickerOpen(false)} className="flex-1 justify-end bg-black/40">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pb-8 pt-4">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="bg-gray-50 rounded-2xl overflow-hidden">
              <Pressable
                onPress={() => pickAndUpload('camera')}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-gray-100 border-b border-gray-100"
              >
                <Camera size={18} color="#4F46E5" />
                <Text className="text-sm font-semibold text-gray-900">{t.takePhoto}</Text>
              </Pressable>
              <Pressable
                onPress={() => pickAndUpload('library')}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-gray-100"
              >
                <ImagePlus size={18} color="#4F46E5" />
                <Text className="text-sm font-semibold text-gray-900">{t.chooseFromLibrary}</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setPickerOpen(false)}
              className="mt-3 items-center py-3.5 rounded-2xl bg-gray-100 active:bg-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">{tc.buttons.cancel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Fullscreen viewer */}
      <RNModal
        visible={viewerPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {/* Header */}
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 16,
              paddingBottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Pressable onPress={() => setViewerIndex(null)} hitSlop={10} accessibilityLabel={t.viewerClose}>
              <X size={26} color="#FFFFFF" />
            </Pressable>
            <Text className="text-sm font-medium text-white/80">
              {viewerIndex !== null ? `${viewerIndex + 1} / ${photos.length}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              {canWrite ? (
                <Pressable onPress={rotateCurrent} hitSlop={10} accessibilityLabel="Rotate">
                  <RotateCw size={22} color="#FFFFFF" />
                </Pressable>
              ) : null}
              {canWrite && viewerPhoto ? (
                <Pressable onPress={() => removePhoto(viewerPhoto)} hitSlop={10}>
                  <Trash2 size={22} color="#F87171" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Swipeable pages */}
          <View style={{ flex: 1 }}>
            <FlatList
              ref={viewerListRef}
              data={photos}
              keyExtractor={p => p.id}
              extraData={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={viewerIndex ?? 0}
              getItemLayout={(_, index) => ({ length: screenW, offset: screenW * index, index })}
              onMomentumScrollEnd={onViewerScrollEnd}
              renderItem={renderViewerPage}
            />
          </View>

          {/* Prev / next */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 12,
              paddingBottom: insets.bottom + 12,
            }}
          >
            <Pressable
              onPress={() => goTo(-1)}
              disabled={viewerIndex === 0}
              hitSlop={10}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', opacity: viewerIndex === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft size={26} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => goTo(1)}
              disabled={viewerIndex === photos.length - 1}
              hitSlop={10}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', opacity: viewerIndex === photos.length - 1 ? 0.3 : 1 }}
            >
              <ChevronRight size={26} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </RNModal>
    </View>
  );
}
