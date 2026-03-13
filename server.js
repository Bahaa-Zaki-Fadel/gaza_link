const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require("express");
const Parser = require("rss-parser");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
 const TELEGRAM_TOKEN = "8411714946:AAHcoUGkvSHybYWjncpl5nSZzU3BU_eNqz0";
 const TELEGRAM_CHAT_ID = "@linkGazaa";

function getNewsTag(title) {
  const t = String(title || "").toLowerCase();

  if (
    t.includes("وظيفة") ||
    t.includes("وظائف") ||
    t.includes("فرص عمل") ||
    t.includes("توظيف") ||
    t.includes("مطلوب")
  ) {
    return "💼 فرصة عمل جديدة";
  }

  if (
    t.includes("مساعدة") ||
    t.includes("مساعدات") ||
    t.includes("إغاثية") ||
    t.includes("مالية") ||
    t.includes("تسجيل المساعدات")
  ) {
    return "💰 إعلان مساعدات";
  }

  if (
    t.includes("تدريب") ||
    t.includes("متدربين") ||
    t.includes("برنامج تدريبي") ||
    t.includes("منحة")
  ) {
    return "🎓 فرصة تدريب";
  }

  if (
    t.includes("صحي") ||
    t.includes("صحة") ||
    t.includes("طبي") ||
    t.includes("مستشفى")
  ) {
    return "🏥 فرصة في القطاع الصحي";
  }

  if (
    t.includes("تعليم") ||
    t.includes("مدرسة") ||
    t.includes("جامعة") ||
    t.includes("دورة")
  ) {
    return "📚 فرصة تعليمية";
  }

  return "📢 إعلان جديد";
}

async function sendTelegramMessage(title, pageUrl) {
  try {
    const tag = getNewsTag(title);

    const titles = [
      "🚨 خبر جديد نُشر الآن على منصة LinkGaza",
      "🆕 تحديث جديد على منصة LinkGaza",
      "📢 إعلان جديد وصل الآن على منصة LinkGaza",
      "📡 جديد المنصة الآن",
      "🚀 فرصة جديدة تم نشرها على منصة LinkGaza",
      "📰 تم إضافة خبر جديد على منصة LinkGaza"
    ];

    const botTexts = [
      "🤖 أنا بوت LinkGaza، تم تكليفي بمتابعة منصة LinkGaza ونشر أحدث الأخبار والفرص فور إضافتها.",
      "🤖 أنا بوت LinkGaza، أعمل على إرسال كل ما يُنشر حديثاً على المنصة ليصلكم أولاً بأول.",
      "🤖 أنا بوت LinkGaza، مهمتي نقل الأخبار والفرص الجديدة فور صدورها على منصة LinkGaza.",
      "🤖 أنا بوت LinkGaza، أرسل لكم كل جديد يتم نشره على منصة LinkGaza بشكل مباشر وسريع."
    ];

    const randomTitle = titles[Math.floor(Math.random() * titles.length)];
    const randomBot = botTexts[Math.floor(Math.random() * botTexts.length)];

    const message =` ${randomTitle}

━━━━━━━━━━━━━━━━━━

${tag}

📢 ${title}

━━━━━━━━━━━━━━━━━━

🔎 للاطلاع على التفاصيل الكاملة:
${pageUrl}

━━━━━━━━━━━━━━━━━━

${randomBot}

📡 
تابع القناة ليصلك كل جديد باستمرار.
https://t.me/linkGazaa

`;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔎 قراءة الخبر",
              url: pageUrl
            }
          ],
          [
            {
              text: "🔔 متابعة قناة LinkGaza",
              url: "https://t.me/linkGazaa"
            }
          ]
        ]
      }
    });

    console.log("📢 تم إرسال الخبر إلى تلجرام");
  } catch (err) {
    const retryAfter = err.response?.data?.parameters?.retry_after;

    if (err.response?.data?.error_code === 429 && retryAfter) {
      console.log(`⏳ تلجرام طلب انتظار ${retryAfter} ثواني...`);
      await sleep((retryAfter + 1) * 1000);
      return sendTelegramMessage(title, pageUrl);
    }

    console.log("❌ فشل إرسال الخبر إلى تلجرام:", err.response?.data || err.message);
  }
}const app = express();
app.use(express.static("public"));

app.get("/وظائف-غزة-اليوم", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wazayef-gaza.html"));
});

const PORT = process.env.PORT || 30000;
const RSS_URL = "https://www.motqdmon.com/feeds/posts/default?alt=rss";

const parser = new Parser({
  timeout: 30000,
  headers: { "User-Agent": "Mozilla/5.0" },
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "news.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// تحميل الأخبار لو موجودة
let newsData = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    newsData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    newsData = [];
  }
}

