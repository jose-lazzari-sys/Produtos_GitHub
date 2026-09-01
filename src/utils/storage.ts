import { NFCeItem, NFCeReceipt } from '../types';
import { classifyProduct } from './classifier';
import { extractPesoKg, calculatePrecoPorKg } from './weightUtils';
import { parseCsvData } from './csvImporter';

const STORAGE_KEY_ITEMS = 'nfce_items_v1';
const STORAGE_KEY_RECEIPTS = 'nfce_receipts_v1';

export function generateUniqueId(prefix = 'item'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.floor(Math.random() * 1000000)}`;
}

export function getStoredItems(): NFCeItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (!raw) return [];
    const items: NFCeItem[] = JSON.parse(raw);
    let hasChanged = false;
    const seenIds = new Set<string>();

    const sanitized = items.map((item, idx) => {
      let razao = item.razaoSocial;
      if (!razao || razao === 'Estabelecimento Sefaz SP' || razao === 'Estabelecimento Comercial') {
        razao = 'SENDAS DISTRIBUIDORA S/A';
        hasChanged = true;
      }
      let itemId = item.id;
      if (!itemId || typeof itemId !== 'string' || seenIds.has(itemId)) {
        itemId = generateUniqueId('item');
        hasChanged = true;
      }
      seenIds.add(itemId);

      let pesoKg = item.pesoKg;
      let precoPorKg = item.precoPorKg;

      if (item.tipo === 'Alimentação') {
        if (pesoKg === undefined || pesoKg === null) {
          pesoKg = extractPesoKg(item.descricao, item.qtd, item.unidade, item.tipo);
          hasChanged = true;
        }
        if ((precoPorKg === undefined || precoPorKg === null) && pesoKg && pesoKg > 0) {
          precoPorKg = calculatePrecoPorKg(item.valorTotal, pesoKg, item.qtd, item.tipo, item.unidade);
          hasChanged = true;
        }
      } else {
        if (pesoKg === undefined || pesoKg === null) pesoKg = 0;
        if (precoPorKg === undefined || precoPorKg === null) precoPorKg = 0;
      }

      // Preserve the exact item num manually set by the user or default to index+1
      const num = item.num !== undefined && item.num !== null && !isNaN(Number(item.num))
        ? Number(item.num)
        : idx + 1;

      return {
        ...item,
        id: itemId,
        num,
        pesoKg,
        precoPorKg,
        razaoSocial: razao,
        data: item.data || new Date().toLocaleString('pt-BR')
      };
    });

    if (hasChanged) {
      saveStoredItems(sanitized);
    }
    return sanitized;
  } catch (err) {
    console.error('Error loading items from localStorage:', err);
    return [];
  }
}

export function saveStoredItems(items: NFCeItem[]): void {
  try {
    const seenIds = new Set<string>();
    const uniqueItems = items.map((item) => {
      let itemId = item.id;
      if (!itemId || typeof itemId !== 'string' || seenIds.has(itemId)) {
        itemId = generateUniqueId('item');
      }
      seenIds.add(itemId);
      return { ...item, id: itemId };
    });
    localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(uniqueItems));
  } catch (err) {
    console.error('Error saving items to localStorage:', err);
  }
}

export function getStoredReceipts(): NFCeReceipt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECEIPTS);
    if (!raw) return [];
    const receipts: NFCeReceipt[] = JSON.parse(raw);
    let hasChanged = false;
    const seenReceiptIds = new Set<string>();
    const seenItemIds = new Set<string>();

    const sanitized = receipts.map((rcpt) => {
      let receiptRazao = rcpt.razaoSocial;
      if (!receiptRazao || receiptRazao === 'Estabelecimento Sefaz SP' || receiptRazao === 'Estabelecimento Comercial') {
        receiptRazao = 'SENDAS DISTRIBUIDORA S/A';
        hasChanged = true;
      }
      const receiptData = rcpt.data || new Date().toLocaleString('pt-BR');
      let rcptId = rcpt.id;
      if (!rcptId || typeof rcptId !== 'string' || seenReceiptIds.has(rcptId)) {
        rcptId = generateUniqueId('rcpt');
        hasChanged = true;
      }
      seenReceiptIds.add(rcptId);

      const conferidoStatus: 'Sim' | '-' = rcpt.conferido === 'Sim' ? 'Sim' : '-';
      const itemsSum = (rcpt.itens || []).reduce((acc, it) => acc + (it.valorTotal || 0), 0);
      const exactValorTotal = (rcpt.itens && rcpt.itens.length > 0) ? Number(itemsSum.toFixed(2)) : (rcpt.valorTotal || 0);

      const sanitizedReceipt: NFCeReceipt = {
        ...rcpt,
        id: rcptId,
        razaoSocial: receiptRazao,
        data: receiptData,
        valorTotal: exactValorTotal,
        conferido: conferidoStatus,
        itens: (rcpt.itens || []).map((item, idx) => {
          let itemRazao = item.razaoSocial;
          if (!itemRazao || itemRazao === 'Estabelecimento Sefaz SP' || itemRazao === 'Estabelecimento Comercial') {
            itemRazao = receiptRazao;
            hasChanged = true;
          }
          let itemId = item.id;
          if (!itemId || typeof itemId !== 'string' || seenItemIds.has(itemId)) {
            itemId = generateUniqueId('item');
            hasChanged = true;
          }
          seenItemIds.add(itemId);

          // Preserve the item's num exactly as saved by the user
          const num = item.num !== undefined && item.num !== null && !isNaN(Number(item.num))
            ? Number(item.num)
            : idx + 1;

          return {
            ...item,
            id: itemId,
            num,
            receiptId: item.receiptId || rcptId,
            razaoSocial: itemRazao,
            data: item.data || receiptData
          };
        })
      };

      return sanitizedReceipt;
    });

    if (hasChanged) {
      saveStoredReceipts(sanitized);
    }
    return sanitized;
  } catch (err) {
    console.error('Error loading receipts from localStorage:', err);
    return [];
  }
}

export function saveStoredReceipts(receipts: NFCeReceipt[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(receipts));
  } catch (err) {
    console.error('Error saving receipts to localStorage:', err);
  }
}

export function addReceiptAndItems(receipt: NFCeReceipt): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();

  let receiptRazao = receipt.razaoSocial && receipt.razaoSocial.trim() ? receipt.razaoSocial.trim() : 'SENDAS DISTRIBUIDORA S/A';
  if (receiptRazao === 'Estabelecimento Comercial' || receiptRazao === 'Estabelecimento Sefaz SP') {
    receiptRazao = 'SENDAS DISTRIBUIDORA S/A';
  }
  const receiptData = receipt.data && receipt.data.trim() ? receipt.data.trim() : new Date().toLocaleString('pt-BR');
  const receiptId = receipt.id || generateUniqueId('rcpt');

  const sanitizedItems = receipt.itens.map(item => {
    let itemRazao = item.razaoSocial && item.razaoSocial.trim() ? item.razaoSocial.trim() : receiptRazao;
    if (itemRazao === 'Estabelecimento Comercial' || itemRazao === 'Estabelecimento Sefaz SP') {
      itemRazao = receiptRazao;
    }
    const itemTipo = item.tipo || 'Outros';
    const itemPeso = item.pesoKg !== undefined && item.pesoKg !== null
      ? item.pesoKg
      : extractPesoKg(item.descricao, item.qtd, item.unidade, itemTipo);
    const itemPrecoKg = (item.precoPorKg !== undefined && item.precoPorKg !== null)
      ? item.precoPorKg
      : calculatePrecoPorKg(item.valorTotal, itemPeso, item.qtd, itemTipo, item.unidade);

    return {
      ...item,
      id: generateUniqueId('item'),
      receiptId,
      pesoKg: itemPeso,
      precoPorKg: itemPrecoKg,
      razaoSocial: itemRazao,
      data: item.data && item.data.trim() ? item.data.trim() : receiptData
    };
  });

  const sanitizedReceipt: NFCeReceipt = {
    ...receipt,
    id: receiptId,
    razaoSocial: receiptRazao,
    data: receiptData,
    itens: sanitizedItems
  };

  const updatedReceipts = [sanitizedReceipt, ...currentReceipts.filter(r => r.id !== receiptId)];
  const updatedItems = [...sanitizedItems, ...currentItems];

  saveStoredReceipts(updatedReceipts);
  saveStoredItems(updatedItems);

  return { items: updatedItems, receipts: updatedReceipts };
}

export function updateAllStoreNames(newStoreName: string): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  const finalName = newStoreName.trim() || 'SENDAS DISTRIBUIDORA S/A';
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();

  const updatedReceipts = currentReceipts.map(r => ({
    ...r,
    razaoSocial: finalName,
    itens: r.itens.map(it => ({ ...it, razaoSocial: finalName }))
  }));

  const updatedItems = currentItems.map(it => ({
    ...it,
    razaoSocial: finalName
  }));

  saveStoredReceipts(updatedReceipts);
  saveStoredItems(updatedItems);

  return { items: updatedItems, receipts: updatedReceipts };
}

export function addStoredItem(newItem: NFCeItem): NFCeItem[] {
  const currentItems = getStoredItems();
  const currentReceipts = getStoredReceipts();

  const itemWithId: NFCeItem = {
    ...newItem,
    id: newItem.id || generateUniqueId('item'),
    num: typeof newItem.num === 'number' && !isNaN(newItem.num) && newItem.num > 0
      ? newItem.num
      : currentItems.length + 1,
  };

  const updatedItems = [...currentItems, itemWithId];
  saveStoredItems(updatedItems);

  // If there is an existing receipt or create a general receipt to keep receipts in sync
  if (currentReceipts.length > 0) {
    const targetReceiptId = newItem.receiptId || currentReceipts[0].id;
    const updatedReceipts = currentReceipts.map(rcpt => {
      if (rcpt.id === targetReceiptId) {
        return {
          ...rcpt,
          valorTotal: (rcpt.valorTotal || 0) + (newItem.valorTotal || 0),
          itens: [...(rcpt.itens || []), itemWithId]
        };
      }
      return rcpt;
    });
    saveStoredReceipts(updatedReceipts);
  }

  return updatedItems;
}

export function updateStoredItem(updatedItem: NFCeItem): NFCeItem[] {
  const items = getStoredItems();
  const index = items.findIndex(i => 
    (updatedItem.id && i.id === updatedItem.id) || 
    (i.descricao === updatedItem.descricao && i.data === updatedItem.data && Math.abs((i.valorTotal || 0) - (updatedItem.valorTotal || 0)) < 0.01) ||
    (i.descricao === updatedItem.descricao && i.data === updatedItem.data)
  );

  const exactNum = updatedItem.num !== undefined && updatedItem.num !== null && !isNaN(Number(updatedItem.num))
    ? Number(updatedItem.num)
    : (index !== -1 ? items[index].num : 1);

  const finalItem: NFCeItem = {
    ...(index !== -1 ? items[index] : {}),
    ...updatedItem,
    num: exactNum,
  };

  if (index !== -1) {
    items[index] = finalItem;
  } else {
    items.push(finalItem);
  }
  saveStoredItems(items);

  // Also synchronize the update in receipts
  const currentReceipts = getStoredReceipts();
  let receiptsChanged = false;
  const updatedReceipts = currentReceipts.map(rcpt => {
    const itemIndexInRcpt = (rcpt.itens || []).findIndex(it =>
      (updatedItem.id && it.id === updatedItem.id) ||
      (it.descricao === updatedItem.descricao && (it.data === updatedItem.data || rcpt.data === updatedItem.data))
    );

    if (itemIndexInRcpt !== -1) {
      receiptsChanged = true;
      const updatedRcptItens = [...rcpt.itens];
      updatedRcptItens[itemIndexInRcpt] = {
        ...updatedRcptItens[itemIndexInRcpt],
        ...finalItem,
        num: exactNum,
      };
      return {
        ...rcpt,
        itens: updatedRcptItens,
        valorTotal: updatedRcptItens.reduce((acc, it) => acc + (it.valorTotal || 0), 0),
      };
    }
    return rcpt;
  });

  if (receiptsChanged) {
    saveStoredReceipts(updatedReceipts);
  }

  return items;
}

export function deleteStoredItem(itemIdOrItem: string | NFCeItem): NFCeItem[] {
  const currentItems = getStoredItems();
  const targetId = typeof itemIdOrItem === 'string' ? itemIdOrItem : itemIdOrItem?.id;
  const targetItem = typeof itemIdOrItem === 'object' ? itemIdOrItem : null;

  const targetDesc = (targetItem?.descricao || '').trim().toLowerCase();
  const targetVal = Number(targetItem?.valorTotal || 0);
  const targetNum = targetItem?.num != null ? String(targetItem.num).trim() : null;

  // Find index of item to remove
  let indexToRemove = currentItems.findIndex((it, idx) => {
    // 1. Strict ID match
    if (targetId && it.id && it.id === targetId) return true;
    if (targetItem?.id && it.id && it.id === targetItem.id) return true;

    // 2. Exact match on Item properties
    if (targetItem) {
      const sameDesc = (it.descricao || '').trim().toLowerCase() === targetDesc;
      const sameNum = targetNum ? String(it.num ?? idx + 1).trim() === targetNum : false;
      const diffVal = Math.abs(Number(it.valorTotal || 0) - targetVal);
      if (sameDesc && (sameNum || diffVal < 0.05)) return true;
    }
    return false;
  });

  // Fallback: match by description only
  if (indexToRemove === -1 && targetDesc) {
    indexToRemove = currentItems.findIndex(it => (it.descricao || '').trim().toLowerCase() === targetDesc);
  }

  // Fallback 2: match by ID even if targetId wasn't in object
  if (indexToRemove === -1 && targetId) {
    indexToRemove = currentItems.findIndex(it => it.id === targetId);
  }

  const updatedItems = [...currentItems];
  if (indexToRemove !== -1) {
    updatedItems.splice(indexToRemove, 1);
  }

  // Renumber remaining items sequentially
  const renumbered = updatedItems.map((item, idx) => ({
    ...item,
    num: idx + 1
  }));

  saveStoredItems(renumbered);

  // Also remove from stored receipts and recalculate receipt totals
  const currentReceipts = getStoredReceipts();
  const updatedReceipts = currentReceipts
    .map(rcpt => {
      let rcptItemRemoved = false;
      const remainingItens = (rcpt.itens || []).filter((it, idx) => {
        if (rcptItemRemoved) return true;
        if (targetId && it.id && it.id === targetId) {
          rcptItemRemoved = true;
          return false;
        }
        if (targetItem?.id && it.id && it.id === targetItem.id) {
          rcptItemRemoved = true;
          return false;
        }
        if (targetDesc && (it.descricao || '').trim().toLowerCase() === targetDesc) {
          if (targetNum && String(it.num ?? idx + 1).trim() === targetNum) {
            rcptItemRemoved = true;
            return false;
          }
          if (Math.abs(Number(it.valorTotal || 0) - targetVal) < 0.05) {
            rcptItemRemoved = true;
            return false;
          }
        }
        return true;
      });

      return {
        ...rcpt,
        itens: remainingItens.map((it, idx) => ({ ...it, num: idx + 1 })),
        valorTotal: remainingItens.reduce((acc, it) => acc + (it.valorTotal || 0), 0)
      };
    })
    .filter(rcpt => rcpt.itens.length > 0);

  saveStoredReceipts(updatedReceipts);
  return renumbered;
}

export function clearAllStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_ITEMS);
    localStorage.removeItem(STORAGE_KEY_RECEIPTS);
  } catch (err) {
    console.error('Error clearing localStorage:', err);
  }
}

/**
 * Creates rich demo sample items showing all categories in action
 */
export function generateSampleData(): { receipt: NFCeReceipt; items: NFCeItem[] } {
  const now = new Date();
  const formattedDate = `${now.toLocaleDateString('pt-BR')} 15:42:10`;
  const receiptId = generateUniqueId('rcpt_sample');
  const razaoSocial = 'SENDAS DISTRIBUIDORA S/A';

  const rawSampleList = [
    { desc: 'PICANHA BOVINA RESFRIADA KG', qtd: 1.25, val: 89.90 },
    { desc: 'FILE DE TILAPIA CONGELADO 500G', qtd: 1, val: 24.50 },
    { desc: 'LINGUICA TOSCANA SADIA 1KG', qtd: 1, val: 22.90 },
    { desc: 'REFRIGERANTE COCA COLA 2L', qtd: 2, val: 19.98 },
    { desc: 'CERVEJA HEINEKEN LATA 350ML', qtd: 6, val: 32.94 },
    { desc: 'SUCO DE LARANJA NATURAL ONE 1.5L', qtd: 1, val: 14.90 },
    { desc: 'LEITE INTEGRAL PIRACANJUBA 1L', qtd: 4, val: 19.96 },
    { desc: 'BANANA PRATA HORTIFRUTI KG', qtd: 1.1, val: 8.50 },
    { desc: 'TOMATE ITALIANO KG', qtd: 0.85, val: 7.90 },
    { desc: 'ALHO ROXO 200G', qtd: 1, val: 6.50 },
    { desc: 'BATATA INGLESA LAVADA KG', qtd: 1.5, val: 9.75 },
    { desc: 'QUEIJO MUSSARELA FATIADO 200G', qtd: 2, val: 18.00 },
    { desc: 'PRESUNTO COZIDO SADIA 200G', qtd: 1, val: 8.90 },
    { desc: 'REQUEIJAO CREMOSO POCOOS 200G', qtd: 1, val: 9.40 },
    { desc: 'ARROZ TIO JOAO TIPO 1 5KG', qtd: 1, val: 31.90 },
    { desc: 'FEIJAO CARIOCA CAMIL 1KG', qtd: 2, val: 15.80 },
    { desc: 'AZEITE DE OLIVA EXTRA VIRGEM 500ML', qtd: 1, val: 38.90 },
    { desc: 'PAO DE FORMA WICKBOLD 500G', qtd: 1, val: 9.80 },
    { desc: 'PAO DE QUEIJO CONGELADO FORNO DE MINAS', qtd: 1, val: 16.50 },
    { desc: 'BISCOITO RECHEADO OREO 90G', qtd: 2, val: 7.98 },
    { desc: 'CREME DENTAL COLGATE TOTAL 12 90G', qtd: 2, val: 15.80 },
    { desc: 'SHAMPOO ELSEVE REPARACAO TOTAL 400ML', qtd: 1, val: 21.90 },
    { desc: 'DESODORANTE REXONA MEN AEROSOL 150ML', qtd: 1, val: 14.90 },
    { desc: 'SABONETE DOVE ORIGINAL 90G', qtd: 4, val: 15.60 },
    { desc: 'PAPEL HIGIENICO NEVE FOLHA DUPLA 12UN', qtd: 1, val: 26.90 },
    { desc: 'SABONETE LIQUIDO PROTEX 250ML', qtd: 1, val: 11.50 },
    { desc: 'APARELHO DE BARBEAR GILLETTE MACH3', qtd: 1, val: 29.90 },
    { desc: 'PAPEL TOALHA SNACK FOLHA DUPLA 2RL', qtd: 1, val: 7.50 },
    { desc: 'ESPONJA DUPLA FACE YPE 3UN', qtd: 1, val: 5.90 },
    { desc: 'AGUA SANITARIA CANDIDA 2L', qtd: 1, val: 7.20 },
    { desc: 'DETERGENTE LIQUIDO YPE COCO 500ML', qtd: 3, val: 7.80 },
    { desc: 'INSETICIDA SBP AEROSOL MULTI 380ML', qtd: 1, val: 18.90 },
    { desc: 'SABAO EM PO OMO LAVAGEM PERFEITA 1.6KG', qtd: 1, val: 28.90 },
    { desc: 'AMACIANTE DOWNY CONCENTRADO 1L', qtd: 1, val: 22.90 }
  ];

  const items: NFCeItem[] = rawSampleList.map((item, index) => {
    const classification = classifyProduct(item.desc);
    const unidade = item.qtd % 1 === 0 ? 'UN' : 'KG';
    const pesoKg = extractPesoKg(item.desc, item.qtd, unidade, classification.tipo);
    const precoPorKg = calculatePrecoPorKg(item.val, pesoKg, item.qtd, classification.tipo, unidade);

    return {
      id: generateUniqueId('item_sample'),
      receiptId,
      num: index + 1,
      descricao: item.desc,
      qtd: item.qtd,
      unidade,
      pesoKg,
      precoPorKg,
      valorUnitario: Number((item.val / item.qtd).toFixed(2)),
      valorTotal: item.val,
      razaoSocial,
      data: formattedDate,
      tipo: classification.tipo,
      produto: classification.produto,
      detalhe: classification.detalhe
    };
  });

  const receipt: NFCeReceipt = {
    id: receiptId,
    razaoSocial,
    cnpj: '61.585.865/0001-51',
    data: formattedDate,
    numeroNota: '00049281',
    serie: '001',
    valorTotal: items.reduce((acc, it) => acc + it.valorTotal, 0),
    itens: items,
    scannedAt: new Date().toISOString()
  };

  return { receipt, items };
}

export interface BackupData {
  version: number;
  exportedAt: string;
  app: string;
  itemsCount: number;
  receiptsCount: number;
  items: NFCeItem[];
  receipts: NFCeReceipt[];
}

export function exportBackupData(): BackupData {
  const items = getStoredItems();
  const receipts = getStoredReceipts();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'NFC-e Sefaz SP & Classificador de Produtos',
    itemsCount: items.length,
    receiptsCount: receipts.length,
    items,
    receipts
  };
}

export function downloadBackupJSON(): void {
  try {
    const backup = exportBackupData();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_nfce_produtos_${dateStr}_${backup.itemsCount}_itens.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao exportar backup:', err);
    throw err;
  }
}

export function importBackupData(rawContent: string, mode: 'merge' | 'replace' = 'merge'): { success: boolean; items: NFCeItem[]; receipts: NFCeReceipt[]; error?: string; newItemsCount?: number } {
  if (!rawContent || !rawContent.trim()) {
    return { success: false, items: [], receipts: [], error: 'O arquivo selecionado está vazio.' };
  }

  const currentItems = mode === 'merge' ? getStoredItems() : [];
  const currentReceipts = mode === 'merge' ? getStoredReceipts() : [];

  // First check if it looks like CSV / TSV text (has semicolons, commas, or tabs with multiple lines)
  const trimmed = rawContent.trim();
  const isLikelyCsv = !trimmed.startsWith('{') && !trimmed.startsWith('[') && (trimmed.includes(';') || trimmed.includes(',') || trimmed.includes('\t'));

  if (isLikelyCsv) {
    const csvResult = parseCsvData(rawContent, currentItems, currentReceipts);
    if (csvResult.success && csvResult.items.length > 0) {
      saveStoredItems(csvResult.items);
      saveStoredReceipts(csvResult.receipts);
      const reloadedItems = getStoredItems();
      const reloadedReceipts = getStoredReceipts();
      return {
        success: true,
        items: reloadedItems,
        receipts: reloadedReceipts,
        newItemsCount: csvResult.newItemsCount
      };
    }
  }

  try {
    const parsed = JSON.parse(rawContent);

    // Support both format: direct { items, receipts } or wrapped in BackupData
    let itemsToImport: NFCeItem[] = [];
    let receiptsToImport: NFCeReceipt[] = [];

    if (Array.isArray(parsed)) {
      itemsToImport = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.items)) {
        itemsToImport = parsed.items;
      }
      if (Array.isArray(parsed.receipts)) {
        receiptsToImport = parsed.receipts;
      }
    }

    if (itemsToImport.length === 0 && receiptsToImport.length === 0) {
      // Try CSV fallback
      const csvResult = parseCsvData(rawContent, currentItems, currentReceipts);
      if (csvResult.success) {
        saveStoredItems(csvResult.items);
        saveStoredReceipts(csvResult.receipts);
        return {
          success: true,
          items: getStoredItems(),
          receipts: getStoredReceipts(),
          newItemsCount: csvResult.newItemsCount
        };
      }
      return { success: false, items: [], receipts: [], error: 'O arquivo selecionado não contém itens ou recibos válidos.' };
    }

    // If mode is merge, combine without duplicate IDs
    let finalItems = itemsToImport;
    let finalReceipts = receiptsToImport;

    if (mode === 'merge' && currentItems.length > 0) {
      const existingSignatures = new Set(
        currentItems.map(it => `${it.data}___${it.razaoSocial}___${it.descricao.trim().toLowerCase()}___${it.qtd}___${it.valorTotal}`)
      );
      const newItemsFiltered = itemsToImport.filter(
        it => !existingSignatures.has(`${it.data}___${it.razaoSocial}___${it.descricao.trim().toLowerCase()}___${it.qtd}___${it.valorTotal}`)
      );
      finalItems = [...currentItems, ...newItemsFiltered];

      const existingReceiptMap = new Map(currentReceipts.map(r => [`${r.data}___${r.razaoSocial}`, r]));
      receiptsToImport.forEach(rcpt => {
        const key = `${rcpt.data}___${rcpt.razaoSocial}`;
        if (!existingReceiptMap.has(key)) {
          existingReceiptMap.set(key, rcpt);
        }
      });
      finalReceipts = Array.from(existingReceiptMap.values());
    }

    // Save items and receipts
    saveStoredItems(finalItems);
    if (finalReceipts.length > 0) {
      saveStoredReceipts(finalReceipts);
    }

    const reloadedItems = getStoredItems();
    const reloadedReceipts = getStoredReceipts();

    return {
      success: true,
      items: reloadedItems,
      receipts: reloadedReceipts,
      newItemsCount: finalItems.length - currentItems.length
    };
  } catch (err: any) {
    // Try CSV parser as final fallback
    const csvResult = parseCsvData(rawContent, currentItems, currentReceipts);
    if (csvResult.success && csvResult.items.length > 0) {
      saveStoredItems(csvResult.items);
      saveStoredReceipts(csvResult.receipts);
      return {
        success: true,
        items: getStoredItems(),
        receipts: getStoredReceipts(),
        newItemsCount: csvResult.newItemsCount
      };
    }

    console.error('Erro ao importar backup:', err);
    return {
      success: false,
      items: [],
      receipts: [],
      error: err?.message || 'Arquivo inválido ou não reconhecido.'
    };
  }
}

/**
 * Updates the 'conferido' status of a receipt ('Sim' or '-')
 */
export function updateReceiptConferido(receiptId: string, conferido: 'Sim' | '-'): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();
  const confStatus: 'Sim' | '-' = conferido === 'Sim' ? 'Sim' : '-';

  const existingIndex = currentReceipts.findIndex(r => r.id === receiptId);
  let updatedReceipts: NFCeReceipt[];

  if (existingIndex >= 0) {
    updatedReceipts = currentReceipts.map(rcpt => {
      if (rcpt.id === receiptId) {
        return {
          ...rcpt,
          conferido: confStatus
        };
      }
      return rcpt;
    });
  } else {
    // If it was reconciled from items, find matching items and insert
    const matchingItems = currentItems.filter(it => it.receiptId === receiptId);
    const firstItem = matchingItems[0] || currentItems[0];
    const newRcpt: NFCeReceipt = {
      id: receiptId,
      razaoSocial: firstItem?.razaoSocial || 'SENDAS DISTRIBUIDORA S/A',
      data: firstItem?.data || new Date().toLocaleString('pt-BR'),
      valorTotal: matchingItems.reduce((acc, it) => acc + (it.valorTotal || 0), 0),
      itens: matchingItems,
      scannedAt: new Date().toISOString(),
      conferido: confStatus
    };
    updatedReceipts = [...currentReceipts, newRcpt];
  }

  saveStoredReceipts(updatedReceipts);
  return { items: currentItems, receipts: updatedReceipts };
}

/**
 * Deletes a receipt and all its associated items from storage
 */
export function deleteReceiptAndItsItems(receiptId: string): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();

  const targetReceipt = currentReceipts.find(r => r.id === receiptId);
  const updatedReceipts = currentReceipts.filter(r => r.id !== receiptId);

  // Filter out items belonging to this receipt
  const updatedItems = currentItems.filter(item => {
    if (item.receiptId && item.receiptId === receiptId) return false;
    if (targetReceipt && item.data === targetReceipt.data && item.razaoSocial === targetReceipt.razaoSocial) {
      return false;
    }
    return true;
  });

  // Renumber remaining items
  const renumberedItems = updatedItems.map((item, idx) => ({
    ...item,
    num: idx + 1
  }));

  saveStoredReceipts(updatedReceipts);
  saveStoredItems(renumberedItems);

  return { items: renumberedItems, receipts: updatedReceipts };
}

/**
 * Parses Brazilian date strings (DD/MM/YYYY HH:mm:ss), ISO strings, or standard dates
 * into a numerical timestamp for accurate chronological sorting.
 */
export function parseDateToTimestamp(dateStr?: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const trimmed = dateStr.trim();
  if (!trimmed) return 0;

  // Format DD/MM/YYYY or DD/MM/YYYY HH:mm:ss or DD/MM/YYYY, HH:mm:ss
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const hours = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
    const minutes = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const seconds = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
    const dt = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  // Format YYYY-MM-DD or ISO string
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ ,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    const minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const seconds = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    const dt = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  const parsed = Date.parse(trimmed);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Reconciles stored receipts with items, ensuring that if items exist,
 * corresponding notes/receipts are structured with accurate totals and item counts.
 */
export function reconcileReceiptsWithItems(receipts: NFCeReceipt[], items: NFCeItem[]): NFCeReceipt[] {
  if (items.length === 0) return [];

  // Map existing receipts by ID
  const receiptMap = new Map<string, NFCeReceipt>();
  receipts.forEach(rcpt => {
    receiptMap.set(rcpt.id, {
      ...rcpt,
      conferido: rcpt.conferido === 'Sim' ? 'Sim' : '-',
      itens: [] // will populate strictly from active items
    });
  });

  // Group items by receiptId or (data + razaoSocial)
  const orphanGroups = new Map<string, NFCeItem[]>();

  items.forEach(item => {
    if (item.receiptId && receiptMap.has(item.receiptId)) {
      const rcpt = receiptMap.get(item.receiptId)!;
      rcpt.itens.push(item);
    } else {
      const groupKey = item.receiptId || `${item.data || 'Sem Data'}___${item.razaoSocial || 'Estabelecimento'}`;
      if (!orphanGroups.has(groupKey)) {
        orphanGroups.set(groupKey, []);
      }
      orphanGroups.get(groupKey)!.push(item);
    }
  });

  // Add orphan groups as receipts if not present
  orphanGroups.forEach((groupItems, groupKey) => {
    const firstItem = groupItems[0];
    const totalVal = groupItems.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
    const existing = receipts.find(r => r.id === groupKey || (r.data === firstItem.data && r.razaoSocial === firstItem.razaoSocial));

    const newRcpt: NFCeReceipt = {
      id: existing?.id || (firstItem.receiptId || generateUniqueId('rcpt')),
      razaoSocial: firstItem.razaoSocial || 'SENDAS DISTRIBUIDORA S/A',
      data: firstItem.data || new Date().toLocaleString('pt-BR'),
      valorTotal: totalVal,
      itens: groupItems,
      scannedAt: existing?.scannedAt || new Date().toISOString(),
      conferido: existing?.conferido === 'Sim' ? 'Sim' : '-'
    };
    receiptMap.set(newRcpt.id, newRcpt);
  });

  // Filter out any receipts that have 0 active items, and compute the EXACT total from active items
  const finalReceipts = Array.from(receiptMap.values())
    .filter(rcpt => rcpt.itens && rcpt.itens.length > 0)
    .map(rcpt => {
      const computedTotal = rcpt.itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
      return {
        ...rcpt,
        valorTotal: Math.round(computedTotal * 100) / 100
      };
    })
    .sort((a, b) => {
      // Sort newest first chronologically by invoice date
      const timeA = parseDateToTimestamp(a.data) || parseDateToTimestamp(a.scannedAt);
      const timeB = parseDateToTimestamp(b.data) || parseDateToTimestamp(b.scannedAt);
      return timeB - timeA;
    });

  return finalReceipts;
}
