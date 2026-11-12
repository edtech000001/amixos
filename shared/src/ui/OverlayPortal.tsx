import { createContext, Fragment, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { View } from 'react-native';

// Minimal portal for absolute overlays (FilterSheet). In the split view the
// list lives in a narrow left pane, so an overlay rendered inside it only
// covered that pane — and touches outside a parent's bounds don't register
// on iOS, so it can't just overflow. A host higher up renders it instead.
// Without a host, overlays render in place (phones: unchanged).

type SetNode = (key: string, node: ReactNode | null) => void;
const HostCtx = createContext<SetNode | null>(null);

/** Covers its children's area; overlays inside it render on top of all of it. */
export function OverlayHost({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Record<string, ReactNode>>({});
  const set = useCallback<SetNode>((key, node) => {
    setNodes(prev => {
      const next = { ...prev };
      if (node == null) delete next[key];
      else next[key] = node;
      return next;
    });
  }, []);
  // `children` keeps its identity when only `nodes` changes, so React skips
  // re-rendering them — no update loop with InOverlayHost's effect.
  return (
    <HostCtx.Provider value={set}>
      <View style={{ flex: 1 }}>
        {children}
        {Object.entries(nodes).map(([k, n]) => <Fragment key={k}>{n}</Fragment>)}
      </View>
    </HostCtx.Provider>
  );
}

/** Renders `children` in the nearest OverlayHost (in place if there's none). */
export function InOverlayHost({ children }: { children: ReactNode }) {
  const set = useContext(HostCtx);
  const key = useId();
  useEffect(() => {
    set?.(key, children);
  });
  useEffect(() => () => set?.(key, null), [set, key]);
  return set ? null : <>{children}</>;
}
