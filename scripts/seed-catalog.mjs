// Generates migrations/0002_seed_catalog.sql: categories + SUGGESTED DRAFT products.
// Every product is status='draft', supply_status='pending'; every plan is 'proposed'
// with price NULL. Nothing here is publishable until the owner approves it.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const categories = [
  { id: 'cat_ai', slug: 'ai-tools', name_ar: 'أدوات الذكاء الاصطناعي', name_en: 'AI tools & subscriptions',
    description_ar: 'اشتراكات أدوات الذكاء الاصطناعي للكتابة والبحث والتصميم.', description_en: 'Subscriptions for AI assistants and creative AI tools.', icon: 'sparkles', sort: 1 },
  { id: 'cat_software', slug: 'design-productivity', name_ar: 'تصميم وإنتاجية وبرامج', name_en: 'Design, productivity & software',
    description_ar: 'اشتراكات وتراخيص برامج التصميم والشغل اليومي.', description_en: 'Design, office and productivity subscriptions and licenses.', icon: 'layers', sort: 2 },
  { id: 'cat_entertainment', slug: 'entertainment', name_ar: 'اشتراكات الترفيه', name_en: 'Entertainment subscriptions',
    description_ar: 'أفلام ومسلسلات وموسيقى.', description_en: 'Streaming video and music subscriptions.', icon: 'play', sort: 3 },
  { id: 'cat_topup', slug: 'top-ups', name_ar: 'كروت الشحن وخدمات الدفع', name_en: 'Gift cards & top-ups',
    description_ar: 'كروت متاجر التطبيقات والألعاب وشحن الرصيد بباقات ثابتة.', description_en: 'App-store and gaming gift cards and fixed top-up packages.', icon: 'wallet', sort: 4 },
];

const VALIDATE = 'Owner to confirm: (1) you are authorised to supply/resell this product, (2) the current official plan name and what it includes, (3) availability for customers in Egypt, (4) the exact delivery method (gift code, invitation, license key, or activation on the customer account without their password), (5) selling price in EGP.';
const NO_SHARING = ' Do not offer shared logins unless the provider\'s terms allow it.';

const emailField = (ar, en) => ({ key: 'account_email', type: 'email', required: true,
  label_ar: 'إيميل الحساب اللي هيتفعّل عليه الاشتراك', label_en: 'Email of the account to activate',
  help_ar: ar || 'لازم يكون نفس الإيميل المسجّل بيه في الخدمة.', help_en: en || 'Must match the email registered with the service.' });
const regionField = { key: 'account_region', type: 'select', required: true,
  label_ar: 'بلد/منطقة حسابك في المتجر', label_en: 'Your store account country/region',
  help_ar: 'الكارت لازم يكون بنفس منطقة حسابك.', help_en: 'The card region must match your account region.',
  options: [ { value: 'US', label_ar: 'الولايات المتحدة', label_en: 'United States' }, { value: 'EG', label_ar: 'مصر', label_en: 'Egypt' },
    { value: 'AE', label_ar: 'الإمارات', label_en: 'UAE' }, { value: 'SA', label_ar: 'السعودية', label_en: 'Saudi Arabia' } ] };
const playerField = { key: 'player_id', type: 'text', required: true, pattern: '^[0-9]{5,15}$',
  label_ar: 'رقم اللاعب (Player ID)', label_en: 'Player ID',
  help_ar: 'هتلاقيه في صفحة البروفايل جوه اللعبة. اكتبه أرقام بس.', help_en: 'Find it on your in-game profile. Digits only.' };

const sub = (id, name_ar, name_en, months, extra = {}) => ({ id, name_ar, name_en, plan_type: 'private', duration_value: months, duration_unit: 'month', is_perpetual: 0, max_qty: 1, guarantee_kind: 'pending', ...extra });
const card = (id, name_ar, name_en, extra = {}) => ({ id, name_ar, name_en, plan_type: 'gift_card', duration_value: null, duration_unit: null, is_perpetual: 1, max_qty: 5, guarantee_kind: 'none', ...extra });

