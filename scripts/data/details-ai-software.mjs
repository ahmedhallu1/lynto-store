// Detailed platform descriptions (Egyptian Arabic + English) for AI tools and software.
// Shape: slug → { ar, en, fa, fe, tiers?: { <token found in plan name_en>: [ar, en] } }
// Facts are kept to stable, widely published characteristics; every description ends with a "provider may change" line
// added by the generator, so nothing here is presented as a guarantee of the provider's current terms.
export const DETAILS = {
  'chatgpt-plus': {
    ar: 'ChatGPT هو مساعد الذكاء الاصطناعي من OpenAI بيكتب ويلخّص ويترجم ويحلّل الملفات ويساعدك في البرمجة والتعلّم. خطة Plus بتديك استخدام أوسع بكتير من الخطة المجانية ووصول للموديلات والأدوات المتاحة في الخطة.\n\nمناسبة للطلبة والمستقلين وصنّاع المحتوى وكل واحد بيستخدم ChatGPT يومياً وحاسس إن حدود الخطة المجانية بتقف قدامه.',
    en: 'ChatGPT is the AI assistant from OpenAI that writes, summarises, translates, analyses files and helps with coding and learning. The Plus plan gives far more usage than the free plan and access to the models and tools included in it.\n\nGood for students, freelancers, content creators and anyone who uses ChatGPT daily and keeps hitting the free-plan limits.',
    fa: ['حدود استخدام أعلى من الخطة المجانية', 'الوصول للموديلات المتاحة في الخطة', 'رفع الملفات وتحليلها', 'توليد الصور والأدوات المتاحة في الخطة', 'الوضع الصوتي والمحادثة المستمرة'],
    fe: ['Higher usage limits than the free plan', 'Access to the models included in the plan', 'File upload and analysis', 'Image generation and the tools included in the plan', 'Voice mode and ongoing conversations'],
  },
  'chatgpt-pro': {
    ar: 'ChatGPT Pro هي أعلى خطة لـ ChatGPT، متصمّمة للاستخدام المكثّف والشغل الاحترافي: أعلى حدود استخدام، ووصول لأقوى الموديلات والأوضاع المتاحة في الخطة.\n\nمناسبة للمطوّرين والباحثين والمحترفين اللي بيعتمدوا على ChatGPT طول اليوم في شغل تقيل.',
    en: "ChatGPT Pro is the top ChatGPT plan, built for heavy and professional use: the highest usage limits and access to the most capable models and modes included in the plan.\n\nFor developers, researchers and professionals who rely on ChatGPT all day for demanding work.",
    fa: ['أعلى حدود استخدام في خطط ChatGPT', 'الوصول لأقوى الموديلات والأوضاع في الخطة', 'مناسبة للمهام الطويلة والمعقّدة', 'أولوية في المميزات الجديدة حسب الخطة'],
    fe: ['The highest usage limits of any ChatGPT plan', 'Access to the most capable models and modes in the plan', 'Suited to long, complex tasks', 'Priority on new features as the plan allows'],
  },
  'claude-pro': {
    ar: 'Claude هو مساعد الذكاء الاصطناعي من Anthropic، معروف بالكتابة الدقيقة وفهم المستندات الطويلة والمساعدة في البرمجة. خطة Pro بتديك استخدام أكتر من المجاني ووصول لموديلات Claude المتاحة في الخطة.\n\nمناسبة للكُتّاب والباحثين والمبرمجين اللي بيشتغلوا على مستندات وأكواد طويلة.',
    en: 'Claude is the AI assistant from Anthropic, known for careful writing, long-document understanding and coding help. The Pro plan gives more usage than the free plan and access to the Claude models included in it.\n\nGood for writers, researchers and developers who work with long documents and codebases.',
    fa: ['استخدام أكبر من الخطة المجانية', 'الوصول لموديلات Claude المتاحة في الخطة', 'رفع المستندات والملفات الطويلة', 'مشاريع (Projects) لتنظيم الشغل', 'مميزات الخطة حسب ما تعرضه Anthropic'],
    fe: ['More usage than the free plan', 'Access to the Claude models included in the plan', 'Upload long documents and files', 'Projects to organise your work', 'Plan features as published by Anthropic'],
  },
  'claude-max': {
    ar: 'Claude Max هي خطة Anthropic للاستخدام اليومي المكثّف: حدود استخدام أعلى بكتير من Pro على مستويين، Max 5x و Max 20x، يعني تقريباً 5 أو 20 ضعف استخدام Pro.\n\nمناسبة للمطوّرين اللي بيشتغلوا بـ Claude طول اليوم وللمحترفين اللي حدود Pro مش كفاية ليهم.',
    en: 'Claude Max is the Anthropic plan for heavy daily use: much higher limits than Pro at two levels, Max 5x and Max 20x, roughly 5 or 20 times the usage of Pro.\n\nFor developers who work with Claude all day and professionals for whom Pro limits are not enough.',
    fa: ['حدود استخدام أعلى بكتير من Pro', 'مستويين: Max 5x و Max 20x', 'مناسبة لاستخدام Claude طول اليوم', 'مميزات الخطة حسب Anthropic'],
    fe: ['Much higher limits than Pro', 'Two levels: Max 5x and Max 20x', 'Built for all-day Claude use', 'Plan features as published by Anthropic'],
    tiers: {
      '5x': ['مستوى Max 5x: حوالي 5 أضعاف استخدام Pro. مناسب للاستخدام اليومي المكثّف.', 'Max 5x level: roughly 5 times the usage of Pro. Suited to heavy daily use.'],
      '20x': ['مستوى Max 20x: حوالي 20 ضعف استخدام Pro. للأحمال الأعلى والعمل المستمر طول اليوم.', 'Max 20x level: roughly 20 times the usage of Pro. For the highest workloads and continuous all-day work.'],
    },
  },
  'google-ai-pro': {
    ar: 'Google AI Pro خطة من Google بتفتح مميزات Gemini المتقدمة وبتيجي مع مساحة تخزين Google One كبيرة بتتشارك بين Drive وGmail وPhotos.\n\nمناسبة لمستخدمي Google اليومي اللي عايزين مساعد ذكي جوه أدواتهم ومساحة تخزين إضافية.',
    en: 'Google AI Pro is a Google plan that unlocks advanced Gemini features and comes with a large Google One storage allowance shared across Drive, Gmail and Photos.\n\nGood for everyday Google users who want an AI assistant inside their tools plus extra storage.',
    fa: ['مميزات Gemini المتقدمة', 'مساحة تخزين Google One مشتركة بين Drive وGmail وPhotos', 'حدود استخدام أعلى من المجاني', 'مميزات الخطة حسب ما تعرضه Google'],
    fe: ['Advanced Gemini features', 'Google One storage shared across Drive, Gmail and Photos', 'Higher limits than the free tier', 'Plan features as published by Google'],
  },
  'google-ai-ultra': {
    ar: 'Google AI Ultra هي أعلى خطة ذكاء اصطناعي من Google: أعلى حدود استخدام لمميزات Gemini ووصول مبكّر للمميزات الجديدة حسب الخطة، مع مساحة تخزين كبيرة جداً.\n\nمناسبة للمحترفين والفرق الصغيرة اللي بتستخدم أدوات Google للذكاء الاصطناعي بشكل مكثّف.',
    en: "Google AI Ultra is Google's top AI plan: the highest usage limits for Gemini features and early access to new capabilities as the plan allows, with a very large storage allowance.\n\nFor professionals and small teams that use Google's AI tools intensively.",
    fa: ['أعلى حدود استخدام لمميزات Gemini', 'وصول مبكّر للمميزات الجديدة حسب الخطة', 'مساحة تخزين كبيرة جداً', 'مناسبة للاستخدام الاحترافي المكثّف'],
    fe: ['Highest usage limits for Gemini features', 'Early access to new features as the plan allows', 'A very large storage allowance', 'Suited to intensive professional use'],
  },
  'perplexity-pro': {
    ar: 'Perplexity محرك بحث بالذكاء الاصطناعي بيجاوبك بإجابة مباشرة ومعاها المصادر. خطة Pro بتديك عدد أكبر من عمليات البحث المتقدّم، واختيار بين أكتر من موديل، ورفع ملفات وتحليلها.\n\nمناسبة للطلبة والباحثين وأي حد بيعمل بحث كتير وعايز إجابات موثّقة بسرعة.',
    en: 'Perplexity is an AI search engine that gives direct answers with sources. The Pro plan adds more advanced searches, a choice between several models, and file upload and analysis.\n\nGood for students, researchers and anyone who searches a lot and wants sourced answers fast.',
    fa: ['عدد أكبر من عمليات البحث المتقدّم', 'اختيار بين أكتر من موديل', 'رفع الملفات وتحليلها', 'إجابات معاها مصادر'],
    fe: ['More advanced searches', 'Choice between several models', 'File upload and analysis', 'Answers with cited sources'],
  },
  'midjourney': {
    ar: 'Midjourney خدمة توليد صور بالذكاء الاصطناعي بتحوّل وصفك النصي لصور فنية عالية الجودة، وبتشتغل من خلال موقعها وDiscord. الخطط بتختلف في وقت التوليد السريع وعدد المهام المتزامنة.\n\nمناسبة للمصممين وصنّاع المحتوى والمسوّقين اللي محتاجين صور مبتكرة بسرعة.',
    en: 'Midjourney is an AI image-generation service that turns text prompts into high-quality artwork, available on its website and through Discord. Plans differ in fast generation time and concurrent jobs.\n\nGood for designers, content creators and marketers who need original images quickly.',
    fa: ['توليد صور فنية من وصف نصي', 'وقت توليد سريع حسب الخطة', 'الشغل متاح من الموقع و Discord', 'استخدام تجاري حسب شروط الخدمة'],
    fe: ['Text-to-image artwork generation', 'Fast generation time depends on the plan', 'Works on the website and in Discord', 'Commercial use per the service terms'],
    tiers: {
      Basic: ['خطة Basic: للتجربة والاستخدام الخفيف، وقت توليد سريع محدود شهرياً.', 'Basic: for trying it out and light use, with a limited monthly fast-generation allowance.'],
      Standard: ['خطة Standard: وقت توليد سريع أكبر ووضع Relax غير محدود، مناسبة للاستخدام المنتظم.', 'Standard: more fast time plus unlimited Relax mode, suited to regular use.'],
      Pro: ['خطة Pro: وقت سريع أكبر ووضع Stealth لإخفاء الصور، للمحترفين.', 'Pro: more fast time and Stealth mode to keep images private, for professionals.'],
      Mega: ['خطة Mega: أعلى وقت توليد سريع للأحمال الكبيرة.', 'Mega: the largest fast-generation allowance, for heavy workloads.'],
    },
  },
  'github-copilot': {
    ar: 'GitHub Copilot مساعد برمجة بالذكاء الاصطناعي بيقترح أكواد ويكمّل لك السطر والدالة ويجاوب أسئلتك جوه محرر الكود زي VS Code وJetBrains.\n\nمناسب للمبرمجين اللي عايزين يكتبوا أسرع ويقللوا الشغل المتكرر.',
    en: 'GitHub Copilot is an AI coding assistant that suggests code, completes lines and functions and answers questions inside editors such as VS Code and JetBrains.\n\nGood for developers who want to write faster and cut repetitive work.',
    fa: ['إكمال وتوليد الكود جوه المحرر', 'شات للأسئلة والشرح', 'شغّال مع محررات شهيرة', 'مناسب للمشاريع الشخصية والمهنية'],
    fe: ['Code completion and generation in the editor', 'Chat for questions and explanations', 'Works with popular editors', 'Suited to personal and professional projects'],
  },
  'cursor': {
    ar: 'Cursor محرر كود مبني حوالين الذكاء الاصطناعي: بيفهم مشروعك كله ويكتب ويعدّل كود بأوامر نصية ويشرح الأخطاء. الخطط بتختلف في حدود الاستخدام.\n\nمناسب للمطوّرين اللي عايزين بيئة برمجة بمساعدة الذكاء الاصطناعي من الأساس.',
    en: 'Cursor is an AI-first code editor: it understands your whole project, writes and edits code from instructions and explains errors. Plans differ in usage limits.\n\nGood for developers who want an AI-assisted coding environment from the ground up.',
    fa: ['محرر كود مبني على الذكاء الاصطناعي', 'فهم المشروع كله لا ملف واحد', 'تعديل الكود بأوامر نصية', 'حدود استخدام حسب الخطة'],
    fe: ['An AI-first code editor', 'Understands the whole project, not one file', 'Edit code with plain instructions', 'Usage limits depend on the plan'],
    tiers: {
      Pro: ['خطة Pro: الخطة الأساسية للاستخدام اليومي بحدود موسّعة.', 'Pro: the core plan for daily use with extended limits.'],
      Ultra: ['خطة Ultra: حدود استخدام أعلى بكتير للأحمال المكثّفة.', 'Ultra: much higher limits for heavy workloads.'],
    },
  },
  'supergrok': {
    ar: 'Grok هو مساعد الذكاء الاصطناعي من xAI. SuperGrok خطته المدفوعة بحدود استخدام أعلى ووصول لموديلات ومميزات أقوى حسب الخطة، وHeavy هي الأعلى.\n\nمناسبة لمستخدمي Grok اللي بيحتاجوا استخدام أكتر ومميزات متقدمة.',
    en: "Grok is the AI assistant from xAI. SuperGrok is its paid plan with higher usage limits and access to more capable models and features as the plan allows; Heavy is the top tier.\n\nFor Grok users who need more usage and advanced features.",
    fa: ['حدود استخدام أعلى', 'الوصول لموديلات أقوى حسب الخطة', 'مميزات متقدّمة', 'مستوى Heavy للاستخدام الأعلى'],
    fe: ['Higher usage limits', 'Access to more capable models as the plan allows', 'Advanced features', 'A Heavy tier for the highest use'],
    tiers: {
      SuperGrok: ['خطة SuperGrok: الخطة المدفوعة الأساسية.', 'SuperGrok: the core paid plan.'],
      Heavy: ['خطة Heavy: أعلى مستوى بأعلى حدود استخدام ووصول لأقوى موديلات.', 'Heavy: the top level with the highest limits and the most capable models.'],
    },
  },
  'elevenlabs': {
    ar: 'ElevenLabs منصة تحويل النص لصوت بشري طبيعي واستنساخ الأصوات بالذكاء الاصطناعي بعشرات اللغات. الخطط بتختلف في الرصيد الشهري وإمكانيات استنساخ الصوت.\n\nمناسبة لصنّاع الفيديو والبودكاست والمعلّقين الصوتيين وتطوير الألعاب.',
    en: 'ElevenLabs is a platform for natural-sounding text-to-speech and AI voice cloning in dozens of languages. Plans differ in monthly credits and voice-cloning options.\n\nGood for video creators, podcasters, voice-over work and game development.',
    fa: ['تحويل نص لصوت طبيعي بعدة لغات', 'استنساخ الأصوات حسب الخطة', 'رصيد شهري حسب الخطة', 'مناسب للفيديو والبودكاست'],
    fe: ['Natural text-to-speech in many languages', 'Voice cloning depending on the plan', 'Monthly credit allowance per plan', 'Suited to video and podcasts'],
    tiers: {
      Starter: ['خطة Starter: رصيد شهري صغير للتجربة والمشاريع الخفيفة.', 'Starter: a small monthly credit pool for trying it and light projects.'],
      Creator: ['خطة Creator: رصيد أكبر وإمكانيات استنساخ أوسع لصنّاع المحتوى.', 'Creator: a bigger credit pool and wider cloning options for creators.'],
      Pro: ['خطة Pro: رصيد كبير للإنتاج المنتظم والمشاريع الاحترافية.', 'Pro: a large credit pool for regular production and professional projects.'],
    },
  },
  'runway': {
    ar: 'Runway أدوات توليد وتعديل فيديو بالذكاء الاصطناعي: تحوّل نص أو صورة لفيديو وتعدّل المشاهد وتشيل الخلفيات. الخطط بتختلف في الرصيد الشهري والدقة.\n\nمناسبة لصنّاع الفيديو والمعلنين والمصممين.',
    en: 'Runway offers AI video generation and editing tools: turn text or images into video, edit scenes and remove backgrounds. Plans differ in monthly credits and output quality.\n\nGood for video makers, advertisers and designers.',
    fa: ['توليد فيديو من نص أو صورة', 'أدوات تعديل مشاهد وإزالة خلفية', 'رصيد شهري حسب الخطة', 'مناسبة للإعلانات والمحتوى'],
    fe: ['Generate video from text or images', 'Scene editing and background removal', 'Monthly credits depend on the plan', 'Suited to ads and content'],
    tiers: {
      Standard: ['خطة Standard: رصيد شهري للاستخدام المنتظم.', 'Standard: a monthly credit pool for regular use.'],
      Pro: ['خطة Pro: رصيد أكبر وإمكانيات أعلى للمحترفين.', 'Pro: more credits and higher capabilities for professionals.'],
      Unlimited: ['خطة Unlimited: توليد بلا حدود في وضع الاسترخاء إلى جانب الرصيد الشهري.', 'Unlimited: unlimited relaxed-mode generation alongside the monthly credits.'],
    },
  },
  'suno': {
    ar: 'Suno منصة بتولّد أغاني كاملة (كلمات ولحن وصوت) بالذكاء الاصطناعي من وصف بسيط. الخطط المدفوعة بتديك رصيد أكبر واستخدام تجاري حسب شروط الخدمة.\n\nمناسبة لصنّاع المحتوى والموسيقيين اللي عايزين أفكار وأغاني سريعة.',
    en: 'Suno generates complete songs (lyrics, melody and vocals) with AI from a short description. Paid plans give a larger credit pool and commercial use under the service terms.\n\nGood for creators and musicians who want quick song ideas and tracks.',
    fa: ['توليد أغاني كاملة من وصف', 'رصيد شهري أكبر من المجاني', 'استخدام تجاري حسب شروط الخدمة', 'مناسب للمحتوى والموسيقى'],
    fe: ['Generate full songs from a prompt', 'A larger monthly pool than the free tier', 'Commercial use per the service terms', 'Suited to content and music'],
    tiers: {
      Pro: ['خطة Pro: رصيد شهري يكفي لعدد كبير من الأغاني.', 'Pro: a monthly pool that covers a large number of songs.'],
      Premier: ['خطة Premier: أعلى رصيد شهري للإنتاج المكثّف.', 'Premier: the largest monthly pool for heavy production.'],
    },
  },
  'deepl': {
    ar: 'DeepL Pro خدمة ترجمة بدقة عالية للنصوص والمستندات، بتحافظ على التنسيق وبتدعم لغات كتير، ومعاها أداة DeepL Write لتحسين الكتابة. الخطط بتزيد حدود الاستخدام وإمكانيات المستندات.\n\nمناسبة للطلبة والمترجمين والشركات اللي بتتعامل مع مستندات بلغات مختلفة.',
    en: 'DeepL Pro is a high-accuracy translation service for text and documents that keeps formatting and supports many languages, with DeepL Write for improving your writing. Plans raise usage limits and document capabilities.\n\nGood for students, translators and companies working with documents in several languages.',
    fa: ['ترجمة دقيقة للنصوص والمستندات', 'الحفاظ على تنسيق الملفات', 'DeepL Write لتحسين الكتابة', 'حدود استخدام أعلى حسب الخطة'],
    fe: ['Accurate text and document translation', 'Keeps document formatting', 'DeepL Write to improve writing', 'Higher limits depending on the plan'],
    tiers: {
      Starter: ['خطة Starter: للاستخدام الفردي بحدود مناسبة.', 'Starter: for individual use with reasonable limits.'],
      Advanced: ['خطة Advanced: حدود أعلى وإمكانيات إضافية للاستخدام المكثّف.', 'Advanced: higher limits and extra capabilities for heavier use.'],
    },
  },

  // ===== Software & productivity =====
  'canva-pro': {
    ar: 'Canva أداة تصميم سهلة بتعمل منها بوستات وعروض وفيديوهات ولوجوهات من قوالب جاهزة. خطة Pro بتفتح المحتوى والقوالب المميزة وأدوات زي إزالة الخلفية وتغيير المقاس بضغطة وBrand Kit، مع مساحة تخزين أكبر.\n\nمناسبة لأصحاب المشاريع الصغيرة وصنّاع المحتوى وأي حد بيصمم بشكل منتظم.',
    en: "Canva is an easy design tool for posts, presentations, videos and logos from ready templates. Pro unlocks premium content and templates and tools such as background remover, one-click resize and Brand Kit, with more storage.\n\nGood for small businesses, content creators and anyone who designs regularly.",
    fa: ['قوالب وعناصر مميزة بلا حدود', 'إزالة الخلفية وتغيير المقاس بضغطة', 'Brand Kit للألوان والخطوط واللوجو', 'مساحة تخزين أكبر', 'أدوات تصميم بالذكاء الاصطناعي حسب الخطة'],
    fe: ['Premium templates and elements', 'Background remover and one-click resize', 'Brand Kit for colours, fonts and logo', 'More storage', 'AI design tools as the plan allows'],
  },
  'microsoft-365': {
    ar: 'Microsoft 365 بيجمع تطبيقات Office (Word وExcel وPowerPoint وOutlook وغيرها) مع مساحة تخزين OneDrive ومميزات أمان وتحديثات مستمرة، وبيشتغل على الكمبيوتر والموبايل والويب.\n\nمناسب للطلبة والموظفين والأسر اللي محتاجة أحدث نسخة من Office مع تخزين سحابي.',
    en: 'Microsoft 365 bundles the Office apps (Word, Excel, PowerPoint, Outlook and more) with OneDrive cloud storage, security features and continuous updates, across PC, mobile and web.\n\nGood for students, employees and families who need the latest Office with cloud storage.',
    fa: ['Word وExcel وPowerPoint وOutlook وغيرها', 'مساحة OneDrive سحابية', 'تحديثات مستمرة لأحدث نسخة', 'يشتغل على الكمبيوتر والموبايل والويب'],
    fe: ['Word, Excel, PowerPoint, Outlook and more', 'OneDrive cloud storage', 'Continuous updates to the latest version', 'Works on PC, mobile and web'],
    tiers: {
      Personal: ['خطة Personal: لشخص واحد، مع مساحة OneDrive كبيرة وتطبيقات Office على أجهزته.', 'Personal: for one person, with generous OneDrive storage and Office apps on their devices.'],
      Family: ['خطة Family: لحد 6 أشخاص من الأسرة، ولكل واحد مساحة OneDrive خاصة بيه.', 'Family: for up to 6 family members, each with their own OneDrive storage.'],
    },
  },
  'office-2024': {
    ar: 'Office 2024 نسخة Office بترخيص دائم: بتدفع مرة واحدة وتفضل تستخدمها من غير اشتراك شهري. بتتثبّت على جهاز واحد وبتشتغل بدون إنترنت، لكن من غير التحديثات الجديدة اللي بتيجي مع اشتراك Microsoft 365.\n\nمناسبة للي عايز تطبيقات Office الأساسية لجهاز واحد من غير التزام شهري.',
    en: 'Office 2024 is a perpetual-licence Office: pay once and keep using it with no subscription. It installs on one device and works offline, without the ongoing feature updates that come with a Microsoft 365 subscription.\n\nFor anyone who wants the core Office apps on a single device with no monthly commitment.',
    fa: ['ترخيص دائم من غير اشتراك شهري', 'بيتثبّت على جهاز واحد', 'بيشتغل بدون إنترنت', 'تطبيقات Office الأساسية'],
    fe: ['Perpetual licence, no monthly fee', 'Installs on one device', 'Works offline', 'The core Office apps'],
    tiers: {
      'Home & Business': ['نسخة Home & Business: تطبيقات Office الأساسية مع Outlook وترخيص للاستخدام التجاري.', 'Home & Business: the core Office apps plus Outlook and a licence for commercial use.'],
      'Professional Plus': ['نسخة Professional Plus: النسخة الأوسع، بتزود تطبيقات إضافية للمحترفين والشركات.', 'Professional Plus: the broadest edition, adding extra apps for professionals and businesses.'],
      Home: ['نسخة Home: تطبيقات Office الأساسية للاستخدام الشخصي والمنزلي.', 'Home: the core Office apps for personal and home use.'],
    },
  },
  'windows-11': {
    ar: 'ترخيص تفعيل لنظام Windows 11 بيحوّل النسخة لنسخة مفعّلة رسمياً وبيفتح التخصيص والتحديثات. بتختار بين Home للاستخدام المنزلي وPro اللي بيضيف مميزات للشغل والأمان.\n\nمناسب للي بيركّب ويندوز جديد أو عنده نسخة غير مفعّلة.',
    en: 'A Windows 11 activation licence that turns your installation into a properly activated copy and unlocks personalisation and updates. Choose Home for everyday use or Pro, which adds work and security features.\n\nGood for anyone installing Windows fresh or running an unactivated copy.',
    fa: ['تفعيل رسمي لنظام Windows 11', 'ترخيص لجهاز واحد', 'نسختين: Home أو Pro', 'مفتاح مع خطوات التفعيل'],
    fe: ['Genuine Windows 11 activation', 'Licence for one device', 'Two editions: Home or Pro', 'Key delivered with activation steps'],
    tiers: {
      Home: ['نسخة Home: للاستخدام الشخصي والمنزلي اليومي.', 'Home: for everyday personal and home use.'],
      Pro: ['نسخة Pro: بتضيف BitLocker وسطح المكتب البعيد وربط الدومين وHyper-V للشغل المتقدّم.', 'Pro: adds BitLocker, Remote Desktop host, domain join and Hyper-V for advanced work.'],
    },
  },
  'adobe-creative-cloud': {
    ar: 'Adobe Creative Cloud (All Apps) بيفتح مجموعة برامج Adobe الإبداعية كلها: Photoshop وIllustrator وPremiere Pro وAfter Effects وAcrobat وغيرهم، مع تخزين سحابي وخطوط وأصول.\n\nمناسب للمصممين وصنّاع الفيديو والوكالات اللي بتستخدم أكتر من برنامج Adobe.',
    en: 'Adobe Creative Cloud (All Apps) unlocks the whole Adobe creative suite: Photoshop, Illustrator, Premiere Pro, After Effects, Acrobat and more, with cloud storage, fonts and assets.\n\nGood for designers, video creators and agencies that use more than one Adobe app.',
    fa: ['كل برامج Adobe الإبداعية', 'Photoshop وIllustrator وPremiere Pro وAfter Effects', 'تخزين سحابي وخطوط', 'تحديثات مستمرة'],
    fe: ['The whole Adobe creative suite', 'Photoshop, Illustrator, Premiere Pro, After Effects', 'Cloud storage and fonts', 'Continuous updates'],
  },
  'adobe-photoshop': {
    ar: 'Photoshop هو المعيار العالمي لتعديل الصور والتصميم: طبقات وتحديد وتنقيح وأدوات ذكاء اصطناعي لتعديل الصور وتوسيعها.\n\nمناسب للمصممين والمصورين وصنّاع المحتوى.',
    en: "Photoshop is the industry standard for photo editing and design: layers, selection, retouching and AI tools for editing and extending images.\n\nGood for designers, photographers and content creators.",
    fa: ['تعديل صور وتصميم احترافي', 'طبقات وتحديد وتنقيح', 'أدوات ذكاء اصطناعي للتعديل', 'تخزين سحابي حسب الخطة'],
    fe: ['Professional photo editing and design', 'Layers, selection and retouching', 'AI-powered editing tools', 'Cloud storage as the plan allows'],
  },
  'adobe-premiere-pro': {
    ar: 'Premiere Pro برنامج مونتاج فيديو احترافي: تحرير على خط زمني وتصحيح ألوان وصوت ومؤثرات، ومتكامل مع After Effects وبقية برامج Adobe.\n\nمناسب لصنّاع الفيديو والمونتيرين والقنوات.',
    en: 'Premiere Pro is professional video-editing software: timeline editing, colour and audio correction and effects, integrated with After Effects and other Adobe apps.\n\nGood for video makers, editors and channels.',
    fa: ['مونتاج فيديو احترافي', 'تصحيح ألوان وصوت', 'تكامل مع After Effects', 'يدعم مشاريع كبيرة'],
    fe: ['Professional video editing', 'Colour and audio correction', 'Integrates with After Effects', 'Handles large projects'],
  },
  'adobe-acrobat-pro': {
    ar: 'Acrobat Pro لتعديل وإنشاء ودمج وتوقيع ملفات PDF، وتحويلها لـ Word وExcel، وحماية الملفات بكلمة سر.\n\nمناسب للموظفين والطلبة والمكاتب اللي بتتعامل مع PDF يومياً.',
    en: 'Acrobat Pro edits, creates, merges and signs PDF files, converts them to Word and Excel, and protects files with passwords.\n\nGood for employees, students and offices that handle PDFs daily.',
    fa: ['تعديل ودمج ملفات PDF', 'التحويل لـ Word وExcel', 'التوقيع الإلكتروني', 'حماية الملفات بكلمة سر'],
    fe: ['Edit and merge PDF files', 'Convert to Word and Excel', 'E-signatures', 'Password-protect files'],
  },
  'figma': {
    ar: 'Figma أداة تصميم واجهات وتعاون جماعي بتشتغل من المتصفح: تصميم وبروتوتايب وتعليقات لحظية بين الفريق. خطة Professional بتفتح ملفات وإمكانيات أكتر للفرق.\n\nمناسبة لمصممي UI/UX والمطوّرين والفرق.',
    en: 'Figma is a browser-based UI design and collaboration tool: design, prototyping and live comments across a team. The Professional plan unlocks more files and team capabilities.\n\nGood for UI/UX designers, developers and teams.',
    fa: ['تصميم واجهات وبروتوتايب', 'تعاون لحظي بين الفريق', 'مكتبات مشتركة للفريق', 'بيشتغل من المتصفح'],
    fe: ['UI design and prototyping', 'Real-time team collaboration', 'Shared team libraries', 'Runs in the browser'],
  },
  'notion': {
    ar: 'Notion مساحة شغل واحدة للملاحظات والمهام وقواعد البيانات والمعرفة. خطة Plus بتفتح رفع ملفات أكبر وسجل تعديلات أطول وتعاون أوسع.\n\nمناسبة للطلبة والمستقلين والفرق الصغيرة.',
    en: 'Notion is a single workspace for notes, tasks, databases and knowledge. The Plus plan unlocks larger uploads, longer page history and wider collaboration.\n\nGood for students, freelancers and small teams.',
    fa: ['ملاحظات ومهام وقواعد بيانات في مكان واحد', 'رفع ملفات أكبر', 'سجل تعديلات أطول', 'تعاون مع الفريق والضيوف'],
    fe: ['Notes, tasks and databases in one place', 'Larger file uploads', 'Longer page history', 'Collaboration with team and guests'],
  },
  'grammarly': {
    ar: 'Grammarly Premium مساعد كتابة بالإنجليزي بيصحّح القواعد والإملاء ويقترح تحسين الوضوح والأسلوب ويكتشف الانتحال، وبيشتغل في المتصفح والتطبيقات.\n\nمناسب للطلبة والموظفين وأي حد بيكتب إيميلات وتقارير بالإنجليزي.',
    en: 'Grammarly Premium is an English writing assistant that fixes grammar and spelling, suggests clarity and tone improvements and checks for plagiarism, across browsers and apps.\n\nGood for students, employees and anyone who writes emails and reports in English.',
    fa: ['تصحيح القواعد والإملاء', 'تحسين الوضوح والأسلوب', 'كشف الانتحال', 'بيشتغل في المتصفح والتطبيقات'],
    fe: ['Grammar and spelling correction', 'Clarity and tone suggestions', 'Plagiarism checking', 'Works in browsers and apps'],
  },
  'google-one': {
    ar: 'Google One بيوسّع مساحة حساب Google الخاصة بيك (Drive وGmail وPhotos) لحد 2 تيرا، ومعاها مميزات إضافية في Photos وإمكانية مشاركة المساحة مع الأسرة.\n\nمناسب لو مساحتك الحالية بتخلص أو عايز تحتفظ بصورك وملفاتك كلها في مكان واحد.',
    en: 'Google One expands your Google account storage (Drive, Gmail and Photos) up to 2 TB, with extra Photos features and the option to share the space with your family.\n\nGood if your current storage is running out or you want all your photos and files in one place.',
    fa: ['2 تيرا مساحة مشتركة بين Drive وGmail وPhotos', 'مميزات إضافية في Photos', 'مشاركة المساحة مع الأسرة', 'نسخ احتياطي للصور والملفات'],
    fe: ['2 TB shared across Drive, Gmail and Photos', 'Extra Photos features', 'Share the space with family', 'Backup for photos and files'],
  },
  'icloud-plus': {
    ar: 'iCloud+ بيكبّر مساحة iCloud لحساب Apple (نسخ احتياطي للصور والأجهزة والملفات) وبيضيف مميزات خصوصية زي Hide My Email وiCloud Private Relay، وبيتشارك مع الأسرة.\n\nمناسب لمستخدمي iPhone وMac اللي مساحتهم خلصت.',
    en: 'iCloud+ expands iCloud storage for your Apple Account (backups for photos, devices and files) and adds privacy features such as Hide My Email and iCloud Private Relay, and can be shared with family.\n\nGood for iPhone and Mac users who have run out of space.',
    fa: ['نسخ احتياطي للصور والأجهزة والملفات', 'Hide My Email وiCloud Private Relay', 'المشاركة مع الأسرة', 'مساحات 200 جيجا و 2 تيرا'],
    fe: ['Backups for photos, devices and files', 'Hide My Email and iCloud Private Relay', 'Family sharing', '200 GB and 2 TB options'],
  },
  'dropbox': {
    ar: 'Dropbox لتخزين ومزامنة ومشاركة الملفات بين كل أجهزتك، مع استرجاع الملفات المحذوفة ونقل ملفات كبيرة. خطة Plus بتديك مساحة كبيرة وإمكانيات إضافية.\n\nمناسب للمستقلين اللي بيشاركوا ملفات كبيرة مع العملاء.',
    en: 'Dropbox stores, syncs and shares files across all your devices, with deleted-file recovery and large transfers. The Plus plan gives a large storage allowance and extra capabilities.\n\nGood for freelancers who share large files with clients.',
    fa: ['مزامنة الملفات بين الأجهزة', 'مساحة تخزين كبيرة', 'استرجاع الملفات المحذوفة', 'مشاركة ملفات كبيرة بسهولة'],
    fe: ['Sync files across devices', 'A large storage allowance', 'Deleted-file recovery', 'Easy sharing of large files'],
  },
  'nordvpn': {
    ar: 'NordVPN خدمة VPN بتشفّر اتصالك وتخفي عنوانك وتفتح محتوى بحسب المنطقة، وفيها حماية من المواقع الضارة ودعم لأجهزة كتير في نفس الوقت.\n\nمناسب للي عايز خصوصية أكتر على الشبكات العامة وأمان أثناء التصفح.',
    en: 'NordVPN is a VPN that encrypts your connection, hides your address and helps you reach region-based content, with protection from malicious sites and support for multiple devices at once.\n\nGood for anyone who wants more privacy on public networks and safer browsing.',
    fa: ['تشفير الاتصال وإخفاء العنوان', 'خوادم في دول كتير', 'حماية من المواقع الضارة', 'عدة أجهزة في نفس الوقت'],
    fe: ['Connection encryption and IP masking', 'Servers in many countries', 'Protection from malicious sites', 'Several devices at once'],
  },
  'expressvpn': {
    ar: 'ExpressVPN خدمة VPN سريعة بتركّز على الخصوصية والسرعة، بخوادم في دول كتير وتطبيقات سهلة على كل الأجهزة.\n\nمناسب للي محتاج اتصال سريع ومستقر مع خصوصية.',
    en: 'ExpressVPN is a fast VPN focused on privacy and speed, with servers in many countries and easy apps for all devices.\n\nGood for anyone who needs a fast, stable connection with privacy.',
    fa: ['سرعة عالية واتصال مستقر', 'خوادم في دول كتير', 'تطبيقات سهلة لكل الأجهزة', 'تشفير الاتصال'],
    fe: ['High speed and stable connections', 'Servers in many countries', 'Simple apps for every device', 'Connection encryption'],
  },
  'surfshark': {
    ar: 'Surfshark خدمة VPN بتسمح باستخدام عدد أجهزة غير محدود على نفس الحساب حسب الخطة، مع حجب الإعلانات والمواقع الضارة وخوادم في دول كتير.\n\nمناسب للأسر وأي حد عنده أجهزة كتير.',
    en: 'Surfshark is a VPN that allows an unlimited number of devices on one account depending on the plan, with ad and malicious-site blocking and servers in many countries.\n\nGood for families and anyone with many devices.',
    fa: ['عدد أجهزة غير محدود حسب الخطة', 'حجب الإعلانات والمواقع الضارة', 'خوادم في دول كتير', 'تشفير الاتصال'],
    fe: ['Unlimited devices depending on the plan', 'Ad and malicious-site blocking', 'Servers in many countries', 'Connection encryption'],
  },
  '1password': {
    ar: '1Password مدير كلمات سر آمن بيحفظ كلمات السر والـ passkeys والملفات الحساسة ويملاها تلقائياً، وبينبّهك لكلمات السر الضعيفة أو المسرّبة.\n\nمناسب لأي حد عنده حسابات كتير وعايز أمان من غير ما يحفظ كلها.',
    en: '1Password is a secure password manager that stores passwords, passkeys and sensitive files and fills them automatically, warning you about weak or leaked passwords.\n\nGood for anyone with many accounts who wants security without memorising everything.',
    fa: ['حفظ كلمات السر والـ passkeys', 'ملء تلقائي على الأجهزة', 'تنبيهات لكلمات السر الضعيفة أو المسرّبة', 'مشاركة آمنة حسب الخطة'],
    fe: ['Stores passwords and passkeys', 'Autofill across devices', 'Alerts for weak or leaked passwords', 'Secure sharing depending on the plan'],
    tiers: {
      Individual: ['خطة Individual: لشخص واحد.', 'Individual: for one person.'],
      Families: ['خطة Families: لحد 5 أفراد من الأسرة مع مخازن مشتركة.', 'Families: for up to 5 family members with shared vaults.'],
    },
  },
  'jetbrains': {
    ar: 'JetBrains أدوات برمجة احترافية زي IntelliJ IDEA وPyCharm وWebStorm، مشهورة بإكمال الكود الذكي وأدوات إعادة الهيكلة والتصحيح. الاشتراك بيفتح أحدث إصدارات الأدوات.\n\nمناسب للمطوّرين المحترفين والفرق.',
    en: 'JetBrains makes professional developer tools such as IntelliJ IDEA, PyCharm and WebStorm, known for smart code completion, refactoring and debugging. A subscription unlocks the latest releases.\n\nGood for professional developers and teams.',
    fa: ['IDE احترافية لعدة لغات', 'إكمال كود ذكي وإعادة هيكلة', 'أدوات تصحيح قوية', 'تحديثات مستمرة'],
    fe: ['Professional IDEs for many languages', 'Smart completion and refactoring', 'Powerful debugging tools', 'Continuous updates'],
    tiers: {
      'IntelliJ IDEA': ['اشتراك IntelliJ IDEA: بيئة التطوير الأشهر لـ Java وKotlin ومشاريع كبيرة.', 'IntelliJ IDEA: the popular IDE for Java, Kotlin and large projects.'],
      'All Products Pack': ['حزمة All Products Pack: كل أدوات JetBrains (IntelliJ وPyCharm وWebStorm وغيرها) في اشتراك واحد.', 'All Products Pack: every JetBrains IDE (IntelliJ, PyCharm, WebStorm and more) in one subscription.'],
    },
  },
  'autodesk-fusion': {
    ar: 'Autodesk Fusion منصة تصميم هندسي ثلاثي الأبعاد بتجمع CAD وCAM وCAE في مكان واحد للتصميم والمحاكاة والتصنيع، مع تعاون سحابي.\n\nمناسبة للمهندسين ومصممي المنتجات وأصحاب الورش.',
    en: 'Autodesk Fusion is a 3D engineering platform combining CAD, CAM and CAE in one place for design, simulation and manufacturing, with cloud collaboration.\n\nGood for engineers, product designers and workshop owners.',
    fa: ['تصميم ثلاثي الأبعاد CAD', 'تصنيع CAM ومحاكاة CAE', 'تعاون سحابي', 'للاستخدام المهني'],
    fe: ['3D CAD design', 'CAM manufacturing and CAE simulation', 'Cloud collaboration', 'For professional use'],
  },
  'coursera-plus': {
    ar: 'Coursera Plus اشتراك بيفتح آلاف الكورسات والتخصصات والشهادات المهنية من جامعات وشركات عالمية، مع شهادة إتمام للي بتخلّصه.\n\nمناسب للي عايز يتعلم مهارات جديدة أو يغيّر مساره المهني.',
    en: 'Coursera Plus is a subscription that unlocks thousands of courses, specialisations and professional certificates from global universities and companies, with a completion certificate for what you finish.\n\nGood for anyone learning new skills or changing career path.',
    fa: ['آلاف الكورسات والتخصصات', 'شهادات مهنية من جهات عالمية', 'شهادة إتمام', 'تعلّم بالسرعة اللي تناسبك'],
    fe: ['Thousands of courses and specialisations', 'Professional certificates from global providers', 'Completion certificates', 'Learn at your own pace'],
  },
  'duolingo-super': {
    ar: 'Duolingo Super بيشيل الإعلانات وبيديك محاولات غير محدودة ومراجعة الأخطاء وتدريب ذكي لتعلّم اللغات بشكل أسرع وأمتع.\n\nمناسب للي بيتعلم لغة جديدة بانتظام.',
    en: 'Duolingo Super removes ads and gives unlimited hearts, mistake review and smart practice to learn languages faster and more enjoyably.\n\nGood for anyone learning a new language regularly.',
    fa: ['من غير إعلانات', 'محاولات غير محدودة', 'مراجعة الأخطاء', 'تدريب ذكي حسب مستواك'],
    fe: ['No ads', 'Unlimited hearts', 'Mistake review', 'Smart practice at your level'],
  },
  'zoom-pro': {
    ar: 'Zoom Pro بيرفع حدود الاجتماعات لوقت أطول وعدد مشاركين أكبر مع تسجيل سحابي وتحكم أفضل في الاجتماعات.\n\nمناسب للمدرّسين والمستقلين والفرق الصغيرة.',
    en: 'Zoom Pro raises meeting limits to longer sessions and more participants with cloud recording and better meeting control.\n\nGood for teachers, freelancers and small teams.',
    fa: ['اجتماعات أطول من الخطة المجانية', 'عدد مشاركين أكبر', 'تسجيل سحابي', 'تحكم أفضل في الاجتماعات'],
    fe: ['Longer meetings than the free plan', 'More participants', 'Cloud recording', 'Better meeting controls'],
  },
};
