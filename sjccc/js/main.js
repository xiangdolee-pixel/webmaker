(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ─── 헤더: 스크롤 시 배경 ─── */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ─── 모바일 내비게이션 ─── */
  var toggle = document.getElementById("navToggle");
  var gnb = document.getElementById("gnb");

  toggle.addEventListener("click", function () {
    var open = gnb.classList.toggle("open");
    toggle.classList.toggle("open", open);
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open);
    toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
    document.body.style.overflow = open ? "hidden" : "";
  });

  gnb.addEventListener("click", function (e) {
    if (e.target.tagName === "A" && gnb.classList.contains("open")) {
      gnb.classList.remove("open");
      toggle.classList.remove("open");
      header.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "메뉴 열기");
      document.body.style.overflow = "";
    }
  });

  /* ─── 배경 영상 페이드인 (히어로·후원/푸터) ─── */
  document.querySelectorAll(".cover-video iframe").forEach(function (v) {
    v.addEventListener("load", function () {
      v.classList.add("loaded");
    });
  });

  /* ─── 배경 영상 커버 리사이즈 ───
     모바일에서는 섹션 높이가 뷰포트보다 길어져 vh 기반 크기로는
     위아래가 비므로, 박스 실제 크기에 맞춰 16:9로 꽉 채운다 */
  var coverBoxes = document.querySelectorAll(".cover-video");

  function fitCoverVideos() {
    coverBoxes.forEach(function (box) {
      var iframe = box.querySelector("iframe");
      if (!iframe) return;
      var w = box.clientWidth;
      var h = box.clientHeight;
      var scale = Math.max(w / 16, h / 9);
      iframe.style.width = Math.ceil(16 * scale) + "px";
      iframe.style.height = Math.ceil(9 * scale) + "px";
    });
  }

  fitCoverVideos();
  window.addEventListener("resize", fitCoverVideos);
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(fitCoverVideos);
    coverBoxes.forEach(function (box) { ro.observe(box); });
  } else {
    window.addEventListener("load", fitCoverVideos);
  }

  /* ─── 스크롤 리빌 ─── */
  var reveals = document.querySelectorAll(".reveal");
  if (prefersReduced || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ─── 히어로 카운터 (연도는 콤마 없이) ─── */
  var counters = document.querySelectorAll(".count");

  function animateCount(el) {
    var target = parseInt(el.dataset.count, 10);
    var isYear = el.dataset.count === "2011";
    var fmt = function (n) { return isYear ? String(n) : n.toLocaleString(); };
    if (prefersReduced) {
      el.textContent = fmt(target);
      return;
    }
    var duration = 1600;
    var start = null;
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var counterIo = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        counterIo.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(function (el) { counterIo.observe(el); });


  /* ─── 연혁: 사진 없는 카드 → 가운데 정보 모달 (index 전용) ─── */
  var histModal = document.getElementById("histModal");

  function openHistModal(card) {
    var tag = card.dataset.tag;
    var hmTag = document.getElementById("hmTag");
    hmTag.textContent = tag;
    hmTag.className = "hm-tag tl-tag" + (tag === "수여" ? " award" : "");
    document.getElementById("hmDate").textContent = card.dataset.date;
    document.getElementById("hmTitle").textContent = card.querySelector(".hc-title").textContent;
    document.getElementById("hmSum").textContent = card.dataset.sum ? "누적 " + card.dataset.sum : "";
    histModal.classList.add("open");
    histModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeHistModal() {
    histModal.classList.remove("open");
    histModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (histModal) {
    histModal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeHistModal();
    });
  }

  /* ─── 연혁: 사진 있는 카드 → 풀스크린 스와이프 라이트박스 ─── */
  var lightbox = document.getElementById("lightbox");
  var lbTrack = document.getElementById("lbTrack");
  var lbCounter = document.getElementById("lbCounter");
  var lbDate = document.getElementById("lbDate");
  var lbDots = document.getElementById("lbDots");
  var lbPrev = lightbox.querySelector("[data-lb-prev]");
  var lbNext = lightbox.querySelector("[data-lb-next]");
  var lbTotal = 0;
  var lbItems = [];

  function lbIndex() {
    return Math.min(
      lbTotal - 1,
      Math.max(0, Math.round(lbTrack.scrollLeft / lbTrack.clientWidth))
    );
  }

  function updateLbUI() {
    var i = lbIndex();
    lbCounter.textContent = (i + 1) + "/" + lbTotal;
    lbDate.textContent = (lbItems[i] && lbItems[i].date) ? lbItems[i].date : "";
    lbPrev.disabled = i === 0;
    lbNext.disabled = i === lbTotal - 1;
    [].forEach.call(lbDots.children, function (dot, d) {
      dot.classList.toggle("active", d === i);
    });
  }

  function openLightbox(items, alt, start) {
    lbItems = items;
    lbTrack.innerHTML = "";
    lbDots.innerHTML = "";
    var showDots = items.length <= 12; // 많으면 점이 넘치므로 카운터만 표시
    items.forEach(function (item, i) {
      var slide = document.createElement("div");
      slide.className = "lb-slide";
      var img = document.createElement("img");
      img.src = item.src;
      img.alt = alt;
      img.draggable = false;
      slide.appendChild(img);
      lbTrack.appendChild(slide);

      if (showDots) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "lb-dot";
        dot.setAttribute("aria-label", (i + 1) + "번째 사진");
        dot.addEventListener("click", function () {
          lbTrack.scrollTo({ left: i * lbTrack.clientWidth, behavior: "smooth" });
        });
        lbDots.appendChild(dot);
      }
    });
    lbTotal = items.length;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lbTrack.scrollLeft = (start || 0) * lbTrack.clientWidth;
    updateLbUI();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lbTrack.innerHTML = "";
    lbDots.innerHTML = "";
  }

  function lbGo(dir) {
    lbTrack.scrollBy({ left: dir * lbTrack.clientWidth, behavior: "smooth" });
  }

  lbTrack.addEventListener("scroll", updateLbUI, { passive: true });
  lightbox.querySelector("[data-lb-close]").addEventListener("click", closeLightbox);
  lbPrev.addEventListener("click", function () { lbGo(-1); });
  lbNext.addEventListener("click", function () { lbGo(1); });

  document.querySelectorAll(".hist-card").forEach(function (card) {
    // 사역보고 버튼이 없는 카드에도 같은 높이의 상세보기 버튼을 넣어 카드 구조 통일
    if (!card.dataset.images) {
      var more = document.createElement("span");
      more.className = "hc-photos hc-more";
      more.textContent = "상세보기";
      card.querySelector(".hc-foot").appendChild(more);
    }
    card.addEventListener("click", function () {
      var files = card.dataset.images ? card.dataset.images.split(",") : [];
      if (files.length) {
        var cardDate = (card.dataset.date || "").replace(/\. /g, ".");
        var items = files.map(function (f) {
          return { src: "images/history/" + f.trim(), date: cardDate };
        });
        openLightbox(items, card.querySelector(".hc-title").textContent);
      } else {
        openHistModal(card);
      }
    });
  });

  document.addEventListener("keydown", function (e) {
    if (lightbox.classList.contains("open")) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lbGo(-1);
      if (e.key === "ArrowRight") lbGo(1);
    } else if (e.key === "Escape" && histModal && histModal.classList.contains("open")) {
      closeHistModal();
    }
  });

  /* ─── 포토 그리드 (홈 4컷 · 갤러리 전체) ─── */
  var galleryItems = window.GALLERY_ITEMS || [];

  function renderPhotoGrid(container, limit) {
    var items = limit ? galleryItems.slice(0, limit) : galleryItems;
    items.forEach(function (item, i) {
      var thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "photo-thumb";
      thumb.setAttribute("aria-label", item.caption || "사진 보기");
      var img = document.createElement("img");
      img.src = item.src;
      img.alt = item.caption || "";
      img.loading = "lazy";
      thumb.appendChild(img);
      if (item.date) {
        var date = document.createElement("span");
        date.className = "photo-date";
        date.textContent = item.date;
        thumb.appendChild(date);
      }
      thumb.addEventListener("click", function () {
        openLightbox(galleryItems, item.caption || "사진", i);
      });
      container.appendChild(thumb);
    });
  }

  var homePhotoGrid = document.getElementById("homePhotoGrid");
  if (homePhotoGrid) renderPhotoGrid(homePhotoGrid, 4);
  var galleryGrid = document.getElementById("galleryGrid");
  if (galleryGrid) renderPhotoGrid(galleryGrid);

  /* ─── 계좌번호 복사 ─── */
  var copyBtn = document.getElementById("copyBtn");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  if (copyBtn) copyBtn.addEventListener("click", function () {
    var number = document.getElementById("accountNumber").textContent.trim();

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toast.classList.remove("show");
      }, 2200);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(number).then(function () {
        showToast("계좌번호가 복사되었습니다");
      }, function () {
        fallbackCopy(number, showToast);
      });
    } else {
      fallbackCopy(number, showToast);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done("계좌번호가 복사되었습니다");
    } catch (e) {
      done("복사에 실패했습니다. 직접 입력해 주세요");
    }
    document.body.removeChild(ta);
  }
})();
