import { useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Link } from '../lib/router';
import { ApiError, api } from '../lib/api';
import { useStore } from '../lib/store';
import { Icon } from '../components/icons';
import { Alert, Button, Field, Input, Select, Textarea } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';
import { WorkingHours } from './Home';

function Prose({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title);
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      <div className="mt-6 space-y-4 text-muted [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text [&_li]:ms-5 [&_li]:list-disc [&_li]:mt-1">{children}</div>
    </article>
  );
}

export function Support() {
  const { t, lang, pick } = useI18n();
  const { data } = useStore();
  usePageTitle(t('support.title'));
  const s = data?.settings.support;
  let saved: { number: string; key: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem('lynto_support_order') ?? 'null'); } catch { saved = null; }
  const [form, setForm] = useState({ name: '', contact: '', topic: 'order', message: '', order_number: saved?.number ?? '', website: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r = await api.post<{ number: string }>('/api/public/support', { ...form, lang, order_number: form.order_number.trim().toUpperCase(), order_key: saved && saved.number === form.order_number.trim().toUpperCase() ? saved.key : '' });
      setResult({ kind: 'ok', text: t('support.sent', { number: r.number }) });
      setForm((f) => ({ ...f, message: '' }));
    } catch (err) {
      setResult({ kind: 'bad', text: (err as ApiError).message || t('common.error') });
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('support.title')}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold">{t('support.contact')}</h2>
            {s && (s.whatsapp || s.email) ? (
              <div className="mt-3 flex flex-col gap-2">
                {s.whatsapp && <a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 font-semibold hover:border-cyan/60" href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><Icon.whatsapp /> {t('support.whatsapp')} <span className="ltr text-sm text-muted">{s.whatsapp}</span></a>}
                {s.email && <a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 font-semibold hover:border-cyan/60" href={`mailto:${s.email}`}><Icon.mail /> {t('support.email')} <span className="ltr text-sm text-muted">{s.email}</span></a>}
              </div>
            ) : <p className="mt-2 text-sm text-muted">{t('support.none')}</p>}
            {s && pick(s.hours_note_ar, s.hours_note_en) && <p className="mt-3 text-sm text-muted">{pick(s.hours_note_ar, s.hours_note_en)}</p>}
            {data?.settings.schedule_summary.configured && <div className="mt-4"><p className="text-sm font-semibold">{t('home.hours')}</p><WorkingHours week={data.settings.schedule_summary.week} /></div>}
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">{t('faq.title')}</h2>
            <div className="mt-2 divide-y divide-line/60">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <details key={n} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">{t(`faq.${n}.q` as any)}<span className="text-cyan transition group-open:rotate-45" aria-hidden>+</span></summary>
                  <p className="mt-2 text-sm text-muted">{t(`faq.${n}.a` as any)}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="card h-fit space-y-4 p-5">
          <h2 className="font-semibold">{t('support.form')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('support.name')} required htmlFor="s-name"><Input id="s-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></Field>
            <Field label={t('support.contactField')} required htmlFor="s-contact"><Input id="s-contact" dir="ltr" required minLength={5} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label={t('support.topic')} htmlFor="s-topic">
              <Select id="s-topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
                {['order', 'payment', 'activation', 'replacement', 'refund', 'other'].map((k) => <option key={k} value={k}>{t(`support.topic.${k}` as any)}</option>)}
              </Select>
            </Field>
            <Field label={t('support.order')} htmlFor="s-order"><Input id="s-order" dir="ltr" placeholder="LY-XXXXXX" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></Field>
          </div>
          <Field label={t('support.message')} required htmlFor="s-msg"><Textarea id="s-msg" required minLength={5} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-hidden />
          {result && <Alert kind={result.kind}>{result.text}</Alert>}
          <Button type="submit" loading={busy}>{t('support.send')}</Button>
        </form>
      </div>
    </div>
  );
}

export function About() {
  const { t } = useI18n();
  return <Prose title={t('about.title')}><p>{t('about.body1')}</p><p>{t('about.body2')}</p><p>{t('about.body3')}</p></Prose>;
}

export function Privacy() {
  const { t, pick } = useI18n();
  const { data } = useStore();
  const contact = data?.settings.support.email || data?.settings.support.whatsapp || '';
  return (
    <Prose title={t('privacy.title')}>
      {pick(
        <>
          <p>السياسة دي بتوضح البيانات اللي بنجمعها لما تطلب من LYnto وبنستخدمها إزاي.</p>
          <h2>البيانات اللي بنجمعها</h2>
          <ul><li>الاسم والإيميل ورقم الواتساب اللي بتكتبهم في الطلب.</li><li>تفاصيل الطلب والمنتجات والبيانات المطلوبة للتسليم (زي إيميل الحساب أو رقم اللاعب).</li><li>إيصال التحويل اللي بترفعه ورقم العملية لو كتبته.</li><li>رسائل الدعم اللي بتبعتها.</li><li>بيانات تقنية محدودة لحماية الموقع (زي بصمة مشفّرة لعنوان الـ IP لمنع الإساءة).</li></ul>
          <h2>بنستخدمها في إيه</h2>
          <ul><li>تجهيز طلبك وتأكيد الدفع وتسليم التفاصيل.</li><li>التواصل معاك بخصوص الطلب على القناة اللي اخترتها.</li><li>تذكيرك بانتهاء الاشتراك بس لو وافقت على كده.</li><li>الدعم وحل المشاكل وحماية المتجر من الاحتيال.</li></ul>
          <h2>المشاركة مع جهات تانية</h2>
          <p>مش بنبيع بياناتك. الموقع مستضاف على Cloudflare. لو اتفعّلت خدمات إرسال الإيميل أو واتساب، بيتبعتلها الحد الأدنى من البيانات اللازمة لتوصيل الرسالة. أدوات قياس الإعلانات (Meta Pixel) بتشتغل بس بموافقتك.</p>
          <h2>الحماية والاحتفاظ</h2>
          <p>الإيصالات محفوظة في تخزين خاص، وتفاصيل التفعيل متشفّرة، وصفحة الطلب بتتفتح بس بالرابط الخاص بيك. بنحتفظ ببيانات الطلبات للمدة اللازمة للمحاسبة والدعم.</p>
          <h2>حقوقك</h2>
          <p>تقدر تطلب نسخة من بياناتك أو تصحيحها أو مسحها (في حدود المطلوب قانونياً للمحاسبة) من صفحة الدعم{contact ? <> أو على <span className="ltr inline-block">{contact}</span></> : null}.</p>
        </>,
        <>
          <p>This policy explains what data we collect when you order from LYnto and how we use it.</p>
          <h2>What we collect</h2>
          <ul><li>The name, email and WhatsApp number you enter at checkout.</li><li>Order details, products and data needed for delivery (such as an account email or player ID).</li><li>The transfer receipt you upload and any transaction reference.</li><li>Support messages you send.</li><li>Limited technical data to protect the site (such as a hashed IP fingerprint for abuse prevention).</li></ul>
          <h2>How we use it</h2>
          <ul><li>To process your order, verify payment and deliver details.</li><li>To contact you about your order on your chosen channel.</li><li>To remind you before a subscription ends, only if you opted in.</li><li>For support, troubleshooting and fraud prevention.</li></ul>
          <h2>Sharing</h2>
          <p>We do not sell your data. The site is hosted on Cloudflare. If email or WhatsApp sending services are enabled, they receive only what is needed to deliver a message. Ad-measurement tools (Meta Pixel) run only with your consent.</p>
          <h2>Security and retention</h2>
          <p>Receipts are kept in private storage, activation details are encrypted, and your order page opens only with your private link. We keep order records as long as needed for accounting and support.</p>
          <h2>Your rights</h2>
          <p>You can request a copy, correction or deletion of your data (subject to accounting obligations) via the support page{contact ? <> or at <span className="ltr inline-block">{contact}</span></> : null}.</p>
        </>,
      )}
    </Prose>
  );
}

export function Terms() {
  const { t, pick, href } = useI18n();
  const { data } = useStore();
  const p = data?.settings.policies;
  const hours = data?.settings.sla_working_hours ?? 2;
  return (
    <Prose title={t('terms.title')}>
      {!p?.confirmed && <Alert kind="warn">{t('policy.pending')}</Alert>}
      {pick(
        <>
          <h2>الطلب والأسعار</h2>
          <ul><li>كل الأسعار بالجنيه المصري ونهائية وقت الطلب، والسعر بيتحسب على السيرفر.</li><li>المنتجات رقمية، ومفيش شحن أو مصاريف توصيل.</li><li>مميزات كل خدمة وشروطها بيحددها مقدّم الخدمة نفسه وممكن تتغير من ناحيته.</li></ul>
          <h2>الدفع</h2>
          <ul><li>الدفع بتحويل يدوي (إنستاباي، تحويل بنكي، أو محفظة) على البيانات اللي بتظهر في صفحة طلبك.</li><li>الطلب بيتأكد بس بعد ما نتأكد بنفسنا إن المبلغ وصل حسابنا. صورة الإيصال لوحدها مش تأكيد.</li><li>الطلبات اللي مفيش لها تحويل خلال المدة المحددة ممكن تتلغي تلقائياً.</li></ul>
          <h2>التسليم</h2>
          <ul><li>بنسلّم خلال {hours === 2 ? 'ساعتين' : `${hours} ساعات`} عمل من تأكيد الدفع حسب مواعيد العمل المنشورة (بتوقيت القاهرة).</li><li>التفاصيل بتظهر في صفحة طلبك الخاصة، وممكن نبعتها كمان على واتساب أو الإيميل.</li><li>مش بنطلب كلمة سر أي حساب. لو المنتج محتاج بيانات (زي إيميل الحساب أو رقم اللاعب) بنطلبها في صفحة المنتج.</li></ul>
          <h2>التجديد</h2>
          <p>مفيش تجديد أو خصم أوتوماتيك. التجديد بيكون بطلب ودفع جديد.</p>
          <h2>الضمان والاسترجاع</h2>
          <p>موضّحين في <Link href={href('/guarantee')} className="text-cyan underline">سياسة الضمان والاسترجاع</Link>.</p>
        </>,
        <>
          <h2>Orders and prices</h2>
          <ul><li>All prices are in Egyptian pounds and are final at the time of ordering; totals are calculated on our server.</li><li>Products are digital — no shipping or delivery fees.</li><li>Each service's features and terms are set by its provider and may change on their side.</li></ul>
          <h2>Payment</h2>
          <ul><li>Payment is by manual transfer (InstaPay, bank transfer or mobile wallet) to the details shown on your order page.</li><li>An order is confirmed only after we verify that the money reached our account. A receipt image alone is not confirmation.</li><li>Orders without a transfer within the stated window may be cancelled automatically.</li></ul>
          <h2>Delivery</h2>
          <ul><li>We deliver within {hours} working hours of payment verification, following our published working hours (Cairo time).</li><li>Details appear on your private order page and may also be sent by WhatsApp or email.</li><li>We never ask for any account password. If a product needs data (such as an account email or player ID), we ask for it on the product page.</li></ul>
          <h2>Renewals</h2>
          <p>Nothing renews or is charged automatically. Renewing requires a new order and payment.</p>
          <h2>Guarantee and refunds</h2>
          <p>See the <Link href={href('/guarantee')} className="text-cyan underline">guarantee & refund policy</Link>.</p>
        </>,
      )}
      {p?.confirmed && pick(p.terms_extra_ar, p.terms_extra_en) && <p className="whitespace-pre-line">{pick(p.terms_extra_ar, p.terms_extra_en)}</p>}
    </Prose>
  );
}

export function Guarantee() {
  const { t, pick } = useI18n();
  const { data } = useStore();
  const p = data?.settings.policies;
  return (
    <Prose title={t('guarantee.title')}>
      {!p?.confirmed ? <Alert kind="warn">{t('policy.pending')}</Alert> : (
        <>
          <h2>{t('product.guarantee')}</h2>
          <ul>{pick(p.guarantee_ar, p.guarantee_en).split('\n').filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>
          <h2>{t('order.refund')}</h2>
          <ul>{pick(p.refund_ar, p.refund_en).split('\n').filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </>
      )}
    </Prose>
  );
}

export function NotFound() {
  const { t, href } = useI18n();
  usePageTitle('404', { noindex: true });
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-6xl font-bold text-gradient ltr">404</p>
      <p className="mt-4 text-muted">{t('common.notFound')}</p>
      <Link href={href('/')} className="mt-6 inline-block font-semibold text-cyan">{t('common.home')}</Link>
    </div>
  );
}