const products = [
  // ---------------- AI ----------------
  { id: 'prd_chatgpt_plus', slug: 'chatgpt-plus', category_id: 'cat_ai', brand: 'OpenAI', icon_text: 'GPT', accent: '#20C7CF',
    title_ar: 'اشتراك ChatGPT Plus', title_en: 'ChatGPT Plus subscription',
    summary_ar: 'الخطة المدفوعة من OpenAI لخدمة ChatGPT، بحدود استخدام أعلى.', summary_en: 'OpenAI\'s paid ChatGPT plan with higher usage limits.',
    description_ar: 'ChatGPT Plus هو الاشتراك المدفوع اللي بتقدمه OpenAI لخدمة ChatGPT. التفاصيل والمميزات الحالية بتتحدد من OpenAI وممكن تتغير.',
    description_en: 'ChatGPT Plus is OpenAI\'s paid subscription for ChatGPT. Current features and limits are set by OpenAI and may change.',
    features_ar: ['حدود استخدام أعلى من الخطة المجانية', 'الوصول لأحدث الموديلات المتاحة للخطة'], features_en: ['Higher usage limits than the free plan', 'Access to the models available on the plan'],
    customer_fields: [emailField()], official_url: 'https://openai.com/chatgpt/pricing/',
    plans: [sub('pln_chatgpt_plus_1m', 'شهر واحد', '1 month', 1)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_claude_pro', slug: 'claude-pro', category_id: 'cat_ai', brand: 'Anthropic', icon_text: 'CL', accent: '#D97757',
    title_ar: 'اشتراك Claude Pro', title_en: 'Claude Pro subscription',
    summary_ar: 'الخطة المدفوعة من Anthropic لمساعد Claude.', summary_en: 'Anthropic\'s paid plan for the Claude assistant.',
    description_ar: 'Claude Pro هي الخطة المدفوعة لمساعد Claude من شركة Anthropic، بحدود استخدام أعلى من الخطة المجانية. المميزات الحالية بتتحدد من Anthropic.',
    description_en: 'Claude Pro is Anthropic\'s paid plan for the Claude assistant, with more usage than the free plan. Current features are set by Anthropic.',
    features_ar: ['استخدام أكتر من الخطة المجانية', 'مميزات الخطة حسب Anthropic'], features_en: ['More usage than the free plan', 'Plan features as defined by Anthropic'],
    customer_fields: [emailField()], official_url: 'https://claude.com/pricing',
    plans: [sub('pln_claude_pro_1m', 'شهر واحد', '1 month', 1)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_google_ai_pro', slug: 'google-ai-pro', category_id: 'cat_ai', brand: 'Google', icon_text: 'AI', accent: '#4F8DF5',
    title_ar: 'اشتراك Google AI Pro', title_en: 'Google AI Pro subscription',
    summary_ar: 'خطة Google One للذكاء الاصطناعي مع Gemini ومساحة تخزين.', summary_en: 'Google One AI plan with Gemini features and storage.',
    description_ar: 'Google AI Pro هي خطة من Google One بتضيف مميزات Gemini المتقدمة ومساحة تخزين. اسم الخطة ومحتواها بيتحددوا من Google وممكن يختلفوا حسب البلد.',
    description_en: 'Google AI Pro is a Google One plan that adds advanced Gemini features and storage. Plan name and contents are set by Google and may vary by country.',
    features_ar: ['مميزات Gemini المتقدمة', 'مساحة تخزين Google One'], features_en: ['Advanced Gemini features', 'Google One storage'],
    customer_fields: [emailField('إيميل حساب Google اللي هيتفعّل عليه.', 'Google account email to activate.')], official_url: 'https://one.google.com/about/ai-premium',
    plans: [sub('pln_google_ai_pro_1m', 'شهر واحد', '1 month', 1)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_midjourney', slug: 'midjourney', category_id: 'cat_ai', brand: 'Midjourney', icon_text: 'MJ', accent: '#8FA3FF',
    title_ar: 'اشتراك Midjourney', title_en: 'Midjourney subscription',
    summary_ar: 'اشتراك لتوليد الصور بالذكاء الاصطناعي من Midjourney.', summary_en: 'Midjourney AI image-generation subscription.',
    description_ar: 'Midjourney خدمة لتوليد الصور بالذكاء الاصطناعي. كل خطة ليها حدود استخدام مختلفة بتحددها Midjourney.',
    description_en: 'Midjourney is an AI image-generation service. Each plan has usage limits defined by Midjourney.',
    features_ar: ['توليد صور بالذكاء الاصطناعي', 'حدود الاستخدام حسب الخطة'], features_en: ['AI image generation', 'Usage limits per plan'],
    customer_fields: [emailField()], official_url: 'https://docs.midjourney.com/',
    plans: [sub('pln_midjourney_basic_1m', 'Basic — شهر', 'Basic — 1 month', 1), sub('pln_midjourney_standard_1m', 'Standard — شهر', 'Standard — 1 month', 1)], notes: VALIDATE + NO_SHARING },

  // ---------------- Software ----------------
  { id: 'prd_canva_pro', slug: 'canva-pro', category_id: 'cat_software', brand: 'Canva', icon_text: 'CV', accent: '#22C3E6',
    title_ar: 'اشتراك Canva Pro', title_en: 'Canva Pro subscription',
    summary_ar: 'خطة Canva المدفوعة للتصميم.', summary_en: 'Canva\'s paid design plan.',
    description_ar: 'Canva Pro هي الخطة المدفوعة من Canva، فيها مكتبة محتوى وأدوات أكتر من الخطة المجانية.',
    description_en: 'Canva Pro is Canva\'s paid plan with more content and tools than the free plan.',
    features_ar: ['أدوات ومحتوى أكتر من الخطة المجانية'], features_en: ['More tools and content than the free plan'],
    customer_fields: [emailField('إيميل حساب Canva.', 'Your Canva account email.')], official_url: 'https://www.canva.com/pro/',
    plans: [sub('pln_canva_pro_1m', 'شهر واحد', '1 month', 1), sub('pln_canva_pro_12m', '12 شهر', '12 months', 12)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_microsoft_365', slug: 'microsoft-365', category_id: 'cat_software', brand: 'Microsoft', icon_text: '365', accent: '#F25022',
    title_ar: 'Microsoft 365', title_en: 'Microsoft 365',
    summary_ar: 'تطبيقات Office ومساحة OneDrive من Microsoft.', summary_en: 'Microsoft Office apps and OneDrive storage.',
    description_ar: 'Microsoft 365 بيشمل تطبيقات زي Word وExcel وPowerPoint ومساحة OneDrive. الخطط المتاحة (Personal/Family) ومحتواها بيتحددوا من Microsoft.',
    description_en: 'Microsoft 365 includes apps such as Word, Excel and PowerPoint plus OneDrive storage. Available plans (Personal/Family) are defined by Microsoft.',
    features_ar: ['Word وExcel وPowerPoint', 'مساحة OneDrive'], features_en: ['Word, Excel and PowerPoint', 'OneDrive storage'],
    customer_fields: [emailField('إيميل حساب Microsoft.', 'Your Microsoft account email.')], official_url: 'https://www.microsoft.com/microsoft-365',
    plans: [sub('pln_m365_personal_12m', 'Personal — 12 شهر', 'Personal — 12 months', 12, { plan_type: 'license' }),
      sub('pln_m365_family_12m', 'Family — 12 شهر', 'Family — 12 months', 12, { plan_type: 'license' })], notes: VALIDATE },
  { id: 'prd_adobe_cc', slug: 'adobe-creative-cloud', category_id: 'cat_software', brand: 'Adobe', icon_text: 'CC', accent: '#FF4D4D',
    title_ar: 'Adobe Creative Cloud', title_en: 'Adobe Creative Cloud',
    summary_ar: 'برامج Adobe للتصميم والمونتاج.', summary_en: 'Adobe design, photo and video apps.',
    description_ar: 'Adobe Creative Cloud بيقدم برامج زي Photoshop وIllustrator وPremiere Pro حسب الخطة. أسماء الخطط ومحتواها بتتحدد من Adobe.',
    description_en: 'Adobe Creative Cloud provides apps such as Photoshop, Illustrator and Premiere Pro depending on the plan. Plan names are set by Adobe.',
    features_ar: ['برامج Adobe حسب الخطة'], features_en: ['Adobe apps depending on plan'],
    customer_fields: [emailField('إيميل حساب Adobe.', 'Your Adobe account email.')], official_url: 'https://www.adobe.com/creativecloud/plans.html',
    plans: [sub('pln_adobe_photo_12m', 'Photography — 12 شهر', 'Photography — 12 months', 12, { plan_type: 'license' }),
      sub('pln_adobe_allapps_1m', 'All Apps — شهر', 'All Apps — 1 month', 1)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_grammarly_pro', slug: 'grammarly-pro', category_id: 'cat_software', brand: 'Grammarly', icon_text: 'G', accent: '#15C39A',
    title_ar: 'اشتراك Grammarly Pro', title_en: 'Grammarly Pro subscription',
    summary_ar: 'مساعد كتابة إنجليزي من Grammarly.', summary_en: 'Grammarly\'s paid English writing assistant.',
    description_ar: 'Grammarly Pro هي الخطة المدفوعة من Grammarly لتحسين الكتابة بالإنجليزي. المميزات الحالية بتتحدد من Grammarly.',
    description_en: 'Grammarly Pro is Grammarly\'s paid writing-assistant plan. Current features are set by Grammarly.',
    features_ar: ['اقتراحات كتابة متقدمة'], features_en: ['Advanced writing suggestions'],
    customer_fields: [emailField()], official_url: 'https://www.grammarly.com/plans',
    plans: [sub('pln_grammarly_1m', 'شهر واحد', '1 month', 1), sub('pln_grammarly_12m', '12 شهر', '12 months', 12)], notes: VALIDATE + NO_SHARING },

  // ---------------- Entertainment ----------------
  { id: 'prd_netflix', slug: 'netflix', category_id: 'cat_entertainment', brand: 'Netflix', icon_text: 'N', accent: '#E50914',
    title_ar: 'اشتراك Netflix', title_en: 'Netflix subscription',
    summary_ar: 'أفلام ومسلسلات على Netflix.', summary_en: 'Films and series on Netflix.',
    description_ar: 'Netflix خدمة بث أفلام ومسلسلات. الخطط والأسعار الرسمية بتختلف حسب البلد وبتتحدد من Netflix.',
    description_en: 'Netflix is a film and series streaming service. Official plans vary by country and are set by Netflix.',
    features_ar: ['أفلام ومسلسلات حسب الخطة'], features_en: ['Films and series depending on plan'],
    customer_fields: [emailField('إيميل حساب Netflix.', 'Your Netflix account email.')], official_url: 'https://help.netflix.com/en/node/24926',
    plans: [sub('pln_netflix_standard_1m', 'Standard — شهر', 'Standard — 1 month', 1)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_spotify_premium', slug: 'spotify-premium', category_id: 'cat_entertainment', brand: 'Spotify', icon_text: 'SP', accent: '#1ED760',
    title_ar: 'Spotify Premium', title_en: 'Spotify Premium',
    summary_ar: 'موسيقى وبودكاست من غير إعلانات.', summary_en: 'Ad-free music and podcasts.',
    description_ar: 'Spotify Premium بيتيح سماع من غير إعلانات وتحميل للاستماع أوفلاين، حسب شروط Spotify.',
    description_en: 'Spotify Premium offers ad-free listening and offline downloads, subject to Spotify\'s terms.',
    features_ar: ['من غير إعلانات', 'تحميل للاستماع أوفلاين'], features_en: ['Ad-free listening', 'Offline downloads'],
    customer_fields: [emailField('إيميل حساب Spotify.', 'Your Spotify account email.')], official_url: 'https://www.spotify.com/eg-en/premium/',
    plans: [sub('pln_spotify_ind_1m', 'Individual — شهر', 'Individual — 1 month', 1), sub('pln_spotify_ind_12m', 'Individual — 12 شهر', 'Individual — 12 months', 12)], notes: VALIDATE + NO_SHARING },
  { id: 'prd_youtube_premium', slug: 'youtube-premium', category_id: 'cat_entertainment', brand: 'YouTube', icon_text: 'YT', accent: '#FF3B30',
    title_ar: 'YouTube Premium', title_en: 'YouTube Premium',
    summary_ar: 'يوتيوب من غير إعلانات مع YouTube Music.', summary_en: 'Ad-free YouTube with YouTube Music.',
    description_ar: 'YouTube Premium بيشغّل الفيديوهات من غير إعلانات وفي الخلفية، ومعاه YouTube Music Premium، حسب شروط YouTube في بلدك.',
    description_en: 'YouTube Premium offers ad-free and background playback plus YouTube Music Premium, subject to YouTube\'s terms in your country.',
    features_ar: ['من غير إعلانات', 'تشغيل في الخلفية', 'YouTube Music Premium'], features_en: ['Ad-free', 'Background play', 'YouTube Music Premium'],
    customer_fields: [emailField('إيميل حساب Google.', 'Your Google account email.')], official_url: 'https://www.youtube.com/premium',
    plans: [sub('pln_yt_ind_1m', 'Individual — شهر', 'Individual — 1 month', 1),
      sub('pln_yt_family_1m', 'Family (دعوة) — شهر', 'Family (invite) — 1 month', 1, { plan_type: 'invite' })], notes: VALIDATE + ' Family plans require members in the same household per YouTube terms.' },
  { id: 'prd_shahid_vip', slug: 'shahid-vip', category_id: 'cat_entertainment', brand: 'Shahid', icon_text: 'SH', accent: '#3DDC97',
    title_ar: 'اشتراك شاهد VIP', title_en: 'Shahid VIP subscription',
    summary_ar: 'مسلسلات وبرامج عربية على منصة شاهد.', summary_en: 'Arabic series and shows on Shahid.',
    description_ar: 'شاهد VIP هو الاشتراك المدفوع على منصة شاهد من MBC، وفيه مسلسلات وبرامج عربية. الباقات بتتحدد من شاهد.',
    description_en: 'Shahid VIP is the paid tier of MBC\'s Shahid platform with Arabic series and shows. Packages are set by Shahid.',
    features_ar: ['مسلسلات وبرامج عربية'], features_en: ['Arabic series and shows'],
    customer_fields: [emailField('إيميل حساب شاهد.', 'Your Shahid account email.')], official_url: 'https://shahid.mbc.net/',
    plans: [sub('pln_shahid_vip_1m', 'VIP — شهر', 'VIP — 1 month', 1), sub('pln_shahid_vip_12m', 'VIP — 12 شهر', 'VIP — 12 months', 12)], notes: VALIDATE + NO_SHARING },

  // ---------------- Top-ups ----------------
  { id: 'prd_google_play_card', slug: 'google-play-gift-card', category_id: 'cat_topup', brand: 'Google Play', icon_text: 'GP', accent: '#34A853',
    title_ar: 'كارت Google Play', title_en: 'Google Play gift card',
    summary_ar: 'رصيد لمتجر Google Play بقيمة ثابتة.', summary_en: 'Fixed-value Google Play store credit.',
    description_ar: 'كارت هدايا Google Play بيتشحن على حساب Google لنفس منطقة الكارت. لازم منطقة حسابك تكون نفس منطقة الكارت.',
    description_en: 'A Google Play gift card is redeemed on a Google account in the same region as the card. Your account region must match.',
    features_ar: ['كود بقيمة ثابتة', 'بيتشحن على حسابك'], features_en: ['Fixed-value code', 'Redeemed on your own account'],
    customer_fields: [regionField], official_url: 'https://play.google.com/about/giftcards/',
    plans: [card('pln_gplay_us_10', 'متجر أمريكي — 10 دولار', 'US store — $10'), card('pln_gplay_us_25', 'متجر أمريكي — 25 دولار', 'US store — $25')], notes: VALIDATE + ' Confirm which card regions you can supply and the exact face values.' },
  { id: 'prd_apple_gift_card', slug: 'apple-gift-card', category_id: 'cat_topup', brand: 'Apple', icon_text: '', accent: '#C7CCD6',
    title_ar: 'كارت Apple Gift Card', title_en: 'Apple Gift Card',
    summary_ar: 'رصيد لحساب Apple (App Store وiCloud+ وغيرهم).', summary_en: 'Apple Account balance (App Store, iCloud+ and more).',
    description_ar: 'Apple Gift Card بيضيف رصيد لحساب Apple في نفس بلد الكارت. لازم بلد حسابك تكون نفس بلد الكارت.',
    description_en: 'An Apple Gift Card adds balance to an Apple Account in the same country as the card. Your account country must match.',
    features_ar: ['كود بقيمة ثابتة'], features_en: ['Fixed-value code'],
    customer_fields: [regionField], official_url: 'https://www.apple.com/shop/gift-cards',
    plans: [card('pln_apple_us_10', 'متجر أمريكي — 10 دولار', 'US store — $10'), card('pln_apple_us_25', 'متجر أمريكي — 25 دولار', 'US store — $25')], notes: VALIDATE + ' Confirm which card regions you can supply and the exact face values.' },
  { id: 'prd_psn_card', slug: 'playstation-store-card', category_id: 'cat_topup', brand: 'PlayStation', icon_text: 'PS', accent: '#3B7BFF',
    title_ar: 'كارت PlayStation Store', title_en: 'PlayStation Store wallet card',
    summary_ar: 'رصيد لمحفظة PlayStation Store.', summary_en: 'PlayStation Store wallet credit.',
    description_ar: 'كارت PlayStation Store بيضيف رصيد لمحفظة حساب PlayStation Network في نفس منطقة الكارت.',
    description_en: 'A PlayStation Store card adds wallet funds to a PlayStation Network account in the same region as the card.',
    features_ar: ['كود بقيمة ثابتة'], features_en: ['Fixed-value code'],
    customer_fields: [regionField], official_url: 'https://www.playstation.com/en-us/playstation-gift-cards/',
    plans: [card('pln_psn_us_10', 'متجر أمريكي — 10 دولار', 'US store — $10'), card('pln_psn_us_25', 'متجر أمريكي — 25 دولار', 'US store — $25')], notes: VALIDATE + ' Confirm which card regions you can supply and the exact face values.' },
  { id: 'prd_pubg_uc', slug: 'pubg-mobile-uc', category_id: 'cat_topup', brand: 'PUBG MOBILE', icon_text: 'UC', accent: '#F2A900',
    title_ar: 'شحن شدات PUBG Mobile (UC)', title_en: 'PUBG Mobile UC top-up',
    summary_ar: 'شحن UC على حسابك برقم اللاعب.', summary_en: 'UC top-up delivered to your Player ID.',
    description_ar: 'شحن UC للعبة PUBG MOBILE على حسابك باستخدام رقم اللاعب (Player ID) بس، من غير ما نطلب بيانات دخول.',
    description_en: 'UC top-up for PUBG MOBILE delivered using your Player ID only — no login details required.',
    features_ar: ['الشحن برقم اللاعب بس', 'باقات ثابتة'], features_en: ['Top-up by Player ID only', 'Fixed packages'],
    customer_fields: [playerField], official_url: 'https://www.pubgmobile.com/',
    plans: [
      { ...card('pln_pubg_60', '60 UC', '60 UC'), plan_type: 'topup', max_qty: 5 },
      { ...card('pln_pubg_325', '325 UC', '325 UC'), plan_type: 'topup', max_qty: 5 },
      { ...card('pln_pubg_660', '660 UC', '660 UC'), plan_type: 'topup', max_qty: 5 },
    ], notes: VALIDATE + ' Confirm the official package sizes (base + bonus) your supplier provides.' },
];

const lines = ['-- Generated by scripts/seed-catalog.mjs — suggested DRAFTS only. Prices are intentionally NULL.'];
for (const c of categories) {
  lines.push(`INSERT INTO categories (id, slug, name_ar, name_en, description_ar, description_en, icon, sort) VALUES (${[c.id, c.slug, c.name_ar, c.name_en, c.description_ar, c.description_en, c.icon, c.sort].map(q).join(', ')});`);
}
products.forEach((p, i) => {
  lines.push(`INSERT INTO products (id, slug, category_id, brand, title_ar, title_en, summary_ar, summary_en, description_ar, description_en, features_ar, features_en, customer_fields, icon_text, accent, status, supply_status, supply_notes, official_url, sort, created_at, updated_at) VALUES (${[
    p.id, p.slug, p.category_id, p.brand, p.title_ar, p.title_en, p.summary_ar, p.summary_en, p.description_ar, p.description_en,
    JSON.stringify(p.features_ar), JSON.stringify(p.features_en), JSON.stringify(p.customer_fields), p.icon_text, p.accent,
    'draft', 'pending', p.notes, p.official_url, i + 1, NOW, NOW].map(q).join(', ')});`);
  p.plans.forEach((pl, j) => {
    lines.push(`INSERT INTO plans (id, product_id, name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, status, availability, max_qty, guarantee_kind, sort, created_at, updated_at) VALUES (${[
      pl.id, p.id, pl.name_ar, pl.name_en, pl.plan_type, pl.duration_value, pl.duration_unit, pl.is_perpetual, null, 'proposed', 'available', pl.max_qty, pl.guarantee_kind, j + 1, NOW, NOW].map(q).join(', ')});`);
  });
});
writeFileSync(join(root, 'migrations', '0002_seed_catalog.sql'), lines.join('\n') + '\n');
console.log(`Wrote ${categories.length} categories, ${products.length} draft products, ${products.reduce((n, p) => n + p.plans.length, 0)} proposed plans.`);