app.use(express.json());

function normalizeUrl(u) {
  return (u || "")
    .trim()
    .replace(/^http:\/\//, "https://")
    .replace(/\?m=1$/, "")
    .replace(/\/$/, "");
}

/* ========= توليد slug مختصر (ID + كلمات إنجليزية) ========= */
function toSeoEnglish(title = "") {
  let t = (title || "").toLowerCase();

  // تحويل كلمات عربية شائعة لكلمات إنجليزية (حسب موقع وظائف)
  const map = [
    [/وظائف/g, "jobs"],
    [/وظيفه/g, "jobs"],
    [/فرص\s*عمل/g, "jobs"],
    [/فرصة/g, "job"],
    [/عمل/g, "job"],
    [/توظيف/g, "jobs"],
    [/مطلوب/g, "wanted"],
    [/تعلن\s*عن/g, "announce"],
    [/تعلن/g, "announce"],
    [/جمعية/g, "ngo"],
    [/مؤسسة/g, "org"],
    [/منظمة/g, "org"],
    [/وكالة/g, "agency"],
    [/برنامج/g, "program"],
    [/غزة/g, "gaza"],
    [/الضفة/g, "westbank"],
    [/القدس/g, "jerusalem"],
    [/معا/g, "maa"],
    [/الأونروا/g, "unrwa"],
    [/يونيسف/g, "unicef"],
    [/الهلال\s*الأحمر/g, "rc"],
    [/صحة/g, "health"],
    [/تعليم/g, "education"],
    [/تمويل/g, "funding"],
    [/مساعدات/g, "aid"],
  ];

  for (const [re, rep] of map) t = t.replace(re, rep);

  // احذف كل شيء غير لاتيني/أرقام/مسافات/-
  t = t.replace(/[^a-z0-9\s-]/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  // أول كلمتين فقط
  const words = t.split(" ").filter(Boolean).slice(0, 2);

  // fallback
  if (!words.length) return "news";
  if (words.length === 1) return words[0];
  return `${words[0]}-${words[1]}`;
}

function uniqueSlug(base, list) {
  let slug = base;
  let i = 2;
  while (list.some((n) => n.slug === slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function createSlug(title) {
  const id = newsData.length + 1; // ID ثابت
  const kw = toSeoEnglish(title);
  return `${id}-${kw}`;
}

/* ====================================== استخراج البيانات من صفحة الخبر ====================================== */
async function extractData(page, link) {
  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });

    return await page.evaluate(() => {
      const paragraphs = Array.from(
        document.querySelectorAll("article p, article div, main p, main div")
      );

      let text = paragraphs
        .map((p) => p.innerText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      text = text
        .split(/[.؟!]/)
        .filter(
          (s) =>
            !["المتقدمون", "اكتشف", "المزيد"].some((w) =>
              s.toLowerCase().includes(w)
            )
        )
        .join(". ");

      const sentences = text
        .split(/[.؟!]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const summary =
        sentences.slice(0, 2).join(". ") + (sentences.length > 2 ? "..." : "");

      // استخراج آخر موعد (تاريخ فقط)
      let deadline = null;

      const keywordMatch = text.match(
        /(آخر\s*موعد(?:\s*للتقديم)?|ينتهي|حتى\s*تاريخ|آخر\s*تاريخ|آخر\s*يوم)/i
      );

      const after =
        keywordMatch && keywordMatch.index != null
          ? text.slice(keywordMatch.index, keywordMatch.index + 140)
          : text.slice(0, 220);

      const dateNum =
        after.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/)?.[1] ||
        after.match(/(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/)?.[1] ||
        null;

      const dateWords =
        after.match(
          /(\d{1,2}\s+(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+\d{4})/i
        )?.[1] || null;

      const timePart = after.match(/(\d{1,2}:\d{2})/)?.[1] || null;

      if (dateWords) deadline = dateWords + (timePart ? ` ${timePart}` : "");
      else if (dateNum) deadline = dateNum + (timePart ? ` ${timePart}` : "");
      else deadline = null;

      let originalLink = null;
      const anchors = Array.from(document.querySelectorAll("article a"));
      for (let i = anchors.length - 1; i >= 0; i--) {
        const a = anchors[i];
        const href = a.href || "";
        const txt = (a.innerText || "").trim();

        if (
          href &&
          !href.includes("motqdmon.com") &&
          !["اكتشف", "المزيد", "المتقدمون"].some((w) => txt.includes(w)) &&
          ["تقديم", "تسجيل", "اضغط", "تحديث البيانات"].some((w) =>
            txt.includes(w)
          )
        ) {
          originalLink = href;
          break;
        }
      }

      return { summary, deadline, originalLink };
    });
  } catch (err) {
    console.log("⚠️ فشل استخراج البيانات:", err.message);
    return { summary: "", deadline: null, originalLink: null };
  }
}

/* ====================================== جلب الأخبار من RSS ====================================== */
let isScraping = false;

async function scrapeNews() {
  if (isScraping) {
    console.log("⏳ scrapeNews شغالة بالفعل، تم تجاهل تشغيل جديد");
    return;
  }

  isScraping = true;
  console.log("🔍 بدأ تنفيذ scrapeNews");

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "ar,en-US;q=0.9" });

    const feed = await parser.parseURL(RSS_URL);
    const items = feed.items.slice(0, 25);

    let added = 0;

    for (const item of items) {
      const title = item.title?.trim();
      const pageLink = item.link?.trim();
      const created_at = item.pubDate ? new Date(item.pubDate) : new Date();

      if (!title || !pageLink) continue;

      const cleanLink = normalizeUrl(pageLink);

      // منع التكرار
      if (newsData.some((n) => normalizeUrl(n.sourceLink) === cleanLink)) {
        continue;
      }

      await sleep(1200);

      const { summary, deadline, originalLink } = await extractData(page, pageLink);

      const baseSlug = createSlug(title);
      const slug = uniqueSlug(baseSlug, newsData);

      newsData.push({
        title,
        slug,
        link: originalLink || null,
        sourceLink: cleanLink,
        created_at,
        summary,
        deadline,
        isNew: true,
      });

      const pageUrl = `https://linkgaza.com/g/${slug}`;

      // أرسل أي خبر جديد مباشرة
      await sendTelegramMessage(title, pageUrl);
      await sleep(1500);

      added++;
      console.log("✔️ أُضيف:", title);
    }

    newsData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    fs.writeFileSync(DATA_FILE, JSON.stringify(newsData, null, 2), "utf8");

    console.log(`✅ تم حفظ ${added} خبر جديد`);
  } catch (err) {
    if (String(err.message || "").includes("429")) {
      console.error("❌ خطأ عند جلب الأخبار: Status code 429");
      console.log("⏳ تم حظرك مؤقتًا (429) .. انتظر 10 دقائق");
    } else {
      console.error("❌ خطأ عند جلب الأخبار:", err.message);
    }
  } finally {
    if (browser) await browser.close();
    isScraping = false;
  }
}
// أول تشغيل
scrapeNews();
// تحديث كل 10 دقائق
setInterval(scrapeNews, 10 * 60 * 1000);

/* ====================================== API مع حماية ذكية ====================================== */
const API_SECRET = "linkgaza_secret_2026";

app.get("/api/news", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    const key = req.headers["x-api-key"];
    if (key !== API_SECRET) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
  }

  const limit = Math.min(parseInt(req.query.limit || "200", 10), 1000);
  const items = newsData.slice(0, limit).map((n) => ({
    ...n,
    displayLink: n.link ? n.link : "نعتذر، الرابط غير متوفر",
  }));

  res.json({ success: true, data: { items } });
});

