import { useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Link, useLocation } from '../lib/router';
import { ApiError, api } from '../lib/api';
import { useStore } from '../lib/store';
import { Icon } from '../components/icons';
import { Alert, Button, Field, Input, Select, Textarea } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';
import { WorkingHours } from './Home';
import { isAlwaysOpen } from '../lib/format';

function Prose({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const { data } = useStore();
  const pendingPolicy = /\/(terms|guarantee)$/.test(pathname) && !data?.settings.policies.confirmed;
  usePageTitle(title, { noindex: pendingPolicy, settings: data?.settings });
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
  const { search } = useLocation();
  usePageTitle(t('support.title'));
  const s = data?.settings.support;
  let saved: { number: string; key: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem('lynto_support_order') ?? 'null'); } catch { saved = null; }
  const [form, setForm] = useState({ name: '', contact: '', topic: ['order', 'payment', 'activation', 'replacement', 'refund', 'deletion', 'other'].includes(search.get('topic') ?? '') ? (search.get('topic') as string) : 'order', message: '', order_number: saved?.number ?? '', website: '' });
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
                  <p className="mt-2 text-sm text-muted">{t((n === 1 && isAlwaysOpen(data?.settings.schedule_summary.week) ? 'faq.1.a247' : `faq.${n}.a`) as any)}</p>
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
                {['order', 'payment', 'activation', 'replacement', 'refund', 'deletion', 'other'].map((k) => <option key={k} value={k}>{t(`support.topic.${k}` as any)}</option>)}
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
  const { t, pick, href } = useI18n();
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
          <p>تقدر تطلب نسخة من بياناتك أو تصحيحها أو مسحها. التفاصيل في <Link href={href('/data-deletion')} className="text-cyan underline">سياسة مسح البيانات</Link>{contact ? <> أو كلّمنا على <span className="ltr inline-block">{contact}</span></> : null}.</p>
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
          <p>You can request a copy, correction or deletion of your data. Details are in the <Link href={href('/data-deletion')} className="text-cyan underline">data deletion policy</Link>{contact ? <> or contact us at <span className="ltr inline-block">{contact}</span></> : null}.</p>
        </>,
      )}
    </Prose>
  );
}

