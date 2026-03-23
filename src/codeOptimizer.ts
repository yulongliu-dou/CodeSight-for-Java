import { ExtractedMethod, FieldInfo } from './types';

/**
 * 优化配置
 */
export interface OptimizationConfig {
  removeJavadoc: boolean;
  removeComments: boolean;
  removeAnnotations: boolean;
  compactImports: boolean;
  shortImplPaths: boolean;
  indentSize: number;
  compactMode: boolean;
}

/**
 * 代码优化器
 * 用于减少输出的token数量
 */
export class CodeOptimizer {
  private config: OptimizationConfig;

  constructor(config: OptimizationConfig) {
    this.config = config;
  }

  /**
   * 优化方法源代码
   */
  optimizeMethodSource(source: string, isEntryPoint: boolean = false): string {
    let result = source;

    // 紧凑模式：非入口方法只保留签名
    if (this.config.compactMode && !isEntryPoint) {
      result = this.extractSignatureOnly(result);
      return this.applyIndent(result);
    }

    // 移除 Javadoc 注释
    if (this.config.removeJavadoc) {
      result = this.removeJavadocComments(result);
    }

    // 移除行内注释
    if (this.config.removeComments) {
      result = this.removeInlineComments(result);
    }

    // 移除简单注解
    if (this.config.removeAnnotations) {
      result = this.removeSimpleAnnotations(result);
    }

    // 压缩空行
    result = this.compressBlankLines(result);

    // 应用缩进
    result = this.applyIndent(result);

    return result;
  }

  /**
   * 优化字段源代码
   */
  optimizeFieldSource(source: string): string {
    let result = source;

    if (this.config.removeJavadoc) {
      result = this.removeJavadocComments(result);
    }

    if (this.config.removeComments) {
      result = this.removeInlineComments(result);
    }

    return result.trim();
  }

  /**
   * 优化 import 语句
   */
  optimizeImports(imports: string[], methodSources: string[]): string[] {
    if (!this.config.compactImports) {
      return imports;
    }

    // 合并所有方法源代码用于检测使用的类
    const allSource = methodSources.join('\n');

    return imports.filter(imp => {
      // 提取 import 的类名
      const match = imp.match(/import\s+(?:static\s+)?[\w.]+\.(\w+);/);
      if (!match) return false;

      const className = match[1];
      // 检查类名是否在源代码中出现（使用词边界）
      const regex = new RegExp('\\b' + className + '\\b');
      return regex.test(allSource);
    });
  }

  /**
   * 优化实现类路径显示
   */
  optimizeImplPaths(paths: string[]): string[] {
    if (!this.config.shortImplPaths) {
      return paths;
    }

    return paths.map(path => {
      // 提取类名
      const match = path.match(/([^/\\]+)\.java$/);
      return match ? match[1] : path;
    });
  }

  /**
   * 只提取方法签名（用于紧凑模式）
   */
  private extractSignatureOnly(source: string): string {
    const lines = source.split('\n');
    const signatureLines: string[] = [];
    let braceCount = 0;
    let foundSignature = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过注释和空行
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed === '') {
        continue;
      }

      // 跳过注解行（在方法签名之前）
      if (trimmed.startsWith('@') && !foundSignature) {
        continue;
      }

      // 检测方法签名
      if (!foundSignature) {
        signatureLines.push(line);
        
        // 抽象方法或接口方法（以分号结尾）
        if (trimmed.endsWith(';')) {
          return signatureLines.join('\n');
        }

        // 方法体开始
        if (trimmed.includes('{')) {
          foundSignature = true;
          braceCount = (trimmed.match(/{/g) || []).length - (trimmed.match(/}/g) || []).length;
          
          // 如果同一行闭合，直接返回
          if (braceCount === 0) {
            return signatureLines.join('\n').replace(/\{[^}]*\}/, '{ /* ... */ }');
          }
        }
      } else {
        // 统计大括号以找到方法结束
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        
        if (braceCount === 0) {
          // 方法结束，返回签名 + 省略标记
          const signatureText = signatureLines.join('\n');
          // 找到第一个 { 的位置，替换方法体
          const braceIndex = signatureText.indexOf('{');
          if (braceIndex !== -1) {
            return signatureText.substring(0, braceIndex + 1) + ' /* ... */ }';
          }
          return signatureText + ' /* ... */ }';
        }
      }
    }

    return signatureLines.join('\n');
  }

  /**
   * 移除 Javadoc 注释
   */
  private removeJavadocComments(source: string): string {
    // 移除 /** ... */ 格式的注释
    return source.replace(/\/\*\*[\s\S]*?\*\//g, '');
  }

  /**
   * 移除行内注释和块注释
   */
  private removeInlineComments(source: string): string {
    // 移除 /* ... */ 注释（非 Javadoc）
    let result = source.replace(/\/\*(?!\*)[\s\S]*?\*\//g, '');
    // 移除 // 注释（但保留字符串中的 //）
    result = result.replace(/([^"'`])\/\/.*$/gm, '$1');
    return result;
  }

  /**
   * 移除简单注解（保留关键业务注解）
   */
  private removeSimpleAnnotations(source: string): string {
    // 要移除的注解列表
    const removeList = [
      '@Override',
      '@Deprecated',
      '@SuppressWarnings\\s*\\([^)]*\\)',
      '@FunctionalInterface',
      '@SafeVarargs'
    ];

    let result = source;
    for (const annotation of removeList) {
      const regex = new RegExp('^\\s*' + annotation + '\\s*$', 'gm');
      result = result.replace(regex, '');
    }

    return result;
  }

  /**
   * 压缩连续空行
   */
  private compressBlankLines(source: string): string {
    // 将多个连续空行压缩为单个空行
    return source.replace(/(\r?\n\s*){3,}/g, '\n\n');
  }

  /**
   * 应用缩进设置
   */
  private applyIndent(source: string): string {
    if (this.config.indentSize === 4) {
      return source; // 默认保持原样
    }

    const lines = source.split('\n');
    return lines.map(line => {
      // 计算当前行的前导空格数
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
      const indentLevel = Math.floor(leadingSpaces.length / 4);
      
      if (this.config.indentSize === 0) {
        // 完全移除缩进
        return line.trimStart();
      } else {
        // 替换为新的缩进
        const newIndent = ' '.repeat(indentLevel * this.config.indentSize);
        return newIndent + line.trimStart();
      }
    }).join('\n');
  }
}
