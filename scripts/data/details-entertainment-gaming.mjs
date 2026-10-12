// Detailed descriptions for entertainment subscriptions, gift cards and game top-ups (see details-ai-software.mjs for the shape).
export const DETAILS = {
  'netflix': {
    ar: 'Netflix منصة مشاهدة مسلسلات وأفلام ووثائقيات وأنمي وبرامج أصلية بدون إعلانات في الخطط المدفوعة، وبتشتغل على التلفزيون والموبايل والكمبيوتر. الفرق بين الخطط في جودة الصورة وعدد الشاشات المتزامنة.\n\nمناسب للأسر ومحبّي المسلسلات اللي عايزين مكتبة كبيرة ومحتوى أصلي.',
    en: 'Netflix streams series, films, documentaries, anime and originals without ads on the paid plans, on TV, mobile and computer. Plans differ in picture quality and the number of simultaneous screens.\n\nGood for families and series fans who want a large library and original content.',
    fa: ['مسلسلات وأفلام وأنمي وبرامج أصلية', 'بيشتغل على التلفزيون والموبايل والكمبيوتر', 'تنزيل للمشاهدة بدون إنترنت', 'ملفات شخصية لكل فرد'],
    fe: ['Series, films, anime and originals', 'Works on TV, mobile and computer', 'Downloads for offline viewing', 'Separate profiles for each person'],
    tiers: {
      Standard: ['خطة Standard: جودة Full HD وبتسمح بمشاهدة على شاشتين في نفس الوقت.', 'Standard: Full HD quality and streaming on two screens at the same time.'],
      Premium: ['خطة Premium: جودة 4K مع HDR وصوت مكاني، وبتسمح بمشاهدة على 4 شاشات في نفس الوقت.', 'Premium: 4K with HDR and spatial audio, and streaming on four screens at once.'],
    },
  },
  'spotify-premium': {
    ar: 'Spotify Premium بيشيل الإعلانات وبيديك تخطي غير محدود وتنزيل الأغاني للاستماع بدون إنترنت وجودة صوت أعلى، على كل أجهزتك.\n\nمناسب لعشّاق الموسيقى والبودكاست اللي عايزين تجربة بدون مقاطعة.',
    en: 'Spotify Premium removes ads and gives unlimited skips, downloads for offline listening and higher audio quality, on all your devices.\n\nGood for music and podcast fans who want an uninterrupted experience.',
    fa: ['من غير إعلانات', 'تخطي غير محدود', 'تنزيل للاستماع بدون إنترنت', 'جودة صوت أعلى'],
    fe: ['No ads', 'Unlimited skips', 'Downloads for offline listening', 'Higher audio quality'],
    tiers: {
      Individual: ['خطة Individual: حساب شخصي لمستخدم واحد.', 'Individual: a personal account for one user.'],
      Duo: ['خطة Duo: لشخصين، كل واحد بحسابه، وبتتفعّل بدعوة.', 'Duo: for two people, each with their own account, activated by invitation.'],
      Family: ['خطة Family: لحد 6 أفراد من الأسرة، كل واحد بحسابه، وبتتفعّل بدعوة.', 'Family: for up to 6 family members, each with their own account, activated by invitation.'],
    },
  },
  'youtube-premium': {
    ar: 'YouTube Premium بيشيل الإعلانات من الفيديوهات وبيديك تشغيل في الخلفية وتنزيل الفيديوهات، ومعاه YouTube Music Premium للموسيقى بدون إعلانات.\n\nمناسب لأي حد بيقضي وقت كبير على يوتيوب والموسيقى.',
    en: 'YouTube Premium removes ads from videos and adds background play and downloads, with YouTube Music Premium included for ad-free music.\n\nGood for anyone who spends a lot of time on YouTube and music.',
    fa: ['فيديوهات من غير إعلانات', 'تشغيل في الخلفية', 'تنزيل الفيديوهات', 'YouTube Music Premium'],
    fe: ['Ad-free videos', 'Background play', 'Video downloads', 'YouTube Music Premium included'],
    tiers: {
      Individual: ['خطة Individual: على حسابك الشخصي.', 'Individual: on your own account.'],
      Family: ['خطة Family: لحد 5 أفراد من الأسرة، بتتفعّل بدعوة.', 'Family: for up to 5 family members, activated by invitation.'],
    },
  },
  'shahid-vip': {
    ar: 'Shahid VIP منصة عربية بتعرض مسلسلات وأفلام عربية وعالمية وبرامج وقنوات مباشرة من غير إعلانات في خطة VIP، على الموبايل والتلفزيون والكمبيوتر.\n\nمناسب لمتابعي الدراما العربية والبرامج.',
    en: 'Shahid VIP is an Arabic streaming platform with Arabic and international series, films, shows and live channels, ad-free on the VIP plan, on mobile, TV and computer.\n\nGood for fans of Arabic drama and shows.',
    fa: ['مسلسلات وأفلام عربية وعالمية', 'قنوات مباشرة', 'من غير إعلانات في VIP', 'على الموبايل والتلفزيون والكمبيوتر'],
    fe: ['Arabic and international series and films', 'Live channels', 'Ad-free on VIP', 'On mobile, TV and computer'],
  },
  'disney-plus': {
    ar: 'Disney+ بيجمع ديزني وبيكسار ومارفل وستار وورز وناشيونال جيوغرافيك في مكان واحد، بجودة عالية للأسرة كلها.\n\nمناسب للأسر ومحبّي الأفلام والمسلسلات الأصلية.',
    en: 'Disney+ brings Disney, Pixar, Marvel, Star Wars and National Geographic together in one place, in high quality for the whole family.\n\nGood for families and fans of original films and series.',
    fa: ['ديزني وبيكسار ومارفل وستار وورز', 'ناشيونال جيوغرافيك', 'جودة عالية', 'ملفات شخصية للأسرة'],
    fe: ['Disney, Pixar, Marvel, Star Wars', 'National Geographic', 'High quality streaming', 'Family profiles'],
  },
  'hbo-max': {
    ar: 'HBO Max منصة بتقدّم مسلسلات HBO الأصلية وأفلام Warner Bros وبرامج وثائقية، بجودة عالية على أجهزة كتير.\n\nمناسب لعشّاق الدراما والأفلام السينمائية.',
    en: 'HBO Max offers original HBO series, Warner Bros films and documentaries in high quality on many devices.\n\nGood for fans of drama and cinema.',
    fa: ['مسلسلات HBO الأصلية', 'أفلام Warner Bros', 'وثائقيات', 'جودة عالية على أجهزة كتير'],
    fe: ['Original HBO series', 'Warner Bros films', 'Documentaries', 'High quality on many devices'],
  },
  'amazon-prime': {
    ar: 'Amazon Prime Video بيعرض أفلام ومسلسلات أصلية وعالمية، مع إمكانية التنزيل للمشاهدة بدون إنترنت على أجهزة كتير.\n\nمناسب لمحبّي المحتوى الأصلي والأفلام الحديثة.',
    en: 'Amazon Prime Video streams original and international films and series, with downloads for offline viewing on many devices.\n\nGood for fans of original content and recent films.',
    fa: ['أفلام ومسلسلات أصلية وعالمية', 'تنزيل بدون إنترنت', 'يشتغل على أجهزة كتير', 'جودة عالية'],
    fe: ['Original and international films and series', 'Offline downloads', 'Works on many devices', 'High quality'],
  },
  'apple-music': {
    ar: 'Apple Music بتديك ملايين الأغاني بدون إعلانات وبجودة Lossless وصوت مكاني Dolby Atmos، وبتشتغل على كل أجهزة Apple وAndroid.\n\nمناسب لمحبّي الموسيقى وأجهزة Apple.',
    en: 'Apple Music gives millions of songs ad-free with Lossless quality and Dolby Atmos spatial audio, on Apple and Android devices.\n\nGood for music lovers and Apple device owners.',
    fa: ['ملايين الأغاني من غير إعلانات', 'جودة Lossless', 'صوت مكاني Dolby Atmos', 'تنزيل للاستماع بدون إنترنت'],
    fe: ['Millions of songs, ad-free', 'Lossless quality', 'Dolby Atmos spatial audio', 'Offline downloads'],
  },
  'apple-tv-plus': {
    ar: 'Apple TV+ بتعرض مسلسلات وأفلام Apple الأصلية بجودة 4K وHDR، على أجهزة Apple والتلفزيونات الذكية.\n\nمناسب لعشّاق الإنتاجات الأصلية عالية الجودة.',
    en: "Apple TV+ streams Apple's original series and films in 4K and HDR on Apple devices and smart TVs.\n\nGood for fans of high-quality original productions.",
    fa: ['مسلسلات وأفلام Apple الأصلية', 'جودة 4K وHDR', 'على أجهزة Apple والتلفزيونات الذكية', 'مشاركة مع الأسرة'],
    fe: ['Apple original series and films', '4K and HDR quality', 'On Apple devices and smart TVs', 'Family sharing'],
  },
  'anghami-plus': {
    ar: 'Anghami Plus منصة موسيقى عربية وعالمية بتديك أغاني بدون إعلانات وتنزيل للاستماع بدون إنترنت وجودة صوت أعلى.\n\nمناسب لمحبّي الموسيقى العربية.',
    en: 'Anghami Plus is an Arabic and international music platform with ad-free songs, offline downloads and higher audio quality.\n\nGood for fans of Arabic music.',
    fa: ['موسيقى عربية وعالمية', 'من غير إعلانات', 'تنزيل بدون إنترنت', 'جودة صوت أعلى'],
    fe: ['Arabic and international music', 'Ad-free', 'Offline downloads', 'Higher audio quality'],
  },
  'osn-plus': {
    ar: 'OSN+ بتقدّم مسلسلات وأفلام عربية وعالمية ومحتوى HBO وبرامج مميزة، مع تجربة مشاهدة بجودة عالية.\n\nمناسب لمتابعي الدراما والأفلام العالمية.',
    en: 'OSN+ offers Arabic and international series and films, HBO content and standout shows, in a high-quality viewing experience.\n\nGood for fans of drama and international films.',
    fa: ['مسلسلات وأفلام عربية وعالمية', 'محتوى HBO', 'برامج مميزة', 'جودة مشاهدة عالية'],
    fe: ['Arabic and international series and films', 'HBO content', 'Standout shows', 'High-quality viewing'],
  },
  'crunchyroll': {
    ar: 'Crunchyroll أكبر مكتبة أنمي: حلقات جديدة بعد عرضها في اليابان بوقت قصير، من غير إعلانات في الخطط المدفوعة، بترجمات متعددة.\n\nمناسب لمحبّي الأنمي والمانجا.',
    en: 'Crunchyroll is the largest anime library: new episodes shortly after they air in Japan, ad-free on paid plans, with multiple subtitle languages.\n\nGood for anime and manga fans.',
    fa: ['أكبر مكتبة أنمي', 'حلقات جديدة بعد عرضها باليابان بوقت قصير', 'من غير إعلانات', 'ترجمات متعددة'],
    fe: ['The largest anime library', 'New episodes soon after Japan airs them', 'Ad-free', 'Multiple subtitle languages'],
    tiers: {
      'Mega Fan': ['خطة Mega Fan: عدد شاشات أكبر وتنزيل للمشاهدة بدون إنترنت.', 'Mega Fan: more simultaneous streams and offline viewing.'],
      Fan: ['خطة Fan: من غير إعلانات وبشاشة واحدة في الوقت الواحد.', 'Fan: ad-free with one stream at a time.'],
    },
  },
  'xbox-game-pass': {
    ar: 'Xbox Game Pass بيديك مكتبة ألعاب بتتجدد باستمرار بدل ما تشتري كل لعبة لوحدها. المستويات بتختلف حسب المنصة: Core للعب أونلاين وعدد من الألعاب، PC لألعاب الكمبيوتر، وUltimate بيجمع الكونسول والكمبيوتر والـ Cloud.\n\nمناسب للاعبين اللي بيجربوا ألعاب كتير.',
    en: 'Xbox Game Pass gives a constantly refreshed game library instead of buying each title. Tiers differ by platform: Core for online play and a set of games, PC for computer games, and Ultimate combining console, PC and Cloud.\n\nGood for players who try many games.',
    fa: ['مكتبة ألعاب بتتجدد باستمرار', 'مستويات: Core وPC وUltimate', 'ألعاب جديدة بعد إصدارها حسب المستوى', 'لعب سحابي في Ultimate'],
    fe: ['A constantly refreshed game library', 'Tiers: Core, PC and Ultimate', 'New releases on day one depending on tier', 'Cloud gaming in Ultimate'],
    tiers: {
      Core: ['مستوى Core: لعب أونلاين على الكونسول مع مجموعة ألعاب مختارة.', 'Core: online console play with a selection of games.'],
      PC: ['مستوى PC: مكتبة ألعاب الكمبيوتر.', 'PC: the PC game library.'],
      Ultimate: ['مستوى Ultimate: الكونسول والكمبيوتر واللعب السحابي مع مميزات إضافية.', 'Ultimate: console, PC and cloud gaming with extra perks.'],
    },
  },
  'playstation-plus': {
    ar: 'PlayStation Plus اشتراك بيفتح اللعب الأونلاين وألعاب شهرية وتخزين سحابي وخصومات. المستويات: Essential الأساسي، Extra بيضيف مكتبة ألعاب كبيرة، وDeluxe بيضيف ألعاب كلاسيكية وتجارب مجانية.\n\nمناسب لمستخدمي PlayStation.',
    en: 'PlayStation Plus unlocks online play, monthly games, cloud saves and discounts. Tiers: Essential is the base, Extra adds a large game catalogue, and Deluxe adds classic games and trials.\n\nGood for PlayStation owners.',
    fa: ['اللعب الأونلاين', 'ألعاب شهرية وتخزين سحابي', 'خصومات على المتجر', 'مستويات Essential وExtra وDeluxe'],
    fe: ['Online multiplayer', 'Monthly games and cloud saves', 'Store discounts', 'Essential, Extra and Deluxe tiers'],
    tiers: {
      Essential: ['مستوى Essential: اللعب الأونلاين وألعاب شهرية وتخزين سحابي وخصومات.', 'Essential: online play, monthly games, cloud saves and discounts.'],
      Extra: ['مستوى Extra: كل مميزات Essential مع مكتبة ألعاب كبيرة.', 'Extra: everything in Essential plus a large game catalogue.'],
      Deluxe: ['مستوى Deluxe: كل مميزات Extra مع ألعاب كلاسيكية وتجارب مجانية.', 'Deluxe: everything in Extra plus classic games and trials.'],
    },
  },
  'nintendo-switch-online': {
    ar: 'Nintendo Switch Online بيفتح اللعب الأونلاين وتخزين الحفظ السحابي ومكتبة ألعاب كلاسيكية من أجيال Nintendo القديمة. باقة Expansion Pack بتضيف ألعاب أحدث وإضافات خاصة.\n\nمناسب لمستخدمي Nintendo Switch.',
    en: 'Nintendo Switch Online unlocks online play, cloud saves and a library of classic games from earlier Nintendo generations. The Expansion Pack adds newer classics and special add-ons.\n\nGood for Nintendo Switch owners.',
    fa: ['اللعب الأونلاين', 'حفظ سحابي', 'مكتبة ألعاب كلاسيكية', 'Expansion Pack بإضافات أكتر'],
    fe: ['Online play', 'Cloud saves', 'A classic games library', 'Expansion Pack adds more'],
    tiers: {
      Individual: ['باقة Individual: لشخص واحد بالمميزات الأساسية.', 'Individual: for one person with the core features.'],
      'Expansion Pack': ['باقة Expansion Pack: بتضيف ألعاب أحدث وإضافات خاصة.', 'Expansion Pack: adds newer classics and special add-ons.'],
    },
  },
  'discord-nitro': {
    ar: 'Discord Nitro بيحسّن تجربتك على Discord: رفع ملفات أكبر وإيموجي مخصص في أي مكان وبث بجودة أعلى وتخصيص للبروفايل وتعزيز السيرفرات. Nitro Basic بيدّي جزء من المميزات.\n\nمناسب لمجتمعات الألعاب والمستخدمين النشطين.',
    en: 'Discord Nitro upgrades your Discord experience: larger uploads, custom emoji anywhere, higher-quality streaming, profile customisation and server boosts. Nitro Basic gives part of the perks.\n\nGood for gaming communities and active users.',
    fa: ['رفع ملفات أكبر', 'إيموجي مخصص في أي مكان', 'بث بجودة أعلى', 'تخصيص البروفايل وتعزيز السيرفرات'],
    fe: ['Larger uploads', 'Custom emoji anywhere', 'Higher-quality streaming', 'Profile customisation and server boosts'],
    tiers: {
      'Nitro Basic': ['Nitro Basic: جزء من مميزات Nitro بسعر أقل.', 'Nitro Basic: part of the Nitro perks at a lower price.'],
      Nitro: ['Nitro: كل المميزات الكاملة بما فيها البث الأعلى جودة وتعزيز السيرفرات.', 'Nitro: the full set of perks including higher-quality streaming and server boosts.'],
    },
  },
  'telegram-premium': {
    ar: 'Telegram Premium بيرفع حدود رفع الملفات لحد 4 جيجا ويسرّع التنزيل ويضيف تحويل الصوت لنص وملصقات وإيموجي حصرية وإزالة الإعلانات في القنوات.\n\nمناسب للمستخدمين النشطين وأصحاب القنوات والمجموعات.',
    en: 'Telegram Premium raises the file-upload limit to 4 GB, speeds up downloads and adds voice-to-text, exclusive stickers and emoji, and removes ads in channels.\n\nGood for heavy users and channel or group owners.',
    fa: ['رفع ملفات لحد 4 جيجا', 'تنزيل أسرع', 'تحويل الصوت لنص', 'ملصقات وإيموجي حصرية'],
    fe: ['Uploads up to 4 GB', 'Faster downloads', 'Voice-to-text', 'Exclusive stickers and emoji'],
  },
};

