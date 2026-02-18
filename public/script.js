const list = document.getElementById("news-list");
const toTop = document.getElementById("toTop");

let currentPage = 1;
const perPage = 10;

/* ===== Helpers ===== */
function getDeadline(n) {
  return n.deadline || "غير محدد";
}

/* ===== Load News ===== */
async function loadNews() {
  try {
    const res = await fetch("/api/news?limit=200", {
      headers: {
        "x-api-key": "linkgaza_secret_2026" // 🔐 الحماية فقط
      }
    });

    if (!res.ok) throw new Error("Access denied");

    const data = await res.json();
    const items = data?.data?.items || data?.data || [];

    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = "<p>لا توجد أخبار حاليًا</p>";
      return;
    }

    const totalPages = Math.ceil(items.length / perPage);
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const pageItems = items.slice(start, end);

    pageItems.forEach(n => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.textAlign = "center";

      const createdDate = new Date(n.created_at);
      const diffDays = Math.floor(
        (new Date() - createdDate) / (1000 * 60 * 60 * 24)
      );

      const newLabel =
        n.isNew && diffDays < 3
          ? "<strong style='color:red'>جديد</strong><br>"
          : "";
card.innerHTML = `
  <div class="card-img" style="background-image: url('/images/logo.jpg');"></div>
  <h3>${n.title}</h3>
  ${newLabel}
  <p>${n.summary || ""}</p>
  <p>🕒 تم الإضافة: ${createdDate.toLocaleString("ar-PS")}</p>
  <p>⏰ آخر موعد : ${  getDeadline(style='color:red'
    
  ) }</p>
  ${
    n.link
      ? `<a href="${n.link}" target="_blank" style="display:inline-block;margin-top:5px;">🔗 التسجيل من هنا</a>`
      : `<span style="color:red;font-weight:bold;display:inline-block;margin-top:5px;">نعتذر، الرابط غير متوفر سيتم ارفاقه قريبًا</span>`
  }`
;

      list.appendChild(card);

      if (diffDays >= 3) n.isNew = false;
    });

    /* ===== Pagination ===== */
    const pagination = document.createElement("div");
    pagination.className = "pagination";

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.className = i === currentPage ? "active" : "";
      btn.onclick = () => {
        currentPage = i;
        loadNews();
      };
      pagination.appendChild(btn);
    }

    list.appendChild(pagination);
  } catch (err) {
    console.error(err);
    list.innerHTML = "<p>⚠️ فشل تحميل الأخبار</p>";
  }
}

/* ===== Scroll To Top ===== */
window.addEventListener("scroll", () => {
  if (window.scrollY > 300) toTop.classList.add("show");
  else toTop.classList.remove("show");
});

toTop.onclick = () =>
  window.scrollTo({ top: 0, behavior: "smooth" });

/* ===== Navbar ===== */
(function () {
  const menuBtn = document.getElementById("menuBtn");
  const navLinks = document.getElementById("navLinks");

  if (!menuBtn || !navLinks) return;

  menuBtn.addEventListener("click", () => {
    navLinks.classList.toggle("active");
    menuBtn.classList.toggle("active");
  });

  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 900) {
        navLinks.classList.remove("active");
        menuBtn.classList.remove("active");
      }
    });
  });
})();

/* ===== Start ===== */
loadNews();