// Persistent banner reporting the offline write queue (outbox) state.
//
// Sits next to GoogleSyncBanner in the dashboard overlay and follows the same
// inline-style approach. Spanish-only, like the rest of the app. States:
//
//   • errors    → red:   "N cambios no se pudieron sincronizar" + Reintentar
//   • offline   → amber: "Sin conexión · N cambios sin sincronizar"
//   • syncing   → blue:  "Sincronizando N cambios…" + spinner
//   • idle/empty→ hidden
//
// Tapping opens a detail sheet listing each queued change with its status.

import { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { CloudOff, RefreshCw, AlertCircle, X, Clock } from 'lucide-react-native';
import { useOutboxStore, pendingCount, errorCount, opsForUser, type OutboxOp } from '@/lib/offline/outbox';
import { useNetworkStore } from '@/lib/offline/network';
import { retryAndDrain } from '@/lib/offline/syncRunner';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useAuthStore } from '@/lib/auth/store';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

type Banner = {
  bg: string;
  fg: string;
  icon: 'offline' | 'sync' | 'error';
  text: string;
};

export function OfflineSyncBanner() {
  const ops = useOutboxStore((s) => s.ops);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [open, setOpen] = useState(false);

  // Another account's parked ops must not show as "pending" here — they can
  // only sync once that person signs back in.
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const myOps = opsForUser(ops, userId);
  const pending = pendingCount(myOps);
  const errors = errorCount(myOps);

  const banner = useMemo<Banner | null>(() => {
    if (errors > 0) {
      return {
        bg: '#FEF2F2',
        fg: '#991B1B',
        icon: 'error',
        text: `${errors} ${plural(errors, 'cambio no se pudo', 'cambios no se pudieron')} sincronizar`,
      };
    }
    if (pending > 0 && !isOnline) {
      return {
        bg: '#FFFBEB',
        fg: '#92400E',
        icon: 'offline',
        text: `Sin conexión · ${pending} ${plural(pending, 'cambio sin sincronizar', 'cambios sin sincronizar')}`,
      };
    }
    if (pending > 0) {
      return {
        bg: '#EFF6FF',
        fg: '#1E40AF',
        icon: 'sync',
        text: `Sincronizando ${pending} ${plural(pending, 'cambio', 'cambios')}…`,
      };
    }
    // Offline with nothing queued — let the user know they're viewing saved
    // data (so a stale list / empty screen reads as "offline", not "broken").
    if (!isOnline) {
      return {
        bg: '#FFFBEB',
        fg: '#92400E',
        icon: 'offline',
        text: 'Sin conexión · mostrando datos guardados',
      };
    }
    return null;
  }, [errors, pending, isOnline]);

  if (!banner) return null;

  const Icon =
    banner.icon === 'offline' ? CloudOff : banner.icon === 'error' ? AlertCircle : RefreshCw;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: banner.bg,
        }}
      >
        {banner.icon === 'sync' ? (
          <ActivityIndicator size="small" color={banner.fg} />
        ) : (
          <Icon size={18} color={banner.fg} />
        )}
        <Text style={{ flex: 1, color: banner.fg, fontWeight: '600', fontSize: 13 }}>
          {banner.text}
        </Text>
        {errors > 0 && (
          <Pressable
            onPress={retryAndDrain}
            hitSlop={8}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: banner.fg,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Reintentar</Text>
          </Pressable>
        )}
      </Pressable>

      {/* Mount the Modal only while open. iOS allows one presented Modal at a
          time; an always-mounted root Modal can block other screens' modals
          (e.g. the timesheet sheet) from presenting. */}
      {open && (
        <DetailSheet open onClose={() => setOpen(false)} ops={myOps} hasErrors={errors > 0} />
      )}
    </>
  );
}

function statusLabel(op: OutboxOp): { text: string; color: string } {
  switch (op.status) {
    case 'error':
      return { text: op.error ? `Error: ${op.error}` : 'Error', color: '#991B1B' };
    case 'syncing':
      return { text: 'Sincronizando…', color: '#1E40AF' };
    default:
      return { text: 'Pendiente', color: '#92400E' };
  }
}

function DetailSheet({
  open,
  onClose,
  ops,
  hasErrors,
}: {
  open: boolean;
  onClose: () => void;
  ops: OutboxOp[];
  hasErrors: boolean;
}) {
  const c = useThemeColors();
  // fade (not slide) so the dim backdrop eases in smoothly instead of a gray
  // bar sliding up from the bottom — matches the rest of the app.
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop is an absolute FIRST child and the card a plain sibling,
          per the sheet contract in CLAUDE.md: nesting the card inside the
          backdrop Pressable stops its ScrollView receiving drags. */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        />
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 16,
            paddingBottom: 28,
            maxHeight: '70%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' }}>
              Cambios sin sincronizar
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: 20 }}>
            {ops.length === 0 ? (
              <Text style={{ color: '#6B7280', paddingVertical: 12 }}>
                Todo está sincronizado.
              </Text>
            ) : (
              ops.map((op) => {
                const st = statusLabel(op);
                return (
                  <View
                    key={op.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#F3F4F6',
                    }}
                  >
                    <Clock size={16} color={c.faint} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#111827', fontWeight: '600', fontSize: 14 }}>
                        {op.label}
                      </Text>
                      <Text style={{ color: st.color, fontSize: 12, marginTop: 2 }}>{st.text}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {hasErrors && (
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <Pressable
                onPress={() => {
                  retryAndDrain();
                  onClose();
                }}
                style={{
                  backgroundColor: '#2563EB',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  Reintentar todo
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
