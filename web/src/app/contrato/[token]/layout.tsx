// The lease a tenant signs is a document, not app chrome — keep it light
// regardless of anyone's dark preference (same as /propuesta and /factura).
export default function ForceLightLayout({ children }: { children: React.ReactNode }) {
  return <div className="force-light min-h-screen">{children}</div>;
}
