import { NFCeItem, NFCeReceipt } from '../types';
import { generateUniqueId, parseDateToTimestamp } from './storage';
import { classifyProduct } from './classifier';

/**
 * Fixes common UTF-8 / ISO-8859-1 mojibake characters in Brazilian Portuguese text
 */
export function fixMojibake(text: string): string {
  if (!text) return '';
  return text
    .replace(/Descrio/gi, 'Descrição')
    .replace(/Descri\?+o/gi, 'Descrição')
    .replace(/Razo/gi, 'Razão')
    .replace(/Raz\?+o/gi, 'Razão')
    .replace(/Cdigo/gi, 'Código')
    .replace(/C\?+digo/gi, 'Código')
    .replace(/ms/gi, 'mês')
    .replace(/m\?+s/gi, 'mês')
    .replace(/Alimentao/gi, 'Alimentação')
    .replace(/Alimenta\?+o/gi, 'Alimentação')
    .replace(/aougue/gi, 'Açougue')
    .replace(/a\?+ougue/gi, 'Açougue')
    .replace(/laticnios/gi, 'Laticínios')
    .replace(/latic\?+nios/gi, 'Laticínios')
    .replace(/hortifrti/gi, 'Hortifrúti')
    .replace(/hortifr\?+ti/gi, 'Hortifrúti')
    .replace(/Domstica/gi, 'Doméstica')
    .replace(/Dom\?+stica/gi, 'Doméstica')
    .replace(/descartveis/gi, 'Descartáveis')
    .replace(/descart\?+veis/gi, 'Descartáveis')
    .replace(/acessrios/gi, 'Acessórios')
    .replace(/acess\?+rios/gi, 'Acessórios')
    .replace(/ntima/gi, 'Íntima')
    .replace(/\?+ntima/gi, 'Íntima')
    .replace(/papis/gi, 'Papéis')
    .replace(/pap\?+is/gi, 'Papéis')
    .replace(/mos/gi, 'Mãos')
    .replace(/m\?+os/gi, 'Mãos')
    .replace(/ps/gi, 'Pés')
    .replace(/p\?+s/gi, 'Pés')
    .replace(/Farmcia/gi, 'Farmácia')
    .replace(/Farm\?+cia/gi, 'Farmácia')
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

  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return { success: false, items: existingItems, receipts: existingReceipts, error: 'Nenhuma linha válida encontrada no CSV.', totalParsed: 0, newItemsCount: 0 };
  }

  // Determine delimiter (; or , or \t)
  const firstLine = lines[0];
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ';';
  if (tabCount > semiCount && tabCount > commaCount) delimiter = '\t';
  else if (commaCount > semiCount) delimiter = ',';

  // Helper to split line taking quotes into account
  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Check if first line is a header
  const headerCols = splitLine(firstLine).map(col => fixMojibake(col.toLowerCase().replace(/["'\r\n]/g, '')));
  const isHeader = headerCols.some(col => 
    col.includes('descri') || 
    col.includes('prod') || 
    col.includes('valor') || 
    col.includes('social') || 
    col.includes('data') ||
    col.includes('num')
  );

  const dataLines = isHeader ? lines.slice(1) : lines;

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
      const c = col.toLowerCase();
      if ((c.includes('num') || c === 'item' || c.startsWith('1.')) && !c.includes('nota') && idxNum === -1) {
        idxNum = idx;
      } else if ((c.includes('descri') || c.includes('produto / item')) && idxDesc === -1) {
        idxDesc = idx;
      } else if ((c.includes('unidade') || c.includes('unid') || c.includes('comercial') || c.includes('und')) && idxUnidade === -1) {
        idxUnidade = idx;
      } else if ((c.startsWith('qtd') || c.includes('quant')) && idxQtd === -1) {
        idxQtd = idx;
      } else if ((c.includes('valor') || c.includes('total') || c.includes('r$')) && !c.includes('r$/kg') && !c.includes('r$ / kg') && idxValor === -1) {
        idxValor = idx;
      } else if ((c.includes('raz') || c.includes('nome') || c.includes('estab') || c.includes('loja')) && idxRazao === -1) {
        idxRazao = idx;
      } else if ((c.includes('data') || c.includes('emiss')) && idxData === -1) {
        idxData = idx;
      } else if ((c.includes('r$/kg') || c.includes('r$ / kg') || c.includes('preco/kg') || c.includes('preço/kg') || c.includes('preco') || c.includes('preço')) && idxPrecoKg === -1) {
        idxPrecoKg = idx;
      } else if ((c.includes('peso') || c.includes('calculado')) && idxPesoKg === -1) {
        idxPesoKg = idx;
      } else if ((c.includes('cod') || c.includes('código')) && idxCodigo === -1) {
        idxCodigo = idx;
      } else if ((c.includes('ano-m') || c.includes('anomes') || c.includes('mes')) && idxAnoMes === -1) {
        idxAnoMes = idx;
      } else if ((c.includes('tipo') || c.includes('categoria')) && idxTipo === -1) {
        idxTipo = idx;
      } else if ((c.includes('produto') || c.includes('subtipo')) && !c.includes('descri') && idxProduto === -1) {
        idxProduto = idx;
      } else if (c.includes('detalhe') && idxDetalhe === -1) {
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

  dataLines.forEach((line, lineIndex) => {
    if (!line.trim()) return;
    const cols = splitLine(line).map(c => fixMojibake(c.replace(/^"|"$/g, '').trim()));
    if (cols.length < 2) return;

    const descricao = (idxDesc !== -1 ? cols[idxDesc] : cols[1]) || '';
    if (!descricao) return;

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

    const valorTotal = idxValor !== -1 ? parseBRLNumber(cols[idxValor]) : 0;
    const precoPorKg = idxPrecoKg !== -1 ? parseBRLNumber(cols[idxPrecoKg]) : undefined;
    const pesoKg = idxPesoKg !== -1 ? parseBRLNumber(cols[idxPesoKg]) : (unidade.toUpperCase() === 'KG' ? qtd : undefined);

    let tipo = (idxTipo !== -1 && cols[idxTipo]) ? cols[idxTipo].trim() : '';
    let produto = (idxProduto !== -1 && cols[idxProduto]) ? cols[idxProduto].trim() : '';
    let detalhe = (idxDetalhe !== -1 && cols[idxDetalhe]) ? cols[idxDetalhe].trim() : '';

    // Auto classify if missing
    if (!tipo || !produto) {
      const autoClass = classifyProduct(descricao);
      if (!tipo) tipo = autoClass.tipo;
      if (!produto) produto = autoClass.produto;
      if (!detalhe) detalhe = autoClass.detalhe;
    } else if (!detalhe) {
      const autoClass = classifyProduct(descricao);
      detalhe = autoClass.detalhe;
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

    // Parse exact item sequence number from CSV (e.g. 1..12)
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
    success: newlyAddedItems.length > 0 || (finalItems.length > 0 && dataLines.length === 0),
    items: finalItems,
    receipts: finalReceipts,
    totalParsed: dataLines.length,
    newItemsCount: newlyAddedItems.length
  };
}

function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
