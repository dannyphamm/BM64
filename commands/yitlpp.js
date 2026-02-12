const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const db = require('../utils/db');
const config = require('../config.json');
const { error } = require('../utils/utils');

// Cell size and layout for the year grid (GitHub-style: 53 weeks × 7 days)
const CELL_SIZE = 14;
const CELL_GAP = 3;
const COLS = 53;
const ROWS = 7;
const PADDING = 40;
const LEGEND_HEIGHT = 80;
const HEADER_HEIGHT = 50;

function getColorForMinutes(minutes) {
    if (minutes === 0) return '#ebedf0'; // no data
    if (minutes < 30) return '#9be9a8';
    if (minutes < 60) return '#40c463';
    if (minutes < 120) return '#30a14e';
    if (minutes < 180) return '#216e39'; // 2h–3h
    return '#125a1e'; // 3h+
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
        return { days: new Array(365).fill(0), totalMs: 0, topGames: [], monthly, weekday, daysPlayedPerMonth, weekly, dailyDistribution, last30Days, cumulative, gamesPerMonth, allGames };
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

    return { days, totalMs, topGames, monthly, weekday, daysPlayedPerMonth, weekly: weekly.length ? weekly : Array.from({ length: 26 }, (_, i) => ({ label: `Wk ${i + 1}`, ms: 0 })), dailyDistribution: distBuckets, last30Days, cumulative, gamesPerMonth, allGames };
}

