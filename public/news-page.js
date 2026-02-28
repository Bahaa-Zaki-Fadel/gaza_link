(async function () {
  const box = document.getElementById("news-one");
  const loading = document.getElementById("loading");
  if (!box) return;

  const path = window.location.pathname || "";

  // يدعم /g/xxx و /news/xxx
  let slug = "";
  if (path.startsWith("/g/")) slug = path.slice(3);
  else if (path.startsWith("/news/")) slug = path.slice(6);

  slug = decodeURIComponent((slug || "").trim()).replace(/\/$/, "");

  // دعم احتياطي لو كان الرابط ?id=
  if (!slug) {
    const params = new URLSearchParams(window.location.search);
    slug = decodeURIComponent((params.get("id") || "").trim()).replace(/\/$/, "");
  }

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
    const n = items.find(x => (x.slug || "") === slug);

    if (loading) loading.style.display = "none";

    if (!n) {
      box.innerHTML = "<p>⚠️ الخبر غير موجود</p>";
      return;
    }

    const createdDate = new Date(n.created_at);
    const cleanSummary = (n.summary || "").replace(/المتقدمون/gi, "").trim();
    const deadlineText = (n.deadline || "").trim() || "غير محدد";

    const imgHtml = n.imageUrl
      ? `<img src="${n.imageUrl}" alt="صورة الخبر" style="max-width:100%;border-radius:14px;margin:10px 0;">`
      : "";

    box.innerHTML = `
      <div class="card" style="text-align:center;">
        ${imgHtml}
        <h2 style="margin:10px 0 12px;">${n.title}</h2>

        <div style="line-height:1.9;margin:10px 0 14px;text-align:center;">
          ${cleanSummary}
        </div>

        <p style="margin:0 0 14px;">
          ⏰ آخر موعد: <span style="color:red;font-weight:bold;">${deadlineText}</span>
        </p>

        ${
          n.link
            ? `<a href="${n.link}" target="_blank" class="read-more-btn" style="display:inline-block;">
                 🔗 التسجيل من هنا
               </a>`
            : `<div style="color:red;font-weight:bold;">نعتذر، الرابط غير متوفر</div>`
        }

        <a href="/index.html" class="read-more-btn" style="display:inline-block;margin:10px 0 0;">
          ← الرجوع للصفحة الرئيسية
        </a>
      </div>
    `;
  } catch (err) {
    if (loading) loading.style.display = "none";
    box.innerHTML = `<p>⚠️ فشل تحميل الخبر: ${err.message}</p>`;
    console.error(err);
  }
})();
