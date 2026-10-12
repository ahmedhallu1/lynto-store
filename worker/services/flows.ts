// WhatsApp Flows (Flow JSON 3.1, no data endpoint): forms that complete into a webhook "nfm_reply".
// Published Flows are immutable in Meta — to change one, bump the version suffix in `name` and re-create.
export type FlowKind = 'support' | 'track' | 'deletion' | 'request';

type Json = Record<string, unknown>;
const form = (children: Json[]) => ({ type: 'Form', name: 'form', children });
const footer = (label: string, payload: Json) => ({ type: 'Footer', label, 'on-click-action': { name: 'complete', payload } });
const screen = (id: string, title: string, children: Json[]) => ({ id, title, terminal: true, success: true, layout: { type: 'SingleColumnLayout', children } });

export const FLOW_DEFS: Record<FlowKind, { name: string; categories: string[]; screen: string; cta: string; body_ar: string; json: Json }> = {
  support: {
    name: 'lynto_support_v1', categories: ['CUSTOMER_SUPPORT'], screen: 'SUPPORT', cta: 'ابعت رسالتك',
    body_ar: 'اكتب مشكلتك أو سؤالك وهنرد عليك في أقرب وقت.',
    json: {
      version: '7.3',
      screens: [screen('SUPPORT', 'كلّمنا', [
        { type: 'TextHeading', text: 'محتاج مساعدة؟' },
        { type: 'TextBody', text: 'اكتب مشكلتك وهنرد عليك في أقرب وقت.' },
        form([
          { type: 'Dropdown', label: 'الموضوع', name: 'topic', required: true, 'data-source': [
            { id: 'order', title: 'طلبي' }, { id: 'payment', title: 'الدفع' }, { id: 'activation', title: 'التفعيل' },
            { id: 'replacement', title: 'استبدال' }, { id: 'refund', title: 'استرجاع' }, { id: 'other', title: 'حاجة تانية' }] },
          { type: 'TextInput', label: 'رقم الطلب (لو موجود)', name: 'order_number', 'input-type': 'text', required: false, 'helper-text': 'مثال: LY-K7M2QX' },
          { type: 'TextArea', label: 'رسالتك', name: 'message', required: true },
          footer('ابعت', { kind: 'support', topic: '${form.topic}', order_number: '${form.order_number}', message: '${form.message}' }),
        ]),
      ])],
    },
  },
  track: {
    name: 'lynto_track_v1', categories: ['CUSTOMER_SUPPORT'], screen: 'TRACK', cta: 'تتبع طلبي',
    body_ar: 'اكتب رقم طلبك ونقولك وصل لفين.',
    json: {
      version: '7.3',
      screens: [screen('TRACK', 'تتبع الطلب', [
        { type: 'TextHeading', text: 'تتبع طلبك' },
        { type: 'TextBody', text: 'اكتب رقم الطلب اللي وصلك. لو بتسأل من رقم تاني غير اللي استخدمته في الطلب، اكتب الإيميل كمان.' },
        form([
          { type: 'TextInput', label: 'رقم الطلب', name: 'order_number', 'input-type': 'text', required: true, 'helper-text': 'مثال: LY-K7M2QX' },
          { type: 'TextInput', label: 'الإيميل (اختياري)', name: 'email', 'input-type': 'email', required: false },
          footer('تتبع', { kind: 'track', order_number: '${form.order_number}', email: '${form.email}' }),
        ]),
      ])],
    },
  },
  deletion: {
    name: 'lynto_deletion_v1', categories: ['CUSTOMER_SUPPORT'], screen: 'DELETE', cta: 'طلب مسح البيانات',
    body_ar: 'تقدر تطلب مسح بياناتك الشخصية من LYnto من هنا.',
    json: {
      version: '7.3',
      screens: [screen('DELETE', 'مسح البيانات', [
        { type: 'TextHeading', text: 'طلب مسح البيانات' },
        { type: 'TextBody', text: 'هنمسح اسمك وإيميلك ورقمك وبيانات التفعيل والإيصالات. بنحتفظ بسجل الطلب مجهّل للمحاسبة. التفاصيل: lynto.store/data-deletion' },
        form([
          { type: 'TextInput', label: 'رقم الطلب (لو موجود)', name: 'order_number', 'input-type': 'text', required: false, 'helper-text': 'مثال: LY-K7M2QX' },
          { type: 'CheckboxGroup', label: 'تأكيد', name: 'confirm', required: true, 'data-source': [{ id: 'yes', title: 'أؤكد إني صاحب الطلب' }] },
          footer('ابعت الطلب', { kind: 'deletion', order_number: '${form.order_number}', confirm: '${form.confirm}' }),
        ]),
      ])],
    },
  },
  request: {
    name: 'lynto_request_v1', categories: ['LEAD_GENERATION'], screen: 'REQUEST', cta: 'اطلب منتج',
    body_ar: 'مش لاقي اللي بتدور عليه؟ قولنا عليه ونوفّره لو أمكن.',
    json: {
      version: '7.3',
      screens: [screen('REQUEST', 'اطلب منتج', [
        { type: 'TextHeading', text: 'مش لاقي منتجك؟' },
        { type: 'TextBody', text: 'قولنا اسم المنتج أو الاشتراك اللي محتاجه وهنرجعلك بالسعر لو متاح.' },
        form([
          { type: 'Dropdown', label: 'النوع', name: 'category', required: true, 'data-source': [
            { id: 'ai', title: 'أدوات ذكاء اصطناعي' }, { id: 'software', title: 'برامج وإنتاجية' }, { id: 'entertainment', title: 'ترفيه' }, { id: 'cards', title: 'كروت وشحن' }] },
          { type: 'TextInput', label: 'اسم المنتج', name: 'product', 'input-type': 'text', required: true },
          { type: 'TextArea', label: 'تفاصيل (المدة، الباقة…)', name: 'details', required: false },
          footer('ابعت', { kind: 'request', category: '${form.category}', product: '${form.product}', details: '${form.details}' }),
        ]),
      ])],
    },
  },
};
