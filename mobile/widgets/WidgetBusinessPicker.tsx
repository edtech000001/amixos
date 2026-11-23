import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { ANDROID_BUSINESSES_KEY, loadSnapForWidget, widgetBusinessKey } from './widgetTaskHandler';
import { renderAmiWidget } from './AmiAndroidWidgets';

// Android widget settings ("Editar widget"): pick which business this widget
// shows. Runs as its own small screen outside the app, so it uses plain RN
// styles and only the business list the app saved (lib/widgetSnapshot.ts).
export function WidgetBusinessPicker({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const dark = useColorScheme() === 'dark';
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(ANDROID_BUSINESSES_KEY).catch(() => null);
      setList(raw ? JSON.parse(raw) : []);
      setCurrent(await AsyncStorage.getItem(widgetBusinessKey(widgetInfo.widgetId)).catch(() => null));
    })();
  }, [widgetInfo.widgetId]);

  const choose = async (id: string | null) => {
    if (id) await AsyncStorage.setItem(widgetBusinessKey(widgetInfo.widgetId), id);
    else await AsyncStorage.removeItem(widgetBusinessKey(widgetInfo.widgetId));
    renderWidget(renderAmiWidget(widgetInfo.widgetName, await loadSnapForWidget(widgetInfo.widgetId), widgetInfo.width));
    setResult('ok');
  };

  const ink = dark ? '#F9FAFB' : '#111827';
  const muted = dark ? '#9CA3AF' : '#6B7280';
  const card = dark ? '#1F2937' : '#F3F4F6';
  const row = (label: string, id: string | null, sub?: string) => (
    <Pressable
      key={id ?? 'auto'}
      onPress={() => void choose(id)}
      accessibilityRole="button"
      style={{ padding: 16, borderRadius: 14, backgroundColor: card, marginBottom: 10, borderWidth: 2, borderColor: current === id ? '#2563EB' : 'transparent' }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: ink }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 13, color: muted, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: dark ? '#111827' : '#FFFFFF', paddingTop: 48 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: ink, paddingHorizontal: 16, marginBottom: 4 }}>Negocio del widget</Text>
      <Text style={{ fontSize: 14, color: muted, paddingHorizontal: 16, marginBottom: 16 }}>Elige qué negocio muestra este widget.</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {row('Automático', null, 'El negocio abierto en Amixos')}
        {(list ?? []).map(b => row(b.name, b.id))}
        {list && list.length === 0 ? (
          <Text style={{ color: muted, marginTop: 8 }}>Abre Amixos una vez para cargar tus negocios.</Text>
        ) : null}
        <Pressable onPress={() => setResult('cancel')} accessibilityRole="button" style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontSize: 15, color: muted }}>Cancelar</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
