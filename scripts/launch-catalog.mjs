// Generates migrations/0003_launch_catalog.sql — the launch catalog with ESTIMATED EGP prices.
// Estimation model (documented in each product's private supply_notes):
//   price = USD list price × 50 EGP/USD × margin   (subscriptions 1.18, licences 1.15, cards/top-ups 1.10)
//   rounded up to a marketing-friendly step; the catalogue floor is 97 EGP.
// The owner adjusts real prices in Admin → Pricing (or via CSV). Re-run this script only to regenerate the migration
// BEFORE it is applied; never edit an applied migration.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const FX = 50;
const MARKUP = { sub: 1.18, invite: 1.18, license: 1.15, card: 1.10, topup: 1.10 };
const FLOOR = 97;

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
function nice(n) {
  const step = n < 100 ? 1 : n < 500 ? 5 : n < 2000 ? 10 : n < 10000 ? 50 : 100;
  return Math.ceil(n / step) * step;
}
const price = (usd, kind) => Math.max(FLOOR, nice(usd * FX * MARKUP[kind]));

// ---------- field definitions
const F = {
  email: (ar, en) => ({ key: 'account_email', type: 'email', required: true, label_ar: ar ?? 'إيميل الحساب اللي هيتفعّل عليه الاشتراك', label_en: en ?? 'Email of the account to activate',
    help_ar: 'لازم يكون نفس الإيميل المسجّل بيه في الخدمة. مش هنطلب كلمة سر أبداً.', help_en: 'Must match the email registered with the service. We never ask for a password.' }),
  region: (ar, en) => ({ key: 'account_region', type: 'select', required: true, label_ar: 'منطقة حسابك', label_en: 'Your account region',
    help_ar: 'الكارت بيشتغل بس على حساب من نفس المنطقة.', help_en: 'The card only works on an account of the same region.',
    options: [{ value: 'US', label_ar: ar ?? 'حسابي على متجر الولايات المتحدة (US)', label_en: en ?? 'My account is on the United States store (US)' }] }),
  player: () => ({ key: 'player_id', type: 'text', required: true, pattern: '^[0-9]{5,16}$', label_ar: 'رقم اللاعب (Player ID)', label_en: 'Player ID',
    help_ar: 'هتلاقيه في صفحة البروفايل جوه اللعبة. اكتبه أرقام بس.', help_en: 'Find it on your in-game profile. Digits only.' }),
  username: (ar, en, key) => ({ key, type: 'text', required: true, pattern: '^@?[A-Za-z0-9_.]{3,40}$', label_ar: ar, label_en: en,
    help_ar: 'اسم المستخدم بس، من غير كلمة سر.', help_en: 'Username only — no password.' }),
  none: () => null,
};

const durAr = (m) => (m === 1 ? 'شهر واحد' : m === 2 ? 'شهرين' : m <= 10 ? `${m} شهور` : m === 12 ? 'سنة كاملة' : m === 24 ? 'سنتين' : `${m} شهر`);
const durEn = (m) => (m === 12 ? '12 months' : m === 24 ? '24 months' : m === 1 ? '1 month' : `${m} months`);

