/**
 * @fileoverview 服务端数据恢复脚本。
 * @description 从指定备份目录恢复数据库与持久化数据，并在缺少参数时列出可用备份。
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../src/config.mjs";

const backupRoot = resolve(process.env.BACKUP_DIR || "./backups");
const requested = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : "";

if (!requested) {
  console.log("Usage: npm.cmd run restore -- backups/<backup-folder>");
  if (existsSync(backupRoot)) {
    console.log("Available backups:");
    for (const name of readdirSync(backupRoot)) {
      console.log(`- ${backupRoot}\\${name}`);
    }
  }
  process.exit(0);
}

if (!existsSync(requested)) {
  console.error(`Backup path does not exist: ${requested}`);
  process.exit(1);
}

mkdirSync(config.dataDir, { recursive: true });
cpSync(requested, config.dataDir, {
  recursive: true,
  force: true,
  filter: (source) => !source.includes("backups")
});

console.log(`Data restored from ${requested} to ${config.dataDir}`);
