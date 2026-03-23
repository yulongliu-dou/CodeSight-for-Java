import * as vscode from 'vscode';
import { ExtractedMethod } from './types';
import { log } from './extension';

/**
 * 提取过滤配置
 */
export interface ExtractionFilter {
  excludePatterns: string[];      // 文件路径排除模式
  excludeClassPatterns: string[]; // 类名排除模式
  excludeMethodPatterns: string[]; // 方法名排除模式
  coreOnly: boolean;              // 是否只保留核心调用链
}

/**
 * 默认过滤配置（完整模式）
 */
export const DEFAULT_FILTER: ExtractionFilter = {
  excludePatterns: [],
  excludeClassPatterns: [],
  excludeMethodPatterns: [],
  coreOnly: false
};

/**
 * 核心模式过滤配置
 */
export const CORE_FILTER: ExtractionFilter = {
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
export class CallChainExtractor {
  private visited = new Set<string>();
  private results: ExtractedMethod[] = [];
  private maxDepth: number;
  private filter: ExtractionFilter;

  constructor(maxDepth: number = 10, filter: ExtractionFilter = DEFAULT_FILTER) {
    this.maxDepth = maxDepth;
    this.filter = filter;
  }

  /**
   * 从指定位置提取调用链
   * @param document 文档对象
   * @param position 光标位置
   * @returns 提取的方法列表
   */
  async extract(document: vscode.TextDocument, position: vscode.Position): Promise<ExtractedMethod[]> {
    this.visited.clear();
    this.results = [];

    log('[Extractor] 准备调用 vscode.prepareCallHierarchy...');
    log('[Extractor] URI:', document.uri.toString());
    log('[Extractor] Position:', { line: position.line, character: position.character });

    // 1. 准备调用层级入口
    const startTime = Date.now();
    let items: vscode.CallHierarchyItem[] | undefined;
    
    try {
      items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        document.uri,
        position
      );
      log(`[Extractor] prepareCallHierarchy 耗时: ${Date.now() - startTime}ms`);
    } catch (e) {
      log('[Extractor] prepareCallHierarchy 调用失败:', e);
      throw new Error(`调用 prepareCallHierarchy 失败: ${e}`);
    }

    if (!items || items.length === 0) {
      log('[Extractor] prepareCallHierarchy 返回空结果');
      throw new Error('无法在当前位置找到方法定义，请将光标放在方法名上');
    }

    log(`[Extractor] prepareCallHierarchy 返回 ${items.length} 个入口点`);
    items.forEach((item, i) => {
      log(`[Extractor]   [${i}] ${item.name} - ${item.kind} @ ${item.uri.fsPath}:${item.range.start.line + 1}`);
    });

    // 2. 递归提取
    log('[Extractor] 开始递归提取调用链...');
    await this.collectOutgoingCalls(items[0], 0);
    
    log(`[Extractor] 递归提取完成, 共 ${this.results.length} 个方法`);
    return this.results;
  }

  /**
   * 递归收集出向调用
   */
  private async collectOutgoingCalls(item: vscode.CallHierarchyItem, depth: number): Promise<void> {
    const indent = '  '.repeat(depth);
    log(`${indent}[Depth ${depth}] 处理: ${item.name}`);

    // 深度限制
    if (depth > this.maxDepth) {
      log(`${indent}[Depth ${depth}] 达到最大深度限制 (${this.maxDepth}), 跳过`);
      return;
    }

    // 生成唯一键防止循环
    const key = `${item.uri.toString()}#${item.name}#${item.range.start.line}`;
    if (this.visited.has(key)) {
      log(`${indent}[Depth ${depth}] 已访问过, 跳过`);
      return;
    }
    this.visited.add(key);

    // 过滤JDK和第三方库 (通过URI scheme判断)
    const uriStr = item.uri.toString();
    if (this.shouldFilter(uriStr)) {
      log(`${indent}[Depth ${depth}] 过滤掉 (JDK/第三方库): ${uriStr.substring(0, 100)}...`);
      return;
    }

    // 应用自定义过滤规则
    if (this.shouldFilterByCustomRules(item)) {
      log(`${indent}[Depth ${depth}] 过滤掉 (自定义规则): ${item.name}`);
      return;
    }

    // 提取方法信息
    log(`${indent}[Depth ${depth}] 提取方法信息...`);
    const method = await this.extractMethodInfo(item);
    this.results.push(method);
    log(`${indent}[Depth ${depth}] 已添加: ${method.className}.${method.methodName}`);

    // 递归获取出向调用
    log(`${indent}[Depth ${depth}] 获取出向调用...`);
    try {
      const startTime = Date.now();
      const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
        'vscode.provideOutgoingCalls',
        item
      );
      log(`${indent}[Depth ${depth}] provideOutgoingCalls 耗时: ${Date.now() - startTime}ms`);

      if (outgoing && outgoing.length > 0) {
        log(`${indent}[Depth ${depth}] 找到 ${outgoing.length} 个出向调用`);
        for (const call of outgoing) {
          log(`${indent}[Depth ${depth}]   -> ${call.to.name} @ ${call.to.uri.fsPath.split(/[/\\]/).pop()}:${call.to.range.start.line + 1}`);
          await this.collectOutgoingCalls(call.to, depth + 1);
        }
      } else {
        log(`${indent}[Depth ${depth}] 没有出向调用 (叶子节点)`);
      }
    } catch (e) {
      // 出向调用获取失败时记录并继续
      log(`${indent}[Depth ${depth}] 获取出向调用失败: ${e}`);
    }
  }

  /**
   * 判断是否应该过滤该URI (JDK/第三方库)
   */
  private shouldFilter(uriStr: string): boolean {
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
  private shouldFilterByCustomRules(item: vscode.CallHierarchyItem): boolean {
    const filePath = item.uri.fsPath;
    const methodName = item.name;
    const className = this.extractClassName(item);

    // 检查文件路径排除模式
    for (const pattern of this.filter.excludePatterns) {
      if (this.matchPattern(filePath, pattern)) {
        log(`[Filter] 文件路径匹配排除模式: ${pattern}`);
        return true;
      }
    }

    // 检查类名排除模式
    for (const pattern of this.filter.excludeClassPatterns) {
      if (this.matchPattern(className, pattern)) {
        log(`[Filter] 类名匹配排除模式: ${className} ~ ${pattern}`);
        return true;
      }
    }

    // 检查方法名排除模式
    for (const pattern of this.filter.excludeMethodPatterns) {
      if (this.matchPattern(methodName, pattern)) {
        log(`[Filter] 方法名匹配排除模式: ${methodName} ~ ${pattern}`);
        return true;
      }
    }

    return false;
  }

  /**
   * 简单的通配符模式匹配
   * 支持 * 匹配任意字符，** 匹配任意路径
   */
  private matchPattern(text: string, pattern: string): boolean {
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
  private async extractMethodInfo(item: vscode.CallHierarchyItem): Promise<ExtractedMethod> {
    log(`[extractMethodInfo] 读取文档: ${item.uri.fsPath}`);
    const document = await vscode.workspace.openTextDocument(item.uri);
    const sourceCode = document.getText(item.range);
    log(`[extractMethodInfo] 方法代码长度: ${sourceCode.length} 字符`);

    // 检测是否为接口/抽象方法
    const isInterface = item.kind === vscode.SymbolKind.Interface;
    const isAbstract = this.checkIsAbstract(sourceCode);

    let implementations: string[] | undefined;

    // 多态处理：如果是接口或抽象方法，获取实现类
    if (isInterface || isAbstract) {
      log(`[extractMethodInfo] 检测到接口/抽象方法，查找实现类...`);
      implementations = await this.findImplementations(item);
      log(`[extractMethodInfo] 找到 ${implementations?.length || 0} 个实现类`);
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
  private checkIsAbstract(sourceCode: string): boolean {
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
  private async findImplementations(item: vscode.CallHierarchyItem): Promise<string[]> {
    try {
      log(`[findImplementations] 调用 executeImplementationProvider...`);
      const startTime = Date.now();
      const implementations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeImplementationProvider',
        item.uri,
        item.selectionRange.start
      );
      log(`[findImplementations] executeImplementationProvider 耗时: ${Date.now() - startTime}ms`);

      if (implementations && implementations.length > 0) {
        log(`[findImplementations] 找到 ${implementations.length} 个实现`);
        return implementations
          .map(impl => {
            // 处理 Location 和 LocationLink 两种类型
            const uri = 'targetUri' in impl ? impl.targetUri : impl.uri;
            return uri;
          })
          .filter(uri => !uri.toString().startsWith('jdt://'))
          .map(uri => uri.fsPath);
      }
      log(`[findImplementations] 没有找到实现`);
    } catch (e) {
      // 实现查找失败时静默处理
      log(`[findImplementations] 查找失败: ${e}`);
    }
    return [];
  }

  /**
   * 从CallHierarchyItem提取类名
   */
  private extractClassName(item: vscode.CallHierarchyItem): string {
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
