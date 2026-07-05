/**
 * Twobrain Storage — localStorage CRUD 封装
 */
const Storage = {
  KEY: 'twobrain_tasks',

  /** 加载全部任务 */
  loadAll() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load tasks:', e);
      return [];
    }
  },

  /** 保存全部任务（全量覆盖） */
  saveAll(tasks) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error('Failed to save tasks:', e);
      this._showQuotaError();
    }
  },

  /** 添加单个任务 */
  addTask(task) {
    const tasks = this.loadAll();
    tasks.push(task);
    this.saveAll(tasks);
    return task;
  },

  /** 更新单个任务 */
  updateTask(id, updates) {
    const tasks = this.loadAll();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...updates };
    this.saveAll(tasks);
    return tasks[idx];
  },

  /** 删除单个任务 */
  deleteTask(id) {
    const tasks = this.loadAll();
    const filtered = tasks.filter(t => t.id !== id);
    if (filtered.length === tasks.length) return false;
    this.saveAll(filtered);
    return true;
  },

  /** 导出 JSON 备份 */
  exportJSON() {
    const data = JSON.stringify(this.loadAll(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twobrain-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** 导入 JSON 备份 */
  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error('格式错误：需要数组');
          this.saveAll(data);
          resolve(data.length);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  },

  _showQuotaError() {
    alert('存储空间不足，请清理一些旧任务或导出备份。');
  }
};
