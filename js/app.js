document.addEventListener('DOMContentLoaded', function() {
// ========== AUTO CATEGORY DICTIONARY ==========
        const categoryKeywords = {
            income: {
                'Salary': ['salary', 'wage', 'paycheck', 'payroll', 'income'],
                'Freelance': ['freelance', 'contract', 'gig', 'client'],
                'Investment': ['dividend', 'interest', 'stock', 'investment', 'profit'],
                'Other Income': ['refund', 'bonus', 'gift', 'cashback'],
            },
            expense: {
                'Food & Dining': ['restaurant', 'food', 'grocery', 'lunch', 'dinner', 'coffee', 'cafe', 'meal'],
                'Transport': ['gas', 'fuel', 'uber', 'taxi', 'bus', 'train', 'metro', 'parking', 'car'],
                'Housing': ['rent', 'mortgage', 'utilities', 'electricity', 'water', 'internet', 'home'],
                'Entertainment': ['movie', 'netflix', 'spotify', 'game', 'concert', 'subscription', 'hobby'],
                'Healthcare': ['doctor', 'pharmacy', 'medicine', 'hospital', 'dental', 'insurance'],
                'Shopping': ['amazon', 'clothes', 'shopping', 'electronics', 'gadget'],
                'Bills': ['phone', 'bill', 'insurance', 'credit card', 'loan'],
                'Other': []
            }
        };

        let manualCategory = false;

        function autoCategorize(description, type) {
            if (!description || !description.trim()) return '';
            const descLower = description.toLowerCase();
            const dict = categoryKeywords[type];
            if (!dict) return '';
            for (const [category, keywords] of Object.entries(dict)) {
                if (keywords.some(keyword => descLower.includes(keyword))) {
                    return category;
                }
            }
            return '';
        }

        // ========== DATA & INIT ==========
        const STORAGE_KEY = 'finance_calendar_data_v3';
        function defaultAccount(name = 'My Account') {
            return { id: generateId(), name, currency: '€', startBalance: 0, weekStart: 1, transactions: [], recurrences: [] };
        }
        function defaultData() {
            const acc = defaultAccount();
            return { accounts: { [acc.id]: acc }, activeAccountId: acc.id };
        }
        function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 6); }
        let data = loadData();
        function loadData() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (!parsed.accounts || Object.keys(parsed.accounts).length === 0) return defaultData();
                    if (!parsed.activeAccountId || !parsed.accounts[parsed.activeAccountId])
                        parsed.activeAccountId = Object.keys(parsed.accounts)[0];
                    Object.keys(parsed.accounts).forEach(id => {
                        const acc = parsed.accounts[id];
                        if (!acc.currency) acc.currency = '€';
                        if (acc.startBalance === undefined) acc.startBalance = 0;
                        if (acc.weekStart === undefined) acc.weekStart = 1;
                        if (!acc.transactions) acc.transactions = [];
                        if (!acc.recurrences) acc.recurrences = [];
                    });
                    return parsed;
                }
            } catch (_) {}
            return defaultData();
        }
        function saveData() {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.warn(e); }
        }
        function getActiveAccount() { return data.accounts[data.activeAccountId]; }

        // ========== HELPERS ==========
        function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
        function formatDate(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
        function getFirstDayOfMonth(year, month, weekStart) {
            const day = new Date(year, month, 1).getDay();
            return (day - weekStart + 7) % 7;
        }
        function dateToKey(year, month, day) {
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        function isSameDay(d1, d2) {
            return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
        }
        function formatDisplayDate(dateKey) {
            const [y, m, d] = dateKey.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        function getWeekdayName(dateKey) {
            const [y, m, d] = dateKey.split('-').map(Number);
            return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(y, m - 1, d).getDay()];
        }

        // ========== RECURRENCE ENGINE ==========
        function getOccurrences(rec, from, to) {
            const occ = [];
            const start = parseDate(rec.startDate);
            if (start > to) return occ;
            const anchorDay = start.getDate();
            if (rec.recurrence === 'monthly' || rec.recurrence === 'yearly') {
                const fromDate = from <= start ? start : from;
                let cursor = new Date(fromDate);
                let iter = 0;
                const maxIter = 5000;
                while (cursor <= to && iter < maxIter) {
                    let targetDay = anchorDay;
                    const year = cursor.getFullYear();
                    const month = cursor.getMonth();
                    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
                    if (targetDay > lastDayOfMonth) targetDay = lastDayOfMonth;
                    const occurrenceDate = new Date(year, month, targetDay);
                    if (occurrenceDate >= start && occurrenceDate <= to)
                        occ.push(formatDate(occurrenceDate));
                    if (rec.recurrence === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
                    else cursor.setFullYear(cursor.getFullYear() + 1);
                    iter++;
                }
            } else {
                let cursor = new Date(Math.max(start.getTime(), from.getTime()));
                let iter = 0;
                const maxIter = 10000;
                while (cursor <= to && iter < maxIter) {
                    if (cursor >= start) occ.push(formatDate(cursor));
                    switch (rec.recurrence) {
                        case 'daily': cursor.setDate(cursor.getDate() + 1); break;
                        case 'weekly': cursor.setDate(cursor.getDate() + 7); break;
                        default: cursor = new Date(to.getTime() + 1);
                    }
                    iter++;
                }
            }
            return occ;
        }

        // ========== TRANSACTIONS & BALANCE ==========
        function getAllTransactionsForDate(accountId, dateKey, cache) {
            const acc = data.accounts[accountId];
            if (!acc) return [];
            if (cache && cache.transactionsByDate) return cache.transactionsByDate.get(dateKey) || [];
            const normal = acc.transactions.filter(t => t.date === dateKey);
            const recs = acc.recurrences.filter(r => {
                const start = parseDate(r.startDate);
                const target = parseDate(dateKey);
                if (target < start) return false;
                return getOccurrences(r, target, target).length > 0;
            });
            const generated = recs.map(r => ({
                id: r.id + '-' + dateKey,
                type: r.type,
                amount: r.amount,
                desc: r.desc + ' (recurring)',
                category: r.category,
                date: dateKey,
                isRecurring: true,
                _recId: r.id
            }));
            return [...normal, ...generated];
        }

        function getBalanceUpToDate(accountId, dateKey, includeDate = true, cache) {
            const acc = data.accounts[accountId];
            if (!acc) return 0;
            if (cache && cache.balancesByDate) {
                if (includeDate && cache.balancesByDate.has(dateKey)) return cache.balancesByDate.get(dateKey);
                if (!includeDate) {
                    const tx = cache.transactionsByDate.get(dateKey) || [];
                    let balance = cache.balancesByDate.get(dateKey);
                    if (balance === undefined) balance = acc.startBalance;
                    tx.forEach(t => balance -= (t.type === 'income' ? t.amount : -t.amount));
                    return balance;
                }
            }
            let balance = acc.startBalance;
            const target = parseDate(dateKey);
            acc.transactions.forEach(t => {
                const tDate = parseDate(t.date);
                if (tDate < target || (includeDate && isSameDay(tDate, target)))
                    balance += (t.type === 'income' ? t.amount : -t.amount);
            });
            acc.recurrences.forEach(r => {
                const start = parseDate(r.startDate);
                if (start > target) return;
                const occurrences = getOccurrences(r, start, target);
                occurrences.forEach(occDateStr => {
                    const occDate = parseDate(occDateStr);
                    if (occDate < target || (includeDate && isSameDay(occDate, target)))
                        balance += (r.type === 'income' ? r.amount : -r.amount);
                });
            });
            return balance;
        }

        function getBalanceAtEndOfDay(accountId, dateKey, cache) { return getBalanceUpToDate(accountId, dateKey, true, cache); }
        function getBalanceAtEndOfMonth(accountId, year, month) {
            const lastDay = getDaysInMonth(year, month);
            const dateKey = dateToKey(year, month, lastDay);
            return getBalanceAtEndOfDay(accountId, dateKey);
        }
        function getTotalBalance() {
            let total = 0;
            const todayKey = formatDate(new Date());
            for (const id in data.accounts)
                total += getBalanceAtEndOfDay(id, todayKey);
            return total;
        }

        // ========== CALENDAR CACHE ==========
        let calendarCache = null;
        function prepareCalendarData(year, month, accountId) {
            if (calendarCache && calendarCache.year === year && calendarCache.month === month && calendarCache.accountId === accountId)
                return calendarCache;
            const acc = data.accounts[accountId];
            if (!acc) return null;
            const daysInMonth = getDaysInMonth(year, month);
            const startKey = dateToKey(year, month, 1);
            const endKey = dateToKey(year, month, daysInMonth);
            const startDate = parseDate(startKey);
            const endDate = parseDate(endKey);
            const transactionsByDate = new Map();
            const balancesByDate = new Map();
            for (let d = 1; d <= daysInMonth; d++)
                transactionsByDate.set(dateToKey(year, month, d), []);
            acc.transactions.forEach(tx => {
                if (tx.date >= startKey && tx.date <= endKey) {
                    const list = transactionsByDate.get(tx.date);
                    if (list) list.push(tx);
                }
            });
            acc.recurrences.forEach(rec => {
                getOccurrences(rec, startDate, endDate).forEach(dateKey => {
                    const list = transactionsByDate.get(dateKey);
                    if (list) list.push({ id: rec.id + '-' + dateKey, type: rec.type, amount: rec.amount, desc: rec.desc + ' (recurring)', category: rec.category, date: dateKey, isRecurring: true, _recId: rec.id });
                });
            });
            let runningBalance = getBalanceUpToDate(accountId, startKey, false);
            for (let d = 1; d <= daysInMonth; d++) {
                const key = dateToKey(year, month, d);
                const txList = transactionsByDate.get(key) || [];
                txList.forEach(tx => { runningBalance += (tx.type === 'income' ? tx.amount : -tx.amount); });
                balancesByDate.set(key, runningBalance);
            }
            calendarCache = { year, month, accountId, transactionsByDate, balancesByDate };
            return calendarCache;
        }

        // ========== TOAST ==========
        let toastTimer = null;
        function showToast(message) {
            const el = document.getElementById('toast');
            el.textContent = message;
            el.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
        }

        // ========== MONTH-END BALANCES ==========
        function renderMonthEndBalances() {
            const acc = getActiveAccount();
            if (!acc) return;
            const container = document.getElementById('monthEndBalances');
            const today = new Date();
            const currentYear = today.getFullYear();
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const cache = new Map();
            for (let m = 0; m < 12; m++) {
                const lastDay = getDaysInMonth(currentYear, m);
                const key = dateToKey(currentYear, m, lastDay);
                cache.set(key, getBalanceAtEndOfDay(data.activeAccountId, key));
            }
            let html = '';
            for (let m = 0; m < 12; m++) {
                const lastDay = getDaysInMonth(currentYear, m);
                const key = dateToKey(currentYear, m, lastDay);
                const balance = cache.get(key);
                const signClass = balance >= 0 ? 'positive' : 'negative';
                const sign = balance >= 0 ? '+' : '';
                html += `<div class="month-end-card"><span class="month-end-label">${monthNames[m]}</span><span class="month-end-value ${signClass}">${sign}${acc.currency} ${Math.abs(balance).toFixed(2)}</span></div>`;
            }
            container.innerHTML = html;
        }

        // ========== CALENDAR ==========
        let currentYear = new Date().getFullYear();
        let currentMonth = new Date().getMonth();
        let currentWeekStartDate = null;
        let calendarViewMode = 'weekly';
        let selectedDateKey = null;

        function renderCalendar() {
            const acc = getActiveAccount();
            if (!acc) return;
            const weekStart = acc.weekStart;
            const today = new Date();
            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const ordered = [...weekdays.slice(weekStart), ...weekdays.slice(0, weekStart)];
            document.getElementById('weekdaysContainer').innerHTML = ordered.map(d => `<div>${d}</div>`).join('');
            
            if (calendarViewMode === 'monthly') {
                // Monthly view
                const cache = prepareCalendarData(currentYear, currentMonth, data.activeAccountId);
                if (!cache) return;
                const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth, weekStart);
                const daysInMonth = getDaysInMonth(currentYear, currentMonth);
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                document.getElementById('calendarTitle').textContent = `${monthNames[currentMonth]} ${currentYear}`;
                
                let html = '';
                const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
                for (let i = 0; i < totalCells; i++) {
                    const day = i - firstDayIndex + 1;
                    if (day < 1 || day > daysInMonth) {
                        html += '<div class="day-cell empty"></div>';
                        continue;
                    }
                    const dateKey = dateToKey(currentYear, currentMonth, day);
                    const isToday = isSameDay(new Date(currentYear, currentMonth, day), today);
                    const balance = cache.balancesByDate.get(dateKey) ?? acc.startBalance;
                    const transactions = cache.transactionsByDate.get(dateKey) || [];
                    const hasIncome = transactions.some(t => t.type === 'income');
                    const hasExpense = transactions.some(t => t.type === 'expense');
                    let indicators = '';
                    if (hasIncome) {
                        const sum = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                        indicators += `<span class="income-dot">+${sum.toFixed(2)}</span>`;
                    }
                    if (hasExpense) {
                        const sum = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                        indicators += `<span class="expense-dot">−${sum.toFixed(2)}</span>`;
                    }
                    const todayMarker = isToday ? '<span class="today-marker"></span>' : '';
                    html += `<div class="day-cell${isToday ? ' today' : ''}" data-date="${dateKey}"><div class="day-number">${day}${todayMarker}</div><div class="indicators">${indicators}</div></div>`;
                }
                document.getElementById('daysGrid').innerHTML = html;
            } else {
                // Weekly view
                let startOfWeek;
                if (currentWeekStartDate) {
                    startOfWeek = new Date(currentWeekStartDate);
                } else {
                    startOfWeek = getStartOfWeek(today, weekStart);
                    currentWeekStartDate = new Date(startOfWeek);
                }
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                
                // Update title to show week range
                const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: startOfWeek.getFullYear() !== endOfWeek.getFullYear() ? 'numeric' : undefined });
                document.getElementById('calendarTitle').textContent = `${startMonth} – ${endMonth}`;
                
                // Get all dates in this week
                const weekDates = [];
                const tempDate = new Date(startOfWeek);
                for (let i = 0; i < 7; i++) {
                    weekDates.push(new Date(tempDate));
                    tempDate.setDate(tempDate.getDate() + 1);
                }
                
                let html = '';
                for (let i = 0; i < 7; i++) {
                    const date = weekDates[i];
                    const dateKey = formatDate(date);
                    const isToday = isSameDay(date, today);
                    const todayMarker = isToday ? '<span class="today-marker"></span>' : '';
                    const dayNum = date.getDate();
                    html += `<div class="day-cell weekly-cell${isToday ? ' today' : ''}" data-date="${dateKey}"><div class="day-number">${dayNum}${todayMarker}</div></div>`;
                }
                document.getElementById('daysGrid').innerHTML = html;
            }
            
            // Add click handlers for day cells
            document.querySelectorAll('.day-cell:not(.empty)').forEach(el => {
                el.addEventListener('click', () => {
                    const dateKey = el.dataset.date;
                    const acc = getActiveAccount();
                    if (!acc) return;
                    
                    // Remove selected class from all cells
                    document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('selected'));
                    
                    // Add selected class to clicked cell
                    el.classList.add('selected');
                    
                    // Show selected day info
                    const date = parseDate(dateKey);
                    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                    const balance = getBalanceAtEndOfDay(data.activeAccountId, dateKey);
                    const transactions = getAllTransactionsForDate(data.activeAccountId, dateKey);
                    
                    // Calculate income and expense
                    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                    
                    document.getElementById('selectedDayDate').textContent = dateStr;
                    document.getElementById('selectedDayIncome').textContent = `${acc.currency} +${income.toFixed(2)}`;
                    document.getElementById('selectedDayExpense').textContent = `${acc.currency} -${Math.abs(expense).toFixed(2)}`;
                    document.getElementById('selectedDayBalance').textContent = `${acc.currency} ${balance.toFixed(2)}`;
                    document.getElementById('selectedDayTxCount').textContent = transactions.length;
                    document.getElementById('selectedDayInfo').classList.add('visible');
                    
                    // Store for potential panel opening
                    selectedDateKey = dateKey;
                });
            });

            // Click selected day info card to open full panel
            document.getElementById('selectedDayInfo').addEventListener('click', () => {
                if (selectedDateKey) {
                    openDayPanel(selectedDateKey);
                }
            });

        }
        
        function getStartOfWeek(date, weekStart) {
            const d = new Date(date);
            const day = d.getDay();
            const diff = (day - weekStart + 7) % 7;
            d.setDate(d.getDate() - diff);
            return d;
        }

        function openDayPanel(dateKey) {
            const acc = getActiveAccount();
            if (!acc) return;
            selectedDateKey = dateKey;
            document.getElementById('panelDate').textContent = formatDisplayDate(dateKey);
            document.getElementById('panelDaySub').textContent = getWeekdayName(dateKey);
            const cacheDate = parseDate(dateKey);
            let cache = null;
            if (cacheDate.getFullYear() === currentYear && cacheDate.getMonth() === currentMonth)
                cache = prepareCalendarData(currentYear, currentMonth, data.activeAccountId);
            const balance = getBalanceAtEndOfDay(data.activeAccountId, dateKey, cache);
            document.getElementById('panelBalance').textContent = `${acc.currency} ${balance.toFixed(2)}`;
            const transactions = getAllTransactionsForDate(data.activeAccountId, dateKey, cache);
            const container = document.getElementById('panelTransactions');
            if (!transactions.length) {
                container.innerHTML = '<div class="empty-state"><iconify-icon icon="lucide:sparkles" aria-hidden="true"></iconify-icon> No transactions on this day.</div>';
            } else {
                container.innerHTML = transactions.map(t => {
                    const sign = t.type === 'income' ? '+' : '−';
                    const cls = t.type === 'income' ? 'income' : 'expense';
                    const emoji = t.type === 'income' ? '<iconify-icon icon="lucide:trending-up" aria-hidden="true"></iconify-icon>' : '<iconify-icon icon="lucide:credit-card" aria-hidden="true"></iconify-icon>';
                    const isRecurring = t.isRecurring || false;
                    const realId = t.isRecurring ? t._recId : t.id;
                    return `<div class="transaction-item" data-id="${realId}" data-recurring="${isRecurring}" data-date="${t.date}" data-type="${t.type}" data-amount="${t.amount}" data-desc="${t.desc.replace(' (recurring)', '')}" data-category="${t.category || ''}"><div class="desc"><span class="emoji-badge">${emoji}</span><span class="name">${t.desc}</span>${t.category ? `<span class="cat">${t.category}</span>` : ''}${isRecurring ? '<span class="cat"><iconify-icon icon="lucide:repeat-2" aria-hidden="true"></iconify-icon></span>' : ''}</div><div class="amount ${cls}">${sign}${acc.currency} ${Math.abs(t.amount).toFixed(2)}</div><div class="tx-actions"><button class="edit-btn" aria-label="Edit"><iconify-icon icon="lucide:pencil" aria-hidden="true"></iconify-icon></button><button class="del-btn" aria-label="Delete"><iconify-icon icon="lucide:trash-2" aria-hidden="true"></iconify-icon></button></div></div>`;
                }).join('');
                container.querySelectorAll('.transaction-item').forEach(item => {
                    const id = item.dataset.id, isRecurring = item.dataset.recurring === 'true';
                    item.querySelector('.edit-btn').addEventListener('click', e => {
                        e.stopPropagation();
                        openEditModal(id, isRecurring, item.dataset.date, item.dataset.type, parseFloat(item.dataset.amount), item.dataset.desc, item.dataset.category);
                    });
                    item.querySelector('.del-btn').addEventListener('click', e => {
                        e.stopPropagation();
                        deleteTransaction(id, isRecurring);
                    });
                    item.addEventListener('click', () => openEditModal(id, isRecurring, item.dataset.date, item.dataset.type, parseFloat(item.dataset.amount), item.dataset.desc, item.dataset.category));
                });
            }
            document.querySelectorAll('.add-btns button').forEach(btn => btn.onclick = () => {
                const type = btn.dataset.type;
                const recurrence = btn.dataset.recurrence || 'none';
                openModal(type, dateKey, recurrence);
            });
            document.getElementById('sidePanel').classList.add('open');
            document.getElementById('sidePanelBackdrop').classList.add('open');
        }

        function closePanel() {
            document.getElementById('sidePanel').classList.remove('open');
            document.getElementById('sidePanelBackdrop').classList.remove('open');
        }
        document.getElementById('closePanel').addEventListener('click', closePanel);
        document.getElementById('sidePanelBackdrop').addEventListener('click', closePanel);

        function deleteTransaction(id, isRecurring) {
            const acc = getActiveAccount();
            if (!acc || !confirm('Delete this transaction?')) return;
            if (isRecurring) acc.recurrences = acc.recurrences.filter(r => r.id !== id);
            else acc.transactions = acc.transactions.filter(t => t.id !== id);
            calendarCache = null;
            saveData();
            renderAll();
            closePanel();
            showToast('Deleted.');
        }

        // ========== MODALS ==========
        function openModal(type = 'income', dateKey = null, recurrence = 'none') {
            const isRecurring = recurrence !== 'none';
            document.getElementById('modalType').value = type;
            document.getElementById('modalTitle').innerHTML = isRecurring ?
                `<iconify-icon icon="lucide:repeat-2" aria-hidden="true"></iconify-icon> Add Recurring ${type === 'income' ? 'Income' : 'Expense'}` :
                type === 'income' ? '<iconify-icon icon="lucide:plus" aria-hidden="true"></iconify-icon> Add Income' : '<iconify-icon icon="lucide:minus" aria-hidden="true"></iconify-icon> Add Expense';
            document.getElementById('modalDate').value = dateKey || formatDate(new Date());
            document.getElementById('modalValue').value = '';
            document.getElementById('modalDesc').value = '';
            document.getElementById('modalCategory').value = '';
            document.getElementById('modalRecurrence').value = recurrence;
            document.getElementById('modalOverlay').classList.add('open');
            setTimeout(() => document.getElementById('modalValue').focus(), 100);

            // Auto-categorization handlers for modal
            manualCategory = false;
            const descInput = document.getElementById('modalDesc');
            const categoryInput = document.getElementById('modalCategory');
            descInput.oninput = () => {
                if (!manualCategory && categoryInput.value.trim() === '') {
                    const suggested = autoCategorize(descInput.value, document.getElementById('modalType').value);
                    categoryInput.value = suggested;
                }
            };
            categoryInput.oninput = () => { manualCategory = true; };
        }
        function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
        document.getElementById('modalCancel').addEventListener('click', closeModal);
        document.getElementById('modalSave').addEventListener('click', () => {
            const acc = getActiveAccount();
            if (!acc) return;
            const type = document.getElementById('modalType').value;
            const amount = parseFloat(document.getElementById('modalValue').value);
            const desc = document.getElementById('modalDesc').value.trim();
            const category = document.getElementById('modalCategory').value.trim();
            const date = document.getElementById('modalDate').value;
            const recurrence = document.getElementById('modalRecurrence').value;
            if (!amount || amount <= 0 || !desc || !date) {
                showToast('Please fill in all required fields.');
                return;
            }
            if (recurrence !== 'none') {
                acc.recurrences.push({ id: generateId(), type, amount, desc, category, startDate: date, recurrence });
            } else {
                acc.transactions.push({ id: generateId(), type, amount, desc, category, date, recurrence: 'none' });
            }
            calendarCache = null;
            saveData();
            closeModal();
            renderAll();
            showToast(recurrence !== 'none' ? 'Recurring rule added.' : 'Transaction added.');
        });

        let editingId = null, editingIsRecurring = false;
        function openEditModal(id, isRecurring, date, type, amount, desc, category) {
            editingId = id;
            editingIsRecurring = isRecurring;
            document.getElementById('editType').value = type;
            document.getElementById('editValue').value = amount;
            document.getElementById('editDesc').value = desc;
            document.getElementById('editCategory').value = category || '';
            document.getElementById('editDate').value = date;
            document.getElementById('editModalTitle').textContent = isRecurring ? 'Edit Recurring Rule' : 'Edit Transaction';
            document.getElementById('editModalOverlay').classList.add('open');

            // Auto-categorization handlers for edit modal
            manualCategory = false;
            const editDescInput = document.getElementById('editDesc');
            const editCategoryInput = document.getElementById('editCategory');
            editDescInput.oninput = () => {
                if (!manualCategory && editCategoryInput.value.trim() === '') {
                    const suggested = autoCategorize(editDescInput.value, document.getElementById('editType').value);
                    editCategoryInput.value = suggested;
                }
            };
            editCategoryInput.oninput = () => { manualCategory = true; };
        }
        function closeEditModal() {
            document.getElementById('editModalOverlay').classList.remove('open');
            editingId = null;
            editingIsRecurring = false;
        }
        document.getElementById('editCancel').addEventListener('click', closeEditModal);
        document.getElementById('editSave').addEventListener('click', () => {
            const acc = getActiveAccount();
            if (!acc) return;
            const type = document.getElementById('editType').value;
            const amount = parseFloat(document.getElementById('editValue').value);
            const desc = document.getElementById('editDesc').value.trim();
            const category = document.getElementById('editCategory').value.trim();
            const date = document.getElementById('editDate').value;
            if (!amount || amount <= 0 || !desc || !date) {
                showToast('Please fill in all required fields.');
                return;
            }
            if (editingIsRecurring) {
                const rec = acc.recurrences.find(r => r.id === editingId);
                if (rec) Object.assign(rec, { type, amount, desc, category, startDate: date });
            } else {
                const tx = acc.transactions.find(t => t.id === editingId);
                if (tx) Object.assign(tx, { type, amount, desc, category, date });
            }
            calendarCache = null;
            saveData();
            closeEditModal();
            renderAll();
            showToast('Updated.');
        });
        document.getElementById('editDelete').addEventListener('click', () => {
            if (confirm('Delete permanently?')) {
                deleteTransaction(editingId, editingIsRecurring);
                closeEditModal();
            }
        });

        // ========== OVERVIEW ==========
        let currentPeriod = 'monthly';
        function renderOverview() {
            const acc = getActiveAccount();
            if (!acc) return;
            const period = document.getElementById('periodSelect').value;
            currentPeriod = period;
            const today = new Date();
            
            // Use calendar dates for the range
            let rangeStart, rangeEnd;
            if (calendarViewMode === 'monthly') {
                rangeStart = dateToKey(currentYear, currentMonth, 1);
                rangeEnd = dateToKey(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth));
            } else {
                // Weekly view: use the current week
                let startOfWeek;
                if (currentWeekStartDate) {
                    startOfWeek = new Date(currentWeekStartDate);
                } else {
                    startOfWeek = getStartOfWeek(today, acc.weekStart);
                }
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                rangeStart = formatDate(startOfWeek);
                rangeEnd = formatDate(endOfWeek);
            }
            
            const range = { start: rangeStart, end: rangeEnd };
            const todayKey = formatDate(today);
            document.getElementById('ovTotalBalance').textContent = `${acc.currency} ${getTotalBalance().toFixed(2)}`;
            document.getElementById('ovBalance').textContent = `${acc.currency} ${getBalanceAtEndOfDay(data.activeAccountId, todayKey).toFixed(2)}`;
            let income = 0, expense = 0;
            const startDate = parseDate(range.start);
            const endDate = parseDate(range.end);
            acc.transactions.forEach(t => {
                const tDate = parseDate(t.date);
                if (tDate >= startDate && tDate <= endDate) {
                    if (t.type === 'income') income += t.amount;
                    else expense += t.amount;
                }
            });
            acc.recurrences.forEach(r => {
                const start = parseDate(r.startDate);
                if (start > endDate) return;
                getOccurrences(r, startDate, endDate).forEach(dateKey => {
                    const occDate = parseDate(dateKey);
                    if (occDate >= startDate && occDate <= endDate) {
                        if (r.type === 'income') income += r.amount;
                        else expense += r.amount;
                    }
                });
            });
            document.getElementById('ovIncome').textContent = `${acc.currency} ${income.toFixed(2)}`;
            document.getElementById('ovExpense').textContent = `${acc.currency} ${expense.toFixed(2)}`;
            document.getElementById('ovProjected').textContent = `${acc.currency} ${getBalanceAtEndOfDay(data.activeAccountId, range.end).toFixed(2)}`;
            // Update chart title with actual date range
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            let chartTitleText = '';
            if (calendarViewMode === 'monthly') {
                chartTitleText = `${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;
            } else {
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: startDate.getFullYear() !== endDate.getFullYear() ? 'numeric' : undefined });
                chartTitleText = `${startMonth} \u2013 ${endMonth}`;
            }
            document.getElementById('chartTitle').innerHTML = `<iconify-icon icon="lucide:chart-no-axes-combined" aria-hidden="true"></iconify-icon> Evolution (${chartTitleText})`;
            drawChart(period);
            renderMonthEndBalances();
        }
        function getPeriodRange(period, baseDate, weekStart) {
            const year = baseDate.getFullYear(), month = baseDate.getMonth(), date = baseDate.getDate();
            if (period === 'weekly') {
                const diff = (baseDate.getDay() - weekStart + 7) % 7;
                const monday = new Date(baseDate);
                monday.setDate(date - diff);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                return { start: formatDate(monday), end: formatDate(sunday) };
            }
            if (period === 'monthly')
                return { start: dateToKey(year, month, 1), end: dateToKey(year, month, getDaysInMonth(year, month)) };
            return { start: dateToKey(year, 0, 1), end: dateToKey(year, 11, 31) };
        }
        function drawChart(period) {
            const acc = getActiveAccount();
            if (!acc) return;
            const canvas = document.getElementById('balanceChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const style = window.getComputedStyle(container);
            const width = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const height = 160;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            ctx.scale(dpr, dpr);
            const today = new Date();
            const range = getPeriodRange(period, today, acc.weekStart);
            const startDate = parseDate(range.start);
            const endDate = parseDate(range.end);
            const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            const maxPoints = period === 'weekly' ? 7 : period === 'monthly' ? Math.min(daysDiff, 31) : Math.min(daysDiff, 365);
            const step = Math.max(1, Math.ceil(daysDiff / maxPoints));
            let points = [];
            const balanceCache = new Map();
            const getBal = (dateKey) => {
                if (!balanceCache.has(dateKey)) balanceCache.set(dateKey, getBalanceAtEndOfDay(data.activeAccountId, dateKey));
                return balanceCache.get(dateKey);
            };
            for (let i = 0; i < daysDiff; i += step) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + i);
                if (d > endDate) break;
                points.push({ date: d, balance: getBal(formatDate(d)) });
            }
            if (!points.length || points[points.length - 1].date < endDate)
                points.push({ date: endDate, balance: getBal(formatDate(endDate)) });
            const pad = { top: 12, bottom: 16, left: 0, right: 0 };
            const chartW = width - pad.left - pad.right;
            const chartH = height - pad.top - pad.bottom;
            const maxBal = Math.max(...points.map(p => p.balance), 0);
            const minBal = Math.min(...points.map(p => p.balance), 0);
            const rangeBal = Math.max(maxBal - minBal, 1);
            ctx.clearRect(0, 0, width, height);
            const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
            grad.addColorStop(0, 'rgba(139,92,246,0.20)');
            grad.addColorStop(1, 'rgba(139,92,246,0.02)');
            ctx.beginPath();
            points.forEach((p, i) => {
                const x = pad.left + (i / (points.length - 1)) * chartW;
                const y = pad.top + chartH - ((p.balance - minBal) / rangeBal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.lineTo(pad.left + chartW, pad.top + chartH);
            ctx.lineTo(pad.left, pad.top + chartH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.beginPath();
            points.forEach((p, i) => {
                const x = pad.left + (i / (points.length - 1)) * chartW;
                const y = pad.top + chartH - ((p.balance - minBal) / rangeBal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = '#888888';
            ctx.font = '9px Inter';
            ctx.textAlign = 'center';
            points.forEach((p, i) => {
                if (i % Math.max(1, Math.floor(points.length / 7)) === 0 || i === points.length - 1) {
                    const x = pad.left + (i / (points.length - 1)) * chartW;
                    ctx.fillText(`${p.date.getDate()}/${p.date.getMonth()+1}`, x, pad.top + chartH + 12);
                }
            });
        }

        // ========== RECURRING ==========
        function renderRecurring() {
            const acc = getActiveAccount();
            if (!acc) return;
            const list = document.getElementById('recurringList');
            if (!acc.recurrences.length) {
                list.innerHTML = '<div class="empty-state"><iconify-icon icon="lucide:repeat-2" aria-hidden="true"></iconify-icon> No recurring rules yet.</div>';
                return;
            }
            const freqMap = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
            list.innerHTML = acc.recurrences.map(r =>
                `<div class="recurring-item"><div class="info"><div class="title">${r.type==='income'?'<iconify-icon icon="lucide:trending-up" aria-hidden="true"></iconify-icon>':'<iconify-icon icon="lucide:credit-card" aria-hidden="true"></iconify-icon>'} ${r.desc}</div><div class="meta">${freqMap[r.recurrence]||r.recurrence} · ${r.category||'No category'} · starts ${formatDisplayDate(r.startDate)}</div></div><div class="amount ${r.type}">${r.type==='income'?'+':'−'}${acc.currency} ${r.amount.toFixed(2)}</div><div class="actions"><button class="edit-btn" data-id="${r.id}" aria-label="Edit"><iconify-icon icon="lucide:pencil" aria-hidden="true"></iconify-icon></button><button class="del-btn" data-id="${r.id}" aria-label="Delete"><iconify-icon icon="lucide:trash-2" aria-hidden="true"></iconify-icon></button></div></div>`
            ).join('');
            list.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => {
                const rec = acc.recurrences.find(r => r.id === btn.dataset.id);
                if (rec) openEditModal(rec.id, true, rec.startDate, rec.type, rec.amount, rec.desc, rec.category);
            }));
            list.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', () => {
                if (confirm('Delete rule?')) {
                    acc.recurrences = acc.recurrences.filter(r => r.id !== btn.dataset.id);
                    calendarCache = null;
                    saveData();
                    renderRecurring();
                    renderCalendar();
                    renderOverview();
                    showToast('Rule deleted.');
                }
            }));
        }

        // ========== ACCOUNTS ==========
        function renderAccountList() {
            const container = document.getElementById('accountList');
            if (!data.accounts) return;
            const accountIds = Object.keys(data.accounts);
            container.innerHTML = accountIds.map(id => {
                const acc = data.accounts[id];
                const isActive = id === data.activeAccountId;
                return `<div class="account-item"><div><span class="name">${acc.name}</span>${isActive?'<span class="badge">Active</span>':''}</div><div class="actions">${!isActive?`<button class="switch-btn" data-id="${id}">Activate</button>`:''}<button class="rename-btn" data-id="${id}">Rename</button>${accountIds.length>1?`<button class="delete-btn" data-id="${id}">Delete</button>`:''}</div></div>`;
            }).join('');
            container.querySelectorAll('.switch-btn').forEach(btn => btn.addEventListener('click', () => {
                data.activeAccountId = btn.dataset.id;
                calendarCache = null;
                saveData();
                updateAccountSelector();
                renderAll();
                showToast('Account switched.');
            }));
            container.querySelectorAll('.rename-btn').forEach(btn => btn.addEventListener('click', () => {
                const acc = data.accounts[btn.dataset.id];
                if (!acc) return;
                const name = prompt('New name:', acc.name);
                if (name && name.trim()) {
                    acc.name = name.trim();
                    saveData();
                    renderAccountList();
                    updateAccountSelector();
                }
            }));
            container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => {
                if (Object.keys(data.accounts).length <= 1) {
                    showToast('Cannot delete the only account.');
                    return;
                }
                if (confirm(`Delete ${data.accounts[btn.dataset.id].name}?`)) {
                    delete data.accounts[btn.dataset.id];
                    if (data.activeAccountId === btn.dataset.id)
                        data.activeAccountId = Object.keys(data.accounts)[0];
                    calendarCache = null;
                    saveData();
                    updateAccountSelector();
                    renderAll();
                    showToast('Account deleted.');
                }
            }));
        }

        function updateAccountSelector() {
            const select = document.getElementById('accountSelect');
            if (!data.accounts) return;
            select.innerHTML = Object.keys(data.accounts).map(id =>
                `<option value="${id}" ${id===data.activeAccountId?'selected':''}>${data.accounts[id].name}</option>`
            ).join('');
        }
        document.getElementById('accountSelect').addEventListener('change', function() {
            data.activeAccountId = this.value;
            calendarCache = null;
            saveData();
            closePanel();
            renderAll();
        });
        document.getElementById('quickAddAccount').addEventListener('click', () => {
            const name = prompt('New account name:');
            if (name && name.trim()) {
                const acc = defaultAccount(name.trim());
                data.accounts[acc.id] = acc;
                data.activeAccountId = acc.id;
                calendarCache = null;
                saveData();
                updateAccountSelector();
                renderAll();
                showToast('Account created.');
            }
        });
        document.getElementById('createAccountBtn').addEventListener('click', () => {
            const input = document.getElementById('newAccountName');
            const name = input.value.trim();
            if (!name) {
                showToast('Enter a name.');
                return;
            }
            const acc = defaultAccount(name);
            data.accounts[acc.id] = acc;
            data.activeAccountId = acc.id;
            input.value = '';
            calendarCache = null;
            saveData();
            updateAccountSelector();
            renderAll();
            showToast('Account created.');
        });

        function loadSettingsUI() {
            const acc = getActiveAccount();
            if (!acc) return;
            document.getElementById('setCurrency').value = acc.currency || '€';
            document.getElementById('setStartBalance').value = acc.startBalance || 0;
            document.getElementById('setWeekStart').value = acc.weekStart !== undefined ? acc.weekStart : 1;
        }
        function saveSettings() {
            const acc = getActiveAccount();
            if (!acc) return;
            acc.currency = document.getElementById('setCurrency').value;
            acc.startBalance = parseFloat(document.getElementById('setStartBalance').value) || 0;
            acc.weekStart = parseInt(document.getElementById('setWeekStart').value);
            calendarCache = null;
            saveData();
            renderAll();
            showToast('Settings saved.');
        }
        document.getElementById('setCurrency').addEventListener('change', saveSettings);
        document.getElementById('setStartBalance').addEventListener('change', saveSettings);
        document.getElementById('setWeekStart').addEventListener('change', saveSettings);
        document.getElementById('resetDataBtn').addEventListener('click', () => {
            if (confirm('Delete ALL data? This cannot be undone.')) {
                data = defaultData();
                calendarCache = null;
                saveData();
                updateAccountSelector();
                renderAll();
                showToast('Data reset.');
            }
        });
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'finance-data.json';
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Data exported.');
        });

        // ========== CALCULATOR ==========
        let calculator = { currentValue: '0', previousValue: null, operation: null, waitingForOperand: false, memory: 0 };
        let calculatorInitialized = false;
        let salaryTabCounter = 2;
        let tabNames = { salary1: 'Salary Calc', salary2: 'Salary Calc 2' };

        function updateCalculatorDisplay() {
            const display = document.getElementById('calculatorDisplay');
            const memoryDisplay = document.getElementById('memoryDisplay');
            let formattedValue = calculator.currentValue;
            try {
                if (formattedValue.includes('.')) {
                    const [integerPart, decimalPart] = formattedValue.split('.');
                    formattedValue = parseFloat(integerPart).toLocaleString('en-US') + '.' + decimalPart;
                } else {
                    formattedValue = parseFloat(formattedValue).toLocaleString('en-US');
                }
            } catch (_) {
                formattedValue = calculator.currentValue;
            }
            display.textContent = formattedValue;
            if (calculator.memory !== 0) {
                const memoryFormatted = Math.abs(calculator.memory).toLocaleString('en-US');
                memoryDisplay.textContent = (calculator.memory < 0 ? '−' : '') + memoryFormatted;
                memoryDisplay.parentElement.style.opacity = '1';
            } else {
                memoryDisplay.textContent = '';
                memoryDisplay.parentElement.style.opacity = '0.5';
            }
        }

        function handleNumberInput(value) {
            if (calculator.waitingForOperand) {
                calculator.currentValue = value;
                calculator.waitingForOperand = false;
            } else {
                if (calculator.currentValue === '0' && value !== '.') calculator.currentValue = value;
                else calculator.currentValue += value;
            }
            if (calculator.currentValue.split('').filter(c => c === '.').length > 1)
                calculator.currentValue = calculator.currentValue.slice(0, -1);
            updateCalculatorDisplay();
        }

        function handleOperation(op) {
            if (calculator.operation && !calculator.waitingForOperand) performCalculation();
            calculator.previousValue = calculator.currentValue;
            calculator.operation = op;
            calculator.waitingForOperand = true;
            updateCalculatorDisplay();
        }

        function performCalculation() {
            const prev = parseFloat(calculator.previousValue);
            const current = parseFloat(calculator.currentValue);
            if (isNaN(prev) || isNaN(current) || calculator.operation === null) return;
            let result;
            switch (calculator.operation) {
                case '+': result = prev + current; break;
                case '-': result = prev - current; break;
                case '*': result = prev * current; break;
                case '/': result = prev / current; break;
                default: return;
            }
            calculator.currentValue = result.toString();
            calculator.operation = null;
            calculator.waitingForOperand = true;
            calculator.previousValue = result.toString();
            updateCalculatorDisplay();
        }

        function clearAllCalculator() {
            calculator.currentValue = '0';
            calculator.previousValue = null;
            calculator.operation = null;
            calculator.waitingForOperand = false;
            calculator.memory = 0;
            updateCalculatorDisplay();
        }

        function handleMemoryOperation(op) {
            const current = parseFloat(calculator.currentValue);
            switch (op) {
                case 'MC': calculator.memory = 0; break;
                case 'MR': calculator.currentValue = calculator.memory.toString(); calculator.waitingForOperand = false; break;
                case 'M+': calculator.memory += current; break;
                case 'M-': calculator.memory -= current; break;
            }
            updateCalculatorDisplay();
        }

        function calculateSalary(number) {
            const acc = getActiveAccount();
            if (!acc) return;
            const hourlyRate = parseFloat(document.getElementById(`hourlyRate${number}`).value) || 0;
            const hoursPerDay = parseFloat(document.getElementById(`hoursPerDay${number}`).value) || 0;
            const daysWorked = parseFloat(document.getElementById(`daysWorked${number}`).value) || 0;
            const monthlySalary = hourlyRate * hoursPerDay * daysWorked;
            document.getElementById(`salaryAmount${number}`).textContent = `${acc.currency} ${monthlySalary.toFixed(2)}`;
            document.getElementById(`salaryResult${number}`).style.display = 'block';
            showToast('Salary calculated!');
        }

        function renameTab(tabId) {
            const currentName = tabNames[tabId] || `Salary Calc ${tabId.replace('salary','')}`;
            const newName = prompt('Rename calculator:', currentName);
            if (newName && newName.trim()) {
                tabNames[tabId] = newName.trim();
                const tabBtn = document.querySelector(`.calc-tab[data-tab="${tabId}"] .tab-name`);
                if (tabBtn) tabBtn.textContent = newName;
                const titleEl = document.querySelector(`#${tabId}Calc .salary-title`);
                if (titleEl) {
                    const num = newName.match(/\d+$/);
                    const baseName = newName.replace(/\s*\d+$/, '');
                    titleEl.textContent = baseName + ' Calculator' + (num ? ' ' + num[0] : '');
                }
                showToast('Renamed!');
            }
        }

        function deleteSalaryTab(tabId) {
            const tabBtn = document.querySelector(`.calc-tab[data-tab="${tabId}"]`);
            const contentDiv = document.getElementById(`${tabId}Calc`);
            const wasActive = tabBtn && tabBtn.classList.contains('active');
            if (tabBtn) tabBtn.remove();
            if (contentDiv) contentDiv.remove();
            delete tabNames[tabId];
            showToast('Calculator deleted');
            if (wasActive) {
                const firstTab = document.querySelector('.calc-tab');
                if (firstTab) {
                    firstTab.classList.add('active');
                    const contentId = firstTab.dataset.tab + 'Calc';
                    const contentEl = document.getElementById(contentId);
                    if (contentEl) contentEl.classList.add('active');
                    if (firstTab.dataset.tab === 'standard') updateCalculatorDisplay();
                }
            }
        }

        function createSalaryTabElement(tabId, number) {
            const displayName = tabNames[tabId] || `Salary Calc${number>1?' '+number:''}`;
            const tabBtn = document.createElement('button');
            tabBtn.className = 'calc-tab';
            tabBtn.dataset.tab = tabId;
            tabBtn.innerHTML = `<iconify-icon icon="lucide:dollar-sign"></iconify-icon> <span class="tab-name">${displayName}</span>`;
            const contentDiv = document.createElement('div');
            contentDiv.id = `${tabId}Calc`;
            contentDiv.className = 'calc-content';
            const titleText = displayName.replace(/\s*\d+$/, '') + ' Calculator' + (displayName.match(/\d+$/) || [''])[0];
            contentDiv.innerHTML = `
                    <div class="salary-header">
                        <span class="salary-title">${titleText}</span>
                        <div class="tab-actions">
                            <button class="rename-tab-btn" data-tab="${tabId}" title="Rename this calculator"><iconify-icon icon="lucide:pencil"></iconify-icon></button>
                            <button class="delete-salary-btn" data-tab="${tabId}" title="Delete this calculator"><iconify-icon icon="lucide:trash-2"></iconify-icon></button>
                        </div>
                    </div>
                    <div class="salary-form">
                        <div class="form-row"><label for="hourlyRate${number}">Hourly Rate</label><input type="number" id="hourlyRate${number}" placeholder="0.00" step="0.01" /></div>
                        <div class="form-row"><label for="hoursPerDay${number}">Hours Per Day</label><input type="number" id="hoursPerDay${number}" placeholder="8" step="0.1" /></div>
                        <div class="form-row"><label for="daysWorked${number}">Days Worked</label><input type="number" id="daysWorked${number}" placeholder="20" step="1" /></div>
                        <button class="calc-btn equals-btn" id="calculateSalary${number}" style="margin-top:10px; width:100%;"><iconify-icon icon="lucide:calculator"></iconify-icon> Calculate</button>
                    </div>
                    <div class="result-display" id="salaryResult${number}" style="display:none;">
                        <div class="result-value" id="salaryAmount${number}">$0.00</div>
                        <div class="result-label">Monthly Salary</div>
                    </div>`;
            return { tabBtn, contentDiv };
        }

        function addNewSalaryTab() {
            salaryTabCounter++;
            const tabId = `salary${salaryTabCounter}`;
            const tabsContainer = document.getElementById('calcTabs');
            const calcContainer = document.querySelector('#viewCalculator .calculator-wrapper');
            const { tabBtn, contentDiv } = createSalaryTabElement(tabId, salaryTabCounter);
            tabsContainer.insertBefore(tabBtn, document.getElementById('addCalcTab'));
            calcContainer.appendChild(contentDiv);
            document.getElementById(`calculateSalary${salaryTabCounter}`).addEventListener('click', () => calculateSalary(salaryTabCounter));
            contentDiv.querySelector('.rename-tab-btn').addEventListener('click', () => renameTab(tabId));
            contentDiv.querySelector('.delete-salary-btn').addEventListener('click', () => deleteSalaryTab(tabId));
            tabBtn.addEventListener('click', () => switchCalcTab(tabId));
            document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            document.querySelectorAll('.calc-content').forEach(c => c.classList.remove('active'));
            contentDiv.classList.add('active');
            showToast('New calculator added!');
        }

        function switchCalcTab(tabId) {
            document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.calc-content').forEach(c => c.classList.remove('active'));
            const tabBtn = document.querySelector(`.calc-tab[data-tab="${tabId}"]`);
            const contentEl = document.getElementById(`${tabId}Calc`);
            if (tabBtn) tabBtn.classList.add('active');
            if (contentEl) contentEl.classList.add('active');
            if (tabId === 'standard') updateCalculatorDisplay();
        }

        function initializeCalcTabs() {
            const tabsContainer = document.getElementById('calcTabs');
            const newTabsContainer = tabsContainer.cloneNode(true);
            tabsContainer.parentNode.replaceChild(newTabsContainer, tabsContainer);
            newTabsContainer.querySelectorAll('.calc-tab').forEach(tab => {
                tab.addEventListener('click', () => switchCalcTab(tab.dataset.tab));
            });
            newTabsContainer.addEventListener('click', (e) => {
                const renameBtn = e.target.closest('.rename-tab-btn');
                const deleteBtn = e.target.closest('.delete-salary-btn');
                if (renameBtn) renameTab(renameBtn.dataset.tab);
                if (deleteBtn) deleteSalaryTab(deleteBtn.dataset.tab);
            });
            const addBtn = newTabsContainer.querySelector('#addCalcTab');
            if (addBtn) addBtn.addEventListener('click', addNewSalaryTab);
            const calcWrapper = document.querySelector('#viewCalculator .calculator-wrapper');
            const newCalcWrapper = calcWrapper.cloneNode(true);
            calcWrapper.parentNode.replaceChild(newCalcWrapper, calcWrapper);
            newCalcWrapper.querySelectorAll('[id^="calculateSalary"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const num = btn.id.replace('calculateSalary', '');
                    calculateSalary(num);
                });
            });
            newCalcWrapper.querySelectorAll('.rename-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => renameTab(btn.dataset.tab));
            });
            newCalcWrapper.querySelectorAll('.delete-salary-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteSalaryTab(btn.dataset.tab));
            });
            newCalcWrapper.querySelectorAll('.calc-tab').forEach(tab => {
                tab.addEventListener('click', () => switchCalcTab(tab.dataset.tab));
            });
        }

        function initializeCalculator() {
            if (calculatorInitialized) {
                updateCalculatorDisplay();
                return;
            }
            const acc = getActiveAccount();
            if (!acc) return;
            document.querySelectorAll('#standardCalc .num-btn').forEach(btn => btn.addEventListener('click', () => handleNumberInput(btn.dataset.value)));
            document.querySelectorAll('#standardCalc .op-btn[data-op]').forEach(btn => btn.addEventListener('click', () => handleOperation(btn.dataset.op)));
            document.querySelector('#standardCalc .equals-btn').addEventListener('click', () => performCalculation());
            document.getElementById('clearAll').addEventListener('click', clearAllCalculator);
            document.getElementById('memoryClear').addEventListener('click', () => handleMemoryOperation('MC'));
            document.getElementById('memoryRecall').addEventListener('click', () => handleMemoryOperation('MR'));
            document.getElementById('memoryAdd').addEventListener('click', () => handleMemoryOperation('M+'));
            document.getElementById('memorySubtract').addEventListener('click', () => handleMemoryOperation('M-'));
            document.querySelectorAll('[id^="calculateSalary"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const num = btn.id.replace('calculateSalary', '');
                    calculateSalary(num);
                });
            });
            document.querySelectorAll('.calc-tab').forEach(tab => {
                tab.addEventListener('click', () => switchCalcTab(tab.dataset.tab));
            });
            document.querySelectorAll('.rename-tab-btn').forEach(btn => btn.addEventListener('click', () => renameTab(btn.dataset.tab)));
            document.querySelectorAll('.delete-salary-btn').forEach(btn => btn.addEventListener('click', () => deleteSalaryTab(btn.dataset.tab)));
            document.getElementById('addCalcTab').addEventListener('click', addNewSalaryTab);
            updateCalculatorDisplay();
            calculatorInitialized = true;
        }

        // ========== NAVIGATION ==========
        function navigateTo(viewId) {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
            const map = { viewCalendar: 'calendar', viewRecurring: 'recurring', viewCalculator: 'calculator', viewSettings: 'settings' };
            const navBtn = document.querySelector(`.bottom-nav-item[data-view="${map[viewId]}"]`);
            if (navBtn) navBtn.classList.add('active');
            if (viewId === 'viewCalendar') { renderCalendar(); renderOverview(); }
            else if (viewId === 'viewRecurring') renderRecurring();
            else if (viewId === 'viewCalculator') initializeCalculator();
            else if (viewId === 'viewSettings') { loadSettingsUI(); renderAccountList(); }
        }

        document.querySelectorAll('.bottom-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const viewMap = { calendar: 'viewCalendar', recurring: 'viewRecurring', calculator: 'viewCalculator' };
                navigateTo(viewMap[btn.dataset.view]);
            });
        });

        document.getElementById('topSettingsBtn').addEventListener('click', () => {
            navigateTo('viewSettings');
        });

        document.getElementById('fabAdd').addEventListener('click', () => openModal('income'));
        document.getElementById('prevPeriod').addEventListener('click', () => {
            if (calendarViewMode === 'monthly') {
                currentMonth--;
                if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            } else {
                // Weekly: go to previous week
                const acc = getActiveAccount();
                if (acc && currentWeekStartDate) {
                    currentWeekStartDate.setDate(currentWeekStartDate.getDate() - 7);
                }
            }
            calendarCache = null;
            renderCalendar();
            renderOverview();
        });
        document.getElementById('nextPeriod').addEventListener('click', () => {
            if (calendarViewMode === 'monthly') {
                currentMonth++;
                if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            } else {
                // Weekly: go to next week
                const acc = getActiveAccount();
                if (acc && currentWeekStartDate) {
                    currentWeekStartDate.setDate(currentWeekStartDate.getDate() + 7);
                }
            }
            calendarCache = null;
            renderCalendar();
            renderOverview();
        });
        document.getElementById('todayBtn').addEventListener('click', () => {
            const t = new Date();
            currentYear = t.getFullYear();
            currentMonth = t.getMonth();
            currentWeekStartDate = null;
            calendarCache = null;
            renderCalendar();
            renderOverview();
        });

        // View mode dropdown toggle
        const viewToggleBtn = document.getElementById('viewToggleBtn');
        const viewDropdown = document.getElementById('viewDropdown');
        const viewIcon = document.getElementById('viewIcon');
        
        viewToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewDropdown.classList.toggle('open');
            viewToggleBtn.classList.toggle('open');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            viewDropdown.classList.remove('open');
            viewToggleBtn.classList.remove('open');
        });
        viewDropdown.addEventListener('click', (e) => e.stopPropagation());
        
        // View option clicks
        document.getElementById('weeklyViewBtn').addEventListener('click', () => {
            calendarViewMode = 'weekly';
            document.getElementById('weeklyViewBtn').classList.add('active');
            document.getElementById('monthlyViewBtn').classList.remove('active');
            viewIcon.setAttribute('icon', 'lucide:calendar-days');
            viewDropdown.classList.remove('open');
            viewToggleBtn.classList.remove('open');
            currentWeekStartDate = null;
            document.getElementById('periodSelect').value = 'weekly';
            renderCalendar();
            renderOverview();
        });
        document.getElementById('monthlyViewBtn').addEventListener('click', () => {
            calendarViewMode = 'monthly';
            document.getElementById('weeklyViewBtn').classList.remove('active');
            document.getElementById('monthlyViewBtn').classList.add('active');
            viewIcon.setAttribute('icon', 'lucide:calendar');
            viewDropdown.classList.remove('open');
            viewToggleBtn.classList.remove('open');
            document.getElementById('periodSelect').value = 'monthly';
            renderCalendar();
            renderOverview();
        });

        document.getElementById('periodSelect').addEventListener('change', renderOverview);
        document.getElementById('addRecurringBtn').addEventListener('click', () => {
            openModal('income', null, 'monthly');
        });
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            closeModal();
            closeEditModal();
            closePanel();
        });
        document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.remove('open');
        }));

        function renderAll() {
            const activeView = document.querySelector('.view.active');
            if (!activeView) return;
            if (activeView.id === 'viewCalendar') { renderCalendar(); renderOverview(); }
            else if (activeView.id === 'viewRecurring') renderRecurring();
            else if (activeView.id === 'viewSettings') { loadSettingsUI(); renderAccountList(); }
            updateAccountSelector();
        }

        // ========== INIT ==========
        if (!data.accounts || Object.keys(data.accounts).length === 0) {
            const def = defaultData();
            data.accounts = def.accounts;
            data.activeAccountId = def.activeAccountId;
        }
        if (!data.accounts[data.activeAccountId]) data.activeAccountId = Object.keys(data.accounts)[0];
        Object.keys(data.accounts).forEach(id => {
            const acc = data.accounts[id];
            if (!acc.currency) acc.currency = '€';
            if (acc.startBalance === undefined) acc.startBalance = 0;
            if (acc.weekStart === undefined) acc.weekStart = 1;
            if (!acc.transactions) acc.transactions = [];
            if (!acc.recurrences) acc.recurrences = [];
        });
        saveData();
        updateAccountSelector();
        loadSettingsUI();
        renderAll();
        document.getElementById('modalDate').value = formatDate(new Date());
        window.addEventListener('resize', () => {
            if (document.getElementById('viewCalendar').classList.contains('active')) renderOverview();
        });

        // Initialize view toggle buttons
        document.getElementById('weeklyViewBtn').classList.add('active');
        document.getElementById('monthlyViewBtn').classList.remove('active');
        document.getElementById('viewIcon').setAttribute('icon', 'lucide:calendar-days');
});