// ---------- gift cards and game top-ups share one structure; the lines below fill in each platform's specifics.
export const CARDS = {
  'google-play-card': { ar: 'كارت Google Play بيضيف رصيد لحساب Google Play بتاعك تشتري بيه تطبيقات وألعاب ومحتوى واشتراكات من المتجر.', en: 'A Google Play card adds balance to your Google Play account for apps, games, content and subscriptions from the store.' },
  'apple-gift-card': { ar: 'Apple Gift Card بيضيف رصيد لحساب Apple بتاعك تشتري بيه تطبيقات وألعاب واشتراكات وiCloud+ ومحتوى من App Store وiTunes.', en: 'An Apple Gift Card adds balance to your Apple Account for apps, games, subscriptions, iCloud+ and content from the App Store and iTunes.' },
  'psn-card': { ar: 'كارت PlayStation Store بيضيف رصيد لحساب PlayStation Network تشتري بيه ألعاب وإضافات واشتراك PlayStation Plus من المتجر.', en: 'A PlayStation Store card adds balance to your PlayStation Network account for games, add-ons and PlayStation Plus from the store.' },
  'xbox-gift-card': { ar: 'كارت Xbox بيضيف رصيد لحساب Microsoft بتاعك تشتري بيه ألعاب وإضافات واشتراك Game Pass من متجر Xbox.', en: 'An Xbox gift card adds balance to your Microsoft account for games, add-ons and Game Pass from the Xbox store.' },
  'steam-wallet': { ar: 'كارت Steam Wallet بيضيف رصيد لمحفظة Steam بتاعتك تشتري بيه ألعاب وإضافات ومحتوى من متجر Steam.', en: 'A Steam Wallet card adds funds to your Steam wallet for games, add-ons and content from the Steam store.' },
  'nintendo-eshop': { ar: 'كارت Nintendo eShop بيضيف رصيد لحساب Nintendo تشتري بيه ألعاب وإضافات من متجر Nintendo eShop.', en: 'A Nintendo eShop card adds funds to your Nintendo account for games and add-ons from the Nintendo eShop.' },
  'amazon-gift-card': { ar: 'Amazon Gift Card بيضيف رصيد لحساب Amazon تشتري بيه منتجات وخدمات من المتجر حسب المنطقة.', en: 'An Amazon Gift Card adds balance to your Amazon account for products and services from the store, per region.' },
  'netflix-gift-card': { ar: 'Netflix Gift Card بيضيف رصيد لحساب Netflix يغطي رسوم اشتراكك الشهري.', en: 'A Netflix Gift Card adds credit to your Netflix account that covers your monthly subscription fee.' },
  'roblox-gift-card': { ar: 'كارت Roblox بيضيف رصيد لحسابك تشتري بيه Robux وعناصر وتجارب داخل Roblox.', en: 'A Roblox card adds credit to your account for Robux, items and experiences inside Roblox.' },
  'razer-gold': { ar: 'Razer Gold رصيد رقمي بتشتري بيه ألعاب وبطاقات وعناصر داخل ألعاب كتير ومن متجر Razer.', en: 'Razer Gold is digital credit for games, cards and in-game items across many titles and the Razer store.' },
};
export const TOPUPS = {
  'pubg-mobile-uc': { ar: 'شحن UC للعبة PUBG Mobile: العملة اللي بتشتري بيها السكنات والـ Royale Pass والعناصر داخل اللعبة. بتتشحن على حسابك بالـ Player ID.', en: 'UC top-up for PUBG Mobile: the currency for skins, the Royale Pass and in-game items. It is added to your account using your Player ID.' },
  'free-fire-diamonds': { ar: 'شحن جواهر Free Fire: العملة اللي بتشتري بيها الشخصيات والسكنات والعناصر داخل اللعبة. بتتشحن على حسابك بالـ Player ID.', en: 'Free Fire diamonds top-up: the currency for characters, skins and in-game items. It is added to your account using your Player ID.' },
  'fortnite-vbucks': { ar: 'شحن V-Bucks للعبة Fortnite: العملة اللي بتشتري بيها السكنات والـ Battle Pass والعناصر.', en: 'V-Bucks top-up for Fortnite: the currency for skins, the Battle Pass and items.' },
  'valorant-points': { ar: 'شحن Valorant Points: العملة اللي بتشتري بيها سكنات الأسلحة والـ Battle Pass والعناصر داخل اللعبة.', en: 'Valorant Points top-up: the currency for weapon skins, the Battle Pass and in-game items.' },
  'cod-mobile-cp': { ar: 'شحن CP للعبة Call of Duty Mobile: العملة اللي بتشتري بيها الـ Battle Pass والسكنات والعناصر. بتتشحن بالـ Player ID.', en: 'CP top-up for Call of Duty: Mobile: the currency for the Battle Pass, skins and items. It is added using your Player ID.' },
  'mobile-legends-diamonds': { ar: 'شحن Diamonds للعبة Mobile Legends: العملة اللي بتشتري بيها الأبطال والسكنات والعناصر. بتتشحن بالـ Player ID.', en: 'Diamonds top-up for Mobile Legends: the currency for heroes, skins and items. It is added using your Player ID.' },
  'genshin-impact': { ar: 'شحن Genesis Crystals للعبة Genshin Impact: العملة اللي بتحوّلها لـ Primogems وبتشتري بيها العناصر والـ Battle Pass.', en: 'Genesis Crystals top-up for Genshin Impact: the currency you convert to Primogems and use for items and the Battle Pass.' },
  'ea-fc-points': { ar: 'شحن EA FC Points: العملة اللي بتشتري بيها الحزم والعناصر داخل لعبة EA SPORTS FC.', en: 'EA FC Points top-up: the currency for packs and items inside EA SPORTS FC.' },
  'tiktok-coins': { ar: 'شحن عملات TikTok: بتستخدمها في إرسال الهدايا للمبدعين في البثوث المباشرة والفيديوهات.', en: 'TikTok coins top-up: used to send gifts to creators during live streams and videos.' },
};
