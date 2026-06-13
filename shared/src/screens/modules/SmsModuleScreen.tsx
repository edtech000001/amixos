import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, MessageSquare, CheckCircle2, Send } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';

export type SmsProvider = 'twilio' | 'clicksend';

export interface SmsStatus {
  connected: boolean;
  provider: SmsProvider | null;
  fromNumber: string | null;
  maskedKey: string | null;
  lastError: string | null;
}

export interface SmsClientOption {
  id: string;
  name: string;
  phone: string | null;
}

export interface SmsConnectInput {
  provider: SmsProvider;
  fromNumber: string;
  credentials: Record<string, string>;
}

export interface SmsSendInput {
  to: string;
  body: string;
  clientId: string | null;
}

export interface SmsModuleScreenProps {
  status: SmsStatus | null;
  loadingStatus: boolean;
  clients: SmsClientOption[];
  canConfigure: boolean;
  onConnect: (input: SmsConnectInput) => Promise<{ ok: boolean; error?: string }>;
  onDisconnect: () => Promise<{ ok: boolean; error?: string }>;
  onSend: (input: SmsSendInput) => Promise<{ ok: boolean; error?: string }>;
  /** Renders a back button (mobile). Web uses the sidebar, so omit it. */
  onBack?: () => void;
}

type MsgDict = ReturnType<typeof useLang>['t']['dashboard']['modules']['messaging'];

function errorText(t: MsgDict, code: string | undefined): string {
  if (!code) return t.errors.generic;
  const known = (t.errors as Record<string, string>)[code];
  return known ?? t.errors.generic;
}

