const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const db = require('../utils/db');
const config = require('../config.json');
const { error } = require('../utils/utils');

// Same as events/pp.js: list of { userId, channelId, username } from config
function getTrackedUsers() {
    if (Array.isArray(config.ppTracking) && config.ppTracking.length > 0) {
        return config.ppTracking.map(t => ({
            userId: String(t.userId),
            channelId: String(t.channelId),
            username: t.username || t.userId,
        }));
    }
    if (config.devilshinxID && config.pptracking) {
        return [{ userId: String(config.devilshinxID), channelId: String(config.pptracking), username: 'devilshinx' }];
    }
    return [];
}

// Global scale for crisp output (2× = HD — larger canvas + fonts; Discord embed scales down)
const HD_SCALE = 2;

// Cell size and layout for the year grid: column-major (oldest top→bottom, columns left→right), 14 rows high
const CELL_SIZE = Math.round(14 * HD_SCALE);
const CELL_GAP = Math.round(3 * HD_SCALE);
const ROWS = 14;
const COLS = Math.ceil(365 / ROWS);
const PADDING = Math.round(40 * HD_SCALE);
const LEGEND_HEIGHT = Math.round(88 * HD_SCALE);
const HEADER_HEIGHT = Math.round(88 * HD_SCALE);
const MONTH_LABEL_H = Math.round(22 * HD_SCALE);

// Theme: deep slate base + emerald/teal accents (readable on dark)
const THEME = {
    bg: '#0f172a',
    bgGrid: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    axis: '#64748b',
    accent: '#22c55e',
    accentMuted: '#16a34a',
    barEmpty: '#334155',
    heatEmpty: '#1e293b',
};

function getColorForMinutes(minutes) {
    if (minutes === 0) return THEME.heatEmpty;
    if (minutes < 30) return '#6ee7b7';
    if (minutes < 60) return '#34d399';
    if (minutes < 120) return '#10b981';
    if (minutes < 180) return '#059669';
    return '#047857';
}

async function fetchYearData(userId) {
    await db.connect();
    const collection = db.db.collection('daily_gaming_stats');
    // Match userId as string (how pp.js stores it) or as number
    const userIdStr = String(userId);
    const docs = await collection
        .find({
            $or: [
                { userId: userIdStr },
                { userId },
            ],
        })
        .sort({ date: 1 })
        .toArray();

    // Map date string -> total play time in ms (use doc.date as stored)
    const byDate = {};
    const gameTotals = {};
    const byMonthGameNames = {};
    for (const doc of docs) {
        const dateStr = doc.date;
        if (!dateStr) continue;
        byDate[dateStr] = Number(doc.totalPlayTime) || 0;
        const monthKey = dateStr.slice(0, 7);
        if (!byMonthGameNames[monthKey]) byMonthGameNames[monthKey] = new Set();
        if (doc.games && Array.isArray(doc.games)) {
            for (const g of doc.games) {
                const name = g.name || 'Unknown';
                const dur = Number(g.totalDuration) || 0;
                gameTotals[name] = (gameTotals[name] || 0) + dur;
                byMonthGameNames[monthKey].add(name);
            }
        }
    }

    const sortedDates = Object.keys(byDate).sort();
    if (sortedDates.length === 0) {
        const now = new Date();
        const monthly = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthly.push({ label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, key: '', ms: 0 });
        }
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekday = dayNames.map(label => ({ label, ms: 0 }));
        const daysPlayedPerMonth = monthly.map(m => ({ ...m, count: 0, daysInMonth: 31 }));
        const weekly = Array.from({ length: 26 }, (_, w) => ({ label: `Wk ${w + 1}`, ms: 0 }));
        const dailyDistribution = [{ label: 'No play', count: 365 }, { label: '<30m', count: 0 }, { label: '30m-1h', count: 0 }, { label: '1h-2h', count: 0 }, { label: '2h+', count: 0 }];
        const last30Days = new Array(30).fill(0);
        const cumulative = new Array(365).fill(0);
        const gamesPerMonth = monthly.map(m => ({ ...m, count: 0 }));
        const allGames = [];
        const endDateStrEmpty = new Date().toISOString().split('T')[0];
        return { days: new Array(365).fill(0), totalMs: 0, topGames: [], monthly, weekday, daysPlayedPerMonth, weekly, dailyDistribution, last30Days, cumulative, gamesPerMonth, allGames, endDateStr: endDateStrEmpty };
    }

    // Build 365 days ending on the most recent date we have
    const lastDate = sortedDates[sortedDates.length - 1];
    const end = new Date(lastDate + 'T12:00:00Z');
    const days = [];
    for (let i = 364; i >= 0; i--) {
        const d = new Date(end);
        d.setUTCDate(d.getUTCDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days.push(byDate[dateStr] || 0);
    }

    const totalMs = days.reduce((a, b) => a + b, 0);
    const topGames = Object.entries(gameTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, ms]) => ({ name, ms }));

    // Monthly totals: last 12 months (key = "YYYY-MM", value = ms)
    const byMonth = {};
    for (const [dateStr, ms] of Object.entries(byDate)) {
        const monthKey = dateStr.slice(0, 7);
        byMonth[monthKey] = (byMonth[monthKey] || 0) + ms;
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const endMonth = new Date(lastDate + 'T12:00:00Z');
    const monthly = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - i, 1);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        monthly.push({
            label: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
            key,
            ms: byMonth[key] || 0,
        });
    }

    // Weekday totals (0 = Mon .. 6 = Sun) over the year
    const weekdayMs = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const [dateStr, ms] of Object.entries(byDate)) {
        const jsDay = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun, 1=Mon, ...
        const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0, ..., Sun=6
        weekdayMs[idx] += ms;
    }
    const weekday = dayNames.map((label, i) => ({ label, ms: weekdayMs[i] }));

    // Days played per month (count of days with play in each of last 12 months)
    const byMonthDayCount = {};
    for (const dateStr of Object.keys(byDate)) {
        const key = dateStr.slice(0, 7);
        byMonthDayCount[key] = (byMonthDayCount[key] || 0) + 1;
    }
    const daysPlayedPerMonth = [];
    const gamesPerMonth = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - i, 1);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const daysInMonth = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
        daysPlayedPerMonth.push({
            label: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
            key,
            count: byMonthDayCount[key] || 0,
            daysInMonth,
        });
        gamesPerMonth.push({
            label: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
            key,
            count: (byMonthGameNames[key] && byMonthGameNames[key].size) || 0,
        });
    }

    // Weekly totals: last 26 weeks (most recent first)
    const weekly = [];
    for (let w = 0; w < 26; w++) {
        const startIdx = Math.max(0, 365 - 7 * (w + 1));
        const endIdx = 365 - 7 * w;
        if (startIdx >= endIdx) break;
        const weekMs = days.slice(startIdx, endIdx).reduce((a, b) => a + b, 0);
        const weekStart = new Date(end);
        weekStart.setUTCDate(weekStart.getUTCDate() - (364 - startIdx));
        const label = `${weekStart.getUTCDate()} ${monthNames[weekStart.getUTCMonth()]}`;
        weekly.push({ label, ms: weekMs });
    }

    // Daily distribution: how many days in each play-time bucket
    const distBuckets = [{ label: 'No play', count: 0 }, { label: '<30m', count: 0 }, { label: '30m-1h', count: 0 }, { label: '1h-2h', count: 0 }, { label: '2h+', count: 0 }];
    for (const ms of days) {
        const min = ms / (1000 * 60);
        if (min === 0) distBuckets[0].count++;
        else if (min < 30) distBuckets[1].count++;
        else if (min < 60) distBuckets[2].count++;
        else if (min < 120) distBuckets[3].count++;
        else distBuckets[4].count++;
    }

    // Last 30 days (raw ms per day)
    const last30Days = days.slice(-30);

    // Cumulative play time over the year (running sum in ms)
    let cum = 0;
    const cumulative = days.map(ms => (cum += ms));

    // All games (for word cloud), sorted by play time desc
    const allGames = Object.entries(gameTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([name, ms]) => ({ name, ms }));

    return { days, totalMs, topGames, monthly, weekday, daysPlayedPerMonth, weekly: weekly.length ? weekly : Array.from({ length: 26 }, (_, i) => ({ label: `Wk ${i + 1}`, ms: 0 })), dailyDistribution: distBuckets, last30Days, cumulative, gamesPerMonth, allGames, endDateStr: lastDate };
}

