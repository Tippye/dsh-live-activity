window.__ModuleLoader__.load({
  id: '@local/dsh-live-activity',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    const NS = 'dsh-live-activity';
    const STORAGE_KEY = 'dsh-live-activity:layout';
    const POLL_MS = 2000;
    const MAX_COLLAPSED = 3;

    const en = {
      group: 'Live activities',
      refreshedJustNow: 'just now',
      refreshedSeconds: '{n}s ago',
      refreshedMinutes: '{n}m ago',
      refreshedHours: '{n}h ago',
      eta: 'ETA {time}',
      etaLeft: '{left} left',
      overdue: 'Overdue · ETA {time}',
      stale: 'Needs refresh',
      ended: 'Ended',
      removesIn: 'Removed in {left}',
      retained: 'Kept until {time}',
      progress: '{percent}% complete',
      counts: '{done} / {total}',
      seriesLatest: 'latest',
      seriesRange: '{low} – {high}',
      dismiss: 'Dismiss this activity',
      collapse: 'Collapse live activities',
      expand: 'Expand live activities',
      more: '{n} more',
      less: 'Show less',
      unavailable: 'Live activities are unavailable',
      dragHint: 'Drag to move',
      count: '{n} active',
    };
    const zh = {
      group: '实时活动',
      refreshedJustNow: '刚刚更新',
      refreshedSeconds: '{n} 秒前更新',
      refreshedMinutes: '{n} 分钟前更新',
      refreshedHours: '{n} 小时前更新',
      eta: '预计 {time}',
      etaLeft: '剩 {left}',
      overdue: '已超时 · 预计 {time}',
      stale: '待更新',
      ended: '已结束',
      removesIn: '{left} 后移除',
      retained: '保留至 {time}',
      progress: '已完成 {percent}%',
      counts: '{done} / {total}',
      seriesLatest: '最新',
      seriesRange: '{low} – {high}',
      dismiss: '移除这个实时活动',
      collapse: '收起实时活动',
      expand: '展开实时活动',
      more: '还有 {n} 个',
      less: '收起',
      unavailable: '实时活动暂不可用',
      dragHint: '拖动可移动',
      count: '{n} 个进行中',
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
      '.dla{position:fixed;z-index:60;display:flex;flex-direction:column;gap:10px;width:min(336px,calc(100vw - 24px));pointer-events:none;font:inherit;color:var(--dsw-alias-label-primary)}',
      '.dla *{box-sizing:border-box}',
      '.dla-card{pointer-events:auto;position:relative;border:1px solid var(--dsw-alias-border-l1);border-radius:15px;background:var(--dsw-alias-bg-overlay);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);box-shadow:0 16px 40px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);overflow:hidden}',
      '.dla-card[data-ended="true"]{box-shadow:0 10px 26px rgba(0,0,0,.12),0 1px 4px rgba(0,0,0,.06)}',
      '.dla-card[data-ended="true"] .dla-body{opacity:.72}',
      '.dla-head{display:flex;align-items:center;gap:9px;padding:10px 8px 8px 12px;cursor:grab;touch-action:none;user-select:none}',
      '.dla-head:active{cursor:grabbing}',
      '.dla-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dla-glyph{flex:none;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}',
      '.dla-titles{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dla-title{font-size:12px;font-weight:600;letter-spacing:.01em;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-sub{font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-close{flex:none;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.55}',
      '.dla-close:hover{background:var(--dsw-alias-bg-layer-2);opacity:1}',
      '.dla-body{padding:0 12px 11px}',
      '.dla-phase{font-size:15px;font-weight:600;line-height:1.32;letter-spacing:-.1px;overflow-wrap:anywhere}',
      '.dla-detail{margin-top:3px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
      '.dla-bar{margin-top:10px;height:3px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.dla-bar>i{display:block;height:100%;border-radius:2px;background:var(--accent);transition:width .35s ease}',
      '.dla-meta{margin-top:9px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dla-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dla-chip[data-tone="accent"]{color:var(--accent)}',
      '.dla-chip[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dla-chip[data-tone="success"]{color:var(--dsw-alias-state-success-primary)}',
      '.dla-foot{margin-top:7px;font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.7;font-variant-numeric:tabular-nums}',
      '.dla-series{margin-top:11px;display:flex;flex-direction:column;gap:7px}',
      '.dla-series-row{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dla-series-name{flex:none;max-width:42%;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dla-series-chart{flex:1;min-width:0;height:26px;display:block;overflow:visible}',
      '.dla-series-chart polyline{fill:none;stroke:var(--accent);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}',
      '.dla-series-chart polygon{fill:var(--accent);opacity:.12;stroke:none}',
      '.dla-series-chart circle{fill:var(--accent);stroke:none}',
      '.dla-series-value{flex:none;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.dla-pill{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;align-self:flex-end;max-width:100%;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-overlay);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);box-shadow:0 10px 26px rgba(0,0,0,.16),0 1px 4px rgba(0,0,0,.06);cursor:pointer;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.dla-pill:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dla-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--accent)}',
      '.dla-pill-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
      '.dla-pill-count{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-weight:400}',
      '.dla-actions{display:flex;justify-content:flex-end;align-items:center;gap:6px;pointer-events:none}',
      '.dla-more{pointer-events:auto;display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border:0;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}',
      '.dla-more:hover{color:var(--dsw-alias-label-primary)}',
      '.dla-error{pointer-events:auto;align-self:flex-end;padding:5px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-state-warn-primary)}',
    ].join('');

    const pad = value => String(value).padStart(2, '0');
    const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

    function readLayout() {
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return { x: null, y: null, collapsed: false };
        const x = Number.isFinite(raw.x) ? clamp(raw.x, 0, window.innerWidth - 120) : null;
        const y = Number.isFinite(raw.y) ? clamp(raw.y, 0, window.innerHeight - 60) : null;
        return { x, y, collapsed: raw.collapsed === true };
      } catch (_) {
        return { x: null, y: null, collapsed: false };
      }
    }

    function saveLayout(value) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
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
        { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: GLYPHS[symbol] || GLYPHS.task }),
      );
    }

    function formatNumber(value) {
      if (!Number.isFinite(value)) return '—';
      const abs = Math.abs(value);
      if (abs !== 0 && (abs >= 100000 || abs < 0.001)) return value.toExponential(1);
      return String(parseFloat(value.toPrecision(3)));
    }

    /** One bounded sparkline per named series: the loss curve, throughput, latency. */
    function SeriesChart({ series, t }) {
      const samples = (series.samples || []).filter(sample => Number.isFinite(sample.value));
      if (!samples.length) return null;
      const width = 100;
      const height = 26;
      const pad = 2.5;
      const low = Math.min(...samples.map(sample => sample.value));
      const high = Math.max(...samples.map(sample => sample.value));
      const span = high - low;
      const x = index => (samples.length === 1 ? width - pad : pad + (index * (width - pad * 2)) / (samples.length - 1));
      const y = value => (span === 0 ? height / 2 : pad + (1 - (value - low) / span) * (height - pad * 2));
      const points = samples.map((sample, index) => `${x(index).toFixed(2)},${y(sample.value).toFixed(2)}`).join(' ');
      const last = samples[samples.length - 1];
      const label = `${series.name}: ${t('seriesLatest')} ${formatNumber(last.value)}${series.unit || ''} · ${t('seriesRange', { low: formatNumber(low), high: formatNumber(high) })}`;
      return h(
        'div',
        { className: 'dla-series-row' },
        h('span', { className: 'dla-series-name', title: series.name }, series.name),
        h(
          'svg',
          { className: 'dla-series-chart', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': label },
          h('title', null, label),
          samples.length > 1 ? h('polygon', { points: `${points} ${x(samples.length - 1).toFixed(2)},${height - pad} ${x(0).toFixed(2)},${height - pad}` }) : null,
          samples.length > 1 ? h('polyline', { points, vectorEffect: 'non-scaling-stroke' }) : null,
          h('circle', { cx: x(samples.length - 1).toFixed(2), cy: y(last.value).toFixed(2), r: 1.7 }),
        ),
        h('span', { className: 'dla-series-value' }, formatNumber(last.value) + (series.unit || '')),
      );
    }

    function ActivityCard({ activity, now, t, onDismiss, onDragStart, onDragMove, onDragEnd, onMoveKey }) {
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

      const chips = [];
      if (counted) chips.push(h('span', { key: 'counts', className: 'dla-chip', 'data-tone': 'accent' }, t('counts', { done: state.completed, total: state.total })));
      else if (progress !== null) chips.push(h('span', { key: 'percent', className: 'dla-chip', 'data-tone': 'accent' }, t('progress', { percent: Math.round(progress * 100) })));
      if (remaining !== null) {
        chips.push(
          h(
            'span',
            { key: 'eta', className: 'dla-chip', 'data-tone': remaining <= 0 ? 'warn' : 'accent' },
            h('span', { 'aria-hidden': true }, '\u23f1'),
            remaining <= 0 ? t('overdue', { time: clockOf(eta) }) : t('eta', { time: clockOf(eta) }),
            remaining > 0 ? ' \u00b7 ' + t('etaLeft', { left: countdown(remaining) }) : '',
          ),
        );
      }
      if (stale) chips.push(h('span', { key: 'stale', className: 'dla-chip', 'data-tone': 'warn' }, t('stale')));
      if (ended) chips.push(h('span', { key: 'ended', className: 'dla-chip', 'data-tone': 'success' }, t('ended')));

      const footer = ended
        ? dismissIn !== null && dismissIn > 0
          ? t('removesIn', { left: countdown(dismissIn) })
          : t('ended')
        : refreshed(activity.updatedAt, now, t);

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
            h('span', { className: 'dla-title' }, attributes.title),
            attributes.subtitle ? h('span', { className: 'dla-sub' }, attributes.subtitle) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dla-close',
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
              { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true },
              h('path', { d: 'm6 6 12 12M18 6 6 18' }),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dla-body' },
          h('div', { className: 'dla-phase', role: 'status' }, state.phase),
          state.detail ? h('div', { className: 'dla-detail' }, state.detail) : null,
          progress !== null ? h('div', { className: 'dla-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress * 100), 'aria-label': counted ? t('counts', { done: state.completed, total: state.total }) : t('progress', { percent: Math.round(progress * 100) }) }, h('i', { style: { width: (progress * 100).toFixed(1) + '%' } })) : null,
          series.length ? h('div', { className: 'dla-series' }, series.map(item => h(SeriesChart, { key: item.name, series: item, t }))) : null,
          chips.length ? h('div', { className: 'dla-meta' }, chips) : null,
          h('div', { className: 'dla-foot' }, footer),
        ),
      );
    }

    function LiveActivities({ t }) {
      const { activities, error, failures } = useActivities();
      const now = useNow(1000);
      const [layout, setLayout] = useState(readLayout);
      const [expanded, setExpanded] = useState(false);
      const [removed, setRemoved] = useState(() => new Set());
      const [noticeHidden, setNoticeHidden] = useState(false);
      const layoutRef = useRef(layout);
      const dragRef = useRef(null);
      const rootRef = useRef(null);
      layoutRef.current = layout;

      const dismiss = useCallback(
        async id => {
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
        },
        [],
      );

      const release = useCallback(() => {
        if (!dragRef.current) return;
        dragRef.current = null;
        saveLayout(layoutRef.current);
      }, []);

      useEffect(() => {
        const onResize = () => {
          const current = layoutRef.current;
          if (current.x === null) return;
          setLayout({
            ...current,
            x: clamp(current.x, 0, Math.max(0, window.innerWidth - 140)),
            y: clamp(current.y, 0, Math.max(0, window.innerHeight - 60)),
          });
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, []);

      const visible = activities.filter(activity => {
        if (removed.has(activity.id)) return false;
        if (activity.status === 'ended' && Number.isFinite(activity.dismissAt) && now >= activity.dismissAt) return false;
        return true;
      });

      // One failed poll is a blip; three in a row means the card surface is
      // unreachable, and that is worth telling the user about once.
      const unavailable = !!error && failures >= 3 && !noticeHidden && !visible.length;
      if (!visible.length) {
        return unavailable
          ? h(
              'div',
              { className: 'dla', style: anchorOf(layout) },
              h('style', null, CSS),
              h(
                'div',
                { className: 'dla-error', role: 'status' },
                t('unavailable'),
                h('button', { type: 'button', className: 'dla-more', onClick: () => setNoticeHidden(true) }, t('dismiss')),
              ),
            )
          : null;
      }

      const starting = event => {
        if (event.button !== 0 || !rootRef.current) return;
        const rect = rootRef.current.getBoundingClientRect();
        dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, id: event.pointerId };
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      };
      const moving = event => {
        const drag = dragRef.current;
        if (!drag) return;
        setLayout(previous => ({
          ...previous,
          x: clamp(event.clientX - drag.dx, 0, Math.max(0, window.innerWidth - 140)),
          y: clamp(event.clientY - drag.dy, 0, Math.max(0, window.innerHeight - 60)),
        }));
      };
      const ending = event => {
        if (!dragRef.current) return;
        if (event.currentTarget.releasePointerCapture) {
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch (_) {
            // A cancelled pointer already released capture.
          }
        }
        release();
      };

      // Keyboard equivalent of dragging: arrow keys move the stack in 16 px
      // steps, Shift makes it 4 px for fine placement.
      const moveKey = event => {
        const step = event.shiftKey ? 4 : 16;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const rect = rootRef.current ? rootRef.current.getBoundingClientRect() : null;
        const previous = layoutRef.current;
        const baseX = previous.x === null ? (rect ? rect.left : 0) : previous.x;
        const baseY = previous.y === null ? (rect ? rect.top : 72) : previous.y;
        const next = {
          ...previous,
          x: clamp(baseX + delta[0], 0, Math.max(0, window.innerWidth - 140)),
          y: clamp(baseY + delta[1], 0, Math.max(0, window.innerHeight - 60)),
        };
        setLayout(next);
        saveLayout(next);
      };

      const top = visible[0];
      const accent = ACCENTS[(top.attributes || {}).accent] || ACCENTS.brand;
      const activeCount = visible.filter(activity => activity.status === 'active').length;

      const toggle = () => {
        const next = { ...layoutRef.current, collapsed: !layout.collapsed };
        setLayout(next);
        saveLayout(next);
      };

      if (layout.collapsed) {
        return h(
          'div',
          { className: 'dla', style: anchorOf(layout), ref: rootRef },
          h('style', null, CSS),
          h(
            'button',
            {
              type: 'button',
              className: 'dla-pill',
              onClick: toggle,
              'aria-label': t('expand'),
              title: t('expand'),
              style: { '--accent': accent },
            },
            h('span', { className: 'dla-dot' }),
            h('span', { className: 'dla-pill-label' }, top.state && top.state.phase ? top.state.phase : t('group')),
            activeCount ? h('span', { className: 'dla-pill-count' }, t('count', { n: activeCount })) : null,
          ),
        );
      }

      const shown = expanded ? visible : visible.slice(0, MAX_COLLAPSED);
      const hidden = visible.length - shown.length;

      return h(
        'div',
        { className: 'dla', style: anchorOf(layout), ref: rootRef, 'aria-label': t('group') },
        h('style', null, CSS),
        shown.map(activity =>
          h(ActivityCard, {
            key: activity.id,
            activity,
            now,
            t,
            onDismiss: dismiss,
            onDragStart: starting,
            onDragMove: moving,
            onDragEnd: ending,
            onMoveKey: moveKey,
          }),
        ),
        h(
          'div',
          { className: 'dla-actions' },
          hidden > 0 ? h('button', { type: 'button', className: 'dla-more', onClick: () => setExpanded(true) }, t('more', { n: hidden })) : null,
          expanded && visible.length > MAX_COLLAPSED ? h('button', { type: 'button', className: 'dla-more', onClick: () => setExpanded(false) }, t('less')) : null,
          h(
            'button',
            { type: 'button', className: 'dla-more', onClick: toggle, 'aria-label': t('collapse'), title: t('collapse') },
            h(
              'svg',
              { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
              h('path', { d: 'm6 15 6-6 6 6' }),
            ),
          ),
        ),
      );
    }

    function anchorOf(layout) {
      if (layout.x === null || layout.y === null) return { right: 20, top: 72 };
      return { left: layout.x, top: layout.y };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }));
        const bound = ctx.locale.bind(NS);
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-live-activity', order: 30, locale: NS }, props =>
            h(LiveActivities, { ...props, t: props && props.t ? props.t : bound }),
          ),
        );
      },
    };
  },
});
