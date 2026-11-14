# Етап 1 аналітики: що зробити поза кодом

Код етапу 1 розкладено по репозиторіях (див. «Порядок викладки»). Цей файл
описує кроки, які потребують доступу до Cloudflare або до адмінки GA4. Кожен із
них змінює налаштування для всіх сайтів, тому виконуйте їх свідомо і по черзі.

## 1. Порядок викладки

1. **promedia-news** — першим. Він публікує спільний модуль
   `https://news.promedia.report/js/promedia-analytics.js` і кнопку
   «Вимкнути аналітику» у спільному футері.
   Перевірка: `curl -sI https://news.promedia.report/js/promedia-analytics.js`
   повертає `200`.
2. **Journalism2026, promedia-communities, promedia-jobs, promedia-research,
   promedia-atlas** — у будь-якому порядку після news. Якщо злити їх раніше,
   аналітика на цих сайтах не працюватиме, доки news не опублікує модуль.
3. **promedia-seo-gateway** — редирект www (розділ 2).

Відкат: скасувати (revert) PR у відповідному репозиторії. Модуль у news можна
лишити: без підключення на сторінці він нічого не робить.

## 2. Редирект www.promedia.report → promedia.report

1. Cloudflare → зона `promedia.report` → DNS: має існувати **проксований**
   (помаранчева хмара) запис для `www`, наприклад `CNAME www → promedia.report`.
2. `npx wrangler deploy` у репозиторії `promedia-seo-gateway`.
3. Перевірка:
   `curl -sI https://www.promedia.report/projects?x=1` → `301`,
   `location: https://promedia.report/projects?x=1`.

Альтернатива без Worker: Rules → Redirect Rules → шаблон «Redirect from WWW to
root». Тоді маршрут `www.promedia.report/*` з `wrangler.toml` треба прибрати.

## 3. WAF-правило проти ботів із дата-центрів

Мета: прибрати з GA відвідування з дата-центрів (Урумчі, Санья, Ешберн,
Каунсіл-Блафс) і не зачепити пошукових та ШІ-ботів.

**Крок 1. Тиждень у режимі «Log».** Security → WAF → Custom rules → Create:

- Назва: `Datacenter ASNs – challenge HTML (non-verified bots)`
- Вираз (Edit expression):

```
(ip.src.asnum in {45102 37963 45090 132203 16509 14618 396982})
and not cf.client.bot
and http.request.method eq "GET"
and any(http.request.headers["accept"][*] contains "text/html")
and not starts_with(http.request.uri.path, "/api/")
```

- Дія: **Log** (на тарифі Free, де Log недоступний, одразу Managed Challenge,
  але спершу лише для одного піддомену: додайте
  `and http.host eq "ratings.promedia.report"`).

| ASN | Мережа | Звідки в GA |
| --- | --- | --- |
| 45102, 37963 | Alibaba Cloud | Урумчі, Санья |
| 45090, 132203 | Tencent Cloud | Урумчі, Санья |
| 16509, 14618 | Amazon AWS | Ешберн |
| 396982 | Google Cloud | Каунсіл-Блафс |

GA не показує ASN, тому список зібрано за містами. Через тиждень відкрийте
Security → Events, відфільтруйте за правилом і перегляньте топ ASN і User-Agent.
Додайте мережі, які трапляються часто (наприклад, для Флінт-Гілла й Мідвейла),
і приберіть ті, з яких приходять живі люди.

**Крок 2.** Змініть дію на **Managed Challenge** (не Block).

Що важливо:

- `not cf.client.bot` пропускає перевірених ботів Cloudflare: Googlebot, Bingbot,
  GPTBot, ClaudeBot, PerplexityBot і більшість сервісів прев'ю посилань.
- Правило діє лише на HTML-сторінки (GET + `Accept: text/html`), тому не ламає
  API, `fetch()` і завантаження даних.
- Правило працює лише для **проксованих** записів зони. Сайти на GitHub Pages
  (ratings, communities, research, jobs) мають бути з помаранчевою хмарою.
  Atlas підключено через Cloudflare for SaaS (`custom-domains.chatgpt.site`):
  перевірте, чи запис проксований, інакше правило його не охопить.
- **Bot Fight Mode не вмикайте:** його не можна обійти WAF-правилами (Skip),
  тож хибні спрацювання на живих людях чи потрібних ботах буде нічим виправити.

## 4. Адмінка GA4

1. **Користувацькі параметри** (Адміністратор → Користувацькі визначення →
   Створити, область: Подія):

   | Назва параметра | Опис |
   | --- | --- |
   | `site_section` | Піддомен: main, news, projects, atlas, ratings, communities, jobs, research, events, santa |
   | `content_type` | article, tool, project, vacancy, event, page |
   | `content_language` | uk, en, crh |
   | `author` | Автор статті (з `article:author`, поки що не заповнюється) |
   | `publish_date` | Дата публікації статті, РРРР-ММ-ДД |

   Мова контенту передається як `content_language`, а не `language`, як
   було в ТЗ: `language` у GA4 — вбудоване поле мови браузера, і перезапис
   зіпсував би звіт за мовами.
2. **Фільтр трафіку розробників** (Адміністратор → Фільтри даних): увімкнути
   «Активний». Інакше перевірки з `?ga_debug=1` потрапляють у звіти.
3. **Список небажаних рефералів** (Потоки даних → Тег Google → Налаштування
   тегу): додати `promedia.report`.
4. **Внутрішній трафік**: визначити IP команди і увімкнути відповідний фільтр.
5. **Утримання даних**: 14 місяців.

## 5. Перевірка після викладки

1. Відкрийте будь-яку сторінку з `?ga_debug=1`, наприклад
   `https://ratings.promedia.report/?ga_debug=1`. У GA4 → DebugView має
   з'явитися `page_view` з параметрами `site_section=ratings`,
   `content_type=tool`, `content_language=uk`.
2. Натисніть «Вимкнути аналітику» у банері або у футері, оновіть сторінку:
   запитів до `google-analytics.com` більше немає на жодному піддомені.
   Повернути можна кнопкою «Увімкнути аналітику» у футері.
3. Через 2–3 дні: звіт «Реальний час» або дослідження за іменем хосту не
   містять `127.0.0.1`, `*.workers.dev` і `www.promedia.report`.

`?ga_debug=0` вимикає режим налагодження в поточній вкладці.