function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function dateForGridDay(dayIdx, endDateStr) {
    const end = new Date((endDateStr || new Date().toISOString().split('T')[0]) + 'T12:00:00Z');
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (364 - dayIdx));
    return d;
}

/** Title for year heatmap; `verticalScale` scales fonts/positions when compositing onto combined canvas. */
function drawYearInALifeTitle(ctx, width, userLabel, offsetY, verticalScale) {
    const name = String(userLabel || 'PP').trim() || 'PP';
    const maxTitleW = width - Math.round(48 * HD_SCALE);
    const vs = verticalScale;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = THEME.text;

    const subtitlePx = Math.round(19 * HD_SCALE * vs);
    const line1Baseline = offsetY + Math.round(38 * HD_SCALE * vs);
    ctx.font = `600 ${subtitlePx}px sans-serif`;
    ctx.fillText('Year in the life of', width / 2, line1Baseline);

    let namePx = Math.round(34 * HD_SCALE * vs);
    ctx.font = `bold ${namePx}px sans-serif`;
    let nameText = name;
    while (ctx.measureText(nameText).width > maxTitleW && namePx > Math.round(14 * HD_SCALE * vs)) {
        namePx -= Math.max(1, Math.round(2 * vs));
        ctx.font = `bold ${namePx}px sans-serif`;
    }
    if (ctx.measureText(nameText).width > maxTitleW) {
        while (nameText.length > 1 && ctx.measureText(`${nameText}…`).width > maxTitleW) {
            nameText = nameText.slice(0, -1);
        }
        nameText = `${nameText}…`;
    }
    const line2Baseline = line1Baseline + Math.round(subtitlePx * 1.28) + Math.round(6 * HD_SCALE * vs);
    ctx.fillText(nameText, width / 2, line2Baseline);
}

