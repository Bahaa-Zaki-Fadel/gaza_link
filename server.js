const express = require("express");
const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

// معرفة البيئة
const isRender = !!process.env.RENDER;

// اختيار Puppeteer المناسب
const puppeteer = isRender
  ? require("puppeteer-core")
  : require("puppeteer");

const app = express();
const PORT = process.env.PORT || 10000;

const RSS_URL = "https://www.motqdmon.com/feeds/posts/default?alt=rss";
const parser = new Parser({
  timeout: 30000,
  headers: { "User-Agent": "Mozilla/5.0" }
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "news.json");

// إنشاء مجلد البيانات
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// تحميل الأخبار القديمة
let newsData = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    newsData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    newsData = [];
  }
}

app.use(express.json());

/* ======================================
   استخراج بيانات الخبر
====================================== */
async function extractData(page, link) {
  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });

    return await page.evaluate(() => {
      const nodes = document.querySelectorAll(
        "article p, article div, main p, main div"
      );

      let text = Array.from(nodes)
        .map(n => n.innerText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const sentences = text
        .split(/[.؟!]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const summary =
        sentences.slice(0, 2).join(". ") +
        (sentences.length > 2 ? "..." : "");

      let deadline = null;
      const match = text.match(
        /(\d{1,2}\s+\S+\s+\d{4}(\s+\d{1,2}:\d{2})?)/
      );
      if (match) deadline = match[1];

      let originalLink = null;
      document.querySelectorAll("article a").forEach(a => {
        if (
          a.href &&
          !a.href.includes("motqdmon.com") &&
          a.innerText.includes("تقديم")
        ) {
          originalLink = a.href;
        }
      });

      return { summary, deadline, originalLink };
    });
  } catch (err) {
    console.log("⚠️ فشل استخراج البيانات:", err.message);
    return { summary: "", deadline: null, originalLink: null };
  }
}

/* ======================================
   جلب الأخبار
====================================== */
async function scrapeNews() {
  console.log("🔍 بدأ تنفيذ scrapeNews");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",

      // 🔑 الحل النهائي: مسار Chrome حسب البيئة
      executablePath: isRender
        ? process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome"
        : undefined, // على Windows يستخدم puppeteer العادي

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    const page = await browser.newPage();
    const feed = await parser.parseURL(RSS_URL);

    let added = 0;

    for (const item of feed.items) {
      const title = item.title?.trim();
      const pageLink = item.link?.trim();
      const created_at = item.pubDate
        ? new Date(item.pubDate)
        : new Date();

      if (!title || !pageLink) continue;
      if (newsData.some(n => n.title === title)) continue;

      const { summary, deadline, originalLink } =
        await extractData(page, pageLink);

      newsData.push({
        title,
        link: originalLink || pageLink,
        created_at,
        summary,
        deadline,
        isNew: true
      });

      added++;
      console.log("✔️ أُضيف:", title);
    }

    newsData.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    fs.writeFileSync(DATA_FILE, JSON.stringify(newsData, null, 2));
    console.log(`✅ تم حفظ ${added} خبر جديد`);
  } catch (err) {
    console.error("❌ خطأ أثناء الجلب:", err.message);
  } finally {
    if (browser) await browser.close();
  }
}

// أول تشغيل
scrapeNews();
// تحديث كل 10 دقائق
setInterval(scrapeNews, 10 * 60 * 1000);

/* ======================================
   API
====================================== */
app.get("/api/news", (req, res) => {
  res.json({ success: true, data: { items: newsData } });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});