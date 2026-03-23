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
exports.goToDefinition = goToDefinition;
exports.findReferences = findReferences;
exports.getDocumentSymbols = getDocumentSymbols;
exports.flattenSymbols = flattenSymbols;
exports.findImplementations = findImplementations;
exports.getHoverInfo = getHoverInfo;
exports.hoverToText = hoverToText;
exports.formatLocations = formatLocations;
const vscode = __importStar(require("vscode"));
/**
 * LSP Features - 封装 VS Code 内置 LSP 命令
 * 对应 jdt-lsp-cli 中的 definition / references / symbols / implementations / hover
 */
// SymbolKind 名称映射
const SYMBOL_KIND_NAMES = {
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
function formatLocation(uri, range) {
    const relativePath = vscode.workspace.asRelativePath(uri);
    return `${relativePath}:${range.start.line + 1}:${range.start.character + 1}`;
}
/**
 * 跳转到定义
 * 对应 jls def <file> <line> <col>
 */
async function goToDefinition(uri, position) {
    const locations = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, position);
    return locations || [];
}
/**
 * 查找所有引用
 * 对应 jls refs <file> <line> <col>
 */
async function findReferences(uri, position, includeDeclaration = true) {
    const locations = await vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, position, { includeDeclaration });
    return locations || [];
}
/**
 * 获取文档符号列表（类、方法、字段等）
 * 对应 jls sym <file> --flat
 */
async function getDocumentSymbols(uri) {
    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
    return symbols || [];
}
/**
 * 扁平化符号树
 */
function flattenSymbols(symbols, parent) {
    const result = [];
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
async function findImplementations(uri, position) {
    const locations = await vscode.commands.executeCommand('vscode.executeImplementationProvider', uri, position);
    return locations || [];
}
/**
 * 获取悬停信息（类型、文档注释）
 * 对应 jls hover <file> <line> <col>
 */
async function getHoverInfo(uri, position) {
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, position);
    return hovers && hovers.length > 0 ? hovers[0] : null;
}
/**
 * 将 Hover 内容转为纯文本
 */
function hoverToText(hover) {
    return hover.contents
        .map(c => {
        if (typeof c === 'string')
            return c;
        if (c instanceof vscode.MarkdownString)
            return c.value;
        // MarkedString { language, value }
        return c.value || String(c);
    })
        .join('\n\n');
}
/**
 * 将 Location[] 格式化为可读的输出行列表
 */
function formatLocations(locations) {
    return locations.map(loc => formatLocation(loc.uri, loc.range));
}
//# sourceMappingURL=lspFeatures.js.map