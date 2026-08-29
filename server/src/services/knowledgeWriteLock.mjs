/**
 * @fileoverview 知识快照写入的跨进程互斥锁。
 * @description
 * 通过跨进程锁文件保护知识快照的同步写入与活动版本切换。
 *
 * 使用同一数据目录下的独占锁文件协调 HTTP 服务与定时 worker，避免两个进程同时
 * 切换活动指针或覆盖同一份运行时快照。锁只保护同步短写入阶段，不替代数据库事务。
 */
import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_WAIT_MS = 10_000;
const DEFAULT_RETRY_MS = 50;

/**
 * @description
 * 在知识快照写锁内执行同步操作。
 * @template T
 * @param {string} generatedDir 可写知识生成目录。
 * @param {() => T} callback 需要互斥执行的同步操作。
 * @param {object} [options={}] 等待策略。
 * @param {number} [options.waitMs=10000] 获取写锁的最长等待时间，单位为毫秒。
 * @param {number} [options.retryMs=50] 两次锁获取尝试之间的等待时间，单位为毫秒。
 * @returns {T} 回调返回值。
 * @throws {Error & {code: string, statusCode: number}} 超过等待时间时抛出稳定错误。
 * @throws {Error} 锁目录或锁文件创建、写入、关闭、删除失败时透传文件系统异常。
 * @throws {*} 回调执行失败时原样抛出回调异常。
 * @example
 * const result = withKnowledgeWriteLock(generatedDir, () => writeSnapshot());
 */
export function withKnowledgeWriteLock(generatedDir, callback, options = {}) {
  mkdirSync(generatedDir, { recursive: true });
  const lockPath = join(generatedDir, ".knowledge-write.lock");
  const waitMs = Math.max(0, Number(options.waitMs ?? DEFAULT_WAIT_MS));
  const retryMs = Math.max(1, Number(options.retryMs ?? DEFAULT_RETRY_MS));
  const deadline = Date.now() + waitMs;
  let descriptor;

  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, `${process.pid}\n`, "utf8");
    } catch (error) {
      if (error?.code !== "EEXIST" || Date.now() >= deadline) {
        const lockError = new Error("The knowledge snapshot is busy. Try again shortly.", { cause: error });
        lockError.code = "KNOWLEDGE_WRITE_LOCK_TIMEOUT";
        lockError.statusCode = 409;
        throw lockError;
      }
      waitSync(Math.min(retryMs, Math.max(1, deadline - Date.now())));
    }
  }

  try {
    return callback();
  } finally {
    closeSync(descriptor);
    unlinkSync(lockPath, { force: true });
  }
}

/**
 * @description
 * 通过 Atomics.wait 阻塞当前线程指定时长。
 * @param {number} milliseconds 阻塞等待时长。
 * @returns {void} 无返回值。
 */
function waitSync(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}
