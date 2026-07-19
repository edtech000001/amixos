// Client-facing / document + pre-dashboard pages stay LIGHT regardless of the
// user's dark preference (they're printed/shared documents or public views).
// force-light (globals.css) redeclares the tokens to their light values.
export default function ForceLightLayout({ children }: { children: React.ReactNode }) {
  return <div className="force-light min-h-screen">{children}</div>;
}
