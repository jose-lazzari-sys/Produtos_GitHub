import { NFCeItem, NFCeReceipt } from '../types';
import { generateUniqueId, parseDateToTimestamp } from './storage';
import { classifyProduct, normalizeTipo, normalizeProduto, normalizeText, learnItemClassification, getDetalheForTipoProduto, CATEGORY_RULES } from './classifier';

/**
 * Fixes common UTF-8 / ISO-8859-1 mojibake characters in Brazilian Portuguese text
 */
export function fixMojibake(text: string): string {
  if (!text) return '';
  return text
    .replace(/Descri[^\s;,\t]+/gi, 'Descrição')
    .replace(/Raz[^\s;,\t]+/gi, 'Razão')
    .replace(/C[^\s;,\t]+digo/gi, 'Código')
    .replace(/Alimenta[^\s;,\t]+/gi, 'Alimentação')
    .replace(/a[^\s;,\t]*ougue/gi, 'Açougue')
    .replace(/latic[^\s;,\t]+nios/gi, 'Laticínios')
    .replace(/hortifr[^\s;,\t]+ti/gi, 'Hortifrúti')
    .replace(/Dom[^\s;,\t]+stica/gi, 'Doméstica')
    .replace(/descart[^\s;,\t]+veis/gi, 'Descartáveis')
    .replace(/acess[^\s;,\t]+rios/gi, 'Acessórios')
    .replace(/[^\s;,\t]*ntima/gi, 'Íntima')
    .replace(/pap[^\s;,\t]+is/gi, 'Papéis')
    .replace(/Farm[^\s;,\t]+cia/gi, 'Farmácia')
    .replace(/\ufffd/g, '');
}

/**
 * Normalizes Brazilian decimal format (e.g. "1.597,50" or "37,05" or "1.862") to JavaScript float
 */
