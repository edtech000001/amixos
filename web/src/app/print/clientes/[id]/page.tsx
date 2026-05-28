'use client';

export const dynamic = 'force-dynamic';

/**
 * Print-only route. Loads a single client, renders the shared HTML
 * template, and fires window.print() once the data is in place. Browsers
 * offer "Save as PDF" in the print dialog — that's the export path on
 * web. The page intentionally has no header/sidebar so the print output
 * is just the client card.
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { buildClientHtml } from '@amixos/shared/lib/clientShare';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone_cell: string | null;
  phone_office: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  business_id: string;
}

interface ClientContact {
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

interface FieldTemplate {
  field_key: string;
  field_label: string;
}

export default function ClientPrintPage() {
  const { t: full } = useLang();
  const t = full.dashboard.clients;
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  const includeAll = searchParams.get('fields') === 'all';

  const supabase = createSupabaseClient();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!client || cancelled) return;
      const c = client as Client;
      const [{ data: tpl }, { data: cts }] = await Promise.all([
        supabase
          .from('client_field_templates')
          .select('field_key, field_label')
          .eq('business_id', c.business_id)
          .order('sort_order'),
        supabase
          .from('client_contacts')
          .select('name, role, phone, email')
          .eq('client_id', id)
          .order('is_primary', { ascending: false }),
      ]);
      if (cancelled) return;

      const rendered = buildClientHtml(
        c,
        {
          first_name: t.fields.firstName,
          last_name: t.fields.lastName,
          company: t.fields.company,
          phone_cell: t.fields.phoneCell,
          phone_office: t.fields.phoneOffice,
          email_office: t.fields.emailOffice,
          email_home: t.fields.emailHome,
          address: t.fields.addressLine1,
          address_line2: t.fields.addressLine2,
          city: t.fields.city,
          state: t.fields.state,
          zip_code: t.fields.zipCode,
          notes: t.fields.notes,
        },
        ((tpl as FieldTemplate[] | null) ?? []),
        {
          includeAll,
          contacts: includeAll ? ((cts as ClientContact[] | null) ?? []) : undefined,
          contactsHeading: t.detail.contactPeople,
        },
      );
      setHtml(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, includeAll, supabase, t]);

  // Once the HTML is set, give the DOM one tick to render, then fire
  // the print dialog. Users can hit "Save as PDF" or send to a printer.
  useEffect(() => {
    if (!html) return;
    const timer = setTimeout(() => window.print(), 200);
    return () => clearTimeout(timer);
  }, [html]);

  if (!html) {
    return <div style={{ padding: 32, fontFamily: 'sans-serif' }}>Cargando…</div>;
  }
  // The shared builder returns a full HTML document (<!DOCTYPE html><html>…).
  // Render its <body> contents via dangerouslySetInnerHTML — we trust the
  // string because we just generated it from typed data, no user-controlled
  // raw HTML enters the builder (everything is escapeHtml'd).
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  const bodyInner = bodyMatch ? bodyMatch[1] : html;
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const styleInner = styleMatch ? styleMatch[1] : '';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleInner }} />
      <div dangerouslySetInnerHTML={{ __html: bodyInner }} />
    </>
  );
}
