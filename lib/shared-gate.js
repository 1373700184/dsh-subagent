/**
* 跨 dsh 进程共享的子代理并发槽位。
*
* 槽位落在系统临时目录(`<tmp>/dsh-subagent-gate/<后端>/slot-N.lock`),
* 同一台机器上的 dsh web、headless 以及多个并行任务都读写同一份文件,
* 因此并发上限对这些任务统一生效,而不是每个宿主进程各算一份。
* 每个槽位文件记录持有者 pid 与随机 token,持有期间定期刷新 mtime;
* pid 已退出或心跳过期(30 秒)的槽位会被其他进程回收。
*/
import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	statSync,
	unlinkSync,
	utimesSync,
	writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(tmpdir(), "dsh-subagent-gate");
const HEARTBEAT_MS = 5000;
const STALE_MS = 30000;
const ACTIVE_TTL_MS = 300;
const SLOT_PATTERN = /^(slot-\d+|adopt-[0-9a-f-]+)\.lock$/;

/** 把后端名压成安全的目录名,并用短哈希避免不同名字归一化后冲突。 */
function providerDirName(name) {
	let hash = 5381;
	for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
	return `${(hash >>> 0).toString(36)}-${name.replace(/[^\w.-]/g, "_")}`;
}

export class SharedProviderGate {
	/** 本进程持有的槽位:文件路径 → token。 */
	#owned = new Map();
	#timer = null;
	#activeCache = new Map();
	/** 文件系统不可用时的本地兜底计数。 */
	#memory = null;

