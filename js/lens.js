// 位移图生成器：逐像素算出一条「折射偏移图」，编码进画布的 R/G 通道，
// 再作为 feImage 喂给 feDisplacementMap。
//
// 算法与思路来自 Shuding 的 liquid-glass（MIT 协议，2025）：
//   https://github.com/shuding/liquid-glass
// 本文件是按本主题需要重写的版本，主要改动是把 SDF 放到像素空间算 —— 元素宽高比
// 任意时形状才不会走样，参数也才好按「多少像素」来调，而不是一串归一化魔数。
//
// 为什么不用声明式的 feGaussianBlur(SourceAlpha) 那条路（本主题 v1 的做法）：
// 那条只能得到「边缘附近模糊地推一下」，画不出可控的镜面曲率。

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var XLINK = 'http://www.w3.org/1999/xlink';

  function smoothStep(a, b, t) {
    t = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // 圆角矩形的有符号距离场。0 在边界上，内部为负。单位跟随入参。
  function roundedRectSDF(x, y, halfW, halfH, r) {
    var qx = Math.abs(x) - halfW + r;
    var qy = Math.abs(y) - halfH + r;
    return Math.min(Math.max(qx, qy), 0) +
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }

  // 凸透镜剖面：越靠近边缘，采样点被往外推得越多（读到的是形状外面的内容），
  // 边缘处背景因此被压紧，整体读起来像一块鼓起来的玻璃。
  //
  // band / strength 都是「短边半长」的比例，不是绝对像素 —— 元素一大一小，
  // 同样的像素值在小的那块上会糊成一团，在大的那块上又看不出来。
  //
  // 方向必须取 SDF 的梯度（也就是真实的表面法线），不能用「从元素中心放射」。
  // 胶囊这种直边形状，长边中段的法线是垂直于边朝外的，放射方向却斜指着四角，
  // 直线经过长边附近就会被斜着扭走 —— 这正是之前看起来扭曲的原因。
  // SDF 光滑，用 1px 步长的中心差分求梯度就够了。
  function lensFragment(w, h, bandRatio, strengthRatio) {
    var halfW = w / 2;
    var halfH = h / 2;
    var r = Math.min(halfW, halfH);
    var band = r * bandRatio;
    var strength = r * strengthRatio;

    function sdf(x, y) {
      return roundedRectSDF(x, y, halfW, halfH, r);
    }

    return function (uv) {
      var x = uv.x * w - halfW;
      var y = uv.y * h - halfH;
      var d = sdf(x, y);
      var t = smoothStep(0, -band, d);   // 平坦的中段 0 → 边缘 1

      var gx = sdf(x + 1, y) - sdf(x - 1, y);
      var gy = sdf(x, y + 1) - sdf(x, y - 1);
      var gl = Math.hypot(gx, gy) || 1;

      // 位移在像素空间算，最后再折回 uv
      return [
        uv.x + (gx / gl) * t * strength / w,
        uv.y + (gy / gl) * t * strength / h
      ];
    };
  }

  // 把位移图算出并塞进 filterEl 里。返回是否成功。
  function build(filterEl, el, opts) {
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    if (!w || !h) { return false; }

    // 设备像素比决定图的精度：太低边缘会有台阶，太高白算。
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(w * dpr);
    var ch = Math.round(h * dpr);

    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    var data = new Uint8ClampedArray(cw * ch * 4);
    var raw = new Float32Array(cw * ch * 2);

    var fragment = lensFragment(w, h, opts.band, opts.strength);
    var maxScale = 0;
    var k = 0;
    var i, x, y, pos, dx, dy;

    for (i = 0; i < data.length; i += 4) {
      x = (i / 4) % cw;
      y = Math.floor(i / 4 / cw);
      pos = fragment({ x: x / cw, y: y / ch });
      dx = pos[0] * cw - x;
      dy = pos[1] * ch - y;
      if (Math.abs(dx) > maxScale) { maxScale = Math.abs(dx); }
      if (Math.abs(dy) > maxScale) { maxScale = Math.abs(dy); }
      raw[k++] = dx;
      raw[k++] = dy;
    }
    maxScale = Math.max(maxScale, 1);

    // feDisplacementMap 读的是 (通道值/255 - 0.5) * scale，所以 0.5 必须是「不位移」。
    k = 0;
    for (i = 0; i < data.length; i += 4) {
      data[i] = (raw[k++] / maxScale) * 127.5 + 127.5;
      data[i + 1] = (raw[k++] / maxScale) * 127.5 + 127.5;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(data, cw, ch), 0, 0);

    // 重建时先清掉旧图元，否则 filter 里会越堆越多
    while (filterEl.firstChild) { filterEl.removeChild(filterEl.firstChild); }

    var feImage = document.createElementNS(NS, 'feImage');
    feImage.setAttribute('width', String(w));
    feImage.setAttribute('height', String(h));
    feImage.setAttribute('result', filterEl.id + '_map');
    // 同一份数据 URL 写两个属性：Chrome 认 href，旧一点的实现只认 xlink:href
    var url = canvas.toDataURL();
    feImage.setAttribute('href', url);
    feImage.setAttributeNS(XLINK, 'xlink:href', url);

    var feDisp = document.createElementNS(NS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', filterEl.id + '_map');
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');
    // 图是按设备像素算的，scale 要折回 CSS 像素
    feDisp.setAttribute('scale', String(maxScale / dpr));

    filterEl.appendChild(feImage);
    filterEl.appendChild(feDisp);
    return true;
  }

  window.AppleLens = {
    build: build,
    // 语法支持不代表能用：非 Chromium 会直接忽略 backdrop-filter 里的 url() 引用
    supported: function () {
      return typeof CSS !== 'undefined' && CSS.supports &&
        CSS.supports('backdrop-filter', 'url(#a)');
    }
  };
})();
