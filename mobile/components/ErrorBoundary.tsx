import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';

// Catches render-time exceptions so a crash shows a message instead of an
// unrecoverable black screen.
//
// Without this, any error thrown during render unmounts the tree to a blank
// root. On a release/OTA build there is no red box, so the user is left staring
// at black with no way out but force-quitting — and we learn nothing about what
// broke.
//
// SECURITY — why the detail is hidden by default:
// Postgres/PostgREST messages routinely name tables, columns, constraints and
// RLS policies. That grants no access on its own (the database enforces
// security, not this screen) but it hands a curious user a free schema map, so
// the default view says nothing technical. The detail is one deliberate tap
// away for support, never shown unprompted, and never includes record data —
// only the error's own message and stack.
//
// Deliberately styled with PLAIN StyleSheet values rather than NativeWind or
// theme context: if the failure is in the theme provider or a styling layer,
// a boundary that depends on them renders nothing and we are back to a black
// screen.

const COLORS = {
  bg: '#0B1220',
  card: '#151E30',
  text: '#E7ECF5',
  muted: '#93A1B8',
  primary: '#4F7DF3',
  border: '#24304A',
};

interface Props {
  children: ReactNode;
  /** Copy shown to the user. Passed in so the host app owns the wording. */
  labels?: {
    title?: string;
    body?: string;
    retry?: string;
    details?: string;
  };
  /** Called when the user asks to retry — the host clears whatever state it
   *  thinks is bad. Without it, retry just re-renders the same children. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  showDetail: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetail: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Still log it: a dev build shows this in Metro, and any crash reporter
    // wired up later picks it up from here.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null, showDetail: false });
    this.props.onReset?.();
  };

  render() {
    const { error, showDetail } = this.state;
    if (!error) return this.props.children;

    const l = this.props.labels ?? {};
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 20 }}>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>
            {l.title ?? 'Algo salió mal'}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
            {l.body ?? 'La pantalla no se pudo mostrar. Puedes intentar de nuevo.'}
          </Text>

          <Pressable
            onPress={this.reset}
            style={{ marginTop: 18, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>
              {l.retry ?? 'Intentar de nuevo'}
            </Text>
          </Pressable>

          <Pressable onPress={() => this.setState({ showDetail: !showDetail })} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>
              {l.details ?? 'Detalles técnicos'}
            </Text>
          </Pressable>

          {showDetail ? (
            <ScrollView
              style={{ marginTop: 10, maxHeight: 200, backgroundColor: COLORS.bg, borderRadius: 10, padding: 10 }}
            >
              <Text
                selectable
                style={{ color: COLORS.muted, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
              >
                {error.message}
                {error.stack ? `\n\n${error.stack.split('\n').slice(0, 12).join('\n')}` : ''}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      </View>
    );
  }
}
