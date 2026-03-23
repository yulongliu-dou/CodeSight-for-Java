import * as vscode from 'vscode';

/**
 * LSP Features - 封装 VS Code 内置 LSP 命令
 * 对应 jdt-lsp-cli 中的 definition / references / symbols / implementations / hover
 */

// SymbolKind 名称映射
const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
  6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
  11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant',
  15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object',
  20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
  25: 'Operator', 26: 'TypeParameter',
};

/**
 * 格式化位置信息为可读字符串
 */
function formatLocation(uri: vscode.Uri, range: vscode.Range): string {
  const relativePath = vscode.workspace.asRelativePath(uri);
  return `${relativePath}:${range.start.line + 1}:${range.start.character + 1}`;
}

/**
 * 跳转到定义
 * 对应 jls def <file> <line> <col>
 */
export async function goToDefinition(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<vscode.Location[]> {
  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeDefinitionProvider',
    uri,
    position
  );
  return locations || [];
}

/**
 * 查找所有引用
 * 对应 jls refs <file> <line> <col>
 */
export async function findReferences(
  uri: vscode.Uri,
  position: vscode.Position,
  includeDeclaration: boolean = true
): Promise<vscode.Location[]> {
  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeReferenceProvider',
    uri,
    position,
    { includeDeclaration }
  );
  return locations || [];
}

/**
 * 获取文档符号列表（类、方法、字段等）
 * 对应 jls sym <file> --flat
 */
export async function getDocumentSymbols(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[]> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    uri
  );
  return symbols || [];
}

/**
 * 扁平化符号树
 */
export function flattenSymbols(
  symbols: vscode.DocumentSymbol[],
  parent?: string
): Array<{ name: string; kind: string; detail: string; line: number; parent?: string }> {
  const result: Array<{ name: string; kind: string; detail: string; line: number; parent?: string }> = [];
  for (const sym of symbols) {
    result.push({
      name: sym.name,
      kind: SYMBOL_KIND_NAMES[sym.kind] || String(sym.kind),
      detail: sym.detail || '',
      line: sym.range.start.line + 1,
      parent,
    });
    if (sym.children && sym.children.length > 0) {
      result.push(...flattenSymbols(sym.children, sym.name));
    }
  }
  return result;
}

/**
 * 查找接口/抽象方法的实现
 * 对应 jls impl <file> <line> <col>
 */
export async function findImplementations(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<vscode.Location[]> {
  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeImplementationProvider',
    uri,
    position
  );
  return locations || [];
}

/**
 * 获取悬停信息（类型、文档注释）
 * 对应 jls hover <file> <line> <col>
 */
export async function getHoverInfo(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    uri,
    position
  );
  return hovers && hovers.length > 0 ? hovers[0] : null;
}

/**
 * 将 Hover 内容转为纯文本
 */
export function hoverToText(hover: vscode.Hover): string {
  return hover.contents
    .map(c => {
      if (typeof c === 'string') return c;
      if (c instanceof vscode.MarkdownString) return c.value;
      // MarkedString { language, value }
      return (c as any).value || String(c);
    })
    .join('\n\n');
}

/**
 * 将 Location[] 格式化为可读的输出行列表
 */
export function formatLocations(locations: vscode.Location[]): string[] {
  return locations.map(loc => formatLocation(loc.uri, loc.range));
}
