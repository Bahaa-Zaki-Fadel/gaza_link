const express = require("express");
const Parser = require("rss-parser");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const RSS_URL =
  "https://www.motqdmon.com/feeds/posts/default?alt=rss";

const parser = new Parser({
  timeout: 30000,
  headers: { "User-Agent": "Mozilla/5.0" }
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "news.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

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

async function extractData(page, link) {
  try {
    await page.goto(link, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    return await page.evaluate(() => {
      const paragraphs = Array.from(
        document.querySelectorAll("article p, main p")
      );

      const text = paragraphs
        .map(p => p.innerText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const sentences = text
        .split(/[.؟!]/)
        .map(s => s.trim())
        .filter(Boolean);

      const summary =
        sentences.slice(0, 2).join(". ") +
        (sentences.length > 2 ? "..." : "");

      return { summary };
    });
  } catch {
    return { summary: "" };
  }
}

async function scrapeNews() {
  console.log("🔍 بدأ تنفيذ scrapeNews");
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
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

      const { summary } = await extractData(page, pageLink);

      newsData.push({
        title,
        link: pageLink,
        created_at,
        summary
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
    console.error("❌ خطأ:", err.message);
  } finally {
    if (browser) await browser.close();
  }
}

scrapeNews();
setInterval(scrapeNews, 10 * 60 * 1000);

app.get("/api/news", (req, res) => {
  res.json({ success: true, items: newsData });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});