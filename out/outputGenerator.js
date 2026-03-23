"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputGenerator = void 0;
const vscode = __importStar(require("vscode"));
const codeOptimizer_1 = require("./codeOptimizer");
/**
 * 输出生成器
 * 将提取结果生成格式化的上下文文件
 */
class OutputGenerator {
    constructor(config) {
        this.config = config || {
            removeJavadoc: true,
            removeComments: true,
            removeAnnotations: false,
            compactImports: true,
            shortImplPaths: true,
            indentSize: 2,
            compactMode: false
        };
        this.optimizer = new codeOptimizer_1.CodeOptimizer(this.config);
    }
    /**
     * 生成输出文件
     * @param result 提取结果
     * @param outputDir 输出目录
     * @param suffix 文件名后缀（可选，如 '_core'）
     * @returns 输出文件路径
     */
    async generate(result, outputDir, suffix = '') {
        // 按文件分组
        const fileGroups = this.groupByFile(result.methods);
        let output = this.generateHeader(result);
        for (const [uri, methods] of fileGroups) {
            try {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
                output += this.generateFileSection(document, methods, result.fields, result.entryPoint);
            }
            catch (e) {
                console.warn(`无法读取文件: ${uri}`, e);
                output += `// [ERROR] 无法读取文件: ${uri}\n\n`;
            }
        }
        // 写入文件
        const outputPath = await this.writeToFile(output, outputDir, result.entryPoint, suffix);
        return outputPath;
    }
    /**
     * 生成文件头部注释
     */
    generateHeader(result) {
        const methodList = result.methods
            .slice(0, 10)
            .map(m => `${m.className}.${m.methodName}`)
            .join('\n *   - ');
        const hasMore = result.methods.length > 10 ? `\n *   ... and ${result.methods.length - 10} more` : '';
        return `/**
 * ============================================
 * AI Context File - Java Call Chain Extraction
 * ============================================
 * 
 * Entry Point: ${result.entryPoint}
 * Generated: ${result.timestamp}
 * Methods Count: ${result.methods.length}
 * Fields Count: ${result.fields.length}
 * 
 * Call Chain:
 *   - ${methodList}${hasMore}
 * 
 * Legend:
 *   [INTERFACE] - 接口方法定义
 *   [ABSTRACT]  - 抽象方法定义
 *   [IMPL: xxx] - 实现类路径
 * ============================================
 */

`;
    }
    /**
     * 生成单个文件的代码段
     */
    generateFileSection(document, methods, fields, entryMethodName) {
        const text = document.getText();
        const uri = document.uri.toString();
        const indent = ' '.repeat(this.config.indentSize);
        let section = '';
        // 文件分隔符（简化）
        const fileName = document.uri.fsPath.split(/[/\\]/).pop();
        section += `// ========== ${fileName} ==========\n\n`;
        // 提取 package 声明
        const packageMatch = text.match(/^package\s+[\w.]+;/m);
        if (packageMatch) {
            section += packageMatch[0] + '\n\n';
        }
        // 提取并优化 imports
        const imports = text.match(/^import\s+[\w.*]+;/gm) || [];
        const methodSources = methods.map(m => m.sourceCode || '');
        const optimizedImports = this.optimizer.optimizeImports(imports, methodSources);
        if (optimizedImports.length > 0) {
            section += optimizedImports.join('\n') + '\n\n';
        }
        // 提取类声明行
        const classMatch = text.match(/^(public\s+)?(abstract\s+)?(final\s+)?(class|interface|enum)\s+\w+[^{]*\{/m);
        if (classMatch) {
            section += classMatch[0] + '\n\n';
        }
        // 输出字段定义
        const fileFields = fields.filter(f => f.uri === uri);
        if (fileFields.length > 0) {
            section += `${indent}// === Fields ===\n`;
            for (const field of fileFields) {
                const optimizedField = this.optimizer.optimizeFieldSource(field.sourceCode);
                section += `${indent}${optimizedField}\n`;
            }
            section += '\n';
        }
        // 输出方法
        section += `${indent}// === Methods ===\n`;
        for (const method of methods) {
            // 判断是否为入口方法
            const isEntry = method.methodName === entryMethodName || methods.indexOf(method) === 0;
            // 添加多态标记
            if (method.isInterface) {
                section += `${indent}// [INTERFACE]\n`;
            }
            else if (method.isAbstract) {
                section += `${indent}// [ABSTRACT]\n`;
            }
            // 优化实现类路径显示
            if (method.implementations && method.implementations.length > 0) {
                const shortPaths = this.optimizer.optimizeImplPaths(method.implementations);
                section += `${indent}// [IMPL: ${shortPaths.join(', ')}]\n`;
            }
            // 优化方法源代码
            const optimizedSource = this.optimizer.optimizeMethodSource(method.sourceCode || '', isEntry);
            // 添加方法源代码
            const sourceLines = optimizedSource.split('\n');
            for (const line of sourceLines) {
                if (line.trim()) { // 跳过空行
                    section += `${indent}${line}\n`;
                }
            }
            section += '\n';
        }
        section += '}\n\n';
        return section;
    }
    /**
     * 写入文件
     */
    async writeToFile(content, outputDir, entryPoint, suffix = '') {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区文件夹');
        }
        const dirPath = vscode.Uri.joinPath(workspaceFolder.uri, outputDir);
        // 确保目录存在
        try {
            await vscode.workspace.fs.createDirectory(dirPath);
        }
        catch (e) {
            // 目录可能已存在，忽略错误
        }
        // 生成安全的文件名
        const safeName = this.sanitizeFileName(entryPoint);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `${safeName}${suffix}_${timestamp}_context.java`;
        const filePath = vscode.Uri.joinPath(dirPath, fileName);
        // 写入文件
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(filePath, encoder.encode(content));
        return filePath.fsPath;
    }
    /**
     * 按文件分组方法
     */
    groupByFile(methods) {
        const groups = new Map();
        for (const method of methods) {
            const existing = groups.get(method.uri) || [];
            existing.push(method);
            groups.set(method.uri, existing);
        }
        return groups;
    }
    /**
     * 清理文件名中的非法字符
     */
    sanitizeFileName(name) {
        return name
            .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 50);
    }
}
exports.OutputGenerator = OutputGenerator;
//# sourceMappingURL=outputGenerator.js.map