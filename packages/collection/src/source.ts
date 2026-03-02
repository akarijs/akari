import { Context } from 'cordis';
import glob from 'fast-glob';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

export interface SourceOptions {
    pattern: string | string[];
    cwd?: string;
}

export interface FileData {
    path: string;
    ext: string;
    content: string;
}

declare module 'cordis' {
    interface Events<C extends Context = Context> {
        'source/file'(data: FileData): void;
    }
}

/**
 * Source 插件：负责将物理文件泵入 Collection
 */
export function FileSource(ctx: Context, options: SourceOptions) {
    const { pattern, cwd = process.cwd() } = options;

    ctx.on('ready', async () => {
        const files = await glob(pattern, { cwd, absolute: true });

        for (const file of files) {
            // 这里的逻辑通常需要对接不同的 Parser（如 YAML, Markdown）
            // MVP 版本我们假设它只是读取内容
            const content = await readFile(file, 'utf-8');

            // 触发 source 事件，通知具体的 Collection 插件去认领并解析
            ctx.emit('source/file', {
                path: file,
                ext: extname(file),
                content
            });
        }
    });
}