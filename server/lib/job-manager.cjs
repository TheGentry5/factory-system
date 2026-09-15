/**
 * 轻量内存任务管理器
 *
 * 用于管理后台 AI 排产任务的异步生命周期。
 * 运行在 Node.js 进程内存中，重启后丢失（可接受，演示场景）。
 */

const jobs = new Map();

/** 创建新任务，返回 jobId */
function createJob() {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    status: 'processing',  // processing | generating | verifying | completed | failed
    progress: 0,
    result: null,
    error: null,
    createdAt: Date.now(),
  });
  return jobId;
}

/** 更新任务状态 */
function updateJob(jobId, update) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, update);
}

/** 查询任务 */
function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/** 定时清理：移除 1 小时前的已完成/失败任务 */
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }
}, 600000);

module.exports = { createJob, updateJob, getJob };
