const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "../data/news.json");
const URL = "https://www.motqdmon.com/search/label/%D8%A7%D9%84%D9%85%D8%B3%D8%A7%D8%B9%D8%A7%D8%AA";

const scrapeNews = async () => {
  let browser;
  try {
    // استخدام Chromium المدمج بدون executablePath
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

    const news = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll("h3.post-title").forEach((el, i) => {
        if (i >= 10) return; // أول 10 أخبار فقط
        const title = el.innerText.trim();
        const link = el.querySelector("a")?.href || "";
        results.push({ title, link });
      });
      return results;
    });

    if (!fs.existsSync(path.dirname(FILE_PATH))) {
      fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    }

    fs.writeFileSync(FILE_PATH, JSON.stringify(news, null, 2), "utf8");
    console.log(`✅ تم تحديث الأخبار (${news.length})`);

  } catch (err) {
    console.log("⚠️ خطأ أثناء جلب الأخبار:", err.message);
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = scrapeNews;
