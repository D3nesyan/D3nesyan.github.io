(function () {
  'use strict';

  var root = document.documentElement;
  var STORE_KEY = 'theme';

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncToggle() {
    var pressed = current() === 'dark' ? 'true' : 'false';
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-theme-toggle]'),
      function (btn) { btn.setAttribute('aria-pressed', pressed); }
    );
  }

  function apply(next, persist) {
    root.setAttribute('data-theme', next);
    if (persist) {
      try { localStorage.setItem(STORE_KEY, next); } catch (e) {}
    }
    syncToggle();
  }

  // 同步初始 toggle 状态
  syncToggle();

  // 手动切换。导航栏圆钮和 Dock 里各有一个，共用同一份 localStorage 状态，
  // 所以按属性绑定而不是按 id —— 两个元素用同一个 id 是无效 HTML，且
  // getElementById 只会返回第一个，另一个静默失效。
  Array.prototype.forEach.call(
    document.querySelectorAll('[data-theme-toggle]'),
    function (btn) {
      btn.addEventListener('click', function () {
        apply(current() === 'dark' ? 'light' : 'dark', true);
      });
    }
  );

  // 仅当主题配置为 auto 时跟随系统变化；用户手动选过就不再跟随
  if (root.getAttribute('data-auto') === '1' && window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function (e) {
      var saved = null;
      try { saved = localStorage.getItem(STORE_KEY); } catch (err) {}
      if (saved) return;
      apply(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onSystemChange);
    } else if (mq.addListener) {
      mq.addListener(onSystemChange);
    }
  }

  // 滚动入场
  var items = document.querySelectorAll('[data-animate]');
  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(items, function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var delays = new Map();

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.transitionDelay = (delays.get(el) || 0) + 'ms';
        el.classList.add('is-visible');
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

    Array.prototype.forEach.call(items, function (el, i) {
      delays.set(el, Math.min(i, 6) * 60);
      observer.observe(el);
    });
  }

  // ── 底部 Dock：跟随指针的选中椭圆 / 回到顶部 ──────────────────
  var dock = document.getElementById('dock');

  if (dock) {
    var inner = dock.querySelector('.dock__inner');
    var frost = dock.querySelector('.dock__frost');
    var pill = dock.querySelector('.dock__pill');
    var dockItems = Array.prototype.slice.call(dock.querySelectorAll('.dock__item'));
    var hovering = false;
    var pillTop = 0;      // 椭圆的纵向位置：所有按钮同高，量一次就够

    function measure() {
      if (!dockItems.length) return;
      var r = dockItems[0].getBoundingClientRect();
      pillTop = r.top - originX().top;
      pill.style.width = r.width + 'px';
      pill.style.height = r.height + 'px';
    }

    // 椭圆的坐标原点。绝对定位子的包含块是最近的那个 positioned 祖先 —— 是
    // .dock__inner，不是 .dock__frost（frost 只是它的兄弟）。left:0 落在 inner
    // 的 padding box 上，所以基准取 inner 的 border box 再减掉 inner 自己的边框
    // 宽度。之前错手减了 frost 的边框，椭圆整体偏左 1px。
    function originX() {
      var r = inner.getBoundingClientRect();
      var cs = getComputedStyle(inner);
      var b = parseFloat(cs.borderLeftWidth) || 0;
      return { left: r.left + b, top: r.top + (parseFloat(cs.borderTopWidth) || 0) };
    }

    // 把椭圆的**中心**放到指针的 x 上。
    //
    // 中心对的是指针，不是按钮 —— 鼠标停在哪椭圆就在哪，哪怕正卡在两个按钮
    // 之间。而「哪个按钮变蓝」由 :hover 决定，两者各管各的、互不影响。
    function centreAt(clientX) {
      var o = originX();
      var w = dockItems.length ? dockItems[0].offsetWidth : 60;
      pill.style.setProperty('--dock-x', (clientX - o.left - w / 2).toFixed(2) + 'px');
      pill.style.setProperty('--dock-y', pillTop.toFixed(2) + 'px');
    }

    function show() {
      pill.classList.add('is-on');
      dock.classList.add('dock--grow');
    }

    function hide() {
      hovering = false;
      pill.classList.remove('is-on');
      dock.classList.remove('dock--grow');
    }

    dock.addEventListener('mouseenter', function (e) {
      hovering = true;
      measure();
      centreAt(e.clientX);
      show();
    });

    // 每一次移动都要跟，所以这里不能用「悬停的按钮变了」当条件。
    dock.addEventListener('mousemove', function (e) {
      if (!hovering) { hovering = true; measure(); show(); }
      centreAt(e.clientX);
    });

    dock.addEventListener('mouseleave', hide);

    // 键盘 Tab 进来时没有指针，就把椭圆对到那个按钮的中心
    dock.addEventListener('focusin', function (e) {
      var i = dockItems.indexOf(e.target);
      if (i < 0) return;
      measure();
      var r = dockItems[i].getBoundingClientRect();
      centreAt(r.left + r.width / 2);
      show();
    });
    dock.addEventListener('focusout', function (e) {
      if (dock.contains(e.relatedTarget) || hovering) return;
      hide();
    });

    // ── Liquid Glass 透镜 ──────────────────────────────────────
    // 位移图算好、并且真的填进滤镜之后，才加 .dock--lensed 让 CSS 挂上 url()。
    // 顺序不能反：SVG 里没有图元的空滤镜会把元素渲染成全透明，先挂就是整条 Dock
    // 闪一下再出现；没有 JS 时则会一直消失。
    var barFilter = document.getElementById('dock-lens');
    var pillFilter = document.getElementById('dock-pill-lens');

    function buildLenses() {
      if (!window.AppleLens || !window.AppleLens.supported()) { return; }
      if (!barFilter || !pillFilter || !pill) { return; }

      // strength 定得比「看起来合理」大：磨砂的模糊会把小位移吃掉，位移必须
      // 大于模糊半径才看得见弯曲。bar 短边半长 30 × 0.28 ≈ 8.4px（模糊 6px）。
      var okBar = window.AppleLens.build(barFilter, frost, { band: 0.55, strength: 0.28 });

      // 椭圆的位移要单独算，因为它会被 transform 放大。
      // 位移图按未缩放尺寸生成，scale() 会把位移一起放大 —— 直接沿用 bar 的比例，
      // 屏幕上就是 22 × 0.28 × 1.6 ≈ 10px 的位移压在一个 96px 宽的元素上，
      // 弯得过头、糊成一团。
      // 所以按「想要的屏幕位移(px)」反推：先除以未缩放的短边半长，再除以放大倍数。
      var pillHalf = Math.min(pill.offsetWidth, pill.offsetHeight) / 2 || 22;
      var growMax = parseFloat(
        getComputedStyle(dock).getPropertyValue('--dock-grow-max')) || 1;
      var pillDispPx = 3.5;   // 最终落在屏幕上的最大位移
      var okPill = window.AppleLens.build(pillFilter, pill, {
        band: 0.60,
        strength: pillDispPx / pillHalf / growMax
      });

      // 尺寸为 0（≤768px 时 Dock 是 display:none）就构建不出来，保持兜底样式
      if (okBar && okPill) { dock.classList.add('dock--lensed'); }
    }

    buildLenses();

    // 尺寸变了，位移图要按新尺寸重算（逐像素的，所以节流）
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) { clearTimeout(resizeTimer); }
      resizeTimer = setTimeout(function () {
        resizeTimer = null;
        buildLenses();
        measure();
      }, 200);
    });

    var backTop = document.getElementById('dock-top');
    if (backTop) {
      backTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }
  }
})();