// ---------- catalogue
// [slug, category, brand, titleAr, titleEn, icon, accent, kind, field, whatAr, whatEn, featuresAr, featuresEn, officialUrl, featured, plans]
// plan: [tierAr, tierEn, months(0 = no expiry), usdOrEgp, opts?]  — usdOrEgp number = USD; {egp:n} = fixed EGP;  opts: {type, qty, kind}
const AI = 'cat_ai', SW = 'cat_software', EN = 'cat_entertainment', TU = 'cat_topup';
const C = [
  // ================= AI =================
  ['chatgpt-plus', AI, 'OpenAI', 'اشتراك ChatGPT Plus', 'ChatGPT Plus subscription', 'GPT', '#20C7CF', 'sub', 'email', 'ChatGPT Plus هي الخطة المدفوعة من OpenAI لخدمة ChatGPT.', "ChatGPT Plus is OpenAI's paid plan for ChatGPT.", ['حدود استخدام أعلى من الخطة المجانية', 'الوصول للموديلات المتاحة في الخطة'], ['Higher usage limits than the free plan', 'Access to the models included in the plan'], 'https://openai.com/chatgpt/pricing/', 1,
    [['', '', 1, 20], ['', '', 3, 60], ['', '', 12, 240]]],
  ['chatgpt-pro', AI, 'OpenAI', 'اشتراك ChatGPT Pro', 'ChatGPT Pro subscription', 'PRO', '#20C7CF', 'sub', 'email', 'ChatGPT Pro هي أعلى خطة لـ ChatGPT للاستخدام المكثّف والمحترفين.', "ChatGPT Pro is OpenAI's top ChatGPT plan for heavy and professional use.", ['أعلى حدود استخدام في الخطط', 'مناسبة للشغل المكثّف'], ['The highest usage limits of the plans', 'Built for intensive professional use'], 'https://openai.com/chatgpt/pricing/', 0,
    [['', '', 1, 200], ['', '', 3, 600]]],
  ['claude-pro', AI, 'Anthropic', 'اشتراك Claude Pro', 'Claude Pro subscription', 'CL', '#D97757', 'sub', 'email', 'Claude Pro هي الخطة المدفوعة لمساعد Claude من Anthropic.', "Claude Pro is Anthropic's paid plan for the Claude assistant.", ['استخدام أكتر من الخطة المجانية', 'مميزات الخطة حسب Anthropic'], ['More usage than the free plan', 'Plan features as defined by Anthropic'], 'https://claude.com/pricing', 1,
    [['', '', 1, 20], ['', '', 3, 60], ['', '', 12, 216]]],
  ['claude-max', AI, 'Anthropic', 'اشتراك Claude Max', 'Claude Max subscription', 'MAX', '#D97757', 'sub', 'email', 'Claude Max خطة بحدود استخدام أعلى بكتير للاستخدام اليومي المكثّف.', 'Claude Max is a plan with much higher usage limits for heavy daily use.', ['حدود استخدام أعلى بكتير من Pro', 'مناسبة للمطوّرين والمحترفين'], ['Much higher usage limits than Pro', 'Suited to developers and professionals'], 'https://claude.com/pricing', 0,
    [['Max 5x', 'Max 5x', 1, 100], ['Max 20x', 'Max 20x', 1, 200], ['Max 5x', 'Max 5x', 3, 300]]],
  ['google-ai-pro', AI, 'Google', 'اشتراك Google AI Pro', 'Google AI Pro subscription', 'AI', '#4F8DF5', 'sub', 'email', 'Google AI Pro خطة من Google بتضيف مميزات Gemini المتقدمة ومساحة تخزين.', 'Google AI Pro is a Google plan that adds advanced Gemini features and storage.', ['مميزات Gemini المتقدمة', 'مساحة تخزين Google One'], ['Advanced Gemini features', 'Google One storage'], 'https://one.google.com/about/ai-premium', 0,
    [['', '', 1, 20], ['', '', 12, 200]]],
  ['google-ai-ultra', AI, 'Google', 'اشتراك Google AI Ultra', 'Google AI Ultra subscription', 'ULT', '#4F8DF5', 'sub', 'email', 'Google AI Ultra أعلى خطة ذكاء اصطناعي من Google بأعلى حدود استخدام.', "Google AI Ultra is Google's top AI plan with the highest usage limits.", ['أعلى حدود استخدام لمميزات Gemini', 'للاستخدام الاحترافي المكثّف'], ['Highest usage limits for Gemini features', 'For intensive professional use'], 'https://one.google.com/about/ai-premium', 0,
    [['', '', 1, 250], ['', '', 3, 750]]],
  ['perplexity-pro', AI, 'Perplexity', 'اشتراك Perplexity Pro', 'Perplexity Pro subscription', 'PX', '#2FD3B0', 'sub', 'email', 'Perplexity Pro محرك بحث بالذكاء الاصطناعي بإجابات ومصادر.', 'Perplexity Pro is an AI search engine with answers and sources.', ['بحث متقدّم بالذكاء الاصطناعي', 'حدود استخدام أعلى'], ['Advanced AI-powered search', 'Higher usage limits'], 'https://www.perplexity.ai/pro', 0,
    [['', '', 1, 20], ['', '', 12, 200]]],
  ['midjourney', AI, 'Midjourney', 'اشتراك Midjourney', 'Midjourney subscription', 'MJ', '#8FA3FF', 'sub', 'email', 'Midjourney خدمة لتوليد الصور بالذكاء الاصطناعي.', 'Midjourney is an AI image-generation service.', ['توليد صور بالذكاء الاصطناعي', 'حدود الاستخدام حسب الخطة'], ['AI image generation', 'Usage limits per plan'], 'https://docs.midjourney.com/', 0,
    [['Basic', 'Basic', 1, 10], ['Standard', 'Standard', 1, 30], ['Pro', 'Pro', 1, 60], ['Mega', 'Mega', 1, 120]]],
  ['github-copilot', AI, 'GitHub', 'اشتراك GitHub Copilot', 'GitHub Copilot subscription', 'GH', '#C7CCD6', 'sub', 'email', 'GitHub Copilot مساعد برمجة بالذكاء الاصطناعي جوه محرر الكود.', 'GitHub Copilot is an AI coding assistant inside your editor.', ['اقتراحات وإكمال كود', 'شغّال مع محررات الكود الشهيرة'], ['Code suggestions and completion', 'Works with popular editors'], 'https://github.com/features/copilot', 0,
    [['Pro', 'Pro', 1, 10], ['Pro', 'Pro', 12, 100]]],
  ['cursor', AI, 'Cursor', 'اشتراك Cursor', 'Cursor subscription', 'CUR', '#C7CCD6', 'sub', 'email', 'Cursor محرر كود مبني حوالين الذكاء الاصطناعي.', 'Cursor is an AI-first code editor.', ['برمجة بمساعدة الذكاء الاصطناعي', 'حدود استخدام حسب الخطة'], ['AI-assisted coding', 'Usage limits per plan'], 'https://cursor.com/pricing', 0,
    [['Pro', 'Pro', 1, 20], ['Pro', 'Pro', 12, 192], ['Ultra', 'Ultra', 1, 200]]],
  ['supergrok', AI, 'xAI', 'اشتراك SuperGrok', 'SuperGrok subscription', 'GRK', '#C7CCD6', 'sub', 'email', 'SuperGrok الخطة المدفوعة لمساعد Grok من xAI.', "SuperGrok is the paid plan for xAI's Grok assistant.", ['حدود استخدام أعلى', 'مميزات الخطة حسب xAI'], ['Higher usage limits', 'Plan features as defined by xAI'], 'https://grok.com', 0,
    [['SuperGrok', 'SuperGrok', 1, 30], ['Heavy', 'Heavy', 1, 300]]],
  ['elevenlabs', AI, 'ElevenLabs', 'اشتراك ElevenLabs', 'ElevenLabs subscription', 'EL', '#8FA3FF', 'sub', 'email', 'ElevenLabs منصة تحويل النص لصوت واستنساخ الأصوات بالذكاء الاصطناعي.', 'ElevenLabs is an AI text-to-speech and voice platform.', ['أصوات بالذكاء الاصطناعي', 'رصيد شهري حسب الخطة'], ['AI voices', 'Monthly credits per plan'], 'https://elevenlabs.io/pricing', 0,
    [['Starter', 'Starter', 1, 5], ['Creator', 'Creator', 1, 22], ['Pro', 'Pro', 1, 99]]],
  ['runway', AI, 'Runway', 'اشتراك Runway', 'Runway subscription', 'RW', '#8FA3FF', 'sub', 'email', 'Runway أدوات توليد وتعديل فيديو بالذكاء الاصطناعي.', 'Runway offers AI video generation and editing tools.', ['توليد فيديو بالذكاء الاصطناعي', 'رصيد حسب الخطة'], ['AI video generation', 'Credits per plan'], 'https://runwayml.com/pricing', 0,
    [['Standard', 'Standard', 1, 15], ['Pro', 'Pro', 1, 35], ['Unlimited', 'Unlimited', 1, 95]]],
  ['suno', AI, 'Suno', 'اشتراك Suno', 'Suno subscription', 'SN', '#8FA3FF', 'sub', 'email', 'Suno منصة لتوليد الأغاني والموسيقى بالذكاء الاصطناعي.', 'Suno is an AI song and music generation platform.', ['توليد أغاني بالذكاء الاصطناعي', 'رصيد شهري حسب الخطة'], ['AI song generation', 'Monthly credits per plan'], 'https://suno.com/pricing', 0,
    [['Pro', 'Pro', 1, 10], ['Premier', 'Premier', 1, 30]]],
  ['deepl', AI, 'DeepL', 'اشتراك DeepL Pro', 'DeepL Pro subscription', 'DL', '#4F8DF5', 'sub', 'email', 'DeepL Pro خدمة ترجمة بدقة عالية للنصوص والمستندات.', 'DeepL Pro is a high-quality translation service for text and documents.', ['ترجمة نصوص ومستندات', 'حدود أعلى من الخطة المجانية'], ['Text and document translation', 'Higher limits than the free plan'], 'https://www.deepl.com/pro', 0,
    [['Starter', 'Starter', 1, 9], ['Advanced', 'Advanced', 1, 29]]],

  // ================= SOFTWARE & PRODUCTIVITY =================
  ['canva-pro', SW, 'Canva', 'اشتراك Canva Pro', 'Canva Pro subscription', 'CV', '#22C3E6', 'sub', 'email', 'Canva Pro الخطة المدفوعة من Canva للتصميم.', "Canva Pro is Canva's paid design plan.", ['أدوات ومحتوى أكتر من الخطة المجانية', 'مناسب للسوشيال ميديا والتصميم اليومي'], ['More tools and content than the free plan', 'Great for social media and everyday design'], 'https://www.canva.com/pro/', 1,
    [['', '', 1, 13], ['', '', 12, 120]]],
  ['microsoft-365', SW, 'Microsoft', 'اشتراك Microsoft 365', 'Microsoft 365 subscription', '365', '#F25022', 'sub', 'email', 'Microsoft 365 تطبيقات Office مع مساحة OneDrive.', 'Microsoft 365 includes Office apps with OneDrive storage.', ['Word وExcel وPowerPoint', 'مساحة OneDrive'], ['Word, Excel and PowerPoint', 'OneDrive storage'], 'https://www.microsoft.com/microsoft-365', 1,
    [['Personal', 'Personal', 12, 70], ['Family', 'Family', 12, 100]]],
  ['office-2024', SW, 'Microsoft', 'Microsoft Office 2024 (ترخيص دائم)', 'Microsoft Office 2024 (perpetual licence)', 'OFF', '#F25022', 'license', 'none', 'Office 2024 نسخة بترخيص دائم من غير اشتراك شهري.', 'Office 2024 is a perpetual-licence edition with no monthly subscription.', ['ترخيص دائم لجهاز واحد', 'تطبيقات Office الأساسية'], ['Perpetual licence for one device', 'Core Office apps'], 'https://www.microsoft.com/microsoft-365/microsoft-office', 0,
    [['Home', 'Home', 0, 150], ['Home & Business', 'Home & Business', 0, 250], ['Professional Plus', 'Professional Plus', 0, 440]]],
  ['windows-11', SW, 'Microsoft', 'ترخيص Windows 11', 'Windows 11 licence', 'WIN', '#4F8DF5', 'license', 'none', 'ترخيص تفعيل لنظام Windows 11.', 'An activation licence for Windows 11.', ['ترخيص تفعيل لجهاز واحد', 'نسخة Home أو Pro'], ['Activation licence for one device', 'Home or Pro edition'], 'https://www.microsoft.com/windows/windows-11', 0,
    [['Home', 'Home', 0, 140], ['Pro', 'Pro', 0, 200]]],
  ['adobe-creative-cloud', SW, 'Adobe', 'Adobe Creative Cloud', 'Adobe Creative Cloud', 'CC', '#FF4D4D', 'sub', 'email', 'Adobe Creative Cloud برامج Adobe للتصميم والمونتاج حسب الخطة.', 'Adobe Creative Cloud provides Adobe design and video apps depending on the plan.', ['Photoshop وIllustrator وPremiere Pro حسب الخطة', 'خدمات سحابية'], ['Photoshop, Illustrator and Premiere Pro depending on plan', 'Cloud services'], 'https://www.adobe.com/creativecloud/plans.html', 1,
    [['All Apps', 'All Apps', 1, 60], ['All Apps', 'All Apps', 12, 600]]],
  ['adobe-photoshop', SW, 'Adobe', 'اشتراك Adobe Photoshop', 'Adobe Photoshop subscription', 'PS', '#4F8DF5', 'sub', 'email', 'Photoshop برنامج تعديل الصور والتصميم من Adobe.', "Photoshop is Adobe's photo editing and design app.", ['تعديل صور وتصميم', 'خدمات سحابية حسب الخطة'], ['Photo editing and design', 'Cloud services per plan'], 'https://www.adobe.com/products/photoshop.html', 0,
    [['', '', 1, 23], ['', '', 12, 240]]],
  ['adobe-premiere-pro', SW, 'Adobe', 'اشتراك Adobe Premiere Pro', 'Adobe Premiere Pro subscription', 'PR', '#8FA3FF', 'sub', 'email', 'Premiere Pro برنامج مونتاج فيديو احترافي من Adobe.', "Premiere Pro is Adobe's professional video editing app.", ['مونتاج فيديو احترافي', 'خدمات سحابية حسب الخطة'], ['Professional video editing', 'Cloud services per plan'], 'https://www.adobe.com/products/premiere.html', 0,
    [['', '', 1, 23], ['', '', 12, 240]]],
  ['adobe-acrobat-pro', SW, 'Adobe', 'اشتراك Adobe Acrobat Pro', 'Adobe Acrobat Pro subscription', 'PDF', '#FF4D4D', 'sub', 'email', 'Acrobat Pro لتعديل وإنشاء وتوقيع ملفات PDF.', 'Acrobat Pro for editing, creating and signing PDF files.', ['تعديل PDF', 'توقيع إلكتروني'], ['PDF editing', 'E-signatures'], 'https://www.adobe.com/acrobat.html', 0,
    [['', '', 1, 20], ['', '', 12, 200]]],
  ['figma', SW, 'Figma', 'اشتراك Figma', 'Figma subscription', 'FG', '#8FA3FF', 'sub', 'email', 'Figma أداة تصميم واجهات وتعاون جماعي.', 'Figma is a UI design and collaboration tool.', ['تصميم واجهات', 'تعاون مباشر'], ['UI design', 'Real-time collaboration'], 'https://www.figma.com/pricing/', 0,
    [['Professional', 'Professional', 1, 15], ['Professional', 'Professional', 12, 144]]],
  ['notion', SW, 'Notion', 'اشتراك Notion', 'Notion subscription', 'NO', '#C7CCD6', 'sub', 'email', 'Notion مساحة شغل للملاحظات والمشاريع والمعرفة.', 'Notion is a workspace for notes, projects and knowledge.', ['ملاحظات ومشاريع', 'تعاون جماعي'], ['Notes and projects', 'Team collaboration'], 'https://www.notion.com/pricing', 0,
    [['Plus', 'Plus', 1, 10], ['Plus', 'Plus', 12, 96]]],
  ['grammarly', SW, 'Grammarly', 'اشتراك Grammarly Premium', 'Grammarly Premium subscription', 'G', '#15C39A', 'sub', 'email', 'Grammarly Premium مساعد كتابة بالإنجليزي.', 'Grammarly Premium is an English writing assistant.', ['اقتراحات كتابة متقدمة', 'مراجعة نحو وأسلوب'], ['Advanced writing suggestions', 'Grammar and style checks'], 'https://www.grammarly.com/plans', 0,
    [['', '', 1, 30], ['', '', 12, 144]]],
  ['google-one', SW, 'Google', 'اشتراك Google One', 'Google One subscription', '2TB', '#34A853', 'sub', 'email', 'Google One مساحة تخزين إضافية لحساب Google.', 'Google One adds extra storage to your Google account.', ['مساحة تخزين إضافية', 'مشاركة مع العيلة حسب الخطة'], ['Extra storage', 'Family sharing per plan'], 'https://one.google.com/about/plans', 0,
    [['2 TB', '2 TB', 1, 10], ['2 TB', '2 TB', 12, 100]]],
  ['icloud-plus', SW, 'Apple', 'اشتراك iCloud+', 'iCloud+ subscription', 'iC', '#C7CCD6', 'sub', 'email', 'iCloud+ مساحة تخزين سحابية لحساب Apple.', 'iCloud+ is cloud storage for your Apple Account.', ['مساحة تخزين سحابية', 'مميزات خصوصية إضافية'], ['Cloud storage', 'Extra privacy features'], 'https://www.apple.com/icloud/', 0,
    [['200 GB', '200 GB', 1, 3], ['2 TB', '2 TB', 1, 10], ['2 TB', '2 TB', 12, 100]]],
  ['dropbox', SW, 'Dropbox', 'اشتراك Dropbox', 'Dropbox subscription', 'DB', '#4F8DF5', 'sub', 'email', 'Dropbox مساحة تخزين ومشاركة ملفات.', 'Dropbox is file storage and sharing.', ['تخزين ومشاركة ملفات', 'مزامنة بين الأجهزة'], ['File storage and sharing', 'Sync across devices'], 'https://www.dropbox.com/plans', 0,
    [['Plus', 'Plus', 1, 12], ['Plus', 'Plus', 12, 120]]],
  ['nordvpn', SW, 'NordVPN', 'اشتراك NordVPN', 'NordVPN subscription', 'NV', '#4F8DF5', 'sub', 'email', 'NordVPN خدمة VPN لحماية الاتصال والخصوصية.', 'NordVPN is a VPN service for connection privacy and protection.', ['تشفير الاتصال', 'خوادم في دول كتير'], ['Encrypted connection', 'Servers in many countries'], 'https://nordvpn.com/pricing/', 0,
    [['', '', 12, 60], ['', '', 24, 100]]],
  ['expressvpn', SW, 'ExpressVPN', 'اشتراك ExpressVPN', 'ExpressVPN subscription', 'XV', '#FF4D4D', 'sub', 'email', 'ExpressVPN خدمة VPN سريعة لحماية الخصوصية.', 'ExpressVPN is a fast VPN service for privacy.', ['تشفير الاتصال', 'خوادم في دول كتير'], ['Encrypted connection', 'Servers in many countries'], 'https://www.expressvpn.com/order', 0,
    [['', '', 12, 100]]],
  ['surfshark', SW, 'Surfshark', 'اشتراك Surfshark', 'Surfshark subscription', 'SS', '#2FD3B0', 'sub', 'email', 'Surfshark خدمة VPN لعدد أجهزة غير محدود حسب الخطة.', 'Surfshark is a VPN service with unlimited devices depending on plan.', ['تشفير الاتصال', 'أجهزة كتير'], ['Encrypted connection', 'Many devices'], 'https://surfshark.com/pricing', 0,
    [['', '', 12, 48]]],
  ['1password', SW, '1Password', 'اشتراك 1Password', '1Password subscription', '1P', '#4F8DF5', 'sub', 'email', '1Password مدير كلمات سر آمن.', '1Password is a secure password manager.', ['حفظ كلمات السر', 'مشاركة آمنة'], ['Password storage', 'Secure sharing'], 'https://1password.com/pricing', 0,
    [['Individual', 'Individual', 12, 36], ['Families', 'Families', 12, 60]]],
  ['jetbrains', SW, 'JetBrains', 'اشتراك JetBrains', 'JetBrains subscription', 'JB', '#FF4D4D', 'sub', 'email', 'JetBrains أدوات برمجة احترافية مثل IntelliJ وPyCharm.', 'JetBrains professional developer tools such as IntelliJ and PyCharm.', ['بيئات تطوير احترافية', 'ترخيص سنوي'], ['Professional IDEs', 'Annual licence'], 'https://www.jetbrains.com/store/', 0,
    [['IntelliJ IDEA', 'IntelliJ IDEA', 12, 169], ['All Products Pack', 'All Products Pack', 12, 290]]],
  ['autodesk-fusion', SW, 'Autodesk', 'اشتراك Autodesk Fusion', 'Autodesk Fusion subscription', 'FUS', '#F2A900', 'sub', 'email', 'Fusion منصة تصميم هندسي وتصنيع ثلاثي الأبعاد من Autodesk.', "Fusion is Autodesk's 3D design and manufacturing platform.", ['تصميم ثلاثي الأبعاد', 'محاكاة وتصنيع'], ['3D design', 'Simulation and manufacturing'], 'https://www.autodesk.com/products/fusion-360', 0,
    [['', '', 12, 680]]],
  ['coursera-plus', SW, 'Coursera', 'اشتراك Coursera Plus', 'Coursera Plus subscription', 'CO', '#4F8DF5', 'sub', 'email', 'Coursera Plus وصول لآلاف الكورسات والشهادات.', 'Coursera Plus gives access to thousands of courses and certificates.', ['كورسات وشهادات', 'تعلّم بمعدّلك'], ['Courses and certificates', 'Learn at your own pace'], 'https://www.coursera.org/courseraplus', 0,
    [['', '', 12, 400]]],
  ['duolingo-super', SW, 'Duolingo', 'اشتراك Duolingo Super', 'Duolingo Super subscription', 'DU', '#34A853', 'sub', 'email', 'Duolingo Super لتعلّم اللغات من غير إعلانات.', 'Duolingo Super for learning languages without ads.', ['من غير إعلانات', 'مميزات تعلّم إضافية'], ['No ads', 'Extra learning features'], 'https://www.duolingo.com/super', 0,
    [['', '', 12, 84]]],
  ['zoom-pro', SW, 'Zoom', 'اشتراك Zoom Pro', 'Zoom Pro subscription', 'ZM', '#4F8DF5', 'sub', 'email', 'Zoom Pro للاجتماعات الطويلة والتسجيل.', 'Zoom Pro for longer meetings and recording.', ['اجتماعات أطول', 'تسجيل سحابي حسب الخطة'], ['Longer meetings', 'Cloud recording per plan'], 'https://zoom.us/pricing', 0,
    [['', '', 12, 150]]],

  // ================= ENTERTAINMENT =================
  ['netflix', EN, 'Netflix', 'اشتراك Netflix', 'Netflix subscription', 'N', '#E50914', 'sub', 'email', 'Netflix خدمة بث أفلام ومسلسلات.', 'Netflix is a film and series streaming service.', ['أفلام ومسلسلات', 'جودة ومشاهدة حسب الخطة'], ['Films and series', 'Quality and screens per plan'], 'https://help.netflix.com/en/node/24926', 1,
    [['Standard', 'Standard', 1, { egp: 350 }], ['Premium', 'Premium', 1, { egp: 520 }], ['Standard', 'Standard', 3, { egp: 1020 }], ['Premium', 'Premium', 3, { egp: 1530 }]]],
  ['spotify-premium', EN, 'Spotify', 'Spotify Premium', 'Spotify Premium', 'SP', '#1ED760', 'sub', 'email', 'Spotify Premium موسيقى وبودكاست من غير إعلانات.', 'Spotify Premium: ad-free music and podcasts.', ['من غير إعلانات', 'تحميل للاستماع أوفلاين'], ['Ad-free listening', 'Offline downloads'], 'https://www.spotify.com/eg-en/premium/', 1,
    [['Individual', 'Individual', 1, { egp: 97 }], ['Individual', 'Individual', 3, { egp: 280 }], ['Individual', 'Individual', 12, { egp: 1050 }], ['Duo', 'Duo', 1, { egp: 140, opts: { type: 'invite' } }], ['Family', 'Family', 1, { egp: 180, opts: { type: 'invite' } }]]],
  ['youtube-premium', EN, 'YouTube', 'YouTube Premium', 'YouTube Premium', 'YT', '#FF3B30', 'sub', 'email', 'YouTube Premium يوتيوب من غير إعلانات مع YouTube Music.', 'YouTube Premium: ad-free YouTube with YouTube Music.', ['من غير إعلانات', 'تشغيل في الخلفية', 'YouTube Music Premium'], ['Ad-free', 'Background play', 'YouTube Music Premium'], 'https://www.youtube.com/premium', 1,
    [['Individual', 'Individual', 1, { egp: 130 }], ['Individual', 'Individual', 3, { egp: 370 }], ['Individual', 'Individual', 12, { egp: 1400 }], ['Family', 'Family', 1, { egp: 220, opts: { type: 'invite' } }]]],
  ['shahid-vip', EN, 'Shahid', 'اشتراك شاهد VIP', 'Shahid VIP subscription', 'SH', '#3DDC97', 'sub', 'email', 'شاهد VIP الاشتراك المدفوع على منصة شاهد (MBC) بمسلسلات وبرامج عربية.', "Shahid VIP is the paid tier of MBC's Shahid platform with Arabic series and shows.", ['مسلسلات وبرامج عربية', 'محتوى حصري حسب الباقة'], ['Arabic series and shows', 'Exclusive content per package'], 'https://shahid.mbc.net/', 0,
    [['VIP', 'VIP', 1, { egp: 150 }], ['VIP', 'VIP', 3, { egp: 420 }], ['VIP', 'VIP', 12, { egp: 1500 }]]],
  ['disney-plus', EN, 'Disney', 'اشتراك Disney+', 'Disney+ subscription', 'D+', '#4F8DF5', 'sub', 'email', 'Disney+ أفلام ومسلسلات ديزني وبيكسار ومارفل.', 'Disney+: Disney, Pixar and Marvel films and series.', ['أفلام ومسلسلات للعيلة', 'محتوى حسب الباقة'], ['Family films and series', 'Content per package'], 'https://www.disneyplus.com', 0,
    [['', '', 1, { egp: 220 }], ['', '', 12, { egp: 2200 }]]],
  ['hbo-max', EN, 'HBO', 'اشتراك HBO Max', 'HBO Max subscription', 'MAX', '#8FA3FF', 'sub', 'email', 'HBO Max مسلسلات وأفلام HBO وWarner.', 'HBO Max: HBO and Warner series and films.', ['مسلسلات وأفلام HBO', 'محتوى حسب الباقة'], ['HBO series and films', 'Content per package'], 'https://www.max.com', 0,
    [['', '', 1, { egp: 260 }], ['', '', 12, { egp: 2600 }]]],
  ['amazon-prime', EN, 'Amazon', 'اشتراك Amazon Prime Video', 'Amazon Prime Video subscription', 'PV', '#4F8DF5', 'sub', 'email', 'Prime Video أفلام ومسلسلات من أمازون.', 'Prime Video: films and series from Amazon.', ['أفلام ومسلسلات', 'محتوى أمازون الأصلي'], ['Films and series', 'Amazon originals'], 'https://www.primevideo.com', 0,
    [['', '', 1, { egp: 200 }], ['', '', 12, { egp: 2000 }]]],
  ['apple-music', EN, 'Apple', 'اشتراك Apple Music', 'Apple Music subscription', 'AM', '#FF3B30', 'sub', 'email', 'Apple Music بث موسيقى من غير إعلانات.', 'Apple Music: ad-free music streaming.', ['من غير إعلانات', 'تحميل أوفلاين'], ['Ad-free', 'Offline downloads'], 'https://www.apple.com/apple-music/', 0,
    [['Individual', 'Individual', 1, { egp: 120 }], ['Individual', 'Individual', 12, { egp: 1250 }]]],
  ['apple-tv-plus', EN, 'Apple', 'اشتراك Apple TV+', 'Apple TV+ subscription', 'TV+', '#C7CCD6', 'sub', 'email', 'Apple TV+ مسلسلات وأفلام أصلية من Apple.', 'Apple TV+: original series and films from Apple.', ['محتوى أصلي من Apple', 'بدون إعلانات'], ['Apple originals', 'No ads'], 'https://tv.apple.com', 0,
    [['', '', 1, { egp: 180 }], ['', '', 12, { egp: 1800 }]]],
  ['anghami-plus', EN, 'Anghami', 'اشتراك Anghami Plus', 'Anghami Plus subscription', 'AN', '#8FA3FF', 'sub', 'email', 'Anghami Plus موسيقى عربية وعالمية من غير إعلانات.', 'Anghami Plus: Arabic and international music, ad-free.', ['من غير إعلانات', 'تحميل أوفلاين'], ['Ad-free', 'Offline downloads'], 'https://www.anghami.com/plus', 0,
    [['', '', 1, { egp: 100 }], ['', '', 12, { egp: 950 }]]],
  ['osn-plus', EN, 'OSN', 'اشتراك OSN+', 'OSN+ subscription', 'OSN', '#F2A900', 'sub', 'email', 'OSN+ مسلسلات وأفلام عربية وعالمية.', 'OSN+: Arabic and international series and films.', ['مسلسلات وأفلام', 'محتوى حسب الباقة'], ['Series and films', 'Content per package'], 'https://www.osnplus.com', 0,
    [['', '', 1, { egp: 180 }], ['', '', 12, { egp: 1800 }]]],
  ['crunchyroll', EN, 'Crunchyroll', 'اشتراك Crunchyroll', 'Crunchyroll subscription', 'CR', '#F2A900', 'sub', 'email', 'Crunchyroll أنمي بترجمة ومن غير إعلانات.', 'Crunchyroll: subtitled, ad-free anime.', ['أنمي من غير إعلانات', 'مشاهدة بعد العرض الياباني مباشرة'], ['Ad-free anime', 'Simulcasts'], 'https://www.crunchyroll.com/premium', 0,
    [['Fan', 'Fan', 1, 8], ['Mega Fan', 'Mega Fan', 1, 12], ['Mega Fan', 'Mega Fan', 12, 100]]],
  ['xbox-game-pass', EN, 'Xbox', 'اشتراك Xbox Game Pass', 'Xbox Game Pass subscription', 'XB', '#34A853', 'sub', 'email', 'Xbox Game Pass مكتبة ألعاب بالاشتراك.', 'Xbox Game Pass is a subscription game library.', ['مكتبة ألعاب', 'مميزات حسب الخطة'], ['Game library', 'Features per plan'], 'https://www.xbox.com/xbox-game-pass', 0,
    [['Core', 'Core', 1, 10], ['PC', 'PC', 1, 12], ['Ultimate', 'Ultimate', 1, 20], ['Ultimate', 'Ultimate', 3, 60]]],
  ['playstation-plus', EN, 'PlayStation', 'اشتراك PlayStation Plus', 'PlayStation Plus subscription', 'PS+', '#3B7BFF', 'sub', 'email', 'PlayStation Plus لعب أونلاين وألعاب شهرية حسب الخطة.', 'PlayStation Plus: online play and monthly games depending on plan.', ['لعب أونلاين', 'ألعاب شهرية حسب الخطة'], ['Online play', 'Monthly games per plan'], 'https://www.playstation.com/ps-plus/', 0,
    [['Essential', 'Essential', 1, 10], ['Essential', 'Essential', 12, 80], ['Extra', 'Extra', 12, 135], ['Deluxe', 'Deluxe', 12, 160]]],
  ['nintendo-switch-online', EN, 'Nintendo', 'اشتراك Nintendo Switch Online', 'Nintendo Switch Online subscription', 'NSO', '#FF3B30', 'sub', 'email', 'Nintendo Switch Online لعب أونلاين وألعاب كلاسيك.', 'Nintendo Switch Online: online play and classic games.', ['لعب أونلاين', 'ألعاب كلاسيك'], ['Online play', 'Classic games'], 'https://www.nintendo.com/switch/online-service/', 0,
    [['Individual', 'Individual', 12, 20], ['Expansion Pack', 'Expansion Pack', 12, 50]]],
  ['discord-nitro', EN, 'Discord', 'اشتراك Discord Nitro', 'Discord Nitro subscription', 'DS', '#8FA3FF', 'sub', 'none', 'Discord Nitro مميزات إضافية لحسابك على ديسكورد.', 'Discord Nitro adds extra features to your Discord account.', ['إيموجي وستيكرز', 'جودة بث أعلى'], ['Emoji and stickers', 'Higher stream quality'], 'https://discord.com/nitro', 0,
    [['Nitro Basic', 'Nitro Basic', 1, 3], ['Nitro', 'Nitro', 1, 10], ['Nitro', 'Nitro', 12, 100]]],
  ['telegram-premium', EN, 'Telegram', 'اشتراك Telegram Premium', 'Telegram Premium subscription', 'TG', '#4F8DF5', 'sub', 'tg', 'Telegram Premium مميزات إضافية لتيليجرام.', 'Telegram Premium adds extra features to Telegram.', ['رفع ملفات أكبر', 'مميزات حصرية'], ['Larger file uploads', 'Exclusive features'], 'https://telegram.org/premium', 0,
    [['', '', 1, 5], ['', '', 12, 48]]],

  // ================= GIFT CARDS =================
  ['google-play-card', TU, 'Google Play', 'كارت Google Play', 'Google Play gift card', 'GP', '#34A853', 'card', 'region', 'كارت هدايا Google Play بقيمة ثابتة لمتجر الولايات المتحدة.', 'A fixed-value Google Play gift card for the United States store.', ['كود بقيمة ثابتة', 'بيتشحن على حسابك'], ['Fixed-value code', 'Redeemed on your own account'], 'https://play.google.com/about/giftcards/', 1,
    [['10 دولار', '$10', 0, 10], ['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],
  ['apple-gift-card', TU, 'Apple', 'كارت Apple Gift Card', 'Apple Gift Card', '', '#C7CCD6', 'card', 'region', 'كارت Apple Gift Card رصيد لحساب Apple في متجر الولايات المتحدة.', 'Apple Gift Card adds balance to an Apple Account on the United States store.', ['كود بقيمة ثابتة', 'للتطبيقات والألعاب والاشتراكات'], ['Fixed-value code', 'For apps, games and subscriptions'], 'https://www.apple.com/shop/gift-cards', 1,
    [['10 دولار', '$10', 0, 10], ['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100], ['200 دولار', '$200', 0, 200, { qty: 2 }], ['500 دولار', '$500', 0, 500, { qty: 1 }]]],
  ['psn-card', TU, 'PlayStation', 'كارت PlayStation Store', 'PlayStation Store card', 'PS', '#3B7BFF', 'card', 'region', 'كارت رصيد لمحفظة PlayStation Store لمتجر الولايات المتحدة.', 'A wallet-credit card for the PlayStation Store (US).', ['كود بقيمة ثابتة', 'لشراء الألعاب والإضافات'], ['Fixed-value code', 'For games and add-ons'], 'https://www.playstation.com/playstation-gift-cards/', 1,
    [['10 دولار', '$10', 0, 10], ['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],
  ['xbox-gift-card', TU, 'Xbox', 'كارت Xbox', 'Xbox gift card', 'XB', '#34A853', 'card', 'region', 'كارت رصيد Xbox لمتجر الولايات المتحدة.', 'An Xbox gift card for the United States store.', ['كود بقيمة ثابتة', 'للألعاب والإضافات'], ['Fixed-value code', 'For games and add-ons'], 'https://www.xbox.com/gift-cards', 0,
    [['10 دولار', '$10', 0, 10], ['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],
  ['steam-wallet', TU, 'Steam', 'كارت Steam Wallet', 'Steam Wallet card', 'ST', '#4F8DF5', 'card', 'none', 'كارت رصيد لمحفظة Steam.', 'A Steam Wallet credit card.', ['كود بقيمة ثابتة', 'لشراء الألعاب على Steam'], ['Fixed-value code', 'For games on Steam'], 'https://store.steampowered.com/steam_gift_cards', 1,
    [['5 دولار', '$5', 0, 5], ['10 دولار', '$10', 0, 10], ['20 دولار', '$20', 0, 20], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],
  ['nintendo-eshop', TU, 'Nintendo', 'كارت Nintendo eShop', 'Nintendo eShop card', 'NIN', '#FF3B30', 'card', 'region', 'كارت رصيد Nintendo eShop لمتجر الولايات المتحدة.', 'A Nintendo eShop credit card for the United States store.', ['كود بقيمة ثابتة', 'لألعاب Switch'], ['Fixed-value code', 'For Switch games'], 'https://www.nintendo.com/store/gift-cards/', 0,
    [['20 دولار', '$20', 0, 20], ['50 دولار', '$50', 0, 50]]],
  ['amazon-gift-card', TU, 'Amazon', 'كارت Amazon', 'Amazon gift card', 'AMZ', '#F2A900', 'card', 'region', 'كارت هدايا Amazon لمتجر الولايات المتحدة.', 'An Amazon gift card for the United States store.', ['كود بقيمة ثابتة', 'للشراء من Amazon'], ['Fixed-value code', 'For Amazon purchases'], 'https://www.amazon.com/gift-cards', 0,
    [['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100], ['500 دولار', '$500', 0, 500, { qty: 1 }]]],
  ['netflix-gift-card', TU, 'Netflix', 'كارت هدايا Netflix', 'Netflix gift card', 'N', '#E50914', 'card', 'region', 'كارت هدايا Netflix بقيمة ثابتة لمتجر الولايات المتحدة.', 'A fixed-value Netflix gift card for the United States store.', ['كود بقيمة ثابتة', 'يتشحن على حساب Netflix'], ['Fixed-value code', 'Redeemed on a Netflix account'], 'https://www.netflix.com/redeem', 0,
    [['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],
  ['roblox-gift-card', TU, 'Roblox', 'كارت Roblox', 'Roblox gift card', 'RBX', '#FF3B30', 'card', 'none', 'كارت رصيد Roblox لشراء Robux ومزايا Premium.', 'A Roblox credit card for Robux and Premium.', ['كود بقيمة ثابتة', 'لشراء Robux'], ['Fixed-value code', 'For Robux'], 'https://www.roblox.com/giftcards', 0,
    [['10 دولار', '$10', 0, 10], ['25 دولار', '$25', 0, 25], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],
  ['razer-gold', TU, 'Razer', 'كارت Razer Gold', 'Razer Gold card', 'RZ', '#34A853', 'card', 'none', 'كارت رصيد Razer Gold للألعاب والخدمات.', 'A Razer Gold credit card for games and services.', ['كود بقيمة ثابتة', 'لعدد كبير من الألعاب'], ['Fixed-value code', 'For many games'], 'https://gold.razer.com', 0,
    [['10 دولار', '$10', 0, 10], ['20 دولار', '$20', 0, 20], ['50 دولار', '$50', 0, 50], ['100 دولار', '$100', 0, 100]]],

  // ================= GAME TOP-UPS =================
  ['pubg-mobile-uc', TU, 'PUBG MOBILE', 'شحن شدات PUBG Mobile (UC)', 'PUBG Mobile UC top-up', 'UC', '#F2A900', 'topup', 'player', 'شحن UC للعبة PUBG MOBILE برقم اللاعب (Player ID).', 'UC top-up for PUBG MOBILE by Player ID.', ['الشحن برقم اللاعب بس', 'باقات ثابتة'], ['Top-up by Player ID only', 'Fixed packages'], 'https://www.pubgmobile.com/', 1,
    [['325 UC', '325 UC', 0, 4.99], ['660 UC', '660 UC', 0, 9.99], ['1800 UC', '1800 UC', 0, 24.99], ['3850 UC', '3850 UC', 0, 49.99], ['8100 UC', '8100 UC', 0, 99.99]]],
  ['free-fire-diamonds', TU, 'Garena', 'شحن جواهر Free Fire', 'Free Fire diamonds top-up', 'FF', '#F2A900', 'topup', 'player', 'شحن جواهر لعبة Free Fire برقم اللاعب.', 'Diamond top-up for Free Fire by Player ID.', ['الشحن برقم اللاعب بس', 'باقات ثابتة'], ['Top-up by Player ID only', 'Fixed packages'], 'https://ff.garena.com', 1,
    [['310 جوهرة', '310 diamonds', 0, 3], ['520 جوهرة', '520 diamonds', 0, 5], ['1060 جوهرة', '1060 diamonds', 0, 10], ['2180 جوهرة', '2180 diamonds', 0, 20], ['5600 جوهرة', '5600 diamonds', 0, 50]]],
  ['fortnite-vbucks', TU, 'Epic Games', 'شحن V-Bucks فورتنايت', 'Fortnite V-Bucks top-up', 'VB', '#4F8DF5', 'topup', 'none', 'كارت V-Bucks لعملة لعبة Fortnite.', 'V-Bucks card for Fortnite currency.', ['كود بقيمة ثابتة', 'لعملة اللعبة'], ['Fixed-value code', 'For in-game currency'], 'https://www.fortnite.com/vbuckscard', 0,
    [['1000 V-Bucks', '1000 V-Bucks', 0, 8.99], ['2800 V-Bucks', '2800 V-Bucks', 0, 22.99], ['5000 V-Bucks', '5000 V-Bucks', 0, 36.99], ['13500 V-Bucks', '13500 V-Bucks', 0, 89.99]]],
  ['valorant-points', TU, 'Riot Games', 'شحن Valorant Points', 'Valorant Points top-up', 'VP', '#FF3B30', 'topup', 'none', 'كارت Valorant Points لعملة اللعبة.', 'Valorant Points card for in-game currency.', ['كود بقيمة ثابتة', 'لعملة اللعبة'], ['Fixed-value code', 'For in-game currency'], 'https://playvalorant.com', 0,
    [['1000 VP', '1000 VP', 0, 9.99], ['2050 VP', '2050 VP', 0, 19.99], ['3650 VP', '3650 VP', 0, 34.99], ['5350 VP', '5350 VP', 0, 49.99]]],
  ['cod-mobile-cp', TU, 'Activision', 'شحن Call of Duty Mobile (CP)', 'Call of Duty Mobile CP top-up', 'CP', '#34A853', 'topup', 'player', 'شحن CP للعبة Call of Duty Mobile برقم اللاعب.', 'CP top-up for Call of Duty Mobile by Player ID.', ['الشحن برقم اللاعب بس', 'باقات ثابتة'], ['Top-up by Player ID only', 'Fixed packages'], 'https://www.callofduty.com/mobile', 0,
    [['400 CP', '400 CP', 0, 4.99], ['800 CP', '800 CP', 0, 9.99], ['2000 CP', '2000 CP', 0, 24.99], ['5000 CP', '5000 CP', 0, 49.99]]],
  ['mobile-legends-diamonds', TU, 'Moonton', 'شحن ألماس Mobile Legends', 'Mobile Legends diamonds top-up', 'ML', '#8FA3FF', 'topup', 'player', 'شحن ألماس Mobile Legends برقم اللاعب.', 'Diamond top-up for Mobile Legends by Player ID.', ['الشحن برقم اللاعب بس', 'باقات ثابتة'], ['Top-up by Player ID only', 'Fixed packages'], 'https://www.mobilelegends.com', 0,
    [['257 ألماسة', '257 diamonds', 0, 5], ['514 ألماسة', '514 diamonds', 0, 10], ['1049 ألماسة', '1049 diamonds', 0, 20], ['2195 ألماسة', '2195 diamonds', 0, 40]]],
  ['genshin-impact', TU, 'HoYoverse', 'شحن Genshin Impact', 'Genshin Impact top-up', 'GI', '#8FA3FF', 'topup', 'player', 'شحن Genesis Crystals للعبة Genshin Impact برقم اللاعب.', 'Genesis Crystals top-up for Genshin Impact by Player ID.', ['الشحن برقم اللاعب بس', 'باقات ثابتة'], ['Top-up by Player ID only', 'Fixed packages'], 'https://genshin.hoyoverse.com', 0,
    [['330 كريستال', '330 crystals', 0, 4.99], ['1090 كريستال', '1090 crystals', 0, 14.99], ['2240 كريستال', '2240 crystals', 0, 29.99], ['6480 كريستال', '6480 crystals', 0, 99.99]]],
  ['ea-fc-points', TU, 'EA', 'شحن EA FC Points', 'EA FC Points top-up', 'FC', '#34A853', 'topup', 'none', 'كارت FC Points لعملة لعبة EA FC.', 'FC Points card for EA FC currency.', ['كود بقيمة ثابتة', 'لعملة اللعبة'], ['Fixed-value code', 'For in-game currency'], 'https://www.ea.com/games/ea-sports-fc', 0,
    [['1000 نقطة', '1000 points', 0, 9.99], ['2200 نقطة', '2200 points', 0, 19.99], ['5900 نقطة', '5900 points', 0, 49.99], ['12000 نقطة', '12000 points', 0, 99.99]]],
  ['tiktok-coins', TU, 'TikTok', 'شحن عملات TikTok', 'TikTok coins top-up', 'TT', '#FF3B30', 'topup', 'username', 'شحن عملات TikTok لحسابك باسم المستخدم.', 'TikTok coins top-up by username.', ['الشحن باسم المستخدم بس', 'من غير كلمة سر'], ['Top-up by username only', 'No password'], 'https://www.tiktok.com/coins', 0,
    [['350 عملة', '350 coins', 0, 4.99], ['700 عملة', '700 coins', 0, 9.99], ['1400 عملة', '1400 coins', 0, 19.99], ['3500 عملة', '3500 coins', 0, 49.99], ['7000 عملة', '7000 coins', 0, 99.99]]],
];

// ---------- build SQL
const fieldFor = (kind) => {
  if (kind === 'email') return [F.email()];
  if (kind === 'region') return [F.region()];
  if (kind === 'player') return [F.player()];
  if (kind === 'tg') return [F.username('اسم مستخدم تيليجرام', 'Telegram username', 'telegram_username')];
  if (kind === 'username') return [F.username('اسم المستخدم على TikTok', 'TikTok username', 'tiktok_username')];
  return [];
};

const lines = [
  '-- Generated by scripts/launch-catalog.mjs — launch catalogue with ESTIMATED EGP prices (≈50 EGP/USD + margin).',
  '-- The owner asked for the catalogue to be put live on 2026-10-11; prices are estimates to be adjusted in Admin → Pricing.',
  'DELETE FROM plans;',
  'DELETE FROM products;',
];
let nProducts = 0, nPlans = 0, minP = Infinity, maxP = 0;
C.forEach((row, i) => {
  const [slug, cat, brand, tAr, tEn, icon, accent, kind, field, whatAr, whatEn, fAr, fEn, url, featured, plans] = row;
  const id = 'prd_' + slug.replace(/-/g, '_');
  const descAr = kind === 'sub' || kind === 'license'
    ? `${whatAr} مميزات الخدمة وشروطها بيحددها مقدّم الخدمة وممكن تتغير. ${field === 'email' ? 'بنفعّل الاشتراك على الإيميل اللي بتكتبه من غير ما نطلب كلمة سر.' : ''}`.trim()
    : kind === 'card'
      ? `${whatAr} الكود بيوصلك في صفحة طلبك بعد تأكيد الدفع وبتشحنه بنفسك على حسابك.`
      : `${whatAr} من غير ما نطلب بيانات دخول أو كلمة سر.`;
  const descEn = kind === 'sub' || kind === 'license'
    ? `${whatEn} Features and terms are set by the provider and may change. ${field === 'email' ? 'We activate it on the email you enter and never ask for a password.' : ''}`.trim()
    : kind === 'card'
      ? `${whatEn} Your code appears on your order page after payment is confirmed, and you redeem it yourself.`
      : `${whatEn} We never ask for login details or a password.`;
  const notes = `Launch catalogue (11 Oct 2026). Prices are ESTIMATES: USD list price × ${FX} EGP/USD × ${MARKUP[kind]} margin, rounded; review before accepting orders. Confirm: you are authorised to supply this, the exact current plan names, availability for Egypt and your delivery method.`;
  lines.push(`INSERT INTO products (id, slug, category_id, brand, title_ar, title_en, summary_ar, summary_en, description_ar, description_en, features_ar, features_en, customer_fields, icon_text, accent, status, featured, supply_status, supply_notes, official_url, sort, created_at, updated_at, published_at) VALUES (${[
    id, slug, cat, brand, tAr, tEn, whatAr, whatEn, descAr, descEn, JSON.stringify(fAr), JSON.stringify(fEn), JSON.stringify(fieldFor(field)), icon, accent,
    'published', featured ? 1 : 0, 'validated', notes, url, i + 1, NOW, NOW, NOW].map(q).join(', ')});`);
  nProducts++;
  plans.forEach((pl, j) => {
    const [tierAr, tierEn, months, p, opts0] = pl;
    const p2 = typeof p === 'object' ? p : { usd: p };
    const opts = p2.opts ?? opts0 ?? {};
    const planKind = opts.kind ?? kind;
    const egp = p2.egp ?? price(p2.usd, planKind);
    if (egp < FLOOR) return;
    const nameAr = months > 0 ? (tierAr ? `${tierAr} — ${durAr(months)}` : durAr(months)) : tierAr;
    const nameEn = months > 0 ? (tierEn ? `${tierEn} — ${durEn(months)}` : durEn(months)) : tierEn;
    const type = opts.type ?? (kind === 'card' ? 'gift_card' : kind === 'topup' ? 'topup' : kind === 'license' ? 'license' : 'private');
    const perpetual = months === 0 ? 1 : 0;
    const guarantee = months > 0 ? 'full_period' : 'none';
    const qty = opts.qty ?? (kind === 'card' || kind === 'topup' ? (egp > 8000 ? 1 : 5) : egp > 20000 ? 1 : 2);
    const planId = `pln_${id.slice(4)}_${j + 1}`;
    lines.push(`INSERT INTO plans (id, product_id, name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, status, availability, max_qty, guarantee_kind, sort, created_at, updated_at) VALUES (${[
      planId, id, nameAr, nameEn, type, months > 0 ? months : null, months > 0 ? 'month' : null, perpetual, egp * 100, 'approved', 'available', qty, guarantee, j + 1, NOW, NOW].map(q).join(', ')});`);
    nPlans++; minP = Math.min(minP, egp); maxP = Math.max(maxP, egp);
  });
});
writeFileSync(join(root, 'migrations', '0003_launch_catalog.sql'), lines.join('\n') + '\n');
console.log(`Products: ${nProducts}, plans: ${nPlans}, price range: ${minP} – ${maxP} EGP`);
