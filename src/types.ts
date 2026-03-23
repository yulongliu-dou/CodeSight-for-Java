import * as vscode from 'vscode';

/**
 * 提取的方法信息
 */
export interface ExtractedMethod {
  /** 文件URI */
  uri: string;
  /** 类全限定名 */
  className: string;
  /** 方法名 */
  methodName: string;
  /** 方法签名 */
  signature: string;
  /** 代码范围 */
  range: vscode.Range;
  /** 是否为接口方法 */
  isInterface: boolean;
  /** 是否为抽象方法 */
  isAbstract: boolean;
  /** 实现类全路径列表 (多态标记) */
  implementations?: string[];
  /** 提取的源代码 */
  sourceCode?: string;
}

/**
 * 提取结果
 */
export interface ExtractionResult {
  /** 入口方法签名 */
  entryPoint: string;
  /** 所有相关方法 */
  methods: ExtractedMethod[];
  /** 使用到的成员变量 */
  fields: FieldInfo[];
  /** 按文件分组的import语句 */
  imports: Map<string, string[]>;
  /** 提取时间 */
  timestamp: string;
}

/**
 * 字段信息
 */
export interface FieldInfo {
  /** 文件URI */
  uri: string;
  /** 类名 */
  className: string;
  /** 字段名 */
  fieldName: string;
  /** 字段类型 */
  fieldType: string;
  /** 源代码 */
  sourceCode: string;
}
