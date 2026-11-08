import type { Lang } from './types';
export type GuideCopy = { title: string; summary: string; sections: { heading: string; paragraphs: string[] }[]; links: { path: string; label: string }[]; sources: { url: string; label: string }[] };
export type Guide = { slug: string; reviewed: string; ar: GuideCopy; en: GuideCopy };
export const GUIDES: Guide[] = [
  {
    slug: 'pay-digital-subscriptions-egypt', reviewed: '2026-11-08',
    ar: {
      title: 'إزاي تدفع اشتراك رقمي بإنستاباي أو محفظة في مصر عبر LYnto؟',
      summary: 'خطوات شراء اشتراك من LYnto بالجنيه المصري: اختيار الباقة، التحويل، رفع الإيصال، تأكيد الدفع والتسليم. الدفع هنا للمتجر، وليس دفعاً مباشراً لمقدّم الخدمة.',
      sections: [
        { heading: 'راجع الباقة قبل التحويل', paragraphs: ['افتح صفحة المنتج وراجع نوع الحساب ومدة الاشتراك والسعر الكامل بالجنيه. قارن الباقات على نفس المدة ونوع الحساب؛ السعر الأقل وحده لا يوضح الفرق بين تفعيل على حسابك ودعوة عضوية أو كود. اعتمد تفاصيل الباقة المعروضة وقت الطلب، لأن مميزات الخدمة وشروطها يحددها مقدّم الخدمة.', 'في اشتراكات التفعيل على حسابك، اكتب الإيميل المسجّل به في الخدمة بالضبط. LYnto لا يطلب كلمة سر الحساب. لو مش متأكد من توافق حسابك مع الباقة، اسأل الدعم قبل الدفع.'] },
        { heading: 'أنشئ الطلب ثم استخدم بيانات التحويل الخاصة به', paragraphs: ['اختار الباقة وأدخل البيانات المطلوبة وأكمل الطلب. صفحة طلبك تعرض المبلغ ورقم الطلب وطرق الدفع المتاحة. استخدم بيانات الاستلام الظاهرة في الطلب، وراجع اسم المستفيد والمبلغ قبل إرسال التحويل. الدفع بإنستاباي أو المحفظة هو تحويل إلى LYnto؛ لا يعني أن الخدمة الأصلية تقبل وسيلة الدفع نفسها.', 'احفظ رابط الطلب الخاص؛ هو وسيلتك لرفع الإيصال ومتابعة حالة الدفع واستلام التفاصيل. لا تنشر الرابط أو كود التفعيل في تعليقات عامة.'] },
        { heading: 'ارفع الإيصال وانتظر تأكيد وصول المبلغ', paragraphs: ['ارفع إيصال التحويل في صفحة طلبك، وأضف مرجع العملية إن توفر. إرسال صورة الإيصال لا يغيّر الطلب إلى مدفوع تلقائياً: نراجع حساب الاستلام ونتأكد أن المبلغ وصل. لا ترسل تحويلاً ثانياً لمجرد أن الطلب ما زال قيد المراجعة؛ تواصل مع الدعم برقم الطلب ومرجع التحويل.', 'وعد التسليم المنشور في المتجر يبدأ بعد تأكيد الدفع، وليس لحظة إنشاء الطلب أو رفع الإيصال. راجع مواعيد العمل وموعد التسليم في صفحة طلبك.'] },
        { heading: 'استلم التفاصيل وراجع التفعيل', paragraphs: ['قد يكون التسليم كوداً أو رابط دعوة أو خطوات تفعيل حسب الباقة. اتبع التعليمات في صفحة طلبك الخاصة، وتواصل مع الدعم من نفس الطلب إذا تعذر التفعيل. الضمان يبدأ من التفعيل الفعلي حسب الباقة والسياسة المنشورة. التجديد يحتاج طلباً ودفعاً جديدين، ولا يوجد خصم تلقائي.'] },
      ],
      links: [{ path: '/p/chatgpt-plus', label: 'باقات ChatGPT Plus وأسعارها الحالية' }, { path: '/p/claude-pro', label: 'باقات Claude Pro' }, { path: '/terms', label: 'شروط الشراء' }, { path: '/guarantee', label: 'الضمان والاسترجاع' }, { path: '/support', label: 'اسأل الدعم قبل الدفع' }],
      sources: [{ url: 'https://lynto.store/terms', label: 'شروط الشراء في LYnto' }, { url: 'https://lynto.store/guarantee', label: 'سياسة الضمان والاسترجاع في LYnto' }],
    },
    en: {
      title: 'How to pay for digital subscriptions with InstaPay or a wallet in Egypt through LYnto',
      summary: 'Choose a plan, transfer in EGP, upload your receipt, and follow verification and delivery. This is payment to LYnto, not direct payment to the original service provider.',
      sections: [
        { heading: 'Check the plan before transferring', paragraphs: ['Open the product page and check account type, subscription duration and the complete price in EGP. Compare equivalent durations and account types: a lower price alone does not explain the difference between activation on your account, an invitation and a code. Use the plan details shown when ordering; the original provider determines its service features and terms.', 'For activation on your account, enter the exact email registered with the service. LYnto never asks for that account password. Ask support before paying if you are unsure whether your account is compatible.'] },
        { heading: 'Create an order and use its payment instructions', paragraphs: ['Select a plan, enter the required details and place your order. Its private page displays the amount, order number and available payment methods. Use the receiving details on that page and check the recipient and amount before transferring. Paying by InstaPay or mobile wallet means transferring to LYnto; it does not mean the original service accepts that payment method.', 'Save your private order link. It is where you upload proof, follow payment status and receive delivery details. Do not post the private link or activation code in public comments.'] },
        { heading: 'Upload the receipt and wait for verification', paragraphs: ['Upload the transfer receipt on your order page and add the transaction reference if available. A receipt image does not automatically mark an order paid: we check our receiving account for the money. Do not send a second transfer just because review is pending. Contact support with the order number and transaction reference instead.', 'The published delivery commitment starts after payment verification, not when an order is created or a receipt is uploaded. Check the working schedule and delivery deadline on your order page.'] },
        { heading: 'Receive and check activation', paragraphs: ['Delivery can be a code, invitation link or activation steps depending on the selected plan. Follow the instructions on your private order page. If activation fails, contact support from that order. Guarantees start from actual activation under the selected plan and published policy. Renewals require a new order and payment; nothing is automatically charged.'] },
      ],
      links: [{ path: '/p/chatgpt-plus', label: 'Current ChatGPT Plus plans and prices' }, { path: '/p/claude-pro', label: 'Claude Pro plans' }, { path: '/terms', label: 'Purchase terms' }, { path: '/guarantee', label: 'Guarantees and refunds' }, { path: '/support', label: 'Ask support before paying' }],
      sources: [{ url: 'https://lynto.store/terms', label: 'LYnto purchase terms' }, { url: 'https://lynto.store/guarantee', label: 'LYnto guarantee and refund policy' }],
    },
  },
  {
    slug: 'gift-card-region-checklist', reviewed: '2026-11-08',
    ar: {
      title: 'قبل شراء كارت شحن: راجع منطقة الحساب والعملة وطريقة الاسترداد',
      summary: 'دليل عملي لتفادي شراء كارت غير متوافق: فرّق بين سعر البيع بالجنيه وعملة الرصيد، وراجع بلد الحساب ونوع الكود قبل الدفع.',
      sections: [
        { heading: 'الجنيه المصري هو سعر الشراء، وليس بالضرورة عملة الكارت', paragraphs: ['قد تدفع بالجنيه المصري مقابل رصيد بعملة أخرى. هذان رقمان مختلفان: سعر البيع في المتجر وقيمة الكارت عند الاسترداد. راجع الباقة المختارة للتأكد من القيمة والعملة والمنطقة المدعومة قبل الطلب؛ اسم المنصة وحده لا يثبت أن الكارت مناسب لكل حساب.'] },
        { heading: 'راجع بلد الحساب وقواعد المنصة', paragraphs: ['Google Play ينص على استخدام بطاقات الهدايا في بلد وعملة شرائها، وأن بلد حساب Play يجب أن يطابق بلد طرح الكارت. راجع تعليمات Google الرسمية المرتبطة أسفل الدليل؛ وجود رصيد بالدولار لا يثبت وحده التوافق مع حسابك.', 'في Steam، فرّق بين كود المحفظة وبين الهدية الرقمية المرسلة عبر نظام Steam. قواعد العملات والبلدان قد تختلف حسب النوع. لا تفترض أن كل أنواع الهدايا تقبل التحويل بين المناطق. راجع نوع المنتج وتعليمات Valve الرسمية قبل الشراء.'] },
        { heading: 'قبل الدفع: ثلاث معلومات أساسية', paragraphs: ['حدّد المنطقة الفعلية للحساب، والعملة المعروضة فيه، ونوع المنتج المطلوب: كود رصيد أم اشتراك أم شحن مباشر. لا تشارك كلمة السر أو كوداً سبق شراؤه لإثبات هذه البيانات. لو صفحة المنتج لا توضح توافق المنطقة، ابعت للدعم اسم الباقة ومنطقة حسابك قبل التحويل.', 'بالنسبة للشحن المباشر للألعاب، تأكد من رقم اللاعب والسيرفر وأي بيانات مطلوبة في صفحة المنتج. الخطأ في الحساب المستهدف مختلف عن خطأ في كود الشحن، لذلك راجع البيانات قبل تأكيد الطلب.'] },
        { heading: 'بعد استلام الكود', paragraphs: ['استخدم صفحة الاسترداد الرسمية للمنصة واتبع تعليمات الكارت. لو ظهر خطأ، احتفظ بنص رسالة الخطأ ورقم طلب LYnto وراسل الدعم. لا تنشر الكود أو رابط الطلب في منتدى عام. راجع شروط الضمان والاسترجاع الخاصة بالباقة قبل الشراء، لأن تسليم كود صالح ثم تغيّر رأيك ليس نفس حالة تعذر التفعيل بسبب مشكلة من طرف المتجر.'] },
      ],
      links: [{ path: '/c/top-ups', label: 'كروت الشحن والباقات المتاحة' }, { path: '/p/google-play-card', label: 'باقات Google Play' }, { path: '/p/steam-wallet', label: 'باقات Steam Wallet' }, { path: '/support', label: 'تأكد من التوافق مع الدعم' }],
      sources: [{ url: 'https://support.google.com/googleplay/answer/3422734', label: 'Google: قيود البلد والعملة لبطاقات Play' }, { url: 'https://help.steampowered.com/en/faqs/view/78E3-7431-1E88-AD59', label: 'Valve: تعليمات Steam Wallet' }, { url: 'https://store.steampowered.com/digitalgiftcards/', label: 'Valve: الهدايا الرقمية في Steam' }],
    },
    en: {
      title: 'Before buying a gift card: check account region, currency and redemption type',
      summary: 'Avoid a region mismatch: separate the selling price in EGP from the card balance currency, and check the account country and code type before paying.',
      sections: [
        { heading: 'The EGP selling price is not necessarily the card currency', paragraphs: ['You may pay in Egyptian pounds for a balance denominated in another currency. These are different amounts: the store selling price and the card value when redeemed. Check the selected plan for value, currency and supported region before ordering. A platform name alone does not establish compatibility with every account.'] },
        { heading: 'Check the account country and platform rules', paragraphs: ['Google Play specifies country and currency restrictions for gift cards and requires the Play account country to match where the card is offered. Read the official Google guidance linked below; a balance denominated in dollars alone does not prove compatibility with your account.', 'For Steam, distinguish a wallet code from a digital gift sent through Steam. Currency and country rules can differ by product type. Do not assume that all gift formats support cross-region conversion. Check the product type and Valve documentation before buying.'] },
        { heading: 'Before paying: three essential details', paragraphs: ['Identify the actual account region, the currency shown in the account, and the product type: balance code, subscription or direct top-up. You do not need to share a password or an existing unused code to explain these details. If a product page does not establish compatibility, send support the selected plan and account region before transferring.', 'For a direct game top-up, verify the player ID, server and other required product fields. Sending credit to the wrong target account is different from a code failure, so check the details before confirming an order.'] },
        { heading: 'After receiving a code', paragraphs: ['Use the platform’s official redemption page and follow its instructions. If an error appears, keep the error text and LYnto order number and contact support. Never publish the code or private order link in a public forum. Read the plan’s guarantee and refund conditions before purchasing: changing your mind after receiving a valid code differs from an activation failure caused by the store.'] },
      ],
      links: [{ path: '/c/top-ups', label: 'Available gift cards and top-up packages' }, { path: '/p/google-play-card', label: 'Google Play plans' }, { path: '/p/steam-wallet', label: 'Steam Wallet plans' }, { path: '/support', label: 'Check compatibility with support' }],
      sources: [{ url: 'https://support.google.com/googleplay/answer/3422734', label: 'Google: Play gift card country and currency restrictions' }, { url: 'https://help.steampowered.com/en/faqs/view/78E3-7431-1E88-AD59', label: 'Valve: Steam Wallet guidance' }, { url: 'https://store.steampowered.com/digitalgiftcards/', label: 'Valve: Steam Digital Gift Cards' }],
    },
  },
];
export const guideCopy = (guide: Guide, lang: Lang) => guide[lang];
export function guideSchemas(guide: Guide, lang: Lang, base: string): unknown[] {
  const copy = guideCopy(guide, lang), prefix = lang === 'en' ? '/en' : '', url = `${base}${prefix}/guides/${guide.slug}`;
  return [{ '@context': 'https://schema.org', '@type': 'Article', '@id': url + '#article', headline: copy.title, description: copy.summary,
    inLanguage: lang === 'ar' ? 'ar-EG' : 'en', datePublished: guide.reviewed, dateModified: guide.reviewed,
    mainEntityOfPage: url, image: `${base}/brand/og-image.jpg`, author: { '@type': 'Organization', name: 'LYnto', url: `${base}/about` },
    publisher: { '@type': 'Organization', '@id': `${base}/#organization`, name: 'LYnto', logo: { '@type': 'ImageObject', url: `${base}/brand/icon-512.png` } },
    citation: copy.sources.map((s) => s.url) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LYnto', item: base + (prefix || '/') },
      { '@type': 'ListItem', position: 2, name: lang === 'ar' ? 'أدلة الشراء' : 'Buying guides', item: `${base}${prefix}/guides` },
      { '@type': 'ListItem', position: 3, name: copy.title, item: url },
    ] }];
}
