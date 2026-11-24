window.__ModuleLoader__.load({
  id: '@local/dsh-live-activity',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    const NS = 'dsh-live-activity';
    const PACKAGE_NAME = '@local/dsh-live-activity';
    const LAYOUT_KEY = 'dsh-live-activity:layout:v2';
    const LEGACY_LAYOUT_KEY = 'dsh-live-activity:layout';
    const POLL_MS = 2000;
    const CARD_GAP = 8;
    const ANCHOR_TOP = 72;
    const ANCHOR_RIGHT = 20;
    const MIN_TOP = 8;

    const en = {
      refreshedJustNow: 'just now',
      refreshedSeconds: '{n}s ago',
      refreshedMinutes: '{n}m ago',
      refreshedHours: '{n}h ago',
      eta: 'ETA {time}',
      overdue: 'Overdue · ETA {time}',
      stale: 'Needs refresh',
      ended: 'Ended',
      removesIn: 'Removed in {left}',
      progress: '{percent}% complete',
      percent: '{percent}%',
      counts: '{done} / {total}',
      seriesLatest: 'latest',
      seriesRange: '{low} – {high}',
      dismiss: 'Dismiss this activity',
      collapse: 'Collapse this activity',
      expand: 'Expand this activity',
      unavailable: 'Live activities are unavailable',
      progress: '{percent}% complete',
      dragHint: 'Drag to move',
      lanAccess: 'LAN access',
      lanAccessDesc: 'Let other machines on your local network drive cards over the HTTP endpoint. Off by default; when it is on, the bearer token is the only gate and traffic is plain HTTP.',
      lanOn: 'On',
      lanOff: 'Off',
      lanEndpoint: 'Listening on {url}',
      lanToken: 'Token file',
      lanSaved: 'Saved. The listener has rebound.',
      allowTunnel: 'SSH tunnels',
      allowTunnelDesc: 'Let the agent open a reverse tunnel from a remote host back to this endpoint. Off by default; a tunnel opens a port on that host only, and closes with DSH.',
      tunnelCount: '{n} tunnel(s) active',
      viaTunnel: 'through the tunnel',
      viaLan: 'on the local network',
      reporter: '{where} · {ip}',
      elapsed: 'elapsed {time}',
      remaining: '{time} left',
      totalTime: '{time} total',
      rate: '{value}/s',
      lanFailed: 'Could not read the endpoint settings.',
    };
    const zh = {
      refreshedJustNow: '刚刚更新',
      refreshedSeconds: '{n} 秒前更新',
      refreshedMinutes: '{n} 分钟前更新',
      refreshedHours: '{n} 小时前更新',
      eta: '预计 {time}',
      overdue: '已超时 · 预计 {time}',
      stale: '待更新',
      ended: '已结束',
      removesIn: '{left} 后移除',
      progress: '已完成 {percent}%',
      percent: '{percent}%',
      counts: '{done} / {total}',
      seriesLatest: '最新',
      seriesRange: '{low} – {high}',
      dismiss: '移除这个实时活动',
      collapse: '收起这张卡片',
      expand: '展开这张卡片',
      unavailable: '实时活动暂不可用',
      dragHint: '拖动可移动',
      lanAccess: '局域网访问',
      lanAccessDesc: '允许局域网内其他设备通过 HTTP 接口驱动卡片。默认关闭；开启后访问令牌是唯一防线，且流量为明文 HTTP。',
      lanOn: '已开启',
      lanOff: '已关闭',
      lanEndpoint: '监听地址 {url}',
      lanToken: '令牌文件',
      lanSaved: '已保存，监听地址已切换。',
      allowTunnel: 'SSH 隧道',
      allowTunnelDesc: '允许 agent 从远端主机反向开一条隧道指回本接口。默认关闭；隧道只在远端主机上开一个端口，随 DSH 关闭一起断开。',
      tunnelCount: '{n} 条隧道活动中',
      viaTunnel: '经隧道',
      viaLan: '局域网',
      reporter: '{where} · {ip}',
      elapsed: '已 {time}',
      remaining: '剩 {time}',
      totalTime: '共 {time}',
      rate: '{value}/s',
      lanFailed: '无法读取接口设置。',
    };

    const ACCENTS = {
      brand: 'var(--dsw-alias-brand-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    };
    const GLYPHS = {
      task: 'M4 6h16M4 12h10M4 18h7',
      run: 'M7 4v16l12-8z',
      build: 'M3 20h18M6 20V9l6-5 6 5v11',
      deploy: 'M12 20V5M6 11l6-6 6 6',
      download: 'M12 4v12M6 12l6 6 6-6M4 21h16',
      search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6',
      sync: 'M20 12a8 8 0 0 1-13.7 5.7M4 12a8 8 0 0 1 13.7-5.7M4 5v4h4M20 19v-4h-4',
      alert: 'M12 3l9 16H3zM12 9v5M12 17h.01',
    };

    const CSS = [
      '.dla-slot{position:fixed;z-index:60;width:min(340px,calc(100vw - 24px));pointer-events:none;font:inherit;color:var(--dsw-alias-label-primary)}',
      '.dla-slot *,.dla-mini *{box-sizing:border-box}',
      '.dla-slot[data-collapsed="true"]{width:auto;max-width:min(340px,calc(100vw - 24px))}',
      '.dla-slot[data-front="true"]{z-index:61}',
      '.dla-card{pointer-events:auto;position:relative;display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.05)}',
      '.dla-card[data-ended="true"]{box-shadow:none}',
      '.dla-card[data-ended="true"] .dla-main{opacity:.6}',
      '.dla-head{display:flex;align-items:flex-start;gap:8px;margin:-4px -4px 0;padding:4px;border-radius:8px;cursor:grab;touch-action:none;user-select:none}',
      '.dla-head:active{cursor:grabbing}',
      '.dla-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}',
      '.dla-glyph{flex:none;margin-top:1px;color:var(--dsw-alias-label-secondary)}',
      '.dla-titles{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.dla-title-row{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dla-title{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.35;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-net{flex:none;display:flex;align-items:center;color:var(--accent);opacity:.75}',
      '.dla-sub{font-size:11px;line-height:1.35;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-head-actions{flex:none;display:flex;align-items:center;gap:2px}',
      '.dla-icon-btn{display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.6}',
      '.dla-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);opacity:1}',
      '.dla-main{display:flex;flex-direction:column;gap:10px}',
      '.dla-phase{font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.dla-value{display:flex;align-items:baseline;gap:8px}',
      '.dla-value>b{font-size:24px;font-weight:600;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
      '.dla-value>span{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dla-bar{margin-top:2px;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.dla-bar>i{display:block;height:100%;border-radius:999px;background:var(--accent);transition:width .4s cubic-bezier(.4,0,.2,1)}',
      '.dla-timing{margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;font-size:10.5px;line-height:1.4;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dla-detail{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.dla-series{display:flex;flex-direction:column;gap:10px}',
      '.dla-series-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:5px}',
      '.dla-series-name{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-series-value{font-size:12px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dla-series-chart{display:block;width:100%;height:40px;overflow:visible}',
      '.dla-series-chart .dla-grid{stroke:var(--dsw-alias-border-l1);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}',
      '.dla-series-chart .dla-baseline{stroke:var(--dsw-alias-border-l1);stroke-width:1;vector-effect:non-scaling-stroke}',
      '.dla-series-chart .dla-line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}',
      '.dla-series-chart .dla-area{stroke:none}',
      '.dla-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dla-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;font-size:10.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dla-badge[data-tone="accent"]{color:var(--accent)}',
      '.dla-badge[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dla-badge[data-tone="success"]{color:var(--dsw-alias-state-success-primary)}',
      '.dla-foot{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dla-mini{pointer-events:auto;display:flex;align-items:center;gap:7px;max-width:100%;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.05);cursor:grab;touch-action:none;user-select:none}',
      '.dla-mini:active{cursor:grabbing}',
      '.dla-mini:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dla-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--accent)}',
      '.dla-mini-title{flex:none;max-width:40%;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-mini-phase{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-mini-value{flex:none;font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.dla-mini-value[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dla-mini-close{flex:none;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.55}',
      '.dla-mini-close:hover{background:var(--dsw-alias-bg-layer-2);opacity:1}',
      '.dla-error{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;padding:5px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:11px;color:var(--dsw-alias-state-warn-primary)}',
      '.dla-error>button{padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;text-decoration:underline}',
    ].join('');

    const pad = value => String(value).padStart(2, '0');
    const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

    /** Per-card layout: a card owns its position and its collapsed state. */
    function readLayout() {
      try {
        const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
        const stored = raw && typeof raw === 'object' && raw.cards && typeof raw.cards === 'object' ? raw.cards : {};
        const cards = {};
        for (const [id, entry] of Object.entries(stored)) {
          if (!entry || typeof entry !== 'object') continue;
          cards[id] = {
            x: Number.isFinite(entry.x) ? entry.x : null,
            y: Number.isFinite(entry.y) ? entry.y : null,
            collapsed: entry.collapsed === true,
          };
        }
        return { cards };
      } catch (_) {
        return { cards: {} };
      }
    }

    function saveLayout(value) {
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(value));
        localStorage.removeItem(LEGACY_LAYOUT_KEY);
      } catch (_) {
        // A profile that blocks storage still gets a working, non-persistent card.
      }
    }

    async function api(operation, signal) {
      const response = await fetch('/api/dsh-live-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation),
        signal,
      });
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        throw new Error('HTTP ' + response.status);
      }
      if (!response.ok || !data || !data.ok) throw new Error((data && data.error && data.error.message) || 'HTTP ' + response.status);
      return data.value;
    }

    function useActivities() {
      const [state, set] = useState({ activities: [], error: null, failures: 0 });
      useEffect(() => {
        const controller = new AbortController();
        let timer = null;
        let stopped = false;
        const poll = async () => {
          if (stopped) return;
          if (document.visibilityState !== 'hidden') {
            try {
              const value = await api({ action: 'list', limit: 20 }, controller.signal);
              if (!controller.signal.aborted) set({ activities: value.activities, error: null, failures: 0 });
            } catch (error) {
              if (!controller.signal.aborted) set(previous => ({ ...previous, error, failures: previous.failures + 1 }));
            }
          }
          if (!stopped) timer = setTimeout(poll, POLL_MS);
        };
        poll();
        return () => {
          stopped = true;
          controller.abort();
          clearTimeout(timer);
        };
      }, []);
      return state;
    }

    function useNow(interval = 1000) {
      const [now, set] = useState(() => Date.now());
      useEffect(() => {
        const timer = setInterval(() => set(Date.now()), interval);
        return () => clearInterval(timer);
      }, [interval]);
      return now;
    }

    function countdown(ms) {
      const total = Math.max(0, Math.round(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return hours ? hours + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds);
    }

    function clockOf(epochSeconds) {
      const value = new Date(epochSeconds * 1000);
      return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function refreshed(updatedAt, now, t) {
      const elapsed = now - updatedAt;
      if (elapsed < 5000) return t('refreshedJustNow');
      if (elapsed < 60000) return t('refreshedSeconds', { n: Math.round(elapsed / 1000) });
      if (elapsed < 3600000) return t('refreshedMinutes', { n: Math.round(elapsed / 60000) });
      return t('refreshedHours', { n: Math.round(elapsed / 3600000) });
    }

    function Glyph({ symbol }) {
      return h(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: GLYPHS[symbol] || GLYPHS.task }),
      );
    }

    /**
     * tqdm-style timing: elapsed since the card started, the measured rate from
     * the tracked points, and what that implies for the rest of the work. The
     * report's own ETA wins when no rate can be measured yet.
     */
    function timingOf(activity, now) {
      const state = activity.state || {};
      const ended = activity.status === 'ended';
      const at = ended && Number.isFinite(activity.endedAt) ? activity.endedAt : now;
      const elapsedMs = Math.max(0, at - (Number.isFinite(activity.startedAt) ? activity.startedAt : at));
      const track = Array.isArray(activity.track) ? activity.track : [];
      const done = Number.isFinite(state.completed) ? state.completed : Number.isFinite(state.progress) ? state.progress : null;
      const total = Number.isInteger(state.total) ? state.total : Number.isFinite(state.progress) ? 1 : null;
      let rate = null;
      if (done !== null && track.length >= 2) {
        const delta = track[track.length - 1].done - track[0].done;
        const seconds = (track[track.length - 1].at - track[0].at) / 1000;
        if (seconds > 0 && delta > 0) rate = delta / seconds;
      }
      let remainingMs = null;
      if (!ended) {
        if (rate !== null && total !== null && done !== null) remainingMs = Math.max(0, ((total - done) / rate) * 1000);
        else if (Number.isFinite(state.etaEpochSeconds)) remainingMs = Math.max(0, state.etaEpochSeconds * 1000 - now);
      }
      return { elapsedMs, rate, remainingMs, totalMs: remainingMs === null ? null : elapsedMs + remainingMs };
    }

    function formatRate(rate) {
      if (!Number.isFinite(rate) || rate <= 0) return null;
      if (rate >= 100) return String(Math.round(rate));
      if (rate >= 10) return rate.toFixed(1);
      return String(parseFloat(rate.toPrecision(2)));
    }

    /** Marks a card whose progress comes from another machine. */
    function NetBadge({ reporter, t }) {
      if (!reporter || !reporter.ip) return null;
      const where = reporter.type === 'tunnel' ? t('viaTunnel') : t('viaLan');
      const label = t('reporter', { where, ip: reporter.ip });
      return h(
        'span',
        { className: 'dla-net', title: label, 'aria-label': label, role: 'img' },
        h(
          'svg',
          { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true },
          h('path', { d: 'M4 10a11 11 0 0 1 16 0' }),
          h('path', { d: 'M7.5 14a7 7 0 0 1 9 0' }),
          h('circle', { cx: 12, cy: 18, r: 1.6, fill: 'currentColor', stroke: 'none' }),
        ),
      );
    }

    function formatNumber(value) {
      if (!Number.isFinite(value)) return '—';
      const abs = Math.abs(value);
      if (abs !== 0 && (abs >= 100000 || abs < 0.001)) return value.toExponential(1);
      return String(parseFloat(value.toPrecision(3)));
    }

    /** A shadcn-style area chart: 2px stroke, gradient fill, dashed horizontal grid. */
    function SeriesChart({ series, gradientId, t }) {
      const samples = (series.samples || []).filter(sample => Number.isFinite(sample.value));
      if (!samples.length) return null;
      const width = 100;
      const height = 40;
      const padY = 5;
      const values = samples.map(sample => sample.value);
      const low = Math.min(...values);
      const high = Math.max(...values);
      const span = high - low;
      const x = index => (samples.length === 1 ? width : (index * width) / (samples.length - 1));
      const y = value => (span === 0 ? height / 2 : padY + (1 - (value - low) / span) * (height - padY * 2));
      const points = samples.map((sample, index) => [x(index), y(sample.value)]);
      let line;
      if (points.length === 1) line = `M 0 ${points[0][1].toFixed(2)} L ${width} ${points[0][1].toFixed(2)}`;
      else {
        line = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
        for (let index = 1; index < points.length - 1; index++) {
          const [x0, y0] = points[index];
          const [x1, y1] = points[index + 1];
          line += ` Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
        }
        const last = points[points.length - 1];
        line += ` L ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
      }
      const area = `${line} L ${width} ${height} L 0 ${height} Z`;
      const last = samples[samples.length - 1];
      const label = `${series.name}: ${t('seriesLatest')} ${formatNumber(last.value)}${series.unit || ''} · ${t('seriesRange', { low: formatNumber(low), high: formatNumber(high) })}`;
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dla-series-head' },
          h('span', { className: 'dla-series-name', title: series.name }, series.name),
          h('span', { className: 'dla-series-value' }, formatNumber(last.value) + (series.unit || '')),
        ),
        h(
          'svg',
          { className: 'dla-series-chart', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': label },
          h('title', null, label),
          h(
            'defs',
            null,
            h(
              'linearGradient',
              { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
              h('stop', { offset: '0%', stopColor: 'var(--accent)', stopOpacity: 0.22 }),
              h('stop', { offset: '100%', stopColor: 'var(--accent)', stopOpacity: 0.02 }),
            ),
          ),
          [0.25, 0.5, 0.75].map(fraction =>
            h('line', { key: fraction, className: 'dla-grid', x1: 0, y1: height * fraction, x2: width, y2: height * fraction }),
          ),
          h('line', { className: 'dla-baseline', x1: 0, y1: height, x2: width, y2: height }),
          h('path', { className: 'dla-area', d: area, fill: `url(#${gradientId})` }),
          h('path', { className: 'dla-line', d: line }),
        ),
      );
    }

    function ActivityCard({ activity, now, t, onDismiss, onCollapse, onDragStart, onDragMove, onDragEnd, onMoveKey }) {
      const attributes = activity.attributes || {};
      const state = activity.state || {};
      const accent = ACCENTS[attributes.accent] || ACCENTS.brand;
      const ended = activity.status === 'ended';
      const stale = !ended && activity.stale === true;
      const progress = Number.isFinite(state.progress) ? clamp(state.progress, 0, 1) : null;
      const counted = Number.isInteger(state.completed) && Number.isInteger(state.total);
      const series = Array.isArray(state.metrics) ? state.metrics : [];
      const eta = Number.isFinite(state.etaEpochSeconds) ? state.etaEpochSeconds : null;
      const remaining = eta === null ? null : eta * 1000 - now;
      const dismissIn = ended && Number.isFinite(activity.dismissAt) ? activity.dismissAt - now : null;

      /** The headline number is the card's reason to exist; badges carry the rest. */
      const badges = [];
      if (remaining !== null) {
        badges.push(
          h(
            'span',
            { key: 'eta', className: 'dla-badge', 'data-tone': remaining <= 0 ? 'warn' : 'accent' },
            remaining <= 0 ? t('overdue', { time: clockOf(eta) }) : t('eta', { time: clockOf(eta) }),
          ),
        );
      }
      if (stale) badges.push(h('span', { key: 'stale', className: 'dla-badge', 'data-tone': 'warn' }, t('stale')));
      if (ended) badges.push(h('span', { key: 'ended', className: 'dla-badge', 'data-tone': 'success' }, t('ended')));

      const footer = ended
        ? dismissIn !== null && dismissIn > 0
          ? t('removesIn', { left: countdown(dismissIn) })
          : t('ended')
        : refreshed(activity.updatedAt, now, t);

      const timing = timingOf(activity, now);
      const timingParts = [t('elapsed', { time: countdown(timing.elapsedMs) })];
      if (timing.remainingMs !== null) timingParts.push(t('remaining', { time: countdown(timing.remainingMs) }));
      if (timing.totalMs !== null) timingParts.push(t('totalTime', { time: countdown(timing.totalMs) }));
      const shownRate = formatRate(timing.rate);
      if (shownRate) timingParts.push(t('rate', { value: shownRate }));

      const gradientBase = `dla-grad-${String(activity.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;

      return h(
        'article',
        { className: 'dla-card', style: { '--accent': accent }, 'data-ended': String(ended), 'aria-label': attributes.title },
        h(
          'div',
          {
            className: 'dla-head',
            onPointerDown: onDragStart,
            onPointerMove: onDragMove,
            onPointerUp: onDragEnd,
            onPointerCancel: onDragEnd,
            onKeyDown: onMoveKey,
            tabIndex: 0,
            role: 'group',
            'aria-label': t('dragHint'),
            title: t('dragHint'),
          },
          h('span', { className: 'dla-glyph' }, h(Glyph, { symbol: attributes.symbol })),
          h(
            'span',
            { className: 'dla-titles' },
            h(
              'span',
              { className: 'dla-title-row' },
              h('span', { className: 'dla-title' }, attributes.title),
              h(NetBadge, { reporter: activity.reporter, t }),
            ),
            attributes.subtitle ? h('span', { className: 'dla-sub' }, attributes.subtitle) : null,
          ),
          h(
            'span',
            { className: 'dla-head-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dla-icon-btn',
                'aria-label': t('collapse'),
                title: t('collapse'),
                onPointerDown: event => event.stopPropagation(),
                onClick: event => {
                  event.stopPropagation();
                  onCollapse();
                },
              },
              h(
                'svg',
                { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                h('path', { d: 'm6 15 6-6 6 6' }),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dla-icon-btn',
                'aria-label': t('dismiss'),
                title: t('dismiss'),
                onPointerDown: event => event.stopPropagation(),
                onClick: event => {
                  event.stopPropagation();
                  onDismiss(activity.id);
                },
              },
              h(
                'svg',
                { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true },
                h('path', { d: 'm6 6 12 12M18 6 6 18' }),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dla-main' },
          h('div', { className: 'dla-phase', role: 'status' }, state.phase),
          progress !== null
            ? h(
                React.Fragment,
                null,
                h(
                  'div',
                  { className: 'dla-value' },
                  h('b', null, t('percent', { percent: Math.round(progress * 100) })),
                  counted ? h('span', null, t('counts', { done: state.completed, total: state.total })) : null,
                ),
                h(
                  'div',
                  {
                    className: 'dla-bar',
                    role: 'progressbar',
                    'aria-valuemin': 0,
                    'aria-valuemax': 100,
                    'aria-valuenow': Math.round(progress * 100),
                    'aria-label': counted ? t('counts', { done: state.completed, total: state.total }) : t('progress', { percent: Math.round(progress * 100) }),
                  },
                  h('i', { style: { width: (progress * 100).toFixed(1) + '%' } }),
                ),
              )
            : null,
          h('div', { className: 'dla-timing', 'data-timing': 'true' }, timingParts.join(' \u00b7 ')),
          series.length
            ? h('div', { className: 'dla-series' }, series.map((item, index) => h(SeriesChart, { key: item.name, series: item, gradientId: `${gradientBase}-${index}`, t })))
            : null,
          state.detail ? h('div', { className: 'dla-detail' }, state.detail) : null,
          badges.length ? h('div', { className: 'dla-meta' }, badges) : null,
        ),
        h('div', { className: 'dla-foot' }, footer),
      );
    }


    const SETTINGS_CSS = [
      '.dlas{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);font:inherit;color:var(--dsw-alias-label-primary)}',
      '.dlas *{box-sizing:border-box}',
      '.dlas-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.dlas-title{font-size:13px;font-weight:500;line-height:1.4}',
      '.dlas-desc{margin-top:2px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.dlas-switch{flex:none;position:relative;width:36px;height:20px;margin-top:1px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:background .2s ease,border-color .2s ease}',
      '.dlas-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dlas-switch>i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .2s cubic-bezier(.4,0,.2,1)}',
      '.dlas-switch[aria-checked="true"]>i{transform:translateX(16px)}',
      '.dlas-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dlas-switch:disabled{opacity:.5;cursor:default}',
      '.dlas-meta{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
      '.dlas-warn{font-size:11px;line-height:1.5;color:var(--dsw-alias-state-warn-primary)}',
    ].join('');

    /** The bundle's own settings: the two switches that widen reach. */
    function PluginSettings(props) {
      const t = props.t;
      const [state, setState] = useState({ value: null, error: null, busy: null });
      const [saved, setSaved] = useState(null);
      const load = useCallback(async () => {
        try {
          const value = await api({ action: 'settings' });
          setState(previous => ({ ...previous, value, error: null }));
        } catch (error) {
          setState(previous => ({ ...previous, error }));
        }
      }, []);
      useEffect(() => {
        load();
      }, [load]);
      const flip = async key => {
        const next = !(state.value && state.value[key] === true);
        setState(previous => ({ ...previous, busy: key, error: null }));
        setSaved(null);
        try {
          await api({ action: key === 'lanAccess' ? 'set-lan-access' : 'set-allow-tunnel', enabled: next });
          await new Promise(resolve => setTimeout(resolve, 1500));
          await load();
          setSaved(key);
        } catch (error) {
          setState(previous => ({ ...previous, error }));
        } finally {
          setState(previous => ({ ...previous, busy: null }));
        }
      };
      if (props.view === 'summary') {
        const parts = [];
        if (state.value) parts.push(t('lanAccess'), ' ', state.value.lanAccess ? t('lanOn') : t('lanOff'));
        return h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, parts.join(' · ') || t('lanAccess'));
      }
      const row = (key, title, description) => {
        const enabled = !!(state.value && state.value[key] === true);
        return h(
          'div',
          { className: 'dlas-row' },
          h(
            'div',
            null,
            h('div', { className: 'dlas-title' }, title, ' · ', h('span', { className: 'dlas-meta' }, enabled ? t('lanOn') : t('lanOff'))),
            h('div', { className: 'dlas-desc' }, description),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dlas-switch',
              role: 'switch',
              'aria-checked': enabled,
              'aria-label': title,
              disabled: state.busy !== null || !state.value,
              onClick: () => flip(key),
            },
            h('i'),
          ),
        );
      };
      const tunnelCount = state.value && Array.isArray(state.value.tunnels) ? state.value.tunnels.length : 0;
      return h(
        'div',
        { className: 'dlas' },
        h('style', null, SETTINGS_CSS),
        row('lanAccess', t('lanAccess'), t('lanAccessDesc')),
        row('allowTunnel', t('allowTunnel'), t('allowTunnelDesc')),
        state.value ? h('div', { className: 'dlas-meta' }, t('lanEndpoint', { url: state.value.url })) : null,
        state.value ? h('div', { className: 'dlas-meta' }, t('lanToken'), ': ', state.value.tokenFile) : null,
        state.value && state.value.allowTunnel ? h('div', { className: 'dlas-meta' }, t('tunnelCount', { n: tunnelCount })) : null,
        saved ? h('div', { className: 'dlas-meta', role: 'status' }, t('lanSaved')) : null,
        state.error ? h('div', { className: 'dlas-warn', role: 'alert' }, t('lanFailed'), ' ', state.error.message) : null,
      );
    }

    function LiveActivities({ t }) {
      const { activities, error, failures } = useActivities();
      const now = useNow(1000);
      const [layout, setLayout] = useState(readLayout);
      const [removed, setRemoved] = useState(() => new Set());
      const [noticeHidden, setNoticeHidden] = useState(false);
      const [front, setFront] = useState(null);
      const [, bump] = useState(0);
      const layoutRef = useRef(layout);
      const dragRef = useRef(null);
      const slots = useRef(new Map());
      const heights = useRef(new Map());
      layoutRef.current = layout;

      /** Every card owns its own position and its own collapsed flag. */
      const patch = useCallback((id, change) => {
        const previous = layoutRef.current.cards[id] || { x: null, y: null, collapsed: false };
        const next = { cards: { ...layoutRef.current.cards, [id]: { ...previous, ...change } } };
        setLayout(next);
        saveLayout(next);
      }, []);

      const dismiss = useCallback(async id => {
        setRemoved(previous => {
          const next = new Set(previous);
          next.add(id);
          return next;
        });
        try {
          await api({ action: 'dismiss', id });
        } catch (_) {
          setRemoved(previous => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        }
      }, []);

      const fit = useCallback((x, y) => ({
        x: clamp(x, 0, Math.max(0, window.innerWidth - 160)),
        y: clamp(y, MIN_TOP, Math.max(MIN_TOP, window.innerHeight - 48)),
      }), []);

      // A stored position is worth keeping only while its card exists.
      useEffect(() => {
        if (error) return;
        const live = new Set(activities.map(activity => activity.id));
        const cards = layoutRef.current.cards;
        if (!Object.keys(cards).some(id => !live.has(id))) return;
        const next = { cards: Object.fromEntries(Object.entries(cards).filter(([id]) => live.has(id))) };
        setLayout(next);
        saveLayout(next);
      }, [activities, error]);

      // Cards the user never moved flow under one another; measured heights keep
      // the column gapless when a card grows another row of series. A layout
      // effect measures before the first paint, so the row never flashes at 140.
      React.useLayoutEffect(() => {
        let changed = false;
        for (const [id, element] of slots.current) {
          const height = element ? element.getBoundingClientRect().height : 0;
          if (height > 0 && Math.abs((heights.current.get(id) || 0) - height) > 0.5) {
            heights.current.set(id, height);
            changed = true;
          }
        }
        if (changed) bump(version => version + 1);
      });

      useEffect(() => {
        const onResize = () => {
          const cards = layoutRef.current.cards;
          let changed = false;
          const next = {};
          for (const [id, entry] of Object.entries(cards)) {
            if (entry.x === null || entry.y === null) {
              next[id] = entry;
              continue;
            }
            const fitted = fit(entry.x, entry.y);
            if (fitted.x !== entry.x || fitted.y !== entry.y) changed = true;
            next[id] = { ...entry, ...fitted };
          }
          if (!changed) return;
          const value = { cards: next };
          setLayout(value);
          saveLayout(value);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [fit]);

      const visible = activities.filter(activity => {
        if (removed.has(activity.id)) return false;
        if (activity.status === 'ended' && Number.isFinite(activity.dismissAt) && now >= activity.dismissAt) return false;
        return true;
      });

      // One failed poll is a blip; three in a row means the card surface is
      // unreachable, and that is worth telling the user about once.
      const unavailable = !!error && failures >= 3 && !noticeHidden && !visible.length;

      const startDrag = (id, event, options) => {
        if (event.button !== 0) return;
        const element = slots.current.get(id);
        if (!element) return;
        const rect = element.getBoundingClientRect();
        dragRef.current = {
          id,
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          expandOnClick: options ? options.expandOnClick === true : false,
        };
        setFront(id);
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      };

      const moveDrag = event => {
        const drag = dragRef.current;
        if (!drag) return;
        if (!drag.moved && Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
        if (!drag.moved) return;
        const fitted = fit(event.clientX - drag.dx, event.clientY - drag.dy);
        const previous = layoutRef.current.cards[drag.id] || { collapsed: false };
        setLayout({ cards: { ...layoutRef.current.cards, [drag.id]: { ...previous, ...fitted } } });
      };

      const endDrag = event => {
        const drag = dragRef.current;
        if (!drag) return;
        dragRef.current = null;
        if (event.currentTarget.releasePointerCapture) {
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch (_) {
            // A cancelled pointer already released capture.
          }
        }
        saveLayout(layoutRef.current);
        if (!drag.moved && drag.expandOnClick) patch(drag.id, { collapsed: false });
      };

      // Arrow keys nudge the focused card, Shift makes it a 4 px step.
      const moveKey = (id, event) => {
        const step = event.shiftKey ? 4 : 16;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const element = slots.current.get(id);
        const rect = element ? element.getBoundingClientRect() : null;
        const entry = layoutRef.current.cards[id] || { x: null, y: null, collapsed: false };
        const baseX = entry.x === null ? (rect ? rect.left : window.innerWidth - 360) : entry.x;
        const baseY = entry.y === null ? (rect ? rect.top : ANCHOR_TOP) : entry.y;
        patch(id, fit(baseX + delta[0], baseY + delta[1]));
      };

      if (!visible.length) {
        return unavailable
          ? h(
              React.Fragment,
              null,
              h('style', null, CSS),
              h(
                'div',
                { className: 'dla-slot', 'data-collapsed': 'true', style: { right: ANCHOR_RIGHT, top: ANCHOR_TOP } },
                h(
                  'div',
                  { className: 'dla-error', role: 'status' },
                  t('unavailable'),
                  h('button', { type: 'button', onClick: () => setNoticeHidden(true) }, t('dismiss')),
                ),
              ),
            )
          : null;
      }

      let cursor = ANCHOR_TOP;
      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        visible.map(activity => {
          const entry = layoutRef.current.cards[activity.id] || { x: null, y: null, collapsed: false };
          const placed = entry.x !== null && entry.y !== null;
          const top = placed ? entry.y : cursor;
          if (!placed) cursor += (heights.current.get(activity.id) || 140) + CARD_GAP;
          const shared = {
            activity,
            now,
            t,
            onDismiss: dismiss,
            onExpand: () => patch(activity.id, { collapsed: false }),
            onDragStart: event => startDrag(activity.id, event, { expandOnClick: entry.collapsed }),
            onDragMove: moveDrag,
            onDragEnd: endDrag,
            onMoveKey: event => moveKey(activity.id, event),
          };
          return h(
            'div',
            {
              key: activity.id,
              className: 'dla-slot',
              'data-collapsed': String(entry.collapsed),
              'data-front': String(front === activity.id),
              style: placed ? { left: entry.x, top } : { right: ANCHOR_RIGHT, top },
              ref: element => {
                if (element) slots.current.set(activity.id, element);
                else slots.current.delete(activity.id);
              },
            },
            entry.collapsed ? h(MiniCard, shared) : h(ActivityCard, { ...shared, onCollapse: () => patch(activity.id, { collapsed: true }) }),
          );
        }),
      );
    }

/** The collapsed form of one card: a pill that expands on click or Enter. */
    function MiniCard({ activity, now, t, onDismiss, onExpand, onDragStart, onDragMove, onDragEnd, onMoveKey }) {
      const attributes = activity.attributes || {};
      const state = activity.state || {};
      const accent = ACCENTS[attributes.accent] || ACCENTS.brand;
      const ended = activity.status === 'ended';
      const stale = !ended && activity.stale === true;
      const progress = Number.isFinite(state.progress) ? clamp(state.progress, 0, 1) : null;
      const counted = Number.isInteger(state.completed) && Number.isInteger(state.total);
      const series = Array.isArray(state.metrics) ? state.metrics : [];
      const last = series.length ? series[series.length - 1] : null;
      const value = counted
        ? t('counts', { done: state.completed, total: state.total })
        : progress !== null
          ? t('percent', { percent: Math.round(progress * 100) })
          : last && Array.isArray(last.samples) && last.samples.length
            ? formatNumber(last.samples[last.samples.length - 1].value) + (last.unit || '')
            : null;
      const hint = ended ? t('ended') : stale ? t('stale') : value;
      return h(
        'div',
        {
          className: 'dla-mini',
          style: { '--accent': accent },
          role: 'button',
          tabIndex: 0,
          'aria-label': t('expand'),
          title: t('expand'),
          'aria-expanded': false,
          onPointerDown: onDragStart,
          onPointerMove: onDragMove,
          onPointerUp: onDragEnd,
          onPointerCancel: onDragEnd,
          onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onExpand();
              return;
            }
            onMoveKey(event);
          },
        },
        h('span', { className: 'dla-dot' }),
        h('span', { className: 'dla-mini-title' }, attributes.title),
        h(NetBadge, { reporter: activity.reporter, t }),
        h('span', { className: 'dla-mini-phase' }, state.phase),
        hint ? h('span', { className: 'dla-mini-value', 'data-tone': ended ? undefined : stale ? 'warn' : undefined }, hint) : null,
        h(
          'button',
          {
            type: 'button',
            className: 'dla-mini-close',
            'aria-label': t('dismiss'),
            title: t('dismiss'),
            onPointerDown: event => event.stopPropagation(),
            onClick: event => {
              event.stopPropagation();
              onDismiss(activity.id);
            },
          },
          h(
            'svg',
            { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', 'aria-hidden': true },
            h('path', { d: 'm6 6 12 12M18 6 6 18' }),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }));
        const bound = ctx.locale.bind(NS);
        // `immediately` is required: the plugin manager reads its config-slot ledger
    // from the same module graph this bundle joins, so a deferred factory would not
    // be visible there and the detail page would omit the settings section.
    ctx.slots.inject('plugins.bundle.config', () =>
      ctx.slots.register({ name: 'plugins.bundle.config', key: PACKAGE_NAME, immediately: true, locale: NS }, PluginSettings),
    );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-live-activity', order: 30, locale: NS }, props =>
            h(LiveActivities, { ...props, t: props && props.t ? props.t : bound }),
          ),
        );
      },
    };
  },
});