function drawYearInALifeGraph(data, userLabel = 'PP', options = {}) {
    const { omitTitle = false } = options;
    const { days, totalMs, topGames, endDateStr } = data;
    // Combined export uses omitTitle: title lives in COMBINED_HEADER_H; skip the in-canvas title band so the grid sits higher.
    const headerBandH = omitTitle ? 0 : HEADER_HEIGHT;
    const gridBlockH = ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const width = PADDING * 2 + COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const naturalHeight =
        headerBandH + MONTH_LABEL_H + PADDING * 2 + gridBlockH + LEGEND_HEIGHT;
    let height = naturalHeight;
    let legendGap = 0;
    if (omitTitle) {
        const row0Aspect = COMBINED_CELL_W / COMBINED_CELL_H_TOP;
        const targetH = Math.ceil(width / row0Aspect);
        if (targetH > naturalHeight) {
            height = targetH;
            legendGap = targetH - naturalHeight;
        }
    }
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    if (!omitTitle) {
        drawYearInALifeTitle(ctx, width, userLabel, 0, 1);
    }

    const gridLeft = PADDING;
    const gridTop = headerBandH + MONTH_LABEL_H + PADDING;

    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    ctx.font = `${Math.round(11 * HD_SCALE)}px sans-serif`;
    ctx.fillStyle = THEME.textMuted;
    ctx.textAlign = 'center';
    let prevMonth = -1;
    for (let col = 0; col < COLS; col++) {
        const dayIdx = col * ROWS;
        if (dayIdx >= 365) break;
        const d = dateForGridDay(dayIdx, endDateStr);
        const m = d.getUTCMonth();
        if (col === 0 || m !== prevMonth) {
            const x = gridLeft + col * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
            const y = headerBandH + PADDING - Math.round(4 * HD_SCALE);
            ctx.fillText(monthShort[m], x, y);
            prevMonth = m;
        }
    }

    for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) {
            const dayIdx = col * ROWS + row;
            const ms = dayIdx < 365 ? days[dayIdx] : 0;
            const minutes = Math.floor(ms / (1000 * 60));
            const color = getColorForMinutes(minutes);

            const x = gridLeft + col * (CELL_SIZE + CELL_GAP);
            const y = gridTop + row * (CELL_SIZE + CELL_GAP);

            ctx.fillStyle = color;
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            ctx.strokeStyle = THEME.bgGrid;
            ctx.lineWidth = Math.max(1, HD_SCALE);
            ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
        }
    }

    const legendY = gridTop + gridBlockH + Math.round(22 * HD_SCALE) + legendGap;
    ctx.fillStyle = THEME.textMuted;
    ctx.font = `${Math.round(12 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Less', gridLeft, legendY);
    const levels = [
        { label: '0', color: THEME.heatEmpty },
        { label: '<30m', color: '#6ee7b7' },
        { label: '30m–1h', color: '#34d399' },
        { label: '1h–2h', color: '#10b981' },
        { label: '2h–3h', color: '#059669' },
        { label: '3h+', color: '#047857' },
    ];
    const sw = Math.round(12 * HD_SCALE);
    const gap = Math.round(52 * HD_SCALE);
    let lx = gridLeft + Math.round(40 * HD_SCALE);
    for (const level of levels) {
        ctx.fillStyle = level.color;
        ctx.fillRect(lx, legendY - sw + 2, sw, sw);
        ctx.strokeStyle = THEME.bgGrid;
        ctx.lineWidth = 1;
        ctx.strokeRect(lx + 0.5, legendY - sw + 2.5, sw - 1, sw - 1);
        ctx.fillStyle = THEME.textMuted;
        ctx.fillText(level.label, lx + sw + Math.round(6 * HD_SCALE), legendY);
        lx += gap;
    }

    ctx.fillStyle = THEME.text;
    ctx.font = `${Math.round(14 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'left';
    const totalHours = (totalMs / (1000 * 60 * 60)).toFixed(1);
    const daysPlayed = days.filter(ms => ms > 0).length;
    const avgMin = daysPlayed > 0 ? ((totalMs / daysPlayed) / (1000 * 60)).toFixed(0) : '0';
    ctx.fillText(`Total: ${totalHours} h · ${daysPlayed} active days · ~${avgMin} min/day (when active)`, gridLeft, legendY + Math.round(28 * HD_SCALE));
    if (topGames.length > 0) {
        const topLine = `Top: ${topGames.map(g => g.name).slice(0, 3).join(' · ')}`;
        ctx.fillStyle = THEME.textMuted;
        ctx.font = `${Math.round(12 * HD_SCALE)}px sans-serif`;
        ctx.fillText(topLine, gridLeft, legendY + Math.round(50 * HD_SCALE));
    }

    return canvas;
}

// Wider plot area so labels read less cramped; keep in sync with COMBINED_CELL_* aspect (see below).
const CHART_WIDTH = 960 * HD_SCALE;
const CHART_HEIGHT = 420 * HD_SCALE;
// Combined grid: column width from chart aspect; row 0 uses COMBINED_CELL_H_TOP.
const COMBINED_CELL_H = 350 * HD_SCALE;
const COMBINED_CELL_H_TOP = 430 * HD_SCALE;
const COMBINED_CELL_W = Math.round(COMBINED_CELL_H * (CHART_WIDTH / CHART_HEIGHT));
const CHART_PADDING = {
    top: 50 * HD_SCALE,
    right: 44 * HD_SCALE,
    bottom: 72 * HD_SCALE,
    left: 88 * HD_SCALE,
};

const BAR_PALETTE = ['#22c55e', '#14b8a6', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#fb923c', '#34d399', '#2dd4bf', '#4ade80', '#818cf8', '#f87171'];

function cf(px) {
    return `${Math.round(px * HD_SCALE)}px sans-serif`;
}

function drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxVal, formatTick, tickCount = 5) {
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = Math.max(1, HD_SCALE);
    ctx.setLineDash([Math.round(4 * HD_SCALE), Math.round(6 * HD_SCALE)]);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(11);
    ctx.textAlign = 'right';
    for (let t = 0; t <= tickCount; t++) {
        const frac = t / tickCount;
        const val = maxVal * frac;
        const y = chartBottom - frac * (chartBottom - chartTop);
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
        ctx.fillText(formatTick(val), chartLeft - Math.round(8 * HD_SCALE), y + Math.round(4 * HD_SCALE));
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

function drawMonthlyChart(data) {
    const { monthly } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Monthly most played (last 12 months)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const maxMs = Math.max(...monthly.map(m => m.ms), 1);
    const maxHours = maxMs / (1000 * 60 * 60);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxHours, v => `${v.toFixed(v >= 10 ? 0 : 1)}h`);

    const barGap = 4 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (monthly.length - 1)) / monthly.length;

    for (let i = 0; i < monthly.length; i++) {
        const m = monthly[i];
        const hours = m.ms / (1000 * 60 * 60);
        const barH = maxMs > 0 ? (m.ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;

        ctx.fillStyle = barH > 0 ? BAR_PALETTE[i % BAR_PALETTE.length] : THEME.barEmpty;
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(11);
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartBottom + Math.round(14 * HD_SCALE));
        ctx.rotate(-0.35);
        ctx.fillText(m.label, 0, 0);
        ctx.restore();

        const label = `${hours.toFixed(1)}h`;
        ctx.font = cf(10);
        ctx.textAlign = 'center';
        if (barH > Math.round(20 * HD_SCALE)) {
            ctx.fillStyle = THEME.text;
            ctx.fillText(label, x + barWidth / 2, y + barH / 2 + Math.round(4 * HD_SCALE));
        } else {
            ctx.fillStyle = THEME.textMuted;
            ctx.fillText(label, x + barWidth / 2, y - Math.round(6 * HD_SCALE));
        }
    }

    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(12);
    ctx.textAlign = 'center';
    ctx.fillText('Hours (bar height)', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(10 * HD_SCALE));

    return canvas;
}

function drawTopGamesChart(data) {
    const { topGames } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Most played games (year)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const list = topGames.slice(0, 10);
    if (list.length === 0) {
        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(16);
        ctx.textAlign = 'center';
        ctx.fillText('No game data for the past year', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        return canvas;
    }

    const totalListMs = list.reduce((a, g) => a + g.ms, 0);
    const maxMs = Math.max(...list.map(g => g.ms), 1);
    const rowHeight = chartHeight / list.length;
    const labelMaxW = 220 * HD_SCALE;
    const barH = Math.max(Math.round(18 * HD_SCALE), rowHeight * 0.55);

    for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const barW = maxMs > 0 ? (g.ms / maxMs) * (chartWidth - labelMaxW - Math.round(28 * HD_SCALE)) : 0;
        const y = chartTop + i * rowHeight + rowHeight / 2 - barH / 2;

        const name = g.name.length > 28 ? g.name.slice(0, 25) + '...' : g.name;
        ctx.fillStyle = THEME.text;
        ctx.font = cf(12);
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}. ${name}`, chartLeft, y + barH * 0.72);

        const fill = BAR_PALETTE[i % BAR_PALETTE.length];
        ctx.fillStyle = fill;
        ctx.fillRect(chartLeft + labelMaxW, y, barW, barH);
        ctx.strokeStyle = THEME.bgGrid;
        ctx.lineWidth = 1;
        ctx.strokeRect(chartLeft + labelMaxW + 0.5, y + 0.5, barW - 1, barH - 1);

        const hours = (g.ms / (1000 * 60 * 60)).toFixed(1);
        const pct = totalListMs > 0 ? ((g.ms / totalListMs) * 100).toFixed(0) : '0';
        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(11);
        ctx.textAlign = 'right';
        ctx.fillText(`${hours}h (${pct}% of top 10)`, chartRight, y + barH * 0.72);
    }

    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(10);
    ctx.textAlign = 'center';
    ctx.fillText('Right: hours and share of top-10 play time', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(12 * HD_SCALE));

    return canvas;
}

function drawWeekdayChart(data) {
    const { weekday } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Play time by day of week (past year)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const maxMs = Math.max(...weekday.map(w => w.ms), 1);
    const maxHours = maxMs / (1000 * 60 * 60);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxHours, v => `${v.toFixed(v >= 10 ? 0 : 1)}h`);

    const barGap = 8 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (weekday.length - 1)) / weekday.length;
    const totalWeekMs = weekday.reduce((a, w) => a + w.ms, 0);

    for (let i = 0; i < weekday.length; i++) {
        const w = weekday[i];
        const hours = w.ms / (1000 * 60 * 60);
        const barH = maxMs > 0 ? (w.ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;

        ctx.fillStyle = barH > 0 ? BAR_PALETTE[i % BAR_PALETTE.length] : THEME.barEmpty;
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(12);
        ctx.textAlign = 'center';
        ctx.fillText(w.label, x + barWidth / 2, chartBottom + Math.round(22 * HD_SCALE));

        const pct = totalWeekMs > 0 ? ((w.ms / totalWeekMs) * 100).toFixed(0) : '0';
        const label = `${hours.toFixed(1)}h · ${pct}%`;
        ctx.font = cf(10);
        if (barH > Math.round(22 * HD_SCALE)) {
            ctx.fillStyle = THEME.text;
            ctx.fillText(label, x + barWidth / 2, y + barH / 2 + Math.round(4 * HD_SCALE));
        } else {
            ctx.fillStyle = THEME.textMuted;
            ctx.fillText(label, x + barWidth / 2, y - Math.round(6 * HD_SCALE));
        }
    }

    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(11);
    ctx.textAlign = 'center';
    ctx.fillText('Hours · % of weekly total', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(14 * HD_SCALE));

    return canvas;
}

function drawDaysPlayedChart(data) {
    const { daysPlayedPerMonth } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Days played per month (last 12 months)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const maxCount = Math.max(...daysPlayedPerMonth.map(m => m.count), 1);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxCount, v => String(Math.round(v)));

    const barGap = 4 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (daysPlayedPerMonth.length - 1)) / daysPlayedPerMonth.length;

    for (let i = 0; i < daysPlayedPerMonth.length; i++) {
        const m = daysPlayedPerMonth[i];
        const barH = maxCount > 0 ? (m.count / maxCount) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;

        ctx.fillStyle = barH > 0 ? BAR_PALETTE[i % BAR_PALETTE.length] : THEME.barEmpty;
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(11);
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartBottom + Math.round(14 * HD_SCALE));
        ctx.rotate(-0.35);
        ctx.fillText(m.label, 0, 0);
        ctx.restore();

        const pct = m.daysInMonth > 0 ? ((m.count / m.daysInMonth) * 100).toFixed(0) : '0';
        const line1 = `${m.count}/${m.daysInMonth}`;
        const line2 = `${pct}%`;
        const lineSpacing = Math.round(5 * HD_SCALE);
        const cx = x + barWidth / 2;
        ctx.font = cf(10);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const twoLineMinBarH = Math.round(26 * HD_SCALE);
        if (barH > twoLineMinBarH) {
            const cy = y + barH / 2;
            ctx.fillStyle = THEME.text;
            ctx.fillText(line1, cx, cy - lineSpacing);
            ctx.fillText(line2, cx, cy + lineSpacing);
        } else {
            ctx.fillStyle = THEME.textMuted;
            const cy = y - Math.round(12 * HD_SCALE);
            ctx.fillText(line1, cx, cy - lineSpacing);
            ctx.fillText(line2, cx, cy + lineSpacing);
        }
    }

    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Days with play · % of month', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(10 * HD_SCALE));

    return canvas;
}

function drawWeeklyChart(data) {
    const { weekly } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Play time per week (last 26 weeks)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const list = weekly.slice(0, 26);
    const maxMs = Math.max(...list.map(w => w.ms), 1);
    const maxHours = maxMs / (1000 * 60 * 60);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxHours, v => `${v.toFixed(v >= 10 ? 0 : 1)}h`);

    const barGap = 2 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (list.length - 1)) / list.length;

    for (let i = 0; i < list.length; i++) {
        const w = list[i];
        const barH = maxMs > 0 ? (w.ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = barH > 0 ? BAR_PALETTE[i % BAR_PALETTE.length] : THEME.barEmpty;
        ctx.fillRect(x, y, barWidth, barH);
        const hrs = w.ms / (1000 * 60 * 60);
        const hStr = hrs >= 10 ? `${hrs.toFixed(0)}h` : `${hrs.toFixed(1)}h`;
        ctx.font = cf(7);
        ctx.textAlign = 'center';
        if (barH > Math.round(14 * HD_SCALE)) {
            ctx.fillStyle = THEME.text;
            ctx.fillText(hStr, x + barWidth / 2, y + barH / 2 + Math.round(3 * HD_SCALE));
        } else if (hrs > 0) {
            ctx.fillStyle = THEME.textMuted;
            const ly = y - Math.round(3 * HD_SCALE);
            ctx.fillText(hStr, x + barWidth / 2, ly < chartTop + Math.round(10 * HD_SCALE) ? y + barH + Math.round(10 * HD_SCALE) : ly);
        }
    }
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(11);
    ctx.textAlign = 'center';
    ctx.fillText('Oldest weeks ← … → Most recent (right) · hours on/above bars', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(14 * HD_SCALE));
    return canvas;
}

function drawDailyDistributionChart(data) {
    const { dailyDistribution } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('How many days in each play-time bucket (year)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxCount = Math.max(...dailyDistribution.map(d => d.count), 1);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxCount, v => String(Math.round(v)));

    const barGap = 12 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (dailyDistribution.length - 1)) / dailyDistribution.length;
    const colors = [THEME.barEmpty, '#6ee7b7', '#34d399', '#10b981', '#047857'];
    const totalDays = dailyDistribution.reduce((a, d) => a + d.count, 0);

    for (let i = 0; i < dailyDistribution.length; i++) {
        const d = dailyDistribution[i];
        const barH = maxCount > 0 ? (d.count / maxCount) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, y, barWidth, barH);
        ctx.strokeStyle = THEME.bgGrid;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, barWidth - 1, barH - 1);
        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(12);
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barWidth / 2, chartBottom + Math.round(22 * HD_SCALE));
        const pct = totalDays > 0 ? ((d.count / totalDays) * 100).toFixed(0) : '0';
        const label = `${d.count} d (${pct}%)`;
        ctx.font = cf(11);
        if (barH > Math.round(22 * HD_SCALE)) {
            ctx.fillStyle = THEME.text;
            ctx.fillText(label, x + barWidth / 2, y + barH / 2 + Math.round(4 * HD_SCALE));
        } else {
            ctx.fillStyle = THEME.textMuted;
            ctx.fillText(label, x + barWidth / 2, y - Math.round(6 * HD_SCALE));
        }
    }
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(11);
    ctx.textAlign = 'center';
    ctx.fillText('Day count · % of year', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(12 * HD_SCALE));
    return canvas;
}

function drawLast30Chart(data) {
    const { last30Days } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Last 30 days — play time per day', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxMs = Math.max(...last30Days, 1);
    const maxHours = maxMs / (1000 * 60 * 60);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxHours, v => `${v.toFixed(v >= 10 ? 0 : 1)}h`);

    const barGap = 2 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (last30Days.length - 1)) / last30Days.length;

    for (let i = 0; i < last30Days.length; i++) {
        const ms = last30Days[i];
        const barH = maxMs > 0 ? (ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = barH > 0 ? BAR_PALETTE[i % BAR_PALETTE.length] : THEME.barEmpty;
        ctx.fillRect(x, y, barWidth, barH);
        const hrs = ms / (1000 * 60 * 60);
        const hStr = hrs >= 1 ? `${hrs.toFixed(1)}h` : ms > 0 ? `${Math.round(ms / 60000)}m` : '';
        if (hStr) {
            ctx.font = cf(7);
            ctx.textAlign = 'center';
            if (barH > Math.round(16 * HD_SCALE)) {
                ctx.fillStyle = THEME.text;
                ctx.fillText(hStr, x + barWidth / 2, y + barH / 2 + Math.round(3 * HD_SCALE));
            } else {
                ctx.fillStyle = THEME.textMuted;
                const ly = y - Math.round(2 * HD_SCALE);
                ctx.fillText(hStr, x + barWidth / 2, ly < chartTop + Math.round(8 * HD_SCALE) ? y + barH + Math.round(9 * HD_SCALE) : ly);
            }
        }
    }
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(9);
    ctx.textAlign = 'center';
    for (let i = 0; i < last30Days.length; i += 5) {
        const x = chartLeft + i * (barWidth + barGap) + barWidth / 2;
        const daysAgo = 30 - i;
        const lab = daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `−${daysAgo}d`;
        ctx.fillText(lab, x, chartBottom + Math.round(20 * HD_SCALE));
    }
    const lastI = last30Days.length - 1;
    const lastX = chartLeft + lastI * (barWidth + barGap) + barWidth / 2;
    ctx.fillText('today', lastX, chartBottom + Math.round(32 * HD_SCALE));
    ctx.font = cf(11);
    ctx.fillText('30 days ago → today (right)', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(12 * HD_SCALE));
    return canvas;
}

function drawCumulativeChart(data) {
    const { cumulative } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Cumulative play time over the year', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxCum = Math.max(...cumulative, 1);
    const maxHours = maxCum / (1000 * 60 * 60);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxHours, v => `${Math.round(v)}h`);

    const grad = ctx.createLinearGradient(chartLeft, chartTop, chartLeft, chartBottom);
    grad.addColorStop(0, 'rgba(34, 197, 94, 0.35)');
    grad.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    for (let i = 0; i < cumulative.length; i++) {
        const x = chartLeft + (i / (cumulative.length - 1 || 1)) * chartWidth;
        const y = chartBottom - (cumulative[i] / maxCum) * chartHeight;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(chartRight, chartBottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = Math.round(2 * HD_SCALE);
    ctx.beginPath();
    for (let i = 0; i < cumulative.length; i++) {
        const x = chartLeft + (i / (cumulative.length - 1 || 1)) * chartWidth;
        const y = chartBottom - (cumulative[i] / maxCum) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(12);
    ctx.textAlign = 'center';
    const totalH = (cumulative[cumulative.length - 1] / (1000 * 60 * 60)).toFixed(1);
    ctx.fillText(`End total: ${totalH} h · Y-axis: cumulative hours`, CHART_WIDTH / 2, CHART_HEIGHT - Math.round(12 * HD_SCALE));
    return canvas;
}

function drawGamesPerMonthChart(data) {
    const { gamesPerMonth } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Unique games played per month (last 12 months)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxCount = Math.max(...gamesPerMonth.map(m => m.count), 1);
    drawYAxisLabels(ctx, chartLeft, chartTop, chartBottom, chartRight, maxCount, v => String(Math.round(v)));

    const barGap = 4 * HD_SCALE;
    const barWidth = (chartWidth - barGap * (gamesPerMonth.length - 1)) / gamesPerMonth.length;

    for (let i = 0; i < gamesPerMonth.length; i++) {
        const m = gamesPerMonth[i];
        const barH = maxCount > 0 ? (m.count / maxCount) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = barH > 0 ? BAR_PALETTE[(i + 3) % BAR_PALETTE.length] : THEME.barEmpty;
        ctx.fillRect(x, y, barWidth, barH);
        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(11);
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartBottom + Math.round(14 * HD_SCALE));
        ctx.rotate(-0.35);
        ctx.fillText(m.label, 0, 0);
        ctx.restore();
        const label = `${m.count} games`;
        ctx.font = cf(10);
        ctx.textAlign = 'center';
        if (barH > Math.round(16 * HD_SCALE)) {
            ctx.fillStyle = THEME.text;
            ctx.fillText(label, x + barWidth / 2, y + barH / 2 + Math.round(4 * HD_SCALE));
        } else {
            ctx.fillStyle = THEME.textMuted;
            ctx.fillText(label, x + barWidth / 2, y - Math.round(6 * HD_SCALE));
        }
    }
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = HD_SCALE;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = THEME.textMuted;
    ctx.font = cf(11);
    ctx.textAlign = 'center';
    ctx.fillText('Distinct titles that month', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(12 * HD_SCALE));
    return canvas;
}

function drawTopGamesPieChart(data) {
    const { topGames } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Play time share — top 6 games (year)', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));

    const list = topGames.slice(0, 6);
    if (list.length === 0) {
        ctx.fillStyle = THEME.textMuted;
        ctx.font = cf(16);
        ctx.textAlign = 'center';
        ctx.fillText('No game data for the past year', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        return canvas;
    }
    const totalMs = list.reduce((a, g) => a + g.ms, 0);
    if (totalMs === 0) return canvas;

    const cx = CHART_WIDTH / 2;
    const cy = Math.round(80 * HD_SCALE) + (CHART_HEIGHT - Math.round(120 * HD_SCALE)) / 2;
    const radius = Math.min(Math.round(180 * HD_SCALE), (CHART_HEIGHT - Math.round(120 * HD_SCALE)) / 2 - Math.round(20 * HD_SCALE));
    const colors = BAR_PALETTE.slice(0, 6);
    let startAngle = -Math.PI / 2;

    for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const slice = (g.ms / totalMs) * 2 * Math.PI;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = THEME.bg;
        ctx.lineWidth = Math.round(2 * HD_SCALE);
        ctx.stroke();
        const mid = startAngle + slice / 2;
        const lr = radius * 0.62;
        const lx = cx + Math.cos(mid) * lr;
        const ly = cy + Math.sin(mid) * lr;
        const pct = totalMs > 0 ? ((g.ms / totalMs) * 100).toFixed(0) : 0;
        ctx.fillStyle = THEME.text;
        ctx.font = cf(12);
        ctx.textAlign = 'center';
        ctx.fillText(`${pct}%`, lx, ly + Math.round(4 * HD_SCALE));
        startAngle += slice;
    }

    const legendY = Math.round(60 * HD_SCALE);
    const lineH = Math.round(24 * HD_SCALE);
    for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const pct = totalMs > 0 ? ((g.ms / totalMs) * 100).toFixed(0) : 0;
        const name = g.name.length > 24 ? g.name.slice(0, 21) + '...' : g.name;
        const hours = (g.ms / (1000 * 60 * 60)).toFixed(1);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(CHART_PADDING.left, legendY + i * lineH, Math.round(14 * HD_SCALE), Math.round(14 * HD_SCALE));
        ctx.fillStyle = THEME.text;
        ctx.font = cf(12);
        ctx.textAlign = 'left';
        ctx.fillText(`${name} — ${pct}% (${hours} h)`, CHART_PADDING.left + Math.round(22 * HD_SCALE), legendY + i * lineH + Math.round(12 * HD_SCALE));
    }
    return canvas;
}

/** wordcloud (wordcloud2.js) expects browser globals — set once before first require. See https://www.npmjs.com/package/wordcloud */
let wordCloudGlobalsReady = false;
function ensureWordCloudBrowserGlobals() {
    if (wordCloudGlobalsReady) return;
    const nodeCanvas = require('canvas');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { canvas: nodeCanvas });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.CustomEvent = dom.window.CustomEvent;
    wordCloudGlobalsReady = true;
}

function getWordCloud() {
    ensureWordCloudBrowserGlobals();
    return require('wordcloud');
}

function runWordCloudOnCanvas(el, options) {
    const WordCloud = getWordCloud();
    return new Promise(resolve => {
        el.addEventListener('wordcloudstop', () => resolve(), { once: true });
        el.addEventListener('wordcloudabort', () => resolve(), { once: true });
        WordCloud(el, options);
    });
}

function wordColorFromPalette(word, palette) {
    let h = 2166136261;
    for (let i = 0; i < word.length; i++) {
        h ^= word.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return palette[(h >>> 0) % palette.length];
}

async function drawWordCloudChart(data) {
    const { allGames } = data;
    const out = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const octx = out.getContext('2d');

    octx.fillStyle = THEME.bg;
    octx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    const vignette = octx.createRadialGradient(
        CHART_WIDTH / 2, CHART_HEIGHT / 2, 0,
        CHART_WIDTH / 2, CHART_HEIGHT / 2, Math.max(CHART_WIDTH, CHART_HEIGHT) * 0.65,
    );
    vignette.addColorStop(0, 'rgba(30, 41, 59, 0)');
    vignette.addColorStop(1, 'rgba(15, 23, 42, 0.55)');
    octx.fillStyle = vignette;
    octx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    const header = Math.round(40 * HD_SCALE);
    const footer = Math.round(26 * HD_SCALE);
    const wcW = CHART_WIDTH;
    const wcH = Math.max(80, CHART_HEIGHT - header - footer);

    if (allGames.length === 0) {
        octx.fillStyle = THEME.text;
        octx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
        octx.textAlign = 'center';
        octx.fillText('All games played', CHART_WIDTH / 2, Math.round(32 * HD_SCALE));
        octx.fillStyle = THEME.textMuted;
        octx.font = cf(16);
        octx.fillText('No game data for the past year', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        return out;
    }

    ensureWordCloudBrowserGlobals();
    const wcEl = global.document.createElement('canvas');
    wcEl.width = wcW;
    wcEl.height = wcH;

    const maxWords = 52;
    const games = allGames.slice(0, maxWords);
    const maxMs = Math.max(...games.map(g => g.ms), 1);
    const palette = [...BAR_PALETTE, '#5eead4', '#93c5fd', '#fcd34d', '#fca5a5', '#cbd5e1'];

    const list = games.map(g => {
        const hours = g.ms / (1000 * 60 * 60);
        const minutes = Math.floor(g.ms / (1000 * 60));
        const timeStr = hours >= 0.05 ? `${hours.toFixed(1)}h` : minutes >= 1 ? `${minutes}m` : `${Math.round(g.ms / 1000)}s`;
        const suffix = ` · ${timeStr}`;
        const maxName = Math.max(12, 48 - suffix.length);
        const name = g.name.length > maxName ? `${g.name.slice(0, maxName - 1)}…` : g.name;
        const label = `${name}${suffix}`;
        const weight = Math.max(1, Math.round((g.ms / maxMs) * 100));
        return [label, weight];
    });

    await runWordCloudOnCanvas(wcEl, {
        list,
        gridSize: Math.max(4, Math.round(8 * HD_SCALE)),
        weightFactor(w) {
            return Math.max(
                Math.round(10 * HD_SCALE),
                Math.min(Math.round(34 * HD_SCALE), w * (0.28 * HD_SCALE)),
            );
        },
        fontFamily: 'sans-serif',
        fontWeight: 'normal',
        color(word) {
            return wordColorFromPalette(String(word), palette);
        },
        backgroundColor: THEME.bg,
        minSize: Math.round(8 * HD_SCALE),
        rotateRatio: 0.35,
        rotationSteps: 2,
        minRotation: -Math.PI / 5,
        maxRotation: Math.PI / 5,
        shrinkToFit: true,
        drawOutOfBound: false,
        ellipticity: 0.65,
        shape: 'circle',
        wait: 0,
        clearCanvas: true,
    });

    const b64 = wcEl.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    const img = await loadImage(Buffer.from(b64, 'base64'));
    octx.drawImage(img, 0, header, wcW, wcH);

    octx.fillStyle = THEME.text;
    octx.font = `bold ${Math.round(20 * HD_SCALE)}px sans-serif`;
    octx.textAlign = 'center';
    octx.fillText('All games played (wordcloud)', CHART_WIDTH / 2, Math.round(28 * HD_SCALE));

    octx.fillStyle = THEME.textMuted;
    octx.font = cf(11);
    octx.fillText('wordcloud — each tag: game · hours played (size ∝ time)', CHART_WIDTH / 2, CHART_HEIGHT - Math.round(10 * HD_SCALE));

    return out;
}

// Combined image: full-width header + 2×6 grid (row 0 uses COMBINED_CELL_H_TOP; others COMBINED_CELL_H).
const COMBINED_COLS = 2;
const COMBINED_ROWS = 6;

const COMBINED_TITLE_PAD_TOP = Math.round(14 * HD_SCALE);
const COMBINED_HEADER_H = (() => {
    const vs = 1;
    const off = COMBINED_TITLE_PAD_TOP;
    const line1 = off + Math.round(38 * HD_SCALE * vs);
    const subtitlePx = Math.round(19 * HD_SCALE * vs);
    const line2 = line1 + Math.round(subtitlePx * 1.28) + Math.round(6 * HD_SCALE * vs);
    const namePx = Math.round(34 * HD_SCALE * vs);
    return line2 + Math.round(namePx * 0.35) + Math.round(14 * HD_SCALE);
})();

async function buildCombinedGraph(data, userLabel) {
    const width = COMBINED_CELL_W * COMBINED_COLS;
    const height =
        COMBINED_HEADER_H +
        COMBINED_CELL_H_TOP +
        COMBINED_CELL_H * (COMBINED_ROWS - 1);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, COMBINED_HEADER_H);
    drawYearInALifeTitle(ctx, width, userLabel, COMBINED_TITLE_PAD_TOP, 1);

    const charts = [
        () => drawYearInALifeGraph(data, userLabel, { omitTitle: true }),
        () => drawMonthlyChart(data),
        () => drawTopGamesChart(data),
        () => drawWeekdayChart(data),
        () => drawDaysPlayedChart(data),
        () => drawWeeklyChart(data),
        () => drawDailyDistributionChart(data),
        () => drawLast30Chart(data),
        () => drawCumulativeChart(data),
        () => drawGamesPerMonthChart(data),
        () => drawTopGamesPieChart(data),
        () => drawWordCloudChart(data),
    ];

    for (let i = 0; i < charts.length; i++) {
        const col = i % COMBINED_COLS;
        const row = Math.floor(i / COMBINED_COLS);
        const px = col * COMBINED_CELL_W;
        const py =
            row === 0
                ? COMBINED_HEADER_H
                : COMBINED_HEADER_H + COMBINED_CELL_H_TOP + (row - 1) * COMBINED_CELL_H;
        const cellH = row === 0 ? COMBINED_CELL_H_TOP : COMBINED_CELL_H;
        const chartCanvas = await Promise.resolve(charts[i]());
        ctx.drawImage(chartCanvas, 0, 0, chartCanvas.width, chartCanvas.height, px, py, COMBINED_CELL_W, cellH);
    }

    return canvas;
}

function buildYitlppCommand() {
    const builder = new SlashCommandBuilder()
        .setName('yitlpp')
        .setDescription('PP tracking: Year in a Life + all stat graphs in one image');
    const tracked = getTrackedUsers();
    if (tracked.length >= 1) {
        builder.addStringOption(opt => opt
            .setName('user')
            .setDescription('Which tracked user\'s stats to show')
            .setRequired(false)
            .addChoices(...tracked.map(u => ({ name: u.username, value: u.userId }))));
    }
    return builder;
}

module.exports = {
    data: buildYitlppCommand(),
    async execute(interaction) {
        const tracked = getTrackedUsers();
        const chosenId = interaction.options.getString('user');
        const userId = chosenId || (tracked[0] && tracked[0].userId) || config.ppTrackingUserId || config.devilshinxID;
        const userLabel = (tracked.find(u => u.userId === userId) || {}).username || userId;
        await interaction.deferReply();

        try {
            const data = await fetchYearData(userId);
            const canvas = await buildCombinedGraph(data, userLabel);
            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'yitlpp.png' });

            const totalHours = (data.totalMs / (1000 * 60 * 60)).toFixed(1);
            const embed = new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle(`Year in the life of PP — ${userLabel} (all stats)`)
                .setDescription(`**${totalHours}** hours in the past 365 days. All graphs in one image below.`)
                .setImage('attachment://yitlpp.png')
                .setFooter({ text: 'Year grid | Monthly | Top games | Weekday | Days played | Weekly | Distribution | Last 30 | Cumulative | Games/month | Share | All games (word cloud)' });

            if (data.topGames.length > 0) {
                const topList = data.topGames
                    .slice(0, 5)
                    .map((g, i) => `${i + 1}. **${g.name}** — ${formatDuration(g.ms)}`)
                    .join('\n');
                embed.addFields({ name: 'Top games (year)', value: topList, inline: false });
            }

            await interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch (err) {
            error('YITLPP command error:', err);
            await interaction.editReply({
                content: 'Failed to generate graph. Check logs.',
                ephemeral: true,
            });
        }
    },
};