/* ✅ تحويل الروابط القديمة: /news-old?id=SOURCE_LINK */
app.get("/news-old", (req, res) => {
  const old = (req.query.id || "").trim();
  if (!old) return res.redirect("/");

  const target = newsData.find(
    (n) => normalizeUrl(n.sourceLink) === normalizeUrl(old)
  );
  if (!target) return res.redirect("/");

  return res.redirect(301, `/g/${target.slug}`);
});

/* ✅ حل مشكلة /g/روابط عربية قديمة (تظهر %D9%...) */
app.get("/g/*", (req, res, next) => {
  // الجزء بعد /g/
  const raw = decodeURIComponent(req.path.replace("/g/", "")).trim();

  // لو فيه أحرف عربية => هذا رابط قديم
  const looksArabic = /[\u0600-\u06FF]/.test(raw);

  if (!looksArabic) return next();

  // حاول تلاقيه حسب slug القديمة (لو محفوظة) أو حسب عنوانه
  const foundBySlug = newsData.find((n) => (n.slug || "").trim() === raw);

  if (foundBySlug) return res.redirect(301, `/g/${foundBySlug.slug}`);

  // مطابقة تقريبية بالعنوان (ممكن العنوان موجود)
  const foundByTitle = newsData.find((n) =>
    (n.title || "").replace(/\s+/g, "-").includes(raw.slice(0, 10))
  );

  if (foundByTitle) return res.redirect(301, `/g/${foundByTitle.slug}`);

  // إذا ما لقيناه، روح للرئيسية بدل error
  return res.redirect("/");
});
app.get("/news/:slug", (req, res) => {
  return res.redirect(`/g/${req.params.slug}`);
});

app.get("/g/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "news.html"));
});

/* تشغيل السيرفر */
app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});