const express = require("express");
const Parser = require("rss-parser");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

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

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

/* ====================================== استخراج البيانات من صفحة الخبر ====================================== */
async function extractData(page, link) {
  try {
    await page.goto(link, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const result = await page.evaluate(() => {
      const paragraphs = Array.from(
        document.querySelectorAll("article p, article div, main p, main div")
      );
      let text = paragraphs
        .map(p => p.innerText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      text = text
        .split(/[.؟!]/)
        .filter(s => {
          const lower = s.toLowerCase();
          return (
            !lower.includes("المتقدمون") &&
            !lower.includes("اكتشف") &&
            !lower.includes("المزيد")
          );
        })
        .join(". ");

      const sentences = text
        .split(/[.؟!]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const summary =
        sentences.slice(0, 2).join(". ") +
        (sentences.length > 2 ? "..." : "");

      let deadline = null;
      const deadlineMatch = text.match(
        /(\d{1,2}\s+\S+\s+\d{4}(\s+\d{1,2}:\d{2})?)/
      );
      if (deadlineMatch && deadlineMatch[1]) {
        deadline = deadlineMatch[1].trim();
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
          !txt.includes("اكتشف") &&
          !txt.includes("المزيد") &&
          !txt.includes("المتقدمون") &&
          (
            txt.includes("تقديم") ||
            txt.includes("تسجيل") ||
            txt.includes("اضغط") ||
            txt.includes("تحديث البيانات")
          )
        ) {
          originalLink = href;
          break;
        }
      }

      // إذا لم يجد رابط، نتركه null
      return { summary, deadline, originalLink };
    });

    return result;
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
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    const feed = await parser.parseURL(RSS_URL);

    let added = 0;

    for (const item of feed.items) {
      const title = item.title?.trim();
      const pageLink = item.link?.trim();
      const created_at = item.pubDate ? new Date(item.pubDate) : new Date();

      if (!title || !pageLink) continue;

      if (
        newsData.some(n => n.title === title || n.link === pageLink)
      ) continue;

      const { summary, deadline, originalLink } =
        await extractData(page, pageLink);

        newsData.push({
        title,
        link: originalLink || null, // إذا لم يوجد link يظل null
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

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(newsData, null, 2)
    );

    console.log(`✅ تم حفظ ${added} خبر جديد`);
  } catch (err) {
    console.error("❌ خطأ عند جلب الأخبار:", err.message);
  } finally {
    if (browser) await browser.close();
  }
}

// أول تشغيل
scrapeNews();

// تحديث كل 10 دقائق
setInterval(scrapeNews, 10 * 60 * 1000);

/* ====================================== API ====================================== */
app.get("/api/news", (req, res) => {
  // إذا الرابط الأصلي مش موجود، نضع رسالة تعذر
  const items = newsData.map(n => ({
    ...n,
    displayLink: n.link
      ? n.link
      : "نعتذر، الرابط غير متوفر سيتم ارفاقه قريبًا"
  }));

  res.json({
    success: true,
    data: { items }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
