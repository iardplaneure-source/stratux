// MetarIconOL.browser.js
(function (global) {
  class MetarIconOL {
    constructor(opts = {}) {
      const defaults = {
        iconSize: [100, 80],
        className: 'ol-metar-icon',
        course: 0, speed: 0, color: '#8ED6FF',
        labelAnchor: [23, 0],
        windDirection: 0, windSpeed: 0, windGust: 0,
        Zoom: 0, stationName: '', temperature: null, conditions: 0,
        Lightning: 0, Snowing: 0, LgtAnim: 1.0,
        lgtImage: new Image(), snowImage: new Image(),
      };
      this.options = Object.assign({}, defaults, opts);
      this.x = 42; this.y = 50; this.x_fac = 0.18; this.y_fac = 0.18;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.options.iconSize[0];
      this.canvas.height = this.options.iconSize[1];
      this.canvas.style.letterSpacing = '1px';
      this.ctx = this.canvas.getContext('2d');
      if (!this.options.lgtImage.src) this.options.lgtImage.src = 'img/lightning.png';
      if (!this.options.snowImage.src) this.options.snowImage.src = 'img/snowflake.png';
      this._onImageLoad = null;
      this.options.lgtImage.onload = () => this._onImageLoad && this._onImageLoad();
      this.options.snowImage.onload = () => this._onImageLoad && this._onImageLoad();
      this.icon = new ol.style.Icon({ img: this.canvas, imgSize: this.options.iconSize });
      this.style = new ol.style.Style({ image: this.icon });
      this.draw();
    }
    getStyle = (feature, resolution) => {
      if (resolution) this.options.Zoom = Math.log2(156543.03392804097 / resolution);
      this._applyFeatureProps(feature);
      this.draw();
      return this.style;
    };
    _applyFeatureProps(feature) {
      ['windSpeed','windDirection','windGust','stationName','temperature',
       'conditions','course','Lightning','Snowing','color'].forEach(k => {
        const v = feature.get(k);
        if (v !== undefined) this.options[k] = k==='windDirection' ? (v % 360) : v;
      });
    }

    draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x = this.x;
    const y = this.y;

    ctx.clearRect(0, 0, w, h);

    // Snow flake (only if you later enable snowImage again)
    if (this.options.Snowing > 0 && this.options.snowImage && this.options.snowImage.complete) {
      ctx.save();
      ctx.drawImage(this.options.snowImage, x + 10, y + 2);
      ctx.restore();
    }

    // Lightning
    if (this.options.Lightning > 0 && this.options.lgtImage.complete) {
      ctx.save();
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.globalAlpha = this.options.LgtAnim || 1.0;
      ctx.drawImage(this.options.lgtImage, x + 12, y - 32, 24, 24);
      ctx.restore();
    }

    // Station label
    if (this.options.stationName && this.options.Zoom > 7) {
      ctx.save();
      ctx.font = 'bold 10px Tahoma';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const mt = ctx.measureText(this.options.stationName).width + 9;
      const tx = (w / 2) - mt;
      const ty = (h / 2) + 4;
      ctx.strokeText(this.options.stationName, tx, ty);
      ctx.fillStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.fillText(this.options.stationName, tx, ty);
      ctx.restore();
    }

    // Temperature
    if (this.options.temperature !== undefined && this.options.temperature !== null) {
      ctx.save();
      ctx.font = 'bold 11px Tahoma';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const tx = (w / 2) - 7;
      const ty = (h / 2) - 8;
      const tstr = String(this.options.temperature);
      ctx.strokeText(tstr, tx, ty);
      ctx.fillStyle = (Number(this.options.temperature) <= 32) ? '#0000FF' : '#FF0000';
      ctx.lineWidth = 4;
      ctx.fillText(tstr, tx, ty);
      ctx.restore();
    }

    // Gust “Gxx” rotated 30°
    const wsVal = parseInt(this.options.windSpeed || 0, 10);
    const wgVal = parseInt(this.options.windGust || 0, 10);
    if (wgVal > wsVal) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(30 * Math.PI / 180);
      ctx.translate(-w / 2, -h / 2);
      ctx.font = 'bold 11.5px Tahoma';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const txt = `G${this.options.windGust}`;
      ctx.strokeText(txt, (w / 2) + 10, (h / 2) + 10);
      ctx.fillStyle = '#FF0000';
      ctx.lineWidth = 5;
      ctx.fillText(txt, (w / 2) + 10, (h / 2) + 10);
      ctx.restore();
    }

    // Conditions text (TSRA, RA, FG, etc.)
    if (this.options.conditions) {
      ctx.save();
      ctx.font = 'bold 11px Tahoma';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      const tx = (w / 2) + 11;
      const ty = (h / 2) + 4;
      const cstr = String(this.options.conditions);
      ctx.strokeText(cstr, tx, ty);
      ctx.fillStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.fillText(cstr, tx, ty);
      ctx.restore();
    }

    // Course rotation + base circle (colored dot)
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((this.options.course || 0) * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);

    ctx.beginPath();
    const x_fac = this.x_fac;
    const y_fac = this.y_fac;
    ctx.arc(x + (45 * x_fac), y - (45 * y_fac), 45 * x_fac, 0, Math.PI * 2);
    ctx.fillStyle = this.options.color || '#8ED6FF';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.closePath();

    // Wind barb
    const ws = Number(this.options.windSpeed || 0);
    if (ws > 0) {
      const wd = Number(this.options.windDirection) || 0;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(wd * Math.PI / 180);
      ctx.translate(-w / 2, -h / 2);

      ctx.beginPath();
      ctx.moveTo((w / 2) - 1, y - 17);
      ctx.lineTo(w / 2, y - 45);
      ctx.lineWidth = 2.5;
      const center = w / 2;

      const spd = 5 * Math.round(ws / 5);    // round to 5 kt
      const tens = Math.floor(spd / 10);     // 10-kt barbs
      const half = (spd % 10) > 0;           // 5-kt half-barb?

      let carriage = 45;
      for (let i = 0; i < tens; i++) {
        ctx.moveTo(center, y - carriage);
        ctx.lineTo(center + 10, y - carriage - 8);
        carriage -= 5;
      }
      if (half) {
        if (tens === 0) carriage -= 5;
        ctx.moveTo(center, y - carriage);
        ctx.lineTo(center + 5, y - carriage - 4);
      }

      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // end course rotation
  }

    setWind(ws, wd) { this.options.windSpeed = +ws || 0; this.options.windDirection = (+wd||0)%360; }
    setSpeed(s) { this.options.speed = +s || 0; }
  }

  function metarMarker(coord, options = {}, extra = {}) {
    const icon = new MetarIconOL(options);
    const point = extra.useLonLat ? ol.proj.fromLonLat(coord) : coord;
    const feature = new ol.Feature({ geometry: new ol.geom.Point(point) });
    feature.setStyle((f, res) => icon.getStyle(f, res));
    icon._onImageLoad = () => feature.changed();
    feature.setWind = (ws, wd) => { icon.setWind(ws, wd); feature.set('windSpeed', +ws||0); feature.set('windDirection', +wd||0); feature.changed(); };
    feature.setSpeed = (s) => { icon.setSpeed(s); feature.set('speed', +s||0); feature.changed(); };
    return feature;
  }

  // expose a tidy namespace
  global.MetarIcon = { MetarIconOL, metarMarker };
})(window);

