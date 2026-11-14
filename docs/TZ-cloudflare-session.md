# ТЗ: Cloudflare для етапу 1 аналітики ПроМедіа

Документ для нової сесії Claude Code, яка має доступ до Cloudflare API.
Мова спілкування з користувачем — українська. Користувач не технічний:
пояснюй коротко, без жаргону, і веди його по одному кроку.

## 0. Головні правила

1. **Нічого не змінюй без явного «так» користувача на конкретну зміну.**
   Спершу аудит лише на читання (розділ 3), потім план, потім зміни по одній.
2. **Токен ніколи не виводь, не логуй і не записуй у файли чи коміти.**
   Не проси користувача вставляти токени чи паролі в чат.
3. Не вмикай **Bot Fight Mode**. Не обирай дію **Block** у WAF.
4. Не перемикай **Proxied / DNS only** в наявних записах і не видаляй записів.
   Лише звітуй і пропонуй.
5. **Не перезаписуй наявні правила WAF:** нові правила лише додавай
   (`POST …/rules`, а не `PUT` на весь ruleset).
6. Не пуш у `main`: злиття PR робить користувач кнопкою на GitHub.
   Пуш у робочі гілки дозволено.
7. Для кожної зміни занотуй, як її відкотити (id правила, id запису, маршрут).
8. Дотримуйся внутрішніх політик ГО «ПроМедіа», погоджених правлінням.

## 1. Контекст

Екосистема сайтів ГО «ПроМедіа» на `promedia.report`, один потік GA4
(`G-D8TM22QR9R`) на всі піддомени.

| Хост | Репозиторій | Хостинг |
| --- | --- | --- |
| news, projects | `Ianitskyi/promedia-news` | Cloudflare Worker `promedia-news` |
| ratings | `ProMedia-Ukraine/Journalism2026` | GitHub Pages |
| communities | `Ianitskyi/promedia-communities` | GitHub Pages |
| jobs | `ProMedia-Ukraine/promedia-jobs` | GitHub Pages |
| research | `ProMedia-Ukraine/promedia-research` | GitHub Pages |
| atlas | `Ianitskyi/promedia-atlas` | ChatGPT Sites, CNAME `custom-domains.chatgpt.site` (Cloudflare for SaaS) |
| brief | `Ianitskyi/promedia-brief` | GitHub Pages, власна аналітика, не чіпати |
| `promedia.report/robots.txt`, `/sitemap.xml` | `Ianitskyi/promedia-seo-gateway` | Worker `promedia-seo-gateway` |
| `promedia.report` (головна), santa, labs, events | **невідомо**, з'ясувати за DNS | ? |

### Що вже зроблено (14.11.2026)

- Спільний модуль `https://news.promedia.report/js/promedia-analytics.js`
  опубліковано. Він підключений на news, projects, ratings, communities, jobs,
  research і atlas. На живих сайтах перевірено: по одному `page_view` з
  `site_section`, `content_type`, `content_language`, без помилок JS.
- GA тепер завантажується лише на `*.promedia.report` (не на localhost,
  `*.workers.dev`, `www`). Є банер з вимкненням аналітики.
- У гілці `analytics/stage1-shared-tag` репозиторію `promedia-seo-gateway`
  (PR ще **не злито**) лежать:
  - `src/worker.js`: 301 з `www.promedia.report/*` на `https://promedia.report/*`
    зі збереженням шляху й query;
  - `wrangler.toml`: новий маршрут `www.promedia.report/*`;
  - `docs/analytics-stage1-ops.md`: повна інструкція (WAF, GA4, перевірки);
  - цей файл.

### Навіщо Cloudflare

За даними GA4 (17.10–13.11.2026) близько 17% користувачів — боти з
дата-центрів (Урумчі, Санья, Ешберн, Каунсіл-Блафс, Флінт-Гілл, Мідвейл).
Вони роздувають «прямий» трафік і псують метрики. `www.promedia.report`
відкривається без редиректу і потрапляє в GA окремим хостом.

## 2. Доступи в цьому середовищі

- **Токен Cloudflare** доданий як *мережевий секрет* типу Bearer для хосту
  `api.cloudflare.com`. Проксі середовища сам додає заголовок
  `Authorization: Bearer …` до запитів на цей хост. **Змінної з токеном у
  середовищі немає, і шукати її не треба.** Запити роби без заголовка
  авторизації, наприклад:
  `curl -s https://api.cloudflare.com/client/v4/user/tokens/verify`.