	#dir(name) {
		return join(ROOT, providerDirName(name));
	}

	#ensureDir(name) {
		const dir = this.#dir(name);
		mkdirSync(dir, { recursive: true });
		return dir;
	}

	#read(file) {
		try {
			const data = JSON.parse(readFileSync(file, "utf8"));
			return { pid: Number(data?.pid) || 0, token: String(data?.token ?? ""), mtime: statSync(file).mtimeMs };
		} catch {
			return null;
		}
	}

	#alive(record) {
		if (!record?.pid) return false;
		try {
			process.kill(record.pid, 0);
		} catch {
			return false;
		}
		return Date.now() - record.mtime <= STALE_MS;
	}

	#writeNew(file, token) {
		const fd = openSync(file, "wx");
		try {
			writeSync(fd, JSON.stringify({ pid: process.pid, token, since: Date.now() }));
		} finally {
			closeSync(fd);
		}
	}

	/** 先改名再校验 token,避免并发回收时误删其他进程刚建好的槽位。 */
	#reclaim(file, expectedToken) {
		const trash = `${file}.stale-${randomUUID()}`;
		try {
			renameSync(file, trash);
		} catch {
			// 部分文件系统不允许改名已打开的文件,退回直接删除。
			try {
				unlinkSync(file);
			} catch {}
			return;
		}
		const record = this.#read(trash);
		if (record && record.token !== expectedToken) {
			try {
				renameSync(trash, file);
			} catch {
				try {
					unlinkSync(trash);
				} catch {}
			}
			return;
		}
		try {
			unlinkSync(trash);
		} catch {}
	}

	#sweep(dir) {
		let entries;
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!SLOT_PATTERN.test(entry)) continue;
			const file = join(dir, entry);
			const record = this.#read(file);
			if (!record || !this.#alive(record)) this.#reclaim(file, record?.token);
		}
	}

	#hold(file, token, name) {
		this.#owned.set(file, token);
		this.#startHeartbeat();
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.#owned.delete(file);
			const record = this.#read(file);
			if (!record || record.token === token) {
				try {
					unlinkSync(file);
				} catch {}
			}
			this.#activeCache.delete(name);
			if (this.#owned.size === 0) this.#stopHeartbeat();
		};
	}

	#startHeartbeat() {
		if (this.#timer) return;
		this.#timer = setInterval(() => this.#beat(), HEARTBEAT_MS);
		this.#timer.unref?.();
	}

	#stopHeartbeat() {
		if (!this.#timer) return;
		clearInterval(this.#timer);
		this.#timer = null;
	}

	#beat() {
		const now = new Date();
		for (const [file, token] of [...this.#owned]) {
			try {
				utimesSync(file, now, now);
				continue;
			} catch {}
			// 临时目录被清理或槽位被误回收时按原 token 重建;
			// EEXIST 说明槽位已归别人,放弃本地所有权。
			try {
				this.#writeNew(file, token);
			} catch {
				this.#owned.delete(file);
			}
		}
		if (this.#owned.size === 0) this.#stopHeartbeat();
	}

	#acquireMemory(name, limit) {
		const used = this.#memory.get(name) ?? 0;
		if (used >= limit) return null;
		this.#memory.set(name, used + 1);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.#memory.set(name, Math.max(0, (this.#memory.get(name) ?? 1) - 1));
		};
	}

	/** 统计仍然存活的槽位(含其他进程与崩溃接管的运行)。 */
	#countActive(dir) {
		let value = 0;
		let entries;
		try {
			entries = readdirSync(dir);
		} catch {
			return 0;
		}
		for (const entry of entries) {
			if (!SLOT_PATTERN.test(entry)) continue;
			const record = this.#read(join(dir, entry));
			if (record && this.#alive(record)) value += 1;
		}
		return value;
	}

	#acquireShared(name, limit) {
		const dir = this.#ensureDir(name);
		if (this.#countActive(dir) >= limit) return null;
		for (let i = 0; i < limit; i++) {
			const file = join(dir, `slot-${i}.lock`);
			for (let attempt = 0; attempt < 2; attempt++) {
				const token = randomUUID();
				try {
					this.#writeNew(file, token);
				} catch (error) {
					if (error?.code !== "EEXIST") throw error;
					if (attempt > 0) break;
					const record = this.#read(file);
					if (record && this.#alive(record)) break;
					this.#reclaim(file, record?.token);
					continue;
				}
				this.#activeCache.delete(name);
				return this.#hold(file, token, name);
			}
		}
		return null;
	}

	/** 占用一个槽位;成功返回释放函数,已满返回 null。 */
	tryAcquire(name, limit) {
		const max = Math.max(1, Number(limit) || 1);
		if (!this.#memory) {
			try {
				return this.#acquireShared(name, max);
			} catch {
				this.#memory = new Map();
			}
		}
		return this.#acquireMemory(name, max);
	}

	/** 当前占用槽位的运行数(含其他 dsh 进程),短缓存避免轮询反复扫目录。 */
	active(name) {
		if (this.#memory) return this.#memory.get(name) ?? 0;
		const cached = this.#activeCache.get(name);
		if (cached && Date.now() - cached.at < ACTIVE_TTL_MS) return cached.value;
		let value = 0;
		try {
			const dir = this.#dir(name);
			for (const entry of readdirSync(dir)) {
				if (!SLOT_PATTERN.test(entry)) continue;
				const record = this.#read(join(dir, entry));
				if (record && this.#alive(record)) value += 1;
			}
		} catch {}
		this.#activeCache.set(name, { value, at: Date.now() });
		return value;
	}

	/** 接管宿主机重启前遗留的运行:优先占用固定槽位,槽位已满则单独记一条。 */
	reserve(name) {
		if (!this.#memory) {
			try {
				const dir = this.#ensureDir(name);
				this.#sweep(dir);
				for (let i = 0; i < 64; i++) {
					const file = join(dir, `slot-${i}.lock`);
					const token = randomUUID();
					try {
						this.#writeNew(file, token);
						this.#activeCache.delete(name);
						return this.#hold(file, token, name);
					} catch (error) {
						if (error?.code !== "EEXIST") throw error;
					}
				}
				const file = join(dir, `adopt-${randomUUID()}.lock`);
				const token = randomUUID();
				this.#writeNew(file, token);
				this.#activeCache.delete(name);
				return this.#hold(file, token, name);
			} catch {
				this.#memory = new Map();
			}
		}
		const used = this.#memory.get(name) ?? 0;
		this.#memory.set(name, used + 1);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.#memory.set(name, Math.max(0, (this.#memory.get(name) ?? 1) - 1));
		};
	}
}
