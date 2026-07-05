/**
 * Twobrain Reminder Engine — 提醒检查引擎
 *
 * 四个提醒节点（相对结束时间）：
 *   3天前 / 1天前 / 12小时前 / 2小时前
 *
 * 每 60 秒轮询，跨过节点时触发系统通知 + 回调。
 */

const ReminderEngine = {
  /** 提醒节点定义 */
  LEVELS: [
    { key: 'threeDays',   offset: 3 * 24 * 60 * 60 * 1000, label: '3 天',  emoji: '📌' },
    { key: 'oneDay',      offset:     24 * 60 * 60 * 1000, label: '1 天',  emoji: '⏰' },
    { key: 'twelveHours', offset:     12 * 60 * 60 * 1000, label: '12 小时', emoji: '⚠️' },
    { key: 'twoHours',    offset:      2 * 60 * 60 * 1000, label: '2 小时', emoji: '🚨' }
  ],

  _timer: null,
  _tasks: [],
  _onNotify: null,   // callback({task, level, label, emoji})

  /**
   * 启动提醒引擎
   * @param {Array} tasks   当前全部任务列表（引用）
   * @param {Function} onNotify  触发提醒时的回调
   */
  start(tasks, onNotify) {
    this._tasks = tasks;
    this._onNotify = onNotify || (() => {});
    this._requestPermission();
    this._check();                              // 启动时立即检查一次
    this._timer = setInterval(() => this._check(), 60000); // 之后每 60s
  },

  /** 停止引擎 */
  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  /** 更新任务引用（增删后调用） */
  update(tasks) {
    this._tasks = tasks;
    this._check(); // 立即对新数据检查一次
  },

  /** 初始化新任务的提醒状态：将已过期的节点标记为已发送 */
  initTask(task) {
    const now = Date.now();
    const endTime = new Date(task.endTime).getTime();

    for (const level of this.LEVELS) {
      const thresholdTime = endTime - level.offset;
      if (now > thresholdTime) {
        task.remindersSent[level.key] = true;
      }
    }

    // 如果全部节点都已过期 → 立即触发最紧急的 2h 提醒
    const allPast = this.LEVELS.every(l => task.remindersSent[l.key]);
    if (allPast && endTime > now) {
      // 留到 _check 中统一处理：先取消 twoHours 的预标记，让检查触发它
      task.remindersSent.twoHours = false;
    }
  },

  // ─── 内部方法 ─────────────────────────────────

  _requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      // 稍后在用户首次点击时请求，这里只是预置
    }
  },

  _check() {
    const now = Date.now();
    const triggered = [];

    for (const task of this._tasks) {
      if (task.completed) continue;

      const endTime = new Date(task.endTime).getTime();
      if (endTime <= now) continue; // 已过期的不提醒

      for (const level of this.LEVELS) {
        const thresholdTime = endTime - level.offset;
        if (now >= thresholdTime && !task.remindersSent[level.key]) {
          task.remindersSent[level.key] = true;
          triggered.push({ task, level: level.key, label: level.label, emoji: level.emoji });
          break; // 每轮每个任务最多触发一个级别
        }
      }
    }

    // 触发通知
    for (const t of triggered) {
      this._notify(t);
      this._onNotify(t);
    }
  },

  _notify({ task, label, emoji }) {
    const title = '📋 Twobrain 提醒';
    const body = `${emoji} "${task.title}" 还有 ${label} 到期`;
    this._sendSystemNotification(title, body);
  },

  _sendSystemNotification(title, body) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: './img/icon-192.png', vibrate: [200, 100, 200] });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification(title, { body, icon: './img/icon-192.png', vibrate: [200, 100, 200] });
        }
      });
    }
  }
};