- `CLOUDFLARE_ACCOUNT_ID` — змінна середовища.
- Дозволи токена (лише зона `promedia.report` і акаунт користувача):

  | Рівень | Дозвіл |
  | --- | --- |
  | Zone | DNS: Edit |
  | Zone | Zone: Read |
  | Zone | Zone WAF: Edit |
  | Zone | Workers Routes: Edit |
  | Account | Workers Scripts: Edit |

  Чого токен **не може**: читати Security Events / аналітику, редагувати
  Redirect Rules, читати налаштування SSL. Якщо щось із цього знадобиться,
  скажи користувачу, який дозвіл додати, а не обходь обмеження.
- `wrangler` очікує змінну `CLOUDFLARE_API_TOKEN`. Спершу спробуй
  `CLOUDFLARE_API_TOKEN=injected-by-proxy npx wrangler whoami`: можливо,
  проксі підмінить заголовок. Якщо не спрацює, публікуй Worker напряму через
  API (розділ 4.2, варіант Б).
- GitHub: підключи потрібні репозиторії через `add_repo` (access `push`).
  `gh` CLI може бути не авторизований: посилання на PR давай у форматі
  `https://github.com/<owner>/<repo>/pull/new/<branch>`.

## 3. Аудит (лише читання) — перший крок

Зроби все нижче без змін і покажи користувачу короткий звіт таблицями.

1. `GET /user/tokens/verify`: токен активний.
2. `GET /zones?name=promedia.report`: `zone_id`, тариф (`plan.name`).
   Тариф визначає, чи є дія **Log** у WAF: на Free/Pro/Business її немає.
3. `GET /zones/{zone_id}/dns_records?per_page=500`. Таблиця для apex,
   `www`, news, projects, atlas, ratings, communities, jobs, research, events,
   santa, brief, labs, money (і всіх інших знайдених), стовпці: тип, ціль,
   **proxied**. З цього визнач, де хостяться головна, santa, labs і events
   (GitHub Pages `*.github.io`, інший сервіс, Worker).
4. `GET /zones/{zone_id}/workers/routes`: наявні маршрути. Чи немає
   конфлікту з `www.promedia.report/*`.
5. `GET /zones/{zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint`:
   наявні WAF custom rules (кількість, вирази, дії). На Free — ліміт 5 правил.
6. `GET /accounts/{account_id}/workers/scripts`: чи існує
   `promedia-seo-gateway`.

**Звіт:** що знайдено, що збігається з таблицею з розділу 1, що ні, і план змін
з розділу 4 з урахуванням знахідок. Чекай «так».

## 4. Зміни (кожна — після окремого «так»)

### 4.1. DNS-запис www

- Якщо запису `www` немає, запропонуй створити
  `CNAME www → promedia.report`, `proxied: true`.
- Якщо запис є, але `proxied: false`, не перемикай сам. Поясни, що для
  редиректу через Worker потрібна помаранчева хмара, і спитай дозволу.
- Якщо `www` указує на інший сервіс (наприклад, GitHub Pages), зупинись і
  поясни ситуацію: зміна може зламати те, що там зараз працює.
- Відкат: `DELETE /zones/{zone_id}/dns_records/{id}` або повернення
  попереднього значення.

### 4.2. Редирект www → promedia.report

1. Попроси користувача злити PR:
   https://github.com/Ianitskyi/promedia-seo-gateway/pull/new/analytics/stage1-shared-tag
   (Create pull request → Merge pull request → Confirm merge).
2. Публікація з `main` після злиття:
   - **Варіант А:** `npx wrangler deploy` у репозиторії (див. розділ 2 про токен).
   - **Варіант Б (API):** завантажити `src/worker.js` як ES-модуль:
     `PUT /accounts/{account_id}/workers/scripts/promedia-seo-gateway`
     (multipart: `metadata` = `{"main_module":"worker.js","compatibility_date":"2026-09-23"}`,
     частина `worker.js` з типом `application/javascript+module`).
     Потім переконайся, що є всі три маршрути (`promedia.report/robots.txt`,
     `promedia.report/sitemap.xml`, `www.promedia.report/*`):
     `POST /zones/{zone_id}/workers/routes` з `{"pattern":…,"script":"promedia-seo-gateway"}`
     лише для відсутніх.
3. Перевірка:
   - `curl -sI "https://www.promedia.report/projects?x=1"` → `301`,
     `location: https://promedia.report/projects?x=1`;
   - `curl -s https://promedia.report/robots.txt` і `/sitemap.xml` працюють як раніше;
   - `curl -sI https://promedia.report/` → `200`: головна не зламалася.
4. Відкат: видалити маршрут `www.promedia.report/*`
   (`DELETE /zones/{zone_id}/workers/routes/{route_id}`).

### 4.3. WAF-правило проти ботів із дата-центрів