function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function drawYearInALifeGraph(data) {
    const { days, totalMs, topGames } = data;
    const width = PADDING * 2 + COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const height = HEADER_HEIGHT + PADDING * 2 + ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP + LEGEND_HEIGHT;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Year in the life of PP', width / 2, 32);

    const gridLeft = PADDING;
    const gridTop = HEADER_HEIGHT + PADDING;

    // Grid: 365 days, column-major (week 0 day 0, week 0 day 1, ...)
    for (let i = 0; i < 365; i++) {
        const col = Math.floor(i / 7);
        const row = i % 7;
        const ms = days[i];
        const minutes = Math.floor(ms / (1000 * 60));
        const color = getColorForMinutes(minutes);

        const x = gridLeft + col * (CELL_SIZE + CELL_GAP);
        const y = gridTop + row * (CELL_SIZE + CELL_GAP);

        ctx.fillStyle = color;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }

    // Legend
    const legendY = gridTop + ROWS * (CELL_SIZE + CELL_GAP) + 20;
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Less', gridLeft, legendY);
    const levels = [
        { label: '0', color: '#ebedf0' },
        { label: '<30m', color: '#9be9a8' },
        { label: '30m+', color: '#40c463' },
        { label: '1h+', color: '#30a14e' },
        { label: '2h+', color: '#216e39' },
        { label: '3h+', color: '#125a1e' },
    ];
    let lx = gridLeft + 40;
    for (const level of levels) {
        ctx.fillStyle = level.color;
        ctx.fillRect(lx, legendY - 10, 12, 12);
        ctx.fillStyle = '#8b949e';
        ctx.fillText(level.label, lx + 16, legendY);
        lx += 52;
    }

    // Stats text
    ctx.fillStyle = '#e6edf3';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    const totalHours = (totalMs / (1000 * 60 * 60)).toFixed(1);
    ctx.fillText(`Total: ${totalHours} hours in the past year`, gridLeft, legendY + 28);
    if (topGames.length > 0) {
        const topLine = `Top: ${topGames.map(g => g.name).slice(0, 3).join(', ')}`;
        ctx.fillStyle = '#8b949e';
        ctx.font = '12px sans-serif';
        ctx.fillText(topLine, gridLeft, legendY + 48);
    }

    return canvas;
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 420;
const CHART_PADDING = { top: 50, right: 40, bottom: 60, left: 70 };

function drawMonthlyChart(data) {
    const { monthly } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Monthly most played (last 12 months)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const maxMs = Math.max(...monthly.map(m => m.ms), 1);
    const barGap = 4;
    const barWidth = (chartWidth - barGap * (monthly.length - 1)) / monthly.length;

    for (let i = 0; i < monthly.length; i++) {
        const m = monthly[i];
        const hours = m.ms / (1000 * 60 * 60);
        const barH = maxMs > 0 ? (m.ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;

        ctx.fillStyle = barH > 0 ? '#238636' : '#30363d';
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartBottom + 14);
        ctx.rotate(-0.4);
        ctx.fillText(m.label, 0, 0);
        ctx.restore();

        if (barH > 18) {
            ctx.fillStyle = '#e6edf3';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${hours.toFixed(1)}h`, x + barWidth / 2, y + barH / 2 + 4);
        }
    }

    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Hours', CHART_WIDTH / 2, CHART_HEIGHT - 8);

    return canvas;
}

function drawTopGamesChart(data) {
    const { topGames } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Most played games (year)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const list = topGames.slice(0, 10);
    if (list.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No game data for the past year', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        return canvas;
    }

    const maxMs = Math.max(...list.map(g => g.ms), 1);
    const rowHeight = chartHeight / list.length;
    const labelMaxW = 200;

    for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const barW = maxMs > 0 ? (g.ms / maxMs) * (chartWidth - labelMaxW - 20) : 0;
        const y = chartTop + i * rowHeight + rowHeight / 2 - 10;

        const name = g.name.length > 28 ? g.name.slice(0, 25) + '...' : g.name;
        ctx.fillStyle = '#e6edf3';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(name, chartLeft, y + 12);

        ctx.fillStyle = '#238636';
        ctx.fillRect(chartLeft + labelMaxW, y, barW, 20);

        const hours = (g.ms / (1000 * 60 * 60)).toFixed(1);
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${hours}h`, chartRight, y + 14);
    }

    return canvas;
}

function drawWeekdayChart(data) {
    const { weekday } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Play time by day of week (past year)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const maxMs = Math.max(...weekday.map(w => w.ms), 1);
    const barGap = 8;
    const barWidth = (chartWidth - barGap * (weekday.length - 1)) / weekday.length;

    for (let i = 0; i < weekday.length; i++) {
        const w = weekday[i];
        const hours = w.ms / (1000 * 60 * 60);
        const barH = maxMs > 0 ? (w.ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;

        ctx.fillStyle = barH > 0 ? '#238636' : '#30363d';
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = '#8b949e';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(w.label, x + barWidth / 2, chartBottom + 20);

        if (barH > 18) {
            ctx.fillStyle = '#e6edf3';
            ctx.font = '10px sans-serif';
            ctx.fillText(`${hours.toFixed(1)}h`, x + barWidth / 2, y + barH / 2 + 4);
        }
    }

    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    return canvas;
}

function drawDaysPlayedChart(data) {
    const { daysPlayedPerMonth } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Days played per month (last 12 months)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const maxCount = Math.max(...daysPlayedPerMonth.map(m => m.count), 1);
    const barGap = 4;
    const barWidth = (chartWidth - barGap * (daysPlayedPerMonth.length - 1)) / daysPlayedPerMonth.length;

    for (let i = 0; i < daysPlayedPerMonth.length; i++) {
        const m = daysPlayedPerMonth[i];
        const barH = maxCount > 0 ? (m.count / maxCount) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;

        ctx.fillStyle = barH > 0 ? '#238636' : '#30363d';
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartBottom + 14);
        ctx.rotate(-0.4);
        ctx.fillText(m.label, 0, 0);
        ctx.restore();

        if (barH > 14) {
            ctx.fillStyle = '#e6edf3';
            ctx.font = '10px sans-serif';
            ctx.fillText(`${m.count}/${m.daysInMonth}`, x + barWidth / 2, y + barH / 2 + 4);
        }
    }

    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Days with play', CHART_WIDTH / 2, CHART_HEIGHT - 8);

    return canvas;
}

function drawWeeklyChart(data) {
    const { weekly } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Play time per week (last 26 weeks)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const list = weekly.slice(0, 26);
    const maxMs = Math.max(...list.map(w => w.ms), 1);
    const barGap = 2;
    const barWidth = (chartWidth - barGap * (list.length - 1)) / list.length;

    for (let i = 0; i < list.length; i++) {
        const w = list[i];
        const barH = maxMs > 0 ? (w.ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = barH > 0 ? '#238636' : '#30363d';
        ctx.fillRect(x, y, barWidth, barH);
    }
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Most recent →', CHART_WIDTH / 2, CHART_HEIGHT - 10);
    return canvas;
}

function drawDailyDistributionChart(data) {
    const { dailyDistribution } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('How many days in each play-time bucket (year)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxCount = Math.max(...dailyDistribution.map(d => d.count), 1);
    const barGap = 12;
    const barWidth = (chartWidth - barGap * (dailyDistribution.length - 1)) / dailyDistribution.length;
    const colors = ['#484f58', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

    for (let i = 0; i < dailyDistribution.length; i++) {
        const d = dailyDistribution[i];
        const barH = maxCount > 0 ? (d.count / maxCount) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, y, barWidth, barH);
        ctx.fillStyle = '#8b949e';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barWidth / 2, chartBottom + 20);
        if (barH > 14) {
            ctx.fillStyle = '#e6edf3';
            ctx.font = '11px sans-serif';
            ctx.fillText(String(d.count), x + barWidth / 2, y + barH / 2 + 4);
        }
    }
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    return canvas;
}

function drawLast30Chart(data) {
    const { last30Days } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Last 30 days — play time per day', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxMs = Math.max(...last30Days, 1);
    const barGap = 2;
    const barWidth = (chartWidth - barGap * (last30Days.length - 1)) / last30Days.length;

    for (let i = 0; i < last30Days.length; i++) {
        const ms = last30Days[i];
        const barH = maxMs > 0 ? (ms / maxMs) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = barH > 0 ? '#238636' : '#30363d';
        ctx.fillRect(x, y, barWidth, barH);
    }
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('30 days ago → today', CHART_WIDTH / 2, CHART_HEIGHT - 10);
    return canvas;
}

function drawCumulativeChart(data) {
    const { cumulative } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Cumulative play time over the year', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxCum = Math.max(...cumulative, 1);

    ctx.strokeStyle = '#238636';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < cumulative.length; i++) {
        const x = chartLeft + (i / (cumulative.length - 1 || 1)) * chartWidth;
        const y = chartBottom - (cumulative[i] / maxCum) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    const totalH = (cumulative[cumulative.length - 1] / (1000 * 60 * 60)).toFixed(0);
    ctx.fillText(`Total: ${totalH} hours by end of period`, CHART_WIDTH / 2, CHART_HEIGHT - 10);
    return canvas;
}

function drawGamesPerMonthChart(data) {
    const { gamesPerMonth } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Unique games played per month (last 12 months)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxCount = Math.max(...gamesPerMonth.map(m => m.count), 1);
    const barGap = 4;
    const barWidth = (chartWidth - barGap * (gamesPerMonth.length - 1)) / gamesPerMonth.length;

    for (let i = 0; i < gamesPerMonth.length; i++) {
        const m = gamesPerMonth[i];
        const barH = maxCount > 0 ? (m.count / maxCount) * chartHeight : 0;
        const x = chartLeft + i * (barWidth + barGap);
        const y = chartBottom - barH;
        ctx.fillStyle = barH > 0 ? '#238636' : '#30363d';
        ctx.fillRect(x, y, barWidth, barH);
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartBottom + 14);
        ctx.rotate(-0.4);
        ctx.fillText(m.label, 0, 0);
        ctx.restore();
        if (barH > 14) {
            ctx.fillStyle = '#e6edf3';
            ctx.font = '10px sans-serif';
            ctx.fillText(String(m.count), x + barWidth / 2, y + barH / 2 + 4);
        }
    }
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();
    return canvas;
}

function drawTopGamesPieChart(data) {
    const { topGames } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Play time share — top 6 games (year)', CHART_WIDTH / 2, 32);

    const list = topGames.slice(0, 6);
    if (list.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '16px sans-serif';
        ctx.fillText('No game data for the past year', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        return canvas;
    }
    const totalMs = list.reduce((a, g) => a + g.ms, 0);
    if (totalMs === 0) return canvas;

    const cx = CHART_WIDTH / 2;
    const cy = 80 + (CHART_HEIGHT - 120) / 2;
    const radius = Math.min(180, (CHART_HEIGHT - 120) / 2 - 20);
    const colors = ['#238636', '#2ea043', '#56d364', '#7ee787', '#9be9a8', '#40c463'];
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
        ctx.strokeStyle = '#0d1117';
        ctx.lineWidth = 2;
        ctx.stroke();
        startAngle += slice;
    }

    const legendY = 60;
    const lineH = 22;
    for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const pct = totalMs > 0 ? ((g.ms / totalMs) * 100).toFixed(0) : 0;
        const name = g.name.length > 24 ? g.name.slice(0, 21) + '...' : g.name;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(CHART_PADDING.left, legendY + i * lineH, 14, 14);
        ctx.fillStyle = '#e6edf3';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${name} — ${pct}%`, CHART_PADDING.left + 20, legendY + i * lineH + 12);
    }
    return canvas;
}

function drawWordCloudChart(data) {
    const { allGames } = data;
    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('All games played (word cloud — size = play time)', CHART_WIDTH / 2, 32);

    const chartLeft = CHART_PADDING.left;
    const chartRight = CHART_WIDTH - CHART_PADDING.right;
    const chartTop = CHART_PADDING.top;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    if (allGames.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No game data for the past year', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        return canvas;
    }

    const maxMs = Math.max(...allGames.map(g => g.ms), 1);
    const minFont = 9;
    const maxFont = 20;
    const pad = 8;
    let x = chartLeft;
    let y = chartTop;
    let lineHeight = 0;
    const greenShades = ['#9be9a8', '#56d364', '#40c463', '#30a14e', '#238636', '#216e39', '#125a1e'];

    for (const g of allGames) {
        const ratio = maxMs > 0 ? Math.sqrt(g.ms / maxMs) : 0;
        const fontSize = Math.round(minFont + ratio * (maxFont - minFont));
        const name = g.name.length > 25 ? g.name.slice(0, 22) + '...' : g.name;
        const hours = g.ms / (1000 * 60 * 60);
        const minutes = Math.floor(g.ms / (1000 * 60));
        const timeStr = hours >= 0.05 ? `${hours.toFixed(1)}h` : minutes >= 1 ? `${minutes}m` : `${Math.round(g.ms / 1000)}s`;
        const text = `${name} ${timeStr}`;
        ctx.font = `${fontSize}px sans-serif`;
        const metrics = ctx.measureText(text);
        const w = metrics.width;
        if (x + w > chartRight && x > chartLeft) {
            x = chartLeft;
            y += lineHeight + 4;
            lineHeight = 0;
        }
        lineHeight = Math.max(lineHeight, fontSize);
        const colorIndex = Math.min(Math.floor(ratio * greenShades.length), greenShades.length - 1);
        ctx.fillStyle = greenShades[colorIndex];
        ctx.textAlign = 'left';
        ctx.fillText(text, x, y + fontSize);
        x += w + pad;
    }

    return canvas;
}

// Combined image: all charts in one PNG (2 columns x 6 rows, 600x350 per cell)
const COMBINED_CELL_W = 600;
const COMBINED_CELL_H = 350;
const COMBINED_COLS = 2;
const COMBINED_ROWS = 6;

function buildCombinedGraph(data) {
    const width = COMBINED_CELL_W * COMBINED_COLS;
    const height = COMBINED_CELL_H * COMBINED_ROWS;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    const charts = [
        () => drawYearInALifeGraph(data),
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
        const py = row * COMBINED_CELL_H;
        const chartCanvas = charts[i]();
        ctx.drawImage(chartCanvas, 0, 0, chartCanvas.width, chartCanvas.height, px, py, COMBINED_CELL_W, COMBINED_CELL_H);
    }

    return canvas;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yitlpp')
        .setDescription('PP tracking: Year in a Life + all stat graphs in one image'),
    async execute(interaction) {
        const userId = config.ppTrackingUserId || config.devilshinxID;
        await interaction.deferReply();

        try {
            const data = await fetchYearData(userId);
            const canvas = buildCombinedGraph(data);
            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'yitlpp.png' });

            const totalHours = (data.totalMs / (1000 * 60 * 60)).toFixed(1);
            const embed = new EmbedBuilder()
                .setColor(0x238636)
                .setTitle('Year in the life of PP — (all stats)')
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
