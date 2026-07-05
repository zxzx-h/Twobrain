/**
 * Twobrain App — 主逻辑：渲染、排序、交互
 */

const App = {
  tasks: [],
  _countdownTimer: null,
  _swipeState: null,

  /** 便利贴颜色映射 */
  COLORS: {
    yellow: { bg: '#FFF9C4', border: '#FDD835', name: '暖黄' },
    pink:   { bg: '#F8BBD0', border: '#EC407A', name: '柔粉' },
    green:  { bg: '#C8E6C9', border: '#66BB6A', name: '浅绿' },
    blue:   { bg: '#BBDEFB', border: '#42A5F5', name: '天蓝' },
    purple: { bg: '#E1BEE7', border: '#AB47BC', name: '淡紫' }
  },

  // ─── 初始化 ─────────────────────────────────

  init() {
    this.tasks = Storage.loadAll();
    this._sort();
    this.render();
    this._bindEvents();
    this._startCountdownTick();
    ReminderEngine.start(this.tasks, (info) => this._onReminder(info));
    this._registerSW();
    this._setupBrowserGuide();
  },

  // ─── 浏览器引导 ─────────────────────────────

  _setupBrowserGuide() {
    const ua = navigator.userAgent || '';

    // 内嵌浏览器检测
    const inAppBrowsers = [
      { test: /MicroMessenger/i, name: '微信' },
      { test: /QQ\//i,          name: 'QQ' },
      { test: /AlipayClient/i,  name: '支付宝' },
      { test: /DingTalk/i,      name: '钉钉' },
      { test: /Weibo/i,         name: '微博' },
      { test: /baiduboxapp/i,   name: '百度' },
      { test: /aweme/i,         name: '抖音' },
      { test: /kwai/i,          name: '快手' },
      { test: /BiliApp/i,       name: 'B站' },
      { test: /Line/i,          name: 'Line' },
      { test: /FBAN/i,          name: 'Facebook' },
      { test: /Instagram/i,     name: 'Instagram' },
    ];

    const matched = inAppBrowsers.find(b => b.test.test(ua));

    if (matched) {
      // 内嵌浏览器 → 弹窗引导扫码
      this._showBrowserGuide();
      return;
    }

    // 系统浏览器 → 显示添加到主屏幕提示（如果不是 standalone 模式）
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                      || navigator.standalone; // iOS

    if (!isStandalone && !localStorage.getItem('twobrain_install_dismissed')) {
      this._showInstallBanner();
    }
  },

  _showBrowserGuide() {
    const overlay = document.getElementById('browserGuide');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    // 生成 QR 码（双源：国外 + 国内备选）
    const qrImg = document.getElementById('qrImage');
    if (qrImg) {
      const url = encodeURIComponent(window.location.href);
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}&bgcolor=FFFEF9`;
      // 如果国外 API 挂了，切到国内源
      qrImg.onerror = () => {
        qrImg.src = `https://quickchart.io/qr?text=${url}&size=200`;
        qrImg.onerror = () => {
          qrImg.style.display = 'none';
        };
      };
    }

    // 关闭按钮
    document.getElementById('btnGuideClose')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    document.getElementById('btnGuideDismiss')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });

    // 复制链接
    document.getElementById('btnCopyLink')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(window.location.href)
        .then(() => this._showToast('✅ 链接已复制，请在浏览器中粘贴打开'))
        .catch(() => this._showToast('⚠️ 复制失败，请截图二维码'));
    });
  },

  _showInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (!banner) return;
    banner.classList.add('show');

    document.getElementById('btnInstallDismiss')?.addEventListener('click', () => {
      banner.classList.remove('show');
      localStorage.setItem('twobrain_install_dismissed', '1');
    });
  },

  // ─── 数据操作 ───────────────────────────────

  addTask(title, endTime, color) {
    const task = {
      id:        this._genId(),
      title:     title.trim(),
      endTime:   new Date(endTime).toISOString(),
      color:     color,
      createdAt: new Date().toISOString(),
      completed: false,
      remindersSent: {
        threeDays: false,
        oneDay: false,
        twelveHours: false,
        twoHours: false
      }
    };

    ReminderEngine.initTask(task);
    this.tasks.push(task);
    this._sort();
    Storage.saveAll(this.tasks);
    this.render();
    ReminderEngine.update(this.tasks);
    this._showToast('✅ 待办已添加');
  },

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    this._sort();
    Storage.saveAll(this.tasks);
    this.render();
  },

  deleteTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    this.tasks = this.tasks.filter(t => t.id !== id);
    Storage.saveAll(this.tasks);
    ReminderEngine.update(this.tasks);
    this.render();
    this._showToast('🗑️ 已删除');
  },

  // ─── 编辑 ───────────────────────────────────

  _openEditModal(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    this._editingId = id;

    document.getElementById('editTitle').value = task.title;
    document.getElementById('editTime').value = task.endTime.slice(0, 16);
    document.getElementById('editOverlay').classList.remove('hidden');

    // 选中当前颜色
    const dots = document.querySelectorAll('#editColors .color-dot');
    dots.forEach(d => d.classList.remove('selected'));
    const active = document.querySelector(`#editColors .color-dot[data-color="${task.color}"]`);
    if (active) active.classList.add('selected');
    this._editingColor = task.color;

    // 颜色选择
    dots.forEach(d => d.onclick = () => {
      dots.forEach(dd => dd.classList.remove('selected'));
      d.classList.add('selected');
      this._editingColor = d.dataset.color;
    });
  },

  _saveEdit() {
    const title = document.getElementById('editTitle').value.trim();
    const timeVal = document.getElementById('editTime').value;

    if (!title) { this._showToast('⚠️ 标题不能为空'); return; }
    if (!timeVal) { this._showToast('⚠️ 请选择时间'); return; }

    const task = this.tasks.find(t => t.id === this._editingId);
    if (!task) return;

    task.title = title;
    task.endTime = new Date(timeVal).toISOString();
    task.color = this._editingColor;

    // 重算提醒状态：只重置未来节点的提醒
    const now = Date.now();
    const endTime = new Date(task.endTime).getTime();
    const levels = ReminderEngine.LEVELS;
    for (const l of levels) {
      if (now > endTime - l.offset) {
        task.remindersSent[l.key] = true;  // 过去的保持静默
      } else {
        task.remindersSent[l.key] = false; // 未来的重新等待提醒
      }
    }

    this._sort();
    Storage.saveAll(this.tasks);
    ReminderEngine.update(this.tasks);
    this.render();
    this._showToast('✅ 已更新');
    this._closeEditModal();
  },

  _closeEditModal() {
    document.getElementById('editOverlay').classList.add('hidden');
    this._editingId = null;
  },

  _editingId: null,
  _editingColor: 'yellow',

  // ─── 渲染 ───────────────────────────────────

  render() {
    const container = document.getElementById('taskBoard');
    if (!container) return;

    if (this.tasks.length === 0) {
      container.innerHTML = this._emptyHTML();
      return;
    }

    container.innerHTML = this.tasks.map(t => this._cardHTML(t)).join('');
    this._bindCardEvents();
  },

  /** 仅更新所有倒计时文本（高频调用，不走全量 render） */
  _tickCountdowns() {
    const now = Date.now();
    document.querySelectorAll('.card-countdown').forEach(el => {
      const endTime = parseInt(el.dataset.endTime);
      if (!endTime) return;
      el.textContent = this._formatCountdown(endTime - now);
    });
  },

  // ─── 内部方法 ───────────────────────────────

  _sort() {
    this.tasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.endTime) - new Date(b.endTime);
    });
  },

  _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  _cardHTML(task) {
    const c = this.COLORS[task.color] || this.COLORS.yellow;
    const endTime = new Date(task.endTime);
    const now = Date.now();
    const remaining = endTime.getTime() - now;
    const isExpired = remaining <= 0;
    const doneClass = task.completed ? 'card--done' : '';
    const expiredClass = (!task.completed && isExpired) ? 'card--expired' : '';

    // 提醒状态标签
    const reminderTags = this._reminderTagsHTML(task, isExpired);

    return `
      <div class="card ${doneClass} ${expiredClass}"
           data-id="${task.id}"
           style="--card-bg:${c.bg};--card-border:${c.border}">
        <div class="card-inner">
          <div class="card-left">
            <button class="card-check" aria-label="切换完成状态">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path class="check-mark" d="M7 12l3 3 7-7"/></svg>
            </button>
          </div>
          <div class="card-body">
            <div class="card-title">${this._escape(task.title)}</div>
            <div class="card-time">📅 ${this._formatTime(endTime)}</div>
            <div class="card-countdown"
                 data-end-time="${endTime.getTime()}">${this._formatCountdown(remaining)}</div>
            ${reminderTags}
          </div>
          <div class="card-right">
            <button class="card-edit" aria-label="编辑">✏️</button>
            <button class="card-delete" aria-label="删除">×</button>
          </div>
        </div>
      </div>`;
  },

  _reminderTagsHTML(task, isExpired) {
    if (task.completed || isExpired) return '';
    const levels = [
      { key: 'threeDays', label: '3天前' },
      { key: 'oneDay', label: '1天前' },
      { key: 'twelveHours', label: '12h前' },
      { key: 'twoHours', label: '2h前' }
    ];
    const tags = levels.map(l => {
      const sent = task.remindersSent[l.key];
      return `<span class="reminder-tag ${sent ? 'sent' : 'pending'}">${sent ? '✓' : '○'} ${l.label}</span>`;
    }).join('');
    return `<div class="card-reminders">${tags}</div>`;
  },

  _emptyHTML() {
    return `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p class="empty-title">还没有待办事项</p>
        <p class="empty-hint">点击上方 + 添加第一个吧</p>
      </div>`;
  },

  // ─── 事件绑定 ───────────────────────────────

  _bindEvents() {
    // 添加按钮
    document.getElementById('btnAdd')?.addEventListener('click', () => this._handleAdd());
    // 回车提交
    document.getElementById('inputTitle')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleAdd();
    });
    // 颜色选择器
    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => this._selectColor(dot));
    });
    // 导出
    document.getElementById('btnExport')?.addEventListener('click', () => Storage.exportJSON());
    // 导入
    document.getElementById('btnImport')?.addEventListener('click', () => {
      document.getElementById('fileImport')?.click();
    });
    document.getElementById('fileImport')?.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        Storage.importJSON(e.target.files[0])
          .then(count => {
            this.tasks = Storage.loadAll();
            this._sort();
            ReminderEngine.update(this.tasks);
            this.render();
            this._showToast(`✅ 已导入 ${count} 条待办`);
          })
          .catch(err => this._showToast('❌ 导入失败：' + err.message));
      }
    });
    // 编辑弹窗
    document.getElementById('btnEditSave')?.addEventListener('click', () => this._saveEdit());
    document.getElementById('btnEditCancel')?.addEventListener('click', () => this._closeEditModal());
    document.getElementById('editOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this._closeEditModal();
    });
    // 编辑弹窗内颜色选择
    document.querySelectorAll('#editColors .color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('#editColors .color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        this._editingColor = dot.dataset.color;
      });
    });

    // 通知权限请求（首次用户交互时）
    document.addEventListener('click', () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, { once: true });
  },

  _bindCardEvents() {
    const self = this;
    document.querySelectorAll('.card').forEach(card => {
      const id = card.dataset.id;

      // 点击勾选框 → 切换完成
      card.querySelector('.card-check')?.addEventListener('click', (e) => {
        e.stopPropagation();
        self.toggleTask(id);
      });

      // 编辑按钮
      card.querySelector('.card-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        self._openEditModal(id);
      });

      // 删除按钮
      card.querySelector('.card-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定删除这条待办吗？')) self.deleteTask(id);
      });

      // 触摸左滑删除
      self._bindSwipe(card, id);
    });
  },

  /** 左滑手势 */
  _bindSwipe(card, id) {
    let startX = 0, startY = 0, moved = false;

    card.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
        moved = true;
        if (dx < 0) {
          card.style.transform = `translateX(${Math.max(dx, -120)}px)`;
          card.style.opacity = 1 + dx / 240;
        }
      }
    }, { passive: true });

    card.addEventListener('touchend', e => {
      card.style.transition = 'transform 0.2s, opacity 0.2s';
      const dx = e.changedTouches[0].clientX - startX;
      if (moved && dx < -80) {
        card.style.transform = 'translateX(-120px)';
        setTimeout(() => this.deleteTask(id), 200);
      } else {
        card.style.transform = '';
        card.style.opacity = '';
      }
    });
  },

  _handleAdd() {
    const titleEl = document.getElementById('inputTitle');
    const timeEl  = document.getElementById('inputTime');
    const title   = titleEl?.value.trim();
    const timeVal = timeEl?.value;

    if (!title)   { this._showToast('⚠️ 请输入待办标题'); titleEl?.focus(); return; }
    if (!timeVal) { this._showToast('⚠️ 请选择结束时间'); timeEl?.focus(); return; }

    const endTime = new Date(timeVal);
    if (endTime <= Date.now()) {
      this._showToast('⚠️ 结束时间必须在将来');
      return;
    }

    this.addTask(title, timeVal, this._selectedColor);
    titleEl.value = '';
    timeEl.value = '';
    titleEl.focus();
  },

  _selectColor(dot) {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
    this._selectedColor = dot.dataset.color;
  },

  /** 当前选中的颜色 */
  _selectedColor: 'yellow',

  // ─── 提醒回调 ───────────────────────────────

  _onReminder({ task, label, emoji }) {
    this._showToast(`${emoji} "${task.title}" 还有 ${label} 到期！`);
    // 高亮脉冲对应的卡片
    const card = document.querySelector(`.card[data-id="${task.id}"]`);
    if (card) {
      card.classList.add('card--pulse');
      setTimeout(() => card.classList.remove('card--pulse'), 2000);
    }
    // 更新提醒标签
    this.render();
  },

  // ─── Toast ──────────────────────────────────

  _showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  // ─── 倒计时 ─────────────────────────────────

  _startCountdownTick() {
    this._countdownTimer = setInterval(() => this._tickCountdowns(), 1000);
  },

  _formatCountdown(ms) {
    if (ms <= 0) return '⏰ 已到期';
    const abs = Math.abs(ms);
    const d = Math.floor(abs / 86400000);
    const h = Math.floor((abs % 86400000) / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    const s = Math.floor((abs % 60000) / 1000);

    if (d > 0) return `剩余 ${d} 天 ${h} 小时`;
    if (h > 0) return `剩余 ${h} 小时 ${m} 分`;
    if (m > 0) return `剩余 ${m} 分 ${s} 秒`;
    return `剩余 ${s} 秒`;
  },

  _formatTime(date) {
    const now = new Date();
    const d = date;
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];

    let dateStr = `${month}月${day}日 周${week} ${hours}:${mins}`;

    // 同一天
    if (d.toDateString() === now.toDateString()) {
      dateStr = `今天 ${hours}:${mins}`;
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (d.toDateString() === tomorrow.toDateString()) {
        dateStr = `明天 ${hours}:${mins}`;
      }
    }
    return dateStr;
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // ─── Service Worker ─────────────────────────

  _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/Twobrain/sw.js', { scope: '/Twobrain/' })
        .then(reg => console.log('SW 已注册:', reg.scope))
        .catch(err => console.warn('SW 注册失败:', err));
    }
  }
};

// ─── 启动 ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