export function parseBRLNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str) return 0;

  // Handle thousand separators like 1.597,50
  if (str.includes('.') && str.includes(',')) {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  // Handle comma as decimal like 37,05
  if (str.includes(',')) {
    const cleaned = str.replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Parses raw CSV text into a 2D matrix of strings taking quoted multiline cells into account
 */
export function parseCsvToMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  // Determine delimiter (; or , or \t)
  let delimiter = ';';
  const firstLineEnd = csvText.indexOf('\n');
  const sample = firstLineEnd !== -1 ? csvText.slice(0, firstLineEnd) : csvText;
  const semiCount = (sample.match(/;/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  if (tabCount > semiCount && tabCount > commaCount) delimiter = '\t';
  else if (commaCount > semiCount) delimiter = ',';

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses 2D matrix rows (from Excel sheet or CSV) containing NFC-e items
 */
export function parseMatrixData(
  rawRows: (string | number | null | undefined)[][],
  existingItems: NFCeItem[] = [],
  existingReceipts: NFCeReceipt[] = []
): {
  success: boolean;
  items: NFCeItem[];
  receipts: NFCeReceipt[];
  error?: string;
  totalParsed: number;
  newItemsCount: number;
} {
  if (!rawRows || rawRows.length === 0) {
    return { success: false, items: existingItems, receipts: existingReceipts, error: 'A planilha está vazia.', totalParsed: 0, newItemsCount: 0 };
  }

  // Sanitize all cell strings (replace internal line breaks with spaces)
  const rows: string[][] = rawRows
    .map(row => (row || []).map(cell => fixMojibake(String(cell ?? '').replace(/[\r\n]+/g, ' ').trim())))
    .filter(row => row.some(cell => cell.length > 0));

  if (rows.length === 0) {
    return { success: false, items: existingItems, receipts: existingReceipts, error: 'Nenhuma linha com dados encontrada.', totalParsed: 0, newItemsCount: 0 };
  }

  // Find header row by checking the first 10 rows
  let headerRowIndex = 0;
  let isHeader = false;
  let headerCols: string[] = [];

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const candidateCols = rows[r].map(col => col.toLowerCase().trim());
    const matchCount = candidateCols.filter(col => 
      col.includes('descri') || 
      col.includes('prod') || 
      col.includes('item') ||
      col.includes('valor') || 
      col.includes('total') ||
      col.includes('social') || 
      col.includes('razao') ||
      col.includes('razão') ||
      col.includes('data') ||
      col.includes('emiss') ||
      col.includes('num') ||
      col.includes('unid') ||
      col.includes('qtd') ||
      col.includes('tipo') ||
      col.includes('categ')
    ).length;

    if (matchCount >= 2 || candidateCols.some(c => c.includes('descri') || c.includes('produto / item'))) {
      headerRowIndex = r;
      isHeader = true;
      headerCols = candidateCols;
      break;
    }
  }

  if (!isHeader && rows.length > 0) {
    headerCols = rows[0].map(col => col.toLowerCase().trim());
  }

  const dataRows = isHeader ? rows.slice(headerRowIndex + 1) : rows;

  // Header column index mappings (initialize to -1)
  let idxNum = -1;
  let idxDesc = -1;
  let idxQtd = -1;
  let idxUnidade = -1;
  let idxValor = -1;
  let idxRazao = -1;
  let idxData = -1;
  let idxPrecoKg = -1;
  let idxPesoKg = -1;
  let idxCodigo = -1;
  let idxAnoMes = -1;
  let idxTipo = -1;
  let idxProduto = -1;
  let idxDetalhe = -1;

  if (isHeader) {
    headerCols.forEach((col, idx) => {
      const c = col.toLowerCase().trim();
      if ((c.includes('num') || c === 'item' || c === 'nº' || c === 'seq' || c.startsWith('1.')) && !c.includes('nota') && idxNum === -1) {
        idxNum = idx;
      } else if ((c.includes('descri') || c.includes('produto / item') || c.includes('mercadoria') || c.includes('artigo') || c.includes('discrimina') || c === 'nome' || c === 'descricao') && idxDesc === -1) {
        idxDesc = idx;
      } else if ((c.includes('unidade') || c.includes('unid') || c.includes('comercial') || c.includes('und') || c === 'un') && idxUnidade === -1) {
        idxUnidade = idx;
      } else if ((c.startsWith('qtd') || c.includes('quant') || c === 'qte' || c === 'quantidade') && idxQtd === -1) {
        idxQtd = idx;
      } else if ((c.includes('valor') || c.includes('total') || c.includes('r$')) && !c.includes('r$/kg') && !c.includes('r$ / kg') && !c.includes('unit') && idxValor === -1) {
        idxValor = idx;
      } else if ((c.includes('raz') || c.includes('estab') || c.includes('loja') || c.includes('supermercado') || c.includes('fornecedor') || c.includes('empresa')) && idxRazao === -1) {
        idxRazao = idx;
      } else if ((c.includes('data') || c.includes('emiss')) && idxData === -1) {
        idxData = idx;
      } else if ((c.includes('r$/kg') || c.includes('r$ / kg') || c.includes('preco/kg') || c.includes('preço/kg') || c.includes('unitario') || c.includes('unitário') || c.includes('vlr unit')) && idxPrecoKg === -1) {
        idxPrecoKg = idx;
      } else if ((c.includes('peso') || c.includes('calculado') || c.includes('kg') || c.includes('peso liq')) && idxPesoKg === -1) {
        idxPesoKg = idx;
      } else if ((c.includes('cod') || c.includes('código')) && idxCodigo === -1) {
        idxCodigo = idx;
      } else if ((c.includes('ano-m') || c.includes('anomes') || c.includes('mes')) && idxAnoMes === -1) {
        idxAnoMes = idx;
      } else if ((c.includes('tipo') || c.includes('categoria') || c.includes('departamento') || c.includes('secao') || c.includes('seção') || c.includes('grupo') || c.includes('setor')) && idxTipo === -1) {
        idxTipo = idx;
      } else if ((c.includes('subtipo') || c.includes('subcategoria') || c.includes('sub-categoria') || c.includes('subgrupo') || (c.includes('produto') && !c.includes('descri') && !c.includes('item'))) && idxProduto === -1) {
        idxProduto = idx;
      } else if ((c.includes('detalhe') || c.includes('obs') || c.includes('observa') || c.includes('especifica')) && idxDetalhe === -1) {
        idxDetalhe = idx;
      }
    });
  }

  // Fallbacks if indices not found from headers
  if (idxNum === -1) idxNum = 0;
  if (idxDesc === -1) idxDesc = 1;
  if (idxUnidade === -1 && idxQtd === -1) idxUnidade = 2;
  if (idxValor === -1) idxValor = 3;
  if (idxRazao === -1) idxRazao = 4;
  if (idxData === -1) idxData = 5;
  if (idxPrecoKg === -1) idxPrecoKg = 6;
  if (idxPesoKg === -1) idxPesoKg = 7;
  if (idxTipo === -1) idxTipo = 8;
  if (idxProduto === -1) idxProduto = 9;

  // Build existing receipts map and existing item signatures
  const receiptsMap = new Map<string, NFCeReceipt>();
  existingReceipts.forEach(rcpt => {
    const key = `${rcpt.data}___${rcpt.razaoSocial}`;
    receiptsMap.set(key, { ...rcpt, itens: [...(rcpt.itens || [])] });
  });

  const existingItemSignatures = new Set<string>();
  existingItems.forEach(it => {
    const sig = `${it.data}___${it.razaoSocial}___${it.num}___${it.descricao.trim().toLowerCase()}___${it.valorTotal}`;
    existingItemSignatures.add(sig);
  });

  const newlyAddedItems: NFCeItem[] = [];

  dataRows.forEach((cols) => {
    if (!cols || cols.length < 2) return;

    const descricao = (idxDesc !== -1 && cols[idxDesc] !== undefined ? cols[idxDesc] : cols[1]) || '';
    if (!descricao || !descricao.trim()) return;

    const razaoSocial = (idxRazao !== -1 && cols[idxRazao]) ? cols[idxRazao].trim() : 'SENDAS DISTRIBUIDORA S/A';
    const dataStr = (idxData !== -1 && cols[idxData]) ? cols[idxData].trim() : new Date().toLocaleString('pt-BR');

    // Parse Unidade Comercial / Qtd
    let qtd = 1;
    let unidade = 'UN';

    if (idxQtd !== -1 && cols[idxQtd]) {
      const q = parseBRLNumber(cols[idxQtd]);
      if (q > 0) qtd = q;
    }

    if (idxUnidade !== -1 && cols[idxUnidade]) {
      const rawUnidade = cols[idxUnidade].trim();
      const matchQtdUnit = rawUnidade.match(/^([\d.,]+)\s*([A-Za-z]+)?$/);
      if (matchQtdUnit && matchQtdUnit[1] && idxQtd === -1) {
        const q = parseBRLNumber(matchQtdUnit[1]);
        if (q > 0) qtd = q;
        if (matchQtdUnit[2]) unidade = matchQtdUnit[2].toUpperCase();
      } else if (rawUnidade) {
        unidade = rawUnidade.toUpperCase();
      }
    }

    const valorTotal = idxValor !== -1 && cols[idxValor] ? parseBRLNumber(cols[idxValor]) : 0;
    const precoPorKg = idxPrecoKg !== -1 && cols[idxPrecoKg] ? parseBRLNumber(cols[idxPrecoKg]) : undefined;
    const pesoKg = idxPesoKg !== -1 && cols[idxPesoKg] ? parseBRLNumber(cols[idxPesoKg]) : (unidade.toUpperCase() === 'KG' ? qtd : undefined);

    let rawTipo = (idxTipo !== -1 && cols[idxTipo]) ? cols[idxTipo].trim() : '';
    let rawProduto = (idxProduto !== -1 && cols[idxProduto]) ? cols[idxProduto].trim() : '';
    let rawDetalhe = (idxDetalhe !== -1 && cols[idxDetalhe]) ? cols[idxDetalhe].trim() : '';

    // Direct User-defined routines:
    // 1. Validate TIPO directly
    let tipo = normalizeTipo(rawTipo);

    // 2. Validate PRODUTO directly against the returned TIPO
    let produto = normalizeProduto(rawProduto, tipo);

    // 3. Fallback to learned historical memory ONLY if not provided in sheet or resulted in Outros
    let detalhe = rawDetalhe;
    if (tipo === 'Outros' && (!rawTipo || normalizeText(rawTipo) === 'outros')) {
      const autoClass = classifyProduct(descricao, existingItems);
      if (autoClass.tipo !== 'Outros') {
        tipo = autoClass.tipo as any;
        produto = autoClass.produto;
        detalhe = autoClass.detalhe;
      }
    }

    // 4. Fill missing detail automatically from (tipo, produto) lookup
    if (!detalhe || detalhe === 'Outros') {
      detalhe = getDetalheForTipoProduto(tipo, produto);
    }

    // Auto-learn this classification for future items and QR scans
    if (tipo !== 'Outros' && produto !== 'Outros') {
      learnItemClassification(descricao, tipo, produto, detalhe);
    }

    // Generate stable receipt grouping key based on date and store name
    const receiptKey = `${dataStr}___${razaoSocial}`;
    let receipt = receiptsMap.get(receiptKey);

    if (!receipt) {
      const rcptId = generateUniqueId('rcpt');
      receipt = {
        id: rcptId,
        razaoSocial,
        data: dataStr,
        valorTotal: 0,
        itens: [],
        scannedAt: new Date(parseDateToTimestamp(dataStr) || Date.now()).toISOString(),
        conferido: '-'
      };
      receiptsMap.set(receiptKey, receipt);
    }

    // Parse exact item sequence number from sheet/CSV (e.g. 1..12)
    let itemNum = receipt.itens.length + 1;
    if (idxNum !== -1 && cols[idxNum]) {
      const parsedNum = parseInt(cols[idxNum], 10);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        itemNum = parsedNum;
      }
    }

    // Check duplicate
    const signature = `${dataStr}___${razaoSocial}___${itemNum}___${descricao.trim().toLowerCase()}___${valorTotal}`;
    if (existingItemSignatures.has(signature)) {
      return; // Skip duplicate item to avoid duplicating upon re-import
    }
    existingItemSignatures.add(signature);

    const valorUnitario = qtd > 0 && valorTotal > 0 ? Number((valorTotal / qtd).toFixed(4)) : valorTotal;

    const item: NFCeItem = {
      id: generateUniqueId('item'),
      receiptId: receipt.id,
      num: itemNum,
      descricao,
      qtd,
      unidade,
      valorUnitario,
      valorTotal,
      razaoSocial,
      data: dataStr,
      precoPorKg: precoPorKg && precoPorKg > 0 ? precoPorKg : undefined,
      pesoKg: pesoKg && pesoKg > 0 ? pesoKg : undefined,
      tipo,
      produto,
      detalhe
    };

    receipt.itens.push(item);
    // Exact receipt total recalculated from all its items
    receipt.valorTotal = Number(receipt.itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0).toFixed(2));
    newlyAddedItems.push(item);
  });

  // Combine existing items and newly added items, PRESERVING each item's exact num!
  const finalItems = [...existingItems, ...newlyAddedItems];

  const finalReceipts = Array.from(receiptsMap.values()).map(rcpt => ({
    ...rcpt,
    // Ensure exact sum for all receipts
    valorTotal: Number((rcpt.itens || []).reduce((acc, it) => acc + (it.valorTotal || 0), 0).toFixed(2))
  })).sort((a, b) => {
    const timeA = parseDateToTimestamp(a.data) || parseDateToTimestamp(a.scannedAt);
    const timeB = parseDateToTimestamp(b.data) || parseDateToTimestamp(b.scannedAt);
    return timeB - timeA;
  });

  return {
    success: newlyAddedItems.length > 0 || (finalItems.length > 0 && dataRows.length === 0),
    items: finalItems,
    receipts: finalReceipts,
    totalParsed: dataRows.length,
    newItemsCount: newlyAddedItems.length
  };
}

/**
 * Parses raw CSV / TSV text containing NFC-e items and merges with existing ones if specified
 */
export function parseCsvData(csvText: string, existingItems: NFCeItem[] = [], existingReceipts: NFCeReceipt[] = []): {
  success: boolean;
  items: NFCeItem[];
  receipts: NFCeReceipt[];
  error?: string;
  totalParsed: number;
  newItemsCount: number;
} {
  if (!csvText || !csvText.trim()) {
    return { success: false, items: existingItems, receipts: existingReceipts, error: 'O conteúdo CSV está vazio.', totalParsed: 0, newItemsCount: 0 };
  }

  const matrix = parseCsvToMatrix(csvText);
  return parseMatrixData(matrix, existingItems, existingReceipts);
}

function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
