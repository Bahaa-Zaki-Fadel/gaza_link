const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const express = require("express");
const Parser = require("rss-parser");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static('public'));
app.get("/وظائف-غزة-اليوم", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wazayef-gaza.html"));
});
const PORT = process.env.PORT || 30000;
const RSS_URL = "https://www.motqdmon.com/feeds/posts/default?alt=rss";

const parser = new Parser({ timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "news.json");

// مجلد البيانات
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// تحميل الأخبار لو موجودة
let newsData = [];
if (fs.existsSync(DATA_FILE)) {
  try { newsData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } 
  catch { newsData = []; }
}

app.use(express.json());

// ====================================== استخراج البيانات من صفحة الخبر ======================================

async function extractData(page, link) {
  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });

    return await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll("article p, article div, main p, main div"));
      let text = paragraphs.map(p => p.innerText).join(" ").replace(/\s+/g, " ").trim();

      text = text
        .split(/[.؟!]/)
        .filter(s => !["المتقدمون", "اكتشف", "المزيد"].some(w => s.toLowerCase().includes(w)))
        .join(". ");

      const sentences = text.split(/[.؟!]/).map(s => s.trim()).filter(s => s.length > 0);
      const summary = sentences.slice(0, 2).join(". ") + (sentences.length > 2 ? "..." : "");

      // ===================== استخراج "آخر موعد" بشكل نظيف =====================
let deadline = null;

// نبحث عن كلمة مفتاحية أولاً
const keywordMatch = text.match(
  /(آخر\s*موعد(?:\s*للتقديم)?|ينتهي|حتى\s*تاريخ|آخر\s*تاريخ|آخر\s*يوم)/i
);

// نأخذ جزء صغير بعد الكلمة فقط (حتى لا نلتقط نص طويل)
const after =
  keywordMatch && keywordMatch.index != null
    ? text.slice(keywordMatch.index, keywordMatch.index + 120)
    : text.slice(0, 200);

// تاريخ رقمي مثل 28/2/2026 أو 28-02-2026
const dateNum =
  after.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/)?.[1] 
  after.match(/(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/)?.[1] 
  null;

// تاريخ بالكلمات مثل 28 فبراير 2026
const dateWords =
  after.match(
    /(\d{1,2}\s+(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+\d{4})/i
  )?.[1] || null;
  // وقت اختياري مثل 12:30
const timePart = after.match(/(\d{1,2}:\d{2})/)?.[1] || null;

if (dateWords) {
  deadline = dateWords + (timePart ?  `${timePart}` : "");
} else if (dateNum) {
  deadline = dateNum + (timePart ?  `${timePart}` : "");
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
          !["اكتشف", "المزيد", "المتقدمون"].some(w => txt.includes(w)) &&
          ["تقديم", "تسجيل", "اضغط", "تحديث البيانات"].some(w => txt.includes(w))
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
// ====================================== جلب الأخبار من RSS ======================================
async function scrapeNews() {
  console.log("🔍 بدأ تنفيذ scrapeNews");
  let browser;
  try {
    browser = await puppeteer.launch({ headless:true, args:["--no-sandbox","--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const feed = await parser.parseURL(RSS_URL);

    let added = 0;
    for(const item of feed.items){
      const title = item.title?.trim();
      const pageLink = item.link?.trim();
      const created_at = item.pubDate ? new Date(item.pubDate) : new Date();
      if(!title || !pageLink) continue;
      if (newsData.some(n => n.sourceLink === pageLink)) continue;

      const { summary, deadline, originalLink } = await extractData(page, pageLink);


      function createSlug(url) {
  const match = url.match(/\/(\d{4})\/(\d{2})\/([^\/]+)\.html/);
  if (!match) return Date.now().toString();
  return `${match[1]}-${match[2]}-${match[3]}`;
}

newsData.push({
  title,
  slug: createSlug(pageLink),   // 👈 الجديد
  link: originalLink || null,
  sourceLink: pageLink, // ⭐️ هذا هو المفتاح
  created_at,
  summary,
  deadline,
  isNew: true
});      console.log("✔️ أُضيف:", title);
    }

    newsData.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    fs.writeFileSync(DATA_FILE, JSON.stringify(newsData,null,2));
    console.log(`✅ تم حفظ ${added} خبر جديد`);
  } catch(err) {
    console.error("❌ خطأ عند جلب الأخبار:", err.message);
  } finally { if(browser) await browser.close(); }
}

// أول تشغيل
scrapeNews();
// تحديث كل 10 دقائق
setInterval(scrapeNews, 10*60*1000);
// ====================================== API مع حماية ذكية ======================================
const API_SECRET = "linkgaza_secret_2026";
app.get("/api/news", (req,res)=>{
  // السماح لو محلي للتجربة
  if(process.env.NODE_ENV === "production"){
    const key = req.headers["x-api-key"];
    if(key!==API_SECRET) return res.status(403).json({ success:false, message:"Access denied" });
  }

  const items = newsData.map(n=>({
    ...n,
    displayLink:n.link ? n.link : "نعتذر، الرابط غير متوفر   "
  }));

  res.json({ success:true, data:{ items } });
});
app.get("/news/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "news.html"));
});
app.listen(PORT,()=>console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`));