export function SmsModuleScreen({
  status,
  loadingStatus,
  clients,
  canConfigure,
  onConnect,
  onDisconnect,
  onSend,
  onBack,
}: SmsModuleScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.modules.messaging;

  const connected = !!status?.connected;
  const [configuring, setConfiguring] = useState(false);
  const showConnectForm = !connected || configuring;

  // ── Connect form state ──────────────────────────────────────────────────────
  const [provider, setProvider] = useState<SmsProvider>(status?.provider ?? 'twilio');
  const [fromNumber, setFromNumber] = useState(status?.fromNumber ?? '');
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const credsFilled =
    provider === 'twilio' ? !!accountSid.trim() && !!authToken.trim() : !!username.trim() && !!apiKey.trim();

  const submitConnect = async () => {
    setConnectError(null);
    setSaving(true);
    const credentials =
      provider === 'twilio'
        ? { accountSid: accountSid.trim(), authToken: authToken.trim() }
        : { username: username.trim(), apiKey: apiKey.trim() };
    const res = await onConnect({ provider, fromNumber: fromNumber.trim(), credentials });
    setSaving(false);
    if (res.ok) {
      setConfiguring(false);
      setAccountSid('');
      setAuthToken('');
      setUsername('');
      setApiKey('');
    } else {
      setConnectError(errorText(t, res.error));
    }
  };

  const disconnect = async () => {
    setSaving(true);
    await onDisconnect();
    setSaving(false);
    setConfiguring(false);
  };

  // ── Compose state ───────────────────────────────────────────────────────────
  const [clientId, setClientId] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const clientOptions = useMemo(
    () => [{ value: '', label: t.manualNumber }, ...clients.map(c => ({ value: c.id, label: c.name }))],
    [clients, t.manualNumber],
  );

  const pickClient = (id: string) => {
    setClientId(id);
    const c = clients.find(x => x.id === id);
    if (c?.phone) setTo(c.phone);
  };

  const submitSend = async () => {
    setSendError(null);
    setSent(false);
    setSending(true);
    const res = await onSend({ to: to.trim(), body: message.trim(), clientId: clientId || null });
    setSending(false);
    if (res.ok) {
      setSent(true);
      setMessage('');
    } else {
      setSendError(errorText(t, res.error));
    }
  };

  const providerLabel = (p: SmsProvider) => (p === 'twilio' ? t.twilio : t.clicksend);

  return (
    <View className="flex-1 bg-surface">
      <ScrollView className="flex-1">
        <View className="px-5 pt-6 pb-16 lg:px-8 max-w-2xl">
          {/* Header */}
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={10} className="flex-row items-center gap-1 mb-3 active:opacity-70">
              <ChevronLeft size={18} color="#6B7280" />
              <Text className="text-sm text-gray-500">{full.common.buttons.back}</Text>
            </Pressable>
          ) : null}
          <View className="flex-row items-center gap-3 mb-1">
            <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: '#06B6D415' }}>
              <MessageSquare size={20} color="#06B6D4" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          </View>
          <Text className="text-sm text-gray-500 mb-6">{t.subtitle}</Text>

          {/* Connected status banner */}
          {connected && !configuring ? (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={18} color="#059669" />
                <Text className="text-sm font-semibold text-gray-900 flex-1">
                  {t.connectedVia.replace('{{provider}}', providerLabel(status!.provider ?? 'twilio'))}
                </Text>
              </View>
              <Text className="text-xs text-gray-500 mt-1 ml-7">
                {status?.fromNumber ? t.fromShown.replace('{{number}}', status.fromNumber) : ''}
                {status?.maskedKey ? `   ·   ${status.maskedKey}` : ''}
              </Text>
              {canConfigure ? (
                <View className="flex-row gap-2 mt-3 ml-7">
                  <Pressable
                    onPress={() => {
                      setProvider(status?.provider ?? 'twilio');
                      setFromNumber(status?.fromNumber ?? '');
                      setConfiguring(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 active:bg-gray-50"
                  >
                    <Text className="text-xs font-semibold text-gray-600">{t.change}</Text>
                  </Pressable>
                  <Pressable onPress={disconnect} className="px-3 py-1.5 rounded-lg bg-red-50 active:bg-red-100">
                    <Text className="text-xs font-semibold text-red-600">{t.disconnect}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Connect form */}
          {showConnectForm ? (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 gap-4">
              <Text className="text-sm font-bold text-gray-900">{t.connectTitle}</Text>
              {!canConfigure ? (
                <Text className="text-xs text-amber-600">{t.onlyWriters}</Text>
              ) : (
                <>
                  <Select
                    label={t.providerLabel}
                    value={provider}
                    onValueChange={v => setProvider(v as SmsProvider)}
                    options={[
                      { value: 'twilio', label: t.twilio },
                      { value: 'clicksend', label: t.clicksend },
                    ]}
                  />
                  {provider === 'twilio' ? (
                    <>
                      <Input
                        label={t.accountSidLabel}
                        value={accountSid}
                        onChangeText={setAccountSid}
                        autoCapitalize="none"
                        placeholder="ACxxxxxxxx"
                      />
                      <Input
                        label={t.authTokenLabel}
                        value={authToken}
                        onChangeText={setAuthToken}
                        autoCapitalize="none"
                        secureTextEntry
                      />
                    </>
                  ) : (
                    <>
                      <Input label={t.usernameLabel} value={username} onChangeText={setUsername} autoCapitalize="none" />
                      <Input
                        label={t.apiKeyLabel}
                        value={apiKey}
                        onChangeText={setApiKey}
                        autoCapitalize="none"
                        secureTextEntry
                      />
                    </>
                  )}
                  <View className="gap-1">
                    <Input
                      label={t.fromNumberLabel}
                      value={fromNumber}
                      onChangeText={setFromNumber}
                      autoCapitalize="none"
                      placeholder="+15551234567"
                    />
                    <Text className="text-xs text-gray-400">{t.fromNumberHint}</Text>
                  </View>
                  {connectError ? <Text className="text-xs text-red-600">{connectError}</Text> : null}
                  <View className="flex-row gap-3">
                    {configuring ? (
                      <Button variant="secondary" onPress={() => setConfiguring(false)} className="flex-1">
                        {full.common.buttons.cancel}
                      </Button>
                    ) : null}
                    <Button
                      onPress={submitConnect}
                      loading={saving}
                      disabled={!credsFilled}
                      className="flex-1"
                    >
                      {saving ? t.verifying : t.saveBtn}
                    </Button>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {/* Compose */}
          {connected && !configuring ? (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 gap-4">
              <Text className="text-sm font-bold text-gray-900">{t.composeTitle}</Text>
              <Select
                label={t.clientLabel}
                value={clientId}
                onValueChange={pickClient}
                options={clientOptions}
                placeholder={t.selectClient}
              />
              <Input
                label={t.toLabel}
                value={to}
                onChangeText={v => {
                  setTo(v);
                  setClientId('');
                }}
                autoCapitalize="none"
                placeholder={t.toPlaceholder}
              />
              <View className="gap-1">
                <Text className="text-sm font-semibold text-gray-700">{t.messageLabel}</Text>
                <Input
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t.messagePlaceholder}
                  multiline
                  numberOfLines={4}
                  className="h-24"
                />
                <Text className="text-[11px] text-gray-400 text-right">{message.length}</Text>
              </View>
              {sendError ? <Text className="text-xs text-red-600">{sendError}</Text> : null}
              {sent ? (
                <View className="flex-row items-center gap-1.5">
                  <CheckCircle2 size={14} color="#059669" />
                  <Text className="text-xs font-semibold text-emerald-600">{t.sentToast}</Text>
                </View>
              ) : null}
              <Button onPress={submitSend} loading={sending} disabled={!to.trim() || !message.trim()}>
                <View className="flex-row items-center gap-1.5">
                  <Send size={14} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">{sending ? t.sending : t.sendBtn}</Text>
                </View>
              </Button>
            </View>
          ) : null}

          {/* Not-configured hint for non-writers */}
          {!connected && !canConfigure && !loadingStatus ? (
            <Text className="text-sm text-gray-400 text-center mt-2">{t.notConfigured}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
