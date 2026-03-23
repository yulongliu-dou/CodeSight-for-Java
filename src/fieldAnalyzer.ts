import * as vscode from 'vscode';
import { ExtractedMethod, FieldInfo } from './types';

/**
 * 字段分析器
 * 分析提取的方法中使用到的成员变量
 */
export class FieldAnalyzer {

  /**
   * 分析方法中使用的字段
   * @param methods 提取的方法列表
   * @returns 使用到的字段信息
   */
  async analyzeUsedFields(methods: ExtractedMethod[]): Promise<FieldInfo[]> {
    const fields: FieldInfo[] = [];
    const processedClasses = new Set<string>();

    for (const method of methods) {
      // 每个类只处理一次
      if (processedClasses.has(method.uri)) {
        continue;
      }
      processedClasses.add(method.uri);

      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(method.uri));

        // 获取文档符号
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          document.uri
        );

        if (symbols) {
          const classFields = this.extractFieldsFromSymbols(symbols, document, method.className);
          // 过滤出方法体中实际使用的字段
          const usedFields = this.filterUsedFields(classFields, methods, method.uri);
          fields.push(...usedFields);
        }
      } catch (e) {
        console.warn(`分析字段失败: ${method.uri}`, e);
      }
    }

    return fields;
  }

  /**
   * 从文档符号中提取字段定义
   */
  private extractFieldsFromSymbols(
    symbols: vscode.DocumentSymbol[],
    document: vscode.TextDocument,
    parentClassName: string = ''
  ): FieldInfo[] {
    const fields: FieldInfo[] = [];

    for (const symbol of symbols) {
      // 处理类/接口符号
      if (symbol.kind === vscode.SymbolKind.Class ||
          symbol.kind === vscode.SymbolKind.Interface) {
        // 递归处理类的子符号
        if (symbol.children) {
          const classFields = this.extractFieldsFromClass(symbol, document);
          fields.push(...classFields);
        }
      }
    }

    return fields;
  }

  /**
   * 从类符号中提取字段
   */
  private extractFieldsFromClass(
    classSymbol: vscode.DocumentSymbol,
    document: vscode.TextDocument
  ): FieldInfo[] {
    const fields: FieldInfo[] = [];

    if (!classSymbol.children) {
      return fields;
    }

    for (const symbol of classSymbol.children) {
      if (symbol.kind === vscode.SymbolKind.Field ||
          symbol.kind === vscode.SymbolKind.Property) {
        const sourceCode = document.getText(symbol.range);
        fields.push({
          uri: document.uri.toString(),
          className: classSymbol.name,
          fieldName: symbol.name,
          fieldType: symbol.detail || this.extractFieldType(sourceCode),
          sourceCode: sourceCode.trim()
        });
      }

      // 递归处理内部类
      if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        fields.push(...this.extractFieldsFromClass(symbol, document));
      }
    }

    return fields;
  }

  /**
   * 从源代码中提取字段类型
   */
  private extractFieldType(sourceCode: string): string {
    // 简单正则匹配: private/public/protected Type fieldName
    const match = sourceCode.match(/(?:private|public|protected)?\s*(?:static\s+)?(?:final\s+)?(\w+(?:<[^>]+>)?)\s+\w+/);
    return match ? match[1] : '';
  }

  /**
   * 过滤出方法体中实际使用的字段
   */
  private filterUsedFields(
    allFields: FieldInfo[],
    methods: ExtractedMethod[],
    targetUri: string
  ): FieldInfo[] {
    // 收集该文件中所有方法的源代码
    const methodBodies = methods
      .filter(m => m.uri === targetUri)
      .map(m => m.sourceCode || '')
      .join('\n');

    return allFields.filter(field => {
      // 检查字段名是否在方法体中出现 (使用词边界匹配)
      // 避免匹配到方法名或局部变量
      const patterns = [
        `this\\.${field.fieldName}\\b`,  // this.fieldName
        `\\b${field.fieldName}\\s*=`,    // fieldName =
        `\\b${field.fieldName}\\s*[+\\-*/%]?=`, // fieldName += 等
        `[^.]\\b${field.fieldName}\\b(?!\\s*\\()` // 非方法调用的引用
      ];

      for (const pattern of patterns) {
        const regex = new RegExp(pattern);
        if (regex.test(methodBodies)) {
          return true;
        }
      }

      // 简单词边界匹配作为后备
      const simpleRegex = new RegExp(`\\b${this.escapeRegex(field.fieldName)}\\b`);
      return simpleRegex.test(methodBodies);
    });
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
