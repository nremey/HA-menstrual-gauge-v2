class MenstruationGaugeCard extends HTMLElement {
  static getStubConfig() {
    return {
      type: 'custom:menstruation-gauge-card',
      entity: 'sensor.menstruation',
      entry_id: '',
      friendly_name: '',
      theme_mode: 'auto',
      display_mode: 'gauge',
      title: '',
      show_fertile_period: true,
      calendar_edit_enabled: true,
      period_duration_days: 5,
      show_flower_day_numbers: false,
      show_flower_adjacent_months: true
    };
  }

  static getConfigElement() {
    return document.createElement('menstruation-gauge-card-editor');
  }

  setConfig(config) {
    if (!config || (!config.entity && !config.entry_id)) {
      throw new Error('entity or entry_id is required');
    }
    const showFertile = Object.prototype.hasOwnProperty.call(config, 'show_fertile_period')
      ? config.show_fertile_period !== false
      : config.show_ovulation_dots !== false;
    this._config = {
      show_editor: true,
      display_mode: 'gauge',
      calendar_edit_enabled: true,
      period_duration_days: 5,
      show_flower_day_numbers: false,
      show_flower_adjacent_months: true,
      ...config,
      show_fertile_period: showFertile
    };
    delete this._config.show_ovulation_dots;
    this._viewDate = new Date();
    this._userNavigated = false;
    this._editorOpen = false;
    this._render();
    this._scheduleTodayRefresh();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._scheduleTodayRefresh();
  }

  disconnectedCallback() {
    if (this._todayTimer) clearTimeout(this._todayTimer);
    this._todayTimer = null;
  }

  _scheduleTodayRefresh() {
    if (this._todayTimer) clearTimeout(this._todayTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
    this._todayTimer = setTimeout(() => {
      if (!this._userNavigated) this._viewDate = new Date();
      this._render();
      this._scheduleTodayRefresh();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }

  getCardSize() {
    return ['calendar', 'retro_pixel', 'comic_calendar', 'pirate_calendar'].includes(this._config?.display_mode) ? 3 : 4;
  }

  _ensureRoot() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' });
  }

  _lang() {
    const language = String(this._hass?.locale?.language || 'en').toLowerCase();
    return language.startsWith('de') ? 'de' : 'en';
  }

  _t(key) {
    const i18n = {
      de: { days_unit: 'Tage', days_unknown: '-- Tage' },
      en: { days_unit: 'days', days_unknown: '-- days' },
    };
    return (i18n[this._lang()] && i18n[this._lang()][key]) || (i18n.en[key] || key);
  }

  _normalizeISO(value) {
    const m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  _parseISO(iso) {
    const n = this._normalizeISO(iso);
    if (!n) return null;
    const [y, m, d] = n.split('-').map((x) => Number(x));
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  _isoFromDate(dt) {
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _dayDiff(aIso, bIso) {
    const a = this._parseISO(aIso);
    const b = this._parseISO(bIso);
    if (!a || !b) return 0;
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  _monthDays(dt) {
    return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  }

  _resolvePeriodDuration(attrs) {
    const sensorEffective = Number(attrs?.period_duration_days);
    const sensorLearned = Number(attrs?.period_duration_learned_avg_days);
    const sensorDefault = Number(attrs?.period_duration_default_days);
    const cfgRaw = this._config?.period_duration_days;
    const cfgText = String(cfgRaw ?? '').trim().toLowerCase();

    if (cfgText === 'learnt' || cfgText === 'learned') {
      if (Number.isFinite(sensorLearned)) return Math.max(1, Math.min(14, Math.round(sensorLearned)));
      if (Number.isFinite(sensorEffective)) return Math.max(1, Math.min(14, Math.round(sensorEffective)));
      if (Number.isFinite(sensorDefault)) return Math.max(1, Math.min(14, Math.round(sensorDefault)));
      return 5;
    }

    const cfgNum = Number(cfgRaw);
    if (Number.isFinite(cfgNum)) return Math.max(1, Math.min(14, Math.round(cfgNum)));
    if (Number.isFinite(sensorEffective)) return Math.max(1, Math.min(14, Math.round(sensorEffective)));
    if (Number.isFinite(sensorDefault)) return Math.max(1, Math.min(14, Math.round(sensorDefault)));
    return 5;
  }

  _buildModel(viewDateOverride = null) {
    const entityId = this._resolveEntityId();
    const stateObj = entityId ? this._hass?.states?.[entityId] : undefined;
    const attrs = stateObj?.attributes || {};
    const history = Array.isArray(attrs.history) ? attrs.history.map((x) => this._normalizeISO(x)).filter(Boolean) : [];
    const confirmedSet = new Set(history);
    const periodDuration = this._resolvePeriodDuration(attrs);
    const predicted = this._normalizeISO(attrs.next_predicted_start);
    const fertileStart = this._normalizeISO(attrs.fertile_window_start);
    const fertileEnd = this._normalizeISO(attrs.fertile_window_end);
    const ovulationDay = this._normalizeISO(attrs.ovulation_day);

    const viewDate = viewDateOverride || this._viewDate || new Date();
    const daysInMonth = this._monthDays(viewDate);
    const series = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(viewDate.getFullYear(), viewDate.getMonth(), day, 12, 0, 0, 0);
      const iso = this._isoFromDate(dt);
      series.push({
        day,
        iso,
        confirmed: confirmedSet.has(iso),
        fertile: fertileStart && fertileEnd ? (this._dayDiff(iso, fertileStart) >= 0 && this._dayDiff(fertileEnd, iso) >= 0) : false,
        ovulation: ovulationDay === iso
      });
    }

    return {
      entityId,
      stateObj,
      state: String(stateObj?.state || 'neutral'),
      history,
      confirmedSet,
      predicted,
      periodDuration,
      fertileStart,
      fertileEnd,
      ovulationDay,
      daysInMonth,
      series,
      todayIso: this._isoFromDate(new Date())
    };
  }

  _resolveEntityId() {
    const states = this._hass?.states || {};
    const configuredEntity = String(this._config?.entity || '').trim();
    if (configuredEntity && states[configuredEntity]) return configuredEntity;

    const targetEntryId = String(this._config?.entry_id || '').trim();
    if (targetEntryId) {
      const match = Object.keys(states).find((entityId) => {
        const st = states[entityId];
        return st?.attributes?.entry_id === targetEntryId;
      });
      if (match) return match;
    }
    return configuredEntity || null;
  }

  _stateBg(state) {
    if (state === 'period') return 'linear-gradient(135deg, rgba(252,231,243,.97), rgba(255,241,246,.95))';
    if (state === 'fertile') return 'linear-gradient(135deg, rgba(254,252,232,.97), rgba(255,255,255,.95))';
    if (state === 'pms') return 'linear-gradient(135deg, rgba(255,241,246,.96), rgba(255,250,252,.94))';
    return 'linear-gradient(135deg, rgba(255,255,255,.98), rgba(255,255,255,.95))';
  }

  _resolveThemeMode() {
    const mode = String(this._config?.theme_mode || 'auto').toLowerCase();
    if (mode === 'dark' || mode === 'light') return mode;
    return this._hass?.themes?.darkMode ? 'dark' : 'light';
  }

  _palette(state) {
    const dark = this._resolveThemeMode() === 'dark';
    if (!dark) {
      return {
        cardBg: this._stateBg(state),
        cardColor: '#4a044e',
        border: 'rgba(190,24,93,.20)',
        shadow: '0 8px 20px rgba(131,24,67,.10)',
        monthText: 'rgba(131,24,67,.72)',
        dayLabel: 'rgba(131,24,67,.68)',
        tick: 'rgba(190,24,93,.22)',
        confirmed: '#be123c',
        fertile: '#facc15',
        ovulation: '#16a34a',
        markerStroke: '#ffe4e6',
        hand: '#be123c',
        ring: 'rgba(190,24,93,.16)',
        countdownBg: 'rgba(255,255,255,.44)',
        countdownColor: '#831843',
        buttonBg: '#fff',
        buttonColor: '#831843',
        buttonBorder: 'rgba(190,24,93,.25)',
        dayBg: '#fff',
        dayColor: '#6b1b4a',
        dayBorder: 'rgba(190,24,93,.16)',
        dayToday: 'rgba(190,24,93,.35)',
      };
    }

    const bg = state === 'period'
      ? 'linear-gradient(135deg, rgba(52,16,31,.98), rgba(27,11,20,.98))'
      : state === 'fertile'
        ? 'linear-gradient(135deg, rgba(43,41,18,.98), rgba(20,20,16,.98))'
        : state === 'pms'
          ? 'linear-gradient(135deg, rgba(44,19,34,.98), rgba(20,14,21,.98))'
          : 'linear-gradient(135deg, rgba(26,19,27,.98), rgba(17,15,20,.98))';

    return {
      cardBg: bg,
      cardColor: '#f8d9e9',
      border: 'rgba(251,113,133,.34)',
      shadow: '0 10px 24px rgba(0,0,0,.34)',
      monthText: 'rgba(251,214,232,.82)',
      dayLabel: 'rgba(251,214,232,.78)',
      tick: 'rgba(251,113,133,.42)',
      confirmed: '#fb7185',
      fertile: '#fde047',
      ovulation: '#4ade80',
      markerStroke: '#2f1f29',
      hand: '#fb7185',
      ring: 'rgba(251,113,133,.32)',
      countdownBg: 'rgba(32,20,29,.72)',
      countdownColor: '#ffd4e6',
      buttonBg: 'rgba(41,27,36,.95)',
      buttonColor: '#ffd4e6',
      buttonBorder: 'rgba(251,113,133,.45)',
      dayBg: 'rgba(41,27,36,.95)',
      dayColor: '#f9d8e9',
      dayBorder: 'rgba(251,113,133,.30)',
      dayToday: 'rgba(251,113,133,.66)',
    };
  }

  _polar(cx, cy, r, deg) {
    const a = deg * Math.PI / 180;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }

  _arcPath(cx, cy, r, startDeg, endDeg) {
    const s = this._polar(cx, cy, r, startDeg);
    const e = this._polar(cx, cy, r, endDeg);
    const span = ((endDeg - startDeg) % 360 + 360) % 360;
    const largeArc = span > 180 ? 1 : 0;
    return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  }

  _confirmedRanges(series) {
    const days = (series || []).filter((step) => step.confirmed).map((step) => step.day).sort((a, b) => a - b);
    if (!days.length) return [];
    const ranges = [];
    let start = days[0];
    let prev = days[0];
    for (let i = 1; i < days.length; i += 1) {
      const day = days[i];
      if (day === prev + 1) {
        prev = day;
        continue;
      }
      ranges.push({ start, end: prev });
      start = day;
      prev = day;
    }
    ranges.push({ start, end: prev });
    return ranges;
  }

  _renderGauge(model, palette) {
    const cx = 210;
    const cy = 210;
    const rInner = 126;
    const baseTick = 4.2;
    const extraBar = 26;
    const total = model.daysInMonth || 30;
    const safePeriodDuration = Number.isFinite(Number(model.periodDuration))
      ? Math.max(1, Math.min(14, Math.round(Number(model.periodDuration))))
      : 5;
    const gaugeWidth = Number(this._lastCardWidth || 0);
    let labelStep = 1;
    if (gaugeWidth > 0 && gaugeWidth < 320) labelStep = 5;
    else if (gaugeWidth > 0 && gaugeWidth < 380) labelStep = 3;
    else if (gaugeWidth > 0 && gaugeWidth < 480) labelStep = 2;
    const now = new Date();
    const dayNow = now.getDate();
    const handAngle = -90 + ((((dayNow - 1) + now.getHours() / 24) / total) * 360);
    const isCurrentViewMonth = this._viewDate.getMonth() === now.getMonth()
      && this._viewDate.getFullYear() === now.getFullYear();

    const baseTicks = model.series.map((_, i) => {
      const angle = -90 + ((i / total) * 360);
      return `<g transform="translate(${cx} ${cy}) rotate(${angle})"><rect x="-1.3" y="-${(rInner + baseTick).toFixed(1)}" width="2.6" height="${baseTick.toFixed(1)}" rx="1.2" fill="${palette.tick}"></rect></g>`;
    }).join('');

    const dayLabels = model.series.map((step, i) => {
      const isFirst = step.day === 1;
      const isLast = step.day === total;
      if (!isFirst && !isLast && (step.day % labelStep !== 0)) return '';
      const angle = -90 + ((((i + 0.5) / total) * 360));
      const pos = this._polar(cx, cy, 178, angle);
      return `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" fill="${palette.dayLabel}" font-size="10" text-anchor="middle" dominant-baseline="middle">${step.day}</text>`;
    }).join('');

    const confirmedArcBars = this._confirmedRanges(model.series).map((range) => {
        const startAngle = -90 + ((((range.start - 1) + 0.08) / total) * 360);
        const endAngle = -90 + ((((range.end) - 0.08) / total) * 360);
        const dPath = this._arcPath(cx, cy, rInner + extraBar * 0.74, startAngle, endAngle);
        return `<path class="confirmed-arc" d="${dPath}" fill="none" stroke="${palette.confirmed}" stroke-width="9" stroke-linecap="round" stroke-opacity="0.78"></path>`;
      }).join('');

    const showFertile = this._config?.show_fertile_period !== false;
    const fertileBars = model.series.map((step) => {
      if (!showFertile) return '';
      if (!step.fertile) return '';
      const day = step.day;
      const startAngle = -90 + ((((day - 1) + 0.08) / total) * 360);
      const endAngle = -90 + ((((day - 0.08) / total) * 360));
      const dPath = this._arcPath(cx, cy, rInner + extraBar * 0.46, startAngle, endAngle);
      return `<path class="fertile-arc" d="${dPath}" fill="none" stroke="${palette.fertile}" stroke-width="6" stroke-linecap="round" stroke-opacity=".62"></path>`;
    }).join('');

    const ovulationMarker = model.series.map((step, i) => {
      if (!showFertile || !step.ovulation) return '';
      const angle = -90 + ((((i + 0.5) / total) * 360));
      const pos = this._polar(cx, cy, rInner + extraBar * 0.46, angle);
      return `<circle class="ovulation-marker" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="5.2" fill="${palette.ovulation}" stroke="${palette.markerStroke}" stroke-width="2"></circle>`;
    }).join('');

    let predictedMarker = '';
    let predictedBars = '';
    const predictedDt = this._parseISO(model.predicted);
    if (predictedDt) {
      const predictedDaysInView = Array.from({ length: safePeriodDuration }).map((_, idx) => {
        const dt = new Date(predictedDt);
        dt.setDate(dt.getDate() + idx);
        if (dt.getMonth() !== this._viewDate.getMonth() || dt.getFullYear() !== this._viewDate.getFullYear()) return null;
        return dt.getDate();
      }).filter((day) => day !== null);

      if (predictedDaysInView.length) {
        const firstDay = predictedDaysInView[0];
        const lastDay = predictedDaysInView[predictedDaysInView.length - 1];
        const startAngle = -90 + ((((firstDay - 1) + 0.10) / total) * 360);
        const endAngle = -90 + ((((lastDay) - 0.10) / total) * 360);
        const predictedRadius = rInner + extraBar * 1.35;
        const dPath = this._arcPath(cx, cy, predictedRadius, startAngle, endAngle);
        predictedBars = `<path class="predicted-arc" d="${dPath}" fill="none" stroke="${palette.confirmed}" stroke-width="8" stroke-linecap="round" stroke-opacity="0.48"></path>`;

        const startIsInView = predictedDt.getFullYear() === this._viewDate.getFullYear()
          && predictedDt.getMonth() === this._viewDate.getMonth();
        if (startIsInView) {
          const angle = -90 + ((((predictedDt.getDate() - 1) + 0.5) / total) * 360);
          const pos = this._polar(cx, cy, predictedRadius, angle);
          predictedMarker = `<circle class="predicted-marker" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="5.2" fill="${palette.confirmed}" stroke="${palette.markerStroke}" stroke-width="2"></circle>`;
        }
      }
    }

    const handA = this._polar(cx, cy, rInner - 2, handAngle);
    const handB = this._polar(cx, cy, rInner + extraBar - 2, handAngle);
    const monthLabel = new Intl.DateTimeFormat(this._hass?.locale?.language || 'de', { month: 'long' }).format(this._viewDate);

    return `
      <svg class="gauge" viewBox="0 0 420 420" role="img" aria-label="Menstruation gauge">
        <text x="${cx}" y="44" class="month">${monthLabel}</text>
        ${dayLabels}
        ${baseTicks}
        ${fertileBars}
        ${ovulationMarker}
        ${predictedBars}
        ${confirmedArcBars}
        ${predictedMarker}
        ${isCurrentViewMonth ? `<line x1="${handA.x.toFixed(1)}" y1="${handA.y.toFixed(1)}" x2="${handB.x.toFixed(1)}" y2="${handB.y.toFixed(1)}" stroke="${palette.hand}" stroke-width="1.9" stroke-linecap="round"></line>` : ''}
        <circle cx="${cx}" cy="${cy}" r="106" fill="none" stroke="${palette.ring}" stroke-width="1"></circle>
      </svg>
    `;
  }

  _calendarGrid(model, locale) {
    const y = this._viewDate.getFullYear();
    const m = this._viewDate.getMonth();
    const first = new Date(y, m, 1, 12, 0, 0, 0);
    const count = new Date(y, m + 1, 0).getDate();
    const firstDowMon0 = (first.getDay() + 6) % 7;
    const totalCells = Math.ceil((firstDowMon0 + count) / 7) * 7;
    const dows = this._weekdayLabels(locale || this._hass?.locale?.language || 'de');

    const items = [];
    dows.forEach((d) => items.push(`<div class="dow">${d}</div>`));

    for (let i = 0; i < totalCells; i++) {
      const day = i - firstDowMon0 + 1;
      const valid = day >= 1 && day <= count;
      if (!valid) {
        items.push('<button class="day other" type="button" disabled></button>');
        continue;
      }
      const iso = this._isoFromDate(new Date(y, m, day, 12, 0, 0, 0));
      const active = model.confirmedSet.has(iso);
      const today = iso === model.todayIso;
      const step = model.series.find((row) => row.iso === iso);
      const predictedOffset = model.predicted ? this._dayDiff(iso, model.predicted) : -1;
      const predicted = predictedOffset === 0;
      const predictedPeriod = predictedOffset >= 0 && predictedOffset < model.periodDuration;
      const fertile = this._config?.show_fertile_period !== false && Boolean(step?.fertile);
      const ovulation = this._config?.show_fertile_period !== false && Boolean(step?.ovulation);
      items.push(`<button class="day ${active ? 'active' : ''} ${predictedPeriod ? 'predicted-period' : ''} ${predicted ? 'predicted' : ''} ${fertile ? 'fertile' : ''} ${ovulation ? 'ovulation' : ''} ${today ? 'today' : ''}" type="button" data-iso="${iso}"><span class="day-number">${day}</span>${fertile ? '<span class="fertile-dot" aria-hidden="true"></span>' : ''}</button>`);
    }
    return items.join('');
  }

  _renderRetroGauge(model, countdown, locale) {
    const total = model.daysInMonth || 30;
    const showFertile = this._config?.show_fertile_period !== false;
    const cells = model.series.map((step, index) => {
      const angle = -90 + ((index / total) * 360);
      const radians = angle * Math.PI / 180;
      const left = 50 + Math.cos(radians) * 42;
      const top = 50 + Math.sin(radians) * 42;
      const predictedOffset = model.predicted ? this._dayDiff(step.iso, model.predicted) : -1;
      const predictedPeriod = predictedOffset >= 0 && predictedOffset < model.periodDuration;
      const classes = [step.confirmed ? 'active' : '', predictedPeriod ? 'predicted-period' : '', predictedOffset === 0 ? 'predicted' : '', showFertile && step.fertile ? 'fertile' : '', showFertile && step.ovulation ? 'ovulation' : '', step.iso === model.todayIso ? 'today' : ''].filter(Boolean).join(' ');
      return `<span class="retro-gauge-day ${classes}" style="left:${left.toFixed(3)}%;top:${top.toFixed(3)}%">${step.day}</span>`;
    }).join('');
    const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(this._viewDate).toUpperCase();
    return `<button type="button" class="retro-gauge" data-action="open-calendar" aria-label="${this._lang() === 'de' ? 'Retro-Kalender öffnen' : 'Open retro calendar'}">${cells}<span class="retro-gauge-core"><span>${month}</span><strong>${countdown}</strong></span></button>`;
  }

  _renderFlowerGauge(model, countdown, locale) {
    const cx = 210;
    const cy = 185;
    const total = model.daysInMonth || 30;
    const showFertile = this._config?.show_fertile_period !== false;
    const dark = this._resolveThemeMode() === 'dark';
    const predicted = this._parseISO(model.predicted);
    const now = new Date();
    const isCurrentMonth = this._viewDate.getMonth() === now.getMonth()
      && this._viewDate.getFullYear() === now.getFullYear();
    const todayDay = isCurrentMonth ? now.getDate() : null;
    const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(this._viewDate);

    const petals = model.series.map((step, index) => {
      // The petal path already points up at 0deg. Day 1 therefore needs no
      // offset; positive SVG rotation places later days clockwise.
      const angle = (index / total) * 360;
      const predictedOffset = predicted ? this._dayDiff(step.iso, model.predicted) : -1;
      const predictedPeriod = predictedOffset >= 0 && predictedOffset < model.periodDuration;
      let fill = dark ? '#fffdf8' : '#ffffff';
      let stroke = dark ? '#b7aebb' : '#d8d1d9';
      let labelColor = '#4b3f4b';
      let dash = '';
      if (showFertile && step.fertile) {
        fill = '#f7d84a';
        stroke = '#c59d14';
      }
      if (predictedPeriod) {
        fill = dark ? '#9d4055' : '#f6a6b5';
        stroke = dark ? '#f19aae' : '#c84261';
        labelColor = dark ? '#fff' : '#64172b';
        dash = 'stroke-dasharray="4 3"';
      }
      if (step.confirmed) {
        fill = dark ? '#e05a70' : '#d93654';
        stroke = dark ? '#ffb4c0' : '#991b35';
        labelColor = '#fff';
        dash = '';
      }
      if (showFertile && step.ovulation && !step.confirmed && !predictedPeriod) {
        fill = '#f4b928';
        stroke = '#8d6910';
      }
      return `<g class="flower-petal" transform="translate(${cx} ${cy}) rotate(${angle})">
        <path d="M -8 -61 C -18 -76 -16 -101 0 -119 C 16 -101 18 -76 8 -61 C 5 -55 -5 -55 -8 -61 Z" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash}></path>
        ${this._config?.show_flower_day_numbers === true ? `<text x="0" y="-79" fill="${labelColor}" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${-angle} 0 -79)">${step.day}</text>` : ''}
      </g>`;
    }).join('');

    let bee = '';
    if (todayDay) {
      const angle = -90 + (((todayDay - 1) / total) * 360);
      const pos = this._polar(cx, cy, 91, angle);
      bee = `<g class="flower-bee" transform="translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})" role="img" aria-label="${this._lang() === 'de' ? `Heute, Tag ${todayDay}` : `Today, day ${todayDay}`}">
        <ellipse class="bee-wing" cx="-8" cy="-7" rx="8" ry="5" transform="rotate(-28 -8 -7)"></ellipse>
        <ellipse class="bee-wing" cx="8" cy="-7" rx="8" ry="5" transform="rotate(28 8 -7)"></ellipse>
        <ellipse class="bee-body" cx="0" cy="1" rx="11" ry="8"></ellipse>
        <path class="bee-stripe" d="M -5 -6 Q -8 1 -5 8 M 2 -7 Q -1 1 2 9"></path>
        <circle class="bee-head" cx="10" cy="0" r="5"></circle>
        <circle class="bee-eye" cx="12" cy="-1" r="1.2"></circle>
      </g>`;
    }

    const showAdjacentMonths = this._config?.show_flower_adjacent_months !== false;
    const previousDate = showAdjacentMonths ? new Date(this._viewDate.getFullYear(), this._viewDate.getMonth() - 1, 1, 12) : null;
    const nextDate = showAdjacentMonths ? new Date(this._viewDate.getFullYear(), this._viewDate.getMonth() + 1, 1, 12) : null;
    const previousModel = previousDate ? this._buildModel(previousDate) : null;
    const nextModel = nextDate ? this._buildModel(nextDate) : null;

    return `<div class="flower-composition">
      <button type="button" class="flower-gauge" data-action="open-calendar" aria-label="${this._lang() === 'de' ? 'Blumenkalender öffnen' : 'Open flower calendar'}">
        <svg viewBox="0 0 420 420" role="img" aria-label="${this._lang() === 'de' ? 'Monatsblume' : 'Monthly flower'}">
          ${petals}${bee}
          <circle class="flower-center-disc" cx="${cx}" cy="${cy}" r="58"></circle>
          <text class="flower-month" x="${cx}" y="${cy - 8}" text-anchor="middle">${month}</text>
          <text class="flower-countdown" x="${cx}" y="${cy + 15}" text-anchor="middle">${countdown}</text>
        </svg>
      </button>
      ${showAdjacentMonths ? this._renderMiniFlower(previousModel, previousDate, locale, 'prev') : ''}
      ${showAdjacentMonths ? this._renderMiniFlower(nextModel, nextDate, locale, 'next') : ''}
    </div>`;
  }

  _renderMiniFlower(model, viewDate, locale, direction) {
    const cx = 60;
    const cy = 55;
    const total = model.daysInMonth || 30;
    const showFertile = this._config?.show_fertile_period !== false;
    const dark = this._resolveThemeMode() === 'dark';
    const petals = model.series.map((step, index) => {
      const angle = (index / total) * 360;
      const predictedOffset = model.predicted ? this._dayDiff(step.iso, model.predicted) : -1;
      const predictedPeriod = predictedOffset >= 0 && predictedOffset < model.periodDuration;
      let fill = dark ? '#fffdf8' : '#fff';
      let stroke = dark ? '#b7aebb' : '#d8d1d9';
      let dash = '';
      if (showFertile && step.fertile) {
        fill = '#f7d84a';
        stroke = '#c59d14';
      }
      if (predictedPeriod) {
        fill = dark ? '#9d4055' : '#f6a6b5';
        stroke = dark ? '#f19aae' : '#c84261';
        dash = 'stroke-dasharray="2 2"';
      }
      if (step.confirmed) {
        fill = dark ? '#e05a70' : '#d93654';
        stroke = dark ? '#ffb4c0' : '#991b35';
        dash = '';
      }
      return `<g transform="translate(${cx} ${cy}) rotate(${angle})"><path d="M -2.5 -17 C -5 -23 -5 -31 0 -37 C 5 -31 5 -23 2.5 -17 C 1.5 -15 -1.5 -15 -2.5 -17 Z" fill="${fill}" stroke="${stroke}" stroke-width=".8" ${dash}></path></g>`;
    }).join('');
    const now = new Date();
    const isCurrentMonth = viewDate.getMonth() === now.getMonth() && viewDate.getFullYear() === now.getFullYear();
    let bee = '';
    if (isCurrentMonth) {
      const angle = -90 + (((now.getDate() - 1) / total) * 360);
      const pos = this._polar(cx, cy, 27, angle);
      bee = `<circle class="mini-bee" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="3.5"></circle>`;
    }
    const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(viewDate);
    const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewDate);
    const navLabel = this._lang() === 'de' ? `${monthYear} auswählen` : `Select ${monthYear}`;
    return `<button type="button" class="mini-flower mini-flower-${direction}" data-flower-nav="${direction}" aria-label="${navLabel}">
      <svg viewBox="0 0 120 110" aria-hidden="true">${petals}${bee}<circle class="mini-flower-center" cx="${cx}" cy="${cy}" r="16"></circle><text x="${cx}" y="${cy + 3}" text-anchor="middle">${month}</text></svg>
    </button>`;
  }

  _weekdayLabels(locale) {
    const monday = new Date(Date.UTC(2026, 0, 5)); // Monday
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const label = formatter.format(d).replace('.', '').trim();
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  }

  async _toggleCycleStart(iso) {
    if (this._config?.calendar_edit_enabled === false) return;
    const model = this._buildModel();
    const service = model.confirmedSet.has(iso) ? 'remove_cycle_start' : 'add_cycle_start';
    const profile = model.stateObj?.attributes?.profile;
    const entityId = model.entityId || this._config?.entity || '';
    const entryId = model.stateObj?.attributes?.entry_id || this._config?.entry_id || '';
    const attempts = [];
    attempts.push({ date: iso, ...(entityId ? { entity_id: entityId } : {}), ...(profile ? { profile } : {}), ...(entryId ? { entry_id: entryId } : {}) });
    attempts.push({ date: iso, ...(entityId ? { entity_id: entityId } : {}), ...(profile ? { profile } : {}) });
    attempts.push({ date: iso, ...(profile ? { profile } : {}), ...(entryId ? { entry_id: entryId } : {}) });
    attempts.push({ date: iso, ...(profile ? { profile } : {}) });
    attempts.push({ date: iso });

    let lastError = null;
    for (const payload of attempts) {
      try {
        await this._hass.callService('menstruation_gauge', service, payload);
        return;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Service call failed');
  }

  async _refreshSensorEntity(entityId) {
    const eid = String(entityId || '').trim();
    if (!eid) return;
    try {
      await this._hass.callService('homeassistant', 'update_entity', { entity_id: eid });
    } catch (_) {
      // Ignore environments where update_entity is unavailable.
    }
  }

  _attachHandlers() {
    this.shadowRoot.querySelector('[data-action="open-calendar"]')?.addEventListener('click', () => {
      this._editorOpen = !this._editorOpen;
      this._render();
    });
    this.shadowRoot.querySelectorAll('[data-flower-nav]').forEach((button) => button.addEventListener('click', () => {
      const delta = button.getAttribute('data-flower-nav') === 'prev' ? -1 : 1;
      this._userNavigated = true;
      this._viewDate = new Date(this._viewDate.getFullYear(), this._viewDate.getMonth() + delta, 1, 12);
      this._render();
    }));
    this.shadowRoot.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
      this._userNavigated = true;
      this._viewDate = new Date(this._viewDate.getFullYear(), this._viewDate.getMonth() - 1, 1);
      this._render();
    });
    this.shadowRoot.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
      this._userNavigated = true;
      this._viewDate = new Date(this._viewDate.getFullYear(), this._viewDate.getMonth() + 1, 1);
      this._render();
    });
    if (this._config?.calendar_edit_enabled !== false) {
      this.shadowRoot.querySelector('[data-action="toggle-editor"]')?.addEventListener('click', () => {
        this._editorOpen = !this._editorOpen;
        this._render();
      });
    }

    if (this._config?.calendar_edit_enabled !== false) {
      this.shadowRoot.querySelectorAll('.grid, .retro-gauge').forEach((calendar) => calendar.addEventListener('click', async (ev) => {
        const btn = ev.target?.closest?.('.day[data-iso]');
        if (!btn) return;
        const iso = btn.getAttribute('data-iso');
        if (!iso || this._toggleInFlight) return;
        this._toggleInFlight = true;
        try {
          await this._toggleCycleStart(iso);
          await this._refreshSensorEntity(this._buildModel().entityId);
          this._render();
        } catch (err) {
          // Keep a visible trace in browser console when backend rejects the write.
          // This avoids silent failures in the editor calendar.
          // eslint-disable-next-line no-console
          console.error('menstruation-gauge-card: failed to toggle cycle day', err);
        } finally {
          this._toggleInFlight = false;
        }
      }));
    }
  }

  _render() {
    this._ensureRoot();
    if (!this._config || !this._hass) return;

    const model = this._buildModel();
    const palette = this._palette(model.state);
    this._lastCardWidth = this.getBoundingClientRect()?.width || 0;
    const locale = this._hass?.locale?.language || 'de';
    const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(this._viewDate);
    const cardTitle = String(this._config.title || '').trim();
    const friendlyName = String(this._config.friendly_name || '').trim();
    const canEdit = this._config?.calendar_edit_enabled !== false;
    const retroCalendar = this._config?.display_mode === 'retro_pixel';
    const retroGauge = this._config?.display_mode === 'retro_gauge';
    const comicCalendar = this._config?.display_mode === 'comic_calendar';
    const comicGauge = this._config?.display_mode === 'comic_gauge';
    const pirateCalendar = this._config?.display_mode === 'pirate_calendar';
    const pirateGauge = this._config?.display_mode === 'pirate_gauge';
    const flowerGauge = this._config?.display_mode === 'flower_gauge';
    const specialTheme = this._resolveThemeMode();
    const calendarOnly = this._config?.display_mode === 'calendar' || retroCalendar || comicCalendar || pirateCalendar;
    const daysUntil = Number(model.stateObj?.attributes?.days_until_next_start);
    const isOverdueSoon = Number.isFinite(daysUntil) && daysUntil <= -3;
    const countdown = Number.isFinite(daysUntil)
      ? `${daysUntil} ${this._t('days_unit')}`
      : this._t('days_unknown');

    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          border-radius: 16px;
          border: 1px solid ${palette.border};
          background: ${palette.cardBg};
          color: ${palette.cardColor};
          box-shadow: ${palette.shadow};
          padding: 10px;
          overflow: hidden;
        }
        .wrap { display: grid; gap: 10px; }
        .head { display: grid; gap: 2px; }
        .friendly { font-size: .78rem; font-weight: 600; color: ${palette.monthText}; text-align: left; }
        .title-label { font-size: .95rem; font-weight: 700; color: ${palette.cardColor}; text-align: left; }
        .gauge-wrap { position: relative; max-width: 420px; width: 100%; aspect-ratio: 1/1; margin: 0 auto; }
        button.gauge-wrap { display:block; padding:0; border:0; background:transparent; color:inherit; cursor:pointer; }
        .gauge { width: 100%; height: 100%; display: block; }
        .month { font-size: 12px; fill: ${palette.monthText}; font-weight: 700; letter-spacing: .02em; text-anchor: middle; dominant-baseline: middle; }
        .center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .countdown { pointer-events: auto; border-radius: 999px; border: 1px solid ${palette.buttonBorder}; padding: 4px 10px; background: ${palette.countdownBg}; cursor: pointer; font-size: 1.05rem; font-weight: 700; color: ${palette.countdownColor}; }
        .countdown.overdue-soon { border-style: dashed; border-width: 2px; }
        .countdown.passive { cursor: default; pointer-events: none; opacity: .92; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .title { font-weight: 700; }
        .nav { display: inline-flex; gap: 6px; }
        .btn { border: 1px solid ${palette.buttonBorder}; border-radius: 8px; background: ${palette.buttonBg}; color: ${palette.buttonColor}; padding: 4px 8px; cursor: pointer; }
        .editor { display: ${this._editorOpen ? 'grid' : 'none'}; gap: 8px; }
        .calendar-only { display: grid; gap: 10px; }
        .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .dow { text-align: center; font-size: 12px; opacity: .75; }
        .day { position: relative; min-height: 38px; border: 1px solid ${palette.dayBorder}; border-radius: 8px; background: ${palette.dayBg}; color: ${palette.dayColor}; cursor: pointer; display: grid; place-items: center; }
        .day-number { line-height: 1; }
        .day.active { background: ${palette.confirmed}; color: #fff; border-color: ${palette.confirmed}; }
        .day.predicted-period { background: color-mix(in srgb, ${palette.confirmed} 22%, ${palette.dayBg}); }
        .day.predicted { border: 2px solid ${palette.confirmed}; box-shadow: inset 0 0 0 1px ${palette.markerStroke}; font-weight: 800; }
        .day.today { outline: 3px solid ${palette.dayToday}; outline-offset: 1px; font-weight: 800; }
        .fertile-dot { position: absolute; bottom: 3px; width: 6px; height: 6px; border-radius: 50%; background: #facc15; box-shadow: 0 0 0 1px rgba(113,63,18,.3); }
        .day.ovulation .fertile-dot { width: 9px; height: 9px; background: #eab308; }
        .day.other { opacity: .3; }
        ha-card.retro-pixel { border: 3px solid #ff5ca8; border-radius: 0; background: #17111f; color: #ffe9f5; box-shadow: 6px 6px 0 #572044; image-rendering: pixelated; }
        .retro-pixel .wrap, .retro-pixel button { font-family: ui-monospace, "Cascadia Mono", "Courier New", monospace; }
        .retro-pixel .head { padding: 4px 6px; border: 2px solid #5ce1e6; background: #25172d; text-transform: uppercase; }
        .retro-pixel .friendly, .retro-pixel .title-label { color: #ffe9f5; letter-spacing: .08em; }
        .retro-calendar { gap: 8px; }
        .retro-calendar .toolbar { min-height: 38px; padding: 4px 6px; border: 2px solid #5ce1e6; background: #25172d; }
        .retro-calendar .title { color: #ffe66d; text-transform: uppercase; letter-spacing: .08em; text-shadow: 2px 2px 0 #7d315d; }
        .retro-calendar .btn { border: 2px solid #ff5ca8; border-radius: 0; background: #17111f; color: #5ce1e6; box-shadow: 2px 2px 0 #7d315d; font-weight: 900; }
        .retro-calendar .btn:active { transform: translate(2px,2px); box-shadow: none; }
        .retro-calendar .grid { gap: 2px; padding: 3px; border: 2px solid #7d315d; background: #41213c; }
        .retro-calendar .dow { padding: 5px 1px; background: #25172d; color: #5ce1e6; font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .retro-calendar .day { min-height: 43px; border: 2px solid #6c3b63; border-radius: 0; background: #211529; color: #ffe9f5; font-weight: 800; }
        .retro-calendar .day:hover { background: #34203d; border-color: #5ce1e6; }
        .retro-calendar .day.active { border-color: #ff9dcc; background: #c92f78; color: #fff; box-shadow: inset -3px -3px 0 #7e1d52; }
        .retro-calendar .day.active::after { content: "♥"; position: absolute; right: 3px; top: 1px; color: #ffe66d; font-size: 10px; }
        .retro-calendar .day.predicted-period { background: repeating-linear-gradient(135deg,#211529 0 5px,#5a294e 5px 10px); }
        .retro-calendar .day.predicted { border: 2px dashed #ff5ca8; box-shadow: none; }
        .retro-calendar .day.today { outline: 2px solid #5ce1e6; outline-offset: -4px; color: #5ce1e6; }
        .retro-calendar .fertile-dot { width: 7px; height: 7px; border-radius: 0; background: #ffe66d; box-shadow: 1px 1px 0 #8f6b20; }
        .retro-calendar .day.ovulation .fertile-dot { width: 9px; height: 9px; border-radius: 0; background: #61e294; box-shadow: 1px 1px 0 #176b42; }
        .retro-calendar .day.other { border-color: #352037; background: #17111f; opacity: .55; }
        .retro-status { padding: 5px 7px; border: 2px solid #7d315d; background: #25172d; color: #ff9dcc; font-family: ui-monospace, "Courier New", monospace; font-size: .72rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
        .retro-gauge-shell { padding: 8px; border: 3px solid #ff5ca8; border-radius: 0; background: #17111f; box-shadow: 6px 6px 0 #572044; color: #ffe9f5; }
        .retro-gauge { position: relative; display:block; width: min(100%,420px); aspect-ratio: 1; margin: 0 auto; padding:0; border:0; background:transparent; color:inherit; cursor:pointer; font-family: ui-monospace,"Cascadia Mono","Courier New",monospace; }
        .retro-gauge-day { position: absolute; width: 27px; height: 27px; padding: 0; transform: translate(-50%,-50%); border: 2px solid #6c3b63; border-radius: 0; background: #211529; color: #ffe9f5; font: 800 10px/1 ui-monospace,"Courier New",monospace; cursor: pointer; box-shadow: 2px 2px 0 #3d1734; }
        .retro-gauge-day.active { border-color: #ff9dcc; background: #c92f78; color: #fff; }.retro-gauge-day.predicted-period { background: repeating-linear-gradient(135deg,#211529 0 4px,#5a294e 4px 8px); }.retro-gauge-day.predicted { border: 2px dashed #ff5ca8; }.retro-gauge-day.fertile { background:#9b7b16;color:#fff;box-shadow:2px 2px 0 #3d1734; }.retro-gauge-day.ovulation { background:#267a51;color:#fff;box-shadow:2px 2px 0 #3d1734; }.retro-gauge-day.today { outline: 2px solid #5ce1e6; outline-offset: 2px; color: #5ce1e6; }
        .retro-gauge-core { position: absolute; inset: 31%; display: grid; place-content: center; gap: 6px; border: 4px double #5ce1e6; background: #25172d; text-align: center; box-shadow: 5px 5px 0 #572044; }.retro-gauge-core>span { color: #000; font-weight: 900; letter-spacing: .06em; }.retro-gauge-core>strong{color:#ff9dcc;font-size:1rem;font-weight:900}
        @media(max-width:340px){.retro-gauge-day{width:23px;height:23px;font-size:9px}.retro-gauge-core{inset:33%}}
        ha-card.comic-card { border: 4px solid #171717; border-radius: 18px 8px 20px 10px; background-color: #fff8d8; background-image: radial-gradient(#f3b3cb 1.2px,transparent 1.2px); background-size: 8px 8px; color: #171717; box-shadow: 7px 7px 0 #171717; }
        .comic-card .head { padding: 7px 10px; border: 3px solid #171717; border-radius: 12px 5px 13px 6px; background: #7ee0f2; transform: rotate(-.4deg); }.comic-card .friendly,.comic-card .title-label{color:#171717;font-family:"Comic Sans MS","Trebuchet MS",sans-serif;font-weight:900;text-transform:uppercase;text-shadow:1px 1px 0 #fff;}
        .comic-calendar .toolbar { padding: 7px 9px; border: 3px solid #171717; border-radius: 12px 6px; background: #ffe765; transform: rotate(.25deg); }.comic-calendar .title { font: 900 1.05rem "Comic Sans MS","Trebuchet MS",sans-serif; text-transform: uppercase; }.comic-calendar .btn { border: 3px solid #171717; border-radius: 50%; background: #ff6fae; color: #171717; box-shadow: 2px 2px 0 #171717; font-weight: 900; }.comic-calendar .grid { gap: 5px; padding: 6px; }.comic-calendar .dow { color: #171717; font: 900 11px "Comic Sans MS","Trebuchet MS",sans-serif; text-transform: uppercase; }.comic-calendar .day { min-height: 43px; border: 3px solid #171717; border-radius: 10px 5px 11px 6px; background: #fff; color: #171717; font: 900 13px "Comic Sans MS","Trebuchet MS",sans-serif; box-shadow: 2px 2px 0 #171717; }.comic-calendar .day:nth-child(3n){transform:rotate(.6deg)}.comic-calendar .day:nth-child(3n+1){transform:rotate(-.5deg)}.comic-calendar .day.active { background:#ff6fae;color:#171717;border-color:#171717; }.comic-calendar .day.predicted-period { background:repeating-linear-gradient(-45deg,#fff 0 5px,#ffc8df 5px 10px); }.comic-calendar .day.predicted { outline:3px dashed #e51d75;outline-offset:-6px;box-shadow:2px 2px 0 #171717; }.comic-calendar .day.today { outline:4px solid #25b9d4;outline-offset:1px; }.comic-calendar .fertile-dot { width:9px;height:9px;border:2px solid #171717;background:#ffe11f; }.comic-calendar .day.ovulation .fertile-dot{width:11px;height:11px;background:#55d88b;border:2px solid #171717;}
        .comic-status { padding:6px 9px;border:3px solid #171717;border-radius:14px 5px;background:#fff;color:#171717;font:900 .76rem "Comic Sans MS","Trebuchet MS",sans-serif;text-align:center;text-transform:uppercase;box-shadow:3px 3px 0 #171717; }
        .comic-gauge-shell { position:relative;padding:8px;border:4px solid #171717;border-radius:50% 46% 49% 45%;background-color:#fff8d8;background-image:radial-gradient(#ef9fc0 1px,transparent 1px);background-size:13px 13px;box-shadow:7px 7px 0 #171717; }.comic-gauge-shell .gauge{filter:drop-shadow(2px 2px 0 #171717)}.comic-gauge-shell .gauge text:not(.month){font-size:14px;font-weight:900;paint-order:stroke;stroke:#fff8d8;stroke-width:2px}.comic-gauge-shell .month{font-family:"Comic Sans MS","Trebuchet MS",sans-serif;font-weight:900;fill:#171717}.comic-gauge-shell .countdown{border:4px solid #171717;border-radius:48% 52% 46% 54%;background:#ffe765;color:#171717;box-shadow:4px 4px 0 #171717;font-family:"Comic Sans MS","Trebuchet MS",sans-serif;font-weight:900;transform:rotate(-2deg)}
        .retro-pixel.theme-light { border-color:#9d174d;background:#fff1f7;color:#3f102d;box-shadow:6px 6px 0 #e7a7c4 }.retro-pixel.theme-light .head,.retro-pixel.theme-light .retro-calendar .toolbar,.retro-pixel.theme-light .retro-status{background:#ffe4ef;color:#3f102d;border-color:#167f8d}.retro-pixel.theme-light .retro-calendar .title{color:#9d174d;text-shadow:2px 2px 0 #ffd166}.retro-pixel.theme-light .retro-calendar .grid{background:#edb4ce;border-color:#9d5a82}.retro-pixel.theme-light .retro-calendar .dow{background:#ffe4ef;color:#167f8d}.retro-pixel.theme-light .retro-calendar .day{background:#fffafd;color:#3f102d;border-color:#c77b9e;box-shadow:2px 2px 0 #d5a1b8}.retro-pixel.theme-light .retro-calendar .day.active{background:#d9367b;color:#fff}.retro-pixel.theme-light .retro-calendar .day.predicted-period{background:repeating-linear-gradient(135deg,#fffafd 0 5px,#f6c5da 5px 10px)}
        .retro-gauge-shell.theme-light{border-color:#9d174d;background:#fff1f7;color:#3f102d;box-shadow:6px 6px 0 #e7a7c4}.retro-gauge-shell.theme-light .retro-gauge-day{background:#fffafd;color:#3f102d;border-color:#c77b9e;box-shadow:2px 2px 0 #d5a1b8}.retro-gauge-shell.theme-light .retro-gauge-day.active{background:#d9367b;color:#fff}.retro-gauge-shell.theme-light .retro-gauge-day.predicted-period{background:repeating-linear-gradient(135deg,#fffafd 0 4px,#f6c5da 4px 8px)}.retro-gauge-shell.theme-light .retro-gauge-day.fertile{background:#ffe66d;color:#3f102d}.retro-gauge-shell.theme-light .retro-gauge-day.ovulation{background:#61e294;color:#173d2c}.retro-gauge-shell.theme-light .retro-gauge-core{background:#ffe4ef;border-color:#167f8d;box-shadow:5px 5px 0 #e7a7c4}
        .comic-card.theme-dark{border-color:#f7e9f1;background-color:#211522;background-image:radial-gradient(#7f3e68 1.2px,transparent 1.2px);color:#fff4fa;box-shadow:7px 7px 0 #050405}.comic-card.theme-dark .head{background:#176f80;border-color:#f7e9f1}.comic-card.theme-dark .friendly,.comic-card.theme-dark .title-label{color:#fff;text-shadow:1px 1px 0 #111}.comic-card.theme-dark .comic-calendar .toolbar{background:#8c6b0b;border-color:#f7e9f1}.comic-card.theme-dark .comic-calendar .title{color:#fff}.comic-card.theme-dark .comic-calendar .btn{background:#b72d6d;color:#fff;border-color:#f7e9f1;box-shadow:2px 2px 0 #050405}.comic-card.theme-dark .comic-calendar .dow{color:#fff}.comic-card.theme-dark .comic-calendar .day{background:#302031;color:#fff;border-color:#f7e9f1;box-shadow:2px 2px 0 #050405}.comic-card.theme-dark .comic-calendar .day.active{background:#c73879;color:#fff}.comic-card.theme-dark .comic-calendar .day.predicted-period{background:repeating-linear-gradient(-45deg,#302031 0 5px,#6b3151 5px 10px)}.comic-card.theme-dark .comic-status{background:#302031;color:#fff;border-color:#f7e9f1;box-shadow:3px 3px 0 #050405}
        .comic-gauge-shell.theme-dark{border-color:#f7e9f1;background-color:#211522;background-image:radial-gradient(#7f3e68 1px,transparent 1px);background-size:13px 13px;box-shadow:7px 7px 0 #050405}.comic-gauge-shell.theme-dark .gauge text:not(.month){stroke:#211522}.comic-gauge-shell.theme-dark .month{fill:#fff}.comic-gauge-shell.theme-dark .countdown{border-color:#f7e9f1;background:#8c6b0b;color:#fff;box-shadow:4px 4px 0 #050405}
        .retro-gauge-day { display:grid;place-items:center;box-sizing:border-box; }
        .comic-gauge-shell .countdown { position:relative;display:inline-block;padding:9px 14px;border-radius:18px 18px 18px 5px; }
        .comic-gauge-shell .countdown::after { content:"";position:absolute;left:13px;bottom:-9px;width:13px;height:13px;background:#ffe765;border-right:4px solid #171717;border-bottom:4px solid #171717;transform:skew(-18deg) rotate(45deg); }
        .comic-gauge-shell.theme-dark .countdown::after { background:#8c6b0b;border-color:#f7e9f1; }
        .comic-gauge-shell { padding:14px;border:5px solid #18131a;border-radius:28px 12px 32px 15px;background-color:#ffd9e8;background-image:radial-gradient(#e95c98 1px,transparent 1px);background-size:16px 16px;box-shadow:9px 9px 0 #18131a;transform:rotate(-.25deg); }
        .comic-gauge-shell button.gauge-wrap { overflow:visible;border:4px solid #18131a;border-radius:50%;background:#fffdf4;box-shadow:inset 0 0 0 8px #72dce9,5px 5px 0 #18131a;transform:rotate(.25deg); }
        .comic-gauge-shell .gauge { position:relative;z-index:1;filter:none; }
        .comic-gauge-shell .gauge rect { fill:#18131a; }
        .comic-gauge-shell .gauge text:not(.month) { fill:#18131a;font:900 15px/1 "Comic Sans MS","Trebuchet MS",sans-serif;paint-order:stroke;stroke:#fffdf4;stroke-width:3px;stroke-linejoin:round; }
        .comic-gauge-shell .month { fill:#18131a;font:900 17px/1 "Comic Sans MS","Trebuchet MS",sans-serif;letter-spacing:.08em;text-transform:uppercase;paint-order:stroke;stroke:#ffe765;stroke-width:7px;stroke-linejoin:round; }
        .comic-gauge-shell .center { z-index:2; }
        .comic-gauge-shell .countdown { padding:11px 17px;border:4px solid #18131a;border-radius:20px 20px 20px 6px;background:#ffe765;color:#18131a;box-shadow:4px 4px 0 #18131a;font:900 1.15rem/1 "Comic Sans MS","Trebuchet MS",sans-serif;transform:rotate(-3deg); }
        .comic-gauge-shell .countdown::after { left:15px;bottom:-10px;width:14px;height:14px;background:#ffe765;border-right:4px solid #18131a;border-bottom:4px solid #18131a; }
        .comic-gauge-shell.theme-dark { border-color:#fff4fa;background-color:#3a2035;background-image:radial-gradient(#b9487c 1px,transparent 1px);background-size:16px 16px;box-shadow:9px 9px 0 #080508; }
        .comic-gauge-shell.theme-dark button.gauge-wrap { border-color:#fff4fa;background:#241722;box-shadow:inset 0 0 0 8px #19798a,5px 5px 0 #080508; }
        .comic-gauge-shell.theme-dark .gauge rect { fill:#fff4fa; }
        .comic-gauge-shell.theme-dark .gauge text:not(.month) { fill:#fff4fa;stroke:#241722; }
        .comic-gauge-shell.theme-dark .month { fill:#fff;stroke:#b38a18; }
        .comic-gauge-shell.theme-dark .countdown { border-color:#fff4fa;background:#b38a18;color:#fff;box-shadow:4px 4px 0 #080508; }
        .comic-gauge-shell.theme-dark .countdown::after { background:#b38a18;border-color:#fff4fa; }
        ha-card.pirate-card { border:4px solid #4a2b16;border-radius:14px;background-color:#e7c98f;background-image:linear-gradient(92deg,transparent 0 48%,rgba(91,54,25,.08) 49% 51%,transparent 52%),repeating-linear-gradient(0deg,rgba(104,65,29,.06) 0 1px,transparent 1px 7px);color:#302012;box-shadow:7px 8px 0 #4a2b16;font-family:Georgia,"Times New Roman",serif; }
        .pirate-card .head { padding:7px 10px;border:2px solid #69401f;border-radius:4px;background:#f2dba7;box-shadow:3px 3px 0 rgba(74,43,22,.5); }
        .pirate-card .friendly,.pirate-card .title-label { color:#352113;font-family:Georgia,"Times New Roman",serif;font-weight:800;letter-spacing:.04em; }
        .pirate-gauge-shell { padding:14px;border:9px ridge #79502b;border-radius:50%;background:#8c5b2f;box-shadow:0 0 0 3px #3c2413,7px 8px 0 rgba(45,27,15,.65); }
        .pirate-gauge-shell button.gauge-wrap { overflow:visible;border:3px solid #5c391d;border-radius:50%;background-color:#ead29c;background-image:radial-gradient(circle at 28% 32%,rgba(255,249,218,.75),transparent 32%),repeating-radial-gradient(circle at 50% 50%,transparent 0 29px,rgba(97,62,28,.08) 30px 31px);box-shadow:inset 0 0 20px rgba(78,45,19,.35); }
        .pirate-gauge-shell .gauge rect { fill:#5a3a20; }
        .pirate-gauge-shell .gauge text:not(.month) { fill:#382315;font:800 13px/1 Georgia,"Times New Roman",serif;paint-order:stroke;stroke:#ead29c;stroke-width:3px; }
        .pirate-gauge-shell .month { fill:#4b190f;font:900 16px/1 Georgia,"Times New Roman",serif;letter-spacing:.1em;text-transform:uppercase;paint-order:stroke;stroke:#e9c56e;stroke-width:6px; }
        .pirate-gauge-shell .confirmed-arc { stroke:#a92f27;stroke-width:11px; }
        .pirate-gauge-shell .predicted-arc { stroke:#a92f27;stroke-width:8px;stroke-dasharray:8 6; }
        .pirate-gauge-shell .predicted-marker { fill:#a92f27;stroke:#f2d477; }
        .pirate-gauge-shell .fertile-arc { stroke:#168b91;stroke-width:8px;stroke-opacity:.9; }
        .pirate-gauge-shell .ovulation-marker { fill:#f2c94c;stroke:#4a2b16;stroke-width:3px; }
        .pirate-gauge-shell .countdown { padding:9px 14px;border:3px solid #5a351b;border-radius:4px;background:#f0d58e;color:#3a2414;box-shadow:4px 4px 0 #5a351b;font:900 1.02rem/1 Georgia,"Times New Roman",serif;transform:rotate(-2deg); }
        .pirate-calendar { gap:9px;padding:7px;border:3px solid #69401f;border-radius:6px;background-color:#e9d39f;background-image:linear-gradient(35deg,transparent 48%,rgba(81,121,116,.09) 49% 51%,transparent 52%);box-shadow:inset 0 0 18px rgba(78,45,19,.2); }
        .pirate-calendar .toolbar { padding:7px 9px;border:3px double #765027;border-radius:3px;background:#3f2a19;color:#f3d98f; }
        .pirate-calendar .title { font:900 1rem Georgia,"Times New Roman",serif;letter-spacing:.08em;text-transform:uppercase; }
        .pirate-calendar .btn { border:2px solid #d6ad54;border-radius:3px;background:#6b4324;color:#fff0bc;font-weight:900;box-shadow:2px 2px 0 #2c1b10; }
        .pirate-calendar .grid { gap:4px;padding:5px;border:2px solid #8a6537;background:rgba(247,228,181,.62); }
        .pirate-calendar .dow { color:#51351e;font:900 10px Georgia,"Times New Roman",serif;text-transform:uppercase; }
        .pirate-calendar .day { min-height:43px;border:1px solid #947144;border-radius:2px;background:#f2deb0;color:#392618;font:800 13px Georgia,"Times New Roman",serif;box-shadow:1px 2px 0 rgba(77,48,25,.35); }
        .pirate-calendar .day.fertile { background:#77c6c1;color:#173e3e;border-color:#287b7b; }
        .pirate-calendar .day.ovulation { background:#e8bd4e;color:#3a2a08;border:2px solid #7d5912; }
        .pirate-calendar .day.predicted-period { background:repeating-linear-gradient(-45deg,#eed6a1 0 6px,#d99180 6px 12px); }
        .pirate-calendar .day.predicted { border:2px dashed #9e2e27;box-shadow:none; }
        .pirate-calendar .day.active { background:#a92f27;color:#fff5dc;border-color:#641b17;box-shadow:inset -3px -3px 0 #711d18; }
        .pirate-calendar .day.today { outline:3px double #176f75;outline-offset:1px; }
        .pirate-calendar .fertile-dot { display:none; }
        .pirate-calendar .day.ovulation::after { content:"✕";position:absolute;right:3px;top:1px;color:#6a4807;font-size:11px;font-weight:900; }
        .pirate-card.theme-dark { border-color:#a87a38;background-color:#101f2c;background-image:linear-gradient(32deg,transparent 48%,rgba(55,139,145,.1) 49% 51%,transparent 52%),repeating-linear-gradient(0deg,rgba(205,170,91,.04) 0 1px,transparent 1px 8px);color:#f4e2b8;box-shadow:7px 8px 0 #050a0f; }
        .pirate-card.theme-dark .head { border-color:#b58a48;background:#172d3c; }
        .pirate-card.theme-dark .friendly,.pirate-card.theme-dark .title-label { color:#f4e2b8; }
        .pirate-gauge-shell.theme-dark { border-color:#9a6b32;background:#3c2718;box-shadow:0 0 0 3px #d0a152,7px 8px 0 #050a0f; }
        .pirate-gauge-shell.theme-dark button.gauge-wrap { border-color:#c69a4f;background-color:#132937;background-image:radial-gradient(circle at 28% 32%,rgba(45,105,111,.28),transparent 32%),repeating-radial-gradient(circle at 50% 50%,transparent 0 29px,rgba(221,185,102,.08) 30px 31px); }
        .pirate-gauge-shell.theme-dark .gauge rect { fill:#e8d39b; }
        .pirate-gauge-shell.theme-dark .gauge text:not(.month) { fill:#f7e7bf;stroke:#132937; }
        .pirate-gauge-shell.theme-dark .month { fill:#f3d477;stroke:#4b190f; }
        .pirate-gauge-shell.theme-dark .countdown { border-color:#c69a4f;background:#243d49;color:#f4dfa8;box-shadow:4px 4px 0 #070d12; }
        .pirate-card.theme-dark .pirate-calendar { border-color:#a87a38;background-color:#142a38;background-image:linear-gradient(35deg,transparent 48%,rgba(49,151,155,.12) 49% 51%,transparent 52%); }
        .pirate-card.theme-dark .pirate-calendar .toolbar { border-color:#b88b42;background:#0b1822;color:#f2d477; }
        .pirate-card.theme-dark .pirate-calendar .grid { border-color:#806433;background:rgba(8,23,32,.72); }
        .pirate-card.theme-dark .pirate-calendar .dow { color:#d8bd7b; }
        .pirate-card.theme-dark .pirate-calendar .day { border-color:#6e6042;background:#193442;color:#f2dfb4;box-shadow:1px 2px 0 #071018; }
        .pirate-card.theme-dark .pirate-calendar .day.fertile { background:#176c70;color:#e8ffff;border-color:#53aaa8; }
        .pirate-card.theme-dark .pirate-calendar .day.ovulation { background:#a77c20;color:#fff3c5;border-color:#e3bd58; }
        .pirate-card.theme-dark .pirate-calendar .day.predicted-period { background:repeating-linear-gradient(-45deg,#193442 0 6px,#633b3b 6px 12px); }
        .pirate-card.theme-dark .pirate-calendar .day.active { background:#8f2824;color:#fff3da;border-color:#d06458; }
        ha-card.flower-card { background:linear-gradient(180deg,#eaf5e8 0%,#f8fbf3 64%,#dcefcf 100%);border-color:rgba(55,112,60,.28);color:#304a32; }
        .flower-composition { position:relative;width:min(100%,420px);aspect-ratio:1;margin:0 auto; }
        .flower-gauge { display:block;width:min(100%,420px);aspect-ratio:1;margin:0 auto;padding:0;border:0;background:transparent;cursor:pointer;color:inherit; }
        .flower-gauge svg { display:block;width:100%;height:100%;overflow:visible; }
        .flower-petal { filter:drop-shadow(0 2px 1px rgba(55,40,55,.12)); }
        .flower-bee { filter:drop-shadow(0 2px 2px rgba(38,30,12,.35));pointer-events:none; }
        .bee-wing { fill:rgba(225,246,255,.88);stroke:#738c98;stroke-width:1.2; }
        .bee-body { fill:#f5c928;stroke:#302916;stroke-width:1.5; }
        .bee-stripe { fill:none;stroke:#302916;stroke-width:3; }
        .bee-head { fill:#302916; }
        .bee-eye { fill:#fff; }
        .mini-flower { position:absolute;z-index:2;bottom:2px;width:31%;max-width:128px;aspect-ratio:12/11;padding:0;border:0;background:transparent;color:#445344;cursor:pointer;transition:transform .16s ease; }
        .mini-flower:hover { transform:scale(1.06); }
        .mini-flower-prev { left:1%; }
        .mini-flower-next { right:1%; }
        .mini-flower svg { display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 2px 2px rgba(45,62,43,.18)); }
        .mini-flower-center { fill:#f2c94c;stroke:#bd9218;stroke-width:1.4; }
        .mini-flower text { fill:#4c3510;font:700 8px/1 sans-serif;text-transform:capitalize; }
        .mini-bee { fill:#f5c928;stroke:#302916;stroke-width:1.8; }
        .flower-center-disc { fill:#f2c94c;stroke:#bd9218;stroke-width:3;filter:drop-shadow(0 3px 3px rgba(90,64,16,.22)); }
        .flower-month { fill:#4c3510;font:800 16px/1 sans-serif;text-transform:capitalize; }
        .flower-countdown { fill:#624713;font:700 12px/1 sans-serif; }
        ha-card.flower-card.theme-dark { background:linear-gradient(180deg,#17271d 0%,#1b3021 64%,#142519 100%);border-color:rgba(137,196,133,.35);color:#e7f3e5; }
        .flower-card.theme-dark .flower-center-disc { fill:#b58a22;stroke:#e4bd55; }
        .flower-card.theme-dark .flower-month,.flower-card.theme-dark .flower-countdown { fill:#fff1b8; }
        .flower-card.theme-dark .mini-flower-center { fill:#b58a22;stroke:#e4bd55; }
        .flower-card.theme-dark .mini-flower text { fill:#fff1b8; }
      </style>
      <ha-card class="${retroCalendar || retroGauge ? 'retro-pixel' : ''} ${comicCalendar || comicGauge ? 'comic-card' : ''} ${pirateCalendar || pirateGauge ? 'pirate-card' : ''} ${flowerGauge ? 'flower-card' : ''} theme-${specialTheme}">
        <div class="wrap">
          ${(friendlyName || cardTitle) ? `
          <div class="head">
            ${friendlyName ? `<div class="friendly">${friendlyName}</div>` : ''}
            ${cardTitle ? `<div class="title-label">${cardTitle}</div>` : ''}
          </div>` : ''}
          ${calendarOnly ? `
          <div class="calendar-only ${retroCalendar ? 'retro-calendar' : ''} ${comicCalendar ? 'comic-calendar' : ''} ${pirateCalendar ? 'pirate-calendar' : ''}">
            <div class="toolbar">
              <div class="title">${monthYear}</div>
              <div class="nav">
                <button type="button" class="btn" data-nav="prev">◀</button>
                <button type="button" class="btn" data-nav="next">▶</button>
              </div>
            </div>
            <div class="grid">${this._calendarGrid(model, locale)}</div>
          </div>` : retroGauge ? `<div class="retro-gauge-shell theme-${specialTheme}">${this._renderRetroGauge(model, countdown, locale)}</div>` : flowerGauge ? this._renderFlowerGauge(model, countdown, locale) : comicGauge ? `<div class="comic-gauge-shell theme-${specialTheme}"><button type="button" class="gauge-wrap" data-action="open-calendar" aria-label="${this._lang() === 'de' ? 'Comic-Kalender öffnen' : 'Open comic calendar'}">${this._renderGauge(model, palette)}<span class="center"><span class="countdown">${countdown}</span></span></button></div>` : pirateGauge ? `<div class="pirate-gauge-shell theme-${specialTheme}"><button type="button" class="gauge-wrap" data-action="open-calendar" aria-label="${this._lang() === 'de' ? 'Piratenkalender öffnen' : 'Open pirate calendar'}">${this._renderGauge(model, palette)}<span class="center"><span class="countdown">⚓ ${countdown}</span></span></button></div>` : `
          <button type="button" class="gauge-wrap" data-action="open-calendar" aria-label="${this._lang() === 'de' ? 'Kalender öffnen' : 'Open calendar'}">
            ${this._renderGauge(model, palette)}
            <span class="center"><span class="countdown ${isOverdueSoon ? 'overdue-soon' : ''}">${countdown}</span></span>
          </button>`}
          ${!calendarOnly && this._editorOpen ? `
          <div class="editor ${retroGauge ? 'retro-calendar' : ''} ${comicGauge ? 'comic-calendar' : ''} ${pirateGauge ? 'pirate-calendar' : ''}">
            <div class="toolbar">
              <div class="title">${monthYear}</div>
              <div class="nav">
                <button type="button" class="btn" data-nav="prev">◀</button>
                <button type="button" class="btn" data-nav="next">▶</button>
              </div>
            </div>
            <div class="grid">${this._calendarGrid(model, locale)}</div>
          </div>` : ''}
        </div>
      </ha-card>
    `;

    this._attachHandlers();
  }
}

class MenstruationGaugeCardEditor extends HTMLElement {
  setConfig(config) {
    const showFertile = Object.prototype.hasOwnProperty.call(config, 'show_fertile_period')
      ? config.show_fertile_period !== false
      : config.show_ovulation_dots !== false;
    this._config = {
      theme_mode: 'auto',
      display_mode: 'gauge',
      calendar_edit_enabled: true,
      period_duration_days: 5,
      show_flower_day_numbers: false,
      show_flower_adjacent_months: true,
      ...config,
      show_fertile_period: showFertile
    };
    delete this._config.show_ovulation_dots;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Avoid stealing focus while user is typing in the editor.
    if (this.shadowRoot?.activeElement) return;
    this._render();
  }

  _lang() {
    const language = String(this._hass?.locale?.language || 'en').toLowerCase();
    return language.startsWith('de') ? 'de' : 'en';
  }

  _t(key) {
    const i18n = {
      de: {
        entity: 'Entität',
        fallback_note: 'HA-Entity-Picker nicht verfügbar, Fallback-Dropdown aktiv.',
        sensor_search: 'Sensor suchen...',
        friendly_name: 'Anzeigename (Gauge)',
        use_sensor_name: 'Aus Sensor',
        title: 'Titel',
        display: 'Darstellung',
        display_gauge: 'Classic Gauge',
        display_calendar: 'Nur Kalender',
        display_retro_pixel: 'Kalender / Retro Pixel',
        display_retro_gauge: 'Gauge / Retro Pixel',
        display_comic_calendar: 'Kalender / Comic',
        display_comic_gauge: 'Gauge / Comic',
        display_pirate_calendar: 'Kalender / Piratenkarte',
        display_pirate_gauge: 'Gauge / Piratenkarte',
        display_flower_gauge: 'Gauge / Monatsblume',
        period_duration: 'Periodendauer (Zahl 1-14 oder "learnt", leer = Sensorwert)',
        period_placeholder: 'z. B. 5 oder "learnt"',
        theme: 'Theme',
        theme_auto: 'auto',
        theme_light: 'hell',
        theme_dark: 'dunkel',
        show_fertile: 'Fruchtbare Phase anzeigen',
        calendar_edit: 'Neue Einträge im Kalender erlauben',
        flower_day_numbers: 'Tageszahlen auf der Monatsblume anzeigen',
        flower_adjacent_months: 'Vorherigen und nächsten Monat als Miniblumen anzeigen',
      },
      en: {
        entity: 'Entity',
        fallback_note: 'HA entity picker unavailable, fallback dropdown active.',
        sensor_search: 'Search sensor...',
        friendly_name: 'Friendly Name (Gauge)',
        use_sensor_name: 'From sensor',
        title: 'Title',
        display: 'Display',
        display_gauge: 'Classic Gauge',
        display_calendar: 'Calendar only',
        display_retro_pixel: 'Calendar / Retro Pixel',
        display_retro_gauge: 'Gauge / Retro Pixel',
        display_comic_calendar: 'Calendar / Comic',
        display_comic_gauge: 'Gauge / Comic',
        display_pirate_calendar: 'Calendar / Pirate Map',
        display_pirate_gauge: 'Gauge / Pirate Map',
        display_flower_gauge: 'Gauge / Monthly Flower',
        period_duration: 'Period Duration (number 1-14 or "learnt", empty = sensor value)',
        period_placeholder: 'e.g. 5 or "learnt"',
        theme: 'Theme',
        theme_auto: 'auto',
        theme_light: 'light',
        theme_dark: 'dark',
        show_fertile: 'Show fertile period',
        calendar_edit: 'Allow new entries through calendar',
        flower_day_numbers: 'Show day numbers on the monthly flower',
        flower_adjacent_months: 'Show previous and next month as mini flowers',
      },
    };
    return (i18n[this._lang()] && i18n[this._lang()][key]) || (i18n.en[key] || key);
  }

  _sensorLabelFromEntity(entityId) {
    const normalized = String(entityId || '').trim();
    if (!normalized) return '';
    const attrs = this._hass?.states?.[normalized]?.attributes || {};
    return String(attrs.friendly_name || attrs.name || normalized);
  }

  _entityOptions() {
    const states = this._hass?.states || {};
    return Object.keys(states)
      .filter((entityId) => entityId.startsWith('sensor.'))
      .sort()
      .map((entityId) => ({
        entity_id: entityId,
        label: String(states[entityId]?.attributes?.friendly_name || states[entityId]?.attributes?.name || entityId),
      }));
  }

  _entityOptionsHtml(options, selectedEntity) {
    return (options || []).map((row) => {
      const selected = row.entity_id === selectedEntity ? 'selected' : '';
      return `<option value="${row.entity_id}" ${selected}>${row.label} (${row.entity_id})</option>`;
    }).join('');
  }

  _emit(nextConfig) {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: nextConfig },
      bubbles: true,
      composed: true
    }));
  }

  _handleInput(key, value) {
    const next = { ...this._config, [key]: value };
    this._emit(next);
  }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const entities = this._entityOptions();
    const selectedEntity = String(this._config.entity || '');
    const hasHaSelector = Boolean(customElements.get('ha-selector'));
    const hasHaEntityPicker = Boolean(customElements.get('ha-entity-picker'));
    const options = this._entityOptionsHtml(entities, selectedEntity);

    this.shadowRoot.innerHTML = `
      <style>
        .wrap { display: grid; gap: 10px; padding: 2px 0; }
        .row { display: grid; gap: 4px; }
        .inline { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
        .entity { display: grid; gap: 6px; }
        .entity-fallback { display: grid; gap: 6px; }
        label { font-size: 12px; font-weight: 600; color: var(--secondary-text-color); }
        input, select, button, ha-entity-picker, ha-selector { width: 100%; box-sizing: border-box; }
        input, select, button {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        button { width: auto; cursor: pointer; }
        .check { display: flex; gap: 8px; align-items: center; justify-content: flex-start; text-align: left; }
        .check input[type="checkbox"] { width: auto; min-width: 0; margin: 0; }
        .fallback-note { font-size: 11px; color: var(--secondary-text-color); opacity: .85; }
      </style>
      <div class="wrap">
        <div class="row">
          <label>${this._t('entity')}</label>
          <div class="entity">
          ${hasHaSelector
            ? '<ha-selector id="entity_selector"></ha-selector>'
            : hasHaEntityPicker
            ? '<ha-entity-picker id="entity_picker"></ha-entity-picker>'
            : `<div class="entity-fallback"><input id="entity_search" type="text" placeholder="${this._t('sensor_search')}"><select id="entity_select" size="8">${options}</select><div class="fallback-note">${this._t('fallback_note')}</div></div>`}
          </div>
        </div>
        <div class="row">
          <label>${this._t('friendly_name')}</label>
          <div class="inline">
            <input id="friendly_name" value="${this._config.friendly_name || ''}" placeholder="Anna">
            <button id="use_sensor_name" type="button">${this._t('use_sensor_name')}</button>
          </div>
        </div>
        <div class="row">
          <label>${this._t('title')}</label>
          <input id="title" value="${this._config.title || ''}" placeholder="Cycle Gauge">
        </div>
        <div class="row">
          <label>${this._t('display')}</label>
          <select id="display_mode">
            <option value="gauge" ${this._config.display_mode === 'gauge' ? 'selected' : ''}>${this._t('display_gauge')}</option>
            <option value="calendar" ${this._config.display_mode === 'calendar' ? 'selected' : ''}>${this._t('display_calendar')}</option>
            <option value="retro_gauge" ${this._config.display_mode === 'retro_gauge' ? 'selected' : ''}>${this._t('display_retro_gauge')}</option>
            <option value="retro_pixel" ${this._config.display_mode === 'retro_pixel' ? 'selected' : ''}>${this._t('display_retro_pixel')}</option>
            <option value="comic_gauge" ${this._config.display_mode === 'comic_gauge' ? 'selected' : ''}>${this._t('display_comic_gauge')}</option>
            <option value="comic_calendar" ${this._config.display_mode === 'comic_calendar' ? 'selected' : ''}>${this._t('display_comic_calendar')}</option>
            <option value="pirate_gauge" ${this._config.display_mode === 'pirate_gauge' ? 'selected' : ''}>${this._t('display_pirate_gauge')}</option>
            <option value="pirate_calendar" ${this._config.display_mode === 'pirate_calendar' ? 'selected' : ''}>${this._t('display_pirate_calendar')}</option>
            <option value="flower_gauge" ${this._config.display_mode === 'flower_gauge' ? 'selected' : ''}>${this._t('display_flower_gauge')}</option>
          </select>
        </div>
        <div class="row">
          <label>${this._t('period_duration')}</label>
          <input id="period_duration_days" type="text" value="${String(this._config.period_duration_days ?? '')}" placeholder='${this._t('period_placeholder')}'>
        </div>
        <div class="row">
          <label>${this._t('theme')}</label>
          <select id="theme_mode">
            <option value="auto" ${this._config.theme_mode === 'auto' ? 'selected' : ''}>${this._t('theme_auto')}</option>
            <option value="light" ${this._config.theme_mode === 'light' ? 'selected' : ''}>${this._t('theme_light')}</option>
            <option value="dark" ${this._config.theme_mode === 'dark' ? 'selected' : ''}>${this._t('theme_dark')}</option>
          </select>
        </div>
        <label class="check"><input type="checkbox" id="show_fertile_period" ${this._config.show_fertile_period !== false ? 'checked' : ''}> ${this._t('show_fertile')}</label>
        <label class="check"><input type="checkbox" id="calendar_edit_enabled" ${this._config.calendar_edit_enabled !== false ? 'checked' : ''}> ${this._t('calendar_edit')}</label>
        <label class="check"><input type="checkbox" id="show_flower_day_numbers" ${this._config.show_flower_day_numbers === true ? 'checked' : ''}> ${this._t('flower_day_numbers')}</label>
        <label class="check"><input type="checkbox" id="show_flower_adjacent_months" ${this._config.show_flower_adjacent_months !== false ? 'checked' : ''}> ${this._t('flower_adjacent_months')}</label>
      </div>
    `;

    const entitySelector = this.shadowRoot.getElementById('entity_selector');
    const entityPicker = this.shadowRoot.getElementById('entity_picker');
    const entitySelect = this.shadowRoot.getElementById('entity_select');
    const entitySearch = this.shadowRoot.getElementById('entity_search');
    const applySelectedEntity = (valueRaw) => {
      const value = String(valueRaw || '').trim();
      if (!value) return;
      const next = { ...this._config, entity: value };
      delete next.entry_id;
      this._emit(next);
    };

    if (entitySelector) {
      entitySelector.hass = this._hass;
      entitySelector.selector = { entity: { domain: 'sensor' } };
      entitySelector.value = String(this._config.entity || '');
      const onSelect = (ev) => applySelectedEntity(ev?.detail?.value);
      entitySelector.addEventListener('value-changed', onSelect);
      entitySelector.addEventListener('change', onSelect);
    }
    if (entityPicker) {
      entityPicker.hass = this._hass;
      entityPicker.value = String(this._config.entity || '');
      entityPicker.includeDomains = ['sensor'];
      entityPicker.allowCustomEntity = false;
      const onEntityPick = (ev) => applySelectedEntity(ev?.detail?.value);
      entityPicker.addEventListener('value-changed', onEntityPick);
      entityPicker.addEventListener('change', onEntityPick);
    }
    if (entitySelect) {
      entitySelect.addEventListener('change', (ev) => applySelectedEntity(ev?.target?.value));
      entitySearch?.addEventListener('input', (ev) => {
        const needle = String(ev?.target?.value || '').trim().toLowerCase();
        const filtered = needle
          ? entities.filter((row) => `${row.label} ${row.entity_id}`.toLowerCase().includes(needle))
          : entities;
        entitySelect.innerHTML = this._entityOptionsHtml(filtered, String(this._config.entity || ''));
        if (!entitySelect.value && filtered.length) entitySelect.value = filtered[0].entity_id;
      });
      entitySearch?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          applySelectedEntity(entitySelect?.value);
        }
      });
    }

    this.shadowRoot.getElementById('friendly_name')?.addEventListener('change', (ev) => this._handleInput('friendly_name', ev.target.value));
    this.shadowRoot.getElementById('use_sensor_name')?.addEventListener('click', () => {
      const selected = entitySelector?.value || entityPicker?.value || entitySelect?.value || String(this._config.entity || '');
      const fromSensor = this._sensorLabelFromEntity(selected);
      const next = { ...this._config, friendly_name: fromSensor || '' };
      this._emit(next);
    });
    this.shadowRoot.getElementById('period_duration_days')?.addEventListener('change', (ev) => {
      const raw = String(ev.target.value || '').trim();
      if (!raw) {
        const next = { ...this._config };
        delete next.period_duration_days;
        this._emit(next);
        return;
      }
      const lowered = raw.toLowerCase();
      if (lowered === 'learnt' || lowered === 'learned') {
        this._handleInput('period_duration_days', 'learnt');
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(1, Math.min(14, Math.round(parsed)));
      this._handleInput('period_duration_days', clamped);
    });
    this.shadowRoot.getElementById('title')?.addEventListener('change', (ev) => this._handleInput('title', ev.target.value));
    this.shadowRoot.getElementById('display_mode')?.addEventListener('change', (ev) => this._handleInput('display_mode', ev.target.value));
    this.shadowRoot.getElementById('theme_mode')?.addEventListener('change', (ev) => this._handleInput('theme_mode', ev.target.value));
    this.shadowRoot.getElementById('show_fertile_period')?.addEventListener('change', (ev) => this._handleInput('show_fertile_period', !!ev.target.checked));
    this.shadowRoot.getElementById('calendar_edit_enabled')?.addEventListener('change', (ev) => this._handleInput('calendar_edit_enabled', !!ev.target.checked));
    this.shadowRoot.getElementById('show_flower_day_numbers')?.addEventListener('change', (ev) => this._handleInput('show_flower_day_numbers', !!ev.target.checked));
    this.shadowRoot.getElementById('show_flower_adjacent_months')?.addEventListener('change', (ev) => this._handleInput('show_flower_adjacent_months', !!ev.target.checked));
  }
}

customElements.define('menstruation-gauge-card', MenstruationGaugeCard);
customElements.define('menstruation-gauge-card-editor', MenstruationGaugeCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'menstruation-gauge-card',
  name: 'Menstruation Gauge Card',
  description: 'Cycle gauge with profile support and visual editor (entity/entry_id/theme/flags).'
});
