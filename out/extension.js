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
exports.getOutputChannel = getOutputChannel;
exports.log = log;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const callChainExtractor_1 = require("./callChainExtractor");
const fieldAnalyzer_1 = require("./fieldAnalyzer");
const outputGenerator_1 = require("./outputGenerator");
const lspFeatures_1 = require("./lspFeatures");
// 创建输出通道用于调试日志
let outputChannel;
/**
 * 获取输出通道 (懒加载)
 */
function getOutputChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Java Call Chain Extractor');
    }
    return outputChannel;
}
/**
 * 记录调试日志
 */
function log(message, ...args) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const formattedMessage = `[${timestamp}] ${message}`;
    getOutputChannel().appendLine(formattedMessage);
    if (args.length > 0) {
        for (const arg of args) {
            if (typeof arg === 'object') {
                getOutputChannel().appendLine('  ' + JSON.stringify(arg, null, 2));
            }
            else {
                getOutputChannel().appendLine('  ' + String(arg));
            }
        }
    }
    console.log(formattedMessage, ...args);
}
/**
 * 扩展激活入口
 */
function activate(context) {
    log('Java Call Chain Extractor 已激活');
    getOutputChannel().show(true); // 自动显示输出面板
    // 注册提取调用链命令
    const extractCommand = vscode.commands.registerCommand('javaExtractor.extractCallChain', async () => {
        const editor = vscode.window.activeTextEditor;
        // 验证当前编辑器状态
        if (!editor) {
            vscode.window.showErrorMessage('请先打开一个Java文件');
            return;
        }
        if (editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在Java文件中使用此功能');
            return;
        }
        // 使用进度条显示提取过程
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在提取Java调用链...',
            cancellable: true
        }, async (progress, token) => {
            try {
                // 获取配置
                const config = vscode.workspace.getConfiguration('javaExtractor');
                const maxDepth = config.get('maxDepth', 10);
                const outputDir = config.get('outputDir', '.skill_context');
                // 优化配置
                const optimizationConfig = {
                    removeJavadoc: config.get('removeJavadoc', true),
                    removeComments: config.get('removeComments', true),
                    removeAnnotations: config.get('removeAnnotations', false),
                    compactImports: config.get('compactImports', true),
                    shortImplPaths: config.get('shortImplPaths', true),
                    indentSize: config.get('indentSize', 2),
                    compactMode: config.get('compactMode', false)
                };
                log('========== 开始提取调用链 ==========');
                log('配置:', { maxDepth, outputDir });
                log('优化配置:', optimizationConfig);
                log('文件:', editor.document.uri.fsPath);
                log('光标位置:', { line: editor.selection.active.line + 1, character: editor.selection.active.character + 1 });
                // Step 1: 提取调用链
                progress.report({ message: '分析调用层级...', increment: 10 });
                log('Step 1: 开始分析调用层级...');
                const extractor = new callChainExtractor_1.CallChainExtractor(maxDepth);
                const methods = await extractor.extract(editor.document, editor.selection.active);
                log(`Step 1 完成: 找到 ${methods.length} 个方法`);
                methods.forEach((m, i) => {
                    log(`  [${i + 1}] ${m.className}.${m.methodName} (${m.isInterface ? 'INTERFACE' : m.isAbstract ? 'ABSTRACT' : 'IMPL'})`);
                });
                if (token.isCancellationRequested) {
                    log('用户取消了操作');
                    vscode.window.showInformationMessage('提取已取消');
                    return;
                }
                if (methods.length === 0) {
                    log('警告: 未找到任何方法调用链');
                    vscode.window.showWarningMessage('未找到任何方法调用链');
                    return;
                }
                progress.report({ message: `找到 ${methods.length} 个方法，分析成员变量...`, increment: 30 });
                // Step 2: 分析成员变量依赖
                log('Step 2: 开始分析成员变量依赖...');
                const fieldAnalyzer = new fieldAnalyzer_1.FieldAnalyzer();
                const fields = await fieldAnalyzer.analyzeUsedFields(methods);
                log(`Step 2 完成: 找到 ${fields.length} 个字段`);
                fields.forEach((f, i) => {
                    log(`  [${i + 1}] ${f.className}.${f.fieldName}: ${f.fieldType}`);
                });
                if (token.isCancellationRequested) {
                    log('用户取消了操作');
                    vscode.window.showInformationMessage('提取已取消');
                    return;
                }
                progress.report({ message: '生成上下文文件...', increment: 30 });
                // Step 3: 生成输出
                log('Step 3: 开始生成上下文文件...');
                const result = {
                    entryPoint: methods[0]?.signature || 'unknown',
                    methods,
                    fields,
                    imports: new Map(),
                    timestamp: new Date().toISOString()
                };
                const generator = new outputGenerator_1.OutputGenerator(optimizationConfig);
                const outputPath = await generator.generate(result, outputDir);
                log(`Step 3 完成: 文件已保存到 ${outputPath}`);
                log('========== 提取完成 ==========');
                progress.report({ message: '完成!', increment: 30 });
                // 显示成功消息并提供打开文件选项
                const selection = await vscode.window.showInformationMessage(`提取完成! ${methods.length} 个方法, ${fields.length} 个字段已保存`, '打开文件', '在资源管理器中显示');
                if (selection === '打开文件') {
                    const doc = await vscode.workspace.openTextDocument(outputPath);
                    await vscode.window.showTextDocument(doc);
                }
                else if (selection === '在资源管理器中显示') {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : '';
                log('========== 提取失败 ==========');
                log('错误信息:', errorMessage);
                if (errorStack) {
                    log('错误堆栈:', errorStack);
                }
                vscode.window.showErrorMessage(`提取失败: ${errorMessage}`);
            }
        });
    });
    context.subscriptions.push(extractCommand);
    // 注册核心调用链提取命令（精简模式）
    const extractCoreCommand = vscode.commands.registerCommand('javaExtractor.extractCoreCallChain', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('请先打开一个Java文件');
            return;
        }
        if (editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在Java文件中使用此功能');
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在提取核心调用链...',
            cancellable: true
        }, async (progress, token) => {
            try {
                const config = vscode.workspace.getConfiguration('javaExtractor');
                const maxDepth = config.get('maxDepth', 10);
                const outputDir = config.get('outputDir', '.skill_context');
                // 核心模式优化配置 - 更激进的精简
                const optimizationConfig = {
                    removeJavadoc: true,
                    removeComments: true,
                    removeAnnotations: true, // 移除注解
                    compactImports: true,
                    shortImplPaths: true,
                    indentSize: 2,
                    compactMode: true // 非入口方法只保留签名
                };
                log('========== 开始提取核心调用链 (精简模式) ==========');
                log('过滤规则:', callChainExtractor_1.CORE_FILTER);
                log('优化配置:', optimizationConfig);
                log('文件:', editor.document.uri.fsPath);
                // Step 1: 使用核心过滤规则提取调用链
                progress.report({ message: '分析核心调用层级...', increment: 10 });
                const extractor = new callChainExtractor_1.CallChainExtractor(maxDepth, callChainExtractor_1.CORE_FILTER);
                const methods = await extractor.extract(editor.document, editor.selection.active);
                log(`Step 1 完成: 找到 ${methods.length} 个核心方法`);
                methods.forEach((m, i) => {
                    log(`  [${i + 1}] ${m.className}.${m.methodName}`);
                });
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage('提取已取消');
                    return;
                }
                if (methods.length === 0) {
                    vscode.window.showWarningMessage('未找到任何核心方法调用链');
                    return;
                }
                progress.report({ message: `找到 ${methods.length} 个核心方法...`, increment: 30 });
                // Step 2: 分析成员变量（仅核心字段）
                log('Step 2: 分析核心成员变量...');
                const fieldAnalyzer = new fieldAnalyzer_1.FieldAnalyzer();
                const fields = await fieldAnalyzer.analyzeUsedFields(methods);
                log(`Step 2 完成: 找到 ${fields.length} 个字段`);
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage('提取已取消');
                    return;
                }
                progress.report({ message: '生成精简上下文文件...', increment: 30 });
                // Step 3: 生成精简输出
                log('Step 3: 生成精简上下文文件...');
                const result = {
                    entryPoint: methods[0]?.signature || 'unknown',
                    methods,
                    fields,
                    imports: new Map(),
                    timestamp: new Date().toISOString()
                };
                const generator = new outputGenerator_1.OutputGenerator(optimizationConfig);
                const outputPath = await generator.generate(result, outputDir, '_core');
                log(`Step 3 完成: 文件已保存到 ${outputPath}`);
                log('========== 核心调用链提取完成 ==========');
                progress.report({ message: '完成!', increment: 30 });
                const selection = await vscode.window.showInformationMessage(`核心调用链提取完成! ${methods.length} 个方法 (已过滤日志/测试类)`, '打开文件', '在资源管理器中显示');
                if (selection === '打开文件') {
                    const doc = await vscode.workspace.openTextDocument(outputPath);
                    await vscode.window.showTextDocument(doc);
                }
                else if (selection === '在资源管理器中显示') {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                log('========== 核心调用链提取失败 ==========');
                log('错误信息:', errorMessage);
                vscode.window.showErrorMessage(`提取失败: ${errorMessage}`);
            }
        });
    });
    context.subscriptions.push(extractCoreCommand);
    // ========== 注册 LSP 功能命令 ==========
    /**
     * 跳转到定义 - 在新编辑器中打开定义文件并定位到具体行
     */
    context.subscriptions.push(vscode.commands.registerCommand('javaExtractor.goToDefinition', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在 Java 文件中使用此功能');
            return;
        }
        const position = editor.selection.active;
        log(`[goToDefinition] 查找定义: ${editor.document.uri.fsPath}:${position.line + 1}:${position.character + 1}`);
        try {
            const locations = await (0, lspFeatures_1.goToDefinition)(editor.document.uri, position);
            if (locations.length === 0) {
                vscode.window.showInformationMessage('未找到定义');
                return;
            }
            // 直接跳转（单个结果）或显示选择列表（多个结果）
            if (locations.length === 1) {
                const loc = locations[0];
                const doc = await vscode.workspace.openTextDocument(loc.uri);
                await vscode.window.showTextDocument(doc, {
                    selection: loc.range,
                    preview: false,
                });
            }
            else {
                const items = locations.map(loc => ({
                    label: `$(go-to-file) ${vscode.workspace.asRelativePath(loc.uri)}`,
                    description: `Line ${loc.range.start.line + 1}`,
                    location: loc,
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `找到 ${locations.length} 个定义，选择跳转`,
                });
                if (selected) {
                    const doc = await vscode.workspace.openTextDocument(selected.location.uri);
                    await vscode.window.showTextDocument(doc, {
                        selection: selected.location.range,
                        preview: false,
                    });
                }
            }
        }
        catch (error) {
            log('[goToDefinition] 错误:', error.message);
            vscode.window.showErrorMessage(`获取定义失败: ${error.message}`);
        }
    }));
    /**
     * 查找所有引用 - 在输出通道中列出所有引用位置
     */
    context.subscriptions.push(vscode.commands.registerCommand('javaExtractor.findReferences', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在 Java 文件中使用此功能');
            return;
        }
        const position = editor.selection.active;
        log(`[findReferences] 查找引用: ${editor.document.uri.fsPath}:${position.line + 1}:${position.character + 1}`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在查找引用...',
            cancellable: false,
        }, async () => {
            try {
                const locations = await (0, lspFeatures_1.findReferences)(editor.document.uri, position, true);
                if (locations.length === 0) {
                    vscode.window.showInformationMessage('未找到引用');
                    return;
                }
                const outputChannel = getOutputChannel();
                outputChannel.clear();
                outputChannel.appendLine(`===== 引用查找结果 (共 ${locations.length} 处) =====`);
                outputChannel.appendLine(`光标位置: ${editor.document.uri.fsPath}:${position.line + 1}`);
                outputChannel.appendLine('');
                const lines = (0, lspFeatures_1.formatLocations)(locations);
                lines.forEach((line, i) => outputChannel.appendLine(`[${i + 1}] ${line}`));
                outputChannel.show(true);
                vscode.window.showInformationMessage(`找到 ${locations.length} 处引用，已输出到 Output 面板`);
            }
            catch (error) {
                log('[findReferences] 错误:', error.message);
                vscode.window.showErrorMessage(`查找引用失败: ${error.message}`);
            }
        });
    }));
    /**
     * 显示文件符号列表 - 在 QuickPick 中展示，支持点击跳转
     */
    context.subscriptions.push(vscode.commands.registerCommand('javaExtractor.showSymbols', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在 Java 文件中使用此功能');
            return;
        }
        log(`[showSymbols] 获取符号: ${editor.document.uri.fsPath}`);
        try {
            const symbols = await (0, lspFeatures_1.getDocumentSymbols)(editor.document.uri);
            if (symbols.length === 0) {
                vscode.window.showInformationMessage('未找到符号');
                return;
            }
            const flat = (0, lspFeatures_1.flattenSymbols)(symbols);
            const items = flat.map(sym => ({
                label: `$(symbol-${sym.kind.toLowerCase()}) ${sym.name}`,
                description: sym.detail || '',
                detail: `${sym.kind}  Line ${sym.line}${sym.parent ? `  (in ${sym.parent})` : ''}`,
                sym,
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `${editor.document.fileName.split(/[\\/]/).pop()} 中共 ${flat.length} 个符号，选择跳转`,
                matchOnDescription: true,
                matchOnDetail: true,
            });
            if (selected) {
                const range = symbols.find(function findRange(s) {
                    if (s.name === selected.sym.name && s.range.start.line === selected.sym.line - 1) {
                        return s.range;
                    }
                    for (const c of s.children || []) {
                        const r = findRange(c);
                        if (r)
                            return r;
                    }
                    return undefined;
                })?.range;
                const targetLine = selected.sym.line - 1;
                const targetRange = new vscode.Range(targetLine, 0, targetLine, 0);
                await vscode.window.showTextDocument(editor.document, {
                    selection: targetRange,
                    preview: false,
                });
            }
        }
        catch (error) {
            log('[showSymbols] 错误:', error.message);
            vscode.window.showErrorMessage(`获取符号失败: ${error.message}`);
        }
    }));
    /**
     * 查找接口/抽象方法的实现 - 在 QuickPick 中展示，支持点击跳转
     */
    context.subscriptions.push(vscode.commands.registerCommand('javaExtractor.findImplementations', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在 Java 文件中使用此功能');
            return;
        }
        const position = editor.selection.active;
        log(`[findImplementations] 查找实现: ${editor.document.uri.fsPath}:${position.line + 1}:${position.character + 1}`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在查找实现...',
            cancellable: false,
        }, async () => {
            try {
                const locations = await (0, lspFeatures_1.findImplementations)(editor.document.uri, position);
                if (locations.length === 0) {
                    vscode.window.showInformationMessage('未找到实现（可能不是接口或抽象方法）');
                    return;
                }
                if (locations.length === 1) {
                    const loc = locations[0];
                    const doc = await vscode.workspace.openTextDocument(loc.uri);
                    await vscode.window.showTextDocument(doc, { selection: loc.range, preview: false });
                }
                else {
                    const items = locations.map(loc => ({
                        label: `$(symbol-class) ${vscode.workspace.asRelativePath(loc.uri)}`,
                        description: `Line ${loc.range.start.line + 1}`,
                        location: loc,
                    }));
                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: `找到 ${locations.length} 个实现，选择跳转`,
                    });
                    if (selected) {
                        const doc = await vscode.workspace.openTextDocument(selected.location.uri);
                        await vscode.window.showTextDocument(doc, { selection: selected.location.range, preview: false });
                    }
                }
            }
            catch (error) {
                log('[findImplementations] 错误:', error.message);
                vscode.window.showErrorMessage(`查找实现失败: ${error.message}`);
            }
        });
    }));
    /**
     * 显示悬停信息 - 在输出通道中展示类型信息和 Javadoc
     */
    context.subscriptions.push(vscode.commands.registerCommand('javaExtractor.showHover', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showErrorMessage('请在 Java 文件中使用此功能');
            return;
        }
        const position = editor.selection.active;
        log(`[showHover] 获取悬停信息: ${editor.document.uri.fsPath}:${position.line + 1}:${position.character + 1}`);
        try {
            const hover = await (0, lspFeatures_1.getHoverInfo)(editor.document.uri, position);
            if (!hover) {
                vscode.window.showInformationMessage('未找到悬停信息（请将光标放在符号上）');
                return;
            }
            const text = (0, lspFeatures_1.hoverToText)(hover);
            const outputChannel = getOutputChannel();
            outputChannel.clear();
            outputChannel.appendLine('===== Hover 信息 =====');
            outputChannel.appendLine(`位置: ${editor.document.uri.fsPath}:${position.line + 1}:${position.character + 1}`);
            outputChannel.appendLine('');
            outputChannel.appendLine(text);
            outputChannel.show(true);
        }
        catch (error) {
            log('[showHover] 错误:', error.message);
            vscode.window.showErrorMessage(`获取悬停信息失败: ${error.message}`);
        }
    }));
    // 注册状态栏项
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(symbol-method) Extract Call Chain';
    statusBarItem.tooltip = 'Extract Java method call chain for AI context';
    statusBarItem.command = 'javaExtractor.extractCallChain';
    context.subscriptions.push(statusBarItem);
    // 当活动编辑器是Java文件时显示状态栏
    const updateStatusBar = () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'java') {
            statusBarItem.show();
        }
        else {
            statusBarItem.hide();
        }
    };
    // 监听编辑器变化
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar, null, context.subscriptions);
    updateStatusBar();
}
/**
 * 扩展停用
 */
function deactivate() {
    console.log('Java Call Chain Extractor 已停用');
}
//# sourceMappingURL=extension.js.map