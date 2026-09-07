import { NFCeItem, NFCeReceipt } from '../types';
import { classifyProduct, getItemTipo, normalizeTipo, normalizeProduto, learnItemClassification, getDetalheForTipoProduto, CATEGORY_RULES } from './classifier';
import { extractPesoKg, calculatePrecoPorKg } from './weightUtils';
import { parseCsvData, parseMatrixData } from './csvImporter';

const STORAGE_KEY_ITEMS = 'nfce_items_v1';
const STORAGE_KEY_RECEIPTS = 'nfce_receipts_v1';

export function generateUniqueId(prefix = 'item'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Ensures that for every NF / Receipt, its items are strictly numbered 1..N (1, 2, 3 ... N),
 * in full accordance with the official SEFAZ invoice standard.
 */
export function normalizeItemsNumbering(items: NFCeItem[]): NFCeItem[] {
  if (!items || items.length === 0) return [];

  // Group items by receipt ID or grouping key (data + razaoSocial)
  const groupMap = new Map<string, NFCeItem[]>();
  const groupOrder: string[] = [];

  items.forEach((it) => {
    const key = it.receiptId || `${it.data || ''}___${it.razaoSocial || ''}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      groupOrder.push(key);
    }
    groupMap.get(key)!.push(it);
  });

  const normalizedItems: NFCeItem[] = [];

  groupOrder.forEach((key) => {
    const group = groupMap.get(key)!;
    // If items in the group have a positive num, keep them ordered by that sequence
    group.sort((a, b) => {
      const numA = (typeof a.num === 'number' && !isNaN(a.num) && a.num > 0) ? a.num : 999999;
      const numB = (typeof b.num === 'number' && !isNaN(b.num) && b.num > 0) ? b.num : 999999;
      return numA - numB;
    });

    // Renumber strictly 1..N for this NF
    group.forEach((item, index) => {
      normalizedItems.push({
        ...item,
        num: index + 1
      });
    });
  });

  return normalizedItems;
}

export function getStoredItems(): NFCeItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (!raw) return [];
    const items: NFCeItem[] = JSON.parse(raw);
    let hasChanged = false;
    const seenIds = new Set<string>();

    const sanitized = items.map((item) => {
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

      let tipo = normalizeTipo(item.tipo);
      let produto = normalizeProduto(item.produto, tipo);
      let detalhe = item.detalhe?.trim() || 'Outros';

      // If tipo or produto ended up as Outros, try historical memory fallback
      if (tipo === 'Outros' || produto === 'Outros') {
        const autoClass = classifyProduct(item.descricao);
        if (autoClass.tipo !== 'Outros') {
          if (tipo === 'Outros') tipo = autoClass.tipo as any;
          if (produto === 'Outros') produto = autoClass.produto;
          if (!detalhe || detalhe === 'Outros') detalhe = autoClass.detalhe;
          hasChanged = true;
        }
      }

      if (!detalhe || detalhe === 'Outros') {
        const fixedDetalhe = getDetalheForTipoProduto(tipo, produto);
        if (fixedDetalhe && fixedDetalhe !== 'Outros') {
          detalhe = fixedDetalhe;
          hasChanged = true;
        }
      }

      if (item.tipo !== tipo) {
        hasChanged = true;
      }
      if (item.produto !== produto) {
        hasChanged = true;
      }

      let pesoKg = item.pesoKg;
      let precoPorKg = item.precoPorKg;

      if (tipo === 'Alimentação') {
        if (pesoKg === undefined || pesoKg === null || pesoKg === 0) {
          const calculatedPeso = extractPesoKg(item.descricao, item.qtd, item.unidade, tipo);
          if (calculatedPeso && calculatedPeso > 0) {
            pesoKg = calculatedPeso;
            hasChanged = true;
          }
        }
        if ((precoPorKg === undefined || precoPorKg === null || precoPorKg === 0) && pesoKg && pesoKg > 0) {
          precoPorKg = calculatePrecoPorKg(item.valorTotal, pesoKg, item.qtd, tipo, item.unidade);
          hasChanged = true;
        }
      } else {
        if (pesoKg === undefined || pesoKg === null) pesoKg = 0;
        if (precoPorKg === undefined || precoPorKg === null) precoPorKg = 0;
      }

      return {
        ...item,
        id: itemId,
        tipo,
        produto,
        detalhe,
        pesoKg,
        precoPorKg,
        razaoSocial: razao,
        data: item.data || new Date().toLocaleString('pt-BR')
      };
    });

    const normalized = normalizeItemsNumbering(sanitized);

    if (normalized.some((it, i) => it.num !== items[i]?.num)) {
      hasChanged = true;
    }

    if (hasChanged) {
      saveStoredItems(normalized);
    }
    return normalized;
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

      // Auto-train intelligent historical memory for valid classifications
      if (item.descricao && item.tipo && item.tipo !== 'Outros') {
        learnItemClassification(item.descricao, item.tipo, item.produto || 'Outros', item.detalhe);
      }

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
        conferidoUpdatedAt: rcpt.conferidoUpdatedAt,
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

          // Number strictly 1..N within this receipt
          const num = idx + 1;
          if (item.num !== num) {
            hasChanged = true;
          }

          let tipo = normalizeTipo(item.tipo);
          let produto = normalizeProduto(item.produto, tipo);
          let detalhe = item.detalhe?.trim() || 'Outros';

          // Check if item.tipo originally contained a subcategory
          if (produto === 'Outros') {
            const tryProd = normalizeProduto(item.tipo, tipo);
            if (tryProd !== 'Outros') {
              produto = tryProd;
              hasChanged = true;
            }
          }

          if (tipo === 'Outros' || produto === 'Outros') {
            const autoClass = classifyProduct(item.descricao);
            if (autoClass.tipo !== 'Outros') {
              if (tipo === 'Outros') tipo = autoClass.tipo as any;
              if (produto === 'Outros') produto = autoClass.produto;
              if (!detalhe || detalhe === 'Outros') detalhe = autoClass.detalhe;
              hasChanged = true;
            }
          }

          if (!detalhe || detalhe === 'Outros') {
            const autoClass = classifyProduct(item.descricao);
            if (autoClass.detalhe && autoClass.detalhe !== 'Outros') {
              detalhe = autoClass.detalhe;
              hasChanged = true;
            }
          }

          if (item.tipo !== tipo) {
            hasChanged = true;
          }
          if (item.produto !== produto) {
            hasChanged = true;
          }

          return {
            ...item,
            id: itemId,
            num,
            tipo,
            produto,
            detalhe,
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

  const sanitizedItems = receipt.itens.map((item, idx) => {
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
      num: idx + 1,
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
  const updatedItems = normalizeItemsNumbering([...sanitizedItems, ...currentItems]);

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
  
  // Robust matching to find the exact item being edited
  const targetId = updatedItem.id ? String(updatedItem.id).trim() : '';
  const targetReceiptId = updatedItem.receiptId ? String(updatedItem.receiptId).trim() : '';
  const targetNum = updatedItem.num !== undefined && updatedItem.num !== null ? Number(updatedItem.num) : null;
  const targetDesc = (updatedItem.descricao || '').trim().toLowerCase();
  const targetVal = Number(updatedItem.valorTotal || 0);

  let index = -1;

  // 1. Match by exact ID
  if (targetId) {
    index = items.findIndex(i => i.id && String(i.id).trim() === targetId);
  }

  // 2. Match by Receipt ID + Item Num
  if (index === -1 && targetReceiptId && targetNum !== null) {
    index = items.findIndex(i => 
      i.receiptId && String(i.receiptId).trim() === targetReceiptId && Number(i.num) === targetNum
    );
  }

  // 3. Match by Description + Data + Value
  if (index === -1 && targetDesc) {
    index = items.findIndex(i => 
      (i.descricao || '').trim().toLowerCase() === targetDesc &&
      i.data === updatedItem.data &&
      Math.abs((Number(i.valorTotal) || 0) - targetVal) < 0.05
    );
  }

  // 4. Match by Description + Data
  if (index === -1 && targetDesc) {
    index = items.findIndex(i => 
      (i.descricao || '').trim().toLowerCase() === targetDesc &&
      i.data === updatedItem.data
    );
  }

  const exactNum = targetNum !== null && !isNaN(targetNum)
    ? targetNum
    : (index !== -1 ? items[index].num : 1);

  const finalItem: NFCeItem = {
    ...(index !== -1 ? items[index] : {}),
    ...updatedItem,
    id: (index !== -1 && items[index].id) ? items[index].id : (updatedItem.id || generateUniqueId('item')),
    num: exactNum,
    tipo: getItemTipo(updatedItem.tipo),
    produto: (updatedItem.produto || 'Outros').trim(),
    detalhe: (updatedItem.detalhe || 'Outros').trim(),
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
      (finalItem.id && it.id === finalItem.id) ||
      (targetReceiptId && rcpt.id === targetReceiptId && Number(it.num) === exactNum) ||
      ((it.descricao || '').trim().toLowerCase() === targetDesc && (it.data === updatedItem.data || rcpt.data === updatedItem.data))
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

  // Renumber remaining items strictly per-NF (1..N within each receipt)
  const normalized = normalizeItemsNumbering(updatedItems);
  saveStoredItems(normalized);

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
  return normalized;
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

export function importBackupMatrix(
  rows: (string | number | null | undefined)[][],
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; items: NFCeItem[]; receipts: NFCeReceipt[]; error?: string; newItemsCount?: number } {
  if (!rows || rows.length === 0) {
    return { success: false, items: [], receipts: [], error: 'A planilha selecionada está vazia.' };
  }

  const currentItems = mode === 'merge' ? getStoredItems() : [];
  const currentReceipts = mode === 'merge' ? getStoredReceipts() : [];

  const matrixResult = parseMatrixData(rows, currentItems, currentReceipts);
  if (matrixResult.success && matrixResult.items.length > 0) {
    saveStoredItems(matrixResult.items);
    saveStoredReceipts(matrixResult.receipts);
    return {
      success: true,
      items: getStoredItems(),
      receipts: getStoredReceipts(),
      newItemsCount: matrixResult.newItemsCount
    };
  }

  return {
    success: false,
    items: currentItems,
    receipts: currentReceipts,
    error: matrixResult.error || 'Erro ao processar a planilha Excel.'
  };
}

/**
 * Updates the 'conferido' status of a receipt ('Sim' or '-')
 */
export function updateReceiptConferido(receiptId: string, conferido: 'Sim' | '-'): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();
  const confStatus: 'Sim' | '-' = conferido === 'Sim' ? 'Sim' : '-';
  const now = Date.now();

  // 1. Reconcile current receipts with items to ensure all active notes exist with valid IDs
  const reconciled = reconcileReceiptsWithItems(currentReceipts, currentItems);
  let targetReceipt = reconciled.find(r => r.id === receiptId);
  if (!targetReceipt) {
    targetReceipt = currentReceipts.find(r => r.id === receiptId);
  }

  // 2. Update target in reconciled receipts list
  const updatedReceipts = reconciled.map(rcpt => {
    const isTarget = rcpt.id === receiptId || 
      (targetReceipt && rcpt.data === targetReceipt.data && rcpt.razaoSocial === targetReceipt.razaoSocial);
    if (isTarget) {
      return {
        ...rcpt,
        conferido: confStatus,
        conferidoUpdatedAt: now
      };
    }
    return rcpt;
  });

  // 3. Ensure all items belonging to this receipt have receiptId set to prevent becoming orphaned
  const targetId = targetReceipt?.id || receiptId;
  const updatedItems = currentItems.map(item => {
    const belongsToReceipt = item.receiptId === receiptId ||
      item.receiptId === targetId ||
      (targetReceipt && item.data === targetReceipt.data && item.razaoSocial === targetReceipt.razaoSocial);
    if (belongsToReceipt && item.receiptId !== targetId) {
      return {
        ...item,
        receiptId: targetId
      };
    }
    return item;
  });

  saveStoredReceipts(updatedReceipts);
  saveStoredItems(updatedItems);
  return { items: updatedItems, receipts: updatedReceipts };
}

/**
 * Updates all receipts (or a specific list of receipt IDs) to 'Sim' or '-'
 */
export function bulkUpdateReceiptsConferido(conferido: 'Sim' | '-', receiptIds?: string[]): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();
  const confStatus: 'Sim' | '-' = conferido === 'Sim' ? 'Sim' : '-';
  const now = Date.now();

  // Make sure all receipts currently represented are tracked
  const reconciled = reconcileReceiptsWithItems(currentReceipts, currentItems);
  const targetIdSet = receiptIds ? new Set(receiptIds) : null;

  const updatedReceipts = reconciled.map(rcpt => {
    if (!targetIdSet || targetIdSet.has(rcpt.id)) {
      return {
        ...rcpt,
        conferido: confStatus,
        conferidoUpdatedAt: now
      };
    }
    return rcpt;
  });

  // Stamp receiptId onto all items so they never get separated
  const receiptIdByGroup = new Map<string, string>();
  reconciled.forEach(r => {
    receiptIdByGroup.set(`${r.data}___${r.razaoSocial}`, r.id);
  });

  const updatedItems = currentItems.map(item => {
    const key = `${item.data}___${item.razaoSocial}`;
    const assignedId = receiptIdByGroup.get(key);
    if (assignedId && (!item.receiptId || item.receiptId !== assignedId)) {
      return { ...item, receiptId: assignedId };
    }
    return item;
  });

  saveStoredReceipts(updatedReceipts);
  saveStoredItems(updatedItems);
  return { items: updatedItems, receipts: updatedReceipts };
}

/**
 * Deletes a receipt and all its associated items from storage
 */
export function deleteReceiptAndItsItems(receiptId: string): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  return deleteMultipleReceiptsAndTheirItems([receiptId]);
}

/**
 * Deletes multiple receipts and all their associated items from storage in bulk
 */
export function deleteMultipleReceiptsAndTheirItems(receiptIds: string[]): { items: NFCeItem[]; receipts: NFCeReceipt[] } {
  if (!receiptIds || receiptIds.length === 0) {
    return { items: getStoredItems(), receipts: getStoredReceipts() };
  }

  const targetIdSet = new Set(receiptIds);
  const currentReceipts = getStoredReceipts();
  const currentItems = getStoredItems();

  const targetReceipts = currentReceipts.filter(r => targetIdSet.has(r.id));
  const targetDateStoreKeys = new Set(targetReceipts.map(r => `${r.data}___${r.razaoSocial}`));

  const updatedReceipts = currentReceipts.filter(r => !targetIdSet.has(r.id));

  // Filter out items belonging to these receipts
  const updatedItems = currentItems.filter(item => {
    if (item.receiptId && targetIdSet.has(item.receiptId)) return false;
    if (targetDateStoreKeys.has(`${item.data}___${item.razaoSocial}`)) {
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
 * Extracts standard YYYY-MM year-month string from a date string or timestamp.
 * Returns e.g. "2025-01" or "Sem Data".
 */
export function extractYearMonthFromDate(dateStr?: string, fallbackStr?: string): string {
  const targetStr = dateStr?.trim() || fallbackStr?.trim() || '';
  if (!targetStr) return 'Sem Data';

  // Fast regex matching for BR format (DD/MM/YYYY)
  const matchBR = targetStr.match(/\d{1,2}\/(\d{1,2})\/(\d{4})/);
  if (matchBR) {
    return `${matchBR[2]}-${matchBR[1].padStart(2, '0')}`;
  }

  // Fast regex matching for ISO format (YYYY-MM-DD)
  const matchISO = targetStr.match(/^(\d{4})-(\d{1,2})/);
  if (matchISO) {
    return `${matchISO[1]}-${matchISO[2].padStart(2, '0')}`;
  }

  const ts = parseDateToTimestamp(targetStr);
  if (ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  return 'Sem Data';
}

/**
 * Reconciles stored receipts with items, ensuring that if items exist,
 * corresponding notes/receipts are structured with accurate totals and item counts.
 */
export function reconcileReceiptsWithItems(receipts: NFCeReceipt[], items: NFCeItem[]): NFCeReceipt[] {
  if (items.length === 0) return [];

  // Map existing receipts by ID and by composite key (data + razaoSocial)
  const receiptMap = new Map<string, NFCeReceipt>();
  const receiptByKey = new Map<string, NFCeReceipt>();

  receipts.forEach(rcpt => {
    const sanitized: NFCeReceipt = {
      ...rcpt,
      conferido: rcpt.conferido === 'Sim' ? 'Sim' : '-',
      itens: [] // will populate strictly from active items
    };
    receiptMap.set(rcpt.id, sanitized);
    if (rcpt.data && rcpt.razaoSocial) {
      receiptByKey.set(`${rcpt.data}___${rcpt.razaoSocial}`, sanitized);
    }
  });

  // Group items by receiptId or (data + razaoSocial)
  const orphanGroups = new Map<string, NFCeItem[]>();

  items.forEach(item => {
    if (item.receiptId && receiptMap.has(item.receiptId)) {
      const rcpt = receiptMap.get(item.receiptId)!;
      rcpt.itens.push(item);
    } else {
      const groupKey = `${item.data || 'Sem Data'}___${item.razaoSocial || 'Estabelecimento'}`;
      if (receiptByKey.has(groupKey)) {
        const rcpt = receiptByKey.get(groupKey)!;
        rcpt.itens.push(item);
      } else {
        if (!orphanGroups.has(groupKey)) {
          orphanGroups.set(groupKey, []);
        }
        orphanGroups.get(groupKey)!.push(item);
      }
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
      conferido: existing?.conferido === 'Sim' ? 'Sim' : '-',
      conferidoUpdatedAt: existing?.conferidoUpdatedAt
    };
    receiptMap.set(newRcpt.id, newRcpt);
  });

  // Filter out any receipts that have 0 active items, and compute the EXACT total from active items with strict 1..N numbering
  const finalReceipts = Array.from(receiptMap.values())
    .filter(rcpt => rcpt.itens && rcpt.itens.length > 0)
    .map(rcpt => {
      const sortedItens = [...rcpt.itens].sort((a, b) => {
        const numA = (typeof a.num === 'number' && !isNaN(a.num) && a.num > 0) ? a.num : 999999;
        const numB = (typeof b.num === 'number' && !isNaN(b.num) && b.num > 0) ? b.num : 999999;
        return numA - numB;
      });
      const renumberedItens = sortedItens.map((it, idx) => ({ ...it, num: idx + 1 }));
      const computedTotal = renumberedItens.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
      return {
        ...rcpt,
        itens: renumberedItens,
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
