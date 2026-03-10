(async function () {
  const box = document.getElementById("news-one");
  const loading = document.getElementById("loading");
  if (!box) return;

  // يقرأ slug من /g/xxx أو /news/xxx
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(pathParts[pathParts.length - 1] || "").trim();

  if (!slug) {
    if (loading) loading.style.display = "none";
    box.innerHTML = "<p>⚠️ لا يوجد خبر محدد</p>";
    return;
  }

  try {
    const res = await fetch("/api/news?limit=1000", {
      headers: { "x-api-key": "linkgaza_secret_2026" }
    });

    const json = await res.json();

    if (!res.ok || json?.success === false) {
      throw new Error(json?.message || "Access denied");
    }

    const items = json?.data?.items || [];
    const n = items.find((x) => x.slug === slug);

    if (loading) loading.style.display = "none";

    if (!n) {
      box.innerHTML = "<p>⚠️ الخبر غير موجود</p>";
      return;
    }

    const cleanSummary = (n.summary || "")
      .replace(/المتقدمون/gi, "")
      .trim();

    const deadlineText = (n.deadline || "").trim() || "غير محدد";

    const imgHtml = n.imageUrl
      ? `<img src="${n.imageUrl}" alt="صورة الخبر" style="max-width:100%;border-radius:14px;margin:10px 0;">`
      : "";

    const linkHtml = n.link
      ? `<a href="${n.link}" target="_blank" class="read-more-btn" style="display:inline-block;">
           🔗 التسجيل من هنا
         </a>`
      :   `<div style="color:red;font-weight:bold;">   سيتم ارفاق الرابط قريبا......</div>`;

    box.innerHTML = 
      `<div class="card" style="text-align:center;">
        ${imgHtml}

        <h2 style="margin:10px 0 12px;">${n.title}</h2>

        <div style="line-height:1.9;margin:10px 0 14px;text-align:center;">
          ${cleanSummary}
        </div>

        <p style="margin:0 0 14px;">
          ⏰ آخر موعد: <span style="color:red;font-weight:bold;">${deadlineText}</span>
        </p>

        ${linkHtml}

        <br><br>

        <a href="/index.html" class="read-more-btn" style="display:inline-block;margin:6px 0 14px;">
          ← الرجوع للصفحة الرئيسية
        </a>
      </div>`
    ;
  } catch (err) {
    if (loading) loading.style.display = "none";
    box.innerHTML = `<p>⚠️ فشل تحميل الخبر: ${err.message}</p>`;
    console.error(err);
  }
})();