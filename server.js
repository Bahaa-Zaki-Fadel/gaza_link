const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require("express");
const Parser = require("rss-parser");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static("public"));

/* صفحة ثابتة */
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

// مجلد البيانات
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

/* ============ أدوات مساعدة ============ */
function normalizeUrl(u) {
  return (u || "")
    .trim()
    .replace(/^http:\/\//, "https://")
    .replace(/\?m=1$/, "")
    .replace(/\/$/, "");
}

/* ===================== slug من العنوان + منع التكرار + سنة ===================== */
function slugifyArabic(str = "") {
  return str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "") // احذف الرموز
    .replace(/\s+/g, "-") // المسافات ->
    .replace(/-+/g, "-") // دمج --
    .replace(/^-|-$/g, ""); // حذف - من الأطراف
}

function createSlugFromTitle(title, fallbackUrl) {
  const base = slugifyArabic(title);
  if (base) return base.slice(0, 70);

  // fallback لو العنوان فاضي
  const m = (fallbackUrl || "").match(/\/(\d{4})\/(\d{2})\/([^\/]+)\.html/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : Date.now().toString();
}

function uniqueSlug(base, list) {
  let slug = base;
  let i = 2;
  while (list.some((n) => n.slug === slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
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

      // ===================== استخراج "آخر موعد" بشكل نظيف =====================
      let deadline = null;

      const keywordMatch = text.match(
        /(آخر\s*موعد(?:\s*للتقديم)?|ينتهي|حتى\s*تاريخ|آخر\s*تاريخ|آخر\s*يوم)/i
      );

      const after =
        keywordMatch && keywordMatch.index != null
          ? text.slice(keywordMatch.index, keywordMatch.index + 120)
          : text.slice(0, 200);

      const dateNum =
        after.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/)?.[1] ||
        after.match(/(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/)?.[1] ||
        null;

      const dateWords =
        after.match(
          /(\d{1,2}\s+(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+\d{4})/i
        )?.[1] || null;

      const timePart = after.match(/(\d{1,2}:\d{2})/)?.[1] || null;

      if (dateWords) {
        deadline = dateWords + (timePart ? ` ${timePart}` : "");
      } else if (dateNum) {
        deadline = dateNum + (timePart ? ` ${timePart}` : "");
      } else {
        deadline = null;
      }

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
async function scrapeNews() {
  console.log("🔍 بدأ تنفيذ scrapeNews");
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // تهدئة إضافية لتقليل 429
    await page.setExtraHTTPHeaders({ "Accept-Language": "ar,en-US;q=0.9" });

    const feed = await parser.parseURL(RSS_URL);

    let added = 0;

    for (const item of feed.items) {
      const title = item.title?.trim();
      const pageLink = item.link?.trim();
      const created_at = item.pubDate ? new Date(item.pubDate) : new Date();

      if (!title || !pageLink) continue;
      if (newsData.some((n) => n.sourceLink === pageLink)) continue;

      // لتخفيف الضغط (مفيد ضد 429)
      await sleep(1200);

      const { summary, deadline, originalLink } = await extractData(page, pageLink);

      // ✅ slug من العنوان + سنة + منع تكرار
      const year = created_at.getFullYear();
      const baseSlug = `${createSlugFromTitle(title, pageLink)}-${year}`;
      const slug = uniqueSlug(baseSlug, newsData);

      newsData.push({
        title,
        slug,
        link: originalLink || null,
        sourceLink: pageLink,
        created_at,
        summary,
        deadline,
        isNew: true,
      });

      added++;
      console.log("✔️ أُضيف:", title);
    }

    newsData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    fs.writeFileSync(DATA_FILE, JSON.stringify(newsData, null, 2));
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
  }
}

// أول تشغيل
scrapeNews();
// تحديث كل 10 دقائق
setInterval(scrapeNews, 10 * 60 * 1000);

/* ====================================== API مع حماية ذكية ====================================== */
const API_SECRET = "linkgaza_secret_2026";

app.get("/api/news", (req, res) => {
  // السماح لو محلي للتجربة
  if (process.env.NODE_ENV === "production") {
    const key = req.headers["x-api-key"];
    if (key !== API_SECRET)
      return res.status(403).json({ success: false, message: "Access denied" });
  }

  const limit = Math.min(parseInt(req.query.limit || "200", 10), 1000);
  const items = newsData.slice(0, limit).map((n) => ({
    ...n,
    displayLink: n.link ? n.link : "نعتذر، الرابط غير متوفر",
  }));

  res.json({ success: true, data: { items } });
});

/* ✅ Redirect للروابط القديمة (id=sourceLink) */
app.get("/news-old", (req, res) => {
  const old = (req.query.id || "").trim();
  if (!old) return res.redirect("/");

  const target = newsData.find(
    (n) => normalizeUrl(n.sourceLink) === normalizeUrl(old)
  );
  if (!target) return res.redirect("/");

  return res.redirect(301, `/news/${target.slug}`);
});

/* صفحة التفاصيل */
app.get("/news/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "news.html"));
});

app.listen(PORT, () =>
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`)
);