Додай одне правило в entrypoint ruleset фази `http_request_firewall_custom`
(`POST /zones/{zone_id}/rulesets/{ruleset_id}/rules`; якщо entrypoint ще
немає, створи його з одним правилом).

- `description`: `Datacenter ASNs – challenge HTML (non-verified bots)`
- `expression`:

```
(ip.src.asnum in {45102 37963 45090 132203 16509 14618 396982})
and not cf.client.bot
and http.request.method eq "GET"
and any(http.request.headers["accept"][*] contains "text/html")
and not starts_with(http.request.uri.path, "/api/")
```

- `action`:
  - якщо тариф Enterprise і є `log`, то `log` на 7 днів;
  - інакше `managed_challenge`, і **на перший тиждень** додай до виразу
    `and http.host eq "ratings.promedia.report"`, щоб правило діяло лише на
    одному сайті.

| ASN | Мережа | Місто в GA |
| --- | --- | --- |
| 45102, 37963 | Alibaba Cloud | Урумчі, Санья |
| 45090, 132203 | Tencent Cloud | Урумчі, Санья |
| 16509, 14618 | Amazon AWS | Ешберн |
| 396982 | Google Cloud | Каунсіл-Блафс |

Пояснення для користувача:
- `not cf.client.bot` пропускає перевірених ботів (Googlebot, Bingbot,
  GPTBot, ClaudeBot, PerplexityBot тощо);
- правило діє лише на HTML-сторінки, тож API і завантаження даних не ламаються;
- правило працює тільки для **проксованих** хостів (див. аудит).

Перевірка: `GET` того ж ruleset, правило на місці, `enabled: true`.
`curl -sI https://ratings.promedia.report/` зі звичайного IP → `200`.
Відкат: `DELETE /zones/{zone_id}/rulesets/{ruleset_id}/rules/{rule_id}`.

### 4.4. Звіт про проксування (без змін)

Для кожного піддомену поясни, чи діятиме на ньому WAF-правило:
- **GitHub Pages з `proxied: false`:** перемикати можна лише з SSL-режимом
  зони Full, і є ризик для HTTPS-сертифіката GitHub. Токен не читає SSL-налаштування,
  тож попроси користувача подивитися SSL/TLS → Overview і надіслати скриншот,
  перш ніж щось радити.
- **atlas (Cloudflare for SaaS):** поясни, що WAF зони `promedia.report` діє
  на нього лише якщо запис проксований («orange-to-orange»).

## 5. Через тиждень

Токен не читає Security Events. Запропонуй користувачу один із варіантів:
- він сам відкриває Security → Events → фільтр за правилом і надсилає
  скриншот: топ ASN, країни, User-Agent;
- або додає до токена дозвіл **Zone → Analytics: Read**, і тоді
  ти читаєш події через GraphQL API.

Далі, з дозволу:
- прибрати обмеження `http.host eq "ratings.promedia.report"` (або перейти з `log` на
  `managed_challenge`);
- додати мережі, які часто трапляються (Флінт-Гілл, Мідвейл), і прибрати ті,
  з яких приходять живі люди.

З дозволу користувача постав нагадування на цю перевірку (`send_later`, 7 днів).

## 6. Поза межами цієї сесії

- **Адмінка GA4** (користувацькі параметри, фільтр трафіку розробників,
  небажані реферали, утримання даних 14 міс.): користувач робить сам за
  `docs/analytics-stage1-ops.md`, розділ 4. Можеш провести його покроково.
- **Головна `promedia.report` і santa:** якщо з DNS стане зрозуміло, з якого
  репозиторію чи сервісу вони публікуються, повідом. Їх треба перевести на
  спільний модуль окремим кроком:
  `<script async src="https://news.promedia.report/js/promedia-analytics.js"></script>`
  замість вбудованого gtag.
- Кримськотатарський текст банера аналітики — на вичитку носію мови.

## 7. Критерії готовності

- [ ] Аудит показано користувачу, план погоджено.
- [ ] `https://www.promedia.report/…` → 301 на `https://promedia.report/…`
      зі збереженням шляху й query; robots.txt і sitemap.xml працюють.
- [ ] WAF-правило додано, наявні правила не змінені.
- [ ] Для кожної зміни записано id і команду відкату.
- [ ] Користувачу дано короткий підсумок українською: що змінено, як перевірити,
      що лишилося (тиждень спостереження за WAF, GA4, головна й santa).
- [ ] Користувачу нагадано видалити токен після завершення
      (My Profile → API Tokens → Delete) або що він сам спливе в заданий термін.

## 8. Формат звіту

Короткі таблиці: що зроблено, перевірка, відкат. Без внутрішніх id у
поясненнях для користувача (id — лише в окремому блоці «Для відкату»).