export function DataDeletion() {
  const { t, pick, href } = useI18n();
  const { data } = useStore();
  const s = data?.settings.support;
  const wa = s?.whatsapp ? `https://wa.me/${s.whatsapp.replace(/\D/g, '')}` : '';
  return (
    <Prose title={t('deletion.title')}>
      {pick(
        <>
          <p>السياسة دي بتوضح إزاي تطلب مسح بياناتك الشخصية من LYnto، وإيه اللي بيتمسح فعلاً وإيه اللي بنحتفظ بيه ولية.</p>
          <p className="text-xs text-dim">آخر تحديث: 12 أكتوبر 2026</p>
          <h2>إيه اللي بنمسحه</h2>
          <ul>
            <li>اسمك وإيميلك ورقم الواتساب.</li>
            <li>بيانات التفعيل اللي كتبتها وقت الطلب (زي إيميل الحساب أو رقم اللاعب).</li>
            <li>صور إيصالات التحويل اللي رفعتها.</li>
            <li>تفاصيل التسليم المحفوظة (أكواد أو روابط تفعيل).</li>
            <li>رسائل الدعم اللي بعتّها، وعناوين الإيميل والأرقام في سجل الرسائل والإشعارات.</li>
            <li>رابط طلبك الخاص بيتعطّل ومبقاش يفتح.</li>
          </ul>
          <h2>إيه اللي بنحتفظ بيه</h2>
          <p>بنحتفظ بسجل الطلب نفسه <b>بشكل مجهّل</b>: رقم الطلب والمبلغ والتواريخ وحالة الدفع والتسليم، وده للمحاسبة والضرائب وحل أي نزاع. السجل ده مبقاش فيه أي حاجة تدل عليك.</p>
          <h2>إزاي تطلب المسح</h2>
          <ol className="list-decimal ps-5 space-y-1">
            <li>من <Link href={href('/support?topic=deletion')} className="text-cyan underline">نموذج الدعم</Link>: اختار الموضوع "مسح بياناتي" واكتب رقم طلبك (لو عندك).</li>
            <li>أو ابعتلنا على واتساب{s?.whatsapp ? <> <a className="text-cyan underline ltr inline-block" href={wa} target="_blank" rel="noopener noreferrer">{s.whatsapp}</a></> : null}.</li>
            <li>أو على الإيميل{s?.email ? <> <a className="text-cyan underline ltr inline-block" href={`mailto:${s.email}`}>{s.email}</a></> : null}.</li>
          </ol>
          <p>عشان نحميك من أي حد يطلب مسح بياناتك، هنطلب منك تأكيد هويتك: رقم الطلب مع الإيميل أو رقم الواتساب اللي استخدمتهم، أو الطلب يتبعت من صفحة طلبك الخاصة.</p>
          <h2>المدة</h2>
          <ul><li>بنرد على طلبك خلال 3 أيام.</li><li>بننفّذ المسح خلال 30 يوم كحد أقصى، وغالباً أسرع من كده.</li></ul>
          <h2>حالات بنأجّل فيها المسح</h2>
          <p>لو عندك طلب مدفوع ولسه مسلّمناهوش بالكامل أو فيه استرجاع جاري، هنكمّله الأول وبعدين نمسح البيانات. ولو مسحنا بياناتك، مش هنقدر نراجع ضمان الاشتراكات اللي اتسلّمت، لأن بيانات التفعيل هتكون اتمسحت.</p>
          <h2>جهات تانية</h2>
          <p>بنستخدم Cloudflare للاستضافة، وResend لإرسال الإيميلات، وWhatsApp/Meta لرسائل الواتساب. بنمسح بياناتك من عندنا؛ وأي نسخة من الرسايل موجودة عند الجهات دي بتخضع لسياساتها، وتقدر تطلب منهم مباشرة.</p>
          <h2>لو جيت من ميتا (فيسبوك / واتساب / إنستجرام)</h2>
          <p>نفس الخطوات اللي فوق بتنطبق على أي بيانات وصلتنا من خلال تطبيقات ميتا، وتقدر تستخدمها كرابط تعليمات مسح البيانات.</p>
        </>,
        <>
          <p>This policy explains how to ask LYnto to delete your personal data, what is deleted, and what we keep and why.</p>
          <p className="text-xs text-dim">Last updated: 12 October 2026</p>
          <h2>What we delete</h2>
          <ul>
            <li>Your name, email address and WhatsApp number.</li>
            <li>The activation details you entered at checkout (such as an account email or player ID).</li>
            <li>Transfer receipt images you uploaded.</li>
            <li>Stored delivery details (codes or activation links).</li>
            <li>Support messages you sent, and email addresses/phone numbers in our message and notification logs.</li>
            <li>Your private order link stops working.</li>
          </ul>
          <h2>What we keep</h2>
          <p>We keep the order record itself in <b>anonymised</b> form — order number, amount, dates, payment and delivery status — for accounting, tax and dispute-resolution purposes. That record no longer contains anything that identifies you.</p>
          <h2>How to request deletion</h2>
          <ol className="list-decimal ps-5 space-y-1">
            <li>Use the <Link href={href('/support?topic=deletion')} className="text-cyan underline">support form</Link>: choose the topic “Delete my data” and include your order number if you have one.</li>
            <li>Or message us on WhatsApp{s?.whatsapp ? <> <a className="text-cyan underline ltr inline-block" href={wa} target="_blank" rel="noopener noreferrer">{s.whatsapp}</a></> : null}.</li>
            <li>Or email{s?.email ? <> <a className="text-cyan underline ltr inline-block" href={`mailto:${s.email}`}>{s.email}</a></> : null}.</li>
          </ol>
          <p>To protect you from someone else requesting deletion, we ask you to confirm your identity: your order number together with the email or WhatsApp number you used, or send the request from your private order page.</p>
          <h2>Timing</h2>
          <ul><li>We reply to your request within 3 days.</li><li>We complete the deletion within 30 days at most, usually sooner.</li></ul>
          <h2>When we may postpone</h2>
          <p>If you have a paid order that is not fully delivered or a refund in progress, we finish it first and then delete the data. After deletion we can no longer review the guarantee on delivered subscriptions, because the activation details will be gone.</p>
          <h2>Other parties</h2>
          <p>We use Cloudflare for hosting, Resend for email and WhatsApp/Meta for WhatsApp messages. We delete your data from our systems; any copy of a message held by those providers is governed by their policies, and you can ask them directly.</p>
          <h2>If you came through Meta (Facebook / WhatsApp / Instagram)</h2>
          <p>The same steps apply to any data that reached us through Meta apps, and this page serves as our data deletion instructions URL.</p>
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
  const open247 = isAlwaysOpen(data?.settings.schedule_summary.week);
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
          <ul><li>بنسلّم خلال {hours === 2 ? 'ساعتين' : `${hours} ساعات`} {open247 ? 'من تأكيد الدفع، وإحنا شغالين 24/7' : 'عمل من تأكيد الدفع حسب مواعيد العمل المنشورة (بتوقيت القاهرة)'}.</li><li>التفاصيل بتظهر في صفحة طلبك الخاصة، وممكن نبعتها كمان على واتساب أو الإيميل.</li><li>مش بنطلب كلمة سر أي حساب. لو المنتج محتاج بيانات (زي إيميل الحساب أو رقم اللاعب) بنطلبها في صفحة المنتج.</li></ul>
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
          <ul><li>We deliver within {hours} {open247 ? 'hours of payment verification, and we work 24/7' : 'working hours of payment verification, following our published working hours (Cairo time)'}.</li><li>Details appear on your private order page and may also be sent by WhatsApp or email.</li><li>We never ask for any account password. If a product needs data (such as an account email or player ID), we ask for it on the product page.</li></ul>
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
