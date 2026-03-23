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
exports.CallChainExtractor = exports.CORE_FILTER = exports.DEFAULT_FILTER = void 0;
const vscode = __importStar(require("vscode"));
const extension_1 = require("./extension");
/**
 * 默认过滤配置（完整模式）
 */
exports.DEFAULT_FILTER = {
    excludePatterns: [],
    excludeClassPatterns: [],
    excludeMethodPatterns: [],
    coreOnly: false
};
/**
 * 核心模式过滤配置
 */
exports.CORE_FILTER = {
    excludePatterns: ['**/test/**', '**/Test*.java', '**/*Test.java', '**/*Tests.java'],
    excludeClassPatterns: ['Log', 'Logger', 'LogFactory', 'LoggingCache', 'ErrorContext',
        'Assert', 'Preconditions', 'Objects', 'StringUtils', 'CollectionUtils'],
    excludeMethodPatterns: ['toString', 'hashCode', 'equals', 'compareTo',
        'log*', 'debug*', 'info*', 'warn*', 'error*', 'trace*',
        'get*Logger', 'isDebugEnabled', 'isTraceEnabled'],
    coreOnly: true
};
/**
 * 调用链提取器
 * 通过 VS Code LSP API 递归提取方法调用链
 */
class CallChainExtractor {
    constructor(maxDepth = 10, filter = exports.DEFAULT_FILTER) {
        this.visited = new Set();
        this.results = [];
        this.maxDepth = maxDepth;
        this.filter = filter;
    }
    /**
     * 从指定位置提取调用链
     * @param document 文档对象
     * @param position 光标位置
     * @returns 提取的方法列表
     */
    async extract(document, position) {
        this.visited.clear();
        this.results = [];
        (0, extension_1.log)('[Extractor] 准备调用 vscode.prepareCallHierarchy...');
        (0, extension_1.log)('[Extractor] URI:', document.uri.toString());
        (0, extension_1.log)('[Extractor] Position:', { line: position.line, character: position.character });
        // 1. 准备调用层级入口
        const startTime = Date.now();
        let items;
        try {
            items = await vscode.commands.executeCommand('vscode.prepareCallHierarchy', document.uri, position);
            (0, extension_1.log)(`[Extractor] prepareCallHierarchy 耗时: ${Date.now() - startTime}ms`);
        }
        catch (e) {
            (0, extension_1.log)('[Extractor] prepareCallHierarchy 调用失败:', e);
            throw new Error(`调用 prepareCallHierarchy 失败: ${e}`);
        }
        if (!items || items.length === 0) {
            (0, extension_1.log)('[Extractor] prepareCallHierarchy 返回空结果');
            throw new Error('无法在当前位置找到方法定义，请将光标放在方法名上');
        }
        (0, extension_1.log)(`[Extractor] prepareCallHierarchy 返回 ${items.length} 个入口点`);
        items.forEach((item, i) => {
            (0, extension_1.log)(`[Extractor]   [${i}] ${item.name} - ${item.kind} @ ${item.uri.fsPath}:${item.range.start.line + 1}`);
        });
        // 2. 递归提取
        (0, extension_1.log)('[Extractor] 开始递归提取调用链...');
        await this.collectOutgoingCalls(items[0], 0);
        (0, extension_1.log)(`[Extractor] 递归提取完成, 共 ${this.results.length} 个方法`);
        return this.results;
    }
    /**
     * 递归收集出向调用
     */
    async collectOutgoingCalls(item, depth) {
        const indent = '  '.repeat(depth);
        (0, extension_1.log)(`${indent}[Depth ${depth}] 处理: ${item.name}`);
        // 深度限制
        if (depth > this.maxDepth) {
            (0, extension_1.log)(`${indent}[Depth ${depth}] 达到最大深度限制 (${this.maxDepth}), 跳过`);
            return;
        }
        // 生成唯一键防止循环
        const key = `${item.uri.toString()}#${item.name}#${item.range.start.line}`;
        if (this.visited.has(key)) {
            (0, extension_1.log)(`${indent}[Depth ${depth}] 已访问过, 跳过`);
            return;
        }
        this.visited.add(key);
        // 过滤JDK和第三方库 (通过URI scheme判断)
        const uriStr = item.uri.toString();
        if (this.shouldFilter(uriStr)) {
            (0, extension_1.log)(`${indent}[Depth ${depth}] 过滤掉 (JDK/第三方库): ${uriStr.substring(0, 100)}...`);
            return;
        }
        // 应用自定义过滤规则
        if (this.shouldFilterByCustomRules(item)) {
            (0, extension_1.log)(`${indent}[Depth ${depth}] 过滤掉 (自定义规则): ${item.name}`);
            return;
        }
        // 提取方法信息
        (0, extension_1.log)(`${indent}[Depth ${depth}] 提取方法信息...`);
        const method = await this.extractMethodInfo(item);
        this.results.push(method);
        (0, extension_1.log)(`${indent}[Depth ${depth}] 已添加: ${method.className}.${method.methodName}`);
        // 递归获取出向调用
        (0, extension_1.log)(`${indent}[Depth ${depth}] 获取出向调用...`);
        try {
            const startTime = Date.now();
            const outgoing = await vscode.commands.executeCommand('vscode.provideOutgoingCalls', item);
            (0, extension_1.log)(`${indent}[Depth ${depth}] provideOutgoingCalls 耗时: ${Date.now() - startTime}ms`);
            if (outgoing && outgoing.length > 0) {
                (0, extension_1.log)(`${indent}[Depth ${depth}] 找到 ${outgoing.length} 个出向调用`);
                for (const call of outgoing) {
                    (0, extension_1.log)(`${indent}[Depth ${depth}]   -> ${call.to.name} @ ${call.to.uri.fsPath.split(/[/\\]/).pop()}:${call.to.range.start.line + 1}`);
                    await this.collectOutgoingCalls(call.to, depth + 1);
                }
            }
            else {
                (0, extension_1.log)(`${indent}[Depth ${depth}] 没有出向调用 (叶子节点)`);
            }
        }
        catch (e) {
            // 出向调用获取失败时记录并继续
            (0, extension_1.log)(`${indent}[Depth ${depth}] 获取出向调用失败: ${e}`);
        }
    }
    /**
     * 判断是否应该过滤该URI (JDK/第三方库)
     */
    shouldFilter(uriStr) {
        // jdt:// 表示来自jar包的类
        if (uriStr.startsWith('jdt://')) {
            return true;
        }
        // Maven 本地仓库
        if (uriStr.includes('/.m2/repository/') || uriStr.includes('\\.m2\\repository\\')) {
            return true;
        }
        // Gradle 缓存
        if (uriStr.includes('/.gradle/caches/') || uriStr.includes('\\.gradle\\caches\\')) {
            return true;
        }
        // JDK rt.jar
        if (uriStr.includes('/rt.jar/') || uriStr.includes('\\rt.jar\\')) {
            return true;
        }
        return false;
    }
    /**
     * 根据自定义规则判断是否应该过滤
     */
    shouldFilterByCustomRules(item) {
        const filePath = item.uri.fsPath;
        const methodName = item.name;
        const className = this.extractClassName(item);
        // 检查文件路径排除模式
        for (const pattern of this.filter.excludePatterns) {
            if (this.matchPattern(filePath, pattern)) {
                (0, extension_1.log)(`[Filter] 文件路径匹配排除模式: ${pattern}`);
                return true;
            }
        }
        // 检查类名排除模式
        for (const pattern of this.filter.excludeClassPatterns) {
            if (this.matchPattern(className, pattern)) {
                (0, extension_1.log)(`[Filter] 类名匹配排除模式: ${className} ~ ${pattern}`);
                return true;
            }
        }
        // 检查方法名排除模式
        for (const pattern of this.filter.excludeMethodPatterns) {
            if (this.matchPattern(methodName, pattern)) {
                (0, extension_1.log)(`[Filter] 方法名匹配排除模式: ${methodName} ~ ${pattern}`);
                return true;
            }
        }
        return false;
    }
    /**
     * 简单的通配符模式匹配
     * 支持 * 匹配任意字符，** 匹配任意路径
     */
    matchPattern(text, pattern) {
        // 转换为正则表达式
        let regexStr = pattern
            .replace(/\*\*/g, '{{DOUBLE_STAR}}')
            .replace(/\*/g, '[^/\\\\]*')
            .replace(/{{DOUBLE_STAR}}/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexStr}$`, 'i');
        return regex.test(text);
    }
    /**
     * 提取方法信息
     */
    async extractMethodInfo(item) {
        (0, extension_1.log)(`[extractMethodInfo] 读取文档: ${item.uri.fsPath}`);
        const document = await vscode.workspace.openTextDocument(item.uri);
        const sourceCode = document.getText(item.range);
        (0, extension_1.log)(`[extractMethodInfo] 方法代码长度: ${sourceCode.length} 字符`);
        // 检测是否为接口/抽象方法
        const isInterface = item.kind === vscode.SymbolKind.Interface;
        const isAbstract = this.checkIsAbstract(sourceCode);
        let implementations;
        // 多态处理：如果是接口或抽象方法，获取实现类
        if (isInterface || isAbstract) {
            (0, extension_1.log)(`[extractMethodInfo] 检测到接口/抽象方法，查找实现类...`);
            implementations = await this.findImplementations(item);
            (0, extension_1.log)(`[extractMethodInfo] 找到 ${implementations?.length || 0} 个实现类`);
        }
        return {
            uri: item.uri.toString(),
            className: this.extractClassName(item),
            methodName: item.name,
            signature: item.detail || item.name,
            range: item.range,
            isInterface,
            isAbstract,
            implementations,
            sourceCode
        };
    }
    /**
     * 检查方法是否为抽象方法
     */
    checkIsAbstract(sourceCode) {
        // 包含abstract关键字
        if (sourceCode.includes('abstract ')) {
            return true;
        }
        // 接口方法：没有方法体 (没有大括号或只有分号结尾)
        const trimmed = sourceCode.trim();
        if (trimmed.endsWith(';') && !trimmed.includes('{')) {
            return true;
        }
        return false;
    }
    /**
     * 查找接口/抽象方法的实现类
     */
    async findImplementations(item) {
        try {
            (0, extension_1.log)(`[findImplementations] 调用 executeImplementationProvider...`);
            const startTime = Date.now();
            const implementations = await vscode.commands.executeCommand('vscode.executeImplementationProvider', item.uri, item.selectionRange.start);
            (0, extension_1.log)(`[findImplementations] executeImplementationProvider 耗时: ${Date.now() - startTime}ms`);
            if (implementations && implementations.length > 0) {
                (0, extension_1.log)(`[findImplementations] 找到 ${implementations.length} 个实现`);
                return implementations
                    .map(impl => {
                    // 处理 Location 和 LocationLink 两种类型
                    const uri = 'targetUri' in impl ? impl.targetUri : impl.uri;
                    return uri;
                })
                    .filter(uri => !uri.toString().startsWith('jdt://'))
                    .map(uri => uri.fsPath);
            }
            (0, extension_1.log)(`[findImplementations] 没有找到实现`);
        }
        catch (e) {
            // 实现查找失败时静默处理
            (0, extension_1.log)(`[findImplementations] 查找失败: ${e}`);
        }
        return [];
    }
    /**
     * 从CallHierarchyItem提取类名
     */
    extractClassName(item) {
        // 尝试从URI路径提取类名
        const path = item.uri.fsPath;
        const match = path.match(/([^/\\]+)\.java$/);
        if (match) {
            return match[1];
        }
        // 尝试从detail字段解析 (格式可能是 "ClassName.methodName")
        if (item.detail) {
            const parts = item.detail.split('.');
            if (parts.length > 1) {
                return parts[0];
            }
        }
        return 'Unknown';
    }
}
exports.CallChainExtractor = CallChainExtractor;
//# sourceMappingURL=callChainExtractor.js